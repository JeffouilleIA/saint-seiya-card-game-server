/**
 * IA Expert — recherche limitée (2 plies) et valeur attendue sur les effets aléatoires.
 *
 * Limites (évite de bloquer le navigateur) :
 * - EXPERT_LOOKAHEAD_DEPTH = 2 : notre meilleure attaque vs meilleure riposte adverse estimée
 * - EXPERT_MAX_SEARCH_MS = 80 : budget temps par choix d'attaque / ordre de tour
 */

import { RULES } from './rules.js';
import { getCardDef, getPrizeCountForKnockout } from './cards.js';

export const EXPERT_LOOKAHEAD_DEPTH = 2;
export const EXPERT_MAX_SEARCH_MS = 80;

/** Effets d'attaque dont les dégâts dépendent d'une pièce ou du nombre de faces. */
function attackHasStochasticDamage(attack) {
  return (attack.effects || []).some(
    (e) => e.type === 'bonus_damage_on_heads' || e.type === 'bonus_damage_per_heads',
  );
}

/** Nombre de lancers de pièce liés aux dégâts (approximation pour headsCount attendu). */
function countDamageCoinFlips(attack) {
  let n = 0;
  for (const eff of attack.effects || []) {
    if (eff.type === 'coin_flip') n += 1;
    if (eff.type === 'multi_coin_flip') n += eff.count || 2;
    if (eff.type === 'multi_coin_flip_per_card_id') n += 1;
  }
  if (n === 0 && (attack.effects || []).some((e) => e.type === 'bonus_damage_per_heads')) {
    n = 1;
  }
  return n;
}

/**
 * Dégâts attendus : moyenne tête/pile pour bonus conditionnels, ou headsCount = n/2 pour multi-pièces.
 * @param {import('./engine.js').GameEngine} game
 */
export function computeExpectedAttackDamage(game, playerIndex, attack, ctx) {
  if (!attackHasStochasticDamage(attack)) {
    return game.effects.computeAttackDamage(playerIndex, attack, ctx);
  }

  const flips = countDamageCoinFlips(attack);
  const hasPerHeads = (attack.effects || []).some((e) => e.type === 'bonus_damage_per_heads');

  if (hasPerHeads && flips > 1) {
    const expectedHeads = flips * 0.5;
    return game.effects.computeAttackDamage(playerIndex, attack, {
      ...ctx,
      coin: null,
      headsCount: expectedHeads,
    });
  }

  const headsCtx = { ...ctx, coin: RULES.coin.heads, headsCount: Math.max(1, flips) };
  const tailsCtx = { ...ctx, coin: RULES.coin.tails, headsCount: 0 };
  const onHeads = game.effects.computeAttackDamage(playerIndex, attack, headsCtx);
  const onTails = game.effects.computeAttackDamage(playerIndex, attack, tailsCtx);
  return 0.5 * onHeads + 0.5 * onTails;
}

/**
 * Meilleure riposte adverse estimée (1 plie) — dégâts max attendus sur notre actif.
 * @param {import('./engine.js').GameEngine} game
 */
export function estimateOpponentCounterDamage(game, aiPlayerIndex = 1) {
  const humanIndex = 1 - aiPlayerIndex;
  const aiActive = game.state.players[aiPlayerIndex].active;
  if (!aiActive) return 0;

  const ctx = { coin: null, headsCount: 0, opponentActive: aiActive };
  const options = game.getAttackOptions(humanIndex).filter((a) => a.canUse);
  let max = 0;
  for (const opt of options) {
    const d = computeExpectedAttackDamage(game, humanIndex, opt.attack, ctx);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Score heuristique : gain HP adverse − riposte (pondérée) + bonus KO.
 * @param {import('./engine.js').GameEngine} game
 */
export function scoreExpertAttack(game, playerIndex, attackOption) {
  const opp = game.state.players[1 - playerIndex];
  const ctx = {
    coin: null,
    headsCount: 0,
    opponentActive: opp.active,
  };
  const damage = computeExpectedAttackDamage(game, playerIndex, attackOption.attack, ctx);
  let score = damage;

  if (EXPERT_LOOKAHEAD_DEPTH >= 2) {
    const counter = estimateOpponentCounterDamage(game, playerIndex);
    score = damage - counter * 0.65;
  }

  if (opp.active && damage >= opp.active.currentHp) {
    score += 85;
  }

  return { score, damage };
}

/**
 * Choisit la meilleure attaque utilisable (budget temps EXPERT_MAX_SEARCH_MS).
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @param {number} [maxMs]
 */
export function pickExpertAttack(game, playerIndex, maxMs = EXPERT_MAX_SEARCH_MS) {
  const usable = game.getAttackOptions(playerIndex).filter((a) => a.canUse);
  if (!usable.length) return null;

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let best = null;
  let bestScore = -Infinity;

  for (const opt of usable) {
    if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 > maxMs) {
      break;
    }
    const { score, damage } = scoreExpertAttack(game, playerIndex, opt);
    if (score > bestScore) {
      bestScore = score;
      best = { ...opt, score, damage, index: opt.index, attack: opt.attack };
    }
  }

  return best;
}

/**
 * @typedef {'standard' | 'attack_first' | 'bench_then_attack'} ExpertTurnOrder
 */

/**
 * Compare 3 ordres de tour candidats (setup puis attaque) sans simuler tout l'état.
 * @param {import('./engine.js').GameEngine} game
 * @param {number} playerIndex
 * @returns {ExpertTurnOrder}
 */
export function pickExpertTurnOrder(game, playerIndex) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const deadline = t0 + EXPERT_MAX_SEARCH_MS;

  const candidates = ['standard', 'attack_first', 'bench_then_attack'];
  let best = 'standard';
  let bestScore = -Infinity;

  for (const id of candidates) {
    if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) > deadline) {
      break;
    }
    const s = scoreExpertTurnOrder(game, playerIndex, id);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }

  return best;
}

