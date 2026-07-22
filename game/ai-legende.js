/**
 * IA Légende (+ Ridicule / Absurde via triche) — recherche plus profonde et meilleure évaluation.
 *
 * Légende : sans triche (aiCheatLevel = 'none')
 * Ridicule : + ordre du deck (aiCheatLevel = 'deck_order')
 * Absurde  : + main adverse (aiCheatLevel = 'full_info')
 */

import { RULES } from './rules.js';
import {
  getCardDef,
  getPrizeCountForKnockout,
  isBaseChevalier,
  isChevalier,
  isEnergie,
  isEvolutionStage,
  isSupporter,
  isStade,
  matchesEvolutionTarget,
} from './cards.js';
import {
  EXPERT_LOOKAHEAD_DEPTH,
  computeExpectedAttackDamage,
  buildExpertTurnSteps,
} from './ai-expert.js';

export const LEGENDE_LOOKAHEAD_DEPTH = 2;
export const LEGENDE_MAX_SEARCH_MS = 120;
export const LEGENDE_DECK_PEEK = 6;

/** @typedef {'none' | 'deck_order' | 'full_info'} AiCheatLevel */

/** @param {string} difficulty */
export function getAiCheatLevel(difficulty) {
  if (difficulty === 'ridicule') return 'deck_order';
  if (difficulty === 'absurde') return 'full_info';
  return 'none';
}

/** @param {string} difficulty */
export function isLegendeTier(difficulty) {
  return difficulty === 'legende' || difficulty === 'ridicule' || difficulty === 'absurde';
}

/** @param {import('./engine.js').GameEngine} game */
export function aiPeekDeck(game, playerIndex, count = LEGENDE_DECK_PEEK) {
  const deck = game.state.players[playerIndex]?.deck;
  if (!deck?.length) return [];
  const n = Math.min(count, deck.length);
  return deck.slice(-n).reverse();
}

/**
 * Prochaines cartes à piocher (fin du tableau deck = sommet de la pioche).
 * @param {import('./engine.js').GameEngine} game
 * @param {AiCheatLevel} cheatLevel
 */
export function aiGetUpcomingDraws(game, playerIndex, cheatLevel, count = LEGENDE_DECK_PEEK) {
  if (cheatLevel === 'none') return [];
  return aiPeekDeck(game, playerIndex, count);
}

/** @param {import('./engine.js').GameEngine} game */
export function aiGetOpponentHand(game, aiPlayerIndex, cheatLevel) {
  if (cheatLevel !== 'full_info') return null;
  return game.state.players[1 - aiPlayerIndex]?.hand ?? [];
}

function knightStageScore(def) {
  if (!def) return 0;
  if (def.stage === 'chevalier-divin') return 28;
  if (def.stage === 'cosmo ardent') return 18;
  if (def.stage === 'evolution') return 12;
  return 4;
}

function knightTalentScore(def, knight) {
  if (!def?.talent || knight?.talentUsed) return 0;
  const effects = def.talent.effects || [];
  let score = 8;
  if (effects.some((e) => e.type === 'search_deck' || e.type === 'search_deck_energy')) score += 14;
  if (effects.some((e) => e.type === 'draw' || e.type === 'draw_until_hand_size')) score += 10;
  return score;
}

function scoreFieldKnight(game, playerIndex, knight) {
  if (!knight) return 0;
  const def = getCardDef(knight.cardId);
  let score = knight.currentHp + knight.energies.length * 10;
  score += knightStageScore(def);
  score += knightTalentScore(def, knight);

  const ctx = { coin: null, headsCount: 0, opponentActive: game.state.players[1 - playerIndex].active };
  let maxDmg = 0;
  for (const atk of def?.attacks || []) {
    const dmg = computeExpectedAttackDamage(game, playerIndex, atk, ctx);
    if (dmg > maxDmg) maxDmg = dmg;
  }
  score += maxDmg * 0.55;
  return score;
}

