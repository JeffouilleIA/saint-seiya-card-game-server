/**
 * Sorrento de la Sirène — Flûtiste du Dieu des Mers, Mélodie Envoûtante, Dead End Symphony
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, POSEIDON_CARD_IDS } from '../cards.js';
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

function makeEngine() {
  const feedback = [];
  const engine = new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: (msg, type) => feedback.push({ msg, type }),
  });
  return { engine, feedback };
}

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function benchKnight(cardId, instanceId = `bench-${cardId}`) {
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

const sorrentoDef = getCardDef('sorrento-sirene');
assert('hp 150', sorrentoDef.hp === 150);
assert('retreat 1', sorrentoDef.retreat === 1);
assert('talent Flûtiste', sorrentoDef.talent?.name === 'Flûtiste du Dieu des Mers');
assert(
  'talent sorrento_flute effect',
  sorrentoDef.talent?.effects?.some((e) => e.type === 'sorrento_flute'),
);

const melodie = sorrentoDef.attacks.find((a) => a.name === 'Mélodie Envoûtante');
const deadEnd = sorrentoDef.attacks.find((a) => a.name === 'Dead End Symphony');
assert('Mélodie cost 2 dmg 50', melodie?.cost === 2 && melodie?.damage === 50);
assert('Mélodie confused', melodie?.effects?.[0]?.status === 'confused');
assert('Dead End cost 4 dmg 90', deadEnd?.cost === 4 && deadEnd?.damage === 90);
assert(
  'Dead End cost modifier effect',
  deadEnd?.effects?.[0]?.type === 'opponent_active_attack_cost_plus_until_owner_turn_end',
);

const images = loadJson('card-images.json');
assert('card image mapped', images['sorrento-sirene'] === 'Sorento.jpg');

// Flûtiste — annule talent actif adverse (Mur de Dieu inactif)
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p1 = engine.state.players[1];
  p1.active = benchKnight('baian-cheval-marin', 'opp-baian');
  p1.active.currentHp = 140;
  const hpBefore = p1.active.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(p1, p1.active, 50, 'attack', 0);
  assert('flute silences opponent active talent', p1.active.currentHp === hpBefore - 50);
}

// Flûtiste — talent adverse actif sans Sorrento actif (Sorrento au banc)
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p0 = engine.state.players[0];
  const sorrento = p0.active;
  p0.active = engine.state.players[1].active;
  p0.bench = [sorrento];
  const p1 = engine.state.players[1];
  p1.active = benchKnight('baian-cheval-marin', 'opp-baian2');
  p1.active.currentHp = 140;
  const hpBefore = p1.active.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(p1, p1.active, 50, 'attack', 0);
  assert('flute inactive when sorrento on bench', p1.active.currentHp === hpBefore - 30);
}

// Flûtiste + Poséidon — +1 coût attaques actif adverse
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p0 = engine.state.players[0];
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD));
  const p1 = engine.state.players[1];
  p1.active = benchKnight('baian-cheval-marin', 'opp-baian3');
  const baianAtk = getCardDef('baian-cheval-marin').attacks.find((a) => a.name === 'God Breath');
  engine.state.turn = 1;
  const cost = engine.getEffectiveAttackCost(p1.active, baianAtk);
  assert('flute + poseidon +1 attack cost', cost === baianAtk.cost + 1);
  assert(
    '0-cost exempt from flute cost increase',
    engine.getEffectiveAttackCost(p1.active, { name: 'Zero', cost: 0, damage: 10 }) === 0,
  );
}

// Flûtiste sans Poséidon — pas de surcoût
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p1 = engine.state.players[1];
  p1.active = benchKnight('baian-cheval-marin', 'opp-baian4');
  const baianAtk = getCardDef('baian-cheval-marin').attacks.find((a) => a.name === 'God Breath');
  engine.state.turn = 1;
  const cost = engine.getEffectiveAttackCost(p1.active, baianAtk);
  assert('no poseidon no extra attack cost', cost === baianAtk.cost);
}

// Mélodie Envoûtante — Confus
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p1 = engine.state.players[1];
  const melIdx = sorrentoDef.attacks.findIndex((a) => a.name === 'Mélodie Envoûtante');
  engine.attack(0, melIdx);
  assert('melodie applies confused', p1.active.statuses.includes('confused'));
}

// Dead End Symphony — +2 coût jusqu'à fin prochain tour adverse
{
  const { engine } = makeEngine();
  engine.initAttackTest('sorrento-sirene');
  const p1 = engine.state.players[1];
  const deadIdx = sorrentoDef.attacks.findIndex((a) => a.name === 'Dead End Symphony');
  engine.attack(0, deadIdx);
  assert('dead end sets attackCostPlus 2', p1.active.modifiers.attackCostPlus === 2);
  assert('dead end clear flag set', p1.active.modifiers.attackCostPlusClearOnOwnerTurnEnd === true);

  await engine.endTurn();
  assert('dead end persists through opponent turn', p1.active.modifiers.attackCostPlus === 2);
  engine.state.turn = 1;
  const atk2 = { name: 'Test', cost: 2, damage: 20 };
  assert(
    'dead end +2 during opponent turn',
    engine.getEffectiveAttackCost(p1.active, atk2) === 4,
  );
  assert(
    'dead end 0-cost exempt',
    engine.getEffectiveAttackCost(p1.active, { name: 'Zero', cost: 0, damage: 10 }) === 0,
  );

  await engine.endTurn();
  assert('dead end cleared after opponent turn end', (p1.active.modifiers.attackCostPlus ?? 0) === 0);
  assert(
    'dead end clear flag removed',
    !p1.active.modifiers.attackCostPlusClearOnOwnerTurnEnd,
  );
}

console.log('All Sorrento tests passed.');
