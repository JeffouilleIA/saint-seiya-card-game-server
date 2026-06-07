/**
 * Mode « Les 12 maisons » — decks adverses, ordre de difficulté, tableau des légendes
 */

import { getCardDef } from './cards.js';
import { getDeckWinPercent, loadAllDeckStats } from './deck-stats.js';
import { RULES } from './rules.js';

const TARGET_DECK_SIZE = RULES.deckSize ?? 60;

function countDeckCards(cards) {
  return (cards || []).reduce((sum, c) => sum + (Number(c.count) || 0), 0);
}

export const TWELVE_HOUSES_LEADERBOARD_KEY = 'chevalier-twelve-houses-legend';
export const HOUSE_DECK_ID_PREFIX = '__house__';

/** Niveaux du mode (alignés sur les 7 niveaux IA du jeu ; « normal » = moyen). */
export const TWELVE_HOUSES_DIFFICULTIES = [
  'facile',
  'normal',
  'difficile',
  'expert',
  'legende',
  'ridicule',
  'absurde',
];

export const TWELVE_HOUSES_DIFFICULTY_LABELS = {
  facile: 'Facile',
  normal: 'Moyen',
  difficile: 'Difficile',
  expert: 'Expert',
  legende: 'Légende',
  ridicule: 'Ridicule',
  absurde: 'Absurde',
};

export const TWELVE_HOUSES_DIFFICULTY_HINTS = {
  facile: '10 maisons · IA facile',
  normal: '12 maisons · IA moyenne',
  difficile: '12 maisons · IA difficile',
  expert: '12 maisons · IA expert',
  legende: '12 maisons · IA légende (sans triche)',
  ridicule: '12 maisons · triche pioche',
  absurde: '12 maisons · triche pioche + main adverse',
};

/** @returns {TwelveHousesLeaderboard} */
function createEmptyLeaderboard() {
  return Object.fromEntries(TWELVE_HOUSES_DIFFICULTIES.map((d) => [d, []]));
}

/** @param {string} [value] */
export function normalizeTwelveHousesDifficulty(value) {
  if (value === 'moyen') return 'normal';
  return TWELVE_HOUSES_DIFFICULTIES.includes(value) ? value : 'normal';
}

/** @param {string} modeDifficulty */
function getModeDifficultySettings(modeDifficulty) {
  const level = normalizeTwelveHousesDifficulty(modeDifficulty);
  if (level === 'facile') {
    return { aiDifficulty: 'facile', skipStrongest: 2 };
  }
  if (level === 'difficile') {
    return { aiDifficulty: 'difficile', skipStrongest: 0 };
  }
  if (level === 'expert') {
    return { aiDifficulty: 'expert', skipStrongest: 0 };
  }
  if (level === 'legende') {
    return { aiDifficulty: 'legende', skipStrongest: 0 };
  }
  if (level === 'ridicule') {
    return { aiDifficulty: 'ridicule', skipStrongest: 0 };
  }
  if (level === 'absurde') {
    return { aiDifficulty: 'absurde', skipStrongest: 0 };
  }
  return { aiDifficulty: 'moyen', skipStrongest: 0 };
}

let configPromise = null;
/** @type {Map<string, import('./decks.js').SavedDeck>} */
const houseDeckCache = new Map();

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchConfig() {
  const res = await fetch('./data/twelve-houses.json');
  if (!res.ok) throw new Error(`twelve-houses.json (${res.status})`);
  return res.json();
}