function scoreHandCardForThreat(game, humanIndex, card) {
  const def = getCardDef(card.cardId);
  if (!def) return 0;
  if (isEnergie(card.cardId)) return 6;
  if (isSupporter(card.cardId) || isStade(card.cardId)) return 12;
  if (isChevalier(card.cardId)) {
    const hp = def.hp || 0;
    let atkScore = 0;
    for (const atk of def.attacks || []) {
      const dmg = computeExpectedAttackDamage(game, humanIndex, atk, {
        coin: null,
        headsCount: 0,
        opponentActive: game.state.players[humanIndex].active,
      });
      if (dmg > atkScore) atkScore = dmg;
    }
    return hp * 0.4 + atkScore;
  }
  return 4;
}

/**
 * Meilleure riposte adverse estimée (1–2 plies) avec vision main si full_info.
 * @param {import('./engine.js').GameEngine} game
 * @param {AiCheatLevel} [cheatLevel='none']
 */
export function estimateLegendeOpponentCounter(game, aiPlayerIndex = 1, cheatLevel = 'none') {
  const humanIndex = 1 - aiPlayerIndex;
  const aiActive = game.state.players[aiPlayerIndex].active;
  if (!aiActive) return 0;

  const ctx = { coin: null, headsCount: 0, opponentActive: aiActive };
  let max = 0;

  const activeOpts = game.getAttackOptions(humanIndex).filter((a) => a.canUse);
  for (const opt of activeOpts) {
    const d = computeExpectedAttackDamage(game, humanIndex, opt.attack, ctx);
    if (d > max) max = d;
  }

  if (cheatLevel === 'full_info') {
    const opp = game.state.players[humanIndex];
    for (const card of opp.hand) {
      const def = getCardDef(card.cardId);
      if (!isBaseChevalier(card.cardId) && !isEvolutionStage(card.cardId)) continue;
      for (const atk of def?.attacks || []) {
        const d = computeExpectedAttackDamage(game, humanIndex, atk, ctx);
        if (d > max) max = d * 0.35;
      }
    }
    for (const benchKnight of opp.bench) {
      if (!benchKnight) continue;
      const def = getCardDef(benchKnight.cardId);
      for (const atk of def?.attacks || []) {
        const d = computeExpectedAttackDamage(game, humanIndex, atk, ctx);
        if (d > max) max = d * 0.5;
      }
    }
  }

  if (cheatLevel !== 'none' && LEGENDE_LOOKAHEAD_DEPTH >= 2) {
    const upcoming = aiGetUpcomingDraws(game, humanIndex, cheatLevel, 3);
    for (const card of upcoming) {
      max += scoreHandCardForThreat(game, humanIndex, card) * 0.08;
    }
  }

  return max;
}

function scoreKoBonus(oppActive, damage) {
  if (!oppActive || damage < oppActive.currentHp) return 0;
  const def = getCardDef(oppActive.cardId);
  const prizes = getPrizeCountForKnockout(def);
  return 70 + prizes * 22;
}

function scorePrizePressure(game, playerIndex) {
  const me = game.state.players[playerIndex];
  const opp = game.state.players[1 - playerIndex];
  const prizeTarget = RULES.prizeCount;
  const myRemaining = prizeTarget - (me.prizesTaken || 0);
  const oppRemaining = prizeTarget - (opp.prizesTaken || 0);
  return (oppRemaining - myRemaining) * 4;
}

function scoreDeckDrawPotential(game, playerIndex, cheatLevel) {
  if (cheatLevel === 'none') return 0;
  const draws = aiGetUpcomingDraws(game, playerIndex, cheatLevel, 4);
  let score = 0;
  for (const card of draws) {
    if (isEnergie(card.cardId)) score += 5;
    if (isBaseChevalier(card.cardId)) score += 8;
    if (isEvolutionStage(card.cardId)) score += 6;
  }
  return score * 0.15;
}

