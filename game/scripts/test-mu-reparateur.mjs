/**
 * Réparateur (Mu du Bélier) — bouton talent activable (node scripts/test-mu-reparateur.mjs)
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

const engine = new GameEngine({ gameMode: 'local2p', headless: true });
engine.initAttackTest('mu_belier');

const benchDef = getCardDef('mu-de-jamir');
const benchKnight = {
  instanceId: 'test-bench-jamir',
  cardId: 'mu-de-jamir',
  currentHp: 50,
  maxHp: benchDef.hp,
  energies: [],
  statuses: [],
  modifiers: {},
  talentUsed: false,
  ownerIndex: 0,
};
engine.state.players[0].bench.push(benchKnight);

const talent = getCardDef('mu_belier').talent;
const hasActivatable = engine.hasActivatableTalent(talent);
const options = engine.getTalentOptions(0);
const canUse = engine.canUseTalent(0, 'active');

console.log('hasActivatableTalent:', hasActivatable);
console.log('getTalentOptions:', options);
console.log('canUseTalent(active):', canUse);

if (!hasActivatable) {
  console.error('FAIL: Réparateur not in activatable talents');
  process.exit(1);
}
if (!options.some((o) => o.zone === 'active' && o.name === 'Réparateur' && o.canUse)) {
  console.error('FAIL: Réparateur button option missing or not usable');
  process.exit(1);
}

const before = benchKnight.currentHp;
const ok = engine.useTalent(0, 'active');
const after = benchKnight.currentHp;

console.log('useTalent:', ok, 'bench HP', before, '->', after);

if (!ok) {
  console.error('FAIL: useTalent returned false');
  process.exit(1);
}
if (after !== before + 20) {
  console.error('FAIL: expected +20 HP on bench ally');
  process.exit(1);
}

console.log('PASS: Réparateur talent button and heal work');
