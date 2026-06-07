/**
 * Statistiques par deck (victoires / défaites + métriques avancées) — localStorage
 *
 * @example localStorage schema (chevalier-deck-stats)
 * {
 *   "deck-abc": {
 *     "name": "Pégase",
 *     "wins": 5, "losses": 3, "draws": 0,
 *     "damageDealt": 1200, "damageReceived": 980,
 *     "totalTurns": 340,
 *     "totalTurnsAsAttacker": 170,
 *     "totalTurnsAsDefender": 170,
 *     "turnsToFirstKoDealtSum": 42, "turnsToFirstKoDealtGames": 5,
 *     "turnsToFirstKoReceivedSum": 38, "turnsToFirstKoReceivedGames": 5,
 *     "knightDamageDealt": { "seiya-de-pegase": 400, "shiryu-du-dragon": 200 },
 *     // clés = cardId du chevalier ayant infligé (attaque + talents), cumul par carte
 *     "vsDeck": { "deck-xyz": { "name": "Dragon", "wins": 2, "losses": 1, "draws": 0 } },
 *     "vsAi": { "facile": { "wins": 3, "losses": 0, "draws": 0 }, "moyen": { ... }, "difficile": { ... } }
 *   }
 * }
 *
 * Moyennes dégâts / tour : dégâts infligés ÷ tours où le deck était attaquant ;
 * dégâts reçus ÷ tours où le deck était défenseur (tour adverse).
 * Moyennes tours avant 1er KO : moyenne des valeurs par partie où l'événement s'est produit.
 */

import { getCardDef } from './cards.js';

export const DECK_STATS_STORAGE_KEY = 'chevalier-deck-stats';

const AI_LEVELS = ['facile', 'moyen', 'difficile', 'expert', 'legende', 'ridicule', 'absurde'];

/** @typedef {{ wins: number, losses: number, draws: number }} WldRecord */
/** @typedef {{ name: string, wins: number, losses: number, draws: number, damageDealt: number, damageReceived: number, totalTurns: number, totalTurnsAsAttacker: number, totalTurnsAsDefender: number, turnsToFirstKoDealtSum: number, turnsToFirstKoDealtGames: number, turnsToFirstKoReceivedSum: number, turnsToFirstKoReceivedGames: number, knightDamageDealt: Record<string, number>, vsDeck: Record<string, WldRecord & { name?: string }>, vsAi: Record<string, WldRecord> }} DeckStatRecord */

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeWld(raw) {
  return {
    wins: Math.max(0, Number(raw?.wins) || 0),
    losses: Math.max(0, Number(raw?.losses) || 0),
    draws: Math.max(0, Number(raw?.draws) || 0),
  };
}

function normalizeKnightDamage(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [cardId, val] of Object.entries(raw)) {
    if (typeof cardId !== 'string') continue;
    const n = Math.max(0, Number(val) || 0);
    if (n > 0) out[cardId] = n;
  }
  return out;
}

function normalizeVsDeck(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, rec] of Object.entries(raw)) {
    if (typeof id !== 'string') continue;
    const wld = normalizeWld(rec);
    const name = typeof rec?.name === 'string' ? rec.name : '';
    if (wld.wins + wld.losses + wld.draws === 0 && !name) continue;
    out[id] = { ...wld, name };
  }
  return out;
}

function normalizeVsAi(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const level of AI_LEVELS) {
    if (raw[level]) out[level] = normalizeWld(raw[level]);
  }
  return out;
}

