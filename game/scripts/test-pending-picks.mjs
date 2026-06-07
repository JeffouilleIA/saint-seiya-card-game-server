/**
 * Engine smoke tests for pending pick flows restored in ui.js
 * node scripts/test-pending-picks.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCardsSyncForTest() {
  for (const file of ['cards.json', 'objets.json', 'supporters.json']) {
    try {
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
    } catch {
      /* optional file */
    }
  }
}

loadCardsSyncForTest();

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('OK:', msg);
  }
};

function mkKnight(cardId, currentHp, instanceId = `inst-${cardId}`) {
  const def = getCardDef(cardId);
  return {
    instanceId,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp,
    maxHp: def?.hp ?? currentHp,
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

// pickHealAllyNextTurn
{
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 50, 'heal-a');
  p0.bench = [mkKnight('shun_andromede', 40, 'heal-b')];
  engine.state.pending = {
    type: 'pickHealAllyNextTurn',
    playerIndex: 0,
    amount: 20,
    options: [
      { target: 'active', instanceId: 'heal-a' },
      { target: 0, instanceId: 'heal-b' },
    ],
  };
  assert(engine.resolvePickHealAllyNextTurn(0, 'heal-b'), 'pickHealAllyNextTurn resolves');
  assert(!engine.state.pending, 'pickHealAllyNextTurn clears pending');
  assert(p0.bench[0].currentHp === 60, 'pickHealAllyNextTurn heals bench');
}

// lookTopPickOne
{
  const p0 = engine.state.players[0];
  p0.deck = [];
  engine.state.pending = {
    type: 'lookTopPickOne',
    playerIndex: 0,
    cards: [
      { cardId: 'don-de-vie', instanceId: 'pick-a' },
      { cardId: 'energie-cosmique', instanceId: 'pick-b' },
    ],
    sourceLabel: 'Test',
  };
  assert(engine.resolveLookTopPickOne(0, 'pick-a'), 'lookTopPickOne resolves');
  assert(!engine.state.pending, 'lookTopPickOne clears pending');
  assert(p0.hand.some((c) => c.instanceId === 'pick-a'), 'lookTopPickOne adds to hand');
  assert(p0.discard.some((c) => c.instanceId === 'pick-b'), 'lookTopPickOne discards rest');
}

// voluntarySacrificePick
{
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 80, 'sac-a');
  p0.bench = [mkKnight('shun_andromede', 70, 'sac-b')];
  engine.state.pending = {
    type: 'voluntarySacrificePick',
    playerIndex: 0,
    options: [
      { zone: 'active', instanceId: 'sac-a' },
      { zone: 0, instanceId: 'sac-b' },
    ],
  };
  assert(engine.resolveVoluntarySacrificeKnight(0, 'sac-b'), 'voluntarySacrificePick resolves');
  assert(!engine.state.pending, 'voluntarySacrificePick clears pending');
}

// pickHuitiemeSensTransfer (count + target)
{
  const p0 = engine.state.players[0];
  const ko = mkKnight('shun_andromede', 0, 'hs-ko');
  ko.energies = [{ cardId: 'energie-cosmique', instanceId: 'e1' }];
  const bench = mkKnight('seiya-de-pegase', 90, 'hs-bench');
  p0.active = ko;
  p0.bench = [bench];
  engine.state.pending = {
    type: 'pickHuitiemeSensTransfer',
    playerIndex: 0,
    phase: 'count',
    koKnightInstanceId: 'hs-ko',
    maxTransfer: 1,
    options: [{ instanceId: 'hs-bench', target: 0 }],
  };
  assert(engine.resolvePickHuitiemeSensCount(0, 1), '8e Sens count');
  assert(engine.state.pending?.phase === 'target', '8e Sens target phase');
  assert(engine.resolvePickHuitiemeSensTarget(0, 'hs-bench'), '8e Sens target');
  assert(!engine.state.pending, '8e Sens cleared');
  assert(bench.energies.length === 1, '8e Sens energy moved');
}

// pickCopyOpponentAttack
{
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p0.active = mkKnight('seiya-de-pegase', 100, 'copy-self');
  p1.active = mkKnight('shun_andromede', 100, 'copy-opp');
  engine.state.pending = {
    type: 'pickCopyOpponentAttack',
    playerIndex: 0,
    knightInstanceId: 'copy-self',
    attacks: [{ name: 'Chaîne', sourceName: 'Andromède' }],
  };
  assert(engine.resolvePickCopyOpponentAttack(0, 'Chaîne'), 'pickCopyOpponentAttack');
  assert(!engine.state.pending, 'pickCopyOpponentAttack cleared');
  assert(p0.active.modifiers.copiedAttackThisTurn?.name === 'Chaîne', 'attack copied');
}

// pickIoBigTornadoStatus (minimal)
{
  engine.state.pending = {
    type: 'pickIoBigTornadoStatus',
    playerIndex: 0,
    options: ['confused', 'poisoned'],
  };
  const opp = engine.state.players[1].active || mkKnight('shun_andromede', 100, 'io-opp');
  engine.state.players[1].active = opp;
  assert(engine.resolvePickIoBigTornadoStatus(0, 'confused'), 'pickIoBigTornadoStatus');
  assert(!engine.state.pending, 'pickIoBigTornadoStatus cleared');
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll pending pick engine tests passed.');
