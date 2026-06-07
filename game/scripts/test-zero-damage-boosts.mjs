/**
 * Zero-base attacks must not receive global attack boosts
 * (Vieux Maître, Armes de la Balance, melee bonus, etc.)
 * node scripts/test-zero-damage-boosts.mjs
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

function makeResolver(overrides = {}) {
  const baseKnight = {
    energies: [],
    statuses: [],
    modifiers: {},
    attachedTool: null,
    cardId: 'mu_belier',
    ...overrides.knight,
  };
  const mockGame = {
    state: {
      players: [
        {
          active: baseKnight,
          bench: overrides.bench || [],
          modifiers: overrides.playerModifiers || {},
          discard: [],
          koBonusThisTurn: false,
        },
        { active: null, bench: [], modifiers: {}, discard: [] },
      ],
      stadium: null,
    },
  };
  return new EffectResolver(mockGame);
}

function assertCase(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label} → ${actual} (attendu ${expected})`);
  return ok;
}

let failed = false;

// —— Vieux Maître (+20 global) ne doit pas booster Mur de Cristal / Bouclier ——
const mur = getCardDef('mu_belier').attacks.find((a) => a.name === 'Mur de Cristal');
const corpsMu = getCardDef('mu_belier').attacks.find((a) => a.name === 'Corps à corps');
const bouclier = getCardDef('shiryu-du-dragon').attacks.find((a) => a.name === 'Bouclier');
const murAir = getCardDef('baian-cheval-marin').attacks.find((a) => a.name === "Mur d'Air");

const vieuxMaitreMods = { bonusAttackDamageThisTurn: 20 };

let r = makeResolver({ playerModifiers: vieuxMaitreMods });
if (!assertCase('Mur de Cristal + Vieux Maître', r.computeAttackDamage(0, mur, {}), 0)) failed = true;
if (!assertCase('Bouclier + Vieux Maître', r.computeAttackDamage(0, bouclier, {}), 0)) failed = true;
if (murAir && !assertCase("Mur d'Air + Vieux Maître", r.computeAttackDamage(0, murAir, {}), 0)) {
  failed = true;
}
if (!assertCase('Corps à corps + Vieux Maître', r.computeAttackDamage(0, corpsMu, {}), 40)) {
  failed = true;
}

// —— Armes de la Balance (outil +20) ——
r = makeResolver({
  knight: {
    cardId: 'dokko-de-la-balance',
    attachedTool: { cardId: 'armes-de-la-balance' },
  },
});
const dokkoAtk = getCardDef('dokko-de-la-balance').attacks.find((a) => a.damage > 0);
if (!assertCase('Attaque normale + Armes de la Balance', r.computeAttackDamage(0, dokkoAtk, {}), dokkoAtk.damage + 20)) {
  failed = true;
}
if (!assertCase('Mur de Cristal + Armes de la Balance', r.computeAttackDamage(0, mur, {}), 0)) {
  failed = true;
}

// —— Talent Armes de la Balance (meleeBonusThisTurn +20) ——
r = makeResolver({
  knight: { cardId: 'dokko-de-la-balance', modifiers: { meleeBonusThisTurn: 20 } },
});
const dokkoMelee = getCardDef('dokko-de-la-balance').attacks.find((a) =>
  (a.name || '').toLowerCase().includes('corps'),
);
if (dokkoMelee) {
  if (
    !assertCase(
      'Corps à corps + meleeBonusThisTurn',
      r.computeAttackDamage(0, dokkoMelee, {}),
      dokkoMelee.damage + 20,
    )
  ) {
    failed = true;
  }
}
if (!assertCase('Bouclier + meleeBonusThisTurn', r.computeAttackDamage(0, bouclier, {}), 0)) {
  failed = true;
}

// —— bonusAttackDamageThisTurn sur le chevalier (ex. Protecteur d'Athéna) ——
r = makeResolver({
  knight: { cardId: 'mu_belier', modifiers: { bonusAttackDamageThisTurn: 30 } },
});
if (!assertCase('Mur de Cristal + bonus knight', r.computeAttackDamage(0, mur, {}), 0)) failed = true;
if (!assertCase('Corps à corps + bonus knight', r.computeAttackDamage(0, corpsMu, {}), 50)) {
  failed = true;
}

process.exit(failed ? 1 : 0);
