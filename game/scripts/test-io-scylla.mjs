/**
 * Io de Scylla — Projection Animale (6 animaux) + Big Tornado (défausse 2, Confus/Empoisonné)
 * node scripts/test-io-scylla.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { EffectResolver } from '../effects.js';

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
  const engine = new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: () => {},
  });
  return engine;
}

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

const ioDef = getCardDef('io-scylla');
assert('hp 160', ioDef.hp === 160);
assert('retreat 2', ioDef.retreat === 2);
assert('no talent', ioDef.talent == null);
assert('2 attacks', ioDef.attacks.length === 2);
assert('image Io.jpg', ioDef.image?.includes('Io.jpg'));

const projection = ioDef.attacks.find((a) => a.name === 'Projection Animale');
const tornado = ioDef.attacks.find((a) => a.name === 'Big Tornado');
assert('Projection Animale 2/50', projection?.cost === 2 && projection?.damage === 50);
assert('Projection io_projection_animale', projection?.effects?.[0]?.type === 'io_projection_animale');
assert('Big Tornado 4/100', tornado?.cost === 4 && tornado?.damage === 100);
assert(
  'Big Tornado effects',
  tornado?.effects?.some((e) => e.type === 'discard_energy' && e.count === 2) &&
    tornado?.effects?.some((e) => e.type === 'io_big_tornado_status'),
);

const projIdx = ioDef.attacks.findIndex((a) => a.name === 'Projection Animale');
const tornadoIdx = ioDef.attacks.findIndex((a) => a.name === 'Big Tornado');

function runProjection(engine, animalId) {
  const oppHpBefore = engine.state.players[1].active.currentHp;
  const ioHpBefore = engine.state.players[0].active.currentHp;
  engine.attack(0, projIdx);
  assert(`projection pending (${animalId})`, engine.state.pending?.type === 'pickIoAnimal');
  const ok = engine.resolvePickIoAnimal(0, animalId);
  assert(`resolvePickIoAnimal ${animalId}`, ok);
  return { oppHpBefore, ioHpBefore, io: engine.state.players[0].active, opp: engine.state.players[1].active };
}

async function runTornadoAttack(engine) {
  engine.attack(0, tornadoIdx);
  await new Promise((r) => setImmediate(r));
}

// Abeille → Confus + 50 dégâts
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const { oppHpBefore, opp } = runProjection(engine, 'abeille');
  assert('abeille confused', opp.statuses.includes('confused'));
  assert('abeille 50 dmg', opp.currentHp === oppHpBefore - 50);
  assert('abeille lastIoAnimal', engine.state.players[0].active.lastIoAnimal === 'abeille');
}

// Loup → +30 (80 total)
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const { oppHpBefore, opp } = runProjection(engine, 'loup');
  assert('loup 80 dmg', opp.currentHp === oppHpBefore - 80);
}

// Aigle → +50 (100) et Io −30
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const { oppHpBefore, ioHpBefore, opp, io } = runProjection(engine, 'aigle');
  assert('aigle 100 dmg', opp.currentHp === oppHpBefore - 100);
  assert('aigle self 30', io.currentHp === ioHpBefore - 30);
}

// Serpent → Empoisonné
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const { opp } = runProjection(engine, 'serpent');
  assert('serpent poisoned', opp.statuses.includes('poisoned'));
}

// Ours → Paralysé
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const { opp } = runProjection(engine, 'ours');
  assert('ours paralyzed', opp.statuses.includes('paralyzed'));
}

// Chauve-Souris → soigne Io 30 PV
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  engine.state.players[0].active.currentHp = 100;
  const ioHpBefore = 100;
  const { io } = runProjection(engine, 'chauve-souris');
  assert('chauve-souris heal', io.currentHp === Math.min(io.maxHp, ioHpBefore + 30));
}

// listIoAnimalChoices + rejet du dernier animal choisi
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const io = engine.state.players[0].active;
  const opp = engine.state.players[1].active;
  io.lastIoAnimal = 'loup';
  const choices = engine.effects.listIoAnimalChoices(io);
  assert('listIoAnimalChoices count 5', choices.length === 5);
  assert('listIoAnimalChoices no loup', !choices.some((a) => a.id === 'loup'));
  engine._attackContinuation = {
    playerIndex: 0,
    attackIndex: projIdx,
    ctx: { opponentActive: opp, attackName: projection.name },
  };
  engine.state.pending = {
    type: 'pickIoAnimal',
    playerIndex: 0,
    animals: choices.map((a) => ({ id: a.id, label: a.label })),
  };
  assert('reject repeat loup', !engine.resolvePickIoAnimal(0, 'loup'));
  const oppHpBefore = opp.currentHp;
  assert('pick abeille after reject', engine.resolvePickIoAnimal(0, 'abeille'));
  assert('no-repeat abeille confused', opp.statuses.includes('confused'));
  assert('no-repeat abeille dmg', opp.currentHp === oppHpBefore - 50);
}

// Big Tornado — dégâts, défausse 2 énergies, choix Confus
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const io = engine.state.players[0].active;
  const opp = engine.state.players[1].active;
  const energyBefore = io.energies.length;
  const oppHpBefore = opp.currentHp;
  await runTornadoAttack(engine);
  assert('tornado 100 dmg', opp.currentHp === oppHpBefore - 100);
  assert('tornado discard 2 energy', io.energies.length === energyBefore - 2);
  assert('tornado status pending', engine.state.pending?.type === 'pickIoBigTornadoStatus');
  const ok = engine.resolvePickIoBigTornadoStatus(0, 'confused');
  assert('tornado resolve confused', ok);
  assert('tornado confused applied', opp.statuses.includes('confused'));
}

// Big Tornado — Empoisonné
{
  const engine = makeEngine();
  engine.initAttackTest('io-scylla');
  const opp = engine.state.players[1].active;
  await runTornadoAttack(engine);
  assert('tornado poison pending', engine.state.pending?.type === 'pickIoBigTornadoStatus');
  engine.resolvePickIoBigTornadoStatus(0, 'poisoned');
  assert('tornado poisoned applied', opp.statuses.includes('poisoned'));
}

// IO_ANIMALS catalogue (6 animaux)
assert('IO_ANIMALS count 6', EffectResolver.IO_ANIMALS.length === 6);

console.log('All Io de Scylla tests passed.');