/**
 * @param {import('./engine.js').GameEngine} game
 * @param {AiCheatLevel} [cheatLevel='none']
 */
export function scoreLegendeAttack(game, playerIndex, attackOption, cheatLevel = 'none') {
  const opp = game.state.players[1 - playerIndex];
  const ctx = {
    coin: null,
    headsCount: 0,
    opponentActive: opp.active,
  };
  const damage = computeExpectedAttackDamage(game, playerIndex, attackOption.attack, ctx);
  let score = damage;

  const counterWeight = EXPERT_LOOKAHEAD_DEPTH >= 2 ? 0.72 : 0.65;
  const counter = estimateLegendeOpponentCounter(game, playerIndex, cheatLevel);
  score -= counter * counterWeight;

  score += scoreKoBonus(opp.active, damage);
  score += scorePrizePressure(game, playerIndex);

  const me = game.state.players[playerIndex];
  if (me.active) {
    score += scoreFieldKnight(game, playerIndex, me.active) * 0.04;
    if (me.active.energies.length === 0 && damage > 0) score -= 6;
  }

  score += scoreDeckDrawPotential(game, playerIndex, cheatLevel);

  if (cheatLevel === 'full_info') {
    const hand = aiGetOpponentHand(game, playerIndex, cheatLevel) || [];
    const handThreat = hand.reduce((s, c) => s + scoreHandCardForThreat(game, 1 - playerIndex, c), 0);
    if (damage >= (opp.active?.currentHp ?? Infinity)) {
      score += Math.min(25, handThreat * 0.12);
    }
  }

  return { score, damage };
}

/**
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @param {AiCheatLevel} [cheatLevel='none']
 * @param {number} [maxMs]
 */
export function pickLegendeAttack(game, playerIndex, cheatLevel = 'none', maxMs = LEGENDE_MAX_SEARCH_MS) {
  const usable = game.getAttackOptions(playerIndex).filter((a) => a.canUse);
  if (!usable.length) return null;

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let best = null;
  let bestScore = -Infinity;

  for (const opt of usable) {
    if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 > maxMs) {
      break;
    }
    const { score, damage } = scoreLegendeAttack(game, playerIndex, opt, cheatLevel);
    if (score > bestScore) {
      bestScore = score;
      best = { ...opt, score, damage, index: opt.index, attack: opt.attack };
    }
  }

  return best;
}

/** @typedef {'standard' | 'attack_first' | 'bench_then_attack'} LegendeTurnOrder */

/**
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @param {AiCheatLevel} [cheatLevel='none']
 * @returns {LegendeTurnOrder}
 */
export function pickLegendeTurnOrder(game, playerIndex, cheatLevel = 'none') {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const deadline = t0 + LEGENDE_MAX_SEARCH_MS;

  const candidates = ['standard', 'attack_first', 'bench_then_attack'];
  let best = 'standard';
  let bestScore = -Infinity;

  for (const id of candidates) {
    if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) > deadline) {
      break;
    }
    const s = scoreLegendeTurnOrder(game, playerIndex, id, cheatLevel);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }

  return best;
}

function scoreLegendeTurnOrder(game, playerIndex, orderId, cheatLevel) {
  const p = game.state.players[playerIndex];
  const pick = pickLegendeAttack(game, playerIndex, cheatLevel, LEGENDE_MAX_SEARCH_MS / 2);
  let score = pick?.score ?? 0;

  if (game.canAttachEnergy(playerIndex) && !game.actions.energy) {
    score += 14;
    if (cheatLevel !== 'none') {
      const nextEnergy = aiGetUpcomingDraws(game, playerIndex, cheatLevel, 5).find((c) =>
        isEnergie(c.cardId),
      );
      if (nextEnergy) score += 4;
    }
  }
  if (game.canRetreat(playerIndex)) {
    const ratio = p.active ? p.active.currentHp / Math.max(1, p.active.maxHp) : 1;
    if (ratio < 0.28) score += 22;
    else if (ratio < 0.4) score += 10;
  }
  if (orderId === 'bench_then_attack' && game.canPlayChevalier(playerIndex)) {
    score += 16;
  }
  if (orderId === 'attack_first' && pick) {
    score += pick.score * 0.14;
  }

  return score;
}

