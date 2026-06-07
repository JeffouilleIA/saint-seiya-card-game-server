import { RULES, formatCoinFlipSummary, formatCoinFlipResult } from './rules.js';
import {
  AIOR_LION_FRIEND_CARD_IDS,
  AIOROS_CARD_ID,
  ATHENA_OR_DIVINE_CHILD_CARD_IDS,
  canAttachToolToKnight,
  getCardDef,
  getToolIgnoreKeys,
  isBronzeBase,
  isBronzeMajeur,
  isBronzeMajeurBase,
  isBronzeMineur,
  isTournoiGalactiqueKnight,
  knightHasTag,
  knightHasTool,
  playerHasJulianSoloInPlay,
  playerHasJulianOrKanonDragonInPlay,
  POSEIDON_CARD_IDS,
  isGeneralPoseidonKnight,
  SEIYA_DIVINE_ARMOR_CARD_ID,
  SEIYA_PROTECTED_TARGET_CARD_IDS,
  isForbiddenSacrificeTarget,
} from './cards.js';

export const ASPROS_GEMEAUX_CARD_ID = 'aspros_gemeaux';
export const DEUTEROS_CARD_ID = 'deuteros';

/**
 * R?solution des effets JSON (attacks[].effects, talent.effects)
 */
export class EffectResolver {
  constructor(game) {
    this.game = game;
  }

  /** Attaques défensives / utilitaires (damage: 0) : pas de bonus globaux d'attaque. */
  hasZeroBaseAttackDamage(attack) {
    return (attack?.damage ?? 0) === 0;
  }

  computeAttackDamage(attackerIndex, attack, ctx) {
    const zeroBase = this.hasZeroBaseAttackDamage(attack);
    let damage = attack.damage || 0;
    const player = this.game.state.players[attackerIndex];
    const attacker = player.active;

    for (const eff of attack.effects || []) {
      if (eff.type === 'bonus_damage_per_energy') {
        const attachedEnergy = attacker?.energies?.length ?? 0;
        damage += (eff.amountPerEnergy || 0) * attachedEnergy;
      }
      if (eff.type === 'bonus_damage_per_opponent_active_energy' && ctx.opponentActive) {
        const oppEnergy = ctx.opponentActive.energies?.length ?? 0;
        damage += (eff.amountPerEnergy || 0) * oppEnergy;
      }
      if (
        eff.type === 'bonus_if_attack_used_last_turn' ||
        eff.type === 'bonus_if_played_attack_last_turn'
      ) {
        const p = this.game.state.players[attackerIndex];
        const prev = p.playedAttackLastTurn ?? p.lastAttackName;
        if (prev === eff.requiredAttack) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_per_discarded_energy_count') {
        const discardAll = (attack.effects || []).find((e) => e.type === 'discard_all_energy');
        const energyCount = discardAll
          ? attacker?.energies?.length ?? 0
          : ctx.discardedEnergyCount || 0;
        damage += energyCount * (eff.amountPerEnergy || 20);
      }
      if (eff.type === 'optional_discard_energy_bonus' && eff.amountPerEnergy) {
        damage += (ctx.discardedEnergyCount || 0) * eff.amountPerEnergy;
      }
      if (eff.type === 'bonus_damage_on_heads' && ctx.coin === RULES.coin.heads) {
        damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_on_tails' && ctx.coin === RULES.coin.tails) {
        damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_per_damage_marker' && ctx.opponentActive) {
        const markers = this.countDamageMarkers(ctx.opponentActive);
        damage += (eff.amountPerMarker || 10) * markers;
      }
      if (eff.type === 'bonus_damage_if_attacker_has_tool' && attacker?.attachedTool) {
        damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_if_opponent_has_tool' && ctx.opponentActive?.attachedTool) {
        damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_per_heads') {
        damage += (ctx.headsCount || 0) * (eff.amountPerHeads || 20);
      }
      if (eff.type === 'bonus_damage_per_own_bench') {
        const p = this.game.state.players[attackerIndex];
        damage += p.bench.length * (eff.amountPerBench || 10);
      }
      if (eff.type === 'bonus_damage_per_discard_chevaliers') {
        const p = this.game.state.players[attackerIndex];
        const n = p.discard.filter((c) => getCardDef(c.cardId)?.cardType === 'chevalier').length;
        damage += n * (eff.amountPerCard || 10);
      }
      if (eff.type === 'bonus_damage_if_bench_card_ids') {
        const p = this.game.state.players[attackerIndex];
        if (this.hasBenchCardIds(p, eff.cardIds || [])) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_bench_knight_damaged') {
        const p = this.game.state.players[attackerIndex];
        if (this.hasDamagedBenchKnight(p, eff.nameContains, eff.cardId)) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_opponent_poisoned') {
        const opp = this.game.state.players[1 - attackerIndex];
        const willPoison = (attack.effects || []).some(
          (e) =>
            e.type === 'status' &&
            e.target === 'opponent_active' &&
            e.status === 'poisoned',
        );
        if (opp.active?.statuses.includes('poisoned') || willPoison) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_per_bronze_mineur_on_bench') {
        const p = this.game.state.players[attackerIndex];
        damage += this.countBronzeMineurOnBench(p) * (eff.amountPerBench || 10);
      }
      if (eff.type === 'bonus_damage_if_bronze_mineur_on_bench') {
        const p = this.game.state.players[attackerIndex];
        if (this.countBronzeMineurOnBench(p) >= 1) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_stadium') {
        const st = this.game.state.stadium;
        if (st && (!eff.stadiumId || st.cardId === eff.stadiumId)) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_opponent_status' && ctx.opponentActive) {
        if (eff.blockedIfHypnosTalentUsed) {
          const atkPlayer = this.game.state.players[attackerIndex];
          if (atkPlayer.modifiers?.hypnosTalentUsedThisTurn) continue;
        }
        const st = eff.statuses || [];
        if (st.some((s) => ctx.opponentActive.statuses.includes(s))) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_no_energy' && ctx.opponentActive) {
        if (!(ctx.opponentActive.energies?.length > 0)) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'bonus_damage_if_opponent_energy_at_most' && ctx.opponentActive) {
        const n = ctx.opponentActive.energies?.length ?? 0;
        if (n <= (eff.maxEnergy ?? 2)) damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_if_opponent_energy_at_least' && ctx.opponentActive) {
        const n = ctx.opponentActive.energies?.length ?? 0;
        if (n >= (eff.minEnergy ?? 3)) damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_if_own_ko_last_turn') {
        if (player.koBonusThisTurn) damage += eff.bonusDamage || 0;
      }
      if (eff.type === 'bonus_damage_per_discarded_energy') {
        const n = attacker?.energies?.length ?? 0;
        if (n > 0) damage = Math.max(damage, (eff.baseDamage || 40) * n);
      }
      if (eff.type === 'bonus_damage_vs_divinity' && ctx.opponentActive) {
        const oppDef = getCardDef(ctx.opponentActive.cardId);
        if (
          oppDef?.knightType === 'Divinite' ||
          oppDef?.rawType === 'divinite' ||
          oppDef?.tags?.includes('Divinite')
        ) {
          damage += eff.bonusDamage || 0;
        }
      }
      if (eff.type === 'optional_discard_named_cards') {
        damage += (ctx.discardedNamedCardCount || 0) * (eff.amountPerCard || 60);
      }
    }
    if (!zeroBase) {
      if (player.modifiers.bonusAttackDamageThisTurn) {
        damage += player.modifiers.bonusAttackDamageThisTurn;
      }
      if (attacker?.modifiers?.bonusAttackDamageThisTurn) {
        damage += attacker.modifiers.bonusAttackDamageThisTurn;
      }
      if (ctx.ioBonusDamage) damage += ctx.ioBonusDamage;
      damage += this.getBenchBonusActiveAttackDamage(attackerIndex);
      damage += this.getAllyAttackBonusByRawTypes(attackerIndex, attacker);
      damage += this.getMarinaAttackBonusFromPoseidon(attackerIndex, attacker);
      if (this.isMeleeAttack(attack)) {
        damage += this.getBonusMeleeFromAllies(this.game.state.players[attackerIndex]);
        if (attacker?.modifiers?.meleeBonusThisTurn) {
          damage += attacker.modifiers.meleeBonusThisTurn;
        }
      }
      damage += this.getToolBonusAttackDamage(this.game.state.players[attackerIndex].active, attack);
      damage += this.getSoloCombatBonusDamage(attackerIndex, attacker, attack);
      damage += this.getOpponentAttackBonusFromTalents(attackerIndex, attacker);
    }
    if (attacker?.modifiers?.reduceDamageDealt) {
      damage = Math.max(0, damage - attacker.modifiers.reduceDamageDealt);
    }
    damage = this.applyToolAttackDamageModifiers(attackerIndex, damage, attack, ctx);
    damage = this.modifyDamageWithStadium(attackerIndex, damage, ctx);
    return damage;
  }

  getSoloCombatBonusDamage(attackerIndex, attacker, attack = null) {
    if (!attacker) return 0;
    const def = getCardDef(attacker.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'solo_combat_modifiers');
    if (!eff || this.isTalentSilenced(attacker, attackerIndex)) return 0;
    if (!this.isSoloKnightOnField(attackerIndex, attacker)) return 0;
    if (eff.excludeMelee && attack && this.isMeleeAttack(attack)) return 0;
    return eff.bonusDamage || 0;
  }

  getOpponentAttackBonusFromTalents(attackerIndex, attacker) {
    if (!attacker) return 0;
    const defenderIndex = 1 - attackerIndex;
    const defender = this.game.state.players[defenderIndex];
    const knights = [defender.active, ...defender.bench].filter(Boolean);
    for (const ally of knights) {
      if (this.isTalentSilenced(ally, defenderIndex)) continue;
      const eff = getCardDef(ally.cardId)?.talent?.effects?.find(
        (e) => e.type === 'opponent_attack_bonus_if_opponent_status',
      );
      if (!eff) continue;
      const statuses = eff.statuses || [];
      if (statuses.some((s) => attacker.statuses.includes(s))) {
        return eff.bonusDamage || 0;
      }
    }
    return 0;
  }

  applySoloCombatDamageReduction(playerIndex, knight, dmg) {
    if (!knight || dmg <= 0) return dmg;
    const def = getCardDef(knight.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'solo_combat_modifiers');
    if (!eff || this.isTalentSilenced(knight, playerIndex)) return dmg;
    if (!this.isSoloKnightOnField(playerIndex, knight)) return dmg;
    const reduced = Math.max(0, dmg - (eff.reduceDamage || 0));
    if (reduced < dmg) {
      this.game.feedback(`Combat solitaire : −${dmg - reduced} dégâts.`, 'status');
    }
    return reduced;
  }

  attackSkipsDamageToKnight(attack, targetKnight) {
    if (!attack || !targetKnight) return false;
    const skipEff = (attack.effects || []).find((e) => e.type === 'skip_damage_to_protected');
    if (!skipEff) return false;
    const def = getCardDef(targetKnight.cardId);
    const exceptTypes = skipEff.exceptKnightTypes || [];
    if (exceptTypes.some((t) => def?.knightType === t || def?.tags?.includes(t))) return true;
    if (def?.rawType === 'divinite' || def?.knightType === 'Divinite') return true;
    const toolIds = skipEff.exceptToolIds || [];
    if (targetKnight.attachedTool && toolIds.includes(targetKnight.attachedTool.cardId)) return true;
    const toolDef = getCardDef(targetKnight.attachedTool?.cardId);
    if (toolDef?.aliases?.some((a) => toolIds.includes(a))) return true;
    if (this.isAthenaProtectedKnight(targetKnight)) return true;
    return false;
  }

  applyToolAttackDamageModifiers(attackerIndex, damage, attack, ctx) {
    void attack;
    void ctx;
    const knight = this.game.state.players[attackerIndex].active;
    if (!knight?.attachedTool) return damage;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    for (const eff of toolDef?.passiveEffects || []) {
      if (eff.type === 'double_damage_at_low_hp') {
        const threshold = eff.hpThreshold ?? 30;
        const minMax = eff.minMaxHp ?? 60;
        if (knight.currentHp <= threshold && knight.maxHp >= minMax) {
          damage *= eff.multiplier ?? 2;
        }
      }
    }
    return damage;
  }

  isMeleeAttack(attack) {
    if (!attack) return false;
    const name = (attack.name || '').toLowerCase();
    return name.includes('corps') || (attack.cost === 0 && (attack.damage ?? 0) <= 30);
  }

  getBenchBonusActiveAttackDamage(attackerIndex) {
    const player = this.game.state.players[attackerIndex];
    let bonus = 0;
    for (const benchKnight of player.bench) {
      const def = getCardDef(benchKnight?.cardId);
      const eff = def?.talent?.effects?.find((e) => e.type === 'bench_bonus_active_attack_damage');
      if (!eff) continue;
      if ((benchKnight.energies?.length ?? 0) < (eff.minEnergy ?? 2)) continue;
      bonus += eff.amount || 0;
    }
    return bonus;
  }

  getAllyAttackBonusByRawTypes(attackerIndex, attacker) {
    if (!attacker) return 0;
    const attackerDef = getCardDef(attacker.cardId);
    const player = this.game.state.players[attackerIndex];
    const allies = [player.active, ...player.bench].filter(Boolean);
    for (const ally of allies) {
      if (this.isTalentSilenced(ally, attackerIndex)) continue;
      const allyDef = getCardDef(ally.cardId);
      const eff = allyDef?.talent?.effects?.find((e) => e.type === 'ally_attack_bonus_by_raw_types');
      if (!eff?.rawTypes?.length) continue;
      if (eff.rawTypes.includes(attackerDef?.rawType)) return eff.amount || 30;
    }
    return 0;
  }

  /** Poséidon Dieu des Océans : +20 dégâts aux Généraux Marinas. */
  getMarinaAttackBonusFromPoseidon(attackerIndex, attacker) {
    if (!attacker) return 0;
    const def = getCardDef(attacker.cardId);
    if (def?.rawType !== 'armee-poseidon' && !isGeneralPoseidonKnight(def)) return 0;
    const player = this.game.state.players[attackerIndex];
    for (const k of [player.active, ...player.bench].filter(Boolean)) {
      if (this.isTalentSilenced(k, attackerIndex)) continue;
      const eff = getCardDef(k.cardId)?.talent?.effects?.find(
        (e) => e.type === 'marina_attack_bonus_global',
      );
      if (eff) return eff.amount || 20;
    }
    return 0;
  }

  /** Sorrento actif adverse + Poséidon en jeu : +N coût d'attaque (coût 0 exempt). */
  getKnightAttackCostIncrease(knight, baseCost) {
    if (!knight || baseCost <= 0) return 0;
    const ownerIndex = this.findKnightOwnerIndex(knight);
    if (ownerIndex == null) return 0;
    let extra = knight.modifiers?.attackCostPlus ?? 0;
    const oppIndex = 1 - ownerIndex;
    const opp = this.game.state.players[oppIndex];
    const sorrento = opp?.active;
    if (!sorrento) return extra;
    const def = getCardDef(sorrento.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'sorrento_flute');
    if (!eff || this.isTalentSilenced(sorrento, oppIndex)) return extra;
    const activeOk = !eff.requiresActive || opp.active?.instanceId === sorrento.instanceId;
    if (!activeOk) return extra;
    if (eff.requiresPoseidonGodInPlay && this.playerHasPoseidonGodInPlay(oppIndex)) {
      extra += eff.opponentAttackCostIncrease ?? 1;
    }
    return extra;
  }

  /** Baian actif : Mur d'Air (−60 attaques) ; contre-attaque 20 si réduit à 0. */
  applyBaianMurAirReduction(playerIndex, knight, dmg, attackerPlayerIndex) {
    const mur = knight?.modifiers?.baianMurAir;
    if (!mur || dmg <= 0) return dmg;
    const g = this.game;
    const before = dmg;
    const reduce = mur.reduce ?? 60;
    const after = Math.max(0, before - reduce);
    if (before > after) {
      g.feedback(`Mur d'Air : −${before - after} dégâts.`, 'status');
    }
    const counter = mur.counterDamage ?? 20;
    if (before > 0 && after === 0 && counter > 0 && attackerPlayerIndex != null) {
      const attacker = g.state.players[attackerPlayerIndex];
      if (attacker?.active) {
        g.feedback(`Mur d'Air : ${counter} dégâts à l'attaquant.`, 'status');
        g.damageKnight(attacker, attacker.active, counter, 'counter', playerIndex, knight.cardId);
      }
    }
    return after;
  }

  /** Baian actif : Mur de Dieu (≤40 → 0, sinon −20). */
  applyBaianMurDeDieuReduction(playerIndex, knight, dmg) {
    if (dmg <= 0) return dmg;
    const def = getCardDef(knight.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'baian_mur_de_dieu');
    if (!eff || this.isTalentSilenced(knight, playerIndex)) return dmg;
    const player = this.game.state.players[playerIndex];
    if (eff.requiresActive && player.active?.instanceId !== knight.instanceId) return dmg;
    const cap = eff.zeroIfAtMost ?? 40;
    if (dmg <= cap) {
      this.game.feedback('Mur de Dieu : aucun dégât (≤40 après les autres effets).', 'status');
      return 0;
    }
    const cut = eff.reduceDamage ?? 20;
    const after = Math.max(0, dmg - cut);
    if (after < dmg) {
      this.game.feedback(`Mur de Dieu : −${dmg - after} dégâts.`, 'status');
    }
    return after;
  }

  /** Krishna actif + Poséidon : −30 dégâts subis. */
  applyKrishnaFoiAbsolueReduction(playerIndex, knight, dmg) {
    if (!knight || dmg <= 0) return dmg;
    const def = getCardDef(knight.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'krishna_foi_absolue');
    if (!eff || this.isTalentSilenced(knight, playerIndex)) return dmg;
    const player = this.game.state.players[playerIndex];
    if (eff.requiresActive && player.active?.instanceId !== knight.instanceId) return dmg;
    if (eff.requiresPoseidonGodInPlay && !this.playerHasPoseidonGodInPlay(playerIndex)) return dmg;
    const reduced = Math.max(0, dmg - (eff.reduceDamage || 0));
    if (reduced < dmg) {
      this.game.feedback(`Foi Absolue : −${dmg - reduced} dégâts.`, 'status');
    }
    return reduced;
  }

