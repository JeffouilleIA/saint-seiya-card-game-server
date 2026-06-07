/**
 * Persistance et validation des decks — localStorage ou serveur partagé (/api/decks)
 */

import {
  CARD_DATABASE,
  DEFAULT_DECK_LIST,
  comparePoolCards,
  getCardDef,
  getKnightRewardCards,
  isDeckBuilderPoolCard,
  isEnergie,
  isTestOnlyCard,
} from './cards.js';
import { RULES } from './rules.js';
import { getHouseDeckById } from './twelve-houses.js';

export const STORAGE_KEY = 'chevalier-decks';
export const DEFAULT_DECK_ID = '__default__';
export const MAX_COPIES_PER_CARD = 4;
export const TARGET_DECK_SIZE = RULES.deckSize ?? 60;
/** Energy cards: no per-id cap in deck builder (bounded by deck size). */
export const MAX_COPIES_ENERGY = TARGET_DECK_SIZE;

export function isDeckEnergyCard(cardId) {
  return isEnergie(cardId);
}

export function maxCopiesForCard(cardId) {
  return isDeckEnergyCard(cardId) ? MAX_COPIES_ENERGY : MAX_COPIES_PER_CARD;
}

function capEntryCount(cardId, count) {
  const n = Math.max(0, Number(count) || 0);
  return Math.min(maxCopiesForCard(cardId), n);
}

/** @typedef {{ id: string, count: number }} DeckCardEntry */
/** @typedef {{ id: string, name: string, cards: DeckCardEntry[], builtIn?: boolean }} SavedDeck */

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function listToCounts(cardIds) {
  const map = new Map();
  for (const id of cardIds) {
    map.set(id, (map.get(id) || 0) + 1);
  }
  return [...map.entries()].map(([id, count]) => ({ id, count }));
}

export function expandDeckEntries(cards) {
  const list = [];
  for (const entry of cards || []) {
    const n = capEntryCount(entry.id, entry.count);
    for (let i = 0; i < n; i++) list.push(entry.id);
  }
  return list;
}

export function getDefaultDeckEntry() {
  return {
    id: DEFAULT_DECK_ID,
    name: 'Deck par défaut',
    cards: listToCounts(DEFAULT_DECK_LIST),
    builtIn: true,
  };
}

function normalizeSavedDecks(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards))
    .map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cards
        .filter((c) => c && typeof c.id === 'string')
        .map((c) => ({ id: c.id, count: capEntryCount(c.id, c.count) }))
        .filter((c) => c.count > 0),
    }));
}

/** @type {SavedDeck[]} */
let serverDecksCache = [];
let sharedServerMode = false;
/** @type {Promise<void>} */
let persistQueue = Promise.resolve();

export function isSharedDeckStorage() {
  return sharedServerMode;
}

export function usesServerDeckStorage() {
  return sharedServerMode || serverDecksCache.length > 0;
}

export async function initDeckStorage() {
  try {
    const res = await fetch('/api/decks', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.shared && Array.isArray(data.decks)) {
        sharedServerMode = true;
        serverDecksCache = normalizeSavedDecks(data.decks);
        return;
      }
    }
  } catch {
    /* pas d'API réseau */
  }
  try {
    const res = await fetch('./data/saved-decks.json', { cache: 'no-store' });
    if (res.ok) {
      const decks = await res.json();
      if (Array.isArray(decks) && decks.length > 0) {
        serverDecksCache = normalizeSavedDecks(decks);
      }
    }
  } catch {
    /* fichier projet absent */
  }
}