export function buildLegendeTurnSteps(orderId) {
  return buildExpertTurnSteps(orderId);
}

/**
 * @param {import('./engine.js').GameEngine} game
 * @param {AiCheatLevel} [cheatLevel='none']
 */
export function pickLegendeAction(game, playerIndex, cheatLevel = 'none') {
  return {
    turnOrder: pickLegendeTurnOrder(game, playerIndex, cheatLevel),
    attack: pickLegendeAttack(game, playerIndex, cheatLevel),
  };
}

/**
 * Score une carte du deck pour un pending searchDeck.
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @param {{ cardId: string, instanceId: string }} card
 * @param {AiCheatLevel} cheatLevel
 */
export function scoreDeckSearchPick(game, playerIndex, card, cheatLevel = 'none') {
  const def = getCardDef(card.cardId);
  if (!def) return 0;

  const p = game.state.players[playerIndex];
  let score = 0;

  if (isEnergie(card.cardId)) {
    score += 40;
    if (p.active && p.active.energies.length < 2) score += 25;
    for (const k of [p.active, ...p.bench].filter(Boolean)) {
      const kdef = getCardDef(k.cardId);
      for (const atk of kdef?.attacks || []) {
        const cost = game.getEffectiveAttackCost(k, atk);
        if (cost > k.energies.length) score += cost * 8;
      }
    }
  }

  if (isBaseChevalier(card.cardId)) {
    score += p.bench.length < (game?.getEffectiveMaxBench?.() ?? RULES.maxBench ?? 5) ? 35 : 10;
    score += (def.hp || 0) * 0.3;
  }

  if (isEvolutionStage(card.cardId)) {
    const targets = [p.active, ...p.bench].filter(Boolean);
    for (const k of targets) {
      if (matchesEvolutionTarget(k, card.cardId)) {
        score += 50 + (def.hp || 0) * 0.4;
      }
    }
  }

  if (isSupporter(card.cardId)) score += 22;
  if (isStade(card.cardId)) score += 18;

  if (cheatLevel !== 'none') {
    const deck = p.deck || [];
    const idx = deck.findIndex((c) => c.instanceId === card.instanceId);
    if (idx >= 0) {
      const depthFromTop = deck.length - 1 - idx;
      if (depthFromTop <= 2) score += 2;
    }
  }

  return score;
}

/**
 * Choisit la meilleure carte parmi les options searchDeck.
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @param {Array<{ cardId: string, instanceId: string }>} options
 * @param {AiCheatLevel} cheatLevel
 */
export function pickDeckSearchOption(game, playerIndex, options, cheatLevel = 'none') {
  if (!options?.length) return null;
  let best = options[0];
  let bestScore = -Infinity;
  for (const opt of options) {
    const s = scoreDeckSearchPick(game, playerIndex, opt, cheatLevel);
    if (s > bestScore) {
      bestScore = s;
      best = opt;
    }
  }
  return best;
}

/**
 * Choisit la carte adverse la plus dangereuse à mélanger (révélation main).
 * @param {import('./engine.js').GameEngine} game
 * @param {number} aiPlayerIndex
 * @param {Array<{ cardId: string, instanceId: string }>} hand
 */
export function pickRevealOpponentHandCard(game, aiPlayerIndex, hand) {
  if (!hand?.length) return null;
  const humanIndex = 1 - aiPlayerIndex;
  let best = hand[0];
  let bestScore = -Infinity;
  for (const card of hand) {
    const s = scoreHandCardForThreat(game, humanIndex, card);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }
  return best;
}
