/**
 * Headless test — Exclamation d'Athéna (athena-exclamation)
 * Exactly 3 distinct gold knights, each discards 1 energy, at least 1 on bench.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCardDef, loadCards } from '../cards.js';
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

function makeKnight(cardId, instanceId, energies = 1) {
  const def = getCardDef(cardId);
  const hp = def?.hp ?? 200;
  const energyCards = [];
  for (let i = 0; i < energies; i++) {
    energyCards.push({ cardId: 'energie-commune', instanceId: `${instanceId}-e${i}` });
  }
  return {
    instanceId,
    cardInstanceId: `ci-${instanceId}`,
    cardId,
    currentHp: hp,
    maxHp: hp,
    energies: energyCards,
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
  };
}

let failed = false;

function fail(msg) {
  console.error('FAIL:', msg);
  failed = true;
}

function ok(msg) {
  console.log('PASS:', msg);
}

function setupEngine({ ai = false } = {}) {
  const engine = new GameEngine({ headless: true, gameMode: ai ? 'ai-battle' : 'local2p' });
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.pending = null;
  engine.resetTurnActions();
  return engine;
}

function fillThreeGoldWithBench(p0) {
  p0.active = makeKnight('aior-du-lion', 'gold-active');
  p0.bench = [
    makeKnight('milo-du-scorpion', 'gold-bench-1'),
    makeKnight('shakka', 'gold-bench-2'),
  ];
  p0.hand = [{ cardId: 'athena-exclamation', instanceId: 'ath-hand' }];
}

async function runTest() {
  await loadCards();

  const engine = setupEngine();
  const p0 = engine.state.players[0];
  fillThreeGoldWithBench(p0);

  if (!engine.effects.canActivateAthenaExclamation(0)) {
    fail('should be activatable with 3 gold knights including bench');
  } else {
    ok('eligibility: 3 gold knights with energy and bench');
  }

  const played = await engine.playSupporterCard(0, 0, 'active');
  if (!played) fail('play should succeed with 3 gold knights');
  if (engine.state.pending?.type !== 'athenaExclamationPick') {
    fail(`expected athenaExclamationPick pending, got ${engine.state.pending?.type ?? 'none'}`);
  } else {
    ok('human play opens athenaExclamationPick pending');
  }

  const pending = engine.state.pending;
  const activeOpt = pending.options.find((o) => o.target === 'active');
  const bench1 = pending.options.find((o) => o.instanceId === 'gold-bench-1');
  const bench2 = pending.options.find((o) => o.instanceId === 'gold-bench-2');

  if (!engine.resolveAthenaExclamationPick(0, activeOpt.instanceId)) {
    fail('first pick (active) should succeed');
  }
  if (!engine.resolveAthenaExclamationPick(0, bench1.instanceId)) {
    fail('second pick (bench) should succeed');
  }
  if (engine.resolveAthenaExclamationPick(0, bench1.instanceId)) {
    fail('duplicate knight pick should be rejected');
  }

  const beforeEnergy = p0.bench.find((k) => k.instanceId === 'gold-bench-2')?.energies?.length ?? 0;
  if (!engine.resolveAthenaExclamationPick(0, bench2.instanceId)) {
    fail('third pick should complete effect');
  }
  if (engine.state.pending) fail('pending should clear after 3 picks');
  if (p0.modifiers.athenaExclamationDamage !== 250) {
    fail(`expected 250 end-turn damage, got ${p0.modifiers.athenaExclamationDamage}`);
  }
  const afterEnergy = p0.bench.find((k) => k.instanceId === 'gold-bench-2')?.energies?.length ?? 0;
  if (afterEnergy !== beforeEnergy - 1) fail('third knight should have discarded 1 energy');
  ok('3 distinct picks discard energy and set end-turn damage');

  const engine2 = setupEngine();
  const p2 = engine2.state.players[0];
  p2.active = makeKnight('aior-du-lion', 'g2-active');
  p2.bench = [makeKnight('milo-du-scorpion', 'g2-bench')];
  p2.hand = [{ cardId: 'athena-exclamation', instanceId: 'ath2' }];
  const blocked = await engine2.playSupporterCard(0, 0, 'active');
  if (blocked) fail('play should be blocked with only 2 gold knights');
  else ok('rejects play with fewer than 3 gold knights');

  const engine3 = setupEngine();
  const p3 = engine3.state.players[0];
  p3.active = makeKnight('aior-du-lion', 'g3-a');
  p3.active.energies = [];
  p3.bench = [
    makeKnight('milo-du-scorpion', 'g3-b1', 0),
    makeKnight('shakka', 'g3-b2', 0),
  ];
  if (engine3.effects.canActivateAthenaExclamation(0)) {
    fail('should reject when fewer than 3 gold knights have energy');
  } else {
    ok('rejects when fewer than 3 gold knights have energy');
  }

  const engineBenchOnly = setupEngine();
  const pBench = engineBenchOnly.state.players[0];
  pBench.active = makeKnight('seiya-de-pegase', 'bronze-active');
  pBench.bench = [
    makeKnight('milo-du-scorpion', 'bench-only-1'),
    makeKnight('shakka', 'bench-only-2'),
    makeKnight('saga-des-gemeaux', 'bench-only-3'),
  ];
  if (!engineBenchOnly.effects.canActivateAthenaExclamation(0)) {
    fail('3 bench gold knights should be enough without active gold');
  } else {
    ok('3 bench gold knights valid without active gold knight');
  }

  const engine4 = setupEngine({ ai: true });
  fillThreeGoldWithBench(engine4.state.players[0]);
  engine4.effects.resolveAthenaExclamation(0, { endTurnDamage: 250, requiredKnights: 3 });
  if (engine4.state.pending) fail('AI should not leave pending');
  if (engine4.state.players[0].modifiers.athenaExclamationDamage !== 250) {
    fail('AI should set end-turn damage');
  } else {
    ok('AI resolves without pending');
  }

  if (failed) process.exit(1);
  console.log('\nAll Athena Exclamation tests passed.');
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
