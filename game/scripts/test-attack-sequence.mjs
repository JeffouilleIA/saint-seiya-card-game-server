/**
 * Attack pipeline: damage/KO deferred until after finishAttack (headless).
 * node scripts/test-attack-sequence.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards } from '../cards.js';
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

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

// Basic melee attack applies damage after finishAttack in headless
{
  setTestCoinFlip(() => RULES.coin.heads);
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.initAttackTest('dokko-de-la-balance');
  const oppHpBefore = engine.state.players[1].active.currentHp;
  engine.attack(0, 0);
  await engine._aiWaitForCombatIdle?.();
  const oppDmg = oppHpBefore - engine.state.players[1].active.currentHp;
  if (oppDmg !== 20) fail(`Melee: expected 20 damage, got ${oppDmg}`);
  else ok('Melee attack damage applied after pipeline');
  setTestCoinFlip(null);
}

// Coin-flip attack: heads → damage after pipeline
{
  setTestCoinFlip(() => RULES.coin.heads);
  const engine = new GameEngine({ gameMode: 'local2p', headless: true });
  engine.initAttackTest('bronze_homme_docrates');
  const oppHpBefore = engine.state.players[1].active.currentHp;
  engine.attack(0, 0);
  await engine._aiWaitForCombatIdle?.();
  const oppDmg = oppHpBefore - engine.state.players[1].active.currentHp;
  if (oppDmg !== 10) fail(`Coin flip (heads): expected 10 damage, got ${oppDmg}`);
  else ok('Coin flip attack dealt damage after pipeline');
  setTestCoinFlip(null);
}

process.exit(failed ? 1 : 0);
