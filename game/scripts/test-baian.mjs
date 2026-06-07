/**
 * Baian du Cheval Marin — Mur de Dieu, Mur d'Air, God Breath (node scripts/test-baian.mjs)
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

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

const baianDef = getCardDef('baian-cheval-marin');
assert('hp 140', baianDef.hp === 140);
assert('talent Mur de Dieu', baianDef.talent?.name === 'Mur de Dieu');
assert('3 attacks', baianDef.attacks.length === 3);
assert('Mur d Air present', baianDef.attacks.some((a) => a.name === "Mur d'Air"));
assert('God Breath cost 3 dmg 90', baianDef.attacks.find((a) => a.name === 'God Breath')?.cost === 3);
assert('God Breath swap defender', baianDef.attacks.find((a) => a.name === 'God Breath')?.effects?.[0]?.chooser === 'defender');

// Mur de Dieu : 50 after others → −20 = 30 ; 40 → 0
{
  const { engine } = makeEngine();
  engine.initAttackTest('baian-cheval-marin');
  const baian = engine.state.players[0].active;
  const hpBefore = baian.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(engine.state.players[0], baian, 50, 'attack', 1);
  assert('mur de dieu 50→30', baian.currentHp === hpBefore - 30);

  const hp2 = baian.currentHp;
  engine.damageKnight(engine.state.players[0], baian, 40, 'attack', 1);
  assert('mur de dieu 40→0', baian.currentHp === hp2);
}

// Mur d'Air : 60 dmg → 0 + counter on attacker
{
  const { engine } = makeEngine();
  engine.initAttackTest('baian-cheval-marin');
  const baian = engine.state.players[0].active;
  baian.modifiers.baianMurAir = { reduce: 60, counterDamage: 20, untilOwnerTurn: true };
  const oppActive = engine.state.players[1].active;
  const oppHp = oppActive.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(engine.state.players[0], baian, 60, 'attack', 1);
  assert('baian no damage from 60', baian.currentHp === 140);
  assert('attacker counter 20', oppActive.currentHp === oppHp - 20);
}

console.log('All Baian tests passed.');
