/**
 * Mode « Combat des 1000 Jours » — draft snake, sélection secrète, série de manches 2 joueurs
 */

import { getDeckById } from './decks.js';

export const COMBAT_1000_HISTORY_KEY = 'chevalier-combat-1000-jours-history';
export const MIN_DECKS_PER_PLAYER = 1;
export const MAX_DECKS_PER_PLAYER = 7;

/** @typedef {object} Combat1000Run
 * @property {string} player1Name
 * @property {string} player2Name
 * @property {number} decksPerPlayer
 * @property {string[]} availableDeckIds
 * @property {string[]} pickedDeckIds
 * @property {string[]} player1DeckIds
 * @property {string[]} player2DeckIds
 * @property {number} draftTurnIndex
 * @property {number} draftPicksThisTurn
 * @property {string[]} player1UsedDeckIds
 * @property {string[]} player2UsedDeckIds
 * @property {number} player1Wins
 * @property {number} player2Wins
 * @property {number} roundNumber
 * @property {string | null} matchPlayer1DeckId
 * @property {string | null} matchPlayer2DeckId
 * @property {'pass-p1' | 'pick-p1' | 'pass-p2' | 'pick-p2' | 'vs' | null} secretPhase
 */

/** @typedef {{ date: string, player1Name: string, player2Name: string, decksPerPlayer: number, player1Wins: number, player2Wins: number, winnerIndex: number | null, winnerName: string }} Combat1000HistoryEntry */

/** @type {Combat1000Run | null} */
let activeRun = null;

export function getActiveCombat1000Run() {
  return activeRun;
}

/** @param {Combat1000Run | null} run */
export function setActiveCombat1000Run(run) {
  activeRun = run;
}

