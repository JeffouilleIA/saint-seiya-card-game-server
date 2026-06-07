/**
 * Quick Mur de Cristal flow test (node scripts/test-mur-crystal.mjs)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES } from '../rules.js';

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

const feedback = [];
const engine = new GameEngine({
  gameMode: 'local2p',
  onFeedback: (msg, type) => feedback.push({ msg, type }),
});

engine.initAttackTest('mu_belier');
engine.state.turn = 0;
engine.state.turnCount = 2;

const murIndex = getCardDef('mu_belier').attacks.findIndex((a) => a.name === 'Mur de Cristal');
engine.attack(0, murIndex);
const pending = engine.state.players[0].modifiers.pendingMurCrystal;
console.log('After Mur:', pending);
if (!pending) {
  console.error('FAIL: pendingMurCrystal not set');
  process.exit(1);
}

await engine.endTurn();
console.log('Turn:', engine.state.turn, 'pending after end:', engine.state.players[0].modifiers.pendingMurCrystal);

const p0hp = engine.state.players[0].active.currentHp;
const p1hp = engine.state.players[1].active.currentHp;
engine.damageKnight(engine.state.players[0], engine.state.players[0].active, 80, 'attack', 1, 'test_dummy_active');
console.log('P0 HP', p0hp, '->', engine.state.players[0].active.currentHp);
console.log('P1 HP', p1hp, '->', engine.state.players[1].active.currentHp);
console.log(
  'Mur feedback:',
  feedback.filter((f) => /mur|cristal|pièce|pile|face/i.test(f.msg)).map((f) => f.msg),
);
