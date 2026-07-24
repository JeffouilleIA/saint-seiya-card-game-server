/**
 * Vérifie attack relay invité → hôte en mode online2p.
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

assert(ONLINE_GUEST_METHODS.has('attack'), 'attack whitelisted');

const engine = new GameEngine({ gameMode: 'online2p', headless: true });
engine.reset({ gameMode: 'online2p', deckLists: [[], []] });

const guestActive = benchKnight('seiya-de-pegase', 'seiya-1');
guestActive.energies = [{ cardId: 'energie-etoile', instanceId: 'e-1' }];
const oppActive = benchKnight('shiryu-du-dragon', 'shiryu-1');
oppActive.energies = [{ cardId: 'energie-etoile', instanceId: 'e-2' }];

const p0 = engine.state.players[0];
const p1 = engine.state.players[1];
p0.active = oppActive;
p1.active = guestActive;
engine.state.turn = 1;
engine.state.phase = 'main';
engine.state.pending = null;
engine.state.turnCount = 2;
engine.resetTurnActions();

const opts = engine.getAttackOptions(1);
assert(opts.some((o) => o.canUse), 'guest has usable attack');
const attackIndex = opts.findIndex((o) => o.canUse);
assert(attackIndex >= 0, 'attack index found');

const relayOk = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'attack',
  args: [1, attackIndex],
  playerIndex: 1,
});
assert(relayOk === true, 'guest attack relay accepted on guest turn');

engine.state.turn = 0;
engine.resetTurnActions();
const wrongTurn = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'attack',
  args: [1, attackIndex],
  playerIndex: 1,
});
assert(wrongTurn === false, 'guest attack rejected on host turn');

console.log('test-online-attack: all checks passed');
