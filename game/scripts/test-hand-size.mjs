/**
 * Regression: main can grow beyond the old 10-card cap (no silent trimHand discard).
 * Run: node scripts/test-hand-size.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES } from '../rules.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCardsSyncForTest() {
  const raw = JSON.parse(readFileSync(join(projectRoot, 'data', 'cards.json'), 'utf8'));
  for (const c of raw) {
    if (!c?.id) continue;
    CARD_DATABASE[c.id] = { ...c, cardType: 'chevalier' };
  }
}

loadCardsSyncForTest();

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('OK:', msg);
  }
};

assert(RULES.maxHand == null, 'global maxHand is unlimited (null)');

const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
engine.reset({ headless: true, gameMode: 'local2p' });

const p0 = engine.state.players[0];
const cardId = 'seiya-de-pegase';

p0.hand = Array.from({ length: 12 }, (_, i) => ({
  cardId,
  instanceId: `hand-${i}`,
}));
for (let i = 0; i < 5; i++) {
  p0.deck.push({ cardId, instanceId: `deck-${i}` });
}

const discardBefore = p0.discard.length;
await engine.draw(p0, 5);

assert(p0.hand.length === 17, `hand keeps all drawn cards (got ${p0.hand.length})`);
assert(
  p0.discard.length === discardBefore,
  'trimHand did not silently discard excess cards',
);

engine.trimHand(p0);
assert(p0.hand.length === 17, 'trimHand no-op when maxHand is null');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll hand size tests passed.');