export async function refreshDeckStorage() {
  if (sharedServerMode) {
    try {
      const res = await fetch('/api/decks', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.decks)) {
          serverDecksCache = normalizeSavedDecks(data.decks);
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (serverDecksCache.length > 0) {
    try {
      const res = await fetch('./data/saved-decks.json', { cache: 'no-store' });
      if (res.ok) {
        const decks = await res.json();
        if (Array.isArray(decks)) {
          serverDecksCache = normalizeSavedDecks(decks);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

function persistDecksToServer(decks) {
  if (!sharedServerMode) return;
  persistQueue = persistQueue
    .then(async () => {
      const res = await fetch('/api/decks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decks }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
    .catch((err) => {
      console.warn('Synchronisation des decks échouée:', err);
    });
}

export function loadSavedDecks() {
  if (sharedServerMode || serverDecksCache.length > 0) {
    return serverDecksCache.map((d) => ({
      ...d,
      cards: d.cards.map((c) => ({ ...c })),
    }));
  }
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const parsed = raw ? safeParse(raw) : null;
  return normalizeSavedDecks(parsed);
}

export function saveSavedDecks(decks) {
  const custom = decks.filter((d) => !d.builtIn && d.id !== DEFAULT_DECK_ID);
  if (sharedServerMode) {
    serverDecksCache = custom.map((d) => ({
      ...d,
      cards: d.cards.map((c) => ({ ...c })),
    }));
    persistDecksToServer(serverDecksCache);
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }
}

/** Fusionne localStorage + fichier projet → data/saved-decks.json (API requise). */
export async function publishLocalDecksToProject() {
  let fromServer = [];
  try {
    const res = await fetch('/api/decks', { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'API decks indisponible. Lancez le serveur Node.' };
    const data = await res.json();
    fromServer = normalizeSavedDecks(data.decks || []);
  } catch {
    return { ok: false, error: 'API decks indisponible. Lancez le serveur Node.' };
  }

  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const fromLocal = normalizeSavedDecks(raw ? safeParse(raw) : null);
  const byId = new Map();
  for (const d of fromServer) byId.set(d.id, d);
  for (const d of fromLocal) byId.set(d.id, d);
  const merged = [...byId.values()];

  if (!merged.length) {
    return { ok: false, error: 'Aucun deck à publier (navigateur ou projet vide).' };
  }

  try {
    const put = await fetch('/api/decks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decks: merged }),
    });
    if (!put.ok) return { ok: false, error: `Échec enregistrement (HTTP ${put.status}).` };
    sharedServerMode = true;
    serverDecksCache = merged;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    return { ok: true, count: merged.length };
  } catch {
    return { ok: false, error: 'Échec enregistrement réseau.' };
  }
}

export function saveDeck(deck) {
  const cards = (deck.cards || []).map((c) => ({
    id: c.id,
    count: capEntryCount(c.id, c.count),
  }));
  const validation = validateDeck(cards);
  if (!validation.valid) {
    return { error: validation.errors, validation };
  }

  const decks = loadSavedDecks();
  const idx = decks.findIndex((d) => d.id === deck.id);
  const entry = {
    id: deck.id || `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (deck.name || 'Sans nom').trim() || 'Sans nom',
    cards,
  };
  if (idx >= 0) decks[idx] = entry;
  else decks.push(entry);
  saveSavedDecks(decks);
  return entry;
}

export function deleteDeck(id) {
  const decks = loadSavedDecks().filter((d) => d.id !== id);
  saveSavedDecks(decks);
}

export function getDeckById(id) {
  if (!id || id === DEFAULT_DECK_ID) return null;
  const house = getHouseDeckById(id);
  if (house) return house;
  return loadSavedDecks().find((d) => d.id === id) || null;
}

/** Decks disponibles pour le joueur (serveur partagé ou localStorage). */
export function getAllDeckOptions() {
  return loadSavedDecks();
}

export function deckEntryToCardList(deck) {
  if (!deck) return [];
  return expandDeckEntries(deck.cards);
}

export function countDeckCards(cards) {
  return (cards || []).reduce((sum, c) => sum + (Number(c.count) || 0), 0);
}

export function validateDeck(cards) {
  const errors = [];
  const warnings = [];
  const total = countDeckCards(cards);

  for (const entry of cards || []) {
    if (!getCardDef(entry.id)) {
      errors.push(`Carte inconnue : ${entry.id}`);
      continue;
    }
    const max = maxCopiesForCard(entry.id);
    if ((entry.count || 0) > max) {
      const label = getCardDef(entry.id)?.name || entry.id;
      if (isDeckEnergyCard(entry.id)) {
        errors.push(`Trop d'exemplaires d'énergie : ${label} (max ${max}).`);
      } else {
        errors.push(`Max ${MAX_COPIES_PER_CARD} exemplaires : ${label}`);
      }
    }
    if ((entry.count || 0) < 1) {
      errors.push(`Quantité invalide pour ${entry.id}`);
    }
  }

  if (total === 0) errors.push('Le deck est vide.');
  if (total !== TARGET_DECK_SIZE) {
    warnings.push(
      total < TARGET_DECK_SIZE
        ? `${total}/${TARGET_DECK_SIZE} cartes — deck incomplet.`
        : `${total}/${TARGET_DECK_SIZE} cartes — deck trop grand.`,
    );
  }

  const chevaliers = (cards || []).filter((c) => getCardDef(c.id)?.cardType === 'chevalier').reduce((s, c) => s + c.count, 0);
  if (chevaliers === 0) warnings.push('Aucun chevalier dans le deck.');

  const needsSangAthena = (cards || []).some((c) => {
    const def = getCardDef(c.id);
    return c.count > 0 && (def?.stage === 'chevalier-divin' || def?.evolutionRequiresTool);
  });
  const hasSangAthena = (cards || []).some(
    (c) => c.id === 'tool_sang_athena' && c.count > 0,
  );
  if (needsSangAthena && !hasSangAthena) {
    warnings.push('Armure divine : ajoutez Sang d\'Athéna (outil) pour pouvoir évoluer en jeu.');
  }

  const rewardTiers = new Set();
  for (const entry of cards || []) {
    const def = getCardDef(entry.id);
    if (def?.cardType !== 'chevalier') continue;
    const rc = getKnightRewardCards(def);
    if (rc != null && rc >= 1) rewardTiers.add(rc);
  }
  if (rewardTiers.size > 1) {
    warnings.push(
      `Mélange de valeurs Récompense au KO (${[...rewardTiers].sort((a, b) => b - a).join(', ')} cartes) — prévoyez ${RULES.prizeCount} récompenses en partie.`,
    );
  }

  return { valid: errors.length === 0, errors, warnings, total };
}

export function getPoolCards() {
  const seen = new Set();
  return Object.values(CARD_DATABASE)
    .filter((c) => {
      if (!c?.id || !isDeckBuilderPoolCard(c) || isTestOnlyCard(c)) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort(comparePoolCards);
}

export function poolFilterType(card, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'chevalier') return card.cardType === 'chevalier';
  if (filter === 'energie') return card.cardType === 'energie';
  if (filter === 'supporter') return card.cardType === 'supporter';
  if (filter === 'objet') return card.cardType === 'objet';
  if (filter === 'outil') return card.cardType === 'outil';
  if (filter === 'stade') return card.cardType === 'stade';
  return true;
}

export function poolTypeLabel(filter) {
  const labels = {
    all: 'Toutes',
    chevalier: 'Chevaliers',
    energie: 'Énergies',
    supporter: 'Supporters',
    objet: 'Objets',
    outil: 'Outils',
    stade: 'Stades',
  };
  return labels[filter] || filter;
}
