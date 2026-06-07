import { readFileSync } from 'fs';
import {
  loadCards,
  SPECTRE_POWER_ORDER,
  knightHasTag,
  comparePoolCards,
} from '../cards.js';
import { getPoolCards } from '../decks.js';

const orig = globalThis.fetch;
globalThis.fetch = (url) => {
  const path = url.replace('./', '');
  const data = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(data)) });
};

await loadCards();
globalThis.fetch = orig;

function poolChevalierSubFilter(card, subFilter) {
  if (subFilter === 'spectre') {
    return card.rawType === 'armee-hades' && knightHasTag(card, 'spectre');
  }
  return true;
}

const spectres = getPoolCards().filter((c) => poolChevalierSubFilter(c, 'spectre'));
const ids = spectres.map((c) => c.id);

console.log('Count:', spectres.length);
console.log('Actual order:', ids.join(', '));
console.log('Expected order:', SPECTRE_POWER_ORDER.join(', '));

let ok = true;
for (let i = 0; i < SPECTRE_POWER_ORDER.length; i++) {
  const expected = SPECTRE_POWER_ORDER[i];
  const actual = ids[i];
  if (actual !== expected) {
    console.error(`Mismatch at ${i + 1}: expected ${expected}, got ${actual ?? '(missing)'}`);
    ok = false;
  }
}
if (ids.length !== SPECTRE_POWER_ORDER.length) {
  console.error(`Count mismatch: pool has ${ids.length}, order list has ${SPECTRE_POWER_ORDER.length}`);
  ok = false;
}

for (const c of spectres) {
  const idx = SPECTRE_POWER_ORDER.indexOf(c.id);
  console.log(
    `${c.id} sortKey=${idx >= 0 ? idx : 999} rawType=${c.rawType} knightType=${c.knightType}`,
  );
}

if (!ok) process.exit(1);
console.log('OK: spectre pool order matches SPECTRE_POWER_ORDER');
