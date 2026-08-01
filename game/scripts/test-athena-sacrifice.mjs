/**
 * Talent Sacrifice d'Athéna — KO du chevalier Athéna (≥2 Énergies), prizes, promote, fin de tour.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, getPrizeCountForKnockout } from '../cards.js';
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

function knight(cardId, id, energyCount = 0) {
  const def = getCardDef(cardId);
  const energies = [];
  for (let i = 0; i < energyCount; i++) {
    energies.push({ cardId: 'energie-etoile', instanceId: `e-${id}-${i}` });
  }
  return {
    instanceId: id,
    cardInstanceId: id,
    cardId,
    currentHp: def.hp,
    maxHp: def.hp,
    energies,
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

function wait(ms = 50) {
  return new Promise((r) => setTimeout(r, ms));
}

const athenaDef = getCardDef('athena');
assert('athena has athena_sacrifice', athenaDef.talent.effects.some((e) => e.type === 'athena_sacrifice'));
assert('athena rewardCards 5', getPrizeCountForKnockout(athenaDef) === 5);

// Actif avec 2 énergies : KO + promote + fin de tour
{
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.reset({ gameMode: 'local2p', deckLists: [[], []] });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = knight('athena', 'ath-active', 2);
  p0.bench = [knight('seiya-de-pegase', 'seiya-b')];
  p0.prizes = Array.from({ length: 7 }, (_, i) => ({ cardId: 'energie-etoile', instanceId: `pr0-${i}` }));
  p1.active = knight('shiryu-du-dragon', 'shiryu');
  p1.prizes = Array.from({ length: 7 }, (_, i) => ({ cardId: 'energie-etoile', instanceId: `pr1-${i}` }));
  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.state.turnCount = 2;
  engine.state.pending = null;
  engine.resetTurnActions();

  const oppHpBefore = p1.active.currentHp;
  const prizesBefore = p1.prizes.length;
  assert('can use sacrifice on active', engine.canUseTalent(0, 'active'));
  const ok = engine.useTalent(0, 'active');
  assert('useTalent sacrifice ok', ok === true);
  await wait(80);

  assert('athena removed from active', p0.active?.cardId !== 'athena');
  assert('opponent not damaged by old 110 effect', p1.active.currentHp === oppHpBefore);
  assert(
    'opponent queued Athena prizes (5) until end of turn',
    (p1.modifiers.pendingPrizesAtEndTurn || 0) === 5,
  );
  assert('promote pending after active sacrifice', engine.state.pending?.type === 'promoteActive');
  assert('end-turn deferred until promote', engine.state.turn === 0);

  const promoted = engine.promoteActive(0, 0);
  assert('promote replacement ok', promoted === true);
  await wait(120);
  assert('turn ended after promote', engine.state.turn === 1);
  assert('seiya is new active', p0.active?.cardId === 'seiya-de-pegase');
  assert('opponent took Athena prizes after end turn', p1.prizes.length === prizesBefore - 5);
  assert('pending prizes cleared', !(p1.modifiers.pendingPrizesAtEndTurn > 0));
}

// Banc avec 2 énergies : KO sans promote, fin de tour
{
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.reset({ gameMode: 'local2p', deckLists: [[], []] });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = knight('seiya-de-pegase', 'seiya-a');
  p0.bench = [knight('athena', 'ath-bench', 2)];
  p0.prizes = Array.from({ length: 7 }, (_, i) => ({ cardId: 'energie-etoile', instanceId: `bpr0-${i}` }));
  p1.active = knight('shiryu-du-dragon', 'shiryu2');
  p1.prizes = Array.from({ length: 7 }, (_, i) => ({ cardId: 'energie-etoile', instanceId: `bpr1-${i}` }));
  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.state.turnCount = 2;
  engine.state.pending = null;
  engine.resetTurnActions();

  const prizesBefore = p1.prizes.length;
  assert('can use sacrifice on bench', engine.canUseTalent(0, 0));
  assert('useTalent bench sacrifice', engine.useTalent(0, 0) === true);
  await wait(120);

  assert('athena gone from bench', !p0.bench.some((k) => k?.cardId === 'athena'));
  assert('active unchanged', p0.active?.cardId === 'seiya-de-pegase');
  assert('no promote pending', engine.state.pending == null);
  assert('turn ended after bench sacrifice', engine.state.turn === 1);
  assert('opponent took 5 prizes after end turn', p1.prizes.length === prizesBefore - 5);
}

// Moins de 2 énergies : refus
{
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.reset({ gameMode: 'local2p', deckLists: [[], []] });
  const p0 = engine.state.players[0];
  p0.active = knight('athena', 'ath-poor', 1);
  p0.bench = [knight('seiya-de-pegase', 's2')];
  engine.state.turn = 0;
  engine.state.phase = 'main';
  engine.state.turnCount = 2;
  engine.resetTurnActions();
  assert('cannot use with 1 energy', engine.canUseTalent(0, 'active') === false);
  assert('useTalent rejected with 1 energy', engine.useTalent(0, 'active') === false);
}

console.log('test-athena-sacrifice: all checks passed');
