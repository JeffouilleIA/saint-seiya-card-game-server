/**
 * KO / prize timing — immediate field removal, deferred prizes at end of turn.
 * Run: node scripts/test-ko-prize-timing.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';
import { RULES, setTestCoinFlip } from '../rules.js';

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

function mkKnight(cardId, currentHp, extra = {}) {
  const def = getCardDef(cardId);
  const maxHp = def?.hp ?? currentHp;
  return {
    instanceId: extra.instanceId || `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: extra.cardInstanceId || `ci-${cardId}`,
    cardId,
    currentHp,
    maxHp,
    energies: extra.energies || [],
    statuses: extra.statuses || [],
    talentUsed: false,
    modifiers: extra.modifiers || {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: extra.attachedTool ?? null,
    underCard: extra.underCard ?? null,
  };
}

async function waitIdle(engine) {
  await engine._aiWaitForCombatIdle?.();
  await new Promise((r) => setTimeout(r, 30));
}

// 1 — Attack KO: active removed during damage phase, prizes deferred until endTurn
{
  setTestCoinFlip(() => RULES.coin.heads);
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 100, {
    energies: [{ cardId: 'energie-commune', instanceId: 'e-atk-1' }],
  });
  p1.active = mkKnight('shun_andromede', 10);
  p1.bench = [];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;
  engine.state.turnCount = 1;
  engine.state.pending = null;
  engine.resetTurnActions();

  const prizesBefore = p0.prizesTaken ?? 0;
  const attacks = engine.getAttackOptions(0);
  const meleeIdx = attacks.findIndex((a) => a.canUse && (a.attack?.damage || 0) >= 10)?.index ?? 0;
  engine.attack(0, meleeIdx);
  await waitIdle(engine);

  assert(!p1.active, 'attack KO clears active after lethal damage');
  assert(
    (p0.modifiers.pendingPrizesAtEndTurn || 0) > 0,
    'attack KO defers prizes to end of turn',
  );
  assert(
    (p0.prizesTaken ?? 0) === prizesBefore,
    'no prize taken during attack pipeline',
  );

  await engine.endTurn();
  await waitIdle(engine);
  assert(
    (p0.modifiers.pendingPrizesAtEndTurn || 0) === 0,
    'pending prizes cleared after endTurn',
  );
  assert(
    (p0.prizesTaken ?? 0) > prizesBefore,
    'prizes awarded at end of attacker turn',
  );
  setTestCoinFlip(null);
}

// 2 — Multiple KOs same turn accumulate deferred prizes
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 100);
  p1.active = mkKnight('shun_andromede', 10);
  p1.bench = [mkKnight('shiryu-du-dragon', 10)];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  engine.damageKnight(p1, p1.active, 10, 'talent');
  await waitIdle(engine);
  engine.damageKnight(p1, p1.bench[0], 10, 'talent');
  await waitIdle(engine);

  const pending = p0.modifiers.pendingPrizesAtEndTurn || 0;
  assert(pending >= 2, `multiple KOs queue ${pending} deferred prizes (expected >= 2)`);
  assert(!p1.active && p1.bench.length === 0, 'both knights removed from field');

  const prizesBefore = p0.prizesTaken ?? 0;
  await engine.endTurn();
  await waitIdle(engine);
  assert(
    (p0.prizesTaken ?? 0) >= prizesBefore + 2,
    'all deferred prizes resolved together at endTurn',
  );
}

// 3 — Poison KO at end of turn resolves prizes same endTurn (opponent taker)
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 10, { statuses: ['poisoned'] });
  p1.active = mkKnight('shun_andromede', 100);
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  const oppPrizesBefore = p1.prizesTaken ?? 0;
  await engine.endTurn();
  await waitIdle(engine);

  assert(!p0.active, 'poison checkup KO removes active');
  assert(
    (p1.prizesTaken ?? 0) > oppPrizesBefore,
    'poison KO prizes awarded during same endTurn',
  );
}

// 4 — Direct knockOut (non-attack): immediate removal + deferred prizes
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 100);
  p1.active = mkKnight('shun_andromede', 10);
  p1.bench = [mkKnight('shiryu-du-dragon', 50)];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  engine.state.turnCount = 1;

  const victim = p1.active;
  const koPromise = engine.knockOut(p1, victim, { source: 'talent' });
  assert(!p1.active, 'knockOut removes active synchronously before first await');
  await koPromise;
  assert(
    (p0.modifiers.pendingPrizesAtEndTurn || 0) > 0,
    'direct knockOut defers prizes',
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll KO/prize timing tests passed.');
