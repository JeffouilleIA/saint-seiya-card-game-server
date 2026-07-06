/**
 * Headless — IA utilise Mort (Thanatos) sur le bon chevalier de banc.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef, getPrizeCountForKnockout } from '../cards.js';
import { GameEngine } from '../engine.js';
import { pickAiTalent, scoreAiTalentOption } from '../ai-expert.js';

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
    if (c.id) CARD_DATABASE[c.id] = c;
  }
}

function makeKnight(cardId, hp) {
  const def = getCardDef(cardId);
  const maxHp = hp ?? def?.hp ?? 200;
  return {
    instanceId: `k-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp: maxHp,
    maxHp,
    energies: [{ cardId: 'energie-commune', instanceId: `e-${Math.random().toString(36).slice(2, 6)}` }],
    statuses: [],
    talentUsed: false,
    modifiers: { talentOnceThisTurn: false },
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
  };
}

function setupThanatosScenario(engine) {
  const thanatosDef = getCardDef('thanatos');
  if (!thanatosDef?.talent?.effects?.some((e) => e.type === 'bench_damage_once_per_turn')) {
    throw new Error('Thanatos missing bench_damage_once_per_turn talent');
  }

  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight('test_dummy_active', 400);
  p0.bench = [];
  p1.active = makeKnight('thanatos', 230);
  p1.bench = [];
  p0.bench = [
    makeKnight('test_dummy_bench_1', 80),
    makeKnight('test_dummy_bench_2', 18),
  ];

  engine.state.phase = 'main';
  engine.state.turn = 1;
  engine.state.turnCount = 2;
  engine.state.pending = null;
  engine.resetTurnActions();
  return { p0, p1 };
}

async function runTest() {
  initCards();

  const engine = new GameEngine({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  engine.reset({ gameMode: 'ai', headless: true, aiDifficulty: 'expert' });
  const { p0 } = setupThanatosScenario(engine);

  const score = scoreAiTalentOption(engine, 1, 'active');
  const pick = pickAiTalent(engine, 1, 'expert');
  if (!pick || pick.zone !== 'active') {
    console.error('FAIL: pickAiTalent should pick Thanatos active', pick);
    process.exit(1);
  }
  if (score < 12) {
    console.error('FAIL: Mort score too low', score);
    process.exit(1);
  }

  const koTarget = p0.bench[1];
  const hpBefore = koTarget.currentHp;
  const ok = engine._aiTryTalent(1);
  if (!ok) {
    console.error('FAIL: _aiTryTalent returned false');
    process.exit(1);
  }

  if (koTarget.currentHp !== hpBefore - 20) {
    console.error(
      'FAIL: expected 20 dmg on lowest-HP bench knight',
      hpBefore,
      '->',
      koTarget.currentHp,
      'bench HPs',
      p0.bench.map((k) => k.currentHp),
    );
    process.exit(1);
  }

  if (!engine.state.players[1].active.talentUsed) {
    console.error('FAIL: Thanatos talentUsed should be true');
    process.exit(1);
  }

  if (engine.state.pending != null) {
    console.error('FAIL: pending should be cleared after AI Mort', engine.state.pending);
    process.exit(1);
  }

  // Tour IA complet : Mort ne doit pas bloquer aiFinishTurn / endTurn
  engine.state.turn = 1;
  engine.state.phase = 'main';
  engine.resetTurnActions();
  engine.state.players[1].active.talentUsed = true;
  await engine.aiFinishTurn();
  if (engine.state.turn !== 0) {
    console.error('FAIL: AI turn should end after Mort (turn should be 0)', engine.state.turn);
    process.exit(1);
  }
  if (engine.state.pending != null) {
    console.error('FAIL: pending after aiFinishTurn', engine.state.pending);
    process.exit(1);
  }

  console.log('PASS: Thanatos Mort — score', score.toFixed(1), 'target HP', hpBefore, '->', koTarget.currentHp);
}

async function runPrizeTests() {
  initCards();
  const expectedPrizes = getPrizeCountForKnockout(getCardDef('test_dummy_bench_2'));

  // AI path — talent damage resolves KO immediately, prizes at end of turn
  {
    const engine = new GameEngine({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
    engine.reset({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
    const { p0, p1 } = setupThanatosScenario(engine);
    const prizesBefore = p1.prizesTaken ?? 0;
    engine._aiTryTalent(1);
    await engine._aiWaitForCombatIdle?.();
    if (p0.bench.length !== 1) {
      console.error('FAIL: AI Mort should KO one bench knight', p0.bench.length);
      process.exit(1);
    }
    if ((p1.modifiers.pendingPrizesAtEndTurn || 0) !== expectedPrizes) {
      console.error(
        'FAIL: AI Mort should defer prizes',
        p1.modifiers.pendingPrizesAtEndTurn,
        'expected',
        expectedPrizes,
      );
      process.exit(1);
    }
    await engine.endTurn();
    await engine._aiWaitForCombatIdle?.();
    if ((p1.prizesTaken ?? 0) !== prizesBefore + expectedPrizes) {
      console.error(
        'FAIL: AI Mort prizes not awarded at endTurn',
        p1.prizesTaken,
        'expected',
        prizesBefore + expectedPrizes,
      );
      process.exit(1);
    }
    console.log('PASS: Thanatos Mort AI — prizes awarded at endTurn');
  }

  // Human pick path — Mort via pickDamageOpponentKnight (local2p)
  {
    const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
    engine.reset({ headless: true, gameMode: 'local2p' });
    const { p0, p1 } = setupThanatosScenario(engine);
    const koTarget = p0.bench[1];
    const prizesBefore = p1.prizesTaken ?? 0;
    engine.state.pending = {
      type: 'pickDamageOpponentKnight',
      playerIndex: 1,
      opponentIndex: 0,
      amount: 20,
      benchOnly: true,
      options: p0.bench.map((k, i) => ({ target: i, instanceId: k.instanceId })),
      fromTalent: { playerIndex: 1, knightInstanceId: p1.active.instanceId },
      sourceLabel: 'Mort (Thanatos)',
    };
    engine.resolvePickDamageOpponentKnight(1, koTarget.instanceId);
    await engine._aiWaitForCombatIdle?.();
    if ((engine._pendingAttackKnockOuts?.length || 0) > 0) {
      console.error('FAIL: Mort pick should not leave pending attack KOs');
      process.exit(1);
    }
    if ((p1.modifiers.pendingPrizesAtEndTurn || 0) !== expectedPrizes) {
      console.error(
        'FAIL: Mort pick should defer prizes',
        p1.modifiers.pendingPrizesAtEndTurn,
        'expected',
        expectedPrizes,
      );
      process.exit(1);
    }
    await engine.endTurn();
    await engine._aiWaitForCombatIdle?.();
    if ((p1.prizesTaken ?? 0) !== prizesBefore + expectedPrizes) {
      console.error(
        'FAIL: Mort pick prizes not awarded at endTurn',
        p1.prizesTaken,
        'expected',
        prizesBefore + expectedPrizes,
      );
      process.exit(1);
    }
    console.log('PASS: Thanatos Mort pick — prizes awarded at endTurn');
  }
}

function runShakkaMortReductionTest() {
  initCards();
  const engine = new GameEngine({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  engine.reset({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  const { p0, p1 } = setupThanatosScenario(engine);
  p0.bench.push(makeKnight('shakka', 70));
  const target = p0.bench[1];
  const hpBefore = target.currentHp;
  engine._aiTryTalent(1);
  if (target.currentHp !== hpBefore) {
    console.error(
      'FAIL: Shakka should reduce Mort to 0 dmg on bench',
      hpBefore,
      '->',
      target.currentHp,
    );
    process.exit(1);
  }
  console.log('PASS: Shakka reduces Thanatos Mort bench damage');
}

function runFairySilenceMortTest() {
  initCards();
  const engine = new GameEngine({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  engine.reset({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  const { p0, p1 } = setupThanatosScenario(engine);
  p0.active = makeKnight('myu_papillon', 90);
  p0.hand = [{ cardId: 'energie-commune', instanceId: 'hand-e-1' }];

  // Per-knight silence on active Thanatos
  p1.active.modifiers.talentSilencedTurns = 2;
  if (!engine.effects.isTalentSilenced(p1.active, 1)) {
    console.error('FAIL: Envoie de Fairy should silence chosen opponent knight talent');
    process.exit(1);
  }
  if (engine.canUseTalentOnKnight(1, p1.active, getCardDef('thanatos').talent)) {
    console.error('FAIL: silenced Thanatos should not be able to use Mort');
    process.exit(1);
  }
  console.log('PASS: Envoie de Fairy silences active Thanatos Mort');
}

function runFairySilenceBenchMortTest() {
  initCards();
  const engine = new GameEngine({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  engine.reset({ headless: true, gameMode: 'ai', aiDifficulty: 'expert' });
  const { p0, p1 } = setupThanatosScenario(engine);
  const benchThanatos = makeKnight('thanatos', 230);
  p1.active = makeKnight('test_dummy_active', 400);
  p1.bench = [benchThanatos, makeKnight('shakka', 70)];
  p0.active = makeKnight('myu_papillon', 90);
  p0.hand = [{ cardId: 'energie-commune', instanceId: 'hand-e-1' }];

  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.useTalent(0, 'active');
  if (engine.state.pending?.type !== 'discardHandSilenceOpponentTalent') {
    console.error('FAIL: Envoie de Fairy should prompt hand discard first');
    process.exit(1);
  }
  engine.resolveDiscardHandSilenceOpponentTalent(0, 0);
  if (engine.state.pending?.type !== 'pickSilenceOpponentKnight') {
    console.error('FAIL: Envoie de Fairy should prompt opponent knight pick');
    process.exit(1);
  }
  const ok = engine.resolvePickSilenceOpponentKnight(0, benchThanatos.instanceId);
  if (!ok) {
    console.error('FAIL: could not resolve bench Thanatos silence pick');
    process.exit(1);
  }
  if (!engine.effects.isTalentSilenced(benchThanatos, 1)) {
    console.error('FAIL: bench Thanatos talent should be silenced');
    process.exit(1);
  }
  if (engine.canUseTalentOnKnight(1, benchThanatos, getCardDef('thanatos').talent)) {
    console.error('FAIL: silenced bench Thanatos should not use Mort');
    process.exit(1);
  }
  console.log('PASS: Envoie de Fairy silences bench Thanatos Mort');
}

runTest()
  .then(() => runPrizeTests())
  .then(() => {
    runShakkaMortReductionTest();
    runFairySilenceMortTest();
    runFairySilenceBenchMortTest();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
