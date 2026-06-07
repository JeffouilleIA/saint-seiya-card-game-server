/**
 * Garde (Aldébaran) — attackedLastTurn timing (node scripts/test-aldebaran-garde.mjs)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
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

function setupAldebaranVsDummy(engine) {
  engine.initAttackTest('aldebaran_taureau');
  engine.state.turn = 0;
  engine.state.turnCount = 2;
  engine.state.players[0].active = engine.state.players[0].active;
  engine.state.players[1].active = engine.state.players[1].active;
}

function gardeReduced(feedback) {
  return feedback.some((f) => /Garde\s*:\s*−/i.test(f.msg));
}

function attachEnergy(knight, count = 4) {
  for (let i = 0; i < count; i++) {
    knight.energies.push({ cardId: 'energie-cosmique', instanceId: `e-${i}` });
  }
}

async function endTurn(engine) {
  await engine.endTurn();
}

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    failed++;
  } else {
    console.log(`OK: ${name}`);
  }
}

// 1) Tour 1 — pas d'attaque préalable : Garde actif
{
  const { engine, feedback } = makeEngine();
  setupAldebaranVsDummy(engine);
  const alde = engine.state.players[0].active;
  assert('turn1 attackedLastTurn false', !alde.attackedLastTurn);
  const hpBefore = alde.currentHp;
  engine.damageKnight(engine.state.players[0], alde, 80, 'attack', 1, 'test_dummy_active');
  assert('turn1 Garde reduces damage', gardeReduced(feedback));
  assert('turn1 damage is 40', alde.currentHp === hpBefore - 40);
}

// 2) Retraite sans attaque — Garde actif au tour adverse
{
  const { engine, feedback } = makeEngine();
  setupAldebaranVsDummy(engine);
  const p0 = engine.state.players[0];
  const alde = p0.active;
  const dummyActive = engine.state.players[1].bench[0];
  p0.bench = [alde];
  p0.active = dummyActive;
  attachEnergy(p0.active, 3);
  engine.retreat(0, 0);
  assert('retreat swapped aldebaran active', p0.active.cardId === 'aldebaran_taureau');
  assert('aldebaran did not attack', !p0.active.attackedThisTurn);
  await endTurn(engine);
  feedback.length = 0;
  const hpBefore = p0.active.currentHp;
  engine.damageKnight(p0, p0.active, 80, 'attack', 1, 'test_dummy_active');
  assert('after retreat without attack Garde active', gardeReduced(feedback));
  assert('after retreat damage is 40', p0.active.currentHp === hpBefore - 40);
}

// 3) Attaque tour précédent — Garde inactif tour adverse suivant
{
  const { engine, feedback } = makeEngine();
  setupAldebaranVsDummy(engine);
  const alde = engine.state.players[0].active;
  attachEnergy(alde, 4);
  const meleeIdx = getCardDef('aldebaran_taureau').attacks.findIndex((a) => a.name === 'Corps à corps');
  engine.attack(0, meleeIdx);
  assert('attack sets attackedThisTurn', alde.attackedThisTurn === true);
  feedback.length = 0;
  await endTurn(engine);
  assert('after endTurn attackedLastTurn true', alde.attackedLastTurn === true);
  assert('after endTurn attackedThisTurn false', alde.attackedThisTurn === false);
  const hpBefore = alde.currentHp;
  engine.damageKnight(engine.state.players[0], alde, 80, 'attack', 1, 'test_dummy_active');
  assert('after attack last turn Garde inactive', !gardeReduced(feedback));
  assert('after attack last turn full damage', alde.currentHp === hpBefore - 80);
}

// 4) Tour suivant sans attaque — Garde réactivé
{
  const { engine, feedback } = makeEngine();
  setupAldebaranVsDummy(engine);
  const alde = engine.state.players[0].active;
  attachEnergy(alde, 1);
  const meleeIdx = getCardDef('aldebaran_taureau').attacks.findIndex((a) => a.name === 'Corps à corps');
  engine.attack(0, meleeIdx);
  await endTurn(engine); // tour adverse : Garde inactif
  await endTurn(engine); // retour joueur : pas d'attaque
  await endTurn(engine); // fin tour joueur : attackedLastTurn remis à false
  feedback.length = 0;
  assert('next owner turn end attackedLastTurn false', alde.attackedLastTurn === false);
  const hpBefore = alde.currentHp;
  engine.damageKnight(engine.state.players[0], alde, 80, 'attack', 1, 'test_dummy_active');
  assert('reactivated Garde after no attack turn', gardeReduced(feedback));
  assert('reactivated damage is 40', alde.currentHp === hpBefore - 40);
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll Garde tests passed');
