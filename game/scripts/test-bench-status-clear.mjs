/**
 * États spéciaux retirés quand l'actif va au banc — node scripts/test-bench-status-clear.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
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

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

const ALL_STATUSES = Object.keys(RULES.status);

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

function makeBenchKnight(cardId, instanceId, statuses = []) {
  const def = getCardDef(cardId);
  return {
    cardId,
    instanceId,
    maxHp: def?.hp ?? 100,
    currentHp: def?.hp ?? 100,
    energies: [],
    statuses: [...statuses],
    modifiers: {},
    talentUsed: false,
  };
}

function assertCleared(knight, label) {
  if (!knight) {
    fail(`${label}: chevalier introuvable au banc`);
    return false;
  }
  for (const statusId of ALL_STATUSES) {
    if (knight.statuses.includes(statusId)) {
      fail(`${label}: ${statusId} non retiré`);
      return false;
    }
  }
  return true;
}

// 1 — Échange actif/banc : tous les états retirés sur l'ancien actif
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const p = engine.state.players[0];
  const oldInstanceId = p.active.instanceId;
  p.bench[0] = makeBenchKnight('vieux-maitre', 'bench-1');
  p.active.statuses = [...ALL_STATUSES];
  engine.switchActiveWithBench(0, 0);
  const oldActive = p.bench.find((k) => k?.instanceId === oldInstanceId);
  if (assertCleared(oldActive, 'Échange actif/banc')) {
    ok('Échange actif/banc : tous les états retirés');
  }
}

// 2 — Banc → actif : les états du remplaçant sont conservés
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const p = engine.state.players[0];
  p.bench[0] = makeBenchKnight('vieux-maitre', 'bench-1', ['frozen', 'poisoned']);
  p.active.statuses = [];
  engine.switchActiveWithBench(0, 0);
  if (!p.active.statuses.includes('frozen') || !p.active.statuses.includes('poisoned')) {
    fail('Banc→actif : les états du remplaçant doivent être conservés');
  } else ok('Banc→actif : états du remplaçant conservés');
}

// 3 — Retraite : états retirés (sans paralysé — bloque la retraite)
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const p = engine.state.players[0];
  const oldInstanceId = p.active.instanceId;
  const retreatCost = getCardDef(p.active.cardId).retreat || 0;
  for (let i = 0; i < retreatCost; i++) {
    p.active.energies.push({ cardId: 'energie-base', instanceId: `e-${i}` });
  }
  p.bench[0] = makeBenchKnight('vieux-maitre', 'bench-1');
  p.active.statuses = ['frozen', 'poisoned', 'confused'];
  const retreated = engine.retreat(0, 0);
  const oldActive = p.bench.find((k) => k?.instanceId === oldInstanceId);
  if (!retreated) fail('Retraite : action refusée');
  else if (assertCleared(oldActive, 'Retraite')) ok('Retraite : états retirés');
}

// 4 — Échange forcé adverse : tous les états retirés
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const p = engine.state.players[0];
  const oldInstanceId = p.active.instanceId;
  p.bench[0] = makeBenchKnight('vieux-maitre', 'bench-1');
  p.active.statuses = ['frozen', 'paralyzed'];
  engine.swapOpponentActiveWithBench(0, 0);
  const oldActive = p.bench.find((k) => k?.instanceId === oldInstanceId);
  if (assertCleared(oldActive, 'Échange adverse')) ok('Échange adverse : tous les états retirés');
}

// 5 — onKnightSentToBench direct (hook unitaire)
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const active = engine.state.players[0].active;
  active.statuses = [...ALL_STATUSES];
  engine.onKnightSentToBench(active);
  if (assertCleared(active, 'onKnightSentToBench')) ok('Hook onKnightSentToBench : tous les états retirés');
}

process.exit(failed ? 1 : 0);
