/**
 * Vérifie le relay « Fin de tour » invité → hôte (engineCall sans playerIndex).
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
    energies: [{ cardId: 'energie-etoile', instanceId: `e-${instanceId}` }],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

assert(ONLINE_GUEST_METHODS.has('endTurn'), 'endTurn whitelisted');

const engine = new GameEngine({ gameMode: 'online2p', headless: true });
engine.reset({ gameMode: 'online2p', deckLists: [[], []] });

engine.state.players[0].active = benchKnight('seiya-de-pegase', 'seiya-0');
engine.state.players[1].active = benchKnight('shiryu-du-dragon', 'shiryu-1');
engine.state.turn = 1;
engine.state.phase = 'main';
engine.state.pending = null;
engine.state.turnCount = 2;
engine.resetTurnActions();

const relayOk = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'endTurn',
  args: [],
  playerIndex: 1,
});
assert(relayOk === true, 'guest endTurn engineCall accepted on guest turn');
assert(engine.state.turn === 0, 'turn passed to host after guest endTurn');

engine.state.turn = 0;
engine.state.phase = 'main';
engine.state.pending = null;
engine.resetTurnActions();
const wrongTurn = await applyRemoteGameAction(engine, {
  type: 'engineCall',
  method: 'endTurn',
  args: [],
  playerIndex: 1,
});
assert(wrongTurn === false, 'guest endTurn rejected on host turn');
assert(engine.state.turn === 0, 'turn unchanged after rejected endTurn');

engine.state.turn = 1;
engine.state.phase = 'main';
engine.resetTurnActions();
const legacyOk = await applyRemoteGameAction(engine, {
  type: 'endTurn',
  playerIndex: 1,
});
assert(legacyOk === true, 'legacy endTurn action type still works');
assert(engine.state.turn === 0, 'turn passed after legacy endTurn');

console.log('test-online-end-turn: all checks passed');
