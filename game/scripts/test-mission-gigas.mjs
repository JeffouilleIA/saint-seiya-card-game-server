/**
 * Mission de Gigas (objet_mission_gigas) — bench placement + free energy attach
 * Run: node scripts/test-mission-gigas.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef } from '../cards.js';
import { GameEngine } from '../engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCardsSyncForTest() {
  const files = ['cards.json', 'cards-argent.json', 'objets.json'];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(projectRoot, 'data', file), 'utf8'));
    for (const c of raw) {
      if (!c?.id) continue;
      const category = c.category || 'chevalier';
      const cardType =
        category === 'objet'
          ? 'objet'
          : category === 'supporter'
            ? 'supporter'
            : category === 'energie'
              ? 'energie'
              : category === 'stade'
                ? 'stade'
                : 'chevalier';
      CARD_DATABASE[c.id] = {
        ...c,
        cardType,
        rawType: c.type || c.rawType || (cardType === 'energie' ? 'energie' : undefined),
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

function mkDeckCard(cardId, suffix) {
  return { cardId, instanceId: `${cardId}-${suffix}` };
}

// --- Headless AI: silver knight on bench + energy attached, active untouched ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'ai-battle' });
  engine.reset({ headless: true, gameMode: 'ai-battle' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 70);
  p0.active.energies.push(mkDeckCard('energie-etoile', 'active-e1'));
  p0.hand = [{ cardId: 'objet_mission_gigas', instanceId: 'gigas-1' }];
  p0.deck = [
    mkDeckCard('marine-aigle', 'deck-silver'),
    mkDeckCard('energie-etoile', 'deck-energy'),
    mkDeckCard('seiya-de-pegase', 'filler'),
  ];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  p0.energyAttachmentsThisTurn = 1;

  const played = await engine.playObjetItemCard(0, 0, 'active');
  assert(played, 'Gigas: play succeeds');
  assert(p0.active.energies.length === 1, 'Gigas: active knight energy unchanged');
  assert(p0.bench.length === 1, 'Gigas AI: silver knight on bench');
  assert(p0.bench[0].energies.length === 1, 'Gigas AI: energy on bench silver knight');
  assert(p0.energyAttachmentsThisTurn === 1, 'Gigas: does not consume turn energy limit');
  assert(!engine.state.pending, 'Gigas AI: no pending after resolve');
}

function resolveObjetSearchDeckIfNeeded(engine, playerIndex) {
  const pending = engine.state.pending;
  if (pending?.type === 'searchDeck' && pending.playerIndex === playerIndex) {
    const pick = pending.options?.[0];
    if (pick) engine.resolveSearchDeck(playerIndex, pick.instanceId);
  }
}

// --- Human skip: cards stay in hand ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 70);
  p0.hand = [{ cardId: 'objet_mission_gigas', instanceId: 'gigas-2' }];
  p0.deck = [
    mkDeckCard('marine-aigle', 'deck-silver-2'),
    mkDeckCard('energie-etoile', 'deck-energy-2'),
  ];
  engine.state.phase = 'main';
  engine.state.turn = 0;

  const played = await engine.playObjetItemCard(0, 0, 'active');
  assert(played, 'Gigas skip: play succeeds');
  resolveObjetSearchDeckIfNeeded(engine, 0);
  assert(engine.state.pending?.type === 'missionGigasPlaceKnight', 'Gigas skip: pending place knight');

  const skipped = engine.finishMissionGigasSkip(0);
  assert(skipped, 'Gigas skip: finish skip');
  assert(!engine.state.pending, 'Gigas skip: pending cleared');
  assert(p0.bench.length === 0, 'Gigas skip: no bench placement');
  assert(
    p0.hand.some((c) => c.cardId === 'marine-aigle') &&
      p0.hand.some((c) => c.cardId === 'energie-etoile'),
    'Gigas skip: silver knight and energy in hand',
  );
}

// --- Human place: bench + attach without energy limit ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 70);
  p0.hand = [{ cardId: 'objet_mission_gigas', instanceId: 'gigas-3' }];
  p0.deck = [
    mkDeckCard('marine-aigle', 'deck-silver-3'),
    mkDeckCard('energie-etoile', 'deck-energy-3'),
  ];
  engine.state.phase = 'main';
  engine.state.turn = 0;
  p0.energyAttachmentsThisTurn = 1;

  await engine.playObjetItemCard(0, 0, 'active');
  resolveObjetSearchDeckIfNeeded(engine, 0);
  const pending = engine.state.pending;
  assert(pending?.type === 'missionGigasPlaceKnight', 'Gigas place: pending');
  const handIdx = p0.hand.findIndex((c) => c.instanceId === pending.knightInstanceId);
  assert(handIdx >= 0, 'Gigas place: silver knight in hand');

  const placed = await engine.effects.resolveMissionGigasPlaceKnight(0, handIdx);
  assert(placed, 'Gigas place: bench placement succeeds');
  assert(p0.bench.length === 1, 'Gigas place: knight on bench');
  assert(p0.bench[0].energies.length === 1, 'Gigas place: energy attached to bench knight');
  assert(p0.active.energies.length === 0, 'Gigas place: active untouched');
  assert(p0.energyAttachmentsThisTurn === 1, 'Gigas place: energy limit unchanged');
}

if (failures) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll Mission de Gigas tests passed.');