  isTalentSilenced(knight, playerIndex) {
    if (!knight) return false;
    const def = getCardDef(knight.cardId);
    if (def?.talent?.effects?.some((e) => e.type === 'requires_julian_solo_in_play')) {
      const player = this.game.state.players[playerIndex];
      if (!playerHasJulianSoloInPlay(player)) return true;
    }
    if (def?.talent?.effects?.some((e) => e.type === 'requires_julian_or_kanon_in_play')) {
      const player = this.game.state.players[playerIndex];
      if (!playerHasJulianOrKanonDragonInPlay(player)) return true;
    }
    if (def?.knightType === 'Divinite' || def?.tags?.includes('Divinite')) return false;
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (
      player?.active?.instanceId === knight.instanceId &&
      (player.modifiers?.activeTalentSilencedTurns ?? 0) > 0
    ) {
      return true;
    }
    for (const p of g.state.players) {
      for (const bk of p.bench) {
        const bDef = getCardDef(bk?.cardId);
        const sil = bDef?.talent?.effects?.find((e) => e.type === 'bench_silence_talents');
        if (!sil) continue;
        if ((bk.energies?.length ?? 0) < 1) continue;
        const except = sil.exceptKnightTypes || ['Divinite'];
        if (except.some((t) => def?.knightType === t || def?.tags?.includes(t))) continue;
        return true;
      }
    }
    if (player?.active?.instanceId === knight.instanceId) {
      const oppIndex = 1 - playerIndex;
      const opp = g.state.players[oppIndex];
      const sorrento = opp?.active;
      if (sorrento) {
        const sDef = getCardDef(sorrento.cardId);
        const flute = sDef?.talent?.effects?.find((e) => e.type === 'sorrento_flute');
        if (flute && flute.silenceOpponentActiveTalent !== false) {
          const sorrentoActiveOk =
            !flute.requiresActive || opp.active?.instanceId === sorrento.instanceId;
          if (sorrentoActiveOk && !this.isTalentSilenced(sorrento, oppIndex)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  playerHasHadesOnBench(playerIndex, cardIds = ['hades-corps-humain', 'hades-vrai-corps']) {
    const player = this.game.state.players[playerIndex];
    return player.bench.some((k) => {
      if (!k) return false;
      const id = getCardDef(k.cardId)?.id || k.cardId;
      return cardIds.includes(id);
    });
  }

  /** Poséidon dieu en jeu (actif, banc, ou sous Julian). */
  playerHasPoseidonGodInPlay(playerIndex, cardIds = [POSEIDON_CARD_IDS.GOD]) {
    const player = this.game.state.players[playerIndex];
    for (const k of [player.active, ...(player.bench || [])].filter(Boolean)) {
      const id = getCardDef(k.cardId)?.id || k.cardId;
      if (cardIds.includes(id)) return true;
      const underId = k.underCard
        ? getCardDef(k.underCard.cardId)?.id || k.underCard.cardId
        : null;
      if (underId && cardIds.includes(underId)) return true;
    }
    return false;
  }

  /** @deprecated alias — Poséidon sur le banc uniquement. */
  playerHasPoseidonOnBench(playerIndex, cardIds = [POSEIDON_CARD_IDS.GOD]) {
    const player = this.game.state.players[playerIndex];
    return player.bench.some((k) => {
      if (!k) return false;
      const id = getCardDef(k.cardId)?.id || k.cardId;
      if (cardIds.includes(id)) return true;
      const underId = k.underCard
        ? getCardDef(k.underCard.cardId)?.id || k.underCard.cardId
        : null;
      return underId && cardIds.includes(underId);
    });
  }

  isSoloKnightOnField(playerIndex, knight) {
    const player = this.game.state.players[playerIndex];
    const knights = [player.active, ...player.bench].filter(Boolean);
    return knights.length === 1 && knights[0].instanceId === knight?.instanceId;
  }

  isKnightBenchUntargetable(knight) {
    if (!knight) return false;
    const g = this.game;
    const onBench = g.state.players.some((p) =>
      p.bench.some((k) => k?.instanceId === knight.instanceId),
    );
    if (!onBench) return false;
    const def = getCardDef(knight.cardId);
    return def?.talent?.effects?.some((e) => e.type === 'bench_untargetable');
  }

  isKnightBenchNoSwap(knight, { opponentSwap = false } = {}) {
    if (!knight) return false;
    const def = getCardDef(knight.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'bench_no_swap');
    if (!eff) return false;
    if (eff.opponentOnly) return opponentSwap;
    return true;
  }

  matchesSacrificeFilter(cardId, eff) {
    const def = getCardDef(cardId);
    if (!def) return false;
    const tags = eff.tags || [];
    if (tags.some((t) => knightHasTag(def, t))) return true;
    const orTypes = eff.orTypes || [];
    return orTypes.includes(def.rawType);
  }

  getBonusMeleeFromAllies(player) {
    let bonus = 0;
    for (const k of player.bench || []) {
      if (!k) continue;
      const def = getCardDef(k.cardId);
      const eff = def?.talent?.effects?.find((e) => e.type === 'bench_bonus_melee_ally');
      if (eff) bonus += eff.amount || 0;
    }
    return bonus;
  }

  getToolBonusAttackDamage(knight, attack = null) {
    if (!knight?.attachedTool) return 0;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    let bonus = 0;
    for (const eff of toolDef?.passiveEffects || []) {
      if (eff.type === 'bonus_attack_damage') {
        if (eff.excludeMelee && attack && this.isMeleeAttack(attack)) continue;
        bonus += eff.amount || 0;
      }
    }
    return bonus;
  }

  applyToolMaxHpBonus(knight) {
    if (!knight?.attachedTool) return;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    for (const eff of toolDef?.passiveEffects || []) {
      if (eff.type === 'bonus_max_hp') {
        knight.maxHp += eff.amount || 0;
        knight.currentHp += eff.amount || 0;
      }
      if (eff.type === 'malus_max_hp') {
        const amount = eff.amount || 0;
        knight.maxHp = Math.max(1, knight.maxHp - amount);
        knight.currentHp = Math.min(knight.currentHp, knight.maxHp);
      }
    }
  }

  findKnightOwnerIndex(knight) {
    if (!knight) return null;
    for (const p of this.game.state.players) {
      if (p.active?.instanceId === knight.instanceId) return p.index;
      if (p.bench.some((k) => k?.instanceId === knight.instanceId)) return p.index;
    }
    return null;
  }

  knightHasImmuneStatus(knight, statusId, ownerPlayerIndex = null) {
    const def = getCardDef(knight?.cardId);
    if (def?.talent?.effects?.some((e) => e.type === 'immune_all_status')) return true;
    const krishnaEff = def?.talent?.effects?.find((e) => e.type === 'krishna_foi_absolue');
    if (krishnaEff) {
      const pi = ownerPlayerIndex ?? this.findKnightOwnerIndex(knight);
      if (pi != null) {
        const player = this.game.state.players[pi];
        const activeOk = !krishnaEff.requiresActive || player.active?.instanceId === knight?.instanceId;
        const poseidonOk =
          !krishnaEff.requiresPoseidonGodInPlay || this.playerHasPoseidonGodInPlay(pi);
        const immune = krishnaEff.immuneStatuses || ['confused', 'paralyzed', 'frozen'];
        if (activeOk && poseidonOk && !this.isTalentSilenced(knight, pi) && immune.includes(statusId)) {
          return true;
        }
      }
    }
    const hadesImm = def?.talent?.effects?.find((e) => e.type === 'immune_all_status_if_hades_on_bench');
    if (hadesImm) {
      const pi = ownerPlayerIndex ?? this.findKnightOwnerIndex(knight);
      if (pi != null && this.playerHasHadesOnBench(pi, hadesImm.hadesCardIds)) {
        return true;
      }
    }
    return def?.talent?.effects?.some(
      (e) => e.type === 'immune_status' && e.status === statusId,
    );
  }

  knightImmuneOpponentHeal(knight) {
    const def = getCardDef(knight?.cardId);
    return def?.talent?.effects?.some((e) => e.type === 'immune_heal_opponent');
  }

  knightImmuneAllHeal(knight) {
    const def = getCardDef(knight?.cardId);
    return def?.talent?.effects?.some(
      (e) => e.type === 'immune_all_heal' || e.type === 'immune_heal',
    );
  }

  knightCanReceiveHeal(knight, healerPlayerIndex = null) {
    if (!knight) return false;
    if (this.knightImmuneAllHeal(knight)) return false;
    if (
      healerPlayerIndex != null &&
      healerPlayerIndex !== knight.ownerIndex &&
      this.knightImmuneOpponentHeal(knight)
    ) {
      return false;
    }
    return true;
  }

  /** Soigne un chevalier ; retire Confus (règles officielles). */
  grantKnightHeal(knight, amount, opts = {}) {
    if (!knight || amount <= 0) return 0;
    const g = this.game;
    const { healerPlayerIndex = null, requireCanHeal = true } = opts;
    if (requireCanHeal && !this.knightCanReceiveHeal(knight, healerPlayerIndex)) return 0;
    const before = knight.currentHp;
    knight.currentHp = Math.min(knight.maxHp, knight.currentHp + amount);
    if (amount > 0) g.onKnightHealed(knight);
    return knight.currentHp - before;
  }

  playerHasAthenaInPlay(player) {
    return player.discard.some((c) => {
      const id = c.cardId;
      return id === 'supporter_athena' || id === 'athena-exclamation';
    });
  }

  /** Modificateurs de dégâts globaux du stade en jeu. */
  modifyDamageWithStadium(attackerIndex, damage, ctx = {}) {
    void attackerIndex;
    void ctx;
    return damage;
  }

  /** Stub — effets du stade au début du tour du joueur actif. */
  applyStadiumTurnStart(playerIndex, stadiumFx) {
    void playerIndex;
    void stadiumFx;
  }

  /** Fin de tour : dégâts du stade en jeu (ex. Elysion). */
  async applyStadiumEndTurnDamage() {
    const g = this.game;
    const fx = g.getStadiumEffect?.();
    if (!fx?.def) return;

    const rule =
      g.findStadiumRule?.('stadium_end_turn_damage') ||
      g.findStadiumRule?.('end_turn_damage') ||
      (fx.def.effect?.endTurnDamage ? { type: 'stadium_end_turn_damage', ...fx.def.effect } : null);
    if (!rule?.endTurnDamage) return;

    const dmg = rule.endTurnDamage || 0;
    if (dmg <= 0) return;

    const targets = [];
    if (rule.target === 'active_knights' || !rule.target) {
      for (const player of g.state.players) {
        if (player.active && !this.isStadiumEndTurnDamageImmune(player.active, rule)) {
          targets.push({ player, knight: player.active });
        }
      }
    }

    if (!targets.length) return;

    const anim = fx.def.animation;
    if (anim?.effect) {
      g.anim('stadiumEffect', {
        cardId: fx.cardId,
        effectId: anim.effect,
        steps: anim.steps || [],
        duration: anim.duration || 1000,
      });
      await g.pause(anim.duration || 1000);
    }

    g.feedback(`${fx.name || fx.def.name} : ${dmg} dégâts sur chaque Chevalier actif concerné.`, 'stadium');
    for (const { player, knight } of targets) {
      g.damageKnight(player, knight, dmg, 'stadium');
    }
  }

  isStadiumEndTurnDamageImmune(knight, rule) {
    if (this.knightMatchesStadiumIgnoreType(knight, rule.ignoreTypes)) return true;
    if (this.knightHasStadiumIgnoreTool(knight, rule.ignoreTools)) return true;
    return false;
  }

  knightMatchesStadiumIgnoreType(knight, ignoreTypes = []) {
    if (!ignoreTypes.length) return false;
    const def = getCardDef(knight?.cardId);
    if (!def) return false;
    const tags = def.tags || [];
    const knightType = def.knightType || def.cardSubType || '';
    for (const typeKey of ignoreTypes) {
      if (tags.includes(typeKey) || knightType === typeKey) return true;
      const slug = typeKey
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
      if (tags.includes(slug) || tags.includes(typeKey.toLowerCase())) return true;
    }
    return false;
  }

  knightHasStadiumIgnoreTool(knight, ignoreTools = []) {
    if (!ignoreTools.length || !knight?.attachedTool) return false;
    const keys = getToolIgnoreKeys(knight.attachedTool.cardId);
    return ignoreTools.some((toolKey) => keys.includes(toolKey));
  }

  /** Stub — effets du stade juste après qu'il entre en jeu. */
  applyStadiumOnPlay(playerIndex, def) {
    void playerIndex;
    void def;
  }

  hasBenchCardIds(player, cardIds) {
    return player.bench.some((k) => cardIds.includes(k.cardId));
  }

  hasDamagedBenchKnight(player, nameContains, cardId) {
    return player.bench.some((k) => {
      if (cardId && k.cardId !== cardId) return false;
      if (nameContains && !getCardDef(k.cardId)?.name.includes(nameContains)) return false;
      return k.currentHp < k.maxHp;
    });
  }

  /** Bronze mineurs on the attacking player's bench only (not active, not opponent). */
  countBronzeMineurOnBench(player) {
    if (!player?.bench?.length) return 0;
    let count = 0;
    for (const knight of player.bench) {
      if (!knight?.cardId) continue;
      const def = getCardDef(knight.cardId);
      if (isBronzeMineur(def)) count++;
    }
    return count;
  }

  isBronzeMineurOrJuneTarget(cardId) {
    if (cardId === 'bronze_june') return true;
    return isBronzeMineur(getCardDef(cardId));
  }

  matchesAttachFilter(cardId, filter) {
    if (!filter) return true;
    if (filter === 'bronze_mineur_or_june') return this.isBronzeMineurOrJuneTarget(cardId);
    if (filter === 'chevalier-noir') return getCardDef(cardId)?.rawType === 'chevalier-noir';
    return this.matchesDeckFilter(cardId, filter);
  }

  /** hypothèse provisoire : 1 marqueur = 10 PV de dégâts déjà subis */
  countDamageMarkers(knight) {
    if (!knight) return 0;
    const lost = knight.maxHp - knight.currentHp;
    const unit = RULES.damageMarkerUnit || 10;
    return Math.floor(lost / unit);
  }

  hasEffect(attack, type) {
    return (attack.effects || []).some((e) => e.type === type);
  }

  async resolveAttackEffects(attackerIndex, attack, ctx) {
    const effects = attack.effects || [];
    for (const eff of effects) {
      await this.applyEffect(attackerIndex, attack, eff, ctx, 'attack');
    }
  }

  async applyEffect(playerIndex, source, eff, ctx, phase) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    const active = player.active;
    const oppActive = opp.active;

    switch (eff.type) {
      case 'coin_flip':
        if (!ctx.coin) {
          ctx.coin = g.flipCoinWithUI(`${source?.name || 'Attaque'} — effet de pièce`);
          g.feedback(`Pièce : ${formatCoinFlipResult(ctx.coin)}`, 'coin');
        }
        break;

      case 'status':
        if (eff.target === 'opponent_active' && oppActive) {
          g.applyStatus(opp, oppActive, eff.status);
        }
        break;

      case 'status_if_opponent_damaged':
        if (eff.target === 'opponent_active' && oppActive) {
          const alreadyDamaged = oppActive.maxHp - oppActive.currentHp > 0;
          if (alreadyDamaged) {
            g.applyStatus(opp, oppActive, eff.status);
          }
        }
        break;

      case 'ignore_opponent_damage_reduction':
      case 'ignore_opponent_damage_mitigation':
        g._ignoreOpponentDamageMitigation = true;
        break;

      case 'cannot_attach_energy_from_hand_next_turn': {
        const targetKnight = eff.target === 'opponent_active' ? oppActive : active;
        if (targetKnight) {
          targetKnight.modifiers.cannotAttachEnergyFromHand = true;
          g.feedback(
            'Maharoshini : ce chevalier ne pourra pas recevoir d\'Énergie depuis la main au prochain tour.',
            'energy',
          );
        }
        break;
      }

      case 'status_both_actives':
        if (active) g.applyStatus(player, active, eff.status);
        if (oppActive) g.applyStatus(opp, oppActive, eff.status);
        break;

      case 'heal_ally_next_turn':
        player.modifiers.pendingHealNextTurn = {
          amount: eff.amount || 30,
          ownerPlayerIndex: playerIndex,
        };
        g.feedback(
          `Au prochain tour : soignez ${eff.amount || 30} PV sur l'un de vos chevaliers.`,
          'heal',
        );
        break;

      case 'status_on_heads':
        if (ctx.coin === RULES.coin.heads && eff.target === 'opponent_active' && oppActive) {
          g.applyStatus(opp, oppActive, eff.status);
        }
        break;

      case 'status_on_tails':
        if (ctx.coin === RULES.coin.tails && eff.target === 'opponent_active' && oppActive) {
          g.applyStatus(opp, oppActive, eff.status);
        }
        break;

      case 'bench_damage':
        this.applyBenchDamage(playerIndex, eff);
        break;

      case 'discard_cards_from_hand': {
        const discardPlayerIndex = eff.owner === 'opponent' ? 1 - playerIndex : playerIndex;
        this.requestDiscard(discardPlayerIndex, eff.count || 1, ctx);
        break;
      }

      case 'discard_energy':
      case 'discard_energy_on_heads': {
        if (eff.type === 'discard_energy_on_heads' && ctx.coin !== RULES.coin.heads) break;
        const targetKnight =
          eff.target === 'opponent_active'
            ? oppActive
            : eff.target === 'self'
              ? active
              : active;
        const owner = eff.target === 'opponent_active' ? opp : player;
        this.discardEnergyFromKnight(targetKnight, eff.count || 1, owner);
        if (targetKnight && (eff.count || 1) > 0) {
          g.feedback('Énergie(s) défaussée(s).', 'energy');
        }
        break;
      }

      case 'search_deck':
        this.startSearchDeckFromEffect(playerIndex, eff, ctx.attackName || source?.name);
        break;

      case 'cant_retreat_next_turn': {
        const targetKnight = eff.target === 'opponent_active' ? oppActive : active;
        if (targetKnight) {
          targetKnight.modifiers.cantRetreat = true;
          g.feedback('Le chevalier adverse ne peut pas battre en retraite au prochain tour.', 'status');
        }
        break;
      }

      case 'discard_all_energy': {
        const targetKnight =
          eff.target === 'opponent_active'
            ? oppActive
            : eff.target === 'self'
              ? active
              : active;
        const owner = eff.target === 'opponent_active' ? opp : player;
        if (targetKnight) {
          let discarded = 0;
          while (targetKnight.energies.length) {
            const e = targetKnight.energies.pop();
            owner.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
            discarded++;
          }
          ctx.discardedEnergyCount = (ctx.discardedEnergyCount || 0) + discarded;
          if (discarded > 0) {
            g.feedback('Toutes les Énergies défaussées.', 'energy');
          }
        }
        break;
      }

      case 'self_damage':
        if (active) g.damageKnight(player, active, eff.damage || 0, 'attack');
        break;

      case 'io_projection_animale': {
        if (ctx.ioSelfDamage && active) {
          g.damageKnight(player, active, ctx.ioSelfDamage, 'attack');
        }
        if (ctx.ioStatus && oppActive) {
          g.applyStatus(opp, oppActive, ctx.ioStatus);
        }
        if (ctx.ioHealSelf && active) {
          this.applyHealToKnight(player, active, ctx.ioHealSelf, playerIndex, 'active');
        }
        break;
      }

      case 'io_big_tornado_status':
        this.startIoBigTornadoStatus(playerIndex);
        break;

      case 'bonus_damage_per_energy':
      case 'bonus_damage_per_opponent_active_energy':
      case 'bonus_if_attack_used_last_turn':
      case 'bonus_if_played_attack_last_turn':
      case 'bonus_damage_on_heads':
      case 'bonus_damage_per_own_bench':
      case 'bonus_damage_per_bronze_mineur_on_bench':
      case 'bonus_damage_if_bronze_mineur_on_bench':
      case 'bonus_damage_if_attacker_has_tool':
      case 'bonus_damage_if_opponent_has_tool':
      case 'bonus_damage_per_damage_marker':
        break;

      case 'baian_mur_air':
        if (active) {
          active.modifiers.baianMurAir = {
            reduce: eff.reduce ?? 60,
            counterDamage: eff.counterDamage ?? 20,
            untilOwnerTurn: true,
          };
          g.feedback(
            `Mur d'Air : −${eff.reduce ?? 60} dégâts des attaques adverses jusqu'à votre prochain tour.`,
            'status',
          );
        }
        break;

      case 'reduce_damage_taken_next_turn':
        if (!eff.onHeads || ctx.coin === RULES.coin.heads) {
          if (eff.target === 'self_team') {
            const team = [active, ...player.bench].filter(Boolean);
            for (const k of team) this.setDamageReduction(k, eff);
            if (team.length) {
              g.feedback(
                `−${eff.amount || 0} dégâts subis au prochain tour (actif et banc).`,
                'status',
              );
            }
          } else {
            const shieldKnight =
              eff.target === 'opponent_active' ? oppActive : active;
            if (shieldKnight) this.setDamageReduction(shieldKnight, eff);
          }
        }
        break;

      case 'block_attack_and_counter_on_heads': {
        if (ctx.coin !== RULES.coin.heads) break;
        const shieldKnight = eff.target === 'self' ? active : oppActive;
        if (!shieldKnight) break;
        shieldKnight.modifiers.blockNextAttack = true;
        shieldKnight.modifiers.counterOnBlock = eff.counterDamage || 30;
        g.feedback(
          `Mur de Cristal : prochaine attaque annulée, ${shieldKnight.modifiers.counterOnBlock} dégâts à l'attaquant (face).`,
          'status',
        );
        break;
      }

      case 'pending_mur_crystal': {
        if (!active) break;
        player.modifiers.pendingMurCrystal = {
          reduceOnPile: eff.reduceOnPile ?? 40,
          counterDamage: eff.counterDamage || 30,
          opponentTurnIndex: 1 - playerIndex,
          shieldKnightInstanceId: active.instanceId,
        };
        g.feedback(
          'Mur de Cristal : actif au prochain tour adverse (pièce à l\'attaque).',
          'status',
        );
        break;
      }

      case 'attack_blocked_unless_discard_energy': {
        const targetKnight = eff.target === 'opponent_active' ? oppActive : active;
        if (!targetKnight) break;
        targetKnight.modifiers.attackTaxDiscardEnergy = eff.energyCost || 2;
        targetKnight.modifiers.attackTaxExpiresOnTurnEnd = true;
        g.feedback(
          `Illusion : l'actif adverse devra défausser ${eff.energyCost || 2} Énergie(s) pour attaquer au prochain tour.`,
          'status',
        );
        break;
      }

      case 'opponent_active_attack_cost_plus_until_owner_turn_end': {
        if (!oppActive) break;
        const amount = eff.amount ?? 2;
        oppActive.modifiers.attackCostPlus = amount;
        oppActive.modifiers.attackCostPlusClearOnOwnerTurnEnd = true;
        g.feedback(
          `+${amount} coût d'attaque pour l'actif adverse jusqu'à la fin de son prochain tour (coût 0 exempt).`,
          'status',
        );
        break;
      }

      case 'flip_all_prizes_face_up': {
        let flipped = 0;
        for (const prize of player.prizes) {
          if (!prize.faceUp) {
            prize.faceUp = true;
            flipped++;
          }
        }
        if (flipped > 0) {
          g.feedback(`${flipped} Récompense(s) retournée(s) face visible.`, 'prize');
          g.anim('prizeReveal', { playerIndex, count: flipped });
        } else {
          g.feedback('Toutes vos Récompenses sont déjà face visible.', 'prize');
        }
        break;
      }

      case 'increase_damage_taken_next_turn':
        if (active) {
          active.modifiers.extraDamageTaken =
            (active.modifiers.extraDamageTaken || 0) + (eff.amount || 0);
          active.modifiers.extraDamageTakenUntilOwnerTurn = true;
        }
        break;

      case 'cant_use_attack_next_turn': {
        const targetKnight = eff.target === 'opponent_active' ? oppActive : active;
        if (targetKnight) {
          targetKnight.modifiers.cantUseAttackOnNextTurn = eff.attackName || '*';
        }
        break;
      }

      case 'cant_use_card_next_turn':
        opp.modifiers.cantPlayCardNextTurn = true;
        g.feedback('Adversaire ne peut pas jouer de carte au prochain tour.', 'status');
        break;

      case 'search_deck_energy': {
        if (eff.attachTo === 'own_bench_first') {
          this.searchDeckEnergyToBench(playerIndex, eff.count || 1, {
            sourceLabel: ctx.attackName || source?.name,
          });
        } else if (active) {
          this.searchDeckEnergy(playerIndex, eff.count || 1, active, 'active', {
            shuffleDeck: !!eff.shuffleDeck,
          });
        }
        break;
      }

      case 'switch_active_self':
        if (g.stadiumBlocksActiveSwap?.()) {
          g.feedback('Sanctuaire : aucun échange de Chevalier actif.', 'stadium');
          break;
        }
        if (player.bench.length) {
          g.requestPickOwnBenchActive(playerIndex, {
            sourceLabel: ctx.attackName || source?.name,
          });
        }
        break;

      case 'swap_opponent_active':
      case 'swap_opponent_active_on_heads':
        if (eff.type === 'swap_opponent_active_on_heads' && ctx.coin !== RULES.coin.heads) break;
        if (
          eff.requiresDiscardedEnergy &&
          (ctx.discardedEnergyCount || 0) < eff.requiresDiscardedEnergy
        ) {
          break;
        }
        if (g.stadiumBlocksSwapEffects?.()) {
          g.feedback('Sanctuaire : les effets d\'échange sont annulés.', 'stadium');
          break;
        }
        g.requestPickOpponentBenchActive(playerIndex, {
          attack: source,
          effect: eff,
          cardText: source?.description,
          sourceLabel: ctx.attackName || source?.name,
        });
        break;

      case 'heal_self_equal_damage_dealt':
        if (active && ctx.damageDealt > 0 && this.knightCanReceiveHeal(active, playerIndex)) {
          const healed = this.grantKnightHeal(active, ctx.damageDealt, { requireCanHeal: false });
          if (healed > 0) {
            g.feedback(`+${healed} PV (${active.currentHp}/${active.maxHp}).`, 'heal');
            g.anim('heal', { amount: healed, cardId: active.cardId, target: 'active', playerIndex });
          }
        }
        break;

      case 'draw_until_hand_size': {
        const size = eff.size || 6;
        while (player.hand.length < size && player.deck.length) {
          await g.draw(player, 1);
        }
        g.feedback(`Pioche jusqu'à ${player.hand.length} carte(s) en main.`, 'turn');
        break;
      }

      case 'search_combo_hand':
        this.resolveSearchComboHand(playerIndex, eff);
        break;

      case 'reduce_and_reflect_damage':
        if (active) {
          const amount = eff.amount || 20;
          const reflect = eff.reflect ?? amount;
          active.modifiers.reduceDamage = amount;
          active.modifiers.reflectDamage = reflect;
          active.modifiers.reduceDamageUntilOwnerTurn = true;
          active.modifiers.reflectUntilOwnerTurn = true;
          g.feedback(
            `Chaînes : −${amount} dégâts subis, renvoie ${reflect} jusqu'au prochain tour.`,
            'status',
          );
        }
        break;

      case 'heal_other_friendly':
        this.healOtherFriendly(playerIndex, active, eff);
        break;

      case 'heal_self':
        if (active && this.knightCanReceiveHeal(active, playerIndex)) {
          const healed = this.grantKnightHeal(active, eff.amount || 0, { requireCanHeal: false });
          if (healed > 0) {
            g.feedback(`+${healed} PV (${active.currentHp}/${active.maxHp}).`, 'heal');
            g.anim('heal', { amount: healed, cardId: active.cardId, target: 'active', playerIndex });
          }
        }
        break;

      case 'coin_flip_ko_no_prize':
        if (eff.onHeads && ctx.coin !== RULES.coin.heads) break;
        if (!eff.onHeads && ctx.coin === RULES.coin.tails) break;
        if (oppActive) {
          g.queueAttackKnockOut?.(opp, oppActive, { noPrize: true, source: 'attack' });
          g.feedback('Voyage : KO sans Récompense (face).', 'ko');
        }
        break;

      case 'discard_draw': {
        const discardN = eff.discard || 1;
        const drawN = eff.draw || 2;
        if (g.isAiControlled(playerIndex)) {
          for (let i = 0; i < discardN && player.hand.length; i++) {
            player.discard.push(player.hand.shift());
          }
          await g.draw(player, drawN);
          g.feedback(`Savoir : pioche de ${drawN} carte(s).`, 'turn');
        } else if (player.hand.length >= discardN) {
          g.state.pending = {
            type: 'discardForAttack',
            playerIndex,
            remaining: discardN,
            thenDraw: drawN,
            ctxAttack: ctx.attackName,
          };
          g.feedback(`Défaussez ${discardN} carte(s) (Savoir).`, 'attack');
          g.emit();
        } else {
          g.feedback('Pas assez de cartes en main à défausser.', 'warn');
        }
        break;
      }

      case 'recover_from_discard':
        this.recoverFromDiscard(playerIndex, eff);
        break;

      case 'draw':
        await g.draw(player, eff.count || 1);
        g.feedback(`Pioche de ${eff.count || 1} carte(s).`, 'turn');
        break;

      case 'reduce_damage_dealt_next_turn':
        if (oppActive) {
          oppActive.modifiers.reduceDamageDealt = eff.amount || 30;
          g.feedback(`Dégâts infligés réduits de ${eff.amount || 30} au prochain tour.`, 'status');
        }
        break;

      case 'immune_damage_next_turn': {
        if (eff.onHeads && ctx.coin !== RULES.coin.heads) break;
        const shieldKnight =
          eff.target === 'opponent_active' ? oppActive : active;
        if (shieldKnight) {
          shieldKnight.modifiers.immuneDamageNextTurn = true;
          g.feedback('Aucun dégât subi au prochain tour adverse.', 'status');
        }
        break;
      }

      case 'reveal_opponent_hand_shuffle':
        this.startRevealOpponentHandShuffle(playerIndex, ctx.attackName || source?.name);
        break;

      case 'clear_status':
        if (oppActive && eff.statuses?.length) {
          oppActive.statuses = oppActive.statuses.filter((s) => !eff.statuses.includes(s));
          g.feedback('État spécial retiré.', 'status');
        }
        break;

      case 'paralyze_if_no_energy':
        if (oppActive && !(oppActive.energies?.length > 0)) {
          g.applyStatus(opp, oppActive, 'paralyzed');
        }
        break;

      case 'discard_all_energy':
        if (eff.target === 'opponent_active' && oppActive) {
          while (oppActive.energies.length) {
            const e = oppActive.energies.pop();
            opp.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
          }
          g.feedback('Toutes les énergies adverses défaussées.', 'energy');
        } else if (active) {
          while (active.energies.length) {
            const e = active.energies.pop();
            player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
          }
        }
        break;

      case 'bonus_damage_per_discarded_energy':
        if (active) {
          const n = active.energies.length;
          while (active.energies.length) {
            const e = active.energies.pop();
            player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
          }
          if (n > 0) g.feedback(`${n} énergie(s) défaussée(s).`, 'energy');
        }
        break;

      case 'damage_opponent_any':
        this.damageOpponentAny(
          playerIndex,
          eff.damage ?? source?.damage ?? 40,
          ctx,
        );
        break;

      case 'heal_all_friendly':
        this.healAllFriendly(playerIndex, eff.amount || 30);
        break;

      case 'recover_energy_discard_attach':
        this.recoverEnergyDiscardAttach(playerIndex, active, player);
        break;

      case 'recover_energy_from_discard': {
        const targetKnight =
          eff.attachTo === 'self' || !eff.attachTo ? active : this.getKnightByTarget(player, eff.attachTo);
        if (!targetKnight) break;
        const count = eff.count || 1;
        let recovered = 0;
        for (let i = 0; i < count; i++) {
          const idx = player.discard.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
          if (idx < 0) break;
          const [energy] = player.discard.splice(idx, 1);
          targetKnight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
          recovered++;
        }
        if (recovered > 0) {
          g.feedback(`${recovered} Énergie(s) récupérée(s) de la défausse.`, 'energy');
        } else {
          g.feedback('Aucune Énergie en défausse.', 'warn');
        }
        break;
      }

      case 'optional_discard_named_cards':
        break;

      case 'detach_opponent_active_tool':
        if (oppActive?.attachedTool) {
          g.discardKnightTool(opp, oppActive);
          g.feedback('Outil adverse défaussé.', 'objet');
        }
        break;

      case 'distribute_damage_opponent_knights':
        this.startDistributeDamage(playerIndex, eff.totalDamage || 150, { benchOnly: false });
        break;

      case 'distribute_damage_opponent_bench':
        this.startDistributeDamage(playerIndex, eff.totalDamage || 30, { benchOnly: true });
        break;

      case 'coin_flip_per_discarded_knight_bench_damage':
        this.resolveCoinFlipPerDiscardedKnightBenchDamage(playerIndex, eff);
        break;

      case 'attach_self_as_tool_on_bench_knight':
        await this.resolveAttachSelfAsToolOnBenchKnight(playerIndex, eff, ctx);
        break;

      case 'replay_opponent_last_attack':
        await this.replayOpponentLastAttack(playerIndex, ctx);
        break;

      case 'disable_chosen_attack_next_turn':
        this.startDisableChosenAttack(playerIndex, opp, ctx.attackName || source?.name);
        break;

      case 'place_damage_markers_opponent_bench':
        this.placeDamageMarkersOpponentBench(playerIndex, eff);
        break;

      case 'evolve_self_from_deck_search':
        this.evolveSelfFromDeckSearch(playerIndex, eff.cardId);
        break;

      case 'optional_discard_energy_bonus':
      case 'bonus_if_played_attack_last_turn':
      case 'bonus_damage_per_discarded_energy_count':
      case 'requires_played_attack_last_turn':
        break;

      default:
        if (this.applyPartialEffect(g, eff)) break;
        g.feedback(`Effet non implémenté : ${eff.type}`, 'warn');
    }
  }

  startDisableChosenAttack(playerIndex, opp, sourceLabel) {
    const g = this.game;
    const oppActive = opp.active;
    if (!oppActive) {
      g.feedback('OM : aucun chevalier actif adverse.', 'warn');
      return;
    }
    const def = getCardDef(oppActive.cardId);
    const attacks = (def?.attacks || []).map((a) => a.name).filter(Boolean);
    if (!attacks.length) return;

    if (g.isAiControlled(playerIndex)) {
      const pick = attacks[Math.floor(Math.random() * attacks.length)];
      oppActive.modifiers.cantUseAttackOnNextTurn = pick;
      g.feedback(`OM : « ${pick} » bloquée au prochain tour.`, 'status');
      return;
    }

    g.state.pending = {
      type: 'pickDisableOpponentAttack',
      playerIndex,
      opponentIndex: 1 - playerIndex,
      attackNames: attacks,
      sourceLabel: sourceLabel || 'OM',
    };
    g.feedback('OM : choisissez une attaque adverse à bloquer au prochain tour.', 'attack');
    g.emit();
  }

  placeDamageMarkersOpponentBench(playerIndex, eff) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    const unit = RULES.damageMarkerUnit || 10;
    let remaining = eff.count || 4;
    const attr = g._damageAttribution;
    for (const bk of opp.bench) {
      if (!bk || remaining <= 0) break;
      g.damageKnight(opp, bk, unit, 'attack', attr?.playerIndex ?? playerIndex, attr?.cardId);
      remaining--;
    }
    if (remaining > 0 && opp.bench.length) {
      g.feedback(`${eff.count || 4} marqueur(s) de dégât placés sur le banc adverse.`, 'attack');
    } else if (!opp.bench.length) {
      g.feedback('Plasma : aucun chevalier sur le banc adverse.', 'info');
    }
  }

  evolveSelfFromDeckSearch(playerIndex, evolveCardId) {
    this.game.evolveActiveFromDeckSearch(playerIndex, evolveCardId);
  }

  attackHasOptionalDiscardEnergy(attack) {
    return (attack?.effects || []).some((e) => e.type === 'optional_discard_energy_bonus');
  }

  getOptionalDiscardEnergyEffect(attack) {
    return (attack?.effects || []).find((e) => e.type === 'optional_discard_energy_bonus');
  }

  attackHasOptionalDiscardNamedCards(attack) {
    return (attack?.effects || []).some((e) => e.type === 'optional_discard_named_cards');
  }

  getOptionalDiscardNamedCardsEffect(attack) {
    return (attack?.effects || []).find((e) => e.type === 'optional_discard_named_cards');
  }

  cardMatchesNamedDiscard(cardId, eff) {
    const def = getCardDef(cardId);
    if (!def) return false;
    if (eff.cardIds?.includes(def.id) || eff.cardIds?.includes(cardId)) return true;
    if (eff.aliases?.some((a) => (def.aliases || []).includes(a) || def.id === a)) return true;
    return false;
  }

  collectToolsInPlay() {
    const g = this.game;
    const candidates = [];
    for (const player of g.state.players) {
      if (player.active?.attachedTool) {
        candidates.push({
          playerIndex: player.index,
          target: 'active',
          instanceId: player.active.instanceId,
          toolName: getCardDef(player.active.attachedTool.cardId)?.name || 'Outil',
          knightName: getCardDef(player.active.cardId)?.name || 'Chevalier',
        });
      }
      player.bench.forEach((k, i) => {
        if (!k?.attachedTool) return;
        candidates.push({
          playerIndex: player.index,
          target: i,
          instanceId: k.instanceId,
          toolName: getCardDef(k.attachedTool.cardId)?.name || 'Outil',
          knightName: getCardDef(k.cardId)?.name || 'Chevalier',
        });
      });
    }
    return candidates;
  }

  startDestructionOutil(playerIndex, eff, objetDef) {
    const g = this.game;
    const maxCibles = eff.maxCibles ?? 2;
    const candidates = this.collectToolsInPlay();
    if (!candidates.length) {
      g.feedback('Sceau d\'Athéna : aucun Outil en jeu.', 'warn');
      return;
    }
    if (g.isAiControlled(playerIndex)) {
      const picks = candidates.slice(0, maxCibles);
      for (const pick of picks) {
        this.discardToolAtTarget(pick.playerIndex, pick.target);
      }
      g.feedback(`${picks.length} Outil(s) défaussé(s).`, 'objet');
      return;
    }
    g.state.pending = {
      type: 'destructionOutilDiscard',
      playerIndex,
      maxCibles,
      discarded: 0,
      options: candidates,
      sourceLabel: objetDef?.name || 'Sceau d\'Athéna',
    };
    g.feedback(`Sceau d'Athéna : défaussez jusqu'à ${maxCibles} Outil(s), ou Terminer.`, 'objet');
    g.emit();
  }

  discardToolAtTarget(playerIndex, target) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const knight = this.getKnightByTarget(player, target);
    if (!knight?.attachedTool) return false;
    player.discard.push({
      cardId: knight.attachedTool.cardId,
      instanceId: knight.attachedTool.instanceId,
    });
    const toolName = getCardDef(knight.attachedTool.cardId)?.name || 'Outil';
    knight.attachedTool = null;
    g.feedback(`${toolName} défaussé.`, 'objet');
    return true;
  }

  resolveDestructionOutilPick(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'destructionOutilDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    if ((pending.discarded ?? 0) >= (pending.maxCibles ?? 2)) return false;
    this.discardToolAtTarget(opt.playerIndex, opt.target);
    pending.discarded = (pending.discarded ?? 0) + 1;
    pending.options = this.collectToolsInPlay();
    if (!pending.options.length || pending.discarded >= pending.maxCibles) {
      g.state.pending = null;
      g.feedback('Sceau d\'Athéna : effet terminé.', 'objet');
    } else {
      g.feedback(
        `Sceau d'Athéna : ${pending.discarded}/${pending.maxCibles} — choisissez un autre Outil ou Terminer.`,
        'objet',
      );
    }
    g.emit();
    return true;
  }

  finishDestructionOutil(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'destructionOutilDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    g.state.pending = null;
    g.feedback('Sceau d\'Athéna : effet terminé.', 'objet');
    g.emit();
    return true;
  }

  resolveCoinFlipSearchTag(playerIndex, eff) {
    const g = this.game;
    const coin = g.flipCoinWithUI('Réveille des Spectres — Juge ou Spectres');
    g.feedback(formatCoinFlipSummary(coin === RULES.coin.heads ? 1 : 0, coin === RULES.coin.tails ? 1 : 0), 'coin');
    const branch = coin === RULES.coin.heads ? eff.onHeads : eff.onTails;
    if (!branch?.filter) {
      g.feedback('Réveille des Spectres : aucun effet.', 'coin');
      return;
    }
    const count = branch.count || 1;
    const resume =
      count > 1
        ? {
            kind: 'searchDeckRepeat',
            playerIndex,
            filter: branch.filter,
            remaining: count - 1,
            pickIndex: 1,
            pickTotal: count,
          }
        : null;
    this.searchDeckFilteredToHand(playerIndex, branch.filter, 1, resume);
  }

  async resolveRenouvellementMain(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    while (player.hand.length) player.discard.push(player.hand.pop());
    while (opp.hand.length) opp.discard.push(opp.hand.pop());
    g.feedback('Yoma : mains défaussées.', 'supporter');
    await g.draw(opp, eff.opponentDraw ?? 8);
    await g.draw(player, eff.playerDraw ?? 5);
    g.feedback(
      `Yoma : adversaire pioche ${eff.opponentDraw ?? 8}, vous piochez ${eff.playerDraw ?? 5}.`,
      'supporter',
    );
  }

  applyCerbereBenchBonusAfterAttack(attackerIndex) {
    const g = this.game;
    const player = g.state.players[attackerIndex];
    const bonusState = player.modifiers.nextAttackBenchBonus;
    if (!bonusState) return;
    player.modifiers.nextAttackBenchBonus = null;

    const opp = g.state.players[1 - attackerIndex];
    const filled = opp.bench
      .map((k, i) => ({ knight: k, target: i }))
      .filter(({ knight }) => knight && !this.isKnightBenchUntargetable(knight));
    if (!filled.length) {
      g.feedback('Cerbère : aucun chevalier sur le banc adverse.', 'info');
      return;
    }

    const dmg = bonusState.bonus ?? 30;
    const maxTargets = bonusState.maxTargets ?? 3;

    if (filled.length === 1 || maxTargets === 1) {
      const pick = filled[0];
      g.damageKnight(opp, pick.knight, dmg, 'attack', attackerIndex, player.active?.cardId);
      g.feedback(`Cerbère : ${dmg} dégâts sur le banc adverse.`, 'damage');
      return;
    }

    if (g.isAiControlled(attackerIndex)) {
      const picks = filled.slice(0, maxTargets);
      for (const { knight } of picks) {
        g.damageKnight(opp, knight, dmg, 'attack', attackerIndex, player.active?.cardId);
      }
      g.feedback(`Cerbère : ${dmg} dégâts à ${picks.length} chevalier(s) de banc.`, 'damage');
      return;
    }

    g.state.pending = {
      type: 'cerbereBenchBonus',
      playerIndex: attackerIndex,
      opponentIndex: 1 - attackerIndex,
      amount: dmg,
      remaining: maxTargets,
      selected: [],
      options: filled.map(({ knight, target }) => ({ target, instanceId: knight.instanceId })),
    };
    g.feedback(
      `Cerbère : choisissez jusqu'à ${maxTargets} chevalier(s) de banc adverse (+${dmg} dégâts chacun).`,
      'supporter',
    );
    g.emit();
  }

  resolveCerbereBenchBonusPick(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'cerbereBenchBonus' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const opp = g.state.players[pending.opponentIndex ?? 1 - playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    if (pending.selected?.includes(instanceId)) return false;
    const knight = opp.bench.find((k) => k?.instanceId === instanceId);
    if (!knight || this.isKnightBenchUntargetable(knight)) return false;

    g.damageKnight(opp, knight, pending.amount || 30, 'attack', playerIndex, null);
    pending.selected = [...(pending.selected || []), instanceId];
    pending.remaining = (pending.remaining ?? 1) - 1;

    if (pending.remaining <= 0) {
      g.state.pending = null;
      g.feedback('Cerbère : bonus de banc appliqué.', 'supporter');
    } else {
      g.feedback(
        `Cerbère : encore ${pending.remaining} cible(s) (+${pending.amount} dégâts).`,
        'supporter',
      );
    }
    g.emit();
    return true;
  }

  finishCerbereBenchBonus(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'cerbereBenchBonus' || pending.playerIndex !== playerIndex) {
      return false;
    }
    g.state.pending = null;
    g.feedback('Cerbère : bonus de banc terminé.', 'supporter');
    g.emit();
    return true;
  }

  getAttackerBonusPrizeOnKnockout(knight) {
    if (!knight?.attachedTool) return 0;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    const eff = toolDef?.passiveEffects?.find((e) => e.type === 'bonus_prize_on_knockout');
    return eff?.amount ?? 0;
  }

  attackSwapRequiresDiscardedEnergy(attack) {
    return (attack?.effects || []).some(
      (e) =>
        (e.type === 'swap_opponent_active' || e.type === 'swap_opponent_active_on_heads') &&
        e.requiresDiscardedEnergy,
    );
  }

  resolveTransferEnergyTalent(playerIndex, knight) {
    const g = this.game;
    const p = g.state.players[playerIndex];
    const hasSource =
      (p.active?.energies?.length > 0) ||
      p.bench.some((k) => k?.energies?.length > 0);
    const hasDest =
      p.active ||
      p.bench.length > 0;
    if (!hasSource || !hasDest) {
      g.feedback('Proche des dieux : aucune Énergie à transférer.', 'warn');
      return false;
    }
    g.state.pending = {
      type: 'transferEnergyTalent',
      playerIndex,
      knightInstanceId: knight.instanceId,
      step: 'from',
    };
    g.feedback('Proche des dieux : chevalier source (avec Énergie).', 'talent');
    g.emit();
    return true;
  }

  resolveMeleeBonusOneAllyTalent(playerIndex, knight, talent) {
    const g = this.game;
    const p = g.state.players[playerIndex];
    const eff = talent.effects?.find((e) => e.type === 'melee_bonus_one_ally_turn');
    if (!eff) return false;
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Armes de la Balance déjà utilisées ce tour.', 'warn');
      return false;
    }
    const allies = [];
    if (p.active) allies.push({ knight: p.active, target: 'active' });
    p.bench.forEach((k, i) => {
      if (k) allies.push({ knight: k, target: i });
    });
    if (!allies.length) return false;

    if (g.isAiControlled(playerIndex)) {
      const pick = allies[0];
      pick.knight.modifiers.meleeBonusThisTurn = eff.amount || 20;
      knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
      g.feedback(
        `Armes de la Balance : +${eff.amount || 20} aux corps à corps de ${getCardDef(pick.knight.cardId).name} ce tour.`,
        'talent',
      );
      g.emit();
      return true;
    }

    g.state.pending = {
      type: 'pickMeleeBonusAlly',
      playerIndex,
      amount: eff.amount || 20,
      options: allies.map((a) => ({ target: a.target, instanceId: a.knight.instanceId })),
      fromTalent: { knightInstanceId: knight.instanceId },
    };
    g.feedback('Armes de la Balance : choisissez un chevalier (+20 corps à corps ce tour).', 'talent');
    g.emit();
    return true;
  }

  resolveAiorSwapTalent(playerIndex, benchKnight, talent) {
    const g = this.game;
    const p = g.state.players[playerIndex];
    const eff = talent.effects?.find((e) => e.type === 'swap_active_with_self_if_card_ids');
    if (!eff || !p.bench.some((k) => k?.instanceId === benchKnight.instanceId)) {
      return false;
    }
    const active = p.active;
    if (!active) {
      g.feedback('Un ami précieux : aucun chevalier actif.', 'warn');
      return false;
    }
    const ids = eff.cardIds || AIOR_LION_FRIEND_CARD_IDS;
    const activeCanon = getCardDef(active.cardId)?.id || active.cardId;
    if (!ids.includes(activeCanon) && !ids.includes(active.cardId)) {
      g.feedback('Un ami précieux : actif incompatible.', 'warn');
      return false;
    }
    if (g.stadiumBlocksActiveSwap?.()) {
      g.feedback('Sanctuaire : aucun échange de Chevalier actif.', 'stadium');
      return false;
    }
    const benchIdx = p.bench.indexOf(benchKnight);
    const healAmt = eff.heal || 40;
    p.active = benchKnight;
    p.bench[benchIdx] = active;
    if (this.knightCanReceiveHeal(benchKnight, playerIndex)) {
      const healedAmt = this.grantKnightHeal(benchKnight, healAmt, { requireCanHeal: false });
      g.feedback(`Un ami précieux : échange et +${healAmt} PV sur ${getCardDef(benchKnight.cardId).name}.`, 'talent');
      g.anim('heal', { amount: healedAmt || healAmt, cardId: benchKnight.cardId, target: 'active', playerIndex });
    } else {
      g.feedback('Un ami précieux : échange effectué.', 'talent');
    }
    benchKnight.talentUsed = true;
    g.emit();
    return true;
  }

  applyPartialEffect(g, eff) {
    const partialTypes = [
      'teleport_once_per_turn',
      'bench_reduce_damage',
      'return_prize_on_knockout',
      'immune_status',
      'immune_heal_opponent',
      'immune_all_heal',
    ];
    if (!partialTypes.includes(eff.type)) return false;
    g.feedback(`Effet partiel : ${eff.type} (à activer manuellement).`, 'info');
    return true;
  }

  applyBenchDamage(attackerIndex, eff) {
    const g = this.game;
    const def = g.state.players[attackerIndex];
    const atk = g.state.players[1 - attackerIndex];
    const dmg = eff.damage || 0;
    const attr = g._damageAttribution;
    const dealerIndex = attr?.playerIndex === attackerIndex ? attr.playerIndex : attackerIndex;
    const dealerCardId =
      attr?.playerIndex === attackerIndex ? attr.cardId : def.active?.cardId ?? null;

    const hit = (victimPlayer, victimKnight) => {
      if (!victimKnight || this.isKnightBenchUntargetable(victimKnight)) return;
      g.damageKnight(victimPlayer, victimKnight, dmg, 'attack', dealerIndex, dealerCardId);
    };

    if (eff.target === 'opponent_bench_all') {
      atk.bench.forEach((k) => hit(atk, k));
    } else if (eff.target === 'self_bench_all') {
      def.bench.forEach((k) => hit(def, k));
    } else if (eff.target === 'all_bench') {
      def.bench.forEach((k) => hit(def, k));
      atk.bench.forEach((k) => hit(atk, k));
    } else if (eff.target === 'opponent_bench_one' && atk.bench.length) {
      const filled = atk.bench
        .map((k, i) => ({ knight: k, target: i }))
        .filter(({ knight }) => knight && !this.isKnightBenchUntargetable(knight));
      if (!filled.length) return;
      if (filled.length === 1) {
        hit(atk, filled[0].knight);
        g.feedback(`${dmg} dégâts sur le banc adverse.`, 'damage');
        return;
      }
      if (g.isAiControlled(attackerIndex)) {
        const pick = filled.reduce(
          (best, t) => (t.knight.currentHp < best.knight.currentHp ? t : best),
          filled[0],
        );
        hit(atk, pick.knight);
        g.feedback(`${dmg} dégâts sur le banc adverse.`, 'damage');
        return;
      }
      g.state.pending = {
        type: 'pickDamageOpponentKnight',
        playerIndex: attackerIndex,
        opponentIndex: 1 - attackerIndex,
        amount: dmg,
        benchOnly: true,
        options: filled.map(({ knight, target }) => ({ target, instanceId: knight.instanceId })),
      };
      g.feedback('Choisissez un chevalier de banc adverse.', 'attack');
      g.emit();
    }
  }

  searchDeckEnergyToBench(playerIndex, count, ctx = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!player.bench.length) {
      g.feedback('Aucun chevalier sur le banc pour attacher l\'énergie.', 'warn');
      return;
    }
    const hasEnergy = player.deck.some((c) => getCardDef(c.cardId)?.cardType === 'energie');
    if (!hasEnergy) {
      g.feedback('Aucune Énergie dans le deck.', 'warn');
      return;
    }

    if (g.needsPlayerChoice(playerIndex) && player.bench.length > 1) {
      g.state.pending = {
        type: 'pickBenchForDeckEnergy',
        playerIndex,
        count,
        options: player.bench.map((k, i) => ({ target: i, instanceId: k.instanceId })),
        sourceLabel: ctx.sourceLabel,
      };
      g.feedback('Choisissez un chevalier de banc pour attacher l\'énergie.', 'energy');
      g.emit();
      return;
    }

    const benchIdx =
      g.isAiControlled(playerIndex)
        ? player.bench.reduce(
            (best, k, i) => (k.currentHp < player.bench[best].currentHp ? i : best),
            0,
          )
        : 0;
    this.searchDeckEnergy(playerIndex, count, player.bench[benchIdx], benchIdx);
  }

