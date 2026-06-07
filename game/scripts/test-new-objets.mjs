/**
 * Smoke tests — Avion de la Fondation, Sceptre d'Athéna, Hôpital
 * Run: node scripts/test-new-objets.mjs
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

// --- Hôpital ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 50);
  p0.hand = [{ cardId: 'hopital', instanceId: 'hopital-1' }];
  engine.state.phase = 'main';
  engine.state.turn = 0;

  const played = await engine.playObjetItemCard(0, 0, 'active');
  assert(played, 'Hôpital: play succeeds');
  assert(!engine.state.pending, 'Hôpital: no pending');
  assert(p0.active.currentHp === 70, 'Hôpital: +30 PV (capped at maxHp 70)');
}

// --- Sceptre d'Athéna ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 100);
  p0.discard = [{ cardId: 'energie-etoile', instanceId: 'energy-disc-1' }];
  p0.hand = [{ cardId: 'sceptre-d-athena', instanceId: 'sceptre-1' }];
  engine.state.phase = 'main';
  engine.state.turn = 0;

  const played = await engine.playObjetItemCard(0, 0, 'active');
  assert(played, 'Sceptre: play succeeds');
  assert(p0.active.energies.length === 1, 'Sceptre: energy attached');
  assert(p0.discard.length === 1, 'Sceptre: objet in discard, energy removed');
  assert(
    p0.active.energies[0].cardId === 'energie-etoile',
    'Sceptre: correct energy attached',
  );
}

// --- Avion de la Fondation (auto / ai-battle) ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'ai-battle' });
  engine.reset({ headless: true, gameMode: 'ai-battle' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 100);
  p0.hand = [
    { cardId: 'avion-de-la-fondation', instanceId: 'avion-obj-1' },
    { cardId: 'shun_andromede', instanceId: 'shun-hand-1' },
  ];
  p0.deck = [
    { cardId: 'ikki-du-phenix', instanceId: 'ikki-deck-1' },
    { cardId: 'energie-etoile', instanceId: 'energy-deck-1' },
  ];
  engine.state.phase = 'main';
  engine.state.turn = 0;

  const played = await engine.playObjetItemCard(0, 0, 'active');
  assert(played, 'Avion: play succeeds');
  assert(!engine.state.pending, 'Avion: AI resolves discard + search + shuffle');
  assert(
    p0.hand.some((c) => c.cardId === 'ikki-du-phenix'),
    'Avion: searched knight in hand',
  );
  assert(
    p0.discard.some((c) => c.cardId === 'shun_andromede'),
    'Avion: knight discarded from hand',
  );
  assert(p0.deck.length === 1, 'Avion: non-knight card remains in deck after search');
  assert(
    p0.hand.some((c) => c.cardId === 'avion-de-la-fondation') === false,
    'Avion: objet played to discard',
  );
}

// --- Avion: human pending discard then search ---
{
  const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
  engine.reset({ headless: true, gameMode: 'local2p' });
  const p0 = engine.state.players[0];
  p0.active = mkKnight('seiya-de-pegase', 100);
  p0.hand = [
    { cardId: 'avion-de-la-fondation', instanceId: 'avion-obj-2' },
    { cardId: 'shun_andromede', instanceId: 'shun-hand-2' },
    { cardId: 'ikki-du-phenix', instanceId: 'ikki-hand-2' },
  ];
  p0.deck = [{ cardId: 'shiryu-du-dragon', instanceId: 'shiryu-deck-1' }];
  engine.state.phase = 'main';
  engine.state.turn = 0;

  await engine.playObjetItemCard(0, 0, 'active');
  assert(engine.state.pending?.type === 'discardHandKnight', 'Avion: pending discardHandKnight');

  assert(engine.resolveDiscardHandKnight(0, 1), 'Avion: discard ikki from hand');
  await new Promise((r) => setTimeout(r, 20));
  assert(engine.state.pending?.type === 'searchDeck', 'Avion: pending searchDeck');

  assert(
    engine.resolveSearchDeck(0, 'shiryu-deck-1'),
    'Avion: pick shiryu from deck',
  );
  await new Promise((r) => setTimeout(r, 20));
  assert(!engine.state.pending, 'Avion: flow complete');
  assert(
    p0.hand.some((c) => c.cardId === 'shiryu-du-dragon'),
    'Avion: shiryu in hand after pick',
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll new objet tests passed.');
