/**
 * Tests logique draft / sélection secrète — Combat des 1000 Jours
 * node scripts/test-combat-1000-jours.mjs
 */
import {
  applyDraftPick,
  applySecretPick,
  beginSecretPickPhase,
  bothPlayersHaveUnusedDecks,
  createCombat1000Run,
  getDraftPickQuota,
  getDraftPlayerIndex,
  getDraftTurnInfo,
  getUnusedDeckIds,
  isDraftComplete,
  minDecksRequiredForCombat,
  recordCombat1000RoundResult,
} from '../combat-1000-jours.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(getDraftPickQuota(0) === 1, 'tour 0 = 1 pick');
assert(getDraftPickQuota(1) === 2, 'tour 1 = 2 picks');
assert(getDraftPlayerIndex(0) === 0, 'tour 0 = J1');
assert(getDraftPlayerIndex(1) === 1, 'tour 1 = J2');
assert(getDraftPlayerIndex(2) === 0, 'tour 2 = J1');
assert(minDecksRequiredForCombat(3) === 6, '6 decks pour 3 par joueur');

const deckIds = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
const run = createCombat1000Run({
  player1Name: 'Alpha',
  player2Name: 'Beta',
  decksPerPlayer: 3,
  availableDeckIds: deckIds,
});

// Snake: J1×1, J2×2, J1×2 (remaining 1 for J2 auto via turn cap)
const draftSequence = [
  { player: 0, deck: 'd1' },
  { player: 1, deck: 'd2' },
  { player: 1, deck: 'd3' },
  { player: 0, deck: 'd4' },
  { player: 0, deck: 'd5' },
  { player: 1, deck: 'd6' },
];

for (const step of draftSequence) {
  const info = getDraftTurnInfo(run);
  assert(info, 'draft en cours');
  assert(info.playerIndex === step.player, `mauvais joueur au draft (${step.deck})`);
  const res = applyDraftPick(run, step.deck);
  assert(res.ok, `pick ${step.deck} refusé`);
}

assert(isDraftComplete(run), 'draft terminé');
assert(run.player1DeckIds.length === 3, 'J1 a 3 decks');
assert(run.player2DeckIds.length === 3, 'J2 a 3 decks');
assert(run.availableDeckIds.length === 0, 'plus de decks dispo');

beginSecretPickPhase(run);
run.secretPhase = 'pick-p1';
assert(applySecretPick(run, 0, run.player1DeckIds[0]).ok, 'pick secret J1');
assert(run.secretPhase === 'pass-p2', 'phase pass J2');
run.secretPhase = 'pick-p2';
assert(applySecretPick(run, 1, run.player2DeckIds[0]).ok, 'pick secret J2');
assert(run.secretPhase === 'vs', 'phase VS');

recordCombat1000RoundResult(run, 0);
assert(run.player1Wins === 1, 'J1 gagne manche 1');
assert(getUnusedDeckIds(run, 0).length === 2, 'J1 decks restants');
assert(bothPlayersHaveUnusedDecks(run), 'encore des manches possibles');

console.log('OK — Combat des 1000 Jours (draft + secret + round)');
