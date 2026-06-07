/**
 * Headless — IA utilise Mort (Thanatos) sur le bon chevalier de banc.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
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

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
