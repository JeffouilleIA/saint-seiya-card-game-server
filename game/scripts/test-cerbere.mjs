/**
 * Headless smoke test — Cerbère (supporter_cerbere) bonus_degats_banc
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE } from '../cards.js';
import { GameEngine } from '../engine.js';
import { getCardDef } from '../cards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function initCards() {
  const raw = [
    ...loadJson('cards.json'),
    ...loadJson('cards-argent.json'),
    ...(loadJson('cards-bronze-mineur.json') || []),
    ...loadJson('cards-or.json'),
    ...(loadJson('cards-asgard.json') || []),
    ...(loadJson('cards-divin.json') || []),
    ...(loadJson('cards-hades.json') || []),
    ...loadJson('objets.json'),
    ...(loadJson('test-dummies.json') || []),
  ];
  for (const c of raw) {
    const id = c.id;
    if (id) CARD_DATABASE[id] = c;
  }
}

function makeKnight(cardId, hp = 200) {
  return {
    instanceId: `k-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp: hp,
    maxHp: hp,
    energies: [{ cardId: 'energie-commune', instanceId: 'e1' }],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCerbereAfterAttack(engine, maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const actor = engine._pendingActorIndex?.() ?? engine.state.pending?.playerIndex;
    if (actor != null && engine.resolveAiPendingFor(actor)) {
      await sleep(10);
      continue;
    }
    await engine._aiWaitForCombatIdle?.();
    const p0 = engine.state.players[0];
    if (!p0.modifiers.nextAttackBenchBonus && !engine.state.pending) return;
    await sleep(20);
  }
}

function totalFieldHp(player) {
  let sum = player.active?.currentHp ?? 0;
  for (const k of player.bench) sum += k?.currentHp ?? 0;
  return sum;
}

async function setupCerbereScenario(engine) {
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight('marine-aigle', 300);
  p0.bench = [];
  p1.active = makeKnight('test_dummy_active', 500);
  p1.bench = [
    makeKnight('test_dummy_bench_1', 150),
    makeKnight('test_dummy_bench_2', 120),
  ];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 2;
  engine.state.pending = null;
  engine.resetTurnActions();
  await engine.effects.resolveObjetEffects(0, getCardDef('supporter_cerbere'), 'active');
  if (!p0.modifiers.nextAttackBenchBonus) {
    throw new Error('nextAttackBenchBonus not set after playing Cerbère');
  }
  return { p0, p1 };
}

async function runTest() {
  initCards();
  const cerbereDef = getCardDef('supporter_cerbere');
  if (!cerbereDef?.effects?.some((e) => e.type === 'bonus_degats_banc')) {
    throw new Error('supporter_cerbere missing bonus_degats_banc effect');
  }

  // Human player 0 — should create cerbereBenchBonus pending
  {
    const engine = new GameEngine({ headless: true, gameMode: 'ai' });
    engine.reset({ gameMode: 'ai', headless: true });
    const { p1 } = await setupCerbereScenario(engine);
    const benchHpBefore = p1.bench.map((k) => k.currentHp);
    const attacks = engine.getAttackOptions(0).filter((a) => a.canUse);
    if (!attacks.length) throw new Error('No usable attack (human test)');
    engine.attack(0, attacks[0].index);
    await engine._aiWaitForCombatIdle?.();
    await sleep(100);
    if (engine.state.pending?.type !== 'cerbereBenchBonus') {
      throw new Error(
        `Human attack should open cerbereBenchBonus pending, got ${engine.state.pending?.type ?? 'none'}`,
      );
    }
    const opt = engine.state.pending.options[0];
    const ok = engine.resolveCerbereBenchBonusPick(0, opt.instanceId);
    if (!ok) throw new Error('resolveCerbereBenchBonusPick returned false');
    const totalDmg = benchHpBefore.reduce(
      (s, hp, i) => s + (hp - p1.bench[i].currentHp),
      0,
    );
    if (totalDmg < 30) {
      throw new Error(
        `Human pick did not apply 30 dmg (got ${totalDmg}); bench before=${benchHpBefore.join()} after=${p1.bench.map((k) => k.currentHp).join()} opt=${JSON.stringify(opt)}`,
      );
    }
    console.log('PASS: human cerbereBenchBonus pending + pick');
  }

  // Human — up to 3 distinct bench targets
  {
    const engine = new GameEngine({ headless: true, gameMode: 'ai' });
    engine.reset({ gameMode: 'ai', headless: true });
    const { p1 } = await setupCerbereScenario(engine);
    p1.bench.push(makeKnight('test_dummy_bench_3', 100));
    const benchHpBefore = p1.bench.map((k) => k.currentHp);
    const attacks = engine.getAttackOptions(0).filter((a) => a.canUse);
    engine.attack(0, attacks[0].index);
    await engine._aiWaitForCombatIdle?.();
    await sleep(100);
    if (engine.state.pending?.type !== 'cerbereBenchBonus') {
      throw new Error('Expected cerbereBenchBonus for 3-pick test');
    }
    const opts = engine.state.pending.options;
    if (opts.length < 3) throw new Error(`Need 3 bench targets, got ${opts.length}`);
    for (let i = 0; i < 3; i++) {
      const ok = engine.resolveCerbereBenchBonusPick(0, opts[i].instanceId);
      if (!ok) throw new Error(`Pick ${i + 1}/3 failed`);
    }
    if (engine.state.pending) throw new Error('Pending should clear after 3 picks');
    const totalDmg = benchHpBefore.reduce(
      (s, hp, i) => s + (hp - p1.bench[i].currentHp),
      0,
    );
    if (totalDmg < 90) {
      throw new Error(`Expected 90 bench dmg from 3 picks, got ${totalDmg}`);
    }
    console.log('PASS: human 3 cerbere bench picks', totalDmg);
  }

  // AI auto-pick
  {
    const engine = new GameEngine({ headless: true, gameMode: 'ai-battle' });
    engine.reset({ gameMode: 'ai-battle', headless: true });
    const { p0, p1 } = await setupCerbereScenario(engine);
    const benchHpBefore = p1.bench.map((k) => k.currentHp);
    const attacks = engine.getAttackOptions(0).filter((a) => a.canUse);
    engine.attack(0, attacks[0].index);
    await waitForCerbereAfterAttack(engine);
    const totalDmg = benchHpBefore.reduce(
      (s, hp, i) => s + (hp - p1.bench[i].currentHp),
      0,
    );
    if (totalDmg <= 0) throw new Error(`AI Cerbère bench damage not applied (total=${totalDmg})`);
    if (p0.modifiers.nextAttackBenchBonus) {
      throw new Error('nextAttackBenchBonus should be cleared after attack');
    }
    console.log('PASS: AI auto-pick bench damage', totalDmg);
  }

  // KO opponent active — Cerbère must still apply after promoteActive
  {
    const engine = new GameEngine({ headless: true, gameMode: 'ai-battle' });
    engine.reset({ gameMode: 'ai-battle', headless: true });
    const { p0, p1 } = await setupCerbereScenario(engine);
    p1.active.currentHp = 10;
    const oppHpBefore = totalFieldHp(p1);
    const attacks = engine.getAttackOptions(0).filter((a) => a.canUse);
    engine.attack(0, attacks[0].index);
    await waitForCerbereAfterAttack(engine);
    const oppHpAfter = totalFieldHp(p1);
    const totalDmg = oppHpBefore - oppHpAfter;
    if (p0.modifiers.nextAttackBenchBonus) {
      throw new Error('Cerbère modifier still active after KO attack flow');
    }
    if (totalDmg < 30) {
      throw new Error(`Cerbère not applied after KO attack (field dmg ${totalDmg}, expected >=30)`);
    }
    console.log('PASS: Cerbère after KO promote', totalDmg);
  }
}

runTest().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
