/**
 * Duo Julian Solo + Poséidon Dieu des Océans : un clic pose les deux (banc).
 * node scripts/test-julian-poseidon-hand-stack.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, POSEIDON_CARD_IDS } from '../cards.js';
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

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const engine = new GameEngine({ gameMode: 'local2p', headless: true });
engine.reset({ gameMode: 'local2p' });
engine.state.phase = 'main';
engine.state.turn = 0;
engine.state.pending = null;

const p0 = engine.state.players[0];
p0.hand = [
  { cardId: POSEIDON_CARD_IDS.GOD, instanceId: 'test-god-1' },
  { cardId: POSEIDON_CARD_IDS.JULIAN_SOLO, instanceId: 'test-julian-1' },
];
p0.bench = [];
p0.active = p0.active || {
  instanceId: 'dummy-active',
  cardId: 'vieux-maitre',
  currentHp: 100,
  maxHp: 100,
  energies: [],
  statuses: [],
  modifiers: {},
};

assert(engine.canPlayChevalier(0, 0), 'Poseidon index playable with Julian in hand');
const ok = await engine.playChevalierToBench(0, 0);
assert(ok, 'playChevalierToBench from Poseidon click');
assert(p0.hand.length === 0, 'both cards left hand');
assert(p0.bench.length === 1, 'one stack on bench');
const stack = p0.bench[0];
assert(
  (stack.cardId === POSEIDON_CARD_IDS.JULIAN_SOLO ||
    stack.cardId?.includes?.('julian')) &&
    stack.underCard?.cardId === POSEIDON_CARD_IDS.GOD,
  'Julian on top, Poseidon under',
);

console.log('OK — clic Poséidon pose Julian + Poséidon (stack banc)');
