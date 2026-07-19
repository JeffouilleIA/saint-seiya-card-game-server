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
/** @typedef {{ id: string, name: string }} DeckFolder */
/** @typedef {{ id: string, name: string, cards: DeckCardEntry[], builtIn?: boolean, folderId?: string }} SavedDeck */

export const UNFILED_FOLDER_LABEL = 'Divers';

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

function normalizeDeckFolder(entry) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') return null;
  const name = entry.name.trim() || 'Sans nom';
  return { id: entry.id, name };
}

function normalizeDeckFolders(parsed) {
  if (!Array.isArray(parsed)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of parsed) {
    const folder = normalizeDeckFolder(entry);
    if (!folder || seen.has(folder.id)) continue;
    seen.add(folder.id);
    out.push(folder);
  }
  return out;
}

function normalizeSavedDecks(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards))
    .map((d) => {
      const deck = {
        id: d.id,
        name: d.name,
        cards: d.cards
          .filter((c) => c && typeof c.id === 'string')
          .map((c) => ({ id: c.id, count: capEntryCount(c.id, c.count) }))
          .filter((c) => c.count > 0),
      };
      if (typeof d.folderId === 'string' && d.folderId) deck.folderId = d.folderId;
      return deck;
    });
}

function parseDeckStoragePayload(parsed) {
  if (Array.isArray(parsed)) {
    return { folders: [], decks: normalizeSavedDecks(parsed) };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.decks)) {
    return {
      folders: normalizeDeckFolders(parsed.folders),
      decks: normalizeSavedDecks(parsed.decks),
    };
  }
  return { folders: [], decks: [] };
}

function readLocalDeckStorage() {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return parseDeckStoragePayload(raw ? safeParse(raw) : null);
}

function writeLocalDeckStorage(folders, decks) {
  if (typeof localStorage === 'undefined') return;
  const custom = decks.filter((d) => !d.builtIn && d.id !== DEFAULT_DECK_ID);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders, decks: custom }));
}

function applyServerDeckStorage(folders, decks) {
  serverFoldersCache = folders;
  serverDecksCache = decks;
}

function usesCachedDeckStorage() {
  return sharedServerMode || serverDecksCache.length > 0 || serverFoldersCache.length > 0;
}

function persistDeckStorage(folders, decks) {
  const custom = decks.filter((d) => !d.builtIn && d.id !== DEFAULT_DECK_ID);
  const foldersCopy = folders.map((f) => ({ ...f }));
  const decksCopy = custom.map((d) => ({
    ...d,
    cards: d.cards.map((c) => ({ ...c })),
  }));
  if (sharedServerMode) {
    applyServerDeckStorage(foldersCopy, decksCopy);
    persistDecksToServer(serverFoldersCache, serverDecksCache);
    return;
  }
  if (serverDecksCache.length > 0 || serverFoldersCache.length > 0) {
    applyServerDeckStorage(foldersCopy, decksCopy);
  }
  writeLocalDeckStorage(foldersCopy, decksCopy);
}

/** @type {DeckFolder[]} */
let serverFoldersCache = [];
/** @type {SavedDeck[]} */
let serverDecksCache = [];
let sharedServerMode = false;
/** @type {Promise<void>} */
let persistQueue = Promise.resolve();

export function isSharedDeckStorage() {
  return sharedServerMode;
}

export function usesServerDeckStorage() {
  return usesCachedDeckStorage();
}

function loadDeckStorageFromApiPayload(data) {
  if (!data || !Array.isArray(data.decks)) return false;
  applyServerDeckStorage(normalizeDeckFolders(data.folders), normalizeSavedDecks(data.decks));
  return true;
}

function loadDeckStorageFromJsonPayload(payload) {
  const { folders, decks } = parseDeckStoragePayload(payload);
  if (decks.length === 0 && folders.length === 0) return false;
  applyServerDeckStorage(folders, decks);
  return true;
}

