/**
 * Smoke tests — Mégalopole, Terres glacées, Homme de Phénix
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES } from '../rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function initCards() {
  const raw = [
    ...loadJson('cards.json'),
    ...loadJson('cards-argent.json'),
    ...(loadJson('cards-bronze-mineur.json') || []),
    ...loadJson('cards-or.json'),
    ...(loadJson('cards-asgard.json') || []),
    ...(loadJson('cards-divin.json') || []),
    ...(loadJson('cards-hades.json') || []),
    ...loadJson('objets.json'),
    ...(loadJson('test-dummies.json') || []),
  ];
  for (const c of raw) {
    if (c.id) CARD_DATABASE[c.id] = c;
  }
}

function makeKnight(cardId, hp, extra = {}) {
  const def = getCardDef(cardId);
  return {
    instanceId: `k-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp: hp ?? def?.hp ?? 100,
    maxHp: hp ?? def?.hp ?? 100,
    energies: extra.energies ?? [{ cardId: 'energie-commune', instanceId: 'e1' }],
    statuses: extra.statuses ?? [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
  };
}

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

initCards();

console.log('=== Card JSON ===\n');
assert('Mégalopole defined', !!getCardDef('stadium_megalopole'));
assert('Terres glacées defined', !!getCardDef('stadium_terres_glacees'));
assert('Homme de Phénix defined', !!getCardDef('homme-de-phenix'));
assert('Homme de Phénix HP 10', getCardDef('homme-de-phenix').hp === 10);
assert('Homme de Phénix retreat 1', getCardDef('homme-de-phenix').retreat === 1);

console.log('\n=== Mégalopole bench max ===\n');
{
  const engine = new GameEngine({ headless: true });
  engine.reset();
  engine.state.stadium = {
    cardId: 'stadium_megalopole',
    name: 'Mégalopole',
    playerIndex: 0,
    instanceId: 'st-1',
  };
  assert('bench max 8 with Mégalopole', engine.getEffectiveMaxBench() === 8);
  engine.state.stadium = null;
  assert('bench max 5 without stadium', engine.getEffectiveMaxBench() === RULES.maxBench);
}

console.log('\n=== Terres glacées end-turn damage ===\n');
await (async () => {
  const engine = new GameEngine({ headless: true });
  engine.reset();
  engine.state.phase = 'main';
  engine.state.stadium = {
    cardId: 'stadium_terres_glacees',
    name: 'Terres glacées',
    playerIndex: 0,
    instanceId: 'st-2',
  };
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = makeKnight('phenix-noir', 60, { statuses: ['frozen'] });
  p1.active = makeKnight('dragon-noir', 60, { statuses: ['paralyzed'] });
  const beforeFrozen = p0.active.currentHp;
  const beforeParalyzed = p1.active.currentHp;
  await engine.effects.applyStadiumEndTurnStatusDamage();
  assert('Gelé knight −20', p0.active.currentHp === beforeFrozen - 20);
  assert('Paralysé knight −30', p1.active.currentHp === beforeParalyzed - 30);
})();

console.log('\n=== Homme de Phénix Sans valeurs ===\n');
{
  const def = getCardDef('homme-de-phenix');
  assert(
    'zero prize talent',
    def.talent?.effects?.some((e) => e.type === 'zero_prize_on_knockout'),
  );
  const atk = def.attacks[0];
  assert('Corps à corps 0 cost', atk.cost === 0);
  assert('Corps à corps 10 damage', atk.damage === 10);
}

console.log('\nAll tests passed.\n');