export function clearActiveCombat1000Run() {
  activeRun = null;
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** @param {number} turnIndex */
export function getDraftPickQuota(turnIndex) {
  return turnIndex === 0 ? 1 : 2;
}

/** @param {number} turnIndex */
export function getDraftPlayerIndex(turnIndex) {
  if (turnIndex === 0) return 0;
  return turnIndex % 2 === 1 ? 1 : 0;
}

/** @param {Combat1000Run} run */
export function playerRoster(run, playerIndex) {
  return playerIndex === 0 ? run.player1DeckIds : run.player2DeckIds;
}

/** @param {Combat1000Run} run */
export function playerUsedRoster(run, playerIndex) {
  return playerIndex === 0 ? run.player1UsedDeckIds : run.player2UsedDeckIds;
}

/** @param {Combat1000Run} run */
export function playerWins(run, playerIndex) {
  return playerIndex === 0 ? run.player1Wins : run.player2Wins;
}

/** @param {Combat1000Run} run */
export function isDraftComplete(run) {
  return (
    run.player1DeckIds.length >= run.decksPerPlayer &&
    run.player2DeckIds.length >= run.decksPerPlayer
  );
}

/** @param {Combat1000Run} run */
function decksNeededForPlayer(run, playerIndex) {
  const roster = playerRoster(run, playerIndex);
  return Math.max(0, run.decksPerPlayer - roster.length);
}

/** @param {Combat1000Run} run */
function skipFullDraftTurns(run) {
  while (!isDraftComplete(run)) {
    const player = getDraftPlayerIndex(run.draftTurnIndex);
    if (decksNeededForPlayer(run, player) > 0) break;
    run.draftTurnIndex += 1;
    run.draftPicksThisTurn = 0;
  }
}

/**
 * @param {Combat1000Run} run
 * @returns {{ playerIndex: number, picksRemainingThisTurn: number, turnQuota: number, playerName: string } | null}
 */
export function getDraftTurnInfo(run) {
  if (isDraftComplete(run)) return null;
  skipFullDraftTurns(run);
  if (isDraftComplete(run)) return null;

  const playerIndex = getDraftPlayerIndex(run.draftTurnIndex);
  const needed = decksNeededForPlayer(run, playerIndex);
  const turnQuota = Math.min(getDraftPickQuota(run.draftTurnIndex), needed);
  const picksRemainingThisTurn = Math.max(0, turnQuota - run.draftPicksThisTurn);
  const playerName = playerIndex === 0 ? run.player1Name : run.player2Name;

  return { playerIndex, picksRemainingThisTurn, turnQuota, playerName };
}

/**
 * @param {{ player1Name: string, player2Name: string, decksPerPlayer: number, availableDeckIds: string[] }} opts
 * @returns {Combat1000Run}
 */
export function createCombat1000Run({ player1Name, player2Name, decksPerPlayer, availableDeckIds }) {
  return {
    player1Name: String(player1Name || 'Joueur 1').trim().slice(0, 24) || 'Joueur 1',
    player2Name: String(player2Name || 'Joueur 2').trim().slice(0, 24) || 'Joueur 2',
    decksPerPlayer,
    availableDeckIds: [...availableDeckIds],
    pickedDeckIds: [],
    player1DeckIds: [],
    player2DeckIds: [],
    draftTurnIndex: 0,
    draftPicksThisTurn: 0,
    player1UsedDeckIds: [],
    player2UsedDeckIds: [],
    player1Wins: 0,
    player2Wins: 0,
    roundNumber: 0,
    matchPlayer1DeckId: null,
    matchPlayer2DeckId: null,
    secretPhase: null,
  };
}

/** @param {number} decksPerPlayer */
export function minDecksRequiredForCombat(decksPerPlayer) {
  return Math.max(2, decksPerPlayer * 2);
}

/**
 * @param {Combat1000Run} run
 * @param {string} deckId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function applyDraftPick(run, deckId) {
  const info = getDraftTurnInfo(run);
  if (!info) return { ok: false, error: 'Le draft est terminé.' };
  if (!deckId || !run.availableDeckIds.includes(deckId)) {
    return { ok: false, error: 'Ce deck n\'est plus disponible.' };
  }

  const roster = playerRoster(run, info.playerIndex);
  roster.push(deckId);
  run.pickedDeckIds.push(deckId);
  run.availableDeckIds = run.availableDeckIds.filter((id) => id !== deckId);
  run.draftPicksThisTurn += 1;

  const neededAfter = decksNeededForPlayer(run, info.playerIndex);
  const turnDone =
    run.draftPicksThisTurn >= info.turnQuota || neededAfter <= 0;

  if (turnDone) {
    run.draftTurnIndex += 1;
    run.draftPicksThisTurn = 0;
    skipFullDraftTurns(run);
  }

  return { ok: true };
}

/** @param {Combat1000Run} run */
export function beginSecretPickPhase(run) {
  run.matchPlayer1DeckId = null;
  run.matchPlayer2DeckId = null;
  run.secretPhase = 'pass-p1';
}

/** @param {Combat1000Run} run */
export function getUnusedDeckIds(run, playerIndex) {
  const roster = playerRoster(run, playerIndex);
  const used = new Set(playerUsedRoster(run, playerIndex));
  return roster.filter((id) => !used.has(id));
}

/** @param {Combat1000Run} run */
export function bothPlayersHaveUnusedDecks(run) {
  return getUnusedDeckIds(run, 0).length > 0 && getUnusedDeckIds(run, 1).length > 0;
}

/** @param {Combat1000Run} run */
export function advanceSecretPhase(run) {
  if (run.secretPhase === 'pass-p1') {
    run.secretPhase = 'pick-p1';
    return;
  }
  if (run.secretPhase === 'pick-p1' && run.matchPlayer1DeckId) {
    run.secretPhase = 'pass-p2';
    return;
  }
  if (run.secretPhase === 'pass-p2') {
    run.secretPhase = 'pick-p2';
    return;
  }
  if (run.secretPhase === 'pick-p2' && run.matchPlayer2DeckId) {
    run.secretPhase = 'vs';
  }
}

/**
 * @param {Combat1000Run} run
 * @param {number} playerIndex
 * @param {string} deckId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function applySecretPick(run, playerIndex, deckId) {
  const unused = getUnusedDeckIds(run, playerIndex);
  if (!unused.includes(deckId)) {
    return { ok: false, error: 'Ce deck a déjà été joué ou n\'appartient pas à ce joueur.' };
  }
  if (playerIndex === 0) {
    if (run.secretPhase !== 'pick-p1') return { ok: false, error: 'Ce n\'est pas au tour du joueur 1.' };
    run.matchPlayer1DeckId = deckId;
    run.secretPhase = 'pass-p2';
  } else {
    if (run.secretPhase !== 'pick-p2') return { ok: false, error: 'Ce n\'est pas au tour du joueur 2.' };
    run.matchPlayer2DeckId = deckId;
    run.secretPhase = 'vs';
  }
  return { ok: true };
}

/** @param {Combat1000Run} run */
export function getMatchDeckNames(run) {
  const p1 = getDeckById(run.matchPlayer1DeckId);
  const p2 = getDeckById(run.matchPlayer2DeckId);
  return {
    player1DeckName: p1?.name || 'Deck 1',
    player2DeckName: p2?.name || 'Deck 2',
  };
}

/**
 * @param {Combat1000Run} run
 * @param {number} winnerIndex — 0 = joueur 1, 1 = joueur 2
 */
export function recordCombat1000RoundResult(run, winnerIndex) {
  if (run.matchPlayer1DeckId) {
    run.player1UsedDeckIds.push(run.matchPlayer1DeckId);
  }
  if (run.matchPlayer2DeckId) {
    run.player2UsedDeckIds.push(run.matchPlayer2DeckId);
  }
  if (winnerIndex === 0) run.player1Wins += 1;
  else if (winnerIndex === 1) run.player2Wins += 1;
  run.roundNumber += 1;
  run.matchPlayer1DeckId = null;
  run.matchPlayer2DeckId = null;
  run.secretPhase = null;
}

/** @param {Combat1000Run} run */
export function getCombat1000Winner(run) {
  if (run.player1Wins === run.player2Wins) {
    return { winnerIndex: null, winnerName: 'Égalité' };
  }
  if (run.player1Wins > run.player2Wins) {
    return { winnerIndex: 0, winnerName: run.player1Name };
  }
  return { winnerIndex: 1, winnerName: run.player2Name };
}

/** @param {unknown} entries */
function normalizeHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && typeof e.player1Name === 'string')
    .map((e) => ({
      date: typeof e.date === 'string' ? e.date : '',
      player1Name: String(e.player1Name).trim().slice(0, 24) || 'Joueur 1',
      player2Name: String(e.player2Name).trim().slice(0, 24) || 'Joueur 2',
      decksPerPlayer: Math.max(MIN_DECKS_PER_PLAYER, Math.min(MAX_DECKS_PER_PLAYER, Number(e.decksPerPlayer) || 1)),
      player1Wins: Math.max(0, Number(e.player1Wins) || 0),
      player2Wins: Math.max(0, Number(e.player2Wins) || 0),
      winnerIndex: e.winnerIndex === 0 || e.winnerIndex === 1 ? e.winnerIndex : null,
      winnerName: typeof e.winnerName === 'string' ? e.winnerName.trim().slice(0, 24) : '—',
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** @returns {Combat1000HistoryEntry[]} */
export function loadCombat1000History() {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(COMBAT_1000_HISTORY_KEY) : null;
    return normalizeHistoryEntries(raw ? safeParse(raw) : null);
  } catch {
    return [];
  }
}

/** @param {Combat1000HistoryEntry[]} entries */
function saveCombat1000History(entries) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(COMBAT_1000_HISTORY_KEY, JSON.stringify(entries.slice(0, 100)));
    }
  } catch {
    /* ignore */
  }
}

/** @param {Combat1000Run} run */
export function saveCombat1000ToHistory(run) {
  const { winnerIndex, winnerName } = getCombat1000Winner(run);
  const entry = {
    date: new Date().toISOString(),
    player1Name: run.player1Name,
    player2Name: run.player2Name,
    decksPerPlayer: run.decksPerPlayer,
    player1Wins: run.player1Wins,
    player2Wins: run.player2Wins,
    winnerIndex,
    winnerName,
  };
  const list = loadCombat1000History();
  list.unshift(entry);
  saveCombat1000History(list);
  return entry;
}

export function clearCombat1000History() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(COMBAT_1000_HISTORY_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function formatCombat1000Date(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
