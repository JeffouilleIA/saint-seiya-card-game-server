/**
 * Simulation headless IA vs IA (mode « IA Battle »).
 */

import { getCardDef } from './cards.js';
import { GameEngine } from './engine.js';
import { createMatchStatsTracker } from './deck-stats.js';
import { RULES } from './rules.js';

const DEFAULT_MAX_STEPS = 25000;
const DEFAULT_MAX_TURNS = 400;
const DEFAULT_TIMEOUT_MS = 120000;

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferWinReason(engine, winnerIndex) {
  if (winnerIndex == null) return null;
  const winner = engine.state.players[winnerIndex];
  if (winner?.prizesTaken >= RULES.prizeCount) {
    return 'prizes';
  }
  return 'no_knights';
}

function topKnightsFromSnapshot(snapshot, limit = 3) {
  const entries = Object.entries(snapshot?.knightDamage || {});
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([cardId, totalDamage]) => ({
    cardId,
    name: getCardDef(cardId)?.name || cardId,
    totalDamage,
  }));
}

/**
 * Lance une partie complète sans UI entre deux decks.
 *
 * @param {object} options
 * @param {[string[], string[]]} options.deckLists — listes de cardId (deckEntryToCardList)
 * @param {[string, string]} [options.deckIds]
 * @param {[string, string]} [options.deckNames]
 * @param {string} [options.aiDifficulty]
 * @param {number} [options.maxSteps]
 * @param {number} [options.maxTurns]
 * @param {number} [options.timeoutMs]
 */
export async function simulateAiBattle({
  deckLists,
  deckIds = ['', ''],
  deckNames = ['Deck A', 'Deck B'],
  aiDifficulty = 'moyen',
  maxSteps = DEFAULT_MAX_STEPS,
  maxTurns = DEFAULT_MAX_TURNS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const startedAt = Date.now();
  const engine = new GameEngine({
    gameMode: 'ai-battle',
    aiDifficulty,
    headless: true,
    onFeedback: () => {},
    onStateChange: () => {},
    onAnimation: () => {},
  });

  engine.matchStats = createMatchStatsTracker({
    gameMode: 'ai-battle',
    deckIds,
    aiDifficulty,
  });

  engine.reset({ deckLists, gameMode: 'ai-battle', aiDifficulty, headless: true });
  engine.state.players[0].name = deckNames[0] || 'Deck A';
  engine.state.players[1].name = deckNames[1] || 'Deck B';

  engine.startGame();

  let steps = 0;
  let stalled = 0;
  let lastSignature = '';
  let stuckPendingType = null;

  const waitEngineIdle = async () => {
    await engine._aiWaitForDrawEffects();
    await engine._aiWaitForScheduled();
  };

  while (
    !engine.state.winner &&
    steps < maxSteps &&
    (engine.state.turnCount || 0) < maxTurns &&
    Date.now() - startedAt < timeoutMs
  ) {
    await waitEngineIdle();

    const signature = JSON.stringify({
      phase: engine.state.phase,
      turn: engine.state.turn,
      turnCount: engine.state.turnCount,
      pending: engine.state.pending?.type,
      pendingPi: engine.state.pending?.playerIndex ?? engine.state.pending?.chooserPlayerIndex,
      winner: engine.state.winner,
    });

    if (signature === lastSignature) {
      stalled += 1;
      if (stalled > 120) {
        stuckPendingType = engine.state.pending?.type ?? null;
        break;
      }
    } else {
      stalled = 0;
      lastSignature = signature;
    }

    if (engine.state.phase === 'chooseActive' && engine.state.pending) {
      engine.aiChooseActiveFor(engine.state.pending.playerIndex);
      steps += 1;
      await delay(0);
      continue;
    }

    if (engine.state.pending) {
      const actor =
        engine.state.pending.type === 'promoteActive'
          ? engine.state.pending.playerIndex
          : engine.state.pending.chooserPlayerIndex ?? engine.state.pending.playerIndex;
      const pendingAi = actor != null && engine.isAiControlled(actor);
      if (!pendingAi) {
        stuckPendingType = engine.state.pending.type;
        break;
      }
      if (!engine.resolveAnyAiPending()) {
        stuckPendingType = engine.state.pending?.type ?? null;
        break;
      }
      steps += 1;
      await delay(0);
      continue;
    }

    if (engine.state.phase !== 'main') {
      steps += 1;
      await delay(0);
      continue;
    }

    const pi = engine.state.turn;
    if (engine.isAiControlled(pi)) {
      await engine.aiTurn();
      await waitEngineIdle();
    }

    steps += 1;
    await delay(0);
  }

  const elapsedMs = Date.now() - startedAt;
  const snapshots = engine.matchStats?.finalize(engine.state.turnCount || 0) || [];
  const winnerIndex = engine.state.winner;
  const timedOut = !winnerIndex && Date.now() - startedAt >= timeoutMs;
  const maxStepsReached = !winnerIndex && steps >= maxSteps;
  const maxTurnsReached = !winnerIndex && (engine.state.turnCount || 0) >= maxTurns;

  let status = 'completed';
  if (winnerIndex != null) status = 'completed';
  else if (timedOut) status = 'timeout';
  else if (maxStepsReached) status = 'max_steps';
  else if (maxTurnsReached) status = 'max_turns';
  else if (engine.state.pending) status = 'stuck';
  else status = 'incomplete';

  const perDeck = snapshots.map((snap, i) => ({
    playerIndex: i,
    deckId: deckIds[i] || snap.deckId,
    name: deckNames[i] || engine.state.players[i]?.name || `Deck ${i + 1}`,
    damageDealt: snap.damageDealt,
    damageReceived: snap.damageReceived,
    knockOutsDealt: snap.knockOutsDealt,
    knockOutsReceived: snap.knockOutsReceived,
    firstKoDealtTurn: snap.firstKoDealtTurn,
    firstKoReceivedTurn: snap.firstKoReceivedTurn,
    turnsAsAttacker: snap.turnsAsAttacker,
    turnsAsDefender: snap.turnsAsDefender,
    prizesTaken: engine.state.players[i]?.prizesTaken ?? 0,
    prizesRemaining: engine.state.players[i]?.prizes?.length ?? 0,
    topKnights: topKnightsFromSnapshot(snap),
  }));

  return {
    status,
    winnerIndex,
    winnerName: winnerIndex != null ? engine.state.players[winnerIndex]?.name : null,
    winReason: inferWinReason(engine, winnerIndex),
    turnCount: engine.state.turnCount || 0,
    steps,
    elapsedMs,
    aiDifficulty,
    deckIds,
    deckNames: [engine.state.players[0]?.name, engine.state.players[1]?.name],
    perDeck,
    logBanner: engine.state.logBanner || '',
    stuckPendingType,
  };
}

export function formatAiBattleStatus(status) {
  switch (status) {
    case 'completed':
      return 'Terminée';
    case 'timeout':
      return 'Interrompue (délai dépassé)';
    case 'max_steps':
      return 'Interrompue (limite d\'actions)';
    case 'max_turns':
      return 'Interrompue (limite de tours)';
    case 'stuck':
      return 'Interrompue (decision IA manquante)';
    default:
      return 'Incomplète';
  }
}

export function formatWinReason(reason) {
  if (reason === 'prizes') return 'Toutes les récompenses prises';
  if (reason === 'no_knights') return 'Plus de chevalier adverse en jeu';
  return '—';
}
