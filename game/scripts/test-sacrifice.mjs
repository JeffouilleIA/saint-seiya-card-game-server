/**
 * Smoke test — Supporter « Sacrifice » (exclusion Divinités / Chevaliers divins)
 * Run: node scripts/test-sacrifice.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CARD_DATABASE, getCardDef, isForbiddenSacrificeTarget } from '../cards.js';
import { GameEngine } from '../engine.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCardsSyncForTest() {
  const files = ['cards.json', 'cards-divin.json', 'objets.json'];
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

function mkKnight(cardId) {
  const def = getCardDef(cardId);
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardInstanceId: `ci-${cardId}`,
    cardId,
    currentHp: def?.hp ?? 100,
    maxHp: def?.hp ?? 100,
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

console.log('=== Sacrifice — cibles interdites ===\n');

assert(isForbiddenSacrificeTarget(getCardDef('athena')), 'Athéna (Divinite) interdite');
assert(
  isForbiddenSacrificeTarget(getCardDef('athena-armure-divine')),
  'Athéna Armure Divine (Divinite) interdite',
);
assert(
  isForbiddenSacrificeTarget(getCardDef('seiya_armure_divine')),
  'Seiya Armure Divine (ChevalierDivin) interdit',
);
assert(
  isForbiddenSacrificeTarget(getCardDef('hyoga_armure_divine')),
  'Hyoga Armure Divine (ChevalierDivin) interdit',
);
assert(!isForbiddenSacrificeTarget(getCardDef('seiya-de-pegase')), 'Seiya bronze autorisé');
assert(!isForbiddenSacrificeTarget(getCardDef('shun_andromede')), 'Shun bronze autorisé');

const engine = new GameEngine({ headless: true, gameMode: 'local2p' });
engine.reset({ headless: true, gameMode: 'local2p' });

const p0 = engine.state.players[0];
p0.active = mkKnight('athena');
p0.bench = [mkKnight('seiya_armure_divine')];
p0.hand = [{ cardId: 'supporter_sacrifice', instanceId: 'sac-hand-1' }];
engine.state.phase = 'main';
engine.state.turn = 0;
engine.state.pending = null;

const blocked = await engine.playSupporterCard(0, 0, 'active');
assert(!blocked, 'Sacrifice bloqué si seules Divinité / Chevalier divin en jeu');
assert(p0.hand.length === 1, 'Carte Sacrifice reste en main si jouée impossible');

p0.active = mkKnight('seiya-de-pegase');
p0.bench = [mkKnight('hyoga_armure_divine')];
engine.state.pending = null;

const played = await engine.playSupporterCard(0, 0, 'active');
assert(played, 'Sacrifice jouable avec un bronze actif');
assert(engine.state.pending?.type === 'voluntarySacrificePick', 'pending voluntarySacrificePick');
assert(
  engine.state.pending.options.length === 1,
  'Une seule cible éligible (actif bronze, banc divin exclu)',
);
assert(
  engine.state.pending.options[0].instanceId === p0.active.instanceId,
  'Seul le bronze actif est proposé',
);

const invalid = engine.effects.resolveVoluntarySacrificeKnight(
  0,
  p0.bench[0].instanceId,
);
assert(!invalid, 'Résolution refusée sur Chevalier divin du banc');

console.log(failures ? `\n${failures} échec(s).` : '\nTous les tests OK.');
process.exit(failures ? 1 : 0);
