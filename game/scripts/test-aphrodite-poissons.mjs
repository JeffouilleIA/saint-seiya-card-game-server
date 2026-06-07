/**
 * Aphrodite du Poisson — Empoisonneur, Roses Démoniaques/Piranha/Sanguinaire
 * node scripts/test-aphrodite-poissons.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, isLostCanvasGold } from '../cards.js';
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
  return new GameEngine({ gameMode: 'local2p', headless: true });
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

const def = getCardDef('aphrodite_poissons');
assert('card id aphrodite_poissons', !!def);
assert('hp 140', def.hp === 140);
assert('retreat 3', def.retreat === 3);
assert('zodiac poissons', def.zodiacSign === 'poissons');
assert('not Lost Canvas', !isLostCanvasGold(def));
assert('talent Empoisonneur', def.talent?.name === 'Empoisonneur');
assert(
  'talent poison effect',
  def.talent?.effects?.some((e) => e.type === 'discard_energy_poison_opponent'),
);

const rosesDemo = def.attacks.find((a) => a.name === 'Roses Démoniaques');
const rosesPiranha = def.attacks.find((a) => a.name === 'Roses Piranha');
const roseSang = def.attacks.find((a) => a.name === 'Rose Sanguinaire');
assert('Roses Démoniaques 1/30 poison', rosesDemo?.cost === 1 && rosesDemo?.damage === 30);
assert('Roses Piranha 2/0 any', rosesPiranha?.cost === 2 && rosesPiranha?.damage === 0);
assert('Rose Sanguinaire 4/120', roseSang?.cost === 4 && roseSang?.damage === 120);

const images = loadJson('card-images.json');
assert('card image mapped', images['aphrodite_poissons'] === 'aphrodite_poisson.jpg');
const imagePath = join(root, 'assets', 'cards', 'aphrodite_poisson.jpg');
if (!existsSync(imagePath)) {
  console.log('NOTE: assets/cards/aphrodite_poisson.jpg manquant (référencé dans card-images.json)');
} else {
  console.log('OK: image file present');
}

// Empoisonneur — défausse énergie + poison actif adverse
{
  const engine = makeEngine();
  engine.initAttackTest('aphrodite_poissons');
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  assert('activatable talent', engine.hasActivatableTalent(def.talent));
  assert('can use talent', engine.canUseTalent(0, 'active'));
  const energyBefore = p0.active.energies.length;
  const ok = engine.useTalent(0, 'active');
  assert('useTalent ok', ok);
  assert('energy discarded', p0.active.energies.length === energyBefore - 1);
  assert('opponent poisoned', p1.active.statuses.includes('poisoned'));
}

// Roses Démoniaques — poison
{
  const engine = makeEngine();
  engine.initAttackTest('aphrodite_poissons');
  const p1 = engine.state.players[1];
  const idx = def.attacks.findIndex((a) => a.name === 'Roses Démoniaques');
  engine.attack(0, idx);
  assert('roses démoniaques poison', p1.active.statuses.includes('poisoned'));
}

// Roses Piranha — 50 dmg sur banc adverse choisi
{
  const engine = makeEngine();
  engine.initAttackTest('aphrodite_poissons');
  const p1 = engine.state.players[1];
  const bench = benchKnight('baian-cheval-marin', 'opp-bench');
  bench.currentHp = 80;
  p1.bench.push(bench);
  const idx = def.attacks.findIndex((a) => a.name === 'Roses Piranha');
  engine.attack(0, idx);
  assert('piranha pending pick', engine.state.pending?.type === 'pickDamageOpponentKnight');
  const opt = engine.state.pending.options.find((o) => o.instanceId === 'opp-bench');
  engine.resolvePickDamageOpponentKnight(0, opt.instanceId);
  assert('piranha 50 dmg bench', bench.currentHp === 30);
}

// Rose Sanguinaire — heal 40 + blocage attaque au tour suivant
{
  const engine = makeEngine();
  engine.initAttackTest('aphrodite_poissons');
  const aphrodite = engine.state.players[0].active;
  aphrodite.currentHp = 80;
  const idx = def.attacks.findIndex((a) => a.name === 'Rose Sanguinaire');
  engine.attack(0, idx);
  assert('rose sanguinaire heal', aphrodite.currentHp === 120);
  assert('cooldown flag set', aphrodite.modifiers.cantUseAttackOnNextTurn === 'Rose Sanguinaire');

  await engine.endTurn();
  await engine.endTurn();

  assert(
    'rose sanguinaire blocked next turn',
    aphrodite.modifiers.cantUseAttacks?.includes('Rose Sanguinaire'),
  );
  assert(
    'other attacks not blocked',
    !aphrodite.modifiers.cantUseAttacks?.includes('Roses Démoniaques'),
  );
}

console.log('All Aphrodite du Poisson tests passed.');
