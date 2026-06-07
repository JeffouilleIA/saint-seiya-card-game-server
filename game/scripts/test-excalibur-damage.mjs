/**
 * Excalibur damage: base 50 + 20 per discarded energy (node scripts/test-excalibur-damage.mjs)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
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

const def = getCardDef('shura-du-capricorne');
const excalibur = def.attacks.find((a) => a.name === 'Excalibur');
if (!excalibur) {
  console.error('FAIL: Excalibur attack not found');
  process.exit(1);
}

const mockGame = {
  state: {
    players: [
      { active: { energies: [] }, bench: [], modifiers: {}, discard: [] },
      { active: null, bench: [], modifiers: {}, discard: [] },
    ],
  },
};
const resolver = new EffectResolver(mockGame);

const cases = [
  { discardedEnergyCount: 0, expected: 50 },
  { discardedEnergyCount: 1, expected: 70 },
  { discardedEnergyCount: 2, expected: 90 },
];

let failed = false;
for (const { discardedEnergyCount, expected } of cases) {
  const damage = resolver.computeAttackDamage(0, excalibur, { discardedEnergyCount });
  const ok = damage === expected;
  console.log(
    `${ok ? 'OK' : 'FAIL'}: ${discardedEnergyCount} défausse(s) → ${damage} (attendu ${expected})`,
  );
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
