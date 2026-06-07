/**
 * Kasa — Illusion Trompeuse : Julian ou Kanon requis, copie attaque adverse (−1 coût).
 * node scripts/test-kasa-illusion.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  loadCards,
  getCardDef,
  playerHasJulianOrKanonDragonInPlay,
  playerHasJulianSoloInPlay,
} from '../cards.js';
import { GameEngine } from '../engine.js';
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

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function makeKnight(cardId) {
  const def = getCardDef(cardId);
  return {
    instanceId: `k-${cardId}`,
    cardId,
    currentHp: def?.hp ?? 100,
    maxHp: def?.hp ?? 100,
    energies: [],
    statuses: [],
    talentUsed: false,
    modifiers: {},
  };
}

function makeEngine() {
  return new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: () => {},
  });
}

function setupSwapTest({ benchExtras = [] } = {}) {
  const engine = makeEngine();
  engine.reset({ gameMode: 'local2p' });
  engine.state.phase = 'main';
  engine.state.turn = 0;
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  const kasa = makeKnight('kasa-lyumnades');
  p0.active = makeKnight('isaac-kraken');
  p0.bench = [kasa, ...benchExtras];
  p1.active = makeKnight('kanon-dragon-mers');
  p1.bench = [];
  engine.switchActiveWithBench(0, 0);
  return { engine, p0, kasa: p0.active };
}

const kasaDef = getCardDef('kasa-lyumnades');
const salamandre = kasaDef.attacks.find((a) => a.name === 'Salamandre de Feu');
const illusion = kasaDef.attacks.find((a) => a.name === 'Illusion des Profondeurs');
assert('Salamandre de Feu damage 30', salamandre?.damage === 30);
assert('Illusion des Profondeurs damage 70', illusion?.damage === 70);
assert(
  'Illusion discard_energy opponent_active count 1',
  illusion?.effects?.some(
    (e) => e.type === 'discard_energy' && e.target === 'opponent_active' && e.count === 1,
  ),
);
assert(
  'Illusion confused status on opponent_active',
  illusion?.effects?.some(
    (e) => e.type === 'status' && e.target === 'opponent_active' && e.status === 'confused',
  ),
);
assert(
  'Illusion description mentions discard energy',
  illusion?.description?.includes('Défaussez une énergie attachée au chevalier actif adverse'),
);
assert(
  'talent requires_julian_or_kanon_in_play',
  kasaDef.talent?.effects?.some((e) => e.type === 'requires_julian_or_kanon_in_play'),
);
assert(
  'talent copy reduceCopiedAttackCost 1',
  kasaDef.talent?.effects?.some(
    (e) => e.type === 'copy_opponent_attack_on_active' && e.reduceCopiedAttackCost === 1,
  ),
);
assert(
  'talent text mentions Kanon',
  kasaDef.talent?.text?.includes('Kanon du Dragon des Mers'),
);
assert(
  'talent text mentions cost reduction',
  kasaDef.talent?.text?.includes('réduit de 1'),
);

assert(
  'playerHasJulianOrKanonDragonInPlay with Julian',
  playerHasJulianOrKanonDragonInPlay({
    active: null,
    bench: [makeKnight('julian-solo')],
  }),
);
assert(
  'playerHasJulianOrKanonDragonInPlay with Kanon active',
  playerHasJulianOrKanonDragonInPlay({
    active: makeKnight('kanon-dragon-mers'),
    bench: [],
  }),
);
assert(
  'playerHasJulianOrKanonDragonInPlay false without either',
  !playerHasJulianOrKanonDragonInPlay({
    active: makeKnight('kasa-lyumnades'),
    bench: [makeKnight('isaac-kraken')],
  }),
);
assert(
  'Julian alone still satisfies JulianOrKanon helper',
  playerHasJulianSoloInPlay({
    active: null,
    bench: [makeKnight('julian-solo')],
  }) && playerHasJulianOrKanonDragonInPlay({
    active: null,
    bench: [makeKnight('julian-solo')],
  }),
);

const resolver = new EffectResolver({ state: { players: [] } });
const reduced = resolver.applyCopiedAttackCostReduction(
  { name: 'Galaxian Explosion', cost: 4 },
  { reduceCopiedAttackCost: 1 },
);
assert('applyCopiedAttackCostReduction 4->3', reduced.cost === 3);
const minZero = resolver.applyCopiedAttackCostReduction(
  { name: 'Cheap', cost: 1 },
  { reduceCopiedAttackCost: 1 },
);
assert('applyCopiedAttackCostReduction min 0', minZero.cost === 0);

{
  const { engine, p0 } = setupSwapTest({ benchExtras: [makeKnight('julian-solo')] });
  assert('Julian on bench triggers copy pending', engine.state.pending?.type === 'pickCopyOpponentAttack');
  const triangle = engine.state.pending.attacks.find((a) => a.name === 'Triangle Doré');
  assert('Triangle Doré copied cost 1 (was 2)', triangle?.cost === 1);
  assert(
    'resolve copy stores reduced cost',
    engine.resolvePickCopyOpponentAttack(0, 'Triangle Doré'),
  );
  assert(
    'copiedAttackThisTurn cost 1',
    p0.active.modifiers.copiedAttackThisTurn?.cost === 1,
  );
  assert(
    'getEffectiveAttackCost uses reduced copy',
    engine.getEffectiveAttackCost(p0.active, p0.active.modifiers.copiedAttackThisTurn) === 1,
  );
  p0.active.energies.push({ instanceId: 'e-kasa-copy', cardId: 'energie-etoile' });
  engine.state.turnCount = 1;
  const opts = engine.getAttackOptions(0);
  const copiedOpt = opts.find((o) => o.attack.name === 'Triangle Doré');
  assert('copied attack listed in attack options', !!copiedOpt);
  assert('copied attack is usable with energy', copiedOpt?.canUse);
  const oppHpBefore = engine.state.players[1].active.currentHp;
  assert('engine.attack resolves copied attack index', engine.attack(0, copiedOpt.index));
  assert(
    'copied attack deals damage',
    engine.state.players[1].active.currentHp < oppHpBefore,
  );
}

{
  const { engine } = setupSwapTest({ benchExtras: [makeKnight('kanon-dragon-mers')] });
  assert('Kanon on bench triggers copy pending', engine.state.pending?.type === 'pickCopyOpponentAttack');
}

{
  const engine = makeEngine();
  engine.reset({ gameMode: 'local2p' });
  engine.state.phase = 'main';
  engine.state.turn = 0;
  const p0 = engine.state.players[0];
  p0.active = makeKnight('isaac-kraken');
  p0.bench = [makeKnight('kasa-lyumnades')];
  engine.state.players[1].active = makeKnight('kanon-dragon-mers');
  engine.switchActiveWithBench(0, 0);
  assert('no Julian/Kanon means no copy pending', engine.state.pending == null);
  assert('no Julian/Kanon means no copied attack', !p0.active.modifiers.copiedAttackThisTurn);
}

{
  const engine = makeEngine();
  engine.initAttackTest('kasa-lyumnades');
  const p1 = engine.state.players[1];
  p1.active.energies.push({ instanceId: 'e-opp', cardId: 'energie-etoile' });
  const illusionIdx = kasaDef.attacks.findIndex((a) => a.name === 'Illusion des Profondeurs');
  engine.attack(0, illusionIdx);
  assert('Illusion discards opponent active energy', p1.active.energies.length === 0);
  assert('Illusion applies confused', p1.active.statuses.includes('confused'));
}

console.log('All Kasa Illusion Trompeuse tests passed.');