function scoreExpertTurnOrder(game, playerIndex, orderId) {
  const p = game.state.players[playerIndex];
  const pick = pickExpertAttack(game, playerIndex, EXPERT_MAX_SEARCH_MS / 2);
  let score = pick?.score ?? 0;

  if (game.canAttachEnergy(playerIndex) && !game.actions.energy) {
    score += 12;
  }
  if (game.canRetreat(playerIndex)) {
    const ratio = p.active ? p.active.currentHp / Math.max(1, p.active.maxHp) : 1;
    if (ratio < 0.25) score += 18;
  }
  if (orderId === 'bench_then_attack' && game.canPlayChevalier(playerIndex)) {
    score += 14;
  }
  if (orderId === 'attack_first' && pick) {
    score += pick.score * 0.12;
  }

  return score;
}

/**
 * Valeur heuristique d'activation d'un talent (zone active ou index banc).
 * @param {import('./engine.js').GameEngine} game
 */
export function scoreAiTalentOption(game, playerIndex, zone) {
  const p = game.state.players[playerIndex];
  const knight = zone === 'active' ? p.active : p.bench[zone];
  if (!knight) return 0;
  const def = getCardDef(knight.cardId);
  if (!def?.talent || !game.canUseTalentOnKnight(playerIndex, knight, def.talent)) return 0;

  const opp = game.state.players[1 - playerIndex];
  let score = 0;

  for (const eff of def.talent.effects || []) {
    switch (eff.type) {
      case 'bench_damage_once_per_turn': {
        if (!opp.bench.length) break;
        const dmg = eff.damage || 20;
        score += dmg * 0.75;
        for (const bk of opp.bench) {
          if (!bk) continue;
          if (bk.currentHp <= dmg) {
            const bdef = getCardDef(bk.cardId);
            score += 65 + getPrizeCountForKnockout(bdef) * 20;
          } else if (bk.currentHp <= dmg + 25) {
            score += 10;
          }
          score += Math.min(16, (dmg / Math.max(1, bk.currentHp)) * 10);
        }
        break;
      }
      case 'search_deck':
      case 'search_deck_energy':
        score += 24;
        break;
      case 'draw_until_hand_size':
        score += 14;
        break;
      case 'bench_heal_once_per_turn': {
        const heal = eff.amount || 20;
        for (const ally of p.bench) {
          if (!ally) continue;
          score += Math.min(heal, Math.max(0, (ally.maxHp || 0) - ally.currentHp)) * 0.55;
        }
        break;
      }
      case 'discard_energy_confuse_opponent':
      case 'discard_energy_poison_opponent':
      case 'discard_energy_opponent_energy':
        if (knight.energies?.length > 0 && opp.active) score += 16;
        break;
      case 'look_top_deck':
        if (p.deck.length) score += 10;
        break;
      case 'copy_bench_attack_turn':
        score += 18;
        break;
      case 'transfer_energy_once_per_turn':
      case 'transfer_energy_to_hades_bench':
        score += 14;
        break;
      case 'turn_start_heal_other_friendly':
        score += 12;
        break;
      default:
        score += 8;
        break;
    }
  }

  return score;
}

/**
 * Meilleur talent activable ce tour (null si aucun ne vaut le coup).
 * @param {import('./engine.js').GameEngine} game
 */
export function pickAiTalent(game, playerIndex, difficulty = 'moyen') {
  const opts = game.getTalentOptions(playerIndex).filter((o) => o.canUse);
  if (!opts.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const opt of opts) {
    const s = scoreAiTalentOption(game, playerIndex, opt.zone);
    if (s > bestScore) {
      bestScore = s;
      best = opt;
    }
  }

  const minScore =
    difficulty === 'facile' ? 30 : difficulty === 'moyen' ? 18 : 12;
  if (!best || bestScore < minScore) return null;
  return { ...best, score: bestScore };
}

/** Étapes du tour principal — attaque toujours en dernier. */
export function buildExpertTurnSteps(orderId) {
  const setup = ['energy', 'retreat', 'bench', 'stadium', 'tool', 'supporter', 'evolve', 'talent'];
  if (orderId === 'bench_then_attack') {
    return ['energy', 'bench', 'retreat', 'stadium', 'tool', 'supporter', 'evolve', 'talent', 'attack'];
  }
  return [...setup, 'attack'];
}

/**
 * Point d'entrée : attaque + ordre de tour pour la phase principale Expert.
 * @param {import('./engine.js').GameEngine} game
 */
export function pickExpertAction(game, playerIndex) {
  return {
    turnOrder: pickExpertTurnOrder(game, playerIndex),
    attack: pickExpertAttack(game, playerIndex),
  };
}
