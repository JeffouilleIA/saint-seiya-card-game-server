/**
 * Saphir d'Odin — Guerrier Divin d'Asgard mis K.O. : 3 Récompenses au lieu de 2.
 * node scripts/test-saphir-odin-prize.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, getPrizeCountForKnockout } from '../cards.js';
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

function makeKnight(cardId, hp, extra = {}) {
  const def = getCardDef(cardId);
  const maxHp = hp ?? def?.hp ?? 80;
  return {
    instanceId: extra.instanceId || `k-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp: maxHp,
    maxHp,
    energies: extra.energies || [],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: extra.attachedTool ?? null,
  };
}

async function waitIdle(engine) {
  await engine._aiWaitForCombatIdle?.();
  await new Promise((r) => setTimeout(r, 30));
}

const ASGARD_ID = 'fenril_alioth';
const SAPHIR_ID = 'tool_saphir_odin';
let failed = false;

const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
const ok = (msg) => console.log('OK:', msg);

const asgardDef = getCardDef(ASGARD_ID);
const saphirDef = getCardDef(SAPHIR_ID);

if (!asgardDef || asgardDef.rawType !== 'guerrier-divin-asgard') {
  fail(`${ASGARD_ID} doit être un Guerrier Divin d'Asgard`);
} else {
  ok(`${asgardDef.name} : type guerrier-divin-asgard`);
}

if (!saphirDef?.passiveEffects?.some((e) => e.type === 'bonus_prize_when_knocked_out')) {
  fail('Saphir d\'Odin doit avoir bonus_prize_when_knocked_out');
} else {
  ok('JSON Saphir d\'Odin : bonus_prize_when_knocked_out');
}

const basePrizes = getPrizeCountForKnockout(asgardDef);
if (basePrizes !== 2) {
  fail(`Récompense de base attendue 2, reçu ${basePrizes}`);
} else {
  ok('Récompense de base Guerrier Divin d\'Asgard : 2');
}

// Sans Saphir : 2 Récompenses
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight('test_dummy_active', 400);
  p1.active = makeKnight(ASGARD_ID, 10);
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  await engine.knockOut(p1, p1.active, { source: 'talent', immediatePrizes: true });
  await waitIdle(engine);

  const pending = p0.modifiers.pendingPrizesAtEndTurn || 0;
  const taken = p0.prizesTaken ?? 0;
  if (pending === 0 && taken === basePrizes) {
    ok(`KO sans Saphir : ${taken} Récompense(s)`);
  } else if (pending === basePrizes) {
    ok(`KO sans Saphir : ${pending} Récompense(s) en attente`);
  } else {
    fail(`KO sans Saphir : attendu ${basePrizes}, pending=${pending} taken=${taken}`);
  }
}

// Avec Saphir : 3 Récompenses
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight('test_dummy_active', 400);
  p1.active = makeKnight(ASGARD_ID, 10, {
    attachedTool: { cardId: SAPHIR_ID, instanceId: 'tool-saphir-1' },
  });
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  const expected = basePrizes + 1;
  await engine.knockOut(p1, p1.active, { source: 'talent', immediatePrizes: true });
  await waitIdle(engine);

  const pending = p0.modifiers.pendingPrizesAtEndTurn || 0;
  const taken = p0.prizesTaken ?? 0;
  const actual = pending || taken;
  if (actual === expected) {
    ok(`KO avec Saphir d'Odin : ${actual} Récompense(s) (2+1)`);
  } else {
    fail(`KO avec Saphir : attendu ${expected}, pending=${pending} taken=${taken}`);
  }
}

// Attaquant avec Saphir : bonus séparé (attaque KO)
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight(ASGARD_ID, 100, {
    attachedTool: { cardId: SAPHIR_ID, instanceId: 'tool-saphir-atk' },
    energies: [{ cardId: 'energie-commune', instanceId: 'e-1' }],
  });
  p1.active = makeKnight('test_dummy_active', 10);
  p1.bench = [];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  const victimBase = getPrizeCountForKnockout(getCardDef('test_dummy_active'));
  const attacks = engine.getAttackOptions(0);
  const meleeIdx = attacks.findIndex((a) => a.canUse && (a.attack?.damage || 0) >= 10)?.index ?? 0;
  engine.attack(0, meleeIdx);
  await waitIdle(engine);

  const pending = p0.modifiers.pendingPrizesAtEndTurn || 0;
  const expectedAttackerBonus = victimBase + 1;
  if (pending === expectedAttackerBonus) {
    ok(`Attaque KO avec Saphir : ${pending} Récompense(s) (base +1 attaquant)`);
  } else {
    fail(`Attaque KO avec Saphir : attendu ${expectedAttackerBonus}, pending=${pending}`);
  }
}

if (failed) {
  console.error('\nDes tests ont échoué.');
  process.exit(1);
}
console.log('\nTous les tests Saphir d\'Odin ont réussi.');
