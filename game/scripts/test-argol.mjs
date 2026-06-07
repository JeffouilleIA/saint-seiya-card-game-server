/**
 * Argol de Persée — Pétrifié : exclusion des échanges forcés par pouvoir adverse.
 * node scripts/test-argol.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, 'data', rel), 'utf8'));
}

globalThis.fetch = (url) => {
  const rel = String(url).replace(/^\.\/data\//, '');
  try {
    const data = loadJson(rel);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  } catch {
    return Promise.resolve({ ok: false, status: 404 });
  }
};

await loadCards();

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

function fieldKnight(cardId, instanceId = cardId) {
  const def = getCardDef(cardId);
  return {
    instanceId,
    cardInstanceId: instanceId,
    cardId,
    currentHp: def.hp,
    maxHp: def.hp,
    energies: [],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

function setupArgolVsOpponent() {
  const engine = makeEngine();
  const p0 = {
    index: 0,
    name: 'Argol',
    deck: [],
    hand: [],
    discard: [],
    prizes: [],
    prizesTaken: 0,
    active: fieldKnight('argol-de-persee', 'argol-active'),
    bench: [],
    openingMulligans: 0,
    lastAttackName: null,
    playedAttackLastTurn: null,
    modifiers: {},
    koBonusNextTurn: false,
    koBonusThisTurn: false,
    opponentPlayedSupporterLastTurn: false,
    playedAthenaOrDivineChildThisTurn: false,
  };
  const victimActive = fieldKnight('dokko-de-la-balance', 'victim-active');
  const victimBench = fieldKnight('milo-du-scorpion', 'victim-bench');
  const p1 = {
    index: 1,
    name: 'Victime',
    deck: [],
    hand: [],
    discard: [],
    prizes: [],
    prizesTaken: 0,
    active: victimActive,
    bench: [victimBench],
    openingMulligans: 0,
    lastAttackName: null,
    playedAttackLastTurn: null,
    modifiers: {},
    koBonusNextTurn: false,
    koBonusThisTurn: false,
    opponentPlayedSupporterLastTurn: false,
    playedAthenaOrDivineChildThisTurn: false,
  };
  engine.state = {
    phase: 'main',
    turn: 1,
    turnCount: 2,
    firstPlayer: 0,
    winner: null,
    pending: null,
    logBanner: '',
    evolveEligibleAtTurnStart: [[], []],
    players: [p0, p1],
    stadium: null,
  };
  engine.resetTurnActions();
  return { engine, p0, p1, victimActive, victimBench };
}

// Échange volontaire pendant le tour adverse → Pétrifié (KO)
{
  const { engine, p1, victimActive } = setupArgolVsOpponent();
  const hpBefore = victimActive.currentHp;
  engine.switchActiveWithBench(1, 0);
  const onBench = p1.bench.find((k) => k.instanceId === victimActive.instanceId);
  assert('voluntary swap petrifies leaving active', !onBench || onBench.currentHp === 0);
  assert('voluntary swap dealt full damage', hpBefore > 0);
}

// God Breath / swap_opponent_active : échange forcé tour attaquant → pas de Pétrifié
{
  const { engine, p1, victimActive } = setupArgolVsOpponent();
  engine.state.turn = 0;
  const hpBefore = victimActive.currentHp;
  engine.swapOpponentActiveWithBench(1, 0);
  const onBench = p1.bench.find((k) => k.instanceId === victimActive.instanceId);
  assert('forced opponent swap does not petrify', onBench && onBench.currentHp === hpBefore);
  assert('forced swap marks bench flag', engine.knightMovedToBenchByOpponentPower(onBench));
}

// Flag actif : checkArgolPetrify ignoré même si c'est le tour de la victime
{
  const { engine, victimActive } = setupArgolVsOpponent();
  engine.markKnightMovedToBenchByOpponentPower(victimActive, 0);
  const hpBefore = victimActive.currentHp;
  engine.checkArgolPetrify(1, victimActive);
  assert('flag blocks petrify on victim turn', victimActive.currentHp === hpBefore);
  assert('flag cleared after argol check', !engine.knightMovedToBenchByOpponentPower(victimActive));
}

// Devenir actif efface le flag (échange ultérieur volontaire possible)
{
  const { engine, p1, victimActive, victimBench } = setupArgolVsOpponent();
  engine.state.turn = 0;
  engine.swapOpponentActiveWithBench(1, 0);
  const forcedToBench = p1.bench.find((k) => k.instanceId === victimActive.instanceId);
  assert('forced knight flagged on bench', engine.knightMovedToBenchByOpponentPower(forcedToBench));

  engine.state.turn = 1;
  engine.switchActiveWithBench(1, p1.bench.findIndex((k) => k.instanceId === victimActive.instanceId));
  const backOnBench = p1.bench.find((k) => k.instanceId === victimBench.instanceId);
  assert('later voluntary swap petrifies after flag cleared', !backOnBench || backOnBench.currentHp === 0);
}

console.log('OK: test-argol.mjs');