export async function loadTwelveHousesConfig() {
  if (!configPromise) {
    configPromise = fetchConfig().catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

const KNIGHT_TIER_WEIGHT = {
  'chevalier-noir': 1,
  'armee-hades': 2.4,
  'armee-poseidon': 2.8,
  'chevalier-bronze': 1.6,
  'chevalier-argent': 2.2,
  'guerrier-divin-asgard': 2.8,
  'chevalier-or': 3.5,
  'chevalier-divin': 5,
  divinite: 5.5,
};

function knightPowerWeight(def) {
  if (!def || def.cardType !== 'chevalier') return 0;
  const raw = def.rawType || def.type || '';
  const tier = KNIGHT_TIER_WEIGHT[raw] ?? 1.5;
  const hp = def.hp ?? 60;
  const atk =
    def.attacks?.reduce((m, a) => Math.max(m, Number(a.damage) || 0), 0) ?? 0;
  return tier * hp + atk * 0.4;
}

/** @param {import('./decks.js').DeckCardEntry[]} cards */
export function computeDeckPowerScore(cards) {
  let score = 0;
  for (const entry of cards || []) {
    const def = getCardDef(entry.id);
    if (!def) continue;
    const n = entry.count || 0;
    if (def.cardType === 'chevalier') score += knightPowerWeight(def) * n;
    else if (def.cardType === 'energie') score += 0.15 * n;
    else score += 0.25 * n;
  }
  return score;
}

function filterValidKnightIds(knightIds) {
  const out = [];
  const seen = new Set();
  for (const id of knightIds || []) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    const def = getCardDef(id);
    if (def?.cardType === 'chevalier' && !def.testOnly) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

/**
 * Complète un deck maison à 60 cartes (énergies + entraînement + objets légers).
 * @param {string[]} knightIds
 */
function buildHouseCardList(knightIds) {
  const cards = [];
  for (const id of knightIds) {
    cards.push({ id, count: 1 });
  }
  cards.push({ id: 'energie-etoile', count: 22 });
  cards.push({ id: 'entrainement', count: 17 });
  cards.push({ id: 'supporter_vieux_maitre', count: 1 });
  cards.push({ id: 'bouclier-d-athena', count: 2 });

  let total = countDeckCards(cards);
  if (total > TARGET_DECK_SIZE) {
    while (total > TARGET_DECK_SIZE && cards.length) {
      const last = cards[cards.length - 1];
      if (last.count > 1) last.count -= 1;
      else cards.pop();
      total = countDeckCards(cards);
    }
  } else if (total < TARGET_DECK_SIZE) {
    const last = cards.find((c) => c.id === 'entrainement');
    if (last) last.count += TARGET_DECK_SIZE - total;
  }
  return cards;
}

/**
 * @param {object} rawHouse
 * @returns {import('./decks.js').SavedDeck | null}
 */
/**
 * Nom affiché du deck adversaire (pas le nom de la maison).
 * @param {string[]} knightIds
 */
export function formatHouseDeckNameFromKnights(knightIds) {
  const knights = filterValidKnightIds(knightIds);
  const labels = knights
    .map((id) => getCardDef(id)?.name)
    .filter((name) => typeof name === 'string' && name.trim());
  if (!labels.length) return 'Deck maison';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} (+${labels.length - 2})`;
}

/**
 * Libellé deck pour l'échelle / l'UI (deckName JSON > chevaliers > name).
 * @param {{ name?: string, deckName?: string, houseName?: string, knights?: string[], cards?: import('./decks.js').DeckCardEntry[] }} house
 */
export function getHouseDeckDisplayName(house) {
  if (!house) return 'Deck';
  const explicit = typeof house.deckName === 'string' ? house.deckName.trim() : '';
  if (explicit) return explicit;
  if (Array.isArray(house.knights) && house.knights.length) {
    return formatHouseDeckNameFromKnights(house.knights);
  }
  if (house.houseName && house.name === house.houseName) {
    return formatHouseDeckNameFromKnights(
      (house.cards || [])
        .map((c) => c.id)
        .filter((id) => getCardDef(id)?.cardType === 'chevalier'),
    );
  }
  return house.name || house.houseName || 'Deck';
}

function buildHouseDeckEntry(rawHouse) {
  if (!rawHouse?.id || !rawHouse?.name) return null;
  const knights = filterValidKnightIds(rawHouse.knights);
  if (knights.length === 0) return null;
  const deckId = `${HOUSE_DECK_ID_PREFIX}${rawHouse.id}`;
  const cards = buildHouseCardList(knights);
  const houseName = String(rawHouse.name).trim();
  const deckName =
    (typeof rawHouse.deckName === 'string' && rawHouse.deckName.trim()) ||
    formatHouseDeckNameFromKnights(knights);
  return {
    id: deckId,
    name: deckName,
    houseName,
    knights,
    cards,
    builtIn: true,
    houseTier: Number(rawHouse.tier) || 0,
    houseNumber: Number(rawHouse.houseNumber) || 0,
  };
}

function sortHouses(houses) {
  const stats = loadAllDeckStats();
  return [...houses].sort((a, b) => {
    const tierA = a.houseTier ?? 0;
    const tierB = b.houseTier ?? 0;
    if (tierA !== tierB) return tierA - tierB;

    const statA = stats[a.id];
    const statB = stats[b.id];
    const gamesA = (statA?.wins || 0) + (statA?.losses || 0);
    const gamesB = (statB?.wins || 0) + (statB?.losses || 0);
    if (gamesA >= 3 && gamesB >= 3) {
      const pctA = getDeckWinPercent(statA) ?? 50;
      const pctB = getDeckWinPercent(statB) ?? 50;
      if (pctA !== pctB) return pctA - pctB;
    }

    return computeDeckPowerScore(a.cards) - computeDeckPowerScore(b.cards);
  });
}

/**
 * Charge et met en cache les decks maisons (faible → fort).
 * @param {string} [modeDifficulty]
 * @returns {Promise<{ title: string, aiDifficulty: string, modeDifficulty: string, houses: import('./decks.js').SavedDeck[], totalHouses: number }>}
 */
export async function prepareTwelveHousesRun(modeDifficulty = 'normal') {
  const config = await loadTwelveHousesConfig();
  const settings = getModeDifficultySettings(modeDifficulty);
  const built = [];
  for (const raw of config.houses || []) {
    const entry = buildHouseDeckEntry(raw);
    if (entry) {
      houseDeckCache.set(entry.id, entry);
      built.push(entry);
    }
  }
  let sorted = sortHouses(built);
  if (settings.skipStrongest > 0 && sorted.length > settings.skipStrongest) {
    sorted = sorted.slice(0, sorted.length - settings.skipStrongest);
  }
  const houses = sorted.map((h, i) => ({
    ...h,
    houseNumber: i + 1,
  }));
  for (const h of houses) {
    houseDeckCache.set(h.id, h);
  }
  return {
    title: config.title || 'Les 12 maisons',
    aiDifficulty: settings.aiDifficulty,
    modeDifficulty: normalizeTwelveHousesDifficulty(modeDifficulty),
    houses,
    totalHouses: houses.length,
  };
}

/** @param {string} id */
export function getHouseDeckById(id) {
  if (!id || !id.startsWith(HOUSE_DECK_ID_PREFIX)) return null;
  return houseDeckCache.get(id) || null;
}

/** @typedef {{ name: string, score: number, date: string, deckId?: string, deckName?: string }} LegendEntry */
/** @typedef {{ facile: LegendEntry[], normal: LegendEntry[], difficile: LegendEntry[], expert: LegendEntry[], legende: LegendEntry[], ridicule: LegendEntry[], absurde: LegendEntry[] }} TwelveHousesLeaderboard */

/** @param {unknown} entries */
function normalizeLegendEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && typeof e.name === 'string')
    .map((e) => ({
      name: String(e.name).trim().slice(0, 24) || 'Anonyme',
      score: Math.max(0, Number(e.score) || 0),
      date: typeof e.date === 'string' ? e.date : '',
      deckId: typeof e.deckId === 'string' ? e.deckId : '',
      deckName: typeof e.deckName === 'string' ? e.deckName.trim().slice(0, 48) : '',
    }))
    .sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
}

/** @param {unknown} parsed */
function normalizeLeaderboardData(parsed) {
  const empty = createEmptyLeaderboard();
  if (!parsed) return empty;
  if (Array.isArray(parsed)) {
    return { ...empty, difficile: normalizeLegendEntries(parsed) };
  }
  if (typeof parsed === 'object') {
    /** @type {TwelveHousesLeaderboard} */
    const out = { ...empty };
    for (const diff of TWELVE_HOUSES_DIFFICULTIES) {
      if (Array.isArray(parsed[diff])) {
        out[diff] = normalizeLegendEntries(parsed[diff]);
      }
    }
    return out;
  }
  return empty;
}

/** @returns {TwelveHousesLeaderboard} */
export function loadTwelveHousesLeaderboardAll() {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(TWELVE_HOUSES_LEADERBOARD_KEY)
        : null;
    return normalizeLeaderboardData(raw ? safeParse(raw) : null);
  } catch {
    return createEmptyLeaderboard();
  }
}

/** @param {string} [difficulty] */
export function loadTwelveHousesLeaderboard(difficulty) {
  const all = loadTwelveHousesLeaderboardAll();
  if (!difficulty) return all;
  return all[normalizeTwelveHousesDifficulty(difficulty)] || [];
}

/** @param {LegendEntry & { difficulty?: string }} entry */
export function saveTwelveHousesLegend(entry) {
  const difficulty = normalizeTwelveHousesDifficulty(entry.difficulty);
  const all = loadTwelveHousesLeaderboardAll();
  const list = all[difficulty];
  list.push({
    name: entry.name.trim().slice(0, 24) || 'Anonyme',
    score: Math.max(0, Number(entry.score) || 0),
    date: entry.date || new Date().toISOString(),
    deckId: typeof entry.deckId === 'string' ? entry.deckId : '',
    deckName: typeof entry.deckName === 'string' ? entry.deckName.trim().slice(0, 48) : '',
  });
  list.sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
  all[difficulty] = list.slice(0, 50);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TWELVE_HOUSES_LEADERBOARD_KEY, JSON.stringify(all));
    }
  } catch {
    /* ignore */
  }
  return all[difficulty];
}

/** @param {string} [difficulty] — sans argument : efface tout le tableau */
export function clearTwelveHousesLeaderboard(difficulty) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!difficulty) {
      localStorage.removeItem(TWELVE_HOUSES_LEADERBOARD_KEY);
      return;
    }
    const level = normalizeTwelveHousesDifficulty(difficulty);
    const all = loadTwelveHousesLeaderboardAll();
    all[level] = [];
    localStorage.setItem(TWELVE_HOUSES_LEADERBOARD_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * État d'une maison sur l'échelle (intro ou progression entre combats).
 * @param {number} index
 * @param {{ wins?: number, currentIndex?: number }} ctx
 * @returns {'defeated' | 'current' | 'upcoming'}
 */
export function getHouseLadderItemState(index, { wins = 0, currentIndex = 0 } = {}) {
  if (index < wins) return 'defeated';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

/** @param {number} tier */
export function formatHouseTierLabel(tier) {
  const n = Number(tier) || 0;
  return n > 0 ? `Palier ${n}` : '';
}

export function formatLegendDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}
