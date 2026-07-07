/**
 * Headless test — Exclamation d'Athéna (athena-exclamation)
 * Active gold knight + 2 distinct bench gold knights, each discards 1 energy.
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
  const engine = new GameEngine({ headless: true });
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.pending = null;
  if (ai) {
    engine.gameMode = 'ai-battle';
    engine.aiDifficulty = 'expert';
  }
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

  const def = getCardDef('athena-exclamation');
  if (!def?.effects?.some((e) => e.type === 'athena_exclamation')) {
    fail('athena-exclamation card missing athena_exclamation effect');
  } else {
    ok('card id athena-exclamation found in objets.json');
  }

  const engine = setupEngine();
  const p0 = engine.state.players[0];
  fillThreeGoldWithBench(p0);

  if (!engine.effects.canActivateAthenaExclamation(0)) {
    fail('should be activatable with active gold + 2 bench gold with energy');
  }
  ok('eligibility: active gold + 2 bench gold with energy');

  const activeEnergyBefore = p0.active.energies.length;
  const played = await engine.playSupporterCard(0, 0, 'active');
  if (!played) fail('play should succeed with active + 2 bench gold');
  if (engine.state.pending) {
    fail(`expected auto-resolve with exactly 2 bench gold, got pending ${engine.state.pending?.type}`);
  }
  if (p0.modifiers.athenaExclamationDamage !== 250) {
    fail(`expected 250 end-turn damage, got ${p0.modifiers.athenaExclamationDamage}`);
  }
  if (p0.active.energies.length !== activeEnergyBefore - 1) {
    fail('active gold knight should have discarded 1 energy');
  }
  ok('auto-resolves when exactly 2 bench gold knights; active always participates');

  const enginePick = setupEngine();
  const pPick = enginePick.state.players[0];
  pPick.active = makeKnight('aior-du-lion', 'pick-active');
  pPick.bench = [
    makeKnight('milo-du-scorpion', 'pick-bench-1'),
    makeKnight('shakka', 'pick-bench-2'),
    makeKnight('saga-des-gemeaux', 'pick-bench-3'),
  ];
  pPick.hand = [{ cardId: 'athena-exclamation', instanceId: 'ath-pick' }];
  await enginePick.playSupporterCard(0, 0, 'active');
  if (enginePick.state.pending?.type !== 'athenaExclamationPickBench') {
    fail(`expected athenaExclamationPickBench pending, got ${enginePick.state.pending?.type ?? 'none'}`);
  } else {
    ok('opens bench pick when more than 2 eligible bench gold knights');
  }

  if (!enginePick.resolveAthenaExclamationPickBench(0, 'pick-bench-1')) {
    fail('first bench pick should succeed');
  }
  if (enginePick.resolveAthenaExclamationPickBench(0, 'pick-bench-1')) {
    fail('duplicate bench knight pick should be rejected');
  }
  if (!enginePick.resolveAthenaExclamationPickBench(0, 'pick-bench-2')) {
    fail('second bench pick should complete effect');
  }
  if (enginePick.state.pending) fail('pending should clear after 2 bench picks');
  if (pPick.modifiers.athenaExclamationDamage !== 250) {
    fail('bench pick flow should set end-turn damage');
  }
  ok('bench pick flow rejects duplicate knights and completes with active + 2 bench');

  const engine2 = setupEngine();
  const p2 = engine2.state.players[0];
  p2.active = makeKnight('aior-du-lion', 'g2-active');
  p2.bench = [makeKnight('milo-du-scorpion', 'g2-bench')];
  p2.hand = [{ cardId: 'athena-exclamation', instanceId: 'ath2' }];
  const blocked = await engine2.playSupporterCard(0, 0, 'active');
  if (blocked) fail('play should be blocked with only 1 bench gold knight');
  ok('rejects play with fewer than 2 bench gold knights');

  const engineBronze = setupEngine();
  const pBronze = engineBronze.state.players[0];
  pBronze.active = makeKnight('seiya-de-pegase', 'bronze-active');
  pBronze.bench = [
    makeKnight('milo-du-scorpion', 'bronze-b1'),
    makeKnight('shakka', 'bronze-b2'),
  ];
  pBronze.hand = [{ cardId: 'athena-exclamation', instanceId: 'ath-bronze' }];
  if (engineBronze.effects.canActivateAthenaExclamation(0)) {
    fail('should reject when active is not gold');
  }
  ok('rejects when active is not a gold knight');

  const engine4 = setupEngine({ ai: true });
  fillThreeGoldWithBench(engine4.state.players[0]);
  engine4.effects.resolveAthenaExclamation(0, { endTurnDamage: 250, requiredBenchGold: 2 });
  if (engine4.state.pending) fail('AI should not leave pending with exactly 2 bench gold');
  if (engine4.state.players[0].modifiers.athenaExclamationDamage !== 250) {
    fail('AI should set end-turn damage');
  }
  ok('AI resolves without pending');

  if (failed) process.exit(1);
  console.log('\nAll Athena Exclamation tests passed.');
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