/** @param {unknown} raw @returns {DeckStatRecord | null} */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const wins = Math.max(0, Number(raw.wins) || 0);
  const losses = Math.max(0, Number(raw.losses) || 0);
  const draws = Math.max(0, Number(raw.draws) || 0);
  const name = typeof raw.name === 'string' ? raw.name : '';
  const damageDealt = Math.max(0, Number(raw.damageDealt) || 0);
  const damageReceived = Math.max(0, Number(raw.damageReceived) || 0);
  const totalTurns = Math.max(0, Number(raw.totalTurns) || 0);
  const totalTurnsAsAttacker = Math.max(0, Number(raw.totalTurnsAsAttacker) || 0);
  const totalTurnsAsDefender = Math.max(0, Number(raw.totalTurnsAsDefender) || 0);
  const turnsToFirstKoDealtSum = Math.max(0, Number(raw.turnsToFirstKoDealtSum) || 0);
  const turnsToFirstKoDealtGames = Math.max(0, Number(raw.turnsToFirstKoDealtGames) || 0);
  const turnsToFirstKoReceivedSum = Math.max(0, Number(raw.turnsToFirstKoReceivedSum) || 0);
  const turnsToFirstKoReceivedGames = Math.max(0, Number(raw.turnsToFirstKoReceivedGames) || 0);

  if (
    !name &&
    wins === 0 &&
    losses === 0 &&
    draws === 0 &&
    damageDealt === 0 &&
    damageReceived === 0
  ) {
    return null;
  }

  return {
    name: name || 'Deck inconnu',
    wins,
    losses,
    draws,
    damageDealt,
    damageReceived,
    totalTurns,
    totalTurnsAsAttacker,
    totalTurnsAsDefender,
    turnsToFirstKoDealtSum,
    turnsToFirstKoDealtGames,
    turnsToFirstKoReceivedSum,
    turnsToFirstKoReceivedGames,
    knightDamageDealt: normalizeKnightDamage(raw.knightDamageDealt),
    vsDeck: normalizeVsDeck(raw.vsDeck),
    vsAi: normalizeVsAi(raw.vsAi),
  };
}

function emptyRecord(name = 'Deck inconnu') {
  return {
    name,
    wins: 0,
    losses: 0,
    draws: 0,
    damageDealt: 0,
    damageReceived: 0,
    totalTurns: 0,
    totalTurnsAsAttacker: 0,
    totalTurnsAsDefender: 0,
    turnsToFirstKoDealtSum: 0,
    turnsToFirstKoDealtGames: 0,
    turnsToFirstKoReceivedSum: 0,
    turnsToFirstKoReceivedGames: 0,
    knightDamageDealt: {},
    vsDeck: {},
    vsAi: {},
  };
}

/** @returns {Record<string, DeckStatRecord>} */
export function loadAllDeckStats() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DECK_STATS_STORAGE_KEY) : null;
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const [deckId, rec] of Object.entries(parsed)) {
      if (typeof deckId !== 'string') continue;
      const norm = normalizeRecord(rec);
      if (norm) out[deckId] = norm;
    }
    return out;
  } catch {
    return {};
  }
}

function saveAllDeckStats(stats) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DECK_STATS_STORAGE_KEY, JSON.stringify(stats));
    }
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Suivi léger pendant une partie (branché sur le moteur).
 * @param {{ gameMode: 'ai' | 'local2p', deckIds: [string, string], aiDifficulty?: string }} config
 */
