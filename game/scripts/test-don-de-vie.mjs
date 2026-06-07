/**
 * Smoke test — Objet « Don de Vie » (don-de-vie)
 * Run: node scripts/test-don-de-vie.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal sync load for Node (fetch file:// unsupported). */
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

function mkKnight(cardId, currentHp) {
  const def = getCardDef(cardId);
  const maxHp = def?.hp ?? currentHp;
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp,
    maxHp,
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

const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
engine.reset({ headless: true, gameMode: 'local2p' });

const p0 = engine.state.players[0];
const p1 = engine.state.players[1];

p0.active = mkKnight('seiya-de-pegase', 40);
p1.active = mkKnight('shun_andromede', 50);

const damageTargetId = p1.active.instanceId;
const healTargetId = p0.active.instanceId;

p0.hand = [{ cardId: 'don-de-vie', instanceId: 'don-vie-hand-1' }];
engine.state.phase = 'main';
engine.state.turn = 0;
engine.state.pending = null;

const played = await engine.playObjetItemCard(0, 0, 'active');
assert(played, 'playObjetItemCard succeeds');
assert(engine.state.pending?.type === 'donDeVie', 'pending donDeVie after play');
assert(engine.state.pending.phase === 'damageTarget', 'phase damageTarget');

assert(
  engine.resolveDonDeViePick(0, damageTargetId),
  'pick damage target',
);
assert(engine.state.pending.phase === 'healTarget', 'phase healTarget');

assert(
  engine.resolveDonDeViePick(0, healTargetId),
  'pick heal target',
);
assert(engine.state.pending.phase === 'amount', 'phase amount');

const hpBeforeDmg = p1.active.currentHp;
const hpBeforeHeal = p0.active.currentHp;

assert(engine.resolveDonDeVieAmount(0, 25), 'resolve amount 25');
assert(!engine.state.pending, 'pending cleared');
assert(p1.active.currentHp === hpBeforeDmg - 25, 'opponent took 25 damage');
assert(p0.active.currentHp === hpBeforeHeal + 25, 'self healed 25');

// KO + deferred prizes
engine.reset({ headless: true, gameMode: 'local2p' });
const a = engine.state.players[0];
const b = engine.state.players[1];
b.active = mkKnight('shun_andromede', 10);
a.active = mkKnight('seiya-de-pegase', 100);
a.hand = [{ cardId: 'don-de-vie', instanceId: 'don-vie-hand-2' }];
engine.state.phase = 'main';
engine.state.turn = 0;

await engine.playObjetItemCard(0, 0, 'active');
engine.resolveDonDeViePick(0, b.active.instanceId);
engine.resolveDonDeViePick(0, a.active.instanceId);
engine.resolveDonDeVieAmount(0, 10);
await new Promise((r) => setTimeout(r, 50));

assert(!b.active, 'victim active cleared after KO');
assert(
  (a.modifiers.pendingPrizesAtEndTurn || 0) > 0,
  'prizes deferred to end of turn',
);

await engine.endTurn();
await new Promise((r) => setTimeout(r, 50));
assert(
  (a.modifiers.pendingPrizesAtEndTurn || 0) === 0,
  'deferred prizes resolved after endTurn',
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll Don de Vie tests passed.');
