/**
 * Bud d'Alcor — Attaque dans l'ombre (1 énergie, +30 si Syd actif)
 * node scripts/test-bud-alcor.mjs
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

const BUD_ID = 'bud_alcor';
const SYD_ID = 'syd_mizar';

let failed = false;
const assertCase = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label} → ${actual} (attendu ${expected})`);
  if (!ok) failed = true;
  return ok;
};

function makeResolver({ activeCardId, benchBudEnergies = 0, activeAttack }) {
  const budOnBench = {
    cardId: BUD_ID,
    energies: Array.from({ length: benchBudEnergies }, (_, i) => ({ cardId: `energie-${i}` })),
    statuses: [],
    modifiers: {},
    attachedTool: null,
  };
  const activeKnight = {
    cardId: activeCardId,
    energies: [],
    statuses: [],
    modifiers: {},
    attachedTool: null,
  };
  const mockGame = {
    state: {
      players: [
        {
          active: activeKnight,
          bench: [budOnBench],
          modifiers: {},
          discard: [],
        },
        { active: { cardId: 'dummy', currentHp: 90 }, bench: [], modifiers: {}, discard: [] },
      ],
      stadium: null,
    },
  };
  const resolver = new EffectResolver(mockGame);
  const attack = activeAttack || { name: 'Test', cost: 1, damage: 40, effects: [] };
  return resolver.computeAttackDamage(0, attack, {});
}

const budDef = getCardDef(BUD_ID);
const eff = budDef?.talent?.effects?.find((e) => e.type === 'bench_bonus_active_attack_damage');

assertCase('JSON minEnergy', eff?.minEnergy, 1);
assertCase('JSON amount', eff?.amount, 20);
assertCase('JSON brotherCardId', eff?.brotherCardId, SYD_ID);
assertCase('JSON brotherBonusAmount', eff?.brotherBonusAmount, 30);

const sydAttack = getCardDef(SYD_ID).attacks[0];

// 0 énergie sur Bud → pas de bonus
assertCase('0 énergie, autre actif', makeResolver({ activeCardId: 'siegfried_dubhe', benchBudEnergies: 0 }), 40);

// 1 énergie, actif non-frère → +20
assertCase('1 énergie, Siegfried actif', makeResolver({ activeCardId: 'siegfried_dubhe', benchBudEnergies: 1 }), 60);

// 1 énergie, Syd actif → +30
assertCase('1 énergie, Syd actif', makeResolver({ activeCardId: SYD_ID, benchBudEnergies: 1, activeAttack: sydAttack }), 50);

// 2 énergies, Syd actif → +30 (pas cumul)
assertCase('2 énergies, Syd actif', makeResolver({ activeCardId: SYD_ID, benchBudEnergies: 2, activeAttack: sydAttack }), 50);

process.exit(failed ? 1 : 0);
