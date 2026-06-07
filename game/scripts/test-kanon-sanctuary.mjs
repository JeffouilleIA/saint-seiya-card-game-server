/**
 * Kanon — Sanctuaire Sous-Marin : choix Marina (attach / move) en local2p.
 * node scripts/test-kanon-sanctuary.mjs
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

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function makeKnight(cardId, energies = []) {
  const hp = getCardDef(cardId)?.hp ?? 100;
  return {
    instanceId: `k-${cardId}`,
    cardId,
    currentHp: hp,
    maxHp: hp,
    energies: energies.map((e, i) => ({
      cardId: e,
      instanceId: `e-${cardId}-${i}`,
    })),
    statuses: [],
    talentUsed: false,
    modifiers: {},
  };
}

const engine = new GameEngine({ gameMode: 'local2p' });
engine.reset({ gameMode: 'local2p' });
const p0 = engine.state.players[0];

p0.active = makeKnight('kanon-dragon-mers');
p0.bench = [
  makeKnight('kasa-lyumnades'),
  makeKnight('isaac-kraken', ['energie-etoile']),
];
p0.hand = [{ cardId: 'energie-etoile', instanceId: 'h-energy-1' }];
p0.bench.push(makeKnight('julian-solo'));

engine.state.pending = {
  type: 'pickKanonSanctuary',
  playerIndex: 0,
  knightInstanceId: p0.active.instanceId,
  oncePerTurn: true,
};

assert(engine.needsPlayerChoice(0), 'local2p needs choice');
let ok = engine.resolvePickKanonSanctuary(0, 'attach');
assert(ok, 'attach starts targeting');
assert(engine.state.pending?.phase === 'attach', 'pending attach phase');
assert(!engine.resolveAnyAiPending(), 'no AI auto-resolve in local2p');

ok = engine.resolvePickKanonSanctuaryTarget(0, 0);
assert(ok, 'attach to kasa bench');
assert(!engine.state.pending, 'pending cleared');
assert(p0.bench[0].energies.length === 1, 'energy on kasa');
assert(p0.hand.length === 0, 'energy removed from hand');
assert(p0.active.modifiers.talentOnceThisTurn, 'once per turn flag');

// move: isaac (idx 1) -> kasa (idx 0)
engine.state.pending = {
  type: 'pickKanonSanctuary',
  playerIndex: 0,
  knightInstanceId: p0.active.instanceId,
  oncePerTurn: false,
};
p0.active.talentUsed = false;
p0.active.modifiers.talentOnceThisTurn = false;

ok = engine.resolvePickKanonSanctuary(0, 'move');
assert(ok, 'move starts');
assert(engine.state.pending?.phase === 'moveFrom', 'moveFrom phase');

ok = engine.resolvePickKanonSanctuaryTarget(0, 1);
assert(ok, 'picked source isaac');
assert(engine.state.pending?.phase === 'moveTo', 'moveTo phase');

ok = engine.resolvePickKanonSanctuaryTarget(0, 0);
assert(ok, 'moved to kasa');
assert(p0.bench[1].energies.length === 0, 'isaac lost energy');
assert(p0.bench[0].energies.length === 2, 'kasa has prior attach + moved energy');

// AI mode: auto attach first marina (ai-battle = both sides can be AI-controlled)
engine.reset({ gameMode: 'ai-battle' });
const aiP = engine.state.players[0];
aiP.active = makeKnight('kanon-dragon-mers');
aiP.bench = [makeKnight('kasa-lyumnades'), makeKnight('julian-solo')];
aiP.hand = [{ cardId: 'energie-etoile', instanceId: 'ai-e1' }];
engine.state.pending = {
  type: 'pickKanonSanctuary',
  playerIndex: 0,
  knightInstanceId: aiP.active.instanceId,
  oncePerTurn: true,
};
assert(engine.isAiControlled(0), 'player 0 is AI');
ok = engine.resolvePickKanonSanctuary(0, 'attach');
assert(ok, 'AI attach resolves without phase');
assert(!engine.state.pending, 'AI no pending after attach');
assert(aiP.active.energies.length === 1, 'AI attached to first marina (active)');

// useTalent end-to-end: local2p creates pickKanonSanctuary pending
engine.reset({ gameMode: 'local2p' });
const p0b = engine.state.players[0];
p0b.active = makeKnight('kanon-dragon-mers');
p0b.bench = [makeKnight('kasa-lyumnades'), makeKnight('julian-solo')];
p0b.hand = [{ cardId: 'energie-etoile', instanceId: 'h-energy-2' }];
engine.state.turn = 0;
engine.state.phase = 'main';
engine.state.pending = null;
ok = engine.useTalent(0, 'active');
assert(ok, 'useTalent creates sanctuary pending');
assert(engine.state.pending?.type === 'pickKanonSanctuary', 'pending type pickKanonSanctuary');
assert(!engine.state.pending?.phase, 'initial pending has no phase');
assert(engine.needsPlayerChoice(0), 'local2p needs choice after useTalent');

console.log('OK: test-kanon-sanctuary.mjs');
