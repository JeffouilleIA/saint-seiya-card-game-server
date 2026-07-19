/**
 * Poséidon, Dieu des Océans — Trident Royal + Colère du Dieu des Mers
 * node scripts/test-poseidon-god.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, POSEIDON_CARD_IDS } from '../cards.js';
import { GameEngine } from '../engine.js';
import { EffectResolver } from '../effects.js';
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

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function makeEngine() {
  return new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: () => {},
  });
}

const god = getCardDef(POSEIDON_CARD_IDS.GOD);
assert('hp 240', god.hp === 240);
assert('2 attacks', god.attacks.length === 2);
assert('no Big Will', !god.attacks.some((a) => a.name === 'Big Will'));

const trident = god.attacks.find((a) => a.name === 'Trident Royal');
const colere = god.attacks.find((a) => a.name === 'Colère du Dieu des Mers');
assert('Trident Royal 2/110', trident?.cost === 2 && trident?.damage === 110);
assert(
  'Trident no extra effects',
  Array.isArray(trident?.effects) &&
    trident.effects.length === 0 &&
    !trident?.effectText,
);
assert('Colère 4/60', colere?.cost === 4 && colere?.damage === 60);
assert(
  'Colère bonus per marker on self',
  colere?.effects?.some(
    (e) =>
      e.type === 'bonus_damage_per_damage_marker' &&
      e.amountPerMarker === 10 &&
      e.target === 'self',
  ),
);

assert('talent Dieu des Mers intact', god.talent?.name === 'Dieu des Mers');
assert(
  'talent marina +20',
  god.talent?.effects?.some((e) => e.type === 'marina_attack_bonus_global' && e.amount === 20),
);

const tridentIdx = god.attacks.findIndex((a) => a.name === 'Trident Royal');
const colereIdx = god.attacks.findIndex((a) => a.name === 'Colère du Dieu des Mers');

// Trident Royal — 110 dégâts purs
{
  const engine = makeEngine();
  engine.initAttackTest(POSEIDON_CARD_IDS.GOD);
  const opp = engine.state.players[1].active;
  const oppHpBefore = opp.currentHp;
  engine.attack(0, tridentIdx);
  assert('Trident 110 dmg', opp.currentHp === oppHpBefore - 110);
}

// Colère — formule dégâts selon marqueurs sur l'attaquant (Poséidon)
const mockGame = {
  state: {
    players: [
      { active: { maxHp: 240, currentHp: 240, energies: [] }, bench: [], modifiers: {}, discard: [] },
      { active: { maxHp: 100, currentHp: 100, energies: [] }, bench: [], modifiers: {}, discard: [] },
    ],
  },
};
const resolver = new EffectResolver(mockGame);
const unit = RULES.damageMarkerUnit || 10;

const colereCases = [
  { lostHp: 0, expected: 60 },
  { lostHp: 10, expected: 70 },
  { lostHp: 30, expected: 90 },
  { lostHp: 50, expected: 110 },
];

for (const { lostHp, expected } of colereCases) {
  mockGame.state.players[0].active.currentHp = mockGame.state.players[0].active.maxHp - lostHp;
  const oppKnight = mockGame.state.players[1].active;
  const damage = resolver.computeAttackDamage(0, colere, { opponentActive: oppKnight });
  const markers = Math.floor(lostHp / unit);
  assert(
    `Colère ${markers} marqueur(s) sur Poséidon (${lostHp} PV perdus) → ${expected} dmg`,
    damage === expected,
  );
}

// Colère — dégâts réels en combat (Poséidon a 30 PV perdus = 3 marqueurs → 90 total)
{
  const engine = makeEngine();
  engine.initAttackTest(POSEIDON_CARD_IDS.GOD);
  const atk = engine.state.players[0].active;
  atk.currentHp = atk.maxHp - 30;
  const opp = engine.state.players[1].active;
  const oppHpBefore = opp.currentHp;
  engine.attack(0, colereIdx);
  assert('Colère 90 dmg with 3 self markers', opp.currentHp === oppHpBefore - 90);
}

console.log('OK — Poséidon Dieu des Océans attaques validées');