  requestDiscard(playerIndex, count, ctx) {
    const g = this.game;
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'discardForAttack',
        playerIndex,
        remaining: count,
        ctxAttack: ctx.attackName,
      };
      g.feedback(`D?faussez ${count} carte(s).`, 'attack');
      g.emit();
    } else {
      const p = g.state.players[1];
      for (let i = 0; i < count && p.hand.length; i++) {
        const card = p.hand.shift();
        p.discard.push(card);
      }
    }
  }

  discardEnergyFromKnight(knight, count, player) {
    if (!knight) return;
    for (let i = 0; i < count && knight.energies.length; i++) {
      const e = knight.energies.pop();
      player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    }
  }

  setDamageReduction(knight, eff) {
    const amount = eff.amount || 0;
    knight.modifiers.reduceDamage = amount;
    knight.modifiers.reduceDamageUntilOwnerTurn = true;
  }

  healOtherFriendly(playerIndex, sourceKnight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const amount = eff.amount || 0;
    if (!amount) return;

    const allies = [];
    if (player.active && player.active.instanceId !== sourceKnight?.instanceId) {
      allies.push({ knight: player.active, target: 'active' });
    }
    player.bench.forEach((k, i) => {
      if (k && k.instanceId !== sourceKnight?.instanceId) {
        allies.push({ knight: k, target: i });
      }
    });

    if (!allies.length) {
      g.feedback('Aucun autre chevalier allié à soigner.', 'warn');
      return;
    }

    if (allies.length === 1 || g.isAiControlled(playerIndex)) {
      const pick =
        g.isAiControlled(playerIndex)
          ? allies.reduce((best, a) =>
              a.knight.currentHp < best.knight.currentHp ? a : best,
            allies[0])
          : allies[0];
      this.applyHealToKnight(player, pick.knight, amount, playerIndex, pick.target);
      return;
    }

    g.state.pending = {
      type: 'pickHealAlly',
      playerIndex,
      amount,
      options: allies.map((a) => ({ target: a.target, instanceId: a.knight.instanceId })),
    };
    g.feedback(`Choisissez un chevalier allié à soigner (+${amount} PV).`, 'heal');
    g.emit();
  }

  applyHealToKnight(player, knight, amount, playerIndex, target) {
    const g = this.game;
    if (!this.knightCanReceiveHeal(knight, playerIndex)) {
      g.feedback('Ce chevalier ne peut pas être soigné.', 'warn');
      return;
    }
    const healed = this.grantKnightHeal(knight, amount, { requireCanHeal: false });
    if (healed > 0) {
      g.feedback(`+${healed} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
      g.anim('heal', { amount: healed, cardId: knight.cardId, target, playerIndex });
    }
  }

  recoverFromDiscard(playerIndex, eff) {
    const g = this.game;
    if (g.stadiumBlocksDiscardRecovery?.()) {
      g.feedback('Collier des 108 Perles : récupération depuis la défausse impossible.', 'stadium');
      return;
    }
    const player = g.state.players[playerIndex];
    const candidates = player.discard.filter((c) =>
      this.matchesDeckFilter(c.cardId, eff.filter || { cardType: 'chevalier' }),
    );
    if (!candidates.length) {
      g.feedback('Aucun chevalier récupérable en défausse.', 'warn');
      return;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'recoverDiscard',
        playerIndex,
        options: candidates.map((c) => ({ ...c })),
      };
      g.feedback('Gardien : choisissez un chevalier en défausse.', 'attack');
      g.emit();
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const idx = player.discard.findIndex((c) => c.instanceId === pick.instanceId);
    if (idx >= 0) {
      const [card] = player.discard.splice(idx, 1);
      player.hand.push(card);
      g.feedback(`${getCardDef(card.cardId).name} récupéré en main.`, 'attack');
    }
  }

  supporterSkipsKnightTarget(def) {
    const effects = def?.effects || [];
    if (!effects.length) return false;
    const skipTypes = new Set([
      'draw',
      'discard_hand_draw',
      'renouvellement_main',
      'look_top_pick_one',
      'voluntary_sacrifice_knight',
      'don_de_vie',
      'shuffle_deck',
      'search_deck',
    ]);
    return effects.every(
      (e) => skipTypes.has(e.type) || (e.type === 'search_deck' && !e.attachTo),
    );
  }

  objetSkipsKnightTarget(def) {
    const effects = def?.effects || [];
    if (!effects.length) return false;
    const skipTypes = new Set([
      'discard_hand_knight',
      'coin_flip_search_knight',
      'coin_flip_search_tag',
      'look_top_pick_one',
      'don_de_vie',
      'shuffle_deck',
      'search_deck',
      'destruction_outil',
    ]);
    return effects.every(
      (e) => skipTypes.has(e.type) || (e.type === 'search_deck' && !e.attachTo),
    );
  }

  listKnightsInHand(player) {
    return player.hand
      .map((c, handIndex) => ({ card: c, handIndex }))
      .filter(({ card }) => getCardDef(card.cardId)?.cardType === 'chevalier');
  }

  startDiscardHandKnight(playerIndex, objetDef, target, effectIndex) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const knights = this.listKnightsInHand(player);
    if (!knights.length) {
      g.feedback('Aucun Chevalier en main à défausser.', 'warn');
      return;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'discardHandKnight',
        playerIndex,
        options: knights.map(({ card, handIndex }) => ({
          handIndex,
          cardId: card.cardId,
          instanceId: card.instanceId,
        })),
        resume: {
          kind: 'objetEffects',
          playerIndex,
          cardId: objetDef.id,
          target,
          nextIndex: effectIndex + 1,
        },
      };
      g.feedback('Défaussez un Chevalier de votre main.', 'objet');
      g.emit();
      return;
    }
    const pick = knights[0];
    const [discarded] = player.hand.splice(pick.handIndex, 1);
    player.discard.push(discarded);
    g.feedback(`${getCardDef(discarded.cardId).name} défaussé.`, 'objet');
  }

  resolveDiscardHandKnight(playerIndex, handIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'discardHandKnight' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const card = player.hand[handIndex];
    if (!card || getCardDef(card.cardId)?.cardType !== 'chevalier') return false;
    const [discarded] = player.hand.splice(handIndex, 1);
    player.discard.push(discarded);
    const resume = pending.resume;
    g.state.pending = null;
    g.feedback(`${getCardDef(discarded.cardId).name} défaussé.`, 'objet');
    g.emit();
    if (resume) void g._continueAfterBenchPick(resume);
    return true;
  }

  resolveAttachEnergyFromDiscard(playerIndex, discardInstanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'attachEnergyFromDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const knight = this.getKnightByTarget(player, pending.target);
    if (!knight) return false;
    const idx = player.discard.findIndex((c) => c.instanceId === discardInstanceId);
    if (idx < 0) return false;
    if (getCardDef(player.discard[idx].cardId)?.cardType !== 'energie') return false;
    const [energy] = player.discard.splice(idx, 1);
    knight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
    g.state.pending = null;
    g.feedback('Énergie attachée depuis la défausse.', 'energy');
    g.anim('attachEnergy', {
      cardId: energy.cardId,
      target: pending.target,
      playerIndex,
      fromDeck: false,
    });
    g.emit();
    return true;
  }

  searchDeckFilteredToHand(playerIndex, filter, count = 1, resume = null) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const searchable = player.deck.filter((c) => this.matchesDeckFilter(c.cardId, filter));
    if (!searchable.length) {
      g.feedback('Aucune carte correspondante dans le deck.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      const pickIndex = resume?.pickIndex ?? 1;
      const pickTotal = resume?.pickTotal ?? count;
      const searchTotal =
        resume?.kind === 'objetEffects'
          ? resume.searchTotal || resume.searchRemaining || count
          : pickTotal;
      const progress = {
        current:
          resume?.kind === 'objetEffects'
            ? Math.max(1, searchTotal - (resume?.searchRemaining || count) + 1)
            : pickIndex,
        total: searchTotal,
      };
      const picksLeftAfter =
        resume?.kind === 'searchDeckRepeat'
          ? resume.remaining
          : resume?.kind === 'objetEffects'
            ? 0
            : count > 1
              ? count - 1
              : 0;

      let pendingResume = resume ?? null;
      if (resume?.kind === 'objetEffects') {
        pendingResume = resume;
      } else if (picksLeftAfter > 0) {
        pendingResume = {
          kind: 'searchDeckRepeat',
          playerIndex,
          filter,
          remaining: picksLeftAfter,
          pickIndex: pickIndex + 1,
          pickTotal,
          parentResume:
            resume && resume.kind !== 'searchDeckRepeat' ? resume : resume?.parentResume ?? null,
        };
      }

      g.state.pending = {
        type: 'searchDeck',
        playerIndex,
        options: searchable.map((c) => ({ ...c })),
        resume: pendingResume,
        progress,
        canFinishUpTo: !!(resume?.searchUpToRemaining > 0 || resume?.canFinishUpTo),
      };
      const pickHint = pickTotal > 1 ? ` (${pickIndex}/${pickTotal})` : '';
      g.feedback(`Choisissez une carte du deck${pickHint}.`, 'objet');
      g.emit();
      return true;
    }
    const pick = searchable[Math.floor(Math.random() * searchable.length)];
    const deckIdx = player.deck.findIndex((c) => c.instanceId === pick.instanceId);
    if (deckIdx >= 0) {
      const [found] = player.deck.splice(deckIdx, 1);
      player.hand.push(found);
      g.feedback(`${getCardDef(found.cardId).name} ajouté à la main.`, 'objet');
    }
    if (count > 1) {
      this.searchDeckFilteredToHand(playerIndex, filter, count - 1, resume);
    }
    return true;
  }

  applyBenchDamageReduction(defenderIndex, dmg, opts = {}) {
    const g = this.game;
    const player = g.state.players[defenderIndex];
    let reduced = dmg;
    const victimOnBench = !!opts.benchOnly;
    for (const benchKnight of player.bench) {
      if (!benchKnight) continue;
      const bDef = getCardDef(benchKnight.cardId);
      const eff = bDef?.talent?.effects?.find((e) => e.type === 'bench_reduce_damage');
      if (!eff) continue;
      if (eff.target === 'self_bench' && !victimOnBench) continue;
      if (eff.target !== 'self_bench' && victimOnBench) continue;
      reduced = Math.max(0, reduced - (eff.amount || 20));
    }
    if (reduced < dmg) {
      g.feedback(`Protection du banc : −${dmg - reduced} dégâts.`, 'status');
    }
    return reduced;
  }

  isAthenaProtectedKnight(knight) {
    if (!knight) return false;
    const def = getCardDef(knight.cardId);
    const id = def?.id || knight.cardId;
    if (SEIYA_PROTECTED_TARGET_CARD_IDS.includes(id)) return true;
    if (def?.faction === 'Athena') return true;
    const name = (def?.name || '').toLowerCase();
    if (/athéna|athena/.test(name)) return true;
    const toolId = knight.attachedTool?.cardId;
    if (toolId === 'bouclier-d-athena' || toolId === 'tool_sang_athena') return true;
    return false;
  }

  findSeiyaDivineProtector(player) {
    const knights = [player.active, ...player.bench].filter(Boolean);
    return knights.find((k) => {
      const def = getCardDef(k.cardId);
      return def?.id === SEIYA_DIVINE_ARMOR_CARD_ID || k.cardId === SEIYA_DIVINE_ARMOR_CARD_ID;
    });
  }

  resolveSeiyaProtectorRedirect(defenderPlayer, targetKnight) {
    const g = this.game;
    const protector = this.findSeiyaDivineProtector(defenderPlayer);
    if (!protector || !this.isAthenaProtectedKnight(targetKnight)) return targetKnight;
    if (protector.instanceId === targetKnight.instanceId) return targetKnight;
    if (this.isTalentSilenced(protector, defenderPlayer.index)) return targetKnight;
    const def = getCardDef(protector.cardId);
    const hasRedirect = def?.talent?.effects?.some(
      (e) => e.type === 'redirect_damage_from_athena_to_self',
    );
    if (!hasRedirect) return targetKnight;
    g.feedback(
      `Protecteur : dégâts redirigés vers ${def?.name || 'Seiya Armure Divine'}.`,
      'talent',
    );
    return protector;
  }

  applyReflectDamage(defenderKnight, defenderPlayer, reflectAmount, attackerPlayerIndex) {
    if (!reflectAmount || reflectAmount <= 0) return;
    const g = this.game;
    const attacker = g.state.players[attackerPlayerIndex];
    if (!attacker?.active) return;
    g.feedback(`Chaînes : ${reflectAmount} dégâts renvoyés.`, 'damage');
    g.damageKnight(attacker, attacker.active, reflectAmount, 'reflect', null);
  }

  resolveSwapWithCardId(playerIndex, knight, talent) {
    const g = this.game;
    const eff = talent.effects?.find((e) => e.type === 'swap_with_card_id');
    if (!eff?.cardId) return;
    const player = g.state.players[playerIndex];
    if (eff.hpThreshold != null && knight.currentHp > eff.hpThreshold) {
      g.feedback(`Talent : ${eff.hpThreshold} PV ou moins requis.`, 'warn');
      return;
    }
    const benchIdx = player.bench.findIndex((k) => k?.cardId === eff.cardId);
    if (benchIdx < 0) {
      g.feedback(`Aucun ${getCardDef(eff.cardId)?.name || eff.cardId} sur le banc.`, 'warn');
      return;
    }
    const partner = player.bench[benchIdx];
    if (eff.transferEnergyTo && partner) {
      const energies = [...knight.energies];
      knight.energies = [];
      partner.energies.push(...energies);
    }
    if (player.active?.instanceId === knight.instanceId) {
      g.switchActiveWithBench(playerIndex, benchIdx);
    } else {
      const activeIdx = player.bench.findIndex((k) => k?.instanceId === knight.instanceId);
      if (activeIdx >= 0) {
        const tmp = player.bench[activeIdx];
        player.bench[activeIdx] = player.bench[benchIdx];
        player.bench[benchIdx] = tmp;
      }
    }
    knight.talentUsed = true;
    g.feedback(`${talent.name} : échange effectué.`, 'talent');
  }

  resolveTeleportTalent(playerIndex, knight, talent) {
    const g = this.game;
    const eff = talent.effects?.find((e) => e.type === 'teleport_once_per_turn');
    const discardN = eff?.discardEnergyFromHand || 0;
    const player = g.state.players[playerIndex];

    if (discardN > 0) {
      const energies = player.hand.filter((c) => getCardDef(c.cardId)?.cardType === 'energie');
      if (energies.length < discardN) {
        g.feedback('Téléportation : défaussez une Énergie de votre main.', 'warn');
        return;
      }
      if (g.needsPlayerChoice(playerIndex)) {
        g.state.pending = {
          type: 'discardEnergyFromHandForTalent',
          playerIndex,
          count: discardN,
          fromTalent: {
            playerIndex,
            knightInstanceId: knight.instanceId,
            swapScope: eff?.swapScope || 'own',
          },
        };
        g.feedback(`Défaussez ${discardN} Énergie(s) (Téléportation).`, 'talent');
        g.emit();
        return;
      }
      for (let i = 0; i < discardN; i++) {
        const idx = player.hand.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
        if (idx >= 0) {
          player.discard.push(player.hand.splice(idx, 1)[0]);
        }
      }
    }

    this.continueTeleportAfterEnergyDiscard(playerIndex, knight, talent, eff);
  }

  continueTeleportAfterEnergyDiscard(playerIndex, knight, talent, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    const swapScope = eff?.swapScope || 'own';
    const canOwn = player.active && player.bench.some(Boolean);
    const canOpp = opp.active && opp.bench.some(Boolean);

    if (swapScope === 'own_or_opponent' && canOwn && canOpp) {
      if (g.needsPlayerChoice(playerIndex)) {
        g.state.pending = {
          type: 'teleportPickSide',
          playerIndex,
          fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
        };
        g.feedback('Téléportation : échangez votre actif ou celui de l\'adversaire ?', 'talent');
        g.emit();
        return;
      }
      if (Math.random() < 0.5 && canOwn) {
        g.requestPickOwnBenchActive(playerIndex, {
          sourceLabel: talent.name,
          fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
        });
      } else {
        g.requestPickOpponentBenchActive(playerIndex, {
          sourceLabel: talent.name,
          fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
        });
      }
      return;
    }

    if (canOwn) {
      g.requestPickOwnBenchActive(playerIndex, {
        sourceLabel: talent.name,
        fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
      });
      return;
    }
    if (canOpp) {
      g.requestPickOpponentBenchActive(playerIndex, {
        sourceLabel: talent.name,
        fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
      });
      return;
    }
    g.feedback('Téléportation : aucun échange possible.', 'warn');
  }

  resolveTalentDiscardDraw(playerIndex, knight, talent) {
    const g = this.game;
    const eff = talent.effects?.find((e) => e.type === 'discard_draw');
    if (!eff) return;
    const player = g.state.players[playerIndex];
    const discardN = eff.discard || 1;
    const drawN = eff.draw || 1;
    if (g.isAiControlled(playerIndex)) {
      for (let i = 0; i < discardN && player.hand.length; i++) {
        player.discard.push(player.hand.shift());
      }
      void g.draw(player, drawN);
      knight.talentUsed = true;
      g.feedback(`Savoir : pioche de ${drawN} carte(s).`, 'turn');
      return;
    }
    if (player.hand.length >= discardN) {
      g.state.pending = {
        type: 'discardForTalent',
        playerIndex,
        remaining: discardN,
        thenDraw: drawN,
        fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
      };
      g.feedback(`Défaussez ${discardN} carte(s) (Savoir).`, 'talent');
      g.emit();
    } else {
      g.feedback('Pas assez de cartes en main à défausser.', 'warn');
    }
  }

  searchDeckEnergy(playerIndex, count, knight, target = 'active', opts = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!knight) return;

    let attached = 0;
    let lastCardId = null;
    for (let i = player.deck.length - 1; i >= 0 && attached < count; i--) {
      const c = player.deck[i];
      const def = getCardDef(c.cardId);
      if (def?.cardType === 'energie') {
        const [card] = player.deck.splice(i, 1);
        knight.energies.push({ cardId: card.cardId, instanceId: card.instanceId });
        lastCardId = card.cardId;
        attached++;
      }
    }
    if (attached > 0) {
      g.feedback(`${attached} énergie(s) attachée(s) depuis le deck.`, 'energy');
      g.anim('attachEnergy', {
        cardId: lastCardId,
        target,
        playerIndex,
        fromDeck: true,
      });
    }
    if (opts.shuffleDeck && player.deck.length > 1) {
      g.shufflePlayerDeck?.(playerIndex);
      g.feedback('Deck mélangé.', 'turn');
    }
  }

  /** Cherche N énergies : 1 attachée au chevalier, le reste en main (Entraînement de Dokho). */
  searchDeckEnergySplit(playerIndex, count, knight, target = 'active') {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!knight) return;

    const found = [];
    for (let i = player.deck.length - 1; i >= 0 && found.length < count; i--) {
      const c = player.deck[i];
      if (getCardDef(c.cardId)?.cardType === 'energie') {
        found.push(player.deck.splice(i, 1)[0]);
      }
    }
    if (!found.length) {
      g.feedback('Aucune Énergie trouvée dans le deck.', 'warn');
      return;
    }
    const [toAttach, ...rest] = found;
    knight.energies.push({ cardId: toAttach.cardId, instanceId: toAttach.instanceId });
    g.feedback('1 Énergie attachée depuis le deck.', 'energy');
    g.anim('attachEnergy', {
      cardId: toAttach.cardId,
      target,
      playerIndex,
      fromDeck: true,
    });
    for (const card of rest) {
      player.hand.push(card);
      g.anim('drawReveal', { cardId: card.cardId, playerIndex });
    }
    if (rest.length) {
      g.feedback(`${rest.length} Énergie(s) ajoutée(s) à la main.`, 'energy');
    }
  }

  getKnightByTarget(player, target) {
    if (target === 'active') return player.active;
    if (typeof target === 'number') return player.bench[target] || null;
    return null;
  }

  async resolveObjetEffects(playerIndex, objetDef, target, startIndex = 0) {
    const g = this.game;
    const player = g.state.players[playerIndex];

    for (let ei = startIndex; ei < (objetDef.effects || []).length; ei++) {
      const eff = objetDef.effects[ei];
      if (eff.type === 'move_energy_between_knights') continue;

      switch (eff.type) {
        case 'search_deck': {
          const count = eff.count || 1;
          const searchable = player.deck.filter((c) =>
            this.matchesDeckFilter(c.cardId, eff.filter),
          );
          if (!searchable.length) {
            if (eff.optional) {
              g.feedback('Aucune carte correspondante — suite de l\'effet.', 'info');
              break;
            }
            g.feedback('Aucune carte correspondante dans le deck.', 'warn');
            break;
          }
          const pickCount = eff.upTo ? Math.min(count, searchable.length) : count;
          const resume = {
            kind: 'objetEffects',
            playerIndex,
            cardId: objetDef.id,
            target,
            nextIndex: ei + 1,
            searchRemaining: pickCount,
            searchTotal: pickCount,
            searchFilter: eff.filter,
            searchUpToRemaining: eff.upTo ? pickCount : null,
            canFinishUpTo: !!eff.upTo,
          };
          if (
            !this.searchDeckFilteredToHand(playerIndex, eff.filter, pickCount, {
              ...resume,
              remaining: pickCount,
            })
          ) {
            break;
          }
          if (g.state.pending) return;
          break;
        }
        case 'shuffle_deck':
          if (player.deck.length > 1) {
            g.shufflePlayerDeck?.(playerIndex);
            g.feedback('Deck mélangé.', 'turn');
          }
          break;
        case 'look_top_pick_one':
          this.startLookTopPickOne(playerIndex, eff, objetDef);
          if (g.state.pending) return;
          break;
        case 'voluntary_sacrifice_knight':
          this.startVoluntarySacrificeKnight(playerIndex, objetDef);
          if (g.state.pending) return;
          break;
        case 'don_de_vie':
          this.startDonDeVie(playerIndex, objetDef, eff);
          if (g.state.pending) return;
          break;
        case 'search_deck_energy': {
          const knight = this.getKnightByTarget(player, target);
          if (eff.attachFilter) {
            if (!knight || !this.matchesAttachFilter(knight.cardId, eff.attachFilter)) {
              g.feedback('Cible invalide pour cet effet.', 'warn');
              break;
            }
          }
          if (knight) this.searchDeckEnergy(playerIndex, eff.count || 1, knight, target);
          break;
        }
        case 'attach_energy_from_hand': {
          const knight = this.getKnightByTarget(player, target);
          if (!knight) {
            g.feedback('Choisissez un Chevalier allié.', 'warn');
            break;
          }
          const energies = player.hand
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => getCardDef(c.cardId)?.cardType === 'energie');
          if (!energies.length) {
            g.feedback('Aucune Énergie en main à attacher.', 'warn');
            break;
          }
          if (g.needsPlayerChoice(playerIndex) && energies.length > 1) {
            g.state.pending = {
              type: 'attachEnergyFromHand',
              playerIndex,
              target,
              options: energies.map(({ c, i }) => ({ handIndex: i, cardId: c.cardId, instanceId: c.instanceId })),
              resume: {
                kind: 'objetEffects',
                playerIndex,
                cardId: objetDef.id,
                target,
                nextIndex: ei + 1,
              },
            };
            g.feedback('Choisissez une Énergie de votre main à attacher.', 'energy');
            g.emit();
            return;
          }
          const pick = energies[0];
          const [energyCard] = player.hand.splice(pick.i, 1);
          knight.energies.push({ cardId: energyCard.cardId, instanceId: energyCard.instanceId });
          g.feedback('Énergie attachée depuis la main.', 'energy');
          g.anim('attachEnergy', { cardId: energyCard.cardId, target, playerIndex, fromDeck: false });
          break;
        }
        case 'heal_full': {
          const knight = this.getKnightByTarget(player, target);
          if (knight) {
            const healed = knight.maxHp - knight.currentHp;
            knight.currentHp = knight.maxHp;
            g.onKnightHealed(knight);
            if (healed > 0) {
              g.feedback(`Soins complets : +${healed} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
              g.anim('heal', { amount: healed, cardId: knight.cardId, target, playerIndex });
            }
          }
          break;
        }
        case 'draw_per_prize_lead': {
          const opp = g.state.players[1 - playerIndex];
          const lead = player.prizes.length - opp.prizes.length;
          if (lead <= 0) {
            g.feedback('Seigneur Odin : vous ne menez pas aux Récompenses.', 'warn');
            break;
          }
          const cap = eff.maxHand ?? RULES.maxHand;
          const room =
            typeof cap === 'number' && cap > 0
              ? Math.max(0, cap - player.hand.length)
              : player.deck.length;
          const drawCount = Math.min((eff.perLead || 2) * lead, room, player.deck.length);
          if (drawCount > 0) {
            await g.draw(player, drawCount);
            g.feedback(`Seigneur Odin : pioche de ${drawCount} carte(s).`, 'supporter');
          }
          break;
        }
        case 'search_deck_energy_split': {
          const knight = this.getKnightByTarget(player, target);
          if (!knight) {
            g.feedback('Choisissez un Chevalier pour attacher une Énergie.', 'warn');
            break;
          }
          this.searchDeckEnergySplit(playerIndex, eff.count || 2, knight, target);
          break;
        }
        case 'switch_active_with_bench': {
          if (g.stadiumBlocksActiveSwap?.()) {
            g.feedback('Sanctuaire : aucun échange de Chevalier actif.', 'stadium');
            break;
          }
          if (typeof target === 'number') {
            g.switchActiveWithBench(playerIndex, target);
          } else {
            g.requestPickOwnBenchActive(playerIndex, {
              sourceLabel: objetDef.name,
              resume: null,
            });
            if (g.state.pending) return;
          }
          break;
        }
        case 'swap_opponent_active': {
          if (g.stadiumBlocksSwapEffects?.()) {
            g.feedback('Sanctuaire : les effets d\'échange sont annulés.', 'stadium');
            break;
          }
          g.requestPickOpponentBenchActive(playerIndex, {
            effect: eff,
            cardText: objetDef.text || objetDef.effectText,
            sourceLabel: objetDef.name,
            resume: {
              kind: 'objetEffects',
              playerIndex,
              cardId: objetDef.id,
              target,
              nextIndex: ei + 1,
            },
          });
          if (g.state.pending) return;
          break;
        }
        case 'heal': {
          const knight = this.getKnightByTarget(player, target);
          if (knight) {
            const amount = eff.amount || 0;
            const healed = this.grantKnightHeal(knight, amount, {
              healerPlayerIndex: playerIndex,
              requireCanHeal: false,
            });
            const shown = healed > 0 ? healed : amount;
            g.feedback(`+${shown} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
            g.anim('heal', {
              amount: shown,
              cardId: knight.cardId,
              target,
              playerIndex,
            });
          }
          break;
        }
        case 'clear_all_special_status':
        case 'heal_all_status': {
          const knight = this.getKnightByTarget(player, eff.target === 'self' ? target : target);
          if (knight) {
            knight.statuses = [];
            g.feedback('Effets spéciaux soignés.', 'status');
            g.anim('status', { status: 'cleared', removed: true });
          }
          break;
        }
        case 'discard_all_energy': {
          const knight =
            eff.target === 'chosen_knight' || eff.target === 'chosen_own_knight'
              ? this.getKnightByTarget(player, target)
              : this.getKnightByTarget(player, target);
          if (knight) {
            while (knight.energies.length) {
              const e = knight.energies.pop();
              player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
            }
            g.feedback('Énergies défaussées.', 'energy');
          }
          break;
        }
        case 'draw': {
          await g.draw(player, eff.count || 1);
          g.feedback(`Pioche de ${eff.count || 1} carte(s).`, 'turn');
          break;
        }
        case 'bonus_attack_damage_this_turn': {
          player.modifiers.bonusAttackDamageThisTurn =
            (player.modifiers.bonusAttackDamageThisTurn || 0) + (eff.amount || 0);
          g.feedback(`+${eff.amount || 0} dégâts aux attaques ce tour.`, 'supporter');
          break;
        }
        case 'draw_until_hand_size': {
          const size = eff.size || 6;
          while (player.hand.length < size && player.deck.length) {
            await g.draw(player, 1);
          }
          g.feedback(`Pioche jusqu'à ${player.hand.length} carte(s) en main.`, 'turn');
          break;
        }
        case 'discard_hand_draw': {
          while (player.hand.length) {
            player.discard.push(player.hand.pop());
          }
          const n =
            g.state.turnCount <= 1 && eff.countFirstTurn != null
              ? eff.countFirstTurn
              : eff.count || 6;
          await g.draw(player, n);
          g.feedback(`Main défaussée, pioche de ${n}.`, 'supporter');
          break;
        }
        case 'athena_choice':
          this.resolveAthenaChoice(playerIndex, eff);
          break;
        case 'coin_flip_search_knight':
          this.resolveCoinFlipSearchKnight(playerIndex, eff);
          break;
        case 'reduce_damage_taken_next_turn': {
          const knight = this.getKnightByTarget(player, target);
          if (knight) {
            this.setDamageReduction(knight, eff);
            g.feedback(
              `−${eff.amount || 0} dégâts subis au prochain tour (${getCardDef(knight.cardId).name}).`,
              'status',
            );
          }
          break;
        }
        case 'redistribute_energy':
          this.resolveRedistributeEnergy(playerIndex);
          break;
        case 'athena_exclamation':
          this.resolveAthenaExclamation(playerIndex, eff);
          break;
        case 'survie':
          this.applySunreiProtection(playerIndex, eff);
          break;
        case 'acceleration_energie':
          this.startAccelerationEnergie(playerIndex, eff, objetDef);
          if (g.state.pending) return;
          break;
        case 'discard_hand_knight':
          this.startDiscardHandKnight(playerIndex, objetDef, target, ei);
          if (g.state.pending) return;
          break;
        case 'attach_energy_from_discard': {
          const knight = this.getKnightByTarget(player, target);
          if (!knight) {
            g.feedback('Choisissez un Chevalier allié.', 'warn');
            break;
          }
          const energies = player.discard
            .map((c, discardIndex) => ({ c, discardIndex }))
            .filter(({ c }) => getCardDef(c.cardId)?.cardType === 'energie');
          if (!energies.length) {
            g.feedback('Aucune Énergie en défausse.', 'warn');
            break;
          }
          if (g.needsPlayerChoice(playerIndex) && energies.length > 1) {
            g.state.pending = {
              type: 'attachEnergyFromDiscard',
              playerIndex,
              target,
              options: energies.map(({ c, discardIndex }) => ({
                discardIndex,
                cardId: c.cardId,
                instanceId: c.instanceId,
              })),
            };
            g.feedback('Choisissez une Énergie de votre défausse.', 'energy');
            g.emit();
            return;
          }
          const pick = energies[0];
          const idx = player.discard.findIndex((c) => c.instanceId === pick.c.instanceId);
          if (idx >= 0) {
            const [energy] = player.discard.splice(idx, 1);
            knight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
            g.feedback('Énergie attachée depuis la défausse.', 'energy');
            g.anim('attachEnergy', {
              cardId: energy.cardId,
              target,
              playerIndex,
              fromDeck: false,
            });
          }
          break;
        }
        case 'attach_from_discard':
          this.resolveAttachFromDiscard(playerIndex, eff, objetDef);
          break;
        case 'destruction_outil':
          this.startDestructionOutil(playerIndex, eff, objetDef);
          if (g.state.pending) return;
          break;
        case 'coin_flip_search_tag':
          this.resolveCoinFlipSearchTag(playerIndex, eff);
          if (g.state.pending) return;
          break;
        case 'bonus_degats_banc':
          player.modifiers.nextAttackBenchBonus = {
            bonus: eff.bonus ?? 30,
            maxTargets: eff.ciblesMax ?? 3,
          };
          g.feedback(
            `Cerbère : prochaine attaque — +${eff.bonus ?? 30} dégâts à ${eff.ciblesMax ?? 3} chevalier(s) de banc adverse(s).`,
            'supporter',
          );
          break;
        case 'renouvellement_main':
          await this.resolveRenouvellementMain(playerIndex, eff);
          break;
        default:
          if (this.applyPartialEffect(g, eff)) break;
          g.feedback(`Effet objet non implemente : ${eff.type}`, 'warn');
      }
    }
  }

  resolveAthenaChoice(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const max = eff.recycleMax || 6;
    const searchable = player.deck.filter((c) => {
      const d = getCardDef(c.cardId);
      return d?.cardType === 'supporter' || d?.cardType === 'objet' || d?.cardType === 'stade';
    });

    if (searchable.length > 0) {
      if (g.needsPlayerChoice(playerIndex)) {
        g.state.pending = {
          type: 'searchDeck',
          playerIndex,
          options: searchable.map((c) => ({ ...c })),
          source: 'athena',
        };
        g.feedback('Athéna : choisissez un Supporter, Stade ou Objet du deck.', 'supporter');
        g.emit();
        return;
      }
      const pick = searchable[Math.floor(Math.random() * searchable.length)];
      const deckIdx = player.deck.findIndex((c) => c.instanceId === pick.instanceId);
      if (deckIdx >= 0) {
        const [found] = player.deck.splice(deckIdx, 1);
        player.hand.push(found);
        g.feedback(`Athéna (IA) : ${getCardDef(found.cardId).name} en main.`, 'supporter');
      }
      return;
    }

    this.recycleDiscardToDeck(playerIndex, max);
  }

  recycleDiscardToDeck(playerIndex, max) {
    const g = this.game;
    if (g.stadiumBlocksDiscardRecovery?.()) {
      g.feedback('Collier des 108 Perles : récupération depuis la défausse impossible.', 'stadium');
      return;
    }
    const player = g.state.players[playerIndex];
    const moved = [];
    for (let i = player.discard.length - 1; i >= 0 && moved.length < max; i--) {
      const c = player.discard[i];
      const d = getCardDef(c.cardId);
      if (d?.cardType === 'energie' || d?.cardType === 'chevalier') {
        moved.push(player.discard.splice(i, 1)[0]);
      }
    }
    for (let i = moved.length - 1; i >= 0; i--) {
      player.deck.unshift(moved[i]);
    }
    if (moved.length) {
      g.feedback(`Athéna : ${moved.length} carte(s) remise(s) dans le deck.`, 'supporter');
    } else {
      g.feedback('Athéna : rien à recycler ni à chercher.', 'warn');
    }
  }

  resolveCoinFlipSearchKnight(playerIndex, eff) {
    const g = this.game;
    const flips = eff.flips || 2;
    let heads = 0;
    let tails = 0;
    for (let i = 0; i < flips; i++) {
      const c = g.flipCoinWithUI('Chien de Police — recherche Chevalier', {
        flipIndex: i + 1,
        flipTotal: flips,
      });
      if (c === RULES.coin.heads) heads++;
      else tails++;
    }
    g.feedback(formatCoinFlipSummary(heads, tails), 'coin');
    if (heads === 0) {
      g.feedback('Chien de Police : aucune face.', 'coin');
      return;
    }
    const filter = { cardType: 'chevalier' };
    const resume =
      heads > 1
        ? {
            kind: 'searchDeckRepeat',
            playerIndex,
            filter,
            remaining: heads - 1,
            pickIndex: 1,
            pickTotal: heads,
          }
        : null;
    this.searchDeckFilteredToHand(playerIndex, filter, 1, resume);
  }

  continueSearchDeckRepeat(playerIndex, filter, remaining, meta = {}) {
    if (remaining <= 0) return;
    const pickIndex = meta.pickIndex ?? 2;
    const pickTotal = meta.pickTotal ?? remaining + 1;
    this.searchDeckFilteredToHand(playerIndex, filter, 1, {
      kind: 'searchDeckRepeat',
      playerIndex,
      filter,
      remaining: remaining - 1,
      pickIndex,
      pickTotal,
    });
  }

  startSearchDeckFromEffect(playerIndex, eff, sourceLabel) {
    this.searchDeckFilteredToHand(playerIndex, eff.filter, eff.count || 1);
  }

  resolveSearchComboHand(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const comboFilter =
      eff.filter ||
      ({
        or: [
          { cardType: 'supporter' },
          { cardType: 'objet' },
          { cardType: 'stade' },
        ],
      });
    const comboCount = eff.comboCount ?? 2;
    const energyCount = eff.drawEnergy ?? eff.energyCount ?? 1;
    const energyFilter = { cardType: 'energie' };
    const chainResume = {
      kind: 'searchComboHand',
      playerIndex,
      energyCount,
      energyFilter,
    };

    if (g.isAiControlled(playerIndex)) {
      for (let i = 0; i < comboCount; i++) {
        const searchable = player.deck.filter((c) => this.matchesDeckFilter(c.cardId, comboFilter));
        if (!searchable.length) break;
        const pick = searchable[Math.floor(Math.random() * searchable.length)];
        const idx = player.deck.findIndex((c) => c.instanceId === pick.instanceId);
        if (idx >= 0) {
          const [found] = player.deck.splice(idx, 1);
          player.hand.push(found);
        }
      }
      this.searchDeckFilteredToHand(playerIndex, energyFilter, energyCount);
      g.feedback('Kiki va chercher ! (IA)', 'attack');
      return;
    }

    const comboSearchable = player.deck.filter((c) => this.matchesDeckFilter(c.cardId, comboFilter));
    if (comboSearchable.length > 0 && comboCount > 0) {
      const actualCombo = Math.min(comboCount, comboSearchable.length);
      this.searchDeckFilteredToHand(playerIndex, comboFilter, actualCombo, chainResume);
      g.feedback('Kiki va chercher ! : Supporter, Objet ou Stade du deck.', 'attack');
      return;
    }

    this.searchDeckFilteredToHand(playerIndex, energyFilter, energyCount);
    if (!g.state.pending) {
      g.feedback('Kiki va chercher ! : aucune carte combo dans le deck.', 'info');
    }
  }

  resolveDrawUntilHandSizeTalent(playerIndex, knight, talent, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const targetSize = eff.size ?? 4;
    if (player.hand.length >= targetSize) {
      g.feedback(`Déjà ${player.hand.length} carte(s) en main.`, 'warn');
      return false;
    }
    if (!player.deck.length) {
      g.feedback('Deck vide : impossible de piocher.', 'warn');
      return false;
    }
    const before = player.hand.length;
    void (async () => {
      while (player.hand.length < targetSize && player.deck.length) {
        await g.draw(player, 1);
      }
      const drawn = player.hand.length - before;
      if (drawn > 0) {
        g.feedback(
          `${talent.name || 'Talent'} : pioche jusqu'à ${player.hand.length} carte(s) en main (+${drawn}).`,
          'talent',
        );
      }
      g.emit();
    })();
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    return true;
  }

  startRevealOpponentHandShuffle(attackerIndex, sourceLabel) {
    const g = this.game;
    const opp = g.state.players[1 - attackerIndex];
    if (!opp.hand.length) {
      g.feedback('Télépathie : la main adverse est vide.', 'info');
      return;
    }
    if (g.needsPlayerChoice(attackerIndex)) {
      g.state.pending = {
        type: 'revealOpponentHand',
        playerIndex: attackerIndex,
        opponentIndex: 1 - attackerIndex,
        options: opp.hand.map((c) => ({ ...c })),
        sourceLabel: sourceLabel || 'Télépathie',
      };
      g.feedback('Télépathie : choisissez une carte de la main adverse.', 'attack');
      g.emit();
      return;
    }
    const idx = Math.floor(Math.random() * opp.hand.length);
    g.resolveRevealOpponentHandShuffle(attackerIndex, opp.hand[idx].instanceId);
  }

  resolveRecoverEnergyFromDiscard(player, knight, talent) {
    const g = this.game;
    const searchEff = talent.effects?.find((e) => e.type === 'recover_energy_from_discard');
    if (!searchEff) return false;

    let energyIdx = -1;
    for (let i = player.discard.length - 1; i >= 0; i--) {
      if (getCardDef(player.discard[i].cardId)?.cardType === 'energie') {
        energyIdx = i;
        break;
      }
    }
    if (energyIdx < 0) {
      g.feedback('Vieux Maître : aucune Énergie en défausse.', 'warn');
      return false;
    }

    const benchTargets = player.bench.filter((k) => {
      if (!k) return false;
      const f = searchEff.attachFilter;
      return f ? this.matchesDeckFilter(k.cardId, f) : true;
    });
    if (!benchTargets.length) {
      g.feedback('Vieux Maître : aucun Bronze ou Argent sur le banc.', 'warn');
      return false;
    }

    if (g.needsPlayerChoice(player.index) && benchTargets.length > 1) {
      g.state.pending = {
        type: 'pickBenchForEnergyRecover',
        playerIndex: player.index,
        energyDiscardIdx: energyIdx,
        options: benchTargets.map((k) => ({
          target: player.bench.indexOf(k),
          instanceId: k.instanceId,
        })),
        fromTalent: { knightInstanceId: knight.instanceId },
      };
      g.feedback('Vieux Maître : choisissez un chevalier de banc Bronze/Argent.', 'talent');
      g.emit();
      return true;
    }

    const targetKnight = g.isAiControlled(player.index)
      ? benchTargets.reduce((best, k) => (k.currentHp < best.currentHp ? k : best), benchTargets[0])
      : benchTargets[0];
    return this.applyRecoverEnergyFromDiscard(player, knight, energyIdx, targetKnight);
  }

  applyRecoverEnergyFromDiscard(player, knight, energyDiscardIdx, targetKnight) {
    const g = this.game;
    const benchIdx = player.bench.indexOf(targetKnight);
    if (benchIdx < 0 || energyDiscardIdx < 0 || energyDiscardIdx >= player.discard.length) {
      return false;
    }
    const [energy] = player.discard.splice(energyDiscardIdx, 1);
    targetKnight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
    knight.talentUsed = true;
    g.feedback(
      `Vieux Maître : Énergie récupérée sur ${getCardDef(targetKnight.cardId).name}.`,
      'talent',
    );
    g.anim('attachEnergy', {
      cardId: energy.cardId,
      target: benchIdx,
      playerIndex: player.index,
      fromDeck: false,
    });
    g.emit();
    return true;
  }

  isAthenaOrDivineChildSupporter(cardId) {
    return ATHENA_OR_DIVINE_CHILD_CARD_IDS.includes(cardId);
  }

  isAiorosKnight(cardId) {
    return getCardDef(cardId)?.id === AIOROS_CARD_ID;
  }

  /** Protecteur d'Athéna — après Athéna / Enfant Divin ou entrée d'Aioros si déjà joué ce tour. */
  applyAiorosProtecteurIfEligible(playerIndex, { fromSupporter = false } = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (fromSupporter) player.playedAthenaOrDivineChildThisTurn = true;
    if (!player.playedAthenaOrDivineChildThisTurn) return;

    const knights = [player.active, ...player.bench].filter(Boolean);
    for (const knight of knights) {
      if (!this.isAiorosKnight(knight.cardId)) continue;
      const eff = getCardDef(knight.cardId)?.talent?.effects?.find(
        (e) => e.type === 'athena_or_divine_child_synergy',
      );
      if (!eff) continue;
      if (knight.modifiers.aiorosProtecteurAppliedThisTurn) continue;

      const healed = this.grantKnightHeal(knight, eff.heal || 0, { requireCanHeal: false });
      knight.modifiers.bonusAttackDamageThisTurn =
        (knight.modifiers.bonusAttackDamageThisTurn || 0) + (eff.bonusDamage || 0);
      knight.modifiers.aiorosProtecteurAppliedThisTurn = true;

      if (healed > 0) {
        const healTarget =
          knight === player.active
            ? 'active'
            : player.bench.findIndex((k) => k?.instanceId === knight.instanceId);
        g.feedback(`Protecteur d'Athéna : +${healed} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
        g.anim('heal', {
          amount: healed,
          cardId: knight.cardId,
          target: healTarget,
          playerIndex,
        });
      }
      g.feedback(
        `Protecteur d'Athéna : +${eff.bonusDamage || 0} dégâts aux attaques de ${getCardDef(knight.cardId).name} ce tour.`,
        'talent',
      );
    }
    g.emit();
  }

  async applyHealOnKnockout(killerPlayer, killerKnight) {
    const g = this.game;
    const def = getCardDef(killerKnight?.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'heal_on_ko_opponent_active');
    if (!eff || !killerKnight) return;
    if (eff.requiresActive && killerPlayer.active?.instanceId !== killerKnight.instanceId) return;
    if (!this.knightCanReceiveHeal(killerKnight, killerPlayer.index)) return;
    const healed = this.grantKnightHeal(killerKnight, eff.amount || 0, {
      healerPlayerIndex: killerPlayer.index,
      requireCanHeal: false,
    });
    if (healed > 0) {
      g.feedback(`${def.name} : +${healed} PV après le KO.`, 'heal');
      g.anim('heal', {
        amount: healed,
        cardId: killerKnight.cardId,
        target: 'active',
        playerIndex: killerPlayer.index,
      });
    }
    if (eff.draw) {
      await g.draw(killerPlayer, eff.draw);
      g.feedback(`Pioche de ${eff.draw} carte(s).`, 'turn');
    }
  }

  resolveRedistributeEnergy(playerIndex) {
    const g = this.game;
    const p = g.state.players[playerIndex];
    const hasEnergy =
      (p.active?.energies.length || 0) > 0 || p.bench.some((k) => k?.energies.length);
    if (!hasEnergy) {
      g.feedback('Poséidon : aucune Énergie à redistribuer.', 'warn');
      return;
    }
    g.state.pending = { type: 'moveEnergy', playerIndex, fromTarget: 'active', redistribute: true };
    g.feedback('Poséidon : déplacez une Énergie entre vos Chevaliers.', 'supporter');
    g.emit();
  }

  resolveAthenaExclamation(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const targets = [];
    if (player.active && getCardDef(player.active.cardId)?.rawType === 'chevalier-or') {
      targets.push(player.active);
    }
    let benchGold = 0;
    for (const k of player.bench) {
      if (
        k &&
        getCardDef(k.cardId)?.rawType === 'chevalier-or' &&
        benchGold < (eff.maxBenchGold || 2)
      ) {
        targets.push(k);
        benchGold++;
      }
    }
    for (const k of targets) {
      this.discardEnergyFromKnight(k, 1, player);
    }
    player.modifiers.athenaExclamationDamage = eff.endTurnDamage || 250;
    g.feedback(
      `Exclamation d'Athéna : ${targets.length} cible(s), ${eff.endTurnDamage || 250} dégâts en fin de tour (partiel).`,
      'supporter',
    );
  }

  resolveAttachFromDiscard(playerIndex, eff, toolDef) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const targetId = eff.targetCardId || 'seiya-de-pegase';
    const knight =
      player.active?.cardId === targetId
        ? player.active
        : player.bench.find((k) => k?.cardId === targetId) || null;
    if (!knight) {
      g.feedback(
        `Esprit d'Aioros : ${getCardDef(targetId)?.name || targetId} doit être en jeu.`,
        'warn',
      );
      return;
    }
    if (knight.attachedTool) {
      g.feedback('Ce chevalier a déjà un outil attaché.', 'warn');
      return;
    }
    knight.attachedTool = {
      cardId: toolDef.id,
      name: toolDef.name,
      instanceId: `tool-${toolDef.id}-${Date.now()}`,
    };
    this.applyToolMaxHpBonus(knight);
    g.feedback(`Esprit d'Aioros attaché à ${getCardDef(knight.cardId).name}.`, 'objet');
    g.emit();
  }

  applyAthenaExclamationEndTurn(playerIndex) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const dmg = player.modifiers.athenaExclamationDamage;
    if (!dmg) return;
    player.modifiers.athenaExclamationDamage = 0;
    const opp = g.state.players[1 - playerIndex];
    if (opp.active) {
      g.feedback(`Exclamation d'Athéna : ${dmg} dégâts sur l'actif adverse.`, 'damage');
      g.damageKnight(opp, opp.active, dmg, 'supporter');
    }
  }

  /** Fin de tour : talents passifs (Ilias, Albafica, etc.). */
  applyEndOfTurnKnightTalents(playerIndex) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    const fieldKnights = [];
    for (const pl of g.state.players) {
      if (pl.active) fieldKnights.push({ pl, knight: pl.active, isActive: true });
      pl.bench.forEach((k) => {
        if (k) fieldKnights.push({ pl, knight: k, isActive: false });
      });
    }

    let globalEndTurnDamageDone = false;
    for (const { pl, knight, isActive } of fieldKnights) {
      const def = getCardDef(knight.cardId);
      for (const eff of def?.talent?.effects || []) {
        if (eff.type === 'end_turn_damage_all_knights') {
          if (globalEndTurnDamageDone) continue;
          globalEndTurnDamageDone = true;
          const amount = eff.amount ?? 30;
          for (const pl2 of g.state.players) {
            if (pl2.active) {
              g.damageKnight(pl2, pl2.active, amount, 'talent', pl.index, knight.cardId);
            }
            for (const bk of pl2.bench) {
              if (bk) g.damageKnight(pl2, bk, amount, 'talent', pl.index, knight.cardId);
            }
          }
          g.feedback(`Maladie Mortelle : ${amount} dégâts sur chaque chevalier.`, 'damage');
          continue;
        }
        if (eff.type === 'bench_allies_damage_end_turn' && eff.whenOnBench && !isActive) {
          if (pl.index !== playerIndex) continue;
          const amount = eff.amount ?? 10;
          for (const bk of pl.bench) {
            if (!bk || bk.instanceId === knight.instanceId) continue;
            g.damageKnight(pl, bk, amount, 'talent', pl.index, knight.cardId);
          }
          continue;
        }
        if (eff.type === 'burn_opponent_active_end_turn') {
          if (eff.whenActive && !isActive) continue;
          if (eff.whenOnBench && isActive) continue;
          if (pl.index !== playerIndex) continue;
          if (!opp.active) continue;
          const amount = eff.amount ?? 10;
          if (eff.skipFirstTurn) {
            const became = knight.modifiers?.becameActiveTurnCount;
            if (became === (g.state.turnCount ?? 0)) continue;
          }
          const label = def.talent?.name || 'Talent';
          g.feedback(`${label} : ${amount} dégâts sur l'actif adverse.`, 'damage');
          g.damageKnight(opp, opp.active, amount, 'talent', playerIndex, knight.cardId);
        }
      }
    }
  }

  /** Talent : recherche deck */
  resolveTalentSearch(player, knight, talent, opts = {}) {
    const g = this.game;
    const searchEff = talent.effects?.find((e) => e.type === 'search_deck');
    if (!searchEff) return;

    const searchable = player.deck.filter((c) => this.matchesDeckFilter(c.cardId, searchEff.filter));
    if (searchable.length === 0) return;

    if (g.needsPlayerChoice(player.index)) {
      g.state.pending = {
        type: 'searchDeck',
        playerIndex: player.index,
        options: searchable.map((c) => ({ ...c })),
      };
      if (!opts.skipTalentUsed) knight.talentUsed = true;
      g.feedback(`${talent.name} : choisissez une carte du deck.`, 'talent');
      g.emit();
    } else {
      const pick = searchable[Math.floor(Math.random() * searchable.length)];
      const deckIdx = player.deck.findIndex((c) => c.instanceId === pick.instanceId);
      if (deckIdx >= 0) {
        const [found] = player.deck.splice(deckIdx, 1);
        player.hand.push(found);
      }
      if (!opts.skipTalentUsed) knight.talentUsed = true;
      g.feedback(`IA : ${talent.name}`, 'talent');
      g.emit();
    }
  }

  async applyOnEnterKnight(playerIndex, knight, def) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (this.isAiorosKnight(knight.cardId)) {
      this.applyAiorosProtecteurIfEligible(playerIndex);
    }
    for (const eff of def?.talent?.effects || []) {
      if (eff.type === 'on_play_damage') {
        this.damageOpponentAny(playerIndex, eff.damage || 30);
      }
      if (eff.type === 'on_play_damage_all_except_self') {
        this.damageAllExceptKnight(playerIndex, knight, eff.damage || 30);
      }
      if (eff.type === 'on_enter_heal_self') {
        const healed = this.grantKnightHeal(knight, eff.amount || 0, { requireCanHeal: false });
        if (healed > 0) {
          g.feedback(`+${healed} PV (${def.name}).`, 'heal');
          g.anim('heal', { amount: healed, cardId: knight.cardId, target: 'active', playerIndex });
        }
      }
      if (eff.type === 'on_enter_energy_discard_attach_allies') {
        this.attachEnergyFromDiscardToAllies(playerIndex, knight, eff.count || 3);
      }
      if (eff.type === 'on_play_draw') {
        await g.draw(player, eff.count || 1);
        g.feedback(`${def.name} : pioche de ${eff.count || 1} carte(s).`, 'turn');
      }
      if (eff.type === 'silence_opponent_active_talent') {
        const opp = g.state.players[1 - playerIndex];
        opp.modifiers.activeTalentSilencedTurns = eff.turns || 2;
        g.feedback(
          `${def.name} : talent de l'actif adverse annulé ${eff.turns || 2} tour(s).`,
          'status',
        );
      }
      if (eff.type === 'on_play_swap_with_active' && eff.whenOnBench) {
        const onBench = player.bench.some((k) => k?.instanceId === knight.instanceId);
        if (onBench && player.active && player.active.instanceId !== knight.instanceId) {
          if (!g.stadiumBlocksActiveSwap?.()) {
            g.swapActiveWithBenchKnight(playerIndex, knight.instanceId, def.name);
          }
        }
      }
      if (eff.type === 'on_play_bench_damage') {
        this.applyBenchDamage(playerIndex, {
          damage: eff.damage || 20,
          target: eff.target || 'opponent_bench_one',
        });
      }
    }
  }

  /** Kasa : copie une attaque adverse quand il devient actif (Julian ou Kanon requis). */
  onKnightBecameActive(playerIndex, knight) {
    const g = this.game;
    const def = getCardDef(knight?.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'copy_opponent_attack_on_active');
    if (!eff) return;
    if (this.isTalentSilenced(knight, playerIndex)) return;
    if (!playerHasJulianOrKanonDragonInPlay(g.state.players[playerIndex])) return;
    this.startCopyOpponentAttack(playerIndex, knight, eff);
  }

  applyCopiedAttackCostReduction(attack, eff) {
    const reduction = eff?.reduceCopiedAttackCost ?? 0;
    if (!reduction) return attack;
    return { ...attack, cost: Math.max(0, (attack.cost ?? 0) - reduction) };
  }

  startCopyOpponentAttack(playerIndex, knight, copyEff = {}) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    const attacks = [];
    for (const ok of [opp.active, ...(opp.bench || [])].filter(Boolean)) {
      const oDef = getCardDef(ok.cardId);
      for (const atk of oDef?.attacks || []) {
        if (/corps\s*à\s*corps/i.test(atk.name)) continue;
        attacks.push(
          this.applyCopiedAttackCostReduction(
            {
              ...atk,
              sourceKnightId: ok.cardId,
              sourceName: oDef.name,
              key: `opp-copy-${ok.cardId}-${atk.name}`,
            },
            copyEff,
          ),
        );
      }
    }
    if (!attacks.length) {
      g.feedback('Illusion Trompeuse : aucune attaque adverse à copier.', 'info');
      return;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'pickCopyOpponentAttack',
        playerIndex,
        attacks,
        knightInstanceId: knight.instanceId,
      };
      g.feedback('Illusion Trompeuse : choisissez une attaque adverse à copier.', 'talent');
      g.emit();
      return;
    }
    const pick = attacks[Math.floor(Math.random() * attacks.length)];
    knight.modifiers.copiedAttackThisTurn = {
      ...pick,
      key: pick.key || `copy-${pick.name}`,
    };
    g.feedback(`Illusion Trompeuse : « ${pick.name} » copiée ce tour.`, 'talent');
    g.emit();
  }

  applyCopiedOpponentAttack(playerIndex, knight, attack) {
    const g = this.game;
    knight.modifiers.copiedAttackThisTurn = {
      ...attack,
      key: attack.key || `copy-${attack.name}`,
    };
    g.feedback(`Illusion Trompeuse : « ${attack.name} » copiée ce tour.`, 'talent');
    g.emit();
    return true;
  }

  /** Julian KO → révéler Poséidon sans récompense. */
  async revealJulianToPoseidon(player, knight, options = {}) {
    const g = this.game;
    const under = knight.underCard;
    if (!under) return false;
    const isActive = player.active?.instanceId === knight.instanceId;
    const benchIdx = player.bench.findIndex((k) => k?.instanceId === knight.instanceId);
    const poseidonDef = getCardDef(under.cardId);
    if (!poseidonDef) return false;

    player.discard.push({ cardId: knight.cardId, instanceId: knight.cardInstanceId || knight.instanceId });
    knight.energies.forEach((e) => player.discard.push({ cardId: e.cardId, instanceId: e.instanceId }));

    const fk = g.buildFreshFieldKnight(under);

    g.anim('evolution', { cardId: under.cardId });
    g.feedback(
      'Julian Solo est battu — Poséidon, Dieu des Océans se révèle ! (KO sans Récompense)',
      'evolution',
    );
    g.emit();
    await g.pause(RULES.ui?.koFxMs ?? 1200);

    if (isActive) {
      player.active = fk;
      g.markKnightBecameActive(fk);
    } else if (benchIdx >= 0) {
      player.bench[benchIdx] = fk;
    }
    await g.triggerOnEnterKnight(player.index, fk);
    g.feedback(`${poseidonDef.name} entre en jeu sans dégâts ni état spécial.`, 'play');
    g.emit();
    return true;
  }

  listKanonMarinaTargets(player, { requireEnergy = false } = {}) {
    const out = [];
    const push = (knight, target) => {
      if (!knight || !isGeneralPoseidonKnight(getCardDef(knight.cardId))) return;
      if (requireEnergy && !(knight.energies?.length > 0)) return;
      out.push({ target, instanceId: knight.instanceId, knight });
    };
    push(player.active, 'active');
    player.bench.forEach((k, i) => push(k, i));
    return out;
  }

  getKanonMarinaAtTarget(player, target) {
    const knight = this.getKnightByTarget(player, target);
    if (!knight || !isGeneralPoseidonKnight(getCardDef(knight.cardId))) return null;
    return knight;
  }

  resolveKanonSubmarineSanctuary(playerIndex, knight, eff) {
    const g = this.game;
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Sanctuaire Sous-Marin déjà utilisé ce tour.', 'warn');
      return false;
    }
    if (this.isTalentSilenced(knight, playerIndex)) {
      g.feedback('Talent inactif (Julian Solo requis).', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'pickKanonSanctuary',
        playerIndex,
        knightInstanceId: knight.instanceId,
        oncePerTurn: !!eff.oncePerTurn,
      };
      g.feedback('Sanctuaire Sous-Marin : pioche, attacher ou déplacer une Énergie.', 'talent');
      g.emit();
      return true;
    }
    return this.applyKanonSanctuaryChoice(playerIndex, knight, 'draw', eff);
  }

  async applyKanonSanctuaryChoice(playerIndex, knight, choice, eff = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (choice === 'draw') {
      await g.draw(player, 1);
      g.feedback('Sanctuaire Sous-Marin : pioche 1 carte.', 'turn');
    } else if (choice === 'attach') {
      const energyIdx = player.hand.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
      if (energyIdx < 0) {
        g.feedback('Aucune Énergie en main.', 'warn');
        return false;
      }
      const marinas = this.listKanonMarinaTargets(player);
      if (!marinas.length) {
        g.feedback('Aucun Général Marina en jeu.', 'warn');
        return false;
      }
      return this.applyKanonSanctuaryAttach(playerIndex, knight, marinas[0].target, eff);
    } else if (choice === 'move') {
      const sources = this.listKanonMarinaTargets(player, { requireEnergy: true });
      const allMarinas = this.listKanonMarinaTargets(player);
      if (allMarinas.length < 2 || !sources.length) {
        g.feedback('Deux Généraux Marinas avec Énergie requis.', 'warn');
        return false;
      }
      const dests = allMarinas.filter((m) => m.target !== sources[0].target);
      if (!dests.length) {
        g.feedback('Aucune autre cible Marina.', 'warn');
        return false;
      }
      return this.applyKanonSanctuaryMove(
        playerIndex,
        knight,
        sources[0].target,
        dests[0].target,
        eff,
      );
    }
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.emit();
    return true;
  }

  applyKanonSanctuaryAttach(playerIndex, knight, target, eff = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const energyIdx = player.hand.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
    if (energyIdx < 0) {
      g.feedback('Aucune Énergie en main.', 'warn');
      return false;
    }
    const marinaKnight = this.getKanonMarinaAtTarget(player, target);
    if (!marinaKnight) {
      g.feedback('Cible Marina invalide.', 'warn');
      return false;
    }
    const [energy] = player.hand.splice(energyIdx, 1);
    marinaKnight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
    g.feedback(
      `Sanctuaire Sous-Marin : Énergie attachée à ${getCardDef(marinaKnight.cardId).name}.`,
      'energy',
    );
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.emit();
    return true;
  }

  applyKanonSanctuaryMove(playerIndex, knight, fromTarget, toTarget, eff = {}) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const fromKnight = this.getKanonMarinaAtTarget(player, fromTarget);
    const toKnight = this.getKanonMarinaAtTarget(player, toTarget);
    if (!fromKnight || !toKnight || fromKnight === toKnight || !fromKnight.energies?.length) {
      g.feedback('Déplacement d\'Énergie impossible.', 'warn');
      return false;
    }
    const e = fromKnight.energies.pop();
    toKnight.energies.push(e);
    g.feedback(
      `Sanctuaire Sous-Marin : Énergie déplacée vers ${getCardDef(toKnight.cardId).name}.`,
      'energy',
    );
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.emit();
    return true;
  }

  /** Io de Scylla — Projection Animale : 6 animaux, pas de répétition du dernier choisi. */
  static IO_ANIMALS = [
    { id: 'aigle', label: 'Aigle', bonusDamage: 50, selfDamage: 30 },
    { id: 'loup', label: 'Loup', bonusDamage: 30 },
    { id: 'abeille', label: 'Abeille', status: 'confused' },
    { id: 'serpent', label: 'Serpent', status: 'poisoned' },
    { id: 'ours', label: 'Ours', status: 'paralyzed' },
    { id: 'chauve-souris', label: 'Chauve-Souris', healSelf: 30 },
  ];

  listIoAnimalChoices(knight) {
    const last = knight?.lastIoAnimal;
    return EffectResolver.IO_ANIMALS.filter((a) => a.id !== last);
  }

  applyIoAnimalChoice(playerIndex, animalId, ctx) {
    const g = this.game;
    const animal = EffectResolver.IO_ANIMALS.find((a) => a.id === animalId);
    if (!animal) return false;
    if (animal.bonusDamage) ctx.ioBonusDamage = (ctx.ioBonusDamage || 0) + animal.bonusDamage;
    if (animal.selfDamage) ctx.ioSelfDamage = animal.selfDamage;
    if (animal.status) ctx.ioStatus = animal.status;
    if (animal.healSelf) ctx.ioHealSelf = animal.healSelf;
    g.feedback(`Projection Animale : ${animal.label}.`, 'attack');
    return true;
  }

  startIoProjectionAnimale(playerIndex, attackIndex, atk, ctx) {
    const g = this.game;
    const p = g.state.players[playerIndex];
    const active = p.active;
    const choices = this.listIoAnimalChoices(active);
    if (!choices.length) {
      g.feedback('Aucun animal disponible.', 'warn');
      return false;
    }
    if (g.isAiControlled(playerIndex)) {
      const pick = choices[Math.floor(Math.random() * choices.length)];
      this.applyIoAnimalChoice(playerIndex, pick.id, ctx);
      active.lastIoAnimal = pick.id;
      const def = getCardDef(active.cardId);
      return g._continueAttackAfterPrechecks(playerIndex, atk, def, ctx, 0);
    }
    g._attackContinuation = { playerIndex, attackIndex, ctx };
    g.state.pending = {
      type: 'pickIoAnimal',
      playerIndex,
      animals: choices.map((a) => ({ id: a.id, label: a.label })),
    };
    g.feedback('Projection Animale : choisissez un animal.', 'attack');
    g.emit();
    return true;
  }

  startIoBigTornadoStatus(playerIndex) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    if (!opp.active) return;
    const options = ['confused', 'poisoned'];
    if (g.isAiControlled(playerIndex)) {
      const status = options[Math.floor(Math.random() * options.length)];
      g.applyStatus(opp, opp.active, status);
      return;
    }
    g.state.pending = {
      type: 'pickIoBigTornadoStatus',
      playerIndex,
      options,
    };
    g.feedback('Big Tornado : Confus ou Empoisonné ?', 'attack');
    g.emit();
  }

  damageAllExceptKnight(playerIndex, sourceKnight, amount) {
    const g = this.game;
    for (const pl of g.state.players) {
      if (pl.active && pl.active.instanceId !== sourceKnight.instanceId) {
        g.damageKnight(pl, pl.active, amount, 'talent', playerIndex, sourceKnight.cardId);
      }
      for (const bk of pl.bench) {
        if (bk && bk.instanceId !== sourceKnight.instanceId) {
          g.damageKnight(pl, bk, amount, 'talent', playerIndex, sourceKnight.cardId);
        }
      }
    }
    g.feedback(`${amount} dégâts sur chaque autre chevalier en jeu.`, 'damage');
  }

  attachEnergyFromDiscardToAllies(playerIndex, sourceKnight, maxCount) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const targets = [];
    if (player.active && player.active.instanceId !== sourceKnight.instanceId) {
      targets.push(player.active);
    }
    for (const bk of player.bench) {
      if (bk && bk.instanceId !== sourceKnight.instanceId) targets.push(bk);
    }
    if (!targets.length) return;

    let attached = 0;
    for (let i = 0; i < maxCount; i++) {
      const energyIdx = player.discard.findIndex(
        (c) => getCardDef(c.cardId)?.cardType === 'energie',
      );
      if (energyIdx < 0) break;
      const target = targets[attached % targets.length];
      const [card] = player.discard.splice(energyIdx, 1);
      target.energies.push({ cardId: card.cardId, instanceId: card.instanceId });
      attached++;
    }
    if (attached > 0) {
      g.feedback(`${attached} Énergie(s) attachée(s) depuis la défausse.`, 'energy');
    }
  }

  _distributeDamageOptions(attackerIndex, benchOnly) {
    const opp = this.game.state.players[1 - attackerIndex];
    const options = [];
    if (!benchOnly && opp.active) {
      options.push({ target: 'active', instanceId: opp.active.instanceId });
    }
    opp.bench.forEach((k, i) => {
      if (k) options.push({ target: i, instanceId: k.instanceId });
    });
    return options;
  }

  _getDistributeDamageKnight(opp, opt) {
    return opt.target === 'active' ? opp.active : opp.bench[opt.target];
  }

  _autoDistributeDamage(playerIndex, totalDamage, options) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    const step = RULES.damageMarkerUnit || 10;
    const assigned = {};
    let remaining = totalDamage;
    while (remaining > 0) {
      const ranked = [...options].sort((a, b) => {
        const ka = this._getDistributeDamageKnight(opp, a);
        const kb = this._getDistributeDamageKnight(opp, b);
        return (ka?.currentHp ?? Infinity) - (kb?.currentHp ?? Infinity);
      });
      const amount = Math.min(step, remaining);
      const pick = ranked[0];
      assigned[pick.instanceId] = (assigned[pick.instanceId] || 0) + amount;
      remaining -= amount;
    }
    this._applyDistributeDamage(playerIndex, assigned, options, totalDamage);
  }

  _applyDistributeDamage(playerIndex, assigned, options, totalDamage) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    let hit = 0;
    for (const opt of options) {
      const dmg = assigned[opt.instanceId] || 0;
      if (dmg <= 0) continue;
      const knight = this._getDistributeDamageKnight(opp, opt);
      if (!knight) continue;
      g.damageKnight(opp, knight, dmg, 'attack', playerIndex, null);
      hit++;
    }
    if (hit > 0) {
      g.feedback(`${totalDamage} dégâts répartis sur ${hit} chevalier(s) adverse(s).`, 'damage');
    }
  }

  startDistributeDamage(playerIndex, totalDamage, { benchOnly = false } = {}) {
    const g = this.game;
    const options = this._distributeDamageOptions(playerIndex, benchOnly);
    if (!options.length) {
      g.feedback(
        benchOnly ? 'Aucun chevalier sur le banc adverse.' : 'Aucun chevalier adverse à cibler.',
        'info',
      );
      return;
    }
    if (options.length === 1 || g.isAiControlled(playerIndex)) {
      this._autoDistributeDamage(playerIndex, totalDamage, options);
      return;
    }
    g.state.pending = {
      type: 'distributeDamage',
      playerIndex,
      opponentIndex: 1 - playerIndex,
      totalDamage,
      remaining: totalDamage,
      assigned: {},
      options,
      benchOnly,
      step: RULES.damageMarkerUnit || 10,
    };
    g.feedback(
      `Répartissez ${totalDamage} dégâts entre les chevaliers adverses (+${RULES.damageMarkerUnit || 10} par clic).`,
      'damage',
    );
    g.emit();
  }

  resolveDistributeDamageAssign(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'distributeDamage' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const step = pending.step || RULES.damageMarkerUnit || 10;
    const amount = Math.min(step, pending.remaining ?? 0);
    if (amount <= 0) return false;
    pending.assigned = pending.assigned || {};
    pending.assigned[instanceId] = (pending.assigned[instanceId] || 0) + amount;
    pending.remaining = (pending.remaining ?? pending.totalDamage) - amount;
    if (pending.remaining <= 0) {
      this.finishDistributeDamage(playerIndex);
    } else {
      g.feedback(`Encore ${pending.remaining} dégâts à placer.`, 'damage');
      g.emit();
    }
    return true;
  }

  finishDistributeDamage(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'distributeDamage' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const { assigned, options, totalDamage } = pending;
    g.state.pending = null;
    this._applyDistributeDamage(playerIndex, assigned || {}, options || [], totalDamage || 0);
    g.emit();
    return true;
  }

  async replayOpponentLastAttack(attackerIndex, ctx) {
    const g = this.game;
    const opp = g.state.players[1 - attackerIndex];
    const lastName = opp.playedAttackLastTurn ?? opp.lastAttackName;
    if (!lastName) {
      g.feedback('Aucune attaque adverse à rejouer.', 'warn');
      return;
    }
    const oppDef = getCardDef(opp.active?.cardId);
    const replayAtk = oppDef?.attacks?.find((a) => a.name === lastName);
    if (!replayAtk) {
      g.feedback(`Attaque « ${lastName} » introuvable.`, 'warn');
      return;
    }
    if (
      oppDef?.knightType === 'Divinite' ||
      oppDef?.rawType === 'divinite' ||
      oppDef?.tags?.includes('Divinite')
    ) {
      g.feedback('Renvoi d\'attaque : impossible contre une Divinité.', 'warn');
      return;
    }
    const replayCtx = {
      ...ctx,
      opponentActive: g.state.players[attackerIndex].active,
      attackName: replayAtk.name,
    };
    const damage = this.computeAttackDamage(1 - attackerIndex, replayAtk, replayCtx);
    const victim = g.state.players[attackerIndex].active;
    if (victim && damage > 0) {
      g.damageKnight(
        g.state.players[attackerIndex],
        victim,
        damage,
        'attack',
        1 - attackerIndex,
        opp.active?.cardId,
      );
      g.feedback(`Renvoi d'attaque : ${replayAtk.name} (${damage} dégâts).`, 'attack');
    }
  }

  resolveAthenaSacrifice(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const minEnergy = eff.minEnergy ?? 2;
    if ((knight.energies?.length ?? 0) < minEnergy) {
      g.feedback(`Sacrifice : au moins ${minEnergy} Énergies requises.`, 'warn');
      return false;
    }
    while (knight.energies.length) {
      const e = knight.energies.pop();
      player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    }
    const opp = g.state.players[1 - playerIndex];
    if (opp.active) {
      g.damageKnight(opp, opp.active, eff.damage || 110, 'talent', playerIndex, knight.cardId);
    }
    const prizeCount = eff.opponentPrizes ?? 2;
    void g.takePrizes(opp, prizeCount);
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback('Sacrifice d\'Athéna : tour terminé, Récompenses pour l\'adversaire.', 'talent');
    g.state.forceEndTurnAfterTalent = true;
    g.emit();
    return true;
  }

  resolveBenchDamageTalent(playerIndex, knight, eff) {
    const g = this.game;
    const opp = g.state.players[1 - playerIndex];
    if (!opp.bench.length) {
      g.feedback('Aucun chevalier sur le banc adverse.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      const options = opp.bench.map((k, i) => ({ target: i, instanceId: k.instanceId }));
      g.state.pending = {
        type: 'pickDamageOpponentKnight',
        playerIndex,
        opponentIndex: 1 - playerIndex,
        amount: eff.damage || 20,
        benchOnly: true,
        options,
        fromTalent: { playerIndex, knightInstanceId: knight.instanceId },
        sourceLabel: 'Mort (Thanatos)',
      };
      if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
      g.feedback('Mort : choisissez un chevalier de banc adverse.', 'talent');
      g.emit();
      return true;
    }
    const options = opp.bench.map((k, i) => ({ target: i, instanceId: k.instanceId }));
    const pick = g._aiPickDamageOpponentKnightOption?.(playerIndex, options, eff.damage || 20);
    const targetIdx = pick?.target ?? Math.floor(Math.random() * opp.bench.length);
    g.damageKnight(opp, opp.bench[targetIdx], eff.damage || 20, 'talent', playerIndex, knight.cardId);
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback('Mort : dégâts sur le banc adverse.', 'talent');
    g.emit();
    return true;
  }

  resolveHypnosSleepTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!(knight.energies?.length > 0)) {
      g.feedback('Sommeil : défaussez une Énergie attachée.', 'warn');
      return false;
    }
    const e = knight.energies.pop();
    player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    const opp = g.state.players[1 - playerIndex];
    if (opp.active) {
      g.applyStatus(opp, opp.active, 'confused');
    }
    player.modifiers.hypnosTalentUsedThisTurn = true;
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback('Sommeil : actif adverse Confus (Somnolence désactivée ce tour).', 'talent');
    g.emit();
    return true;
  }

  resolveDiscardEnergyPoisonOpponentTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!(knight.energies?.length > 0)) {
      g.feedback('Empoisonneur : défaussez une Énergie attachée.', 'warn');
      return false;
    }
    const e = knight.energies.pop();
    player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    const opp = g.state.players[1 - playerIndex];
    if (opp.active) {
      g.applyStatus(opp, opp.active, 'poisoned');
    }
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback('Empoisonneur : actif adverse empoisonné.', 'talent');
    g.emit();
    return true;
  }

  applyTurnStartTalents(playerIndex) {
    const g = this.game;
    this.applyPendingHealNextTurn(playerIndex);
    const player = g.state.players[playerIndex];
    const knights = [player.active, ...player.bench].filter(Boolean);
    for (const knight of knights) {
      const def = getCardDef(knight.cardId);
      for (const eff of def?.talent?.effects || []) {
        if (eff.type === 'turn_start_thaw_recover_energy') {
          const had = knight.statuses.filter((s) => s === 'frozen' || s === 'paralyzed');
          if (!had.length) continue;
          knight.statuses = knight.statuses.filter((s) => s !== 'frozen' && s !== 'paralyzed');
          const energy = player.discard.find((c) => getCardDef(c.cardId)?.cardType === 'energie');
          if (energy) {
            const idx = player.discard.findIndex((c) => c.instanceId === energy.instanceId);
            if (idx >= 0) {
              const [card] = player.discard.splice(idx, 1);
              knight.energies.push({ cardId: card.cardId, instanceId: card.instanceId });
              g.feedback(`${def.name} : énergie récupérée de la défausse.`, 'talent');
            }
          } else {
            g.feedback(`${def.name} : état retiré (aucune énergie en défausse).`, 'talent');
          }
          continue;
        }
        if (eff.type === 'turn_start_recover_discard') {
          this.recoverFromDiscard(playerIndex, eff);
        }
        if (eff.type === 'turn_start_manigoldo') {
          this.applyManigoldoTurnStart(playerIndex, knight, eff);
        }
      }
      if (def?.talent?.effects?.some((e) => e.type === 'attach_energy_if_opponent_played_supporter')) {
        if (player.opponentPlayedSupporterLastTurn) {
          const energyInHand = player.hand.find((c) => getCardDef(c.cardId)?.cardType === 'energie');
          if (energyInHand && player.bench.length) {
            const handIdx = player.hand.findIndex((c) => c.instanceId === energyInHand.instanceId);
            const benchIdx = 0;
            const [card] = player.hand.splice(handIdx, 1);
            player.bench[benchIdx].energies.push({
              cardId: card.cardId,
              instanceId: card.instanceId,
            });
            g.feedback(`${def.name} : énergie placée sur le banc.`, 'talent');
          }
        }
      }
    }
  }

  damageOpponentAny(attackerIndex, amount, ctx = {}) {
    const g = this.game;
    const opp = g.state.players[1 - attackerIndex];
    const targets = [];
    if (opp.active) {
      targets.push({ player: opp, knight: opp.active, target: 'active' });
    }
    opp.bench.forEach((k, i) => {
      if (k) targets.push({ player: opp, knight: k, target: i });
    });
    if (!targets.length) return;

    if (targets.length === 1) {
      g.damageKnight(targets[0].player, targets[0].knight, amount, 'attack', attackerIndex, null);
      return;
    }

    if (g.isAiControlled(attackerIndex)) {
      const pick = targets.reduce(
        (best, t) => (t.knight.currentHp < best.knight.currentHp ? t : best),
        targets[0],
      );
      g.damageKnight(pick.player, pick.knight, amount, 'attack', attackerIndex, null);
      return;
    }

    g.state.pending = {
      type: 'pickDamageOpponentKnight',
      playerIndex: attackerIndex,
      opponentIndex: 1 - attackerIndex,
      amount,
      options: targets.map((t) => ({ target: t.target, instanceId: t.knight.instanceId })),
      sourceLabel: ctx.attackName,
    };
    g.feedback('Choisissez un chevalier adverse (actif ou banc).', 'attack');
    g.emit();
  }

  healAllFriendly(playerIndex, amount) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const knights = [player.active, ...player.bench].filter(Boolean);
    for (const knight of knights) {
      const healed = this.grantKnightHeal(knight, amount, { requireCanHeal: false });
      if (healed > 0) {
        g.feedback(`+${healed} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
      }
    }
  }

  recoverEnergyDiscardAttach(playerIndex, knight, player) {
    const g = this.game;
    if (!knight) return;
    const candidates = player.discard.filter((c) => getCardDef(c.cardId)?.cardType === 'energie');
    if (!candidates.length) {
      g.feedback('Aucune énergie en défausse.', 'warn');
      return;
    }
    const pick = candidates[0];
    const idx = player.discard.findIndex((c) => c.instanceId === pick.instanceId);
    if (idx >= 0) {
      const [card] = player.discard.splice(idx, 1);
      knight.energies.push({ cardId: card.cardId, instanceId: card.instanceId });
      g.feedback('Énergie attachée depuis la défausse.', 'energy');
    }
  }

  matchesDeckFilter(cardId, filter) {
    const def = getCardDef(cardId);
    if (!def || !filter) return false;
    if (filter.or) return filter.or.some((f) => this.matchesDeckFilter(cardId, f));
    if (filter.cardIds?.length) return filter.cardIds.includes(def.id);
    if (filter.cardId) return def.id === filter.cardId;

    const hasCriterion =
      filter.type ||
      filter.cardType ||
      filter.cardIds?.length ||
      filter.nameContains ||
      filter.bronzeBase ||
      filter.bronzeMain ||
      filter.bronzeMajeurBase === true ||
      filter.tournoiGalactique === true ||
      filter.bronzeMineur === true ||
      filter.stage ||
      filter.knightType ||
      filter.cardSubType;
    if (!hasCriterion) return false;

    if (filter.type && def.rawType !== filter.type) return false;
    if (filter.cardType && def.cardType !== filter.cardType) return false;
    if (filter.nameContains && !def.name.includes(filter.nameContains)) return false;
    if (filter.bronzeBase && !isBronzeBase(def)) return false;
    if (filter.bronzeMain && !isBronzeMajeur(def)) return false;
    if (filter.bronzeMajeurBase === true && !isBronzeMajeurBase(def)) return false;
    if (filter.tournoiGalactique === true && !isTournoiGalactiqueKnight(def)) return false;
    if (filter.bronzeMineur === true && !isBronzeMineur(def)) return false;
    if (filter.stage && def.stage !== filter.stage) return false;
    if (filter.knightType && def.knightType !== filter.knightType) return false;
    if (filter.cardSubType && def.knightType !== filter.cardSubType) return false;
    if (filter.tag && !knightHasTag(def, filter.tag)) return false;
    return true;
  }

  getBonusPrizeWhenKnockedOut(victimDef) {
    const eff = victimDef?.talent?.effects?.find((e) => e.type === 'bonus_prize_when_knocked_out');
    return eff?.amount ?? 0;
  }

  getZelosCowardPrizeAdjustments(victimPlayer, victimKnight, killerPlayer, wasActive) {
    let bonus = 0;
    let reduce = 0;
    const victimDef = getCardDef(victimKnight?.cardId);
    const victimZelos = victimDef?.talent?.effects?.find(
      (e) => e.type === 'zelos_coward_prize_modifiers',
    );
    if (victimZelos?.reducePrizeWhenKnockedOut) {
      reduce += victimZelos.reducePrizeWhenKnockedOut;
    }
    if (wasActive) {
      const killerActive = killerPlayer?.active;
      const killerDef = getCardDef(killerActive?.cardId);
      const killerZelos = killerDef?.talent?.effects?.find(
        (e) => e.type === 'zelos_coward_prize_modifiers',
      );
      if (
        killerZelos?.bonusPrizeWhenActiveKoWhileSelfActive &&
        !this.isTalentSilenced(killerActive, killerPlayer?.index)
      ) {
        bonus += killerZelos.bonusPrizeWhenActiveKoWhileSelfActive;
      }
    }
    return { bonus, reduce };
  }

  applyPendingHealNextTurn(playerIndex) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const pending = player.modifiers?.pendingHealNextTurn;
    if (!pending || pending.ownerPlayerIndex !== playerIndex) return;
    player.modifiers.pendingHealNextTurn = null;
    const allies = [player.active, ...player.bench].filter(Boolean);
    if (!allies.length) return;
    if (g.needsPlayerChoice(playerIndex) && allies.length > 1) {
      g.state.pending = {
        type: 'pickHealAllyNextTurn',
        playerIndex,
        amount: pending.amount || 30,
        options: allies.map((k, i) => ({
          target: player.active?.instanceId === k.instanceId ? 'active' : i,
          instanceId: k.instanceId,
        })),
      };
      g.feedback(`Nuée de Fairy : choisissez un chevalier à soigner (+${pending.amount || 30} PV).`, 'heal');
      g.emit();
      return;
    }
    const pick =
      g.isAiControlled(playerIndex)
        ? allies.reduce((best, k) => (k.currentHp < best.currentHp ? k : best), allies[0])
        : allies[0];
    const healed = this.grantKnightHeal(pick, pending.amount || 30, { requireCanHeal: false });
    if (healed > 0) {
      g.feedback(`Nuée de Fairy : +${healed} PV sur ${getCardDef(pick.cardId).name}.`, 'heal');
    }
  }

  applyFlipPrizesOnKoActive(koBy, victimPlayer, victimKnight, wasActive) {
    if (!wasActive) return;
    const g = this.game;
    const killer = g.state.players[koBy];

    const flipFor = (player, count, label) => {
      let flipped = 0;
      for (const prize of player.prizes) {
        if (flipped >= count) break;
        if (!prize.faceUp) {
          prize.faceUp = true;
          flipped++;
        }
      }
      if (flipped > 0) {
        g.feedback(`${label} : ${flipped} Récompense(s) face visible.`, 'prize');
      }
    };

    const hasFlipTalent = (knights, whenKey) =>
      knights.filter(Boolean).some((k) => {
        const def = getCardDef(k.cardId);
        return def?.talent?.effects?.some(
          (e) => e.type === 'flip_prizes_on_ko_active' && e[whenKey],
        );
      });

    const killerKnights = [killer.active, ...killer.bench];
    if (hasFlipTalent(killerKnights, 'whenAttackerKOs') && victimPlayer.index !== koBy) {
      const eff =
        getCardDef(
          killerKnights.find((k) =>
            getCardDef(k?.cardId)?.talent?.effects?.some(
              (e) => e.type === 'flip_prizes_on_ko_active' && e.whenAttackerKOs,
            ),
          )?.cardId,
        )?.talent?.effects?.find((e) => e.type === 'flip_prizes_on_ko_active') || {};
      flipFor(killer, eff.count || 2, getCardDef(killer.active?.cardId)?.name || 'Zelos');
    }

    const victimKnights = [victimPlayer.active, ...victimPlayer.bench];
    if (hasFlipTalent(victimKnights, 'whenVictimKOs')) {
      const zelosKnight = victimKnights.find((k) =>
        getCardDef(k?.cardId)?.talent?.effects?.some(
          (e) => e.type === 'flip_prizes_on_ko_active' && e.whenVictimKOs,
        ),
      );
      const eff =
        getCardDef(zelosKnight?.cardId)?.talent?.effects?.find(
          (e) => e.type === 'flip_prizes_on_ko_active',
        ) || {};
      flipFor(killer, eff.count || 2, getCardDef(zelosKnight?.cardId)?.name || 'Zelos');
    }
  }

  resolveTransferEnergyToHadesBench(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Serviteur d\'Hadès déjà utilisé ce tour.', 'warn');
      return false;
    }
    const hadesIds = eff.hadesCardIds || ['hades-corps-humain', 'hades-vrai-corps'];
    const hadesTargets = player.bench.filter((k) => {
      if (!k) return false;
      const id = getCardDef(k.cardId)?.id || k.cardId;
      return hadesIds.includes(id);
    });
    if (!hadesTargets.length) {
      g.feedback('Aucun Hadès sur le banc.', 'warn');
      return false;
    }
    const sources = [player.active, ...player.bench].filter(
      (k) => k && (k.energies?.length ?? 0) > 0,
    );
    const filteredSources = eff.sourceSelfOnly
      ? sources.filter((k) => k.instanceId === knight.instanceId)
      : sources;
    if (!filteredSources.length) {
      g.feedback(
        eff.sourceSelfOnly ? 'Pharaon : aucune Énergie sur ce chevalier.' : 'Aucune Énergie à transférer.',
        'warn',
      );
      return false;
    }
    g.state.pending = {
      type: 'transferEnergyToHades',
      playerIndex,
      knightInstanceId: knight.instanceId,
      hadesIds,
    };
    g.feedback('Pharaon : choisissez la source puis Hadès (banc).', 'talent');
    g.emit();
    return true;
  }

  resolveSwapActiveWithBenchTag(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Passeur des âmes déjà utilisé ce tour.', 'warn');
      return false;
    }
    if (eff.fromBenchOnly && player.active?.instanceId === knight.instanceId) {
      g.feedback('Passeur : utilisable seulement depuis le banc.', 'warn');
      return false;
    }
    if (!player.active) {
      g.feedback('Aucun chevalier actif.', 'warn');
      return false;
    }
    const tags = eff.tags || ['spectre', 'juge'];
    const candidates = player.bench
      .map((k, i) => ({ knight: k, target: i }))
      .filter(({ knight: k }) => k && tags.some((t) => knightHasTag(getCardDef(k.cardId), t)));
    if (!candidates.length) {
      g.feedback('Aucun Spectre ou Juge sur le banc.', 'warn');
      return false;
    }
    if (g.stadiumBlocksActiveSwap?.()) {
      g.feedback('Sanctuaire : échange impossible.', 'stadium');
      return false;
    }
    if (candidates.length === 1) {
      g.swapActiveWithBenchIndex(playerIndex, candidates[0].target);
      knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
      return true;
    }
    g.state.pending = {
      type: 'charonSwapBench',
      playerIndex,
      knightInstanceId: knight.instanceId,
      options: candidates.map(({ target, knight: k }) => ({
        target,
        instanceId: k.instanceId,
      })),
    };
    g.feedback('Charon : choisissez un Spectre ou Juge sur le banc.', 'talent');
    g.emit();
    return true;
  }

  startSacrificeBenchForAttack(playerIndex, attack, attackIndex) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const eff = (attack.effects || []).find((e) => e.type === 'requires_sacrifice_bench');
    if (!eff) return false;
    const candidates = player.bench
      .map((k, i) => ({ knight: k, target: i }))
      .filter(({ knight: k }) => k && this.matchesSacrificeFilter(k.cardId, eff));
    if (!candidates.length) {
      g.feedback('Sacrifice requis : aucun Spectre, Juge ou Or sur le banc.', 'warn');
      return false;
    }
    g.state.pending = {
      type: 'sacrificeBenchForAttack',
      playerIndex,
      attackIndex,
      effect: eff,
      options: candidates.map(({ target, knight: k }) => ({
        target,
        instanceId: k.instanceId,
      })),
    };
    g.feedback('Condamnation Galactique : sacrificez un chevalier du banc.', 'attack');
    g.emit();
    return true;
  }

  applyMinHpThreshold(knight, def) {
    const talent = def?.talent;
    const eff = talent?.effects?.find((e) => e.type === 'min_hp_threshold');
    if (!eff || !knight) return;
    if (knight.currentHp > 0 && knight.currentHp < eff.threshold) {
      knight.currentHp = eff.set_hp_to;
      this.game.feedback(`${def.name} : Ph?nix immortel ! PV maintenus ? ${eff.set_hp_to}.`, 'talent');
    }
  }

  applySunreiProtection(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const active = player.active;
    if (!active) {
      g.feedback('Sunrei : aucun Chevalier actif.', 'warn');
      return;
    }
    const opponentIndex = 1 - playerIndex;
    player.modifiers.sunreiProtection = {
      knightInstanceId: active.instanceId,
      expiresAfterTurnEndPlayerIndex: opponentIndex,
      healOnKO: eff.healOnKO ?? 10,
      removeStatus: eff.removeStatus !== false,
      preventKO: eff.preventKO !== false,
      preventPrizeCard: eff.preventPrizeCard !== false,
    };
    g.feedback(
      'Sunrei : protection jusqu\'à la fin du tour adverse (10 PV si KO évité).',
      'supporter',
    );
  }

  clearSunreiKnightEffects(knight) {
    if (!knight) return;
    knight.statuses = [];
    const m = knight.modifiers || {};
    knight.modifiers = {
      talentOnceThisTurn: m.talentOnceThisTurn,
      aiorosProtecteurAppliedThisTurn: m.aiorosProtecteurAppliedThisTurn,
      bonusAttackDamageThisTurn: m.bonusAttackDamageThisTurn,
      meleeBonusThisTurn: m.meleeBonusThisTurn,
    };
  }

  isSunreiProtectionActive(player, knight) {
    const prot = player?.modifiers?.sunreiProtection;
    if (!prot || !knight || !player.active) return false;
    if (player.active.instanceId !== knight.instanceId) return false;
    return prot.knightInstanceId === knight.instanceId;
  }

  isSunreiPendingRevive(player, knight) {
    const prot = player?.modifiers?.sunreiProtection;
    if (!prot?.pendingRevive || !knight) return false;
    return prot.knightInstanceId === knight.instanceId;
  }

  /** KO différé : marque la résurrection Sunrei pour la fin du tour adverse. */
  markSunreiPendingRevive(player, knight) {
    const g = this.game;
    if (!this.isSunreiProtectionActive(player, knight)) return false;
    const prot = player.modifiers.sunreiProtection;
    if (!prot.preventKO) return false;

    if (!prot.pendingRevive) {
      prot.pendingRevive = true;
      g.cancelPendingKnockOutForInstance?.(knight.instanceId);
      g.feedback(
        `Sunrei : ${getCardDef(knight.cardId).name} sera ressuscité en fin de tour.`,
        'supporter',
      );
      g.emit();
    }
    return true;
  }

  /** Résout les résurrections Sunrei en fin de tour (après le Checkup poison). */
  resolveSunreiEndOfTurnRevivals(endingPlayerIndex) {
    for (const player of this.game.state.players) {
      const prot = player.modifiers.sunreiProtection;
      if (!prot?.pendingRevive) continue;
      if (prot.expiresAfterTurnEndPlayerIndex !== endingPlayerIndex) continue;
      const knight = player.active;
      if (!knight || knight.instanceId !== prot.knightInstanceId) continue;
      this.trySunreiSurvival(player, knight);
    }
  }

  trySunreiSurvival(player, knight) {
    const g = this.game;
    if (!this.isSunreiProtectionActive(player, knight)) return false;
    const prot = player.modifiers.sunreiProtection;
    if (!prot.preventKO) return false;

    const healTo = prot.healOnKO ?? 10;
    knight.currentHp = healTo;
    if (prot.removeStatus) {
      this.clearSunreiKnightEffects(knight);
      g.feedback('Sunrei : effets spéciaux retirés.', 'status');
    }
    g.cancelPendingKnockOutForInstance?.(knight.instanceId);
    g.feedback(
      `Sunrei : ${getCardDef(knight.cardId).name} revient à ${healTo} PV (pas de KO ni de Récompense).`,
      'supporter',
    );
    g.anim('heal', {
      amount: healTo,
      cardId: knight.cardId,
      target: 'active',
      playerIndex: player.index,
    });
    player.modifiers.sunreiProtection = null;
    g.emit();
    return true;
  }

  isChevalierNoirCard(cardId) {
    return getCardDef(cardId)?.rawType === 'chevalier-noir';
  }

  isAccelerationAttachTarget(cardId) {
    if (this.isChevalierNoirCard(cardId)) return true;
    const def = getCardDef(cardId);
    return def?.id === 'ikki-phenix-mechant';
  }

  collectAccelerationDiscardCandidates(player, eff) {
    const sources = eff.source || ['main', 'banc'];
    const candidates = [];
    if (sources.includes('main')) {
      player.hand.forEach((c, i) => {
        if (this.isChevalierNoirCard(c.cardId)) {
          candidates.push({ zone: 'hand', index: i, instanceId: c.instanceId, cardId: c.cardId });
        }
      });
    }
    if (sources.includes('banc')) {
      player.bench.forEach((k, i) => {
        if (k && this.isChevalierNoirCard(k.cardId)) {
          candidates.push({ zone: 'bench', index: i, instanceId: k.instanceId, cardId: k.cardId });
        }
      });
    }
    return candidates;
  }

  collectAccelerationAttachTargets(player) {
    const targets = [];
    if (player.active && this.isAccelerationAttachTarget(player.active.cardId)) {
      targets.push({ target: 'active', knight: player.active });
    }
    player.bench.forEach((k, i) => {
      if (k && this.isAccelerationAttachTarget(k.cardId)) {
        targets.push({ target: i, knight: k });
      }
    });
    return targets;
  }

  discardBenchKnightVoluntary(player, benchIndex) {
    const g = this.game;
    const knight = player.bench[benchIndex];
    if (!knight) return false;
    this.discardKnightToPile(player, knight);
    player.bench.splice(benchIndex, 1);
    g.feedback(`${getCardDef(knight.cardId).name} défaussé.`, 'supporter');
    return true;
  }

  discardActiveKnightVoluntary(player) {
    const g = this.game;
    const knight = player.active;
    if (!knight) return false;
    this.discardKnightToPile(player, knight);
    player.active = null;
    g.feedback(`${getCardDef(knight.cardId).name} défaussé.`, 'supporter');
    return true;
  }

  discardKnightToPile(player, knight) {
    const g = this.game;
    player.discard.push({ cardId: knight.cardId, instanceId: knight.cardInstanceId });
    g.discardKnightTool(player, knight);
    knight.energies.forEach((e) =>
      player.discard.push({ cardId: e.cardId, instanceId: e.instanceId }),
    );
  }

  startLookTopPickOne(playerIndex, eff, objetDef) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const count = Math.min(eff.count || 6, player.deck.length);
    if (count <= 0) {
      g.feedback('Deck vide.', 'warn');
      return;
    }
    const peeked = [];
    for (let i = 0; i < count; i++) peeked.push(player.deck.pop());
    peeked.reverse();

    if (g.isAiControlled(playerIndex)) {
      const pick = peeked[0];
      player.hand.push(pick);
      for (const card of peeked.slice(1)) player.discard.push(card);
      g.feedback(
        `${objetDef?.name || 'Pandore'} : ${getCardDef(pick.cardId).name} en main, le reste en défausse.`,
        'supporter',
      );
      g.emit();
      return;
    }

    g.state.pending = {
      type: 'lookTopPickOne',
      playerIndex,
      cards: peeked.map((c) => ({ ...c })),
      sourceLabel: objetDef?.name || 'Pandore',
      resume: {
        kind: 'objetEffects',
        playerIndex,
        cardId: objetDef?.id,
        target: null,
        nextIndex: (objetDef?.effects || []).findIndex((e) => e.type === 'look_top_pick_one') + 1,
      },
    };
    g.feedback(
      `${objetDef?.name || 'Pandore'} : choisissez 1 carte à garder (${peeked.length} vues).`,
      'supporter',
    );
    g.emit();
  }

  resolveLookTopPickOne(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'lookTopPickOne' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const cards = pending.cards || [];
    const pick = cards.find((c) => c.instanceId === instanceId);
    if (!pick) return false;
    player.hand.push(pick);
    g.anim('drawReveal', { cardId: pick.cardId, playerIndex });
    let discarded = 0;
    for (const card of cards) {
      if (card.instanceId === instanceId) continue;
      player.discard.push(card);
      discarded++;
    }
    const resume = pending.resume;
    g.state.pending = null;
    g.feedback(
      `${getCardDef(pick.cardId).name} en main, ${discarded} carte(s) en défausse.`,
      'supporter',
    );
    g.emit();
    if (resume?.kind === 'objetEffects') {
      const def = getCardDef(resume.cardId);
      if (def) {
        void g.effects.resolveObjetEffects(resume.playerIndex, def, resume.target, resume.nextIndex);
      }
    }
    return true;
  }

  listVoluntarySacrificeOptions(playerIndex) {
    const player = this.game.state.players[playerIndex];
    const options = [];
    if (player.active) {
      const def = getCardDef(player.active.cardId);
      if (!isForbiddenSacrificeTarget(def)) {
        options.push({ zone: 'active', instanceId: player.active.instanceId });
      }
    }
    player.bench.forEach((k, i) => {
      if (!k) return;
      const def = getCardDef(k.cardId);
      if (!isForbiddenSacrificeTarget(def)) {
        options.push({ zone: i, instanceId: k.instanceId });
      }
    });
    return options;
  }

  startVoluntarySacrificeKnight(playerIndex, objetDef) {
    const g = this.game;
    const options = this.listVoluntarySacrificeOptions(playerIndex);
    if (!options.length) {
      g.feedback(
        'Sacrifice : aucun chevalier éligible (Divinités et Chevaliers divins exclus).',
        'warn',
      );
      return;
    }

    if (g.isAiControlled(playerIndex)) {
      const pick = options.find((o) => o.zone === 'active') || options[0];
      this.resolveVoluntarySacrificeKnight(playerIndex, pick.instanceId);
      return;
    }

    g.state.pending = {
      type: 'voluntarySacrificePick',
      playerIndex,
      options,
      sourceLabel: objetDef?.name || 'Sacrifice',
    };
    g.feedback('Sacrifice : choisissez un chevalier actif ou de banc à défausser.', 'supporter');
    g.emit();
  }

  resolveVoluntarySacrificeKnight(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      pending?.type === 'voluntarySacrificePick' &&
      pending.playerIndex === playerIndex
    ) {
      g.state.pending = null;
    }
    const player = g.state.players[playerIndex];
    const knight =
      player.active?.instanceId === instanceId
        ? player.active
        : player.bench.find((k) => k?.instanceId === instanceId);
    if (!knight) return false;
    if (isForbiddenSacrificeTarget(getCardDef(knight.cardId))) {
      g.feedback(
        'Sacrifice : les Divinités et Chevaliers divins ne peuvent pas être sacrifiés.',
        'warn',
      );
      return false;
    }

    let wasActive = false;
    if (player.active?.instanceId === instanceId) {
      wasActive = true;
      this.discardActiveKnightVoluntary(player);
      player.modifiers.opponentActiveKoPrizeReduce =
        (player.modifiers.opponentActiveKoPrizeReduce || 0) + 1;
      g.feedback(
        'Sacrifice : au prochain KO de votre actif, l\'adversaire prend 1 Récompense de moins.',
        'prize',
      );
    } else {
      const benchIdx = player.bench.findIndex((k) => k?.instanceId === instanceId);
      if (benchIdx < 0) return false;
      this.discardBenchKnightVoluntary(player, benchIdx);
      g.feedback('Sacrifice : chevalier de banc défaussé (sans Récompense).', 'supporter');
    }

    if (wasActive && player.bench.length > 0) {
      g.state.pending = {
        type: 'promoteActive',
        playerIndex,
        fromVoluntarySacrifice: true,
      };
      g.feedback('Sacrifice : choisissez un nouveau chevalier actif.', 'supporter');
    } else if (wasActive && !player.bench.length) {
      if (g.tryWinByNoFieldChevaliers?.(playerIndex)) {
        g.emit();
        return true;
      }
    }
    g.emit();
    return true;
  }

  listKnightsInPlay() {
    const g = this.game;
    const options = [];
    for (const pl of g.state.players) {
      if (pl.active) {
        options.push({
          playerIndex: pl.index,
          target: 'active',
          instanceId: pl.active.instanceId,
          knight: pl.active,
        });
      }
      pl.bench.forEach((k, i) => {
        if (k) {
          options.push({
            playerIndex: pl.index,
            target: i,
            instanceId: k.instanceId,
            knight: k,
          });
        }
      });
    }
    return options;
  }

  findKnightInPlayByInstanceId(instanceId) {
    if (!instanceId) return null;
    for (const pl of this.game.state.players) {
      if (pl.active?.instanceId === instanceId) {
        return { player: pl, knight: pl.active, target: 'active' };
      }
      const benchIdx = pl.bench.findIndex((k) => k?.instanceId === instanceId);
      if (benchIdx >= 0) {
        return { player: pl, knight: pl.bench[benchIdx], target: benchIdx };
      }
    }
    return null;
  }

  startDonDeVie(playerIndex, objetDef, eff) {
    const g = this.game;
    const options = this.listKnightsInPlay();
    if (!options.length) {
      g.feedback('Don de Vie : aucun chevalier en jeu.', 'warn');
      return;
    }
    const maxDamage = eff.maxDamage ?? 40;

    if (g.isAiControlled(playerIndex)) {
      const damagePick = options.reduce(
        (best, o) => (o.knight.currentHp > best.knight.currentHp ? o : best),
        options[0],
      );
      const healCandidates = options.filter((o) => o.instanceId !== damagePick.instanceId);
      const healPick =
        healCandidates.find((o) => o.playerIndex === playerIndex) || healCandidates[0];
      const amount = Math.min(maxDamage, damagePick.knight.currentHp);
      this.applyDonDeVieEffect(playerIndex, damagePick, healPick, amount, maxDamage);
      return;
    }

    g.state.pending = {
      type: 'donDeVie',
      playerIndex,
      phase: 'damageTarget',
      maxDamage,
      sourceLabel: objetDef?.name || 'Don de Vie',
      options: options.map((o) => ({
        playerIndex: o.playerIndex,
        target: o.target,
        instanceId: o.instanceId,
      })),
    };
    g.feedback('Don de Vie : choisissez le premier chevalier (dégâts).', 'objet');
    g.emit();
  }

  resolveDonDeViePick(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'donDeVie' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const pick = pending.options?.find((o) => o.instanceId === instanceId);
    if (!pick) return false;

    if (pending.phase === 'damageTarget') {
      pending.damageTarget = { ...pick };
      pending.phase = 'healTarget';
      pending.options = pending.options.filter((o) => o.instanceId !== instanceId);
      if (!pending.options.length) {
        g.feedback('Don de Vie : aucun autre chevalier pour les soins.', 'warn');
        g.state.pending = null;
        g.emit();
        return true;
      }
      g.feedback('Don de Vie : choisissez le second chevalier (soins).', 'heal');
      g.emit();
      return true;
    }

    if (pending.phase === 'healTarget') {
      pending.healTarget = { ...pick };
      pending.phase = 'amount';
      g.feedback(`Don de Vie : choisissez les dégâts (0–${pending.maxDamage ?? 40}).`, 'objet');
      g.emit();
      return true;
    }

    return false;
  }

  resolveDonDeVieAmount(playerIndex, amount) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'donDeVie' || pending.playerIndex !== playerIndex) {
      return false;
    }
    if (pending.phase !== 'amount' || !pending.damageTarget || !pending.healTarget) {
      return false;
    }
    const maxDamage = pending.maxDamage ?? 40;
    const dmg = Math.max(0, Math.min(maxDamage, Number(amount) || 0));
    const damageLoc = this.findKnightInPlayByInstanceId(pending.damageTarget.instanceId);
    const healLoc = this.findKnightInPlayByInstanceId(pending.healTarget.instanceId);
    g.state.pending = null;
    if (!damageLoc?.knight || !healLoc?.knight) {
      g.feedback('Don de Vie : cible introuvable.', 'warn');
      g.emit();
      return false;
    }
    this.applyDonDeVieEffect(playerIndex, damageLoc, healLoc, dmg, maxDamage);
    return true;
  }

  applyDonDeVieEffect(playerIndex, damageLoc, healLoc, amount, maxDamage) {
    const g = this.game;
    const { player: victimPlayer, knight: damageKnight, target: damageTarget } = damageLoc;
    const { player: healPlayer, knight: healKnight, target: healTarget } = healLoc;
    const dmgAmount = Math.max(0, Math.min(maxDamage ?? 40, amount ?? 0));

    let dealt = 0;
    if (dmgAmount > 0) {
      dealt = g.damageKnight(
        victimPlayer,
        damageKnight,
        dmgAmount,
        'don-de-vie',
        playerIndex,
        'don-de-vie',
      );
    } else {
      g.feedback('Don de Vie : 0 dégât infligé.', 'objet');
    }

    if (dealt > 0) {
      const healed = this.grantKnightHeal(healKnight, dealt, {
        healerPlayerIndex: playerIndex,
        requireCanHeal: false,
      });
      const shown = healed > 0 ? healed : dealt;
      g.feedback(
        `Don de Vie : +${shown} PV sur ${getCardDef(healKnight.cardId).name} (${dealt} dégâts infligés).`,
        'heal',
      );
      g.anim('heal', {
        amount: shown,
        cardId: healKnight.cardId,
        target: healTarget,
        playerIndex: healPlayer.index,
      });
    }

    g.emit();
  }

  finishSearchDeckUpTo(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'searchDeck' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const resume = pending.resume;
    g.state.pending = null;
    g.feedback('Recherche terminée.', 'objet');
    g.emit();
    if (resume?.kind === 'objetEffects') {
      const def = getCardDef(resume.cardId);
      if (def) {
        void g.effects.resolveObjetEffects(
          resume.playerIndex,
          def,
          resume.target,
          resume.nextIndex,
        );
      }
    } else if (resume?.kind === 'searchDeckRepeat' && resume.parentResume) {
      void g._continueAfterBenchPick(resume.parentResume);
    }
    return true;
  }

  attachSearchedEnergyToKnight(playerIndex, energyCard, knight, target) {
    const g = this.game;
    if (!knight || !energyCard) return;
    knight.energies.push({ cardId: energyCard.cardId, instanceId: energyCard.instanceId });
    g.feedback('Guilty : Énergie attachée depuis le deck.', 'energy');
    g.anim('attachEnergy', {
      cardId: energyCard.cardId,
      target,
      playerIndex,
      fromDeck: true,
    });
  }

  pickEnergyFromDeck(player) {
    for (let i = player.deck.length - 1; i >= 0; i--) {
      if (getCardDef(player.deck[i].cardId)?.cardType === 'energie') {
        return player.deck.splice(i, 1)[0];
      }
    }
    return null;
  }

  startAccelerationEnergie(playerIndex, eff, objetDef) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const maxDiscard = eff.maxDefausse ?? eff.maxDiscard ?? 3;
    const candidates = this.collectAccelerationDiscardCandidates(player, eff);

    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'accelerationEnergieDiscard',
        playerIndex,
        maxDiscard,
        discarded: 0,
        eff,
        sourceLabel: objetDef?.name || 'Guilty',
      };
      if (!candidates.length) {
        g.feedback('Guilty : aucun Chevalier Noir à défausser.', 'supporter');
        void this.finishAccelerationEnergieDiscard(playerIndex);
        return;
      }
      g.feedback(
        `Guilty : défaussez jusqu'à ${maxDiscard} Chevalier(s) Noir(s) (main ou banc), ou Terminer.`,
        'supporter',
      );
      g.emit();
      return;
    }

    void this.aiResolveAccelerationEnergie(playerIndex, eff, maxDiscard);
  }

  async aiResolveAccelerationEnergie(playerIndex, eff, maxDiscard) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    let discarded = 0;

    while (discarded < maxDiscard) {
      const candidates = this.collectAccelerationDiscardCandidates(player, eff);
      if (!candidates.length) break;
      const pick = candidates[0];
      if (pick.zone === 'hand') {
        const idx = player.hand.findIndex((c) => c.instanceId === pick.instanceId);
        if (idx < 0) break;
        const [card] = player.hand.splice(idx, 1);
        player.discard.push(card);
        g.feedback(`${getCardDef(card.cardId).name} défaussé (Guilty).`, 'supporter');
      } else {
        const idx = player.bench.findIndex((k) => k?.instanceId === pick.instanceId);
        if (idx < 0) break;
        this.discardBenchKnightVoluntary(player, idx);
      }
      discarded++;
    }

    await this.processAccelerationEnergieAttachChain(playerIndex, eff, discarded);
  }

  async finishAccelerationEnergieDiscard(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    const count = pending?.discarded ?? 0;
    const eff = pending?.eff;
    g.state.pending = null;
    if (count === 0) {
      g.feedback('Guilty : effet terminé.', 'supporter');
      g.emit();
      return;
    }
    await this.processAccelerationEnergieAttachChain(playerIndex, eff, count);
  }

  async processAccelerationEnergieAttachChain(playerIndex, eff, remaining) {
    const g = this.game;
    if (remaining <= 0) {
      g.emit();
      return;
    }

    const player = g.state.players[playerIndex];
    const energyCard = this.pickEnergyFromDeck(player);
    if (!energyCard) {
      g.feedback('Guilty : plus d\'Énergie dans le deck.', 'warn');
      await this.processAccelerationEnergieAttachChain(playerIndex, eff, remaining - 1);
      return;
    }

    const attachTargets = this.collectAccelerationAttachTargets(player);
    if (!attachTargets.length) {
      player.hand.push(energyCard);
      g.feedback('Guilty : aucune cible — Énergie ajoutée à la main.', 'warn');
      await this.processAccelerationEnergieAttachChain(playerIndex, eff, remaining - 1);
      return;
    }

    if (attachTargets.length === 1 || g.isAiControlled(playerIndex)) {
      const pick =
        g.isAiControlled(playerIndex)
          ? attachTargets.reduce((best, t) =>
              (t.knight.energies?.length ?? 0) < (best.knight.energies?.length ?? 0) ? t : best,
            )
          : attachTargets[0];
      this.attachSearchedEnergyToKnight(playerIndex, energyCard, pick.knight, pick.target);
      await this.processAccelerationEnergieAttachChain(playerIndex, eff, remaining - 1);
      return;
    }

    g.state.pending = {
      type: 'accelerationEnergieAttach',
      playerIndex,
      energyCard,
      options: attachTargets.map((t) => ({ target: t.target, instanceId: t.knight.instanceId })),
      eff,
      remainingAfter: remaining - 1,
    };
    g.feedback('Guilty : choisissez un Chevalier Noir ou Phénix Méchant pour l\'Énergie.', 'energy');
    g.emit();
  }

  resolveAccelerationDiscardFromHand(playerIndex, handIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'accelerationEnergieDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const card = player.hand[handIndex];
    if (!card || !this.isChevalierNoirCard(card.cardId)) return false;
    if ((pending.discarded ?? 0) >= (pending.maxDiscard ?? 3)) return false;

    player.discard.push(player.hand.splice(handIndex, 1)[0]);
    pending.discarded = (pending.discarded ?? 0) + 1;
    g.feedback(
      `${getCardDef(card.cardId).name} défaussé (${pending.discarded}/${pending.maxDiscard}).`,
      'supporter',
    );

    if (pending.discarded >= pending.maxDiscard) {
      void this.finishAccelerationEnergieDiscard(playerIndex);
    } else {
      g.emit();
    }
    return true;
  }

  resolveAccelerationDiscardFromBench(playerIndex, benchIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'accelerationEnergieDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const knight = player.bench[benchIndex];
    if (!knight || !this.isChevalierNoirCard(knight.cardId)) return false;
    if ((pending.discarded ?? 0) >= (pending.maxDiscard ?? 3)) return false;

    this.discardBenchKnightVoluntary(player, benchIndex);
    pending.discarded = (pending.discarded ?? 0) + 1;
    g.feedback(`Chevalier défaussé (${pending.discarded}/${pending.maxDiscard}).`, 'supporter');

    if (pending.discarded >= pending.maxDiscard) {
      void this.finishAccelerationEnergieDiscard(playerIndex);
    } else {
      g.emit();
    }
    return true;
  }

  async resolveAccelerationAttach(playerIndex, instanceId) {
    const g = this.game;
    const pending = g.state.pending;
    if (
      !pending ||
      pending.type !== 'accelerationEnergieAttach' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight = this.getKnightByTarget(player, opt.target);
    if (!knight) return false;

    const energyCard = pending.energyCard;
    const eff = pending.eff;
    const remainingAfter = pending.remainingAfter ?? 0;
    g.state.pending = null;

    this.attachSearchedEnergyToKnight(playerIndex, energyCard, knight, opt.target);
    await this.processAccelerationEnergieAttachChain(playerIndex, eff, remainingAfter);
    return true;
  }

  async applyToolOnAttach(playerIndex, toolDef, target) {
    await this.resolveObjetEffects(playerIndex, toolDef, target);
  }

  canKnightBecomeActive(knight) {
    if (!knight) return true;
    const def = getCardDef(knight.cardId);
    const req = def?.talent?.effects?.find((e) => e.type === 'requires_attached_tool_to_active');
    if (req?.toolCardId && !knightHasTool(knight, req.toolCardId)) {
      return false;
    }
    return true;
  }

  applyManigoldoTurnStart(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    if (player.prizes.length > opp.prizes.length) {
      void g.draw(player, 1);
      g.feedback('Manigoldo : pioche (avance aux Récompenses).', 'talent');
    }
    const threshold = eff.hpThreshold ?? 50;
    if (knight.currentHp <= threshold) {
      const idx = player.discard.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
      if (idx >= 0) {
        const [energy] = player.discard.splice(idx, 1);
        knight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
        g.feedback('Manigoldo : 1 Énergie attachée depuis la défausse.', 'energy');
      }
    }
  }

  resolveDiscardEnergyOpponentEnergyTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    if (!(knight.energies?.length > 0)) {
      g.feedback('Psychokinésie : défaussez une Énergie attachée.', 'warn');
      return false;
    }
    const e = knight.energies.pop();
    player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    if (opp.active?.energies?.length) {
      const oe = opp.active.energies.pop();
      opp.discard.push({ cardId: oe.cardId, instanceId: oe.instanceId });
      g.feedback('Psychokinésie : 1 Énergie adverse défaussée.', 'talent');
    } else {
      g.feedback('Psychokinésie : l\'adversaire n\'avait pas d\'Énergie attachée.', 'talent');
    }
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.emit();
    return true;
  }

  resolveDiscardHandSilenceOpponentTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Envoie de Fairy déjà utilisé ce tour.', 'warn');
      return false;
    }
    if (!player.hand.length) {
      g.feedback('Envoie de Fairy : aucune carte en main à défausser.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'discardHandSilenceOpponentTalent',
        playerIndex,
        knightInstanceId: knight.instanceId,
        turns: eff.turns || 2,
      };
      g.feedback('Envoie de Fairy : défaussez une carte de votre main.', 'talent');
      g.emit();
      return true;
    }
    const [card] = player.hand.splice(0, 1);
    player.discard.push(card);
    const opp = g.state.players[1 - playerIndex];
    opp.modifiers.activeTalentSilencedTurns = eff.turns || 2;
    knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback(
      `Envoie de Fairy : talent de l'actif adverse annulé ${eff.turns || 2} tour(s).`,
      'status',
    );
    g.emit();
    return true;
  }

  resolveLookTopDeckTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const count = Math.min(eff.count || 3, player.deck.length);
    if (count <= 0) {
      g.feedback('Pioche vide.', 'warn');
      return false;
    }
    const peeked = [];
    for (let i = 0; i < count; i++) {
      peeked.push(player.deck.pop());
    }
    peeked.reverse();
    const names = peeked.map((c) => getCardDef(c.cardId)?.name || c.cardId).join(', ');

    if (g.isAiControlled(playerIndex)) {
      for (let i = peeked.length - 1; i >= 0; i--) {
        player.deck.push(peeked[i]);
      }
      g.feedback(`Connais le futur : ${names}`, 'talent');
      if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
      g.emit();
      return true;
    }

    g.state.pending = {
      type: 'lookTopDeck',
      playerIndex,
      cards: peeked.map((c) => ({ ...c })),
      order: peeked.map((c) => c.instanceId),
      fromTalent: { knightInstanceId: knight.instanceId },
      oncePerTurn: !!eff.oncePerTurn,
    };
    g.feedback(`Connais le futur : ${names}`, 'talent');
    g.emit();
    return true;
  }

  moveLookTopDeckCard(playerIndex, index, direction) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'lookTopDeck' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const order = pending.order || [];
    const next = index + direction;
    if (index < 0 || index >= order.length || next < 0 || next >= order.length) return false;
    [order[index], order[next]] = [order[next], order[index]];
    pending.order = order;
    g.emit();
    return true;
  }

  cancelLookTopDeck(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'lookTopDeck' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const cards = pending.cards || [];
    for (let i = cards.length - 1; i >= 0; i--) {
      player.deck.push(cards[i]);
    }
    return true;
  }

  confirmLookTopDeck(playerIndex) {
    const g = this.game;
    const pending = g.state.pending;
    if (!pending || pending.type !== 'lookTopDeck' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const player = g.state.players[playerIndex];
    const cardById = Object.fromEntries((pending.cards || []).map((c) => [c.instanceId, c]));
    for (let i = (pending.order || []).length - 1; i >= 0; i--) {
      const card = cardById[pending.order[i]];
      if (card) player.deck.push(card);
    }
    const pl = player;
    const k = [pl.active, ...pl.bench].find((kn) => kn?.instanceId === pending.fromTalent?.knightInstanceId);
    if (k) {
      if (pending.oncePerTurn) k.modifiers.talentOnceThisTurn = true;
      k.talentUsed = true;
    }
    g.state.pending = null;
    g.feedback('Connais le futur : cartes remises sur la pioche.', 'talent');
    g.emit();
    return true;
  }

  resolveTurnStartHealOtherFriendly(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const amount = eff.amount || 10;
    const allies = [];
    if (player.active && player.active.instanceId !== knight.instanceId) {
      allies.push({ knight: player.active, target: 'active' });
    }
    player.bench.forEach((k, i) => {
      if (k && k.instanceId !== knight.instanceId) {
        allies.push({ knight: k, target: i });
      }
    });
    if (!allies.length) {
      g.feedback('Aucun autre chevalier allié à soigner.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex) && allies.length > 1) {
      g.state.pending = {
        type: 'pickHealAlly',
        playerIndex,
        amount,
        options: allies.map((a) => ({ target: a.target, instanceId: a.knight.instanceId })),
        fromTalent: { knightInstanceId: knight.instanceId },
      };
      if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
      g.feedback('Réparateur : choisissez un chevalier allié à soigner.', 'talent');
      g.emit();
      return true;
    }
    const pick = g.isAiControlled(playerIndex)
      ? allies.reduce(
          (best, a) => (a.knight.currentHp < best.knight.currentHp ? a : best),
          allies[0],
        )
      : allies[0];
    this.applyHealToKnight(player, pick.knight, amount, playerIndex, pick.target);
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.emit();
    return true;
  }

  resolveBenchHealOncePerTurn(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!player.bench.includes(knight)) {
      g.feedback('Talent utilisable depuis le banc uniquement.', 'warn');
      return false;
    }
    const allies = player.bench.filter(Boolean);
    if (!allies.length) {
      g.feedback('Aucun chevalier sur le banc.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex) && allies.length > 1) {
      g.state.pending = {
        type: 'pickHealAlly',
        playerIndex,
        amount: eff.amount || 10,
        options: allies.map((k, i) => ({ target: i, instanceId: k.instanceId })),
        benchOnly: true,
        fromTalent: { knightInstanceId: knight.instanceId },
      };
      if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
      g.feedback('Deuteros : choisissez un chevalier de banc à soigner.', 'talent');
      g.emit();
      return true;
    }
    const pick = g.isAiControlled(playerIndex)
      ? allies.reduce((best, k) => (k.currentHp < best.currentHp ? k : best), allies[0])
      : allies[0];
    const healed = this.grantKnightHeal(pick, eff.amount || 10, { requireCanHeal: false });
    if (eff.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback(`Deuteros : +${healed} PV sur ${getCardDef(pick.cardId).name}.`, 'heal');
    g.emit();
    return true;
  }

  resolveCopyBenchAttackTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (player.active?.instanceId !== knight.instanceId) {
      g.feedback('Apprends vite : ce chevalier doit être actif.', 'warn');
      return false;
    }
    if (!(knight.energies?.length >= (eff.discardEnergy || 1))) {
      g.feedback('Apprends vite : défaussez 1 Énergie.', 'warn');
      return false;
    }
    const benchAttacks = [];
    for (const bk of player.bench) {
      if (!bk) continue;
      const def = getCardDef(bk.cardId);
      for (const atk of def?.attacks || []) {
        if (eff.excludeAttackName && atk.name === eff.excludeAttackName) continue;
        if (/corps\s*à\s*corps/i.test(atk.name)) continue;
        benchAttacks.push({ ...atk, sourceKnightId: bk.cardId, sourceName: def.name });
      }
    }
    if (!benchAttacks.length) {
      g.feedback('Aucune attaque copiable sur le banc.', 'warn');
      return false;
    }
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'pickCopyBenchAttack',
        playerIndex,
        attacks: benchAttacks,
        knightInstanceId: knight.instanceId,
        discardEnergy: eff.discardEnergy || 1,
      };
      g.feedback('Apprends vite : choisissez une attaque de banc à copier.', 'talent');
      g.emit();
      return true;
    }
    const pick = benchAttacks[Math.floor(Math.random() * benchAttacks.length)];
    return this.applyCopiedBenchAttack(playerIndex, knight, pick, eff.discardEnergy || 1, eff);
  }

  applyCopiedBenchAttack(playerIndex, knight, attack, discardEnergy, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    for (let i = 0; i < discardEnergy && knight.energies.length; i++) {
      const e = knight.energies.pop();
      player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    }
    knight.modifiers.copiedAttackThisTurn = { ...attack, key: `copy-${attack.name}` };
    if (eff?.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback(`Apprends vite : « ${attack.name} » copiée ce tour.`, 'talent');
    g.emit();
    return true;
  }

  resolveBenchReturnToHandTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const benchIdx = player.bench.findIndex((k) => k?.instanceId === knight.instanceId);
    if (benchIdx < 0) {
      g.feedback('Asmita doit être sur le banc.', 'warn');
      return false;
    }
    if (!g.isKnightEvolutionEligible(playerIndex, knight)) {
      g.feedback('Asmita : doit être en jeu depuis le début de votre tour.', 'warn');
      return false;
    }
    const recoverOptions = player.discard
      .map((c, i) => ({ card: c, discardIdx: i }))
      .filter(({ card }) => {
        const t = getCardDef(card.cardId)?.cardType;
        return t === 'outil' || t === 'objet';
      });
    if (g.needsPlayerChoice(playerIndex) && recoverOptions.length > 1) {
      g.state.pending = {
        type: 'pickRecoverFromDiscard',
        playerIndex,
        benchIdx,
        knightInstanceId: knight.instanceId,
        oncePerTurn: !!eff.oncePerTurn,
        options: recoverOptions.map(({ card, discardIdx }) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
          discardIdx,
          name: getCardDef(card.cardId)?.name || card.cardId,
        })),
      };
      g.feedback('Retour au Sanctuaire : choisissez un Outil ou Objet à récupérer.', 'talent');
      g.emit();
      return true;
    }
    const recoverIdx =
      recoverOptions.length && g.isAiControlled(playerIndex)
        ? recoverOptions.reduce((best, o) =>
            (getCardDef(o.card.cardId)?.cardType === 'outil' ? 0 : 1) <
            (getCardDef(best.card.cardId)?.cardType === 'outil' ? 0 : 1)
              ? o
              : best,
          recoverOptions[0]).discardIdx
        : recoverOptions[0]?.discardIdx ?? -1;
    return this.applyBenchReturnToHand(playerIndex, knight, benchIdx, recoverIdx, eff);
  }

  applyBenchReturnToHand(playerIndex, knight, benchIdx, recoverDiscardIdx, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    while (knight.energies.length) {
      const e = knight.energies.pop();
      player.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    }
    if (knight.attachedTool) {
      player.discard.push({
        cardId: knight.attachedTool.cardId,
        instanceId: knight.attachedTool.instanceId,
      });
      knight.attachedTool = null;
    }
    player.bench.splice(benchIdx, 1);
    player.hand.push({ cardId: knight.cardId, instanceId: knight.instanceId });
    player.modifiers.cantReplayCardIds = player.modifiers.cantReplayCardIds || [];
    player.modifiers.cantReplayCardIds.push(knight.cardId);
    if (recoverDiscardIdx >= 0 && recoverDiscardIdx < player.discard.length) {
      const [recovered] = player.discard.splice(recoverDiscardIdx, 1);
      player.hand.push(recovered);
      g.feedback(`Outil/Objet récupéré : ${getCardDef(recovered.cardId)?.name}.`, 'objet');
    }
    if (eff?.oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
    knight.talentUsed = true;
    g.feedback(`${getCardDef(knight.cardId).name} renvoyé en main.`, 'talent');
    g.emit();
    return true;
  }

  resolveBenchCanAttackTalent(playerIndex, knight, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    if (!player.bench.includes(knight)) {
      g.feedback('Image mentale : Krest doit être sur le banc.', 'warn');
      return false;
    }
    if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
      g.feedback('Image mentale déjà utilisée ce tour.', 'warn');
      return false;
    }
    const def = getCardDef(knight.cardId);
    const attacks = (def?.attacks || []).map((a, i) => ({ ...a, index: i }));
    if (!attacks.length) return false;
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'pickBenchSelfAttack',
        playerIndex,
        benchIndex: player.bench.indexOf(knight),
        attacks,
      };
      g.feedback('Image mentale : choisissez une attaque de Krest.', 'talent');
      g.emit();
      return true;
    }
    const pick = attacks[Math.floor(Math.random() * attacks.length)];
    return g.attackFromBench(playerIndex, player.bench.indexOf(knight), pick.index, {
      endTurn: true,
      mentalImage: true,
    });
  }


  /** @deprecated — use startDistributeDamage */
  distributeDamageOpponentBenchOnly(attackerIndex, totalDamage) {
    this.startDistributeDamage(attackerIndex, totalDamage, { benchOnly: true });
  }

  resolveCoinFlipPerDiscardedKnightBenchDamage(playerIndex, eff) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const opp = g.state.players[1 - playerIndex];
    const chevaliers = player.discard.filter(
      (c) => getCardDef(c.cardId)?.cardType === 'chevalier',
    );
    if (!chevaliers.length) {
      g.feedback('Ruine sépulcrale : aucun Chevalier en défausse.', 'info');
      return;
    }
    let heads = 0;
    for (let i = 0; i < chevaliers.length; i++) {
      if (
        g.flipCoinWithUI('Ruine sépulcrale — par Chevalier en défausse', {
          flipIndex: i + 1,
          flipTotal: chevaliers.length,
        }) === RULES.coin.heads
      ) {
        heads++;
      }
    }
    g.feedback(formatCoinFlipSummary(heads, chevaliers.length - heads), 'coin');
    if (heads <= 0 || !opp.bench.some(Boolean)) return;
    const dmgPerBench = heads * (eff.damagePerHeads ?? 10);
    for (const bk of opp.bench) {
      if (bk) g.damageKnight(opp, bk, dmgPerBench, 'attack', playerIndex, null);
    }
    g.feedback(
      `Ruine sépulcrale : ${dmgPerBench} dégâts sur chaque banc adverse (${heads} face(s)).`,
      'damage',
    );
  }

  async resolveAttachSelfAsToolOnBenchKnight(playerIndex, eff, ctx) {
    const g = this.game;
    const player = g.state.players[playerIndex];
    const deuteros = player.active;
    if (!deuteros) return;
    const targetId = eff.targetCardId || ASPROS_GEMEAUX_CARD_ID;
    const benchIdx = player.bench.findIndex((k) => {
      const id = getCardDef(k?.cardId)?.id || k?.cardId;
      return id === targetId;
    });
    if (benchIdx < 0) {
      g.feedback('Aspros des Gémeaux doit être sur votre banc.', 'warn');
      return;
    }
    const aspros = player.bench[benchIdx];
    if (aspros.attachedTool) {
      g.feedback('Aspros a déjà un Outil attaché.', 'warn');
      return;
    }
    aspros.attachedTool = {
      cardId: DEUTEROS_CARD_ID,
      name: getCardDef(DEUTEROS_CARD_ID)?.name || 'Deuteros',
      instanceId: deuteros.instanceId,
      fromKnight: true,
    };
    while (deuteros.energies.length) {
      aspros.energies.push(deuteros.energies.shift());
    }
    player.active = null;
    deuteros.modifiers = deuteros.modifiers || {};
    if (eff.noPrizeOnTransition) {
      aspros.modifiers.noPrizeOnKO = true;
    }
    g.feedback('Deuteros attaché à Aspros comme Outil.', 'objet');
    if (g.needsPlayerChoice(playerIndex)) {
      g.state.pending = {
        type: 'pickOwnBenchActive',
        chooserPlayerIndex: playerIndex,
        sourceLabel: 'Explosion Galactique de l\'Âme',
        resume: eff.endTurn ? { forceEndTurn: true } : null,
      };
      g.emit();
      return;
    }
    if (!this.canKnightBecomeActive(aspros)) {
      g.feedback('Aspros ne peut pas devenir actif.', 'warn');
      return;
    }
    player.active = player.bench.splice(benchIdx, 1)[0];
    g.markKnightBecameActive(player.active);
    if (eff.endTurn) {
      g.state.forceEndTurnAfterTalent = true;
    }
    g.emit();
  }

  tryMentalImageRedirect(player, knight, amount, attackerPlayerIndex, attackName) {
    const g = this.game;
    const mur = player.modifiers.pendingMentalImage;
    if (!mur || mur.opponentTurnIndex !== g.state.turn) return null;
    if (/corps\s*à\s*corps/i.test(attackName || '')) return null;
    if (attackerPlayerIndex !== mur.attackerPlayerIndex) return null;
    const krest = player.bench.find((k) => k?.instanceId === mur.krestInstanceId);
    if (!krest) {
      player.modifiers.pendingMentalImage = null;
      return null;
    }
    const c = g.flipCoinWithUI('Image mentale — redirection des dégâts');
    g.feedback(`Image mentale — pièce : ${formatCoinFlipResult(c)}`, 'coin');
    player.modifiers.pendingMentalImage = null;
    if (c === RULES.coin.heads) {
      g.feedback('Image mentale : dégâts redirigés vers Krest sur le banc.', 'talent');
      return { redirectKnight: krest };
    }
    return null;
  }
}
