/**
 * Vérification rapide des 3 nouveaux niveaux IA (Node ESM).
 * Usage: node scripts/verify-ai-levels.mjs
 */

import { GameEngine } from '../engine.js';
import {
  getAiCheatLevel,
  aiGetUpcomingDraws,
  aiGetOpponentHand,
  pickLegendeAttack,
} from '../ai-legende.js';
import { pickExpertAttack } from '../ai-expert.js';
import { DEFAULT_DECK_LIST } from '../cards.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function setupEngine(difficulty) {
  const engine = new GameEngine({
    gameMode: 'ai-battle',
    aiDifficulty: difficulty,
    headless: true,
    onFeedback: () => {},
    onStateChange: () => {},
    onAnimation: () => {},
  });
  engine.reset({
    deckLists: [DEFAULT_DECK_LIST, DEFAULT_DECK_LIST],
    gameMode: 'ai-battle',
    aiDifficulty: difficulty,
    headless: true,
  });
  engine.startGame();
  return engine;
}

console.log('=== Vérification niveaux IA ===\n');

// 1. Cheat levels
assert(getAiCheatLevel('legende') === 'none', 'legende → none');
assert(getAiCheatLevel('expert') === 'none', 'expert → none');
assert(getAiCheatLevel('ridicule') === 'deck_order', 'ridicule → deck_order');
assert(getAiCheatLevel('absurde') === 'full_info', 'absurde → full_info');
console.log('✓ getAiCheatLevel mapping');

// 2. Deck peek visibility
const engRidicule = setupEngine('ridicule');
const p1deck = engRidicule.state.players[1].deck;
const peekNone = aiGetUpcomingDraws(engRidicule, 1, 'none');
const peekDeck = aiGetUpcomingDraws(engRidicule, 1, 'deck_order');
assert(peekNone.length === 0, 'sans triche : pas de peek deck');
assert(peekDeck.length > 0, 'ridicule : peek deck non vide');
assert(
  peekDeck[0].instanceId === p1deck[p1deck.length - 1].instanceId,
  'ridicule : prochaine pioche = sommet du deck',
);
console.log('✓ deck_order voit les prochaines pioches');

// 3. Opponent hand visibility
const engAbsurde = setupEngine('absurde');
const handHidden = aiGetOpponentHand(engAbsurde, 1, 'none');
const handVisible = aiGetOpponentHand(engAbsurde, 1, 'full_info');
assert(handHidden === null, 'sans triche : main adverse invisible');
assert(Array.isArray(handVisible), 'absurde : main adverse visible');
assert(
  handVisible.length === engAbsurde.state.players[0].hand.length,
  'absurde : même taille de main que l\'état interne',
);
console.log('✓ full_info voit la main adverse');

// 4. Attack pick runs without error
for (const diff of ['expert', 'legende', 'ridicule', 'absurde']) {
  const eng = setupEngine(diff);
  const pi = 1;
  if (!eng.state.players[pi].active && eng.state.players[pi].bench.length) {
    eng.resolveAiPromoteActive(pi);
  }
  const cheat = getAiCheatLevel(diff);
  const pick =
    diff === 'expert'
      ? pickExpertAttack(eng, pi)
      : pickLegendeAttack(eng, pi, cheat);
  assert(
    pick === null || typeof pick.index === 'number',
    `${diff} : pickLegendeAttack / pickExpertAttack retourne un index valide ou null`,
  );
}
console.log('✓ choix d\'attaque pour expert / legende / ridicule / absurde');

// 5. Engine properties
const engLeg = setupEngine('legende');
assert(engLeg.aiCheatLevel === 'none', 'engine.aiCheatLevel legende');
assert(engLeg._aiIsExpertTier(), 'legende est expert tier');
assert(engLeg._aiIsHardTier(), 'legende est hard tier');
console.log('✓ propriétés engine');

console.log('\n=== Tous les tests passés ===');