export function createMatchStatsTracker({ gameMode, deckIds, aiDifficulty = 'moyen' }) {
  const perPlayer = [
    {
      deckId: deckIds[0] || '',
      damageDealt: 0,
      damageReceived: 0,
      knightDamage: /** @type {Record<string, number>} */ ({}),
      firstKoDealtTurn: /** @type {number | null} */ (null),
      firstKoReceivedTurn: /** @type {number | null} */ (null),
      knockOutsDealt: 0,
      knockOutsReceived: 0,
      turnsAsAttacker: 0,
      turnsAsDefender: 0,
    },
    {
      deckId: deckIds[1] || '',
      damageDealt: 0,
      damageReceived: 0,
      knightDamage: {},
      firstKoDealtTurn: null,
      firstKoReceivedTurn: null,
      knockOutsDealt: 0,
      knockOutsReceived: 0,
      turnsAsAttacker: 0,
      turnsAsDefender: 0,
    },
  ];

  return {
    gameMode,
    aiDifficulty: AI_LEVELS.includes(aiDifficulty) ? aiDifficulty : 'moyen',

    recordDamage({ victimPlayerIndex, amount, source, attackerPlayerIndex, attackerCardId }) {
      const dmg = Math.max(0, Number(amount) || 0);
      if (dmg <= 0) return;
      const victim = perPlayer[victimPlayerIndex];
      if (!victim) return;
      victim.damageReceived += dmg;

      let dealerIndex = attackerPlayerIndex;
      if (dealerIndex == null && source === 'attack') return;
      if (dealerIndex == null) return;

      const dealer = perPlayer[dealerIndex];
      if (!dealer || dealerIndex === victimPlayerIndex) return;
      dealer.damageDealt += dmg;

      if ((source === 'attack' || source === 'talent') && attackerCardId) {
        dealer.knightDamage[attackerCardId] =
          (dealer.knightDamage[attackerCardId] || 0) + dmg;
      }
    },

    /** Compte un tour terminé : le joueur qui finit son tour était l'attaquant. */
    recordTurnEnd(endingPlayerIndex) {
      const idx = Number(endingPlayerIndex);
      if (idx !== 0 && idx !== 1) return;
      const attacker = perPlayer[idx];
      const defender = perPlayer[1 - idx];
      if (attacker) attacker.turnsAsAttacker += 1;
      if (defender) defender.turnsAsDefender += 1;
    },

    recordKnockOut({ victimPlayerIndex, turnCount }) {
      const turn = Math.max(0, Number(turnCount) || 0);
      const scorerIndex = 1 - victimPlayerIndex;
      const scorer = perPlayer[scorerIndex];
      const victim = perPlayer[victimPlayerIndex];
      if (scorer) {
        if (scorer.firstKoDealtTurn == null) scorer.firstKoDealtTurn = turn;
        scorer.knockOutsDealt += 1;
      }
      if (victim) {
        if (victim.firstKoReceivedTurn == null) victim.firstKoReceivedTurn = turn;
        victim.knockOutsReceived += 1;
      }
    },

    /** @param {number} finalTurnCount */
    finalize(finalTurnCount) {
      const turns = Math.max(0, Number(finalTurnCount) || 0);
      return perPlayer.map((p) => ({
        deckId: p.deckId,
        damageDealt: p.damageDealt,
        damageReceived: p.damageReceived,
        knightDamage: { ...p.knightDamage },
        firstKoDealtTurn: p.firstKoDealtTurn,
        firstKoReceivedTurn: p.firstKoReceivedTurn,
        knockOutsDealt: p.knockOutsDealt,
        knockOutsReceived: p.knockOutsReceived,
        turnsAsAttacker: p.turnsAsAttacker,
        turnsAsDefender: p.turnsAsDefender,
        turnCount: turns,
      }));
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.deckId
 * @param {string} opts.deckName
 * @param {'win' | 'loss' | 'draw'} opts.outcome
 * @param {ReturnType<ReturnType<typeof createMatchStatsTracker>['finalize']>[number]} [opts.match]
 * @param {string} [opts.opponentDeckId]
 * @param {string} [opts.opponentDeckName]
 * @param {'ai' | 'local2p'} [opts.gameMode]
 * @param {string} [opts.aiDifficulty]
 */
export function recordDeckMatchFromGame({
  deckId,
  deckName,
  outcome,
  match,
  opponentDeckId,
  opponentDeckName,
  gameMode,
  aiDifficulty,
}) {
  if (!deckId) return;
  const stats = loadAllDeckStats();
  const prev = stats[deckId] || emptyRecord(deckName || deckId);
  const entry = { ...prev, name: (deckName || prev.name || deckId).trim() || deckId };

  if (outcome === 'win') entry.wins += 1;
  else if (outcome === 'loss') entry.losses += 1;
  else entry.draws += 1;

  if (match) {
    entry.damageDealt += match.damageDealt || 0;
    entry.damageReceived += match.damageReceived || 0;
    entry.totalTurns += match.turnCount || 0;
    entry.totalTurnsAsAttacker += match.turnsAsAttacker || 0;
    entry.totalTurnsAsDefender += match.turnsAsDefender || 0;

    if (match.firstKoDealtTurn != null) {
      entry.turnsToFirstKoDealtSum += match.firstKoDealtTurn;
      entry.turnsToFirstKoDealtGames += 1;
    }
    if (match.firstKoReceivedTurn != null) {
      entry.turnsToFirstKoReceivedSum += match.firstKoReceivedTurn;
      entry.turnsToFirstKoReceivedGames += 1;
    }

    for (const [cardId, dmg] of Object.entries(match.knightDamage || {})) {
      const add = Math.max(0, Number(dmg) || 0);
      if (add > 0) {
        entry.knightDamageDealt[cardId] = (entry.knightDamageDealt[cardId] || 0) + add;
      }
    }
  }

  if (opponentDeckId) {
    if (!entry.vsDeck[opponentDeckId]) {
      entry.vsDeck[opponentDeckId] = { wins: 0, losses: 0, draws: 0, name: opponentDeckName || '' };
    }
    const vs = entry.vsDeck[opponentDeckId];
    if (opponentDeckName) vs.name = opponentDeckName;
    if (outcome === 'win') vs.wins += 1;
    else if (outcome === 'loss') vs.losses += 1;
    else vs.draws += 1;
  }

  if (gameMode === 'ai' && aiDifficulty && AI_LEVELS.includes(aiDifficulty)) {
    if (!entry.vsAi[aiDifficulty]) {
      entry.vsAi[aiDifficulty] = { wins: 0, losses: 0, draws: 0 };
    }
    const vs = entry.vsAi[aiDifficulty];
    if (outcome === 'win') vs.wins += 1;
    else if (outcome === 'loss') vs.losses += 1;
    else vs.draws += 1;
  }

  stats[deckId] = entry;
  saveAllDeckStats(stats);
}

/**
 * @param {string} deckId
 * @param {string} deckName
 * @param {'win' | 'loss' | 'draw'} outcome
 */
export function recordDeckMatchResult(deckId, deckName, outcome) {
  recordDeckMatchFromGame({ deckId, deckName, outcome });
}

export function clearAllDeckStats() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DECK_STATS_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {DeckStatRecord} rec
 * @returns {number | null} 0–100 or null if no games
 */
export function getDeckWinPercent(rec) {
  const games = (rec?.wins || 0) + (rec?.losses || 0) + (rec?.draws || 0);
  if (games === 0) return null;
  return (rec.wins / games) * 100;
}

/** @param {WldRecord} rec */
export function getWldWinPercent(rec) {
  const games = (rec?.wins || 0) + (rec?.losses || 0) + (rec?.draws || 0);
  if (games === 0) return null;
  return (rec.wins / games) * 100;
}

/** @param {number | null} pct */
export function formatWinPercent(pct) {
  if (pct == null) return '—';
  return `${pct.toFixed(1)} %`;
}

/** @param {number | null} n */
export function formatStatNumber(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return String(Math.round(n));
}

/** @param {number | null} n */
export function formatStatDecimal(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

/**
 * @param {DeckStatRecord} rec
 * @returns {number | null}
 */
export function getAvgTurnsToFirstKoDealt(rec) {
  const g = rec.turnsToFirstKoDealtGames || 0;
  if (g === 0) return null;
  return rec.turnsToFirstKoDealtSum / g;
}

/**
 * @param {DeckStatRecord} rec
 * @returns {number | null}
 */
export function getAvgTurnsToFirstKoReceived(rec) {
  const g = rec.turnsToFirstKoReceivedGames || 0;
  if (g === 0) return null;
  return rec.turnsToFirstKoReceivedSum / g;
}

/**
 * Dégât moyen par tour attaquant / défenseur (cumul toutes parties).
 * @param {DeckStatRecord} rec
 * @param {'dealt' | 'received'} which
 */
export function getAvgDamagePerTurn(rec, which) {
  const turns =
    which === 'dealt' ? rec.totalTurnsAsAttacker || 0 : rec.totalTurnsAsDefender || 0;
  if (turns === 0) return null;
  const total = which === 'dealt' ? rec.damageDealt : rec.damageReceived;
  return total / turns;
}

/**
 * Moyenne dégâts / tour pour une seule partie (IA Battle, etc.).
 * @param {{ damageDealt?: number, damageReceived?: number, turnsAsAttacker?: number, turnsAsDefender?: number }} match
 * @param {'dealt' | 'received'} which
 */
export function getAvgDamagePerTurnForMatch(match, which) {
  if (!match) return null;
  const turns =
    which === 'dealt' ? match.turnsAsAttacker || 0 : match.turnsAsDefender || 0;
  if (turns === 0) return null;
  const total = which === 'dealt' ? match.damageDealt || 0 : match.damageReceived || 0;
  return total / turns;
}

/**
 * Chevaliers offensifs classés par dégâts cumulés (attaque + talents), par cardId.
 * avgPerGame = totalDamage ÷ nombre de parties du deck (wins + losses + draws),
 * pas le nombre de parties où ce chevalier a infligé des dégâts — « par partie » = moyenne sur l'activité du deck.
 *
 * @param {DeckStatRecord} rec
 * @param {number} [limit=4]
 * @returns {Array<{ cardId: string, name: string, totalDamage: number, avgPerGame: number | null }>}
 */
export function getTopDamageKnights(rec, limit = 4) {
  const entries = Object.entries(rec.knightDamageDealt || {});
  if (!entries.length) return [];
  const games = (rec.wins || 0) + (rec.losses || 0) + (rec.draws || 0);
  entries.sort((a, b) => b[1] - a[1]);
  const cap = Math.max(1, Number(limit) || 4);
  return entries.slice(0, cap).map(([cardId, totalDamage]) => {
    const def = getCardDef(cardId);
    return {
      cardId,
      name: def?.name || cardId,
      totalDamage,
      avgPerGame: games > 0 ? totalDamage / games : null,
    };
  });
}

/**
 * @param {DeckStatRecord} rec
 * @returns {{ cardId: string, name: string, damage: number } | null}
 */
export function getTopDamageKnight(rec) {
  const top = getTopDamageKnights(rec, 1);
  if (!top.length) return null;
  const k = top[0];
  return { cardId: k.cardId, name: k.name, damage: k.totalDamage };
}

const AI_LEVEL_LABELS = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
  expert: 'Expert',
  legende: 'Légende',
  ridicule: 'Ridicule',
  absurde: 'Absurde',
};

/**
 * Rows for stats screen, sorted by name.
 * @param {(id: string) => { name: string } | null | undefined} [resolveDeck]
 */
export function getDeckStatRows(resolveDeck) {
  const stats = loadAllDeckStats();
  const rows = Object.entries(stats).map(([deckId, rec]) => {
    const current = resolveDeck?.(deckId);
    const games = rec.wins + rec.losses + rec.draws;

    const vsDeckRows = Object.entries(rec.vsDeck || {})
      .map(([oppId, wld]) => {
        const opp = resolveDeck?.(oppId);
        const oppName = opp?.name || wld.name || oppId;
        return {
          opponentDeckId: oppId,
          opponentName: oppName,
          wins: wld.wins,
          losses: wld.losses,
          draws: wld.draws,
          games: wld.wins + wld.losses + wld.draws,
          winPercent: getWldWinPercent(wld),
          removed: !opp,
        };
      })
      .filter((r) => r.games > 0)
      .sort((a, b) => a.opponentName.localeCompare(b.opponentName, 'fr'));

    const vsAiRows = AI_LEVELS.map((level) => {
      const wld = rec.vsAi?.[level];
      if (!wld) return null;
      const g = wld.wins + wld.losses + wld.draws;
      if (g === 0) return null;
      return {
        level,
        label: AI_LEVEL_LABELS[level] || level,
        wins: wld.wins,
        losses: wld.losses,
        draws: wld.draws,
        games: g,
        winPercent: getWldWinPercent(wld),
      };
    }).filter(Boolean);

    return {
      deckId,
      name: current?.name || rec.name,
      wins: rec.wins,
      losses: rec.losses,
      draws: rec.draws,
      games,
      winPercent: getDeckWinPercent(rec),
      removed: !current,
      damageDealt: rec.damageDealt,
      damageReceived: rec.damageReceived,
      avgTurnsFirstKoDealt: getAvgTurnsToFirstKoDealt(rec),
      avgTurnsFirstKoReceived: getAvgTurnsToFirstKoReceived(rec),
      avgDamageDealtPerTurn: getAvgDamagePerTurn(rec, 'dealt'),
      avgDamageReceivedPerTurn: getAvgDamagePerTurn(rec, 'received'),
      topKnight: getTopDamageKnight(rec),
      topKnights: getTopDamageKnights(rec),
      vsDeckRows,
      vsAiRows,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return rows;
}
