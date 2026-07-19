/**
 * Siegfried de Dubhe — Le héros invincible + attaques
 * node scripts/test-siegfried-dubhe.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { EffectResolver } from '../effects.js';
import { RULES, setTestCoinFlip } from '../rules.js';

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

const CARD_ID = 'siegfried_dubhe';

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

function makeEngine() {
  const feedback = [];
  const engine = new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: (msg, type) => feedback.push({ msg, type }),
  });
  return { engine, feedback };
}

async function waitAttackEffects(engine) {
  await engine._aiWaitForCombatIdle?.();
  await new Promise((r) => setTimeout(r, 50));
}

function makeKnight(cardId, instanceId = 'test-knight') {
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

function setupSydAttacksSiegfried(engine) {
  engine.initAttackTest(CARD_ID);
  const siegfried = engine.state.players[0].active;
  const p1 = engine.state.players[1];
  p1.active = makeKnight('syd_mizar', 'test-syd');
  for (let i = 0; i < 3; i++) {
    p1.active.energies.push({ instanceId: `syd-e-${i}`, cardId: 'energie-etoile' });
  }
  engine.state.turn = 1;
  engine.resetTurnActions();
  return { siegfried, syd: p1.active };
}

const def = getCardDef(CARD_ID);
if (!def) {
  fail(`Carte ${CARD_ID} introuvable`);
  process.exit(1);
}

// JSON structure
if (def.talent?.name !== 'Le héros invincible') {
  fail(`Talent name: attendu "Le héros invincible", reçu "${def.talent?.name}"`);
} else {
  ok('JSON : talent "Le héros invincible"');
}

const talentEff = def.talent?.effects?.find((e) => e.type === 'when_attacked_coin_flip');
if (talentEff?.reduceOnPile !== 60 || !talentEff?.blockStatusOnPile) {
  fail(`JSON talent effect: reduceOnPile=60 blockStatusOnPile=true attendu`);
} else {
  ok('JSON : pile −60 dégâts + blocage état spécial');
}

const attacks = def.attacks || [];
const melee = attacks[0];
const odin = attacks[1];
const flames = attacks[2];
if (melee?.name !== 'Corps à corps' || melee.cost !== 0 || melee.damage !== 20) {
  fail('JSON : Corps à corps cost 0 / 20 dégâts');
} else {
  ok('JSON : Corps à corps 20, cost 0');
}
if (odin?.name !== "L'Épée d'Odin" || odin.cost !== 1 || odin.damage !== 40) {
  fail("JSON : L'Épée d'Odin cost 1 / 40 dégâts");
} else {
  ok("JSON : L'Épée d'Odin 40, cost 1, défausse énergie");
}
if (flames?.name !== 'Les flammes du dragon' || flames.cost !== 3 || flames.damage !== 100) {
  fail('JSON : Les flammes du dragon cost 3 / 100 dégâts');
} else {
  ok('JSON : Les flammes du dragon 100, cost 3, défausse énergie');
}

// Pile → −60 dégâts
{
  setTestCoinFlip(() => RULES.coin.tails);
  const { engine } = makeEngine();
  engine.initAttackTest(CARD_ID);
  const siegfried = engine.state.players[0].active;
  const hpBefore = siegfried.currentHp;
  engine.damageKnight(engine.state.players[0], siegfried, 80, 'attack', 1, 'test_dummy_active');
  if (siegfried.currentHp === hpBefore - 20) {
    ok('Pile : 80 → 20 dégâts subis');
  } else {
    fail(`Pile : attendu −20, PV ${hpBefore} → ${siegfried.currentHp}`);
  }
  setTestCoinFlip(null);
}

// Face → aucune réduction
{
  setTestCoinFlip(() => RULES.coin.heads);
  const { engine } = makeEngine();
  engine.initAttackTest(CARD_ID);
  const siegfried = engine.state.players[0].active;
  const hpBefore = siegfried.currentHp;
  engine.damageKnight(engine.state.players[0], siegfried, 80, 'attack', 1, 'test_dummy_active');
  if (siegfried.currentHp === hpBefore - 80) {
    ok('Face : 80 dégâts complets');
  } else {
    fail(`Face : attendu −80, PV ${hpBefore} → ${siegfried.currentHp}`);
  }
  setTestCoinFlip(null);
}

// Pile bloque l'état spécial d'une attaque adverse
{
  setTestCoinFlip(() => RULES.coin.tails);
  const { engine } = makeEngine();
  const { siegfried } = setupSydAttacksSiegfried(engine);
  siegfried.statuses = [];
  const griffesIdx = getCardDef('syd_mizar').attacks.findIndex(
    (a) => a.name === 'Griffes du Tigre Viking',
  );
  engine.attack(1, griffesIdx);
  await waitAttackEffects(engine);
  if (!siegfried.statuses.includes('frozen')) {
    ok('Pile : état Gelé bloqué sur Siegfried');
  } else {
    fail(`Pile : Siegfried ne devrait pas être gelé, statuts=${siegfried.statuses.join(',')}`);
  }
  setTestCoinFlip(null);
}

// Face : état spécial appliqué normalement
{
  setTestCoinFlip(() => RULES.coin.heads);
  const { engine } = makeEngine();
  const { siegfried } = setupSydAttacksSiegfried(engine);
  siegfried.statuses = [];
  const griffesIdx = getCardDef('syd_mizar').attacks.findIndex(
    (a) => a.name === 'Griffes du Tigre Viking',
  );
  engine.attack(1, griffesIdx);
  await waitAttackEffects(engine);
  if (siegfried.statuses.includes('frozen')) {
    ok('Face : état Gelé appliqué normalement');
  } else {
    fail(`Face : Siegfried devrait être gelé, statuts=${siegfried.statuses.join(',') || '(aucun)'}`);
  }
  setTestCoinFlip(null);
}

// Griffes du Tigre Viking (Syd) : 20 × énergies attachées, sans dégâts de base
{
  const sydDef = getCardDef('syd_mizar');
  const griffes = sydDef.attacks.find((a) => a.name === 'Griffes du Tigre Viking');
  if (griffes?.damage !== 0) {
    fail(`JSON Syd Griffes : damage 0 attendu, reçu ${griffes?.damage}`);
  } else {
    ok('JSON Syd Griffes : damage 0 (uniquement 20 × énergies)');
  }

  const mockGame = {
    state: {
      players: [
        { active: { energies: [] }, bench: [], modifiers: {}, discard: [] },
        { active: null, bench: [], modifiers: {}, discard: [] },
      ],
    },
  };
  const resolver = new EffectResolver(mockGame);
  for (const { energyCount, expected } of [
    { energyCount: 0, expected: 0 },
    { energyCount: 1, expected: 20 },
    { energyCount: 3, expected: 60 },
  ]) {
    mockGame.state.players[0].active.energies = Array.from({ length: energyCount }, (_, i) => ({
      instanceId: `e-${i}`,
      cardId: 'energie-etoile',
    }));
    const damage = resolver.computeAttackDamage(0, griffes, {});
    if (damage === expected) {
      ok(`Griffes Syd : ${energyCount} énergie(s) → ${damage} dégâts`);
    } else {
      fail(`Griffes Syd : ${energyCount} énergie(s) → ${damage} (attendu ${expected})`);
    }
  }

  setTestCoinFlip(() => RULES.coin.heads);
  const { engine } = makeEngine();
  const { siegfried } = setupSydAttacksSiegfried(engine);
  const hpBefore = siegfried.currentHp;
  const griffesIdx = sydDef.attacks.findIndex((a) => a.name === 'Griffes du Tigre Viking');
  engine.attack(1, griffesIdx);
  await waitAttackEffects(engine);
  const expectedDamage = 20 * 3;
  if (siegfried.currentHp === hpBefore - expectedDamage) {
    ok(`Griffes Syd en combat : 3 énergies → ${expectedDamage} dégâts`);
  } else {
    fail(
      `Griffes Syd en combat : PV ${hpBefore} → ${siegfried.currentHp} (attendu −${expectedDamage})`,
    );
  }
  setTestCoinFlip(null);
}

// L'Épée d'Odin défausse une énergie
{
  const { engine } = makeEngine();
  engine.initAttackTest(CARD_ID);
  const siegfried = engine.state.players[0].active;
  const energyBefore = siegfried.energies.length;
  const odinIdx = attacks.findIndex((a) => a.name === "L'Épée d'Odin");
  engine.attack(0, odinIdx);
  await waitAttackEffects(engine);
  if (siegfried.energies.length === energyBefore - 1) {
    ok("L'Épée d'Odin : 1 énergie défaussée");
  } else {
    fail(`L'Épée d'Odin : énergies ${energyBefore} → ${siegfried.energies.length}`);
  }
}

// Les flammes du dragon : 100 dégâts + défausse
{
  const { engine } = makeEngine();
  engine.initAttackTest(CARD_ID);
  const siegfried = engine.state.players[0].active;
  const opp = engine.state.players[1].active;
  const energyBefore = siegfried.energies.length;
  const oppHpBefore = opp.currentHp;
  const flamesIdx = attacks.findIndex((a) => a.name === 'Les flammes du dragon');
  engine.attack(0, flamesIdx);
  await waitAttackEffects(engine);
  if (siegfried.energies.length === energyBefore - 1 && opp.currentHp === oppHpBefore - 100) {
    ok('Les flammes du dragon : 100 dégâts + 1 énergie défaussée');
  } else {
    fail(
      `Flammes : énergies ${energyBefore}→${siegfried.energies.length}, dégâts opp ${oppHpBefore}→${opp.currentHp}`,
    );
  }
}

process.exit(failed ? 1 : 0);
