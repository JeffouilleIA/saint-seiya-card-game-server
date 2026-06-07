/**
 * État Confus — node scripts/test-confused.mjs
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

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

// 1 — Pile : attaque échoue, 30 auto, adversaire intact
{
  setTestCoinFlip(() => RULES.coin.tails);
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const attacker = engine.state.players[0].active;
  const oppHpBefore = engine.state.players[1].active.currentHp;
  const hpBefore = attacker.currentHp;
  attacker.statuses = ['confused'];
  engine.attack(0, 0);
  const selfDmg = hpBefore - attacker.currentHp;
  const oppDmg = oppHpBefore - engine.state.players[1].active.currentHp;
  if (selfDmg !== RULES.status.confused.selfDamageOnTails) {
    fail(`Pile: attendu ${RULES.status.confused.selfDamageOnTails} auto-dégâts, reçu ${selfDmg}`);
  } else if (oppDmg !== 0) {
    fail(`Pile: adversaire ne doit pas prendre de dégâts (reçu ${oppDmg})`);
  } else if (!attacker.statuses.includes('confused')) {
    fail('Pile: Confus doit rester après échec d\'attaque');
  } else ok('Pile : échec, 30 auto, pas de dégâts adverses');
  setTestCoinFlip(null);
}

// 2 — Face : attaque normale (20 dégâts)
{
  setTestCoinFlip(() => RULES.coin.heads);
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const attacker = engine.state.players[0].active;
  attacker.statuses = ['confused'];
  const oppHpBefore = engine.state.players[1].active.currentHp;
  engine.attack(0, 0);
  const oppDmg = oppHpBefore - engine.state.players[1].active.currentHp;
  if (oppDmg !== 20) fail(`Face: attendu 20 dégâts, reçu ${oppDmg}`);
  else ok('Face : attaque normale malgré Confus');
  setTestCoinFlip(null);
}

// 3 — Quitte l'actif (échange) : Confus retiré
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const p = engine.state.players[0];
  const benchId = 'vieux-maitre';
  p.bench[0] = {
    cardId: benchId,
    instanceId: 'bench-1',
    maxHp: getCardDef(benchId).hp,
    currentHp: getCardDef(benchId).hp,
    energies: [],
    statuses: [],
    modifiers: {},
    talentUsed: false,
  };
  p.active.statuses = ['confused'];
  engine.switchActiveWithBench(0, 0);
  const oldActive = p.bench.find((k) => k?.cardId === 'dokko-de-la-balance');
  if (oldActive?.statuses?.includes('confused')) {
    fail('Échange : Confus doit être retiré sur l\'ancien actif au banc');
  } else ok('Échange actif/banc : Confus soigné');
}

// 4 — Évolution : Confus retiré
{
  const engine = makeEngine();
  engine.initAttackTest('vieux-maitre');
  const p = engine.state.players[0];
  p.active.statuses = ['confused'];
  p.hand = [{ cardId: 'dokko-de-la-balance', instanceId: 'evo-test' }];
  engine.state.evolveEligibleAtTurnStart[0] = [p.active.instanceId];
  const okEvo = engine.evolveCosmo(0, 0, 'active');
  if (!okEvo) fail('Évolution test setup failed');
  else if (p.active.statuses.includes('confused')) fail('Évolution : Confus non retiré');
  else ok('Évolution : Confus soigné');
}

// 5 — Soin : Confus retiré
{
  const engine = makeEngine();
  engine.initAttackTest('dokko-de-la-balance');
  const knight = engine.state.players[0].active;
  knight.statuses = ['confused'];
  knight.currentHp = knight.maxHp - 40;
  engine.effects.applyHealToKnight(
    engine.state.players[0],
    knight,
    30,
    0,
    'active',
  );
  if (knight.statuses.includes('confused')) fail('Soin : Confus non retiré');
  else ok('Soin : Confus soigné');
}

// 6 — Règles documentées
{
  const c = RULES.status.confused;
  if (
    !c.attackRequiresCoin ||
    c.selfDamageOnTails !== 30 ||
    !c.clearsOnLeaveActive ||
    !c.clearsOnEvolve ||
    !c.clearsOnHeal
  ) {
    fail('rules.js : métadonnées Confus incomplètes');
  } else ok('rules.js : règle Confus documentée');
}

process.exit(failed ? 1 : 0);
