/**
 * Athéna / Aioros — bonus de dégâts n'affecte pas Corps à corps.
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

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function knight(cardId, id) {
  const def = getCardDef(cardId);
  return {
    instanceId: id,
    cardInstanceId: id,
    cardId,
    currentHp: def.hp,
    maxHp: def.hp,
    energies: [
      { cardId: 'energie-etoile', instanceId: `e1-${id}` },
      { cardId: 'energie-etoile', instanceId: `e2-${id}` },
      { cardId: 'energie-etoile', instanceId: `e3-${id}` },
    ],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

const athenaDef = getCardDef('athena');
assert(
  'athena excludeMelee flag',
  athenaDef.talent.effects.some((e) => e.type === 'ally_attack_bonus_by_raw_types' && e.excludeMelee),
);
const aiorosDef = getCardDef('aioros_sagittaire');
assert(
  'aioros excludeMelee flag',
  aiorosDef.talent.effects.some((e) => e.type === 'athena_or_divine_child_synergy' && e.excludeMelee),
);

{
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.reset({ gameMode: 'local2p', deckLists: [[], []] });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = knight('aior-du-lion', 'lion');
  p0.bench = [knight('athena', 'ath')];
  p1.active = knight('seiya-de-pegase', 'seiya');
  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.state.turnCount = 2;
  engine.resetTurnActions();

  const melee = getCardDef('aior-du-lion').attacks.find((a) => a.name === 'Corps à corps');
  const other = getCardDef('aior-du-lion').attacks.find((a) => a.name === 'Plasma foudroyant');
  const ctx = { opponentActive: p1.active };
  const meleeDmg = engine.effects.computeAttackDamage(0, melee, ctx);
  const otherDmg = engine.effects.computeAttackDamage(0, other, ctx);
  assert('athena does not boost Corps à corps', meleeDmg === (melee.damage || 0));
  assert('athena boosts other attacks +30', otherDmg === (other.damage || 0) + 30);
}

{
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.reset({ gameMode: 'local2p', deckLists: [[], []] });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = knight('aioros_sagittaire', 'aioros');
  p0.active.currentHp = 100;
  p1.active = knight('seiya-de-pegase', 'seiya2');
  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.state.turnCount = 2;
  engine.resetTurnActions();
  engine.effects.applyAiorosProtecteurIfEligible(0, { fromSupporter: true });
  assert('protecteur bonus applied', (p0.active.modifiers.bonusAttackDamageThisTurn || 0) === 30);

  const melee = getCardDef('aioros_sagittaire').attacks.find((a) => a.name === 'Corps à corps');
  const foudre = getCardDef('aioros_sagittaire').attacks.find((a) => a.name === 'Foudre atomique');
  const ctx = { opponentActive: p1.active };
  assert(
    'aioros protecteur does not boost Corps à corps',
    engine.effects.computeAttackDamage(0, melee, ctx) === (melee.damage || 0),
  );
  assert(
    'aioros protecteur boosts Foudre atomique +30',
    engine.effects.computeAttackDamage(0, foudre, ctx) === (foudre.damage || 0) + 30,
  );
}

console.log('test-athena-aioros-exclude-melee: all checks passed');
