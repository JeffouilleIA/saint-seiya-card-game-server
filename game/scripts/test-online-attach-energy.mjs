/**
 * Vérifie attachEnergy en mode online2p (hôte + relay invité).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { applyRemoteGameAction, ONLINE_GUEST_METHODS } from '../online-actions.js';

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

const ENERGY_ID = 'energie-etoile';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`OK: ${msg}`);
}

function benchKnight(cardId, instanceId = `k-${cardId}`) {
  const def = getCardDef(cardId);
  return {
    instanceId,
    cardInstanceId: instanceId,
    cardId,
    currentHp: def.hp,
    maxHp: def.hp,
    energies: [],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

assert(ONLINE_GUEST_METHODS.has('attachEnergy'), 'attachEnergy whitelisted');

const engine = new GameEngine({ gameMode: 'online2p', headless: true });
engine.reset({ gameMode: 'online2p', deckLists: [[], []] });

const kagaho = benchKnight('kagaho_benou', 'kagaho-1');
const p1 = engine.state.players[1];
p1.active = kagaho;
p1.hand = [{ cardId: ENERGY_ID, instanceId: 'e-1' }];
p1.energyAttachmentsThisTurn = 0;
engine.state.turn = 1;
engine.state.phase = 'main';
engine.state.pending = null;
engine.resetTurnActions();

assert(engine.canAttachEnergy(1), 'guest canAttachEnergy');
assert(engine.attachEnergy(1, 0, 'active'), 'host direct attachEnergy');
assert(kagaho.energies.length === 1, 'Kagaho has 1 energy');

kagaho.energies = [];
p1.hand = [{ cardId: ENERGY_ID, instanceId: 'e-2' }];
p1.energyAttachmentsThisTurn = 0;
engine.resetTurnActions();

const relayOk = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'attachEnergy',
  args: [1, 0, 'active'],
  playerIndex: 1,
});
assert(relayOk === true, 'relay attach on guest turn succeeds');
assert(kagaho.energies.length === 1, 'relay attached energy to Kagaho');

p1.active = null;
p1.bench = [benchKnight('kagaho_benou', 'kagaho-bench')];
p1.hand = [{ cardId: ENERGY_ID, instanceId: 'e-3' }];
p1.energyAttachmentsThisTurn = 0;
engine.resetTurnActions();

const benchOk = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'attachEnergy',
  args: [1, 0, 0],
  playerIndex: 1,
});
assert(benchOk === true, 'bench relay attach succeeds');
assert(p1.bench[0].energies.length === 1, 'bench Kagaho has energy');

engine.state.turn = 0;
p1.hand = [{ cardId: ENERGY_ID, instanceId: 'e-4' }];
p1.bench[0].energies = [];
p1.energyAttachmentsThisTurn = 0;

const wrongTurn = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'attachEnergy',
  args: [1, 0, 0],
  playerIndex: 1,
});
assert(wrongTurn === false, 'guest attach rejected on host turn');
assert(p1.bench[0].energies.length === 0, 'no energy attached on wrong turn');

console.log('test-online-attach-energy: all checks passed');
