/**
 * Poison Checkup (règles Pokémon TCG) — node scripts/test-poison-checkup.mjs
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

function makeKnight(cardId, hp, instanceId = cardId) {
  const def = getCardDef(cardId);
  return {
    cardId,
    instanceId,
    maxHp: def?.hp ?? hp,
    currentHp: def?.hp ?? hp,
    energies: [],
    statuses: [],
    modifiers: {},
    talentUsed: false,
  };
}

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

// 1 — Checkup : actif empoisonné subit 10 PV
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const victim = engine.state.players[1].active;
  victim.statuses = ['poisoned'];
  const hpBefore = victim.currentHp;
  engine.resolvePoisonCheckup();
  const dmg = hpBefore - victim.currentHp;
  if (dmg !== RULES.status.poisoned.damagePerCheckup) {
    fail(`Checkup actif: attendu 10 dmg, reçu ${dmg}`);
  } else ok('Checkup actif empoisonné → 10 PV');
}

// 2 — Banc empoisonné : pas de tick
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const bench = engine.state.players[1].bench[0];
  bench.statuses = ['poisoned'];
  const hpBefore = bench.currentHp;
  engine.resolvePoisonCheckup();
  if (bench.currentHp !== hpBefore) fail('Checkup banc: le banc ne doit pas tick poison');
  else ok('Banc empoisonné : aucun tick au Checkup');
}

// 3 — Deux checkups consécutifs ≈ 20 PV/cycle
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const victim = engine.state.players[1].active;
  victim.statuses = ['poisoned'];
  const hpStart = victim.currentHp;
  engine.resolvePoisonCheckup();
  engine.resolvePoisonCheckup();
  const total = hpStart - victim.currentHp;
  if (total !== 20) fail(`Cycle poison: attendu 20 dmg, reçu ${total}`);
  else ok('Deux checkups → 20 PV total');
}

// 4 — Niobe : poison devient soin (+10)
{
  const engine = makeEngine();
  engine.initAttackTest('niobe_deep');
  const niobe = engine.state.players[0].active;
  niobe.statuses = ['poisoned'];
  niobe.currentHp = niobe.maxHp - 20;
  const hpBefore = niobe.currentHp;
  engine.resolvePoisonCheckup();
  const healed = niobe.currentHp - hpBefore;
  if (healed !== 10) fail(`Niobe heal: attendu +10, reçu +${healed}`);
  else ok('Niobe empoisonnée : +10 PV au Checkup');
}

// 5 — Retraite guérit le poison
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const active = engine.state.players[0].active;
  active.statuses = ['poisoned'];
  engine.onKnightSentToBench(active);
  if (active.statuses.includes('poisoned')) fail('Retraite: poison non retiré');
  else ok('Retraite au banc : poison soigné');
}

// 6 — endTurn : premier tick à la fin du tour de l'empoisonneur (pas au début du tour suivant)
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  engine.state.turn = 0;
  const victim = engine.state.players[1].active;
  victim.statuses = ['poisoned'];
  const hpBeforeEnd = victim.currentHp;

  const origStart = engine.processTurnStart.bind(engine);
  let hpAtTurnStartEntry = null;
  let hpAtTurnStartExit = null;
  engine.processTurnStart = async function (...args) {
    hpAtTurnStartEntry = this.state.players[1].active.currentHp;
    const result = await origStart(...args);
    hpAtTurnStartExit = this.state.players[1].active.currentHp;
    return result;
  };

  await engine.endTurn();

  const tickAtEnd = hpBeforeEnd - hpAtTurnStartEntry;
  if (tickAtEnd !== 10) fail(`endTurn checkup: attendu 10 dmg en fin de tour, reçu ${tickAtEnd}`);
  else if (hpAtTurnStartEntry !== hpAtTurnStartExit) {
    fail('Poison ne doit pas tick au début du tour suivant');
  } else ok('endTurn : 10 PV en fin de tour (pas au début du tour adverse)');
}

// 7 — Paralysé : toujours géré au début de tour (non régressé)
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const active = engine.state.players[0].active;
  active.statuses = ['paralyzed'];
  engine.state.turn = 0;
  await engine.endTurn();
  if (engine.state.players[0].active?.statuses.includes('paralyzed')) {
    fail('Paralysé: doit être retiré en fin de tour');
  } else ok('Paralysé : retiré en fin de tour (inchangé)');
}

process.exit(failed ? 1 : 0);
