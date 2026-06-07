import { readFileSync } from 'fs';
import {
  loadCards,
  ASGARD_ANIME_ORDER,
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
  if (subFilter === 'guerrier-divin-asgard') {
    return card.knightType === 'GuerrierDivinAsgard' || card.rawType === 'guerrier-divin-asgard';
  }
  return true;
}

const asgard = getPoolCards().filter((c) => poolChevalierSubFilter(c, 'guerrier-divin-asgard'));
const ids = asgard.map((c) => c.id);

console.log('Count:', asgard.length);
console.log('Actual order:', ids.join(', '));
console.log('Expected order:', ASGARD_ANIME_ORDER.join(', '));

let ok = true;
for (let i = 0; i < ASGARD_ANIME_ORDER.length; i++) {
  const expected = ASGARD_ANIME_ORDER[i];
  const actual = ids[i];
  if (actual !== expected) {
    console.error(`Mismatch at ${i + 1}: expected ${expected}, got ${actual ?? '(missing)'}`);
    ok = false;
  }
}

const mimeIdx = ids.indexOf('mime_veneta');
const sydIdx = ids.indexOf('syd_mizar');
if (mimeIdx < 0 || sydIdx < 0 || mimeIdx >= sydIdx) {
  console.error(`Expected mime_veneta before syd_mizar, got mime@${mimeIdx}, syd@${sydIdx}`);
  ok = false;
}

const extras = ids.slice(ASGARD_ANIME_ORDER.length);
if (extras.length) {
  console.log('Extra cards after ordered list:', extras.join(', '));
}

for (const c of asgard) {
  const idx = ASGARD_ANIME_ORDER.indexOf(c.id);
  console.log(
    `${c.id} sortKey=${idx >= 0 ? idx : 999} rawType=${c.rawType} knightType=${c.knightType}`,
  );
}

if (!ok) process.exit(1);
console.log('OK: asgard pool order matches ASGARD_ANIME_ORDER');
