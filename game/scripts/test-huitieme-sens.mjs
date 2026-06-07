/**
 * Smoke test — Outil « 8e Sens » (huitieme-sens)
 * Run: node scripts/test-huitieme-sens.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';

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
                  : category === 'outil'
                    ? 'outil'
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

function mkKnight(cardId, opts = {}) {
  const def = getCardDef(cardId);
  const maxHp = def?.hp ?? opts.maxHp ?? 100;
  return {
    instanceId: opts.instanceId || `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: opts.cardInstanceId || `ci-${cardId}`,
    cardId,
    currentHp: opts.currentHp ?? maxHp,
    maxHp,
    energies: opts.energies || [],
    statuses: [],
    talentUsed: false,
    modifiers: {},
    attackedLastTurn: false,
    attackedThisTurn: false,
    attachedTool: opts.attachedTool ?? null,
    underCard: null,
  };
}

function mkEnergy(id) {
  return { cardId: 'energie-cosmique', instanceId: id };
}

function attachTool(knight, toolId = 'huitieme-sens') {
  knight.attachedTool = {
    cardId: toolId,
    name: getCardDef(toolId)?.name || '8e Sens',
    instanceId: `tool-${toolId}`,
  };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function resolveHuitiemeSensTransfer(engine, playerIndex, { count, targets = [] }) {
  let spins = 0;
  while (engine.state.pending?.type !== 'pickHuitiemeSensTransfer' && spins < 200) {
    await tick();
    spins++;
  }
  if (engine.state.pending?.type !== 'pickHuitiemeSensTransfer') return;
  engine.resolvePickHuitiemeSensCount(playerIndex, count);
  for (const targetId of targets) {
    spins = 0;
    while (
      engine.state.pending?.type === 'pickHuitiemeSensTransfer' &&
      engine.state.pending.phase !== 'target' &&
      spins < 200
    ) {
      await tick();
      spins++;
    }
    if (engine.state.pending?.type !== 'pickHuitiemeSensTransfer') break;
    engine.resolvePickHuitiemeSensTarget(playerIndex, targetId);
  }
  spins = 0;
  while (engine.state.pending?.type === 'pickHuitiemeSensTransfer' && spins < 200) {
    await tick();
    spins++;
  }
}

console.log('=== 8e Sens — card data ===\n');

const def = getCardDef('huitieme-sens');
assert(!!def, 'card huitieme-sens exists in database');
assert(def?.name === '8e Sens', 'name is 8e Sens');
assert(def?.category === 'outil', 'category is outil');
assert(def?.toolType === 'sens', 'toolType is sens');
assert(
  def?.passiveEffects?.some((e) => e.type === 'return_tool_to_hand_on_ko'),
  'passive effect return_tool_to_hand_on_ko',
);
assert(
  def?.passiveEffects?.find((e) => e.type === 'return_tool_to_hand_on_ko')?.maxEnergyTransfer === 2,
  'maxEnergyTransfer is 2',
);
assert(
  /remettez cet Outil dans votre main/i.test(def?.effectText || ''),
  'effectText mentions return to hand',
);

console.log('\n=== 8e Sens — KO mechanics ===\n');

const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
engine.reset({ headless: true, gameMode: 'local2p' });

const p0 = engine.state.players[0];
p0.prizes = [{ cardId: 'energie-cosmique', instanceId: 'prize-1' }];

const benchKnight = mkKnight('shiryu_dragon', {
  instanceId: 'bench-1',
  energies: [],
});
const activeKnight = mkKnight('seiya-de-pegase', {
  instanceId: 'active-1',
  energies: [
    mkEnergy('e-ko-1'),
    mkEnergy('e-ko-2'),
    mkEnergy('e-ko-3'),
  ],
});
attachTool(activeKnight);

p0.active = activeKnight;
p0.bench = [benchKnight];

const koPromise = engine.knockOut(p0, activeKnight, { noPrize: true });
await resolveHuitiemeSensTransfer(engine, 0, {
  count: 2,
  targets: ['bench-1', 'bench-1'],
});
await koPromise;

assert(!p0.active, 'KO active cleared');
assert(
  p0.hand.some((c) => c.cardId === 'huitieme-sens'),
  '8e Sens returned to hand on KO',
);
assert(
  !p0.discard.some((c) => c.cardId === 'huitieme-sens'),
  '8e Sens not discarded on KO',
);
assert(benchKnight.energies.length === 2, 'up to 2 energies transferred to bench knight');
assert(activeKnight.energies.length === 1, 'remaining energy stays on KO knight for discard');

// Manual pick: transfer 0 leaves all energies for discard
engine.reset({ headless: true, gameMode: 'local2p' });
const p0b = engine.state.players[0];
const benchB = mkKnight('shiryu_dragon', { instanceId: 'bench-b', energies: [] });
const activeB = mkKnight('seiya-de-pegase', {
  instanceId: 'active-b',
  energies: [mkEnergy('e-b-1'), mkEnergy('e-b-2')],
});
attachTool(activeB);
p0b.active = activeB;
p0b.bench = [benchB];
const koZero = engine.knockOut(p0b, activeB, { noPrize: true });
await resolveHuitiemeSensTransfer(engine, 0, { count: 0 });
await koZero;
assert(benchB.energies.length === 0, 'count 0 transfers no energy');
assert(
  p0b.discard.filter((c) => c.cardId === 'energie-cosmique').length === 2,
  'all energies discarded when transfer count is 0',
);

assert(
  p0.discard.filter((c) => c.cardId === 'energie-cosmique').length === 1,
  'leftover energy goes to discard',
);

// No other knights: tool still returns, all energies discarded
engine.reset({ headless: true, gameMode: 'local2p' });
const solo = engine.state.players[0];
const lone = mkKnight('seiya-de-pegase', {
  instanceId: 'solo-1',
  energies: [mkEnergy('e-solo-1'), mkEnergy('e-solo-2')],
});
attachTool(lone);
solo.active = lone;
solo.bench = [];

await engine.knockOut(solo, lone, { noPrize: true });

assert(
  solo.hand.some((c) => c.cardId === 'huitieme-sens'),
  '8e Sens returned even with no other knights',
);
assert(
  solo.discard.filter((c) => c.cardId === 'energie-cosmique').length === 2,
  'all energies discarded when no transfer target',
);

// Normal tool: discarded on KO
engine.reset({ headless: true, gameMode: 'local2p' });
const p2 = engine.state.players[0];
const withSept = mkKnight('seiya-de-pegase', { instanceId: 'sept-1' });
withSept.attachedTool = {
  cardId: 'septieme-sens',
  name: '7e Sens',
  instanceId: 'tool-sept',
};
p2.active = withSept;

await engine.knockOut(p2, withSept, { noPrize: true });

assert(
  p2.discard.some((c) => c.cardId === 'septieme-sens'),
  'other tools still discarded on KO',
);
assert(
  !p2.hand.some((c) => c.cardId === 'septieme-sens'),
  '7e Sens not returned to hand',
);

// Transfer during opponent turn (KO mid-attack — UI must allow acting player off-turn)
engine.reset({ headless: true, gameMode: 'local2p' });
engine.state.turn = 1;
const pOff = engine.state.players[0];
const benchOff = mkKnight('shiryu_dragon', { instanceId: 'bench-off', energies: [] });
const activeOff = mkKnight('seiya-de-pegase', {
  instanceId: 'active-off',
  energies: [mkEnergy('e-off-1'), mkEnergy('e-off-2')],
});
attachTool(activeOff);
pOff.active = activeOff;
pOff.bench = [benchOff];
const koOffTurn = engine.knockOut(pOff, activeOff, { noPrize: true });
await resolveHuitiemeSensTransfer(engine, 0, { count: 1, targets: ['bench-off'] });
await koOffTurn;
assert(benchOff.energies.length === 1, 'transfer resolves while turn is opponent');
assert(engine.state.turn === 1, 'turn unchanged during KO transfer');

// Bench KO: active knight can receive energy
engine.reset({ headless: true, gameMode: 'local2p' });
const pBenchKo = engine.state.players[0];
const benchKo = mkKnight('shiryu-du-dragon', {
  instanceId: 'bench-ko',
  energies: [mkEnergy('e-bko-1'), mkEnergy('e-bko-2')],
});
const activeRecv = mkKnight('seiya-de-pegase', {
  instanceId: 'active-recv',
  energies: [],
});
attachTool(benchKo);
pBenchKo.active = activeRecv;
pBenchKo.bench = [benchKo];
const koBench = engine.knockOut(pBenchKo, benchKo, { noPrize: true });
await resolveHuitiemeSensTransfer(engine, 0, { count: 1, targets: ['active-recv'] });
await koBench;
assert(activeRecv.energies.length === 1, 'energy can transfer to active when bench knight KO');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll 8e Sens tests passed.');