export async function initDeckStorage() {
  try {
    const res = await fetch('/api/decks', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.shared && loadDeckStorageFromApiPayload(data)) {
        sharedServerMode = true;
        return;
      }
    }
  } catch {
    /* pas d'API réseau */
  }
  try {
    const res = await fetch('./data/saved-decks.json', { cache: 'no-store' });
    if (res.ok) {
      loadDeckStorageFromJsonPayload(await res.json());
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
        loadDeckStorageFromApiPayload(await res.json());
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (usesCachedDeckStorage()) {
    try {
      const res = await fetch('./data/saved-decks.json', { cache: 'no-store' });
      if (res.ok) {
        loadDeckStorageFromJsonPayload(await res.json());
      }
    } catch {
      /* ignore */
    }
  }
}

function persistDecksToServer(folders, decks) {
  if (!sharedServerMode) return;
  persistQueue = persistQueue
    .then(async () => {
      const res = await fetch('/api/decks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders, decks }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
    .catch((err) => {
      console.warn('Synchronisation des decks échouée:', err);
    });
}

function flushDeckPersistQueue() {
  return persistQueue;
}

function mergeDeckStorageLayers(...layers) {
  const folderById = new Map();
  const deckById = new Map();
  for (const layer of layers) {
    for (const folder of layer.folders || []) folderById.set(folder.id, folder);
    for (const deck of layer.decks || []) deckById.set(deck.id, deck);
  }
  return {
    folders: [...folderById.values()],
    decks: [...deckById.values()],
  };
}

function readBrowserDeckStorage() {
  const fromLocal = readLocalDeckStorage();
  if (!usesCachedDeckStorage()) return fromLocal;
  return mergeDeckStorageLayers(
    { folders: serverFoldersCache, decks: serverDecksCache },
    fromLocal,
  );
}

export function loadDeckFolders() {
  if (usesCachedDeckStorage()) {
    return serverFoldersCache.map((f) => ({ ...f }));
  }
  return readLocalDeckStorage().folders;
}

export function loadSavedDecks() {
  if (usesCachedDeckStorage()) {
    return serverDecksCache.map((d) => ({
      ...d,
      cards: d.cards.map((c) => ({ ...c })),
    }));
  }
  return readLocalDeckStorage().decks;
}

export function saveSavedDecks(decks) {
  persistDeckStorage(loadDeckFolders(), decks);
}

/** Fusionne localStorage + fichier projet → data/saved-decks.json (API requise). */
export async function publishLocalDecksToProject() {
  await flushDeckPersistQueue();

  let fromServer = { folders: [], decks: [] };
  try {
    const res = await fetch('/api/decks', { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'API decks indisponible. Lancez le serveur Node.' };
    const data = await res.json();
    fromServer = parseDeckStoragePayload({ folders: data.folders, decks: data.decks || [] });
  } catch {
    return { ok: false, error: 'API decks indisponible. Lancez le serveur Node.' };
  }

  const { folders: mergedFolders, decks: mergedDecks } = mergeDeckStorageLayers(
    fromServer,
    readBrowserDeckStorage(),
  );

  if (!mergedDecks.length) {
    return { ok: false, error: 'Aucun deck à publier (navigateur ou projet vide).' };
  }

  try {
    const put = await fetch('/api/decks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folders: mergedFolders, decks: mergedDecks }),
    });
    if (!put.ok) return { ok: false, error: `Échec enregistrement (HTTP ${put.status}).` };
    sharedServerMode = true;
    applyServerDeckStorage(mergedFolders, mergedDecks);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    return { ok: true, count: mergedDecks.length };
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
  if ('folderId' in deck) {
    entry.folderId = deck.folderId || undefined;
  } else if (idx >= 0 && decks[idx].folderId) {
    entry.folderId = decks[idx].folderId;
  }
  if (idx >= 0) decks[idx] = entry;
  else decks.push(entry);
  saveSavedDecks(decks);
  return entry;
}

export function createDeckFolder(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { error: 'Nom de dossier requis.' };
  const folders = loadDeckFolders();
  const entry = {
    id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
  };
  folders.push(entry);
  persistDeckStorage(folders, loadSavedDecks());
  return entry;
}

export function renameDeckFolder(folderId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { error: 'Nom de dossier requis.' };
  const folders = loadDeckFolders();
  const idx = folders.findIndex((f) => f.id === folderId);
  if (idx < 0) return { error: 'Dossier introuvable.' };
  folders[idx] = { ...folders[idx], name: trimmed };
  persistDeckStorage(folders, loadSavedDecks());
  return folders[idx];
}

export function deleteDeckFolder(folderId) {
  const folders = loadDeckFolders().filter((f) => f.id !== folderId);
  const decks = loadSavedDecks().map((deck) =>
    deck.folderId === folderId ? { ...deck, folderId: undefined } : deck,
  );
  persistDeckStorage(folders, decks);
}

export function moveDeckToFolder(deckId, folderId) {
  const folders = loadDeckFolders();
  if (folderId && !folders.some((f) => f.id === folderId)) {
    return { error: 'Dossier introuvable.' };
  }
  const decks = loadSavedDecks();
  const idx = decks.findIndex((d) => d.id === deckId);
  if (idx < 0) return { error: 'Deck introuvable.' };
  const entry = {
    ...decks[idx],
    folderId: folderId || undefined,
  };
  decks[idx] = entry;
  saveSavedDecks(decks);
  return entry;
}

/**
 * Regroupe les decks pour l'affichage (dossiers vides inclus).
 * @param {SavedDeck[]} [decks]
 * @param {DeckFolder[]} [folders]
 */
export function groupDecksByFolder(decks = loadSavedDecks(), folders = loadDeckFolders()) {
  const folderIds = new Set(folders.map((f) => f.id));
  const groups = [
    {
      folderId: null,
      name: UNFILED_FOLDER_LABEL,
      decks: decks.filter((d) => !d.folderId || !folderIds.has(d.folderId)),
    },
  ];
  for (const folder of folders) {
    groups.push({
      folderId: folder.id,
      name: folder.name,
      decks: decks.filter((d) => d.folderId === folder.id),
    });
  }
  return groups;
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
