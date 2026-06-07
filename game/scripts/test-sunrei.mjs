/**
 * Sunrei resurrection — end-of-turn timing, status clear, poison KO scenario.
 * Run: node scripts/test-sunrei.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES } from '../rules.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCardsSyncForTest() {
  const files = ['cards.json', 'objets.json'];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(projectRoot, 'data', file), 'utf8'));
    for (const c of raw) {
      if (!c?.id) continue;
      const category = c.category || 'chevalier';
      CARD_DATABASE[c.id] = {
        ...c,
        cardType:
          category === 'objet'
            ? 'objet'
            : category === 'supporter'
              ? 'supporter'
              : category === 'energie'
                ? 'energie'
                : category === 'stade'
                  ? 'stade'
                  : 'chevalier',
      };
    }
  }
}

loadCardsSyncForTest();

let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('OK:', msg);
  }
}

function mkKnight(cardId, currentHp, statuses = []) {
  const def = getCardDef(cardId);
  const maxHp = def?.hp ?? currentHp;
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp,
    maxHp,
    energies: [],
    statuses: [...statuses],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: null,
    underCard: null,
  };
}

function setupSunreiProtected(engine) {
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 40);
  p1.active = mkKnight('shun_andromede', 100);
  engine.state.phase = 'main';
  engine.state.turn = 1;
  engine.state.pending = null;
  engine.resetTurnActions();
  const sunreiDef = getCardDef('supporter_sunrei');
  const eff = sunreiDef.effects.find((e) => e.type === 'survie');
  engine.effects.applySunreiProtection(0, eff);
  return { p0, p1 };
}

// 1 — KO différé : pas de résurrection immédiate
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const { p0 } = setupSunreiProtected(engine);

  engine.damageKnight(p0, p0.active, 40, 'attack');
  assert(p0.active.currentHp <= 0, 'knight at 0 HP after lethal damage');
  assert(
    p0.modifiers.sunreiProtection?.pendingRevive === true,
    'pendingRevive set on KO',
  );
  assert(p0.active.currentHp !== 10, 'no immediate heal to 10 HP');
  assert(p0.active === engine.state.players[0].active, 'knight still active (no KO)');
}

// 2 — Résurrection en fin de tour adverse avec statuts retirés
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const { p0 } = setupSunreiProtected(engine);
  p0.active.statuses = ['poisoned', 'paralyzed', 'confused', 'frozen'];

  engine.damageKnight(p0, p0.active, 40, 'attack');
  assert(p0.active.currentHp <= 0, 'knight KO pending');

  const endingIndex = engine.state.turn;
  engine.resolvePoisonCheckup();
  assert(p0.active.currentHp <= 0, 'still at 0 after poison checkup (pending revive)');
  engine.effects.resolveSunreiEndOfTurnRevivals(endingIndex);

  assert(p0.active.currentHp === 10, 'revived to 10 HP at end of turn');
  assert(p0.active.statuses.length === 0, 'all special statuses cleared on revive');
  assert(!p0.modifiers.sunreiProtection, 'protection cleared after revive');
}

// 3 — Poison KO : pas de tick poison ni de double mort en fin de tour
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const { p0 } = setupSunreiProtected(engine);
  p0.active.statuses = ['poisoned'];
  p0.active.currentHp = 10;

  engine.damageKnight(p0, p0.active, 10, 'attack');
  assert(p0.active.currentHp <= 0, 'poisoned knight KO by attack');
  assert(p0.active.statuses.includes('poisoned'), 'still poisoned while pending revive');

  const hpBeforeCheckup = p0.active.currentHp;
  engine.resolvePoisonCheckup();
  assert(
    p0.active.currentHp === hpBeforeCheckup,
    'poison checkup skipped for pending Sunrei revive',
  );

  const endingIndex = engine.state.turn;
  engine.effects.resolveSunreiEndOfTurnRevivals(endingIndex);
  assert(p0.active.currentHp === 10, 'revived to 10 after poison KO');
  assert(!p0.active.statuses.includes('poisoned'), 'poison removed on revive');
}

// 4 — endTurn complet : résurrection après checkup poison
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const { p0 } = setupSunreiProtected(engine);
  p0.active.statuses = ['poisoned'];
  p0.active.currentHp = 5;

  engine.damageKnight(p0, p0.active, 5, 'attack');
  const prizesBefore = engine.state.players[1].prizesTaken ?? 0;

  await engine.endTurn();

  assert(p0.active?.currentHp === 10, 'endTurn revives Sunrei knight to 10 HP');
  assert(!p0.active?.statuses?.includes('poisoned'), 'endTurn revive clears poison');
  assert(
    (engine.state.players[1].prizesTaken ?? 0) === prizesBefore,
    'opponent took no prize (preventKO)',
  );
}

// 5 — Protection expire sans KO : pas de résurrection
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const { p0 } = setupSunreiProtected(engine);
  p0.active.currentHp = 30;

  await engine.endTurn();
  assert(p0.active.currentHp === 30, 'no revive when knight was not KO');
  assert(!p0.modifiers.sunreiProtection, 'protection expired without revive');
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll Sunrei tests passed.');
