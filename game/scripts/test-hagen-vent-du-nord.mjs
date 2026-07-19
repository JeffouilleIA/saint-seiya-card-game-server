/**
 * Hagen de Merak — Vent du Nord (pièce : pile = gelé, face = paralysé)
 * node scripts/test-hagen-vent-du-nord.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES, setTestCoinFlip } from '../rules.js';

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

const CARD_ID = 'hagen_merak';
const ATTACK_INDEX = 2; // Vent du Nord

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

async function waitAttackEffects(engine) {
  await engine._aiWaitForCombatIdle?.();
  await new Promise((r) => setTimeout(r, 50));
}

const def = getCardDef(CARD_ID);
const attack = def?.attacks?.[ATTACK_INDEX];
if (!attack || attack.name !== 'Vent du Nord') {
  fail(`Attaque Vent du Nord introuvable (index ${ATTACK_INDEX})`);
  process.exit(1);
}

const headsEff = attack.effects.find((e) => e.type === 'status_on_heads');
const tailsEff = attack.effects.find((e) => e.type === 'status_on_tails');
if (headsEff?.status !== 'paralyzed' || tailsEff?.status !== 'frozen') {
  fail(
    `JSON : attendu face→paralysé / pile→gelé, reçu heads=${headsEff?.status} tails=${tailsEff?.status}`,
  );
} else {
  ok('JSON : face → paralysé, pile → gelé');
}

// Pile → gelé
{
  setTestCoinFlip(() => RULES.coin.tails);
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const opp = engine.state.players[1].active;
  opp.statuses = [];
  engine.attack(0, ATTACK_INDEX);
  await waitAttackEffects(engine);
  if (opp.statuses.includes('frozen') && !opp.statuses.includes('paralyzed')) {
    ok('Pile : adversaire gelé');
  } else {
    fail(`Pile : attendu gelé, statuts=${opp.statuses.join(',') || '(aucun)'}`);
  }
  setTestCoinFlip(null);
}

// Face → paralysé
{
  setTestCoinFlip(() => RULES.coin.heads);
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const opp = engine.state.players[1].active;
  opp.statuses = [];
  engine.attack(0, ATTACK_INDEX);
  await waitAttackEffects(engine);
  if (opp.statuses.includes('paralyzed') && !opp.statuses.includes('frozen')) {
    ok('Face : adversaire paralysé');
  } else {
    fail(`Face : attendu paralysé, statuts=${opp.statuses.join(',') || '(aucun)'}`);
  }
  setTestCoinFlip(null);
}

process.exit(failed ? 1 : 0);
