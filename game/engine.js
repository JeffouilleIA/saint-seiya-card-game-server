import {
  RULES,
  flipCoin,
  formatCoinFlipSummary,
  formatCoinFlipResult,
  canPayRetreat,
  countEnergiesForCost,
} from './rules.js';
import {
  canAttachToolToKnight,
  getKnightAllAttacks,
  getCardDef,
  getPrizeCountForKnockout,
  isChevalier,
  isBaseChevalier,
  isEnergie,
  isEvolutionStage,
  isObjetItem,
  isToolCard,
  isSupporter,
  isStade,
  isObjet,
  knightHasTool,
  knightHasTag,
  requiresEvolutionTool,
  resolveKnightFaction,
  matchesEvolution,
  matchesEvolutionTarget,
  getEvolutionRequiredToolName,
  formatEvolvesFrom,
  buildDeckFromList,
  DEFAULT_DECK_LIST,
  TEST_DUMMY_ACTIVE_ID,
  TEST_DUMMY_BENCH_IDS,
  whoChoosesBenchSwap,
  POSEIDON_CARD_IDS,
  countPoseidonFamilyInPlay,
  canPlayKnightCardFromHand,
  isJulianPoseidonStackHandCard,
} from './cards.js';
import { EffectResolver } from './effects.js';
import { attackFxDurationMs, getAttackFxId } from './attackFx.js';
import {
  buildExpertTurnSteps,
  pickAiTalent,
  pickExpertAttack,
  pickExpertTurnOrder,
} from './ai-expert.js';
import {
  getAiCheatLevel,
  isLegendeTier,
  pickDeckSearchOption,
  pickLegendeAttack,
  pickLegendeTurnOrder,
  pickRevealOpponentHandCard,
} from './ai-legende.js';

let uid = 0;
function nextId() {
  return `f-${++uid}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugPromote(...args) {
  try {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[Chevalier:promote]', ...args);
    }
  } catch (_) {
    /* console unavailable */
  }
}

function shuffle(arr) {
  const a = [...arr];
  shuffleInPlace(a);
  return a;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createFieldKnight(cardInstance) {
  const def = getCardDef(cardInstance.cardId);
  return {
    instanceId: nextId(),
    cardInstanceId: cardInstance.instanceId,
    cardId: cardInstance.cardId,
    currentHp: def.hp,
    maxHp: def.hp,
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

function cloneCardInstance(ci) {
  return { instanceId: ci.instanceId, cardId: ci.cardId };
}

/** Deep-enough copy so active and bench never share one field-knight object. */
function cloneFieldKnightState(knight) {
  return {
    instanceId: nextId(),
    cardInstanceId: knight.cardInstanceId,
    cardId: knight.cardId,
    currentHp: knight.currentHp,
    maxHp: knight.maxHp,
    energies: knight.energies.map((e) => ({ ...e })),
    statuses: [...knight.statuses],
    talentUsed: knight.talentUsed,
    modifiers: { ...knight.modifiers },
    attackedLastTurn: !!knight.attackedLastTurn,
    attackedThisTurn: !!knight.attackedThisTurn,
    attachedTool: knight.attachedTool ? { ...knight.attachedTool } : null,
    underCard: knight.underCard ? { ...knight.underCard } : null,
  };
}

/** Split duplicate active/bench references (regression guard). */
function ensureUniqueFieldKnights(player) {
  if (!player?.active) return;
  const active = player.active;
  for (let i = 0; i < player.bench.length; i++) {
    const k = player.bench[i];
    if (k && k === active) {
      player.bench[i] = cloneFieldKnightState(k);
    }
  }
}

function resolveFieldKnight(player, knight) {
  if (!knight || !player) return null;
  ensureUniqueFieldKnights(player);
  if (player.active?.instanceId === knight.instanceId) return player.active;
  const idx = player.bench.findIndex((k) => k?.instanceId === knight.instanceId);
  if (idx >= 0) return player.bench[idx];
  return null;
}

/** Retire immédiatement un chevalier du terrain (KO visuel instantané). */
function detachKnightFromField(player, knight) {
  knight = resolveFieldKnight(player, knight);
  if (!knight) return { knight: null, removed: false, wasActive: false };
  const wasActive = player.active?.instanceId === knight.instanceId;
  if (wasActive) {
    player.active = null;
  } else {
    player.bench = player.bench.filter((b) => b?.instanceId !== knight.instanceId);
  }
  return { knight, removed: true, wasActive };
}

const AI_DIFFICULTIES = ['facile', 'moyen', 'difficile', 'expert', 'legende', 'ridicule', 'absurde'];

/** Talents the player must activate explicitly (not on-play / passive). */
const ACTIVATED_TALENT_EFFECT_TYPES = [
  'teleport_once_per_turn',
  'transfer_energy_once_per_turn',
  'swap_with_card_id',
  'swap_active_with_self_if_card_ids',
  'melee_bonus_one_ally_turn',
  'search_deck_energy',
  'search_deck',
  'recover_energy_from_discard',
  'discard_draw',
  'draw_until_hand_size',
  'athena_sacrifice',
  'bench_damage_once_per_turn',
  'discard_energy_confuse_opponent',
  'discard_energy_poison_opponent',
  'discard_energy_opponent_energy',
  'look_top_deck',
  'bench_heal_once_per_turn',
  'copy_bench_attack_turn',
  'bench_return_to_hand',
  'bench_can_attack_end_turn',
  'transfer_energy_to_hades_bench',
  'swap_active_with_bench_tag',
  'discard_hand_silence_opponent_talent',
  'turn_start_heal_other_friendly',
  'kanon_submarine_sanctuary_once',
];

export class GameEngine {
  constructor({
    onFeedback,
    onStateChange,
    onAnimation,
    gameMode = 'ai',
    aiDifficulty = 'moyen',
    headless = false,
  } = {}) {
    this.onFeedback = onFeedback || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onAnimation = onAnimation || (() => {});
    this.headless = !!headless;
    this.gameMode = GameEngine.normalizeGameMode(gameMode);
    this.aiDifficulty = GameEngine.normalizeAiDifficulty(aiDifficulty);
    this.aiCheatLevel = getAiCheatLevel(this.aiDifficulty);
    this.effects = new EffectResolver(this);
    this._aiResumeTimer = null;
    this.reset();
  }

  static normalizeGameMode(value) {
    if (value === 'local2p') return 'local2p';
    if (value === 'attack-test') return 'attack-test';
    if (value === 'ai-battle') return 'ai-battle';
    return 'ai';
  }

  static normalizeAiDifficulty(value) {
    return AI_DIFFICULTIES.includes(value) ? value : 'moyen';
  }

  /** Facile / moyen / difficile (expert+ a sa propre logique d'attaque et de pièce). */
  _aiIsHardTier() {
    return (
      this.aiDifficulty === 'difficile' ||
      this.aiDifficulty === 'expert' ||
      isLegendeTier(this.aiDifficulty)
    );
  }

  /** Expert, Légende, Ridicule, Absurde — phase principale avec recherche. */
  _aiIsExpertTier() {
    return this.aiDifficulty === 'expert' || isLegendeTier(this.aiDifficulty);
  }

  get aiEnabled() {
    return this.gameMode === 'ai' || this.gameMode === 'ai-battle';
  }

  get isAiBattleMode() {
    return this.gameMode === 'ai-battle';
  }

  get isAttackTestMode() {
    return this.gameMode === 'attack-test';
  }

  /** Joueur contrôlé par l'IA (adversaire solo ou les deux en IA battle). */
  isAiControlled(playerIndex) {
    if (this.gameMode === 'ai-battle') return playerIndex === 0 || playerIndex === 1;
    if (this.gameMode === 'ai') return playerIndex === 1;
    return false;
  }

  /** Joueur humain devant trancher via l'UI (solo J0 ou les deux en local 1v1). */
  needsPlayerChoice(playerIndex) {
    return !this.isAiControlled(playerIndex);
  }

  /** Index du joueur IA pour aiTurn / reprises automatiques. */
  get currentAiPlayerIndex() {
    return this.isAiBattleMode ? this.state?.turn ?? 0 : 1;
  }

  _scheduleLater(fn, ms = RULES.ai.thinkMs) {
    clearTimeout(this._aiResumeTimer);
    if (this.headless && this.isAiBattleMode) {
      this._aiResumeTimer = null;
      return;
    }
    if (this.headless) {
      this._aiResumeTimer = setTimeout(() => {
        this._aiResumeTimer = null;
        fn();
      }, 0);
      return;
    }
    this._aiResumeTimer = setTimeout(() => {
      this._aiResumeTimer = null;
      fn();
    }, ms);
  }

  reset(options = {}) {
    if (options.gameMode) {
      this.gameMode = GameEngine.normalizeGameMode(options.gameMode);
    }
    if (options.headless != null) {
      this.headless = !!options.headless;
    }
    if (options.aiDifficulty) {
      this.aiDifficulty = GameEngine.normalizeAiDifficulty(options.aiDifficulty);
      this.aiCheatLevel = getAiCheatLevel(this.aiDifficulty);
    }
    const deckLists = options.deckLists || [DEFAULT_DECK_LIST, DEFAULT_DECK_LIST];
    clearTimeout(this._aiResumeTimer);
    this._aiResumeTimer = null;
    clearTimeout(this._autoEndTurnTimer);
    this._autoEndTurnTimer = null;
    this._autoEndTurnAfterPromote = null;
    this._deferCerbereForPlayerIndex = null;
    this._huitiemeSensTransferResolve = null;
    this._damageAttribution = null;
    const playerNames =
      this.gameMode === 'local2p'
        ? ['Joueur 1', 'Joueur 2']
        : this.gameMode === 'ai-battle'
          ? ['Deck A', 'Deck B']
          : ['Vous', 'Adversaire'];
    this.state = {
      phase: 'setup',
      turn: 0,
      turnCount: 0,
      firstPlayer: 0,
      winner: null,
      pending: null,
      logBanner: '',
      /** instanceIds of active+bench knights at turn start (per player) — evolution eligibility */
      evolveEligibleAtTurnStart: [[], []],
      players: [
        this.createPlayer(0, playerNames[0], deckLists[0]),
        this.createPlayer(1, playerNames[1], deckLists[1] ?? deckLists[0]),
      ],
      /** Stade global : { cardId, name, playerIndex } | null */
      stadium: null,
    };
    this.actions = { energy: false, supporter: false, stadium: false, attack: false, retreat: false };
    this.emit();
  }

  createPlayer(index, name, deckList = DEFAULT_DECK_LIST) {
    const deck = shuffle(buildDeckFromList(deckList));
    const prizes = deck.splice(0, RULES.prizeCount).map(cloneCardInstance);
    const hand = deck.splice(0, RULES.openingHand).map(cloneCardInstance);
    const player = {
      index,
      name,
      deck,
      hand,
      discard: [],
      prizes,
      prizesTaken: 0,
      active: null,
      bench: [],
      openingMulligans: 0,
      lastAttackName: null,
      playedAttackLastTurn: null,
      modifiers: {},
      koBonusNextTurn: false,
      koBonusThisTurn: false,
      opponentPlayedSupporterLastTurn: false,
      playedAthenaOrDivineChildThisTurn: false,
    };
    this.mulliganUntilChevalier(player);
    return player;
  }

  openingHandHasValidChevalier(player) {
    const needBase = RULES.openingMulligan?.requireBaseChevalier !== false;
    return player.hand.some((c) =>
      needBase ? canPlayKnightCardFromHand(c.cardId, player) : isChevalier(c.cardId),
    );
  }

  /** Remélange la main et repioche jusqu'à avoir au moins un chevalier de base */
  mulliganUntilChevalier(player) {
    if (!RULES.openingMulligan?.requireChevalier) return 0;
    const max = RULES.openingMulligan.maxAttempts ?? 30;
    let attempts = 0;

    while (attempts < max) {
      if (this.openingHandHasValidChevalier(player)) {
        player.openingMulligans = attempts;
        return attempts;
      }
      while (player.hand.length > 0) {
        player.deck.push(player.hand.pop());
      }
      shuffleInPlace(player.deck);
      const toDraw = Math.min(RULES.openingHand, player.deck.length);
      for (let i = 0; i < toDraw; i++) {
        player.hand.push(cloneCardInstance(player.deck.pop()));
      }
      attempts++;
    }

    const deckIdx = player.deck.findIndex((c) => canPlayKnightCardFromHand(c.cardId, player));
    if (deckIdx >= 0 && player.hand.length > 0) {
      const [baseCard] = player.deck.splice(deckIdx, 1);
      player.deck.push(player.hand.pop());
      player.hand.push(baseCard);
    }

    player.openingMulligans = attempts;
    return attempts;
  }

  get player() {
    return this.state.players[this.state.turn];
  }

  get opponent() {
    return this.state.players[1 - this.state.turn];
  }

  emit() {
    this.onStateChange(structuredClone(this.state));
  }

  feedback(msg, type = 'info') {
    this.state.logBanner = msg;
    this.onFeedback(msg, type);
    this.emit();
  }

  /**
   * Lance une pièce et affiche l'overlay central (annonce, raison, Face/Pile).
   * Fire-and-forget hors pipeline d'attaque (talents, début de tour, etc.).
   * @param {string} reason Contexte lisible (ex. « Confus — avant attaque »).
   * @param {{ flipIndex?: number, flipTotal?: number }} [options]
   */
  flipCoinWithUI(reason, options = {}) {
    const result = flipCoin();
    if (!this.headless) {
      let label = reason || 'Lancer de pièce';
      if (options.flipIndex != null && options.flipTotal != null) {
        label = `${label} (${options.flipIndex}/${options.flipTotal})`;
      }
      this.anim('coinFlip', { reason: label, result });
    }
    return result;
  }

  /** Pièce bloquante — attend la fin de l'overlay (pipeline d'attaque). */
  async awaitFlipCoinWithUI(reason, options = {}) {
    const result = flipCoin();
    if (this.headless) return result;
    let label = reason || 'Lancer de pièce';
    if (options.flipIndex != null && options.flipTotal != null) {
      label = `${label} (${options.flipIndex}/${options.flipTotal})`;
    }
    const overlayMs = (RULES.ui?.coinFlipOverlayMs ?? 2000) + 200;
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(this._coinFlipFallbackTimer);
        this._coinFlipFallbackTimer = null;
        this._coinFlipDoneResolve = null;
        resolve();
      };
      this._coinFlipDoneResolve = finish;
      this.anim('coinFlip', { reason: label, result });
      this._coinFlipFallbackTimer = setTimeout(() => {
        if (this._coinFlipDoneResolve === finish) finish();
      }, overlayMs);
    });
    return result;
  }

  notifyCoinFlipComplete() {
    if (this._coinFlipDoneResolve) this._coinFlipDoneResolve();
  }

  anim(type, data = {}) {
    this.onAnimation(type, data);
  }

  pause(ms) {
    if (this.headless) return Promise.resolve();
    return delay(ms ?? RULES.ui?.actionGapMs ?? 600);
  }

  drawBurstPerCardMs(playerIndex, cardCount) {
    const budget =
      playerIndex === 1
        ? (RULES.ui?.drawBurstAiTotalMs ?? RULES.ui?.drawBurstTotalMs ?? 2500)
        : (RULES.ui?.drawBurstTotalMs ?? 2800);
    const minMs = RULES.ui?.drawBurstMinMs ?? 80;
    const maxMs = RULES.ui?.drawBurstMaxMs ?? 400;
    return Math.min(maxMs, Math.max(minMs, Math.round(budget / Math.max(1, cardCount))));
  }

  drawBurstGapMs(playerIndex) {
    return playerIndex === 1
      ? (RULES.ui?.drawBurstAiGapMs ?? 40)
      : (RULES.ui?.drawBurstGapMs ?? 50);
  }

  drawRevealDurationMs(playerIndex, opts = {}) {
    if (opts.burst && (opts.totalCards ?? 0) > 1) {
      const per = opts.perCardMs ?? this.drawBurstPerCardMs(playerIndex, opts.totalCards);
      const gap = opts.cardIndex < opts.totalCards - 1 ? this.drawBurstGapMs(playerIndex) : 0;
      return per + gap;
    }
    const isAi = playerIndex === 1;
    const center = isAi
      ? (RULES.ui?.drawRevealAiCenterMs ?? 280)
      : (RULES.ui?.drawRevealCenterMs ?? 450);
    const fly = isAi
      ? (RULES.ui?.drawRevealAiFlyMs ?? 720)
      : (RULES.ui?.drawRevealFlyMs ?? 950);
    const tail = RULES.ui?.drawEmitGapMs ?? RULES.ui?.actionGapMs ?? 350;
    return center + fly + tail;
  }

  /** Mode test : un chevalier allié vs mannequins (pas de deck, récompenses ni victoire). */
  initAttackTest(knightCardId) {
    this.gameMode = 'attack-test';
    clearTimeout(this._aiResumeTimer);
    this._aiResumeTimer = null;
    clearTimeout(this._autoEndTurnTimer);
    this._autoEndTurnTimer = null;
    this._damageAttribution = null;
    this._deferredAttackOutcome = null;
    this._pendingAttackFinish = null;
    this._deferCerbereForPlayerIndex = null;

    const knightDef = getCardDef(knightCardId);
    if (!knightDef?.attacks?.length) {
      throw new Error(`Chevalier invalide pour le test : ${knightCardId}`);
    }

    const playerKnight = createFieldKnight({
      instanceId: 'test-player-knight',
      cardId: knightCardId,
    });
    let maxCost = 0;
    for (const atk of knightDef.attacks) {
      maxCost = Math.max(maxCost, this.getEffectiveAttackCost(playerKnight, atk));
    }
    for (let i = 0; i < maxCost; i++) {
      playerKnight.energies.push({
        instanceId: nextId(),
        cardId: 'energie-etoile',
      });
    }

    const makeDummy = (cardId) => {
      const fk = createFieldKnight({ instanceId: nextId(), cardId });
      const def = getCardDef(cardId);
      fk.currentHp = def?.hp ?? 1000;
      fk.maxHp = fk.currentHp;
      return fk;
    };

    const emptyPlayer = (index, name) => ({
      index,
      name,
      deck: [],
      hand: [],
      discard: [],
      prizes: [],
      prizesTaken: 0,
      active: null,
      bench: [],
      openingMulligans: 0,
      lastAttackName: null,
      playedAttackLastTurn: null,
      modifiers: {},
      koBonusNextTurn: false,
      koBonusThisTurn: false,
      opponentPlayedSupporterLastTurn: false,
      playedAthenaOrDivineChildThisTurn: false,
    });

    const opponent = emptyPlayer(1, 'Cibles test');
    opponent.active = makeDummy(TEST_DUMMY_ACTIVE_ID);
    opponent.bench = TEST_DUMMY_BENCH_IDS.map((id) => makeDummy(id));

    const player = emptyPlayer(0, 'Test');
    player.active = playerKnight;
    this.markKnightBecameActive(playerKnight);

    this.state = {
      phase: 'main',
      turn: 0,
      turnCount: 2,
      firstPlayer: 0,
      winner: null,
      pending: null,
      logBanner: '',
      evolveEligibleAtTurnStart: [[], []],
      players: [player, opponent],
      stadium: null,
      attackTestKnightId: knightCardId,
    };
    this.resetTurnActions();
    this.feedback(`Mode test — ${knightDef.name}. Choisissez une attaque.`, 'info');
    this.emit();
  }

  /** Restaure les PV des mannequins (appel manuel uniquement — pas après chaque attaque). */
  resetAttackTestTargets() {
    if (!this.isAttackTestMode) return;
    const opp = this.state.players[1];
    const resetKnight = (k) => {
      if (!k) return;
      k.currentHp = k.maxHp;
      k.statuses = [];
      k.modifiers = {};
    };
    resetKnight(opp.active);
    for (const b of opp.bench) resetKnight(b);
    this.emit();
  }

  startGame() {
    if (this.isAttackTestMode) return;
    const mull = this.state.players[0].openingMulligans;
    this.state.phase = 'chooseActive';
    this.state.pending = { type: 'chooseActive', playerIndex: 0, from: 'hand' };
    if (this.isAiBattleMode) {
      void this.aiChooseActiveFor(0);
      return;
    }
    if (mull > 0) {
      this.feedback(
        `Main redealee ${mull} fois — au moins un chevalier de base obtenu. Choisissez votre actif.`,
        'setup',
      );
    } else {
      this.feedback('Choisissez votre chevalier de base comme actif.', 'setup');
    }
    this.emit();
  }

  /** Pioche n cartes — une par une : révélation, puis ajout à la main. */
  async draw(player, n = 1) {
    this._drawEffectsInFlight = (this._drawEffectsInFlight || 0) + 1;
    const burst = n > 1;
    const perCardMs = burst ? this.drawBurstPerCardMs(player.index, n) : 0;
    try {
      for (let i = 0; i < n; i++) {
        if (player.deck.length === 0) {
          this.feedback(`${player.name} : deck vide.`, 'warn');
          break;
        }
        const card = cloneCardInstance(player.deck.pop());
        this.anim('drawReveal', {
          cardId: card.cardId,
          playerIndex: player.index,
          burst,
          perCardMs: burst ? perCardMs : undefined,
        });
        await this.pause(
          this.drawRevealDurationMs(player.index, {
            burst,
            totalCards: n,
            cardIndex: i,
            perCardMs,
          }),
        );
        player.hand.push(card);
        this.trimHand(player);
        this.emit();
      }
    } finally {
      this._drawEffectsInFlight = Math.max(0, (this._drawEffectsInFlight || 1) - 1);
    }
  }

  shufflePlayerDeck(playerIndex) {
    const player = this.state.players[playerIndex];
    if (player?.deck?.length > 1) shuffleInPlace(player.deck);
  }

  trimHand(player) {
    const cap = RULES.maxHand;
    if (typeof cap !== 'number' || cap <= 0) return;
    while (player.hand.length > cap) {
      const removed = player.hand.pop();
      player.discard.push(removed);
    }
  }

  getChevaliersInHand(player) {
    return player.hand.filter((c) => isChevalier(c.cardId));
  }

  async chooseActive(playerIndex, handIndex) {
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isBaseChevalier(card.cardId)) {
      if (card && isChevalier(card.cardId)) {
        this.feedback('Seuls les chevaliers de base peuvent être actifs au départ.', 'warn');
      }
      return false;
    }

    const def = getCardDef(card.cardId);
    if (!canPlayKnightCardFromHand(card.cardId, p)) {
      this.feedbackJulianPoseidonStackBlocked(def, p);
      return false;
    }

    let fk;
    if (isJulianPoseidonStackHandCard(def)) {
      fk = this.setupJulianStackFromHand(playerIndex, handIndex);
      if (!fk) {
        this.feedbackJulianPoseidonStackBlocked(def, p);
        return false;
      }
    } else {
      const [removed] = p.hand.splice(handIndex, 1);
      fk = createFieldKnight(removed);
    }
    if (!this.effects.canKnightBecomeActive(fk)) {
      if (isJulianPoseidonStackHandCard(def) && fk?.underCard) {
        p.hand.push({ cardId: fk.cardId, instanceId: fk.cardInstanceId });
        p.hand.push({ cardId: fk.underCard.cardId, instanceId: fk.underCard.instanceId });
      } else {
        p.hand.splice(handIndex, 0, { cardId: fk.cardId, instanceId: fk.cardInstanceId });
      }
      this.feedback('Ce chevalier ne peut pas être actif.', 'warn');
      return false;
    }
    p.active = fk;
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(p.active);
    this.maybeTriggerTalent(p, p.active);
    await this.triggerOnEnterKnight(playerIndex, p.active);

    if (playerIndex === 0 && this.state.phase === 'chooseActive') {
      this.state.phase = 'chooseActive';
      this.state.pending = { type: 'chooseActive', playerIndex: 1, from: 'hand' };
      if (this.aiEnabled) {
        this.feedback('Adversaire choisit son actif…', 'setup');
        this.emit();
        this._scheduleLater(() => this.aiChooseActiveFor(1));
      } else {
        this.feedback('Joueur 2 : choisissez votre chevalier de base actif.', 'setup');
        this.emit();
      }
      return true;
    }

    if (playerIndex === 1) {
      this.state.pending = null;
      this.beginMainPhase(this.state.firstPlayer ?? 0);
    }
    return true;
  }

  aiChooseActive() {
    this.aiChooseActiveFor(1);
  }

  aiChooseActiveFor(playerIndex) {
    const p = this.state.players[playerIndex];
    const idx = p.hand.findIndex((c) => canPlayKnightCardFromHand(c.cardId, p));
    if (idx < 0) {
      this.feedback(`IA : pas de chevalier de base en main (${p.name}).`, 'warn');
      if (playerIndex === 0 && this.state.phase === 'chooseActive') {
        this.state.pending = { type: 'chooseActive', playerIndex: 1, from: 'hand' };
        if (this.isAiControlled(1)) {
          void this.aiChooseActiveFor(1);
        } else {
          this.beginMainPhase(this.state.firstPlayer ?? 0);
        }
      } else if (playerIndex === 1) {
        this.beginMainPhase(this.state.firstPlayer ?? 0);
      }
      return;
    }
    void this.chooseActive(playerIndex, idx);
  }

  beginMainPhase(firstPlayer = 0) {
    this.state.phase = 'main';
    this.state.pending = null;
    this.state.firstPlayer = firstPlayer;
    this.state.turn = firstPlayer;
    this.resetTurnActions();
    this.processTurnStart();
  }

  resetTurnActions() {
    this.actions = { energy: false, supporter: false, stadium: false, attack: false, retreat: false };
  }

  /** Stade en jeu et effets associés (stub pour modificateurs globaux). */
  getStadiumEffect() {
    const s = this.state.stadium;
    if (!s?.cardId) return null;
    const def = getCardDef(s.cardId);
    if (!def) return null;
    return {
      cardId: s.cardId,
      name: s.name || def.name,
      playerIndex: s.playerIndex,
      effects: def.effects || [],
      def,
    };
  }

  /** Règle passive du stade en jeu (effects ou passiveEffects). */
  findStadiumRule(type) {
    const fx = this.getStadiumEffect();
    if (!fx?.def) return null;
    const list = [...(fx.def.effects || []), ...(fx.def.passiveEffects || [])];
    return list.find((e) => e.type === type) || null;
  }

  stadiumBlocksRetreat() {
    return !!this.findStadiumRule('block_retreat');
  }

  stadiumBlocksActiveSwap() {
    return !!this.findStadiumRule('block_active_swap');
  }

  stadiumBlocksSwapEffects() {
    return !!this.findStadiumRule('block_swap_effects');
  }

  stadiumBlocksDiscardRecovery() {
    return !!this.findStadiumRule('block_recover_from_discard');
  }

  getMaxEnergyAttachmentsPerTurn() {
    const rule = this.findStadiumRule('max_energy_attach_per_turn');
    if (rule) return rule.max ?? rule.amount ?? 2;
    return RULES.actionsPerTurn.attachEnergy ?? 1;
  }

  adjustKnockoutPrizeCount(baseCount, victimDef) {
    const rule = this.findStadiumRule('knockout_prize_minus_one');
    if (!rule || baseCount <= 0) return baseCount;
    const unlessMax = rule.unlessPrizeValueAtMost ?? 1;
    if (baseCount <= unlessMax) return baseCount;
    return Math.max(0, baseCount - (rule.amount ?? 1));
  }

  /** +1 coût d'attaque (Château d'Hadès) ; exceptions par tags carte / type chevalier. */
  isStadiumAttackCostExempt(knight, rule) {
    const def = getCardDef(knight?.cardId);
    if (!def || !rule) return false;
    const exceptTags = rule.exceptTags || [];
    if (exceptTags.some((t) => knightHasTag(def, t))) return true;
    if (
      exceptTags.includes('divinite') &&
      (def.knightType === 'Divinite' ||
        def.rawType === 'divinite' ||
        def.tags?.includes('Divinite'))
    ) {
      return true;
    }
    const name = (def.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (exceptTags.includes('sang-athena') && name.includes('athena')) return true;
    if (exceptTags.includes('sang-athena') && knight?.attachedTool) {
      const toolDef = getCardDef(knight.attachedTool.cardId);
      if (toolDef?.tags?.includes('sang-athena')) return true;
    }
    return false;
  }

  getEffectiveAttackCost(knight, attack) {
    let cost = attack?.cost ?? 0;
    if (knight?.attachedTool) {
      const toolDef = getCardDef(knight.attachedTool.cardId);
      for (const eff of toolDef?.passiveEffects || []) {
        if (eff.type === 'reduce_attack_cost') cost -= eff.amount ?? 1;
      }
    }
    const plusRule = this.findStadiumRule('attack_cost_plus');
    if (plusRule && knight && !this.isStadiumAttackCostExempt(knight, plusRule)) {
      cost += plusRule.amount ?? 1;
    }
    const minusRule = this.findStadiumRule('attack_cost_minus');
    if (minusRule && knight) {
      const def = getCardDef(knight.cardId);
      const forTypes = minusRule.forTypes || [];
      if (forTypes.length === 0 || forTypes.includes(def?.rawType)) {
        cost -= minusRule.amount ?? 1;
      }
    }
    const baseCost = attack?.cost ?? 0;
    if (baseCost > 0) {
      cost += this.effects.getKnightAttackCostIncrease(knight, baseCost);
    }
    return Math.max(0, cost);
  }

  discardStadiumToOwner(stadiumState) {
    if (!stadiumState?.cardId) return;
    const owner = this.state.players[stadiumState.playerIndex];
    if (!owner) return;
    owner.discard.push({
      cardId: stadiumState.cardId,
      instanceId: stadiumState.instanceId || nextId(),
    });
  }

  canPlayStadium(playerIndex = this.state.turn) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (this.state.players[playerIndex].modifiers.cantPlayCardNextTurn) return false;
    if (this.actions.stadium) return false;
    return this.state.players[playerIndex].hand.some((c) => isStade(c.cardId));
  }

  playStadium(playerIndex, handIndex) {
    if (!this.canPlayStadium(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isStade(card.cardId)) return false;

    const def = getCardDef(card.cardId);
    if (!def) return false;

    if (this.state.stadium) {
      const prev = this.state.stadium;
      this.discardStadiumToOwner(prev);
      this.feedback(
        `${prev.name || getCardDef(prev.cardId)?.name} remplacé — envoyé à la défausse.`,
        'stadium',
      );
    }

    const played = p.hand.splice(handIndex, 1)[0];
    this.state.stadium = {
      cardId: played.cardId,
      name: def.name,
      playerIndex,
      instanceId: played.instanceId,
    };
    this.actions.stadium = true;
    this.feedback(`${def.name} est en jeu (Stade).`, 'stadium');
    this.anim('stadium', { cardId: def.id, playerIndex });
    void this.effects.applyStadiumOnPlay(playerIndex, def);
    this.emit();
    return true;
  }

  applyStadiumTurnStart(playerIndex) {
    const fx = this.getStadiumEffect();
    if (!fx) return;
    void this.effects.applyStadiumTurnStart(playerIndex, fx);
  }

  /** Chevaliers actif + banc présents au début du tour (avant pioche / actions). */
  snapshotEvolutionEligible(playerIndex) {
    const p = this.state.players[playerIndex];
    const ids = [];
    if (p.active) ids.push(p.active.instanceId);
    for (const k of p.bench) ids.push(k.instanceId);
    if (!this.state.evolveEligibleAtTurnStart) {
      this.state.evolveEligibleAtTurnStart = [[], []];
    }
    this.state.evolveEligibleAtTurnStart[playerIndex] = ids;
  }

  isKnightEvolutionEligible(playerIndex, knight) {
    if (!knight) return false;
    const ids = this.state.evolveEligibleAtTurnStart?.[playerIndex];
    if (!ids?.length) return false;
    return ids.includes(knight.instanceId);
  }

  canEvolveTarget(playerIndex, target) {
    const p = this.state.players[playerIndex];
    const knight = target === 'active' ? p.active : p.bench[target];
    if (!knight) return false;
    return this.isKnightEvolutionEligible(playerIndex, knight);
  }

  /** Premier tour du joueur : turnCount 0 pour firstPlayer, 1 pour l'autre (incrémenté à chaque fin de tour). */
  isPlayerFirstTurn(playerIndex = this.state.turn) {
    const first = this.state.firstPlayer ?? 0;
    const firstTurnCount = playerIndex === first ? 0 : 1;
    return (this.state.turnCount || 0) === firstTurnCount;
  }

  canEvolveThisTurn(playerIndex = this.state.turn) {
    if (!RULES.firstTurnNoEvolution) return true;
    return !this.isPlayerFirstTurn(playerIndex);
  }

  canEvolve(playerIndex = this.state.turn, handIndex, target = null) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (!this.canEvolveThisTurn(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const evoCard = p.hand[handIndex];
    if (!evoCard) return false;
    const evoDef = getCardDef(evoCard.cardId);
    if (!isEvolutionStage(evoDef.stage)) return false;

    const matchesTarget = (knight) => {
      if (!knight || !matchesEvolutionTarget(knight, evoCard.cardId)) return false;
      if (knight.attachedTool) {
        const toolDef = getCardDef(knight.attachedTool.cardId);
        if (toolDef?.blocksEvolution) return false;
      }
      if (requiresEvolutionTool(evoDef)) {
        const toolId = evoDef.evolutionRequiresTool || RULES.evolution?.divineRequiresTool;
        if (toolId && !knightHasTool(knight, toolId)) return false;
      }
      return true;
    };

    if (target != null) {
      const knight = target === 'active' ? p.active : p.bench[target];
      if (!matchesTarget(knight)) return false;
      return this.isKnightEvolutionEligible(playerIndex, knight);
    }

    if (matchesTarget(p.active) && this.isKnightEvolutionEligible(playerIndex, p.active)) {
      return true;
    }
    return p.bench.some(
      (k) => matchesTarget(k) && this.isKnightEvolutionEligible(playerIndex, k),
    );
  }

  canEvolveFromHand(playerIndex = this.state.turn, handIndex) {
    return this.canEvolve(playerIndex, handIndex, null);
  }

  /** Cosmo en main avec cible compatible mais jouée ce tour (pour message UI). */
  hasEvolveMatchNotEligibleThisTurn(playerIndex, handIndex) {
    const p = this.state.players[playerIndex];
    const evoCard = p.hand[handIndex];
    if (!evoCard) return false;
    const matchesButNew = (knight) =>
      knight &&
      matchesEvolutionTarget(knight, evoCard.cardId) &&
      !this.isKnightEvolutionEligible(playerIndex, knight);
    return matchesButNew(p.active) || p.bench.some(matchesButNew);
  }

  /** Cible compatible mais sans Sang d'Athéna (ou outil requis) attaché. */
  hasEvolveMatchMissingTool(playerIndex, handIndex) {
    const p = this.state.players[playerIndex];
    const evoCard = p.hand[handIndex];
    if (!evoCard) return false;
    const evoDef = getCardDef(evoCard.cardId);
    if (!requiresEvolutionTool(evoDef)) return false;
    const toolId = evoDef.evolutionRequiresTool || RULES.evolution?.divineRequiresTool;
    if (!toolId) return false;
    const missingTool = (knight) =>
      knight &&
      matchesEvolutionTarget(knight, evoCard.cardId) &&
      !knightHasTool(knight, toolId);
    return missingTool(p.active) || p.bench.some(missingTool);
  }

  async processTurnStart() {
    const playerIndex = this.state.turn;
    this.snapshotEvolutionEligible(playerIndex);
    if (this.tryWinByNoFieldChevaliers(playerIndex)) return;

    if (await this.awaitTurnStartPromoteIfNeeded()) return;

    this.anim('turnStartBanner', { playerIndex });
    await this.pause(RULES.ui?.turnStartBannerMs ?? 1600);

    if (this.gameMode === 'local2p') {
      await this.awaitLocal2pPerspectiveBeforeDraw();
    }

    await this.continueTurnStart();
  }

  /** local2p: render flipped seat at bottom, then wait before draw animation */
  async awaitLocal2pPerspectiveBeforeDraw() {
    this.emit();
    await this.flushUiPaint();
    await this.pause(RULES.ui?.perspectiveFlipBeforeDrawMs ?? 1000);
  }

  async flushUiPaint() {
    if (typeof requestAnimationFrame === 'undefined') return;
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  /** KO promote still pending when this player's turn begins — resolve before banner/draw */
  async awaitTurnStartPromoteIfNeeded() {
    const playerIndex = this.state.turn;
    const pending = this.state.pending;
    if (pending?.type !== 'promoteActive' || pending.playerIndex !== playerIndex) {
      return false;
    }

    if (this.isAiControlled(playerIndex)) {
      const koPause = this.headless ? 0 : (RULES.ui?.koFxMs ?? RULES.ui?.genericAnimMs ?? 1200);
      await this.pause(koPause);
      if (!this.headless) await this.pause(RULES.ai.thinkMs);
      if (
        this.state.pending?.type === 'promoteActive' &&
        this.state.pending.playerIndex === playerIndex
      ) {
        this.resolveAiPromoteActive(playerIndex);
        if (!this.headless) await this.pause(RULES.ui?.actionGapMs ?? 600);
      }
    } else {
      await this.waitForPromoteCleared(playerIndex);
    }

    return this.tryWinByNoFieldChevaliers(playerIndex);
  }

  async waitForPromoteCleared(playerIndex) {
    while (
      !this.state.winner &&
      this.state.pending?.type === 'promoteActive' &&
      this.state.pending.playerIndex === playerIndex
    ) {
      await this.pause(150);
    }
  }

  clearPendingMurCrystalIfKnight(knightInstanceId, playerIndex, reason = '') {
    const pl = this.state.players[playerIndex];
    const mur = pl?.modifiers?.pendingMurCrystal;
    if (!mur || mur.shieldKnightInstanceId !== knightInstanceId) return;
    pl.modifiers.pendingMurCrystal = null;
    if (reason) {
      this.feedback(`Mur de Cristal : dissipé (${reason}).`, 'status');
    }
  }

  /** Mode test : simule une attaque adverse reçue par votre actif (après Mur de Cristal + fin de tour). */
  simulateAttackTestIncomingHit(amount = 80) {
    if (!this.isAttackTestMode) return false;
    const defender = this.state.players[0];
    const attacker = this.state.players[1];
    if (this.state.turn !== 1) {
      this.feedback('Finissez votre tour pour passer au tour adverse (test).', 'warn');
      return false;
    }
    if (!defender?.active) return false;
    this.damageKnight(defender, defender.active, amount, 'attack', 1, attacker.active?.cardId);
    this.emit();
    return true;
  }

  clearExpiringDamageReduction(player) {
    const knights = [player.active, ...player.bench].filter(Boolean);
    for (const knight of knights) {
      if (knight.modifiers.reduceDamageUntilOwnerTurn) {
        knight.modifiers.reduceDamage = 0;
        knight.modifiers.reduceDamageUntilOwnerTurn = false;
      }
      if (knight.modifiers.extraDamageTakenUntilOwnerTurn) {
        knight.modifiers.extraDamageTaken = 0;
        knight.modifiers.extraDamageTakenUntilOwnerTurn = false;
      }
      if (knight.modifiers.reflectUntilOwnerTurn) {
        knight.modifiers.reflectDamage = 0;
        knight.modifiers.reflectUntilOwnerTurn = false;
      }
      if (knight.modifiers.immuneDamageNextTurn) {
        knight.modifiers.immuneDamageNextTurn = false;
      }
      if (knight.modifiers.reduceDamageDealt) {
        knight.modifiers.reduceDamageDealt = 0;
      }
      if (knight.modifiers.blockNextAttack) {
        knight.modifiers.blockNextAttack = false;
        knight.modifiers.counterOnBlock = 0;
      }
      if (knight.modifiers.baianMurAir?.untilOwnerTurn) {
        knight.modifiers.baianMurAir = null;
      }
    }
  }

  async continueTurnStart() {
    const playerIndex = this.state.turn;
    const p = this.player;
    p.playedAttackLastTurn = p.lastAttackName;
    this.clearExpiringDamageReduction(p);
    p.koBonusThisTurn = p.koBonusNextTurn;
    p.koBonusNextTurn = false;
    this.effects.applyTurnStartTalents(playerIndex);
    p.modifiers.cantPlayCardNextTurn = false;
    p.modifiers.bonusAttackDamageThisTurn = 0;
    if ((p.modifiers.activeTalentSilencedTurns ?? 0) > 0) {
      p.modifiers.activeTalentSilencedTurns -= 1;
    }
    p.playedAthenaOrDivineChildThisTurn = false;
    p.energyAttachmentsThisTurn = 0;
    if (p.active?.modifiers.cantUseAttackOnNextTurn) {
      const blocked = p.active.modifiers.cantUseAttackOnNextTurn;
      p.active.modifiers.cantUseAttacks = p.active.modifiers.cantUseAttacks || [];
      if (!p.active.modifiers.cantUseAttacks.includes(blocked)) {
        p.active.modifiers.cantUseAttacks.push(blocked);
      }
      delete p.active.modifiers.cantUseAttackOnNextTurn;
    }
    if (p.active?.modifiers.cantRetreat) {
      p.active.modifiers.cantRetreat = false;
    }
    for (const knight of [p.active, ...p.bench].filter(Boolean)) {
      knight.talentUsed = false;
      knight.modifiers.talentOnceThisTurn = false;
      knight.modifiers.bonusAttackDamageThisTurn = 0;
      knight.modifiers.aiorosProtecteurAppliedThisTurn = false;
    }
    await this.draw(p, RULES.drawPerTurn);
    this.applyStadiumTurnStart(playerIndex);
    this.resolveStatusAtTurnStart(p.active);
    this.feedback(`Tour de ${p.name}`, 'turn');
    this.emit();
    if (this.isAiControlled(this.state.turn) && !(this.headless && this.isAiBattleMode)) {
      const startDelay = this.headless ? 0 : (RULES.ai.turnStartDelayMs ?? RULES.ai.thinkMs);
      this._scheduleLater(() => void this.aiTurn(), startDelay);
    }
  }

  resolveStatusAtTurnStart(knight) {
    if (!knight) return;
    if (knight.statuses.includes('frozen')) {
      const c = this.flipCoinWithUI('Gelé — dégel en début de tour');
      if (c === RULES.coin.heads) {
        knight.statuses = knight.statuses.filter((s) => s !== 'frozen');
        this.feedback('Gelé : dégelé (face).', 'status');
        this.anim('status', { status: 'frozen', removed: true });
      }
    }
  }

  /** Pokémon Checkup : 10 PV par actif empoisonné (les deux joueurs), en fin de tour. */
  resolvePoisonCheckup() {
    for (const player of this.state.players) {
      const knight = player.active;
      if (!knight?.statuses?.includes('poisoned')) continue;
      if (this.effects.isSunreiPendingRevive(player, knight)) continue;
      const def = getCardDef(knight.cardId);
      const healEff = def?.talent?.effects?.find((e) => e.type === 'poison_becomes_heal');
      if (healEff && !this.effects.isTalentSilenced(knight, player.index)) {
        const before = knight.currentHp;
        knight.currentHp = Math.min(knight.maxHp, knight.currentHp + (healEff.amount || 10));
        const healed = knight.currentHp - before;
        if (healed > 0) {
          this.feedback(`${def.name} : +${healed} PV (empoisonné).`, 'heal');
          this.anim('heal', { amount: healed, cardId: knight.cardId, target: 'active', playerIndex: player.index });
          this.onKnightHealed(knight);
        }
        continue;
      }
      this.damageKnight(player, knight, RULES.status.poisoned.damagePerCheckup, 'poison');
    }
  }

  clearKnightPoison(knight) {
    if (!knight?.statuses?.includes('poisoned')) return false;
    knight.statuses = knight.statuses.filter((s) => s !== 'poisoned');
    this.anim('status', { status: 'poisoned', removed: true });
    return true;
  }

  clearKnightConfused(knight) {
    if (!knight?.statuses?.includes('confused')) return false;
    knight.statuses = knight.statuses.filter((s) => s !== 'confused');
    this.anim('status', { status: 'confused', removed: true });
    return true;
  }

  /** Soigné (PV) : retire Confus (règles officielles). */
  onKnightHealed(knight) {
    if (this.clearKnightConfused(knight)) {
      this.feedback('Confus : soigné.', 'status');
    }
  }

  onKnightSentToBench(knight) {
    if (this.clearKnightPoison(knight)) {
      this.feedback('Empoisonné : soigné (retour au banc).', 'status');
    }
    if (this.clearKnightConfused(knight)) {
      this.feedback('Confus : soigné (quitte l\'actif).', 'status');
    }
  }

  /** Chevalier envoyé au banc par un échange forcé (attaque/talent/objet adverse). */
  markKnightMovedToBenchByOpponentPower(knight, sourcePlayerIndex) {
    if (!knight) return;
    knight.modifiers = knight.modifiers || {};
    knight.modifiers.movedToBenchByOpponentPower = true;
    knight.modifiers.benchSwapSourcePlayerIndex = sourcePlayerIndex;
  }

  clearKnightMovedToBenchByOpponentPower(knight) {
    if (!knight?.modifiers) return;
    delete knight.modifiers.movedToBenchByOpponentPower;
    delete knight.modifiers.benchSwapSourcePlayerIndex;
  }

  knightMovedToBenchByOpponentPower(knight) {
    return !!knight?.modifiers?.movedToBenchByOpponentPower;
  }

  async endTurn() {
    if (this.state.winner) return;
    if (this.state.forceEndTurnAfterTalent) {
      this.state.forceEndTurnAfterTalent = false;
    }
    const endingPlayerIndex = this.state.turn;
    this.matchStats?.recordTurnEnd?.(endingPlayerIndex);
    const endingPlayer = this.state.players[endingPlayerIndex];
    if (endingPlayer.active?.modifiers.attackTaxExpiresOnTurnEnd) {
      endingPlayer.active.modifiers.attackTaxDiscardEnergy = 0;
      endingPlayer.active.modifiers.attackTaxExpiresOnTurnEnd = false;
    }
    if (endingPlayer.active?.modifiers.attackCostPlusClearOnOwnerTurnEnd) {
      endingPlayer.active.modifiers.attackCostPlus = 0;
      endingPlayer.active.modifiers.attackCostPlusClearOnOwnerTurnEnd = false;
    }
    if (endingPlayer.active?.modifiers.cantUseAttacks?.length) {
      endingPlayer.active.modifiers.cantUseAttacks = [];
    }
    for (const pl of this.state.players) {
      if (pl.modifiers.pendingMurCrystal?.opponentTurnIndex === endingPlayerIndex) {
        pl.modifiers.pendingMurCrystal = null;
      }
    }
    endingPlayer.modifiers.cantReplayCardIds = [];
    await this.effects.applyStadiumEndTurnDamage();
    this.effects.applyAthenaExclamationEndTurn(this.state.turn);
    this.effects.applyEndOfTurnKnightTalents(this.state.turn);
    const p = this.player;
    if (p.active?.statuses.includes('paralyzed')) {
      p.active.statuses = p.active.statuses.filter((s) => s !== 'paralyzed');
    }
    if (p.active) {
      p.lastAttackName = p._currentAttackName || p.lastAttackName;
      p._currentAttackName = null;
    }
    for (const knight of [endingPlayer.active, ...endingPlayer.bench].filter(Boolean)) {
      knight.attackedLastTurn = !!knight.attackedThisTurn;
      knight.attackedThisTurn = false;
      if (knight.modifiers?.copiedAttackThisTurn) {
        knight.modifiers.copiedAttackThisTurn = null;
      }
      if (knight.modifiers?.cannotAttachEnergyFromHand) {
        knight.modifiers.cannotAttachEnergyFromHand = false;
      }
      this.clearKnightMovedToBenchByOpponentPower(knight);
    }
    this.resolvePoisonCheckup();
    this.effects.resolveSunreiEndOfTurnRevivals(endingPlayerIndex);
    await this.resolveDeferredPrizesAtEndTurn();
    if (this.state.winner) return;
    for (const pl of this.state.players) {
      if (pl.modifiers.sunreiProtection?.expiresAfterTurnEndPlayerIndex === endingPlayerIndex) {
        pl.modifiers.sunreiProtection = null;
      }
    }
    const other = 1 - this.state.turn;
    this.state.players[other].opponentPlayedSupporterLastTurn = this.actions.supporter;
    this.state.turnCount = (this.state.turnCount || 0) + 1;
    this.state.turn = 1 - this.state.turn;
    this.resetTurnActions();
    await this.pause(RULES.ui?.endTurnGapMs ?? RULES.ui?.actionGapMs ?? 550);
    await this.processTurnStart();
  }

  canAttachEnergy(playerIndex = this.state.turn) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    const p = this.state.players[playerIndex];
    const maxAttach = this.getMaxEnergyAttachmentsPerTurn();
    if ((p.energyAttachmentsThisTurn || 0) >= maxAttach) return false;
    if (!p.hand.some((c) => isEnergie(c.cardId))) return false;
    if (!this.hasAnyKnight(playerIndex)) return false;
    return this.hasKnightEligibleForHandEnergyAttach(playerIndex);
  }

  knightCanAttachEnergyFromHand(knight) {
    return !knight?.modifiers?.cannotAttachEnergyFromHand;
  }

  hasKnightEligibleForHandEnergyAttach(playerIndex) {
    const p = this.state.players[playerIndex];
    if (p.active && this.knightCanAttachEnergyFromHand(p.active)) return true;
    return p.bench.some((k) => k && this.knightCanAttachEnergyFromHand(k));
  }

  hasAnyKnight(playerIndex) {
    const p = this.state.players[playerIndex];
    return p.active || p.bench.length > 0;
  }

  /** Victoire adverse si le joueur n'a plus de chevalier actif ni sur le banc */
  tryWinByNoFieldChevaliers(playerIndex) {
    if (!RULES.winConditions.opponentNoChevaliers || this.state.winner) return false;
    const p = this.state.players[playerIndex];
    if (p.active || p.bench.length > 0) return false;

    const winnerIndex = 1 - playerIndex;
    this.state.winner = winnerIndex;
    this.state.phase = 'gameOver';
    this.state.pending = null;
    const winner = this.state.players[winnerIndex];
    this.feedback(
      `${winner.name} remporte la partie — ${p.name} n'a plus de chevalier en jeu !`,
      'win',
    );
    return true;
  }

  attachEnergy(playerIndex, handIndex, target) {
    if (!this.canAttachEnergy(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isEnergie(card.cardId)) return false;

    const knight = target === 'active' ? p.active : p.bench[target];
    if (!knight) return false;
    if (!this.knightCanAttachEnergyFromHand(knight)) {
      this.feedback('Ce chevalier ne peut pas recevoir d\'Énergie depuis la main ce tour.', 'energy');
      return false;
    }

    p.hand.splice(handIndex, 1);
    knight.energies.push({ cardId: card.cardId, instanceId: card.instanceId });
    p.energyAttachmentsThisTurn = (p.energyAttachmentsThisTurn || 0) + 1;
    if (p.energyAttachmentsThisTurn >= this.getMaxEnergyAttachmentsPerTurn()) {
      this.actions.energy = true;
    }
    this.feedback('Énergie attachée.', 'energy');
    this.anim('attachEnergy', { cardId: card.cardId, target, playerIndex });
    this.emit();
    return true;
  }

  canPlayObjetItem(playerIndex = this.state.turn) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (this.state.players[playerIndex].modifiers.cantPlayCardNextTurn) return false;
    return true;
  }

  canPlaySupporter(playerIndex = this.state.turn) {
    if (!this.canPlayObjetItem(playerIndex)) return false;
    if (this.actions.supporter) return false;
    return true;
  }

  async playObjet(playerIndex, handIndex, target) {
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card) return false;

    if (isToolCard(card.cardId)) return false;

    if (isSupporter(card.cardId)) {
      if (!this.canPlaySupporter(playerIndex)) return false;
      return await this.playSupporterCard(playerIndex, handIndex, target);
    }
    if (isObjetItem(card.cardId)) {
      if (!this.canPlayObjetItem(playerIndex)) return false;
      return await this.playObjetItemCard(playerIndex, handIndex, target);
    }
    return false;
  }

  canPlayTool(playerIndex = this.state.turn) {
    return this.canPlayObjetItem(playerIndex);
  }

  discardKnightTool(player, knight) {
    if (!knight?.attachedTool) return;
    player.discard.push({
      cardId: knight.attachedTool.cardId,
      instanceId: knight.attachedTool.instanceId,
    });
    knight.attachedTool = null;
  }

  /** 8e Sens : outil en main + transfert d'énergies avant défausse standard. */
  async resolveKnightToolOnKnockout(player, knight) {
    if (!knight?.attachedTool) return;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    const returnEff = toolDef?.passiveEffects?.find((e) => e.type === 'return_tool_to_hand_on_ko');
    if (returnEff) {
      const maxMove = returnEff.maxEnergyTransfer ?? 2;
      player.hand.push({
        cardId: knight.attachedTool.cardId,
        instanceId: knight.attachedTool.instanceId,
      });
      this.feedback('8e Sens : outil remis en main.', 'objet');
      knight.attachedTool = null;
      await this.startHuitiemeSensTransferOnKo(player, knight, maxMove);
      return;
    }
    this.discardKnightTool(player, knight);
  }

  _listHuitiemeSensTransferTargets(player, koKnight) {
    const out = [];
    if (player.active && player.active.instanceId !== koKnight.instanceId) {
      out.push({ knight: player.active, target: 'active' });
    }
    player.bench.forEach((k, i) => {
      if (k && k.instanceId !== koKnight.instanceId) {
        out.push({ knight: k, target: i });
      }
    });
    return out;
  }

  async startHuitiemeSensTransferOnKo(player, koKnight, maxMove) {
    const transferMax = Math.min(maxMove, koKnight.energies.length);
    const others = this._listHuitiemeSensTransferTargets(player, koKnight);
    if (transferMax <= 0 || !others.length) return;

    if (this.isAiControlled(player.index)) {
      this._applyAiHuitiemeSensTransfer(player, koKnight, transferMax, others);
      return;
    }

    await new Promise((resolve) => {
      this._huitiemeSensTransferResolve = resolve;
      this.state.pending = {
        type: 'pickHuitiemeSensTransfer',
        playerIndex: player.index,
        phase: 'count',
        koKnightInstanceId: koKnight.instanceId,
        koKnight,
        maxTransfer: transferMax,
        remaining: 0,
        transferred: 0,
        options: others.map((o) => ({
          instanceId: o.knight.instanceId,
          target: o.target,
        })),
      };
      this.feedback(`8e Sens : transférez jusqu'à ${transferMax} Énergie(s).`, 'energy');
      this.emit();
    });
  }

  _aiPickHuitiemeSensTarget(player, others) {
    let best = others[0];
    let bestScore = Infinity;
    for (const o of others) {
      const k = this.effects.getKnightByTarget(player, o.target);
      if (!k) continue;
      const energyCount = k.energies?.length ?? 0;
      const isBench = player.active?.instanceId === k.instanceId ? 0 : 1;
      const score = energyCount * 10 + isBench;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  _applyAiHuitiemeSensTransfer(player, koKnight, maxTransfer, others) {
    let moved = 0;
    while (koKnight.energies.length && moved < maxTransfer) {
      const pick = this._aiPickHuitiemeSensTarget(player, others);
      if (!pick) break;
      const target = this.effects.getKnightByTarget(player, pick.target);
      if (!target) break;
      const energy = koKnight.energies.pop();
      target.energies.push(energy);
      moved++;
    }
    if (moved > 0) {
      this.feedback(`${moved} énergie(s) transférée(s) vers d'autres Chevaliers.`, 'energy');
    }
  }

  resolvePickHuitiemeSensCount(playerIndex, count) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickHuitiemeSensTransfer' ||
      pending.playerIndex !== playerIndex ||
      pending.phase !== 'count'
    ) {
      return false;
    }
    const n = Math.max(0, Math.min(pending.maxTransfer, Number(count) || 0));
    if (n === 0) {
      this._finishHuitiemeSensTransfer(0);
      return true;
    }
    pending.phase = 'target';
    pending.remaining = n;
    pending.transferred = 0;
    this.feedback(`8e Sens : choisissez ${n} destinataire(s) (1 Énergie par clic).`, 'energy');
    this.emit();
    return true;
  }

  resolvePickHuitiemeSensTarget(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickHuitiemeSensTransfer' ||
      pending.playerIndex !== playerIndex ||
      pending.phase !== 'target' ||
      pending.remaining <= 0
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const koKnight =
      pending.koKnight ||
      resolveFieldKnight(p, { instanceId: pending.koKnightInstanceId });
    if (!koKnight?.energies?.length) {
      this._finishHuitiemeSensTransfer(pending.transferred || 0);
      return true;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const target = this.effects.getKnightByTarget(p, opt.target);
    if (!target || target.instanceId === koKnight.instanceId) return false;
    const energy = koKnight.energies.pop();
    target.energies.push(energy);
    pending.transferred = (pending.transferred || 0) + 1;
    pending.remaining -= 1;
    this.anim('attachEnergy', {
      cardId: energy.cardId,
      target: opt.target,
      playerIndex,
      fromDeck: false,
    });
    if (pending.remaining <= 0) {
      this._finishHuitiemeSensTransfer(pending.transferred);
      return true;
    }
    this.emit();
    return true;
  }

  _finishHuitiemeSensTransfer(moved) {
    this.state.pending = null;
    if (moved > 0) {
      this.feedback(`${moved} énergie(s) transférée(s) vers d'autres Chevaliers.`, 'energy');
    }
    this.emit();
    if (this._huitiemeSensTransferResolve) {
      const fn = this._huitiemeSensTransferResolve;
      this._huitiemeSensTransferResolve = null;
      fn();
    }
  }

  async playTool(playerIndex, handIndex, target) {
    if (!this.canPlayTool(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isToolCard(card.cardId)) return false;

    const def = getCardDef(card.cardId);
    const knight = this.effects.getKnightByTarget(p, target);
    if (!knight) return false;
    if (knight.attachedTool) {
      this.feedback('Ce chevalier a déjà un outil.', 'warn');
      return false;
    }

    const requiredFaction = def.restrictions?.faction;
    const knightDef = getCardDef(knight.cardId);
    if (!canAttachToolToKnight(def, knightDef)) {
      if (def.restrictions?.knightTypes?.length) {
        this.feedback(`${def.name} : cible incompatible.`, 'warn');
      } else if (def.restrictions?.excludeCardIds?.length) {
        this.feedback(`${def.name} : ne peut pas être attaché à ce Chevalier.`, 'warn');
      } else if (def.restrictions?.forbiddenKnightTypes?.length || def.restrictions?.forbiddenTags?.length) {
        this.feedback(`${def.name} : interdit sur ce type de Chevalier.`, 'warn');
      } else if (requiredFaction) {
        this.feedback(`${def.name} : réservé aux Chevaliers d'Athéna.`, 'warn');
      } else {
        this.feedback(`${def.name} : cible incompatible.`, 'warn');
      }
      return false;
    }
    if (requiredFaction && resolveKnightFaction(knightDef) !== requiredFaction) {
      this.feedback(`${def.name} : réservé aux Chevaliers d'Athéna.`, 'warn');
      return false;
    }

    const played = p.hand.splice(handIndex, 1)[0];
    knight.attachedTool = {
      cardId: def.id,
      name: def.name,
      instanceId: played.instanceId,
    };
    this.feedback(`${def.name} attaché à ${getCardDef(knight.cardId).name}.`, 'objet');

    const animMeta = def.animation;
    this.anim('outil', {
      cardId: def.id,
      target,
      playerIndex,
      fx: animMeta?.effect,
      duration: animMeta?.duration,
      steps: animMeta?.steps,
    });

    const effectDef = { ...def, effects: def.attachEffects || def.effects || [] };
    await this.effects.applyToolOnAttach(playerIndex, effectDef, target);
    this.effects.applyToolMaxHpBonus(knight);
    this.emit();
    return true;
  }

  async playSupporterCard(playerIndex, handIndex, target) {
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    const def = getCardDef(card.cardId);
    if (!def) return false;

    const needsActiveSurvie = def.effects?.some((e) => e.type === 'survie');
    const needsAcceleration = def.effects?.some((e) => e.type === 'acceleration_energie');
    const needsSacrificeTarget = def.effects?.some((e) => e.type === 'voluntary_sacrifice_knight');
    const skipsKnight = this.effects.supporterSkipsKnightTarget(def);
    if (needsSacrificeTarget && !this.effects.listVoluntarySacrificeOptions(playerIndex).length) {
      this.feedback(
        'Sacrifice : aucun chevalier éligible (Divinités et Chevaliers divins exclus).',
        'warn',
      );
      return false;
    }
    if (needsActiveSurvie) {
      if (!p.active || target !== 'active') {
        this.feedback('Sunrei : ciblez votre Chevalier actif.', 'warn');
        return false;
      }
    } else if (!needsAcceleration && !skipsKnight) {
      const knight = target === 'active' ? p.active : p.bench[target];
      if (!knight) return false;
    }

    const played = p.hand.splice(handIndex, 1)[0];
    p.discard.push(played);
    this.actions.supporter = true;
    this.feedback(`${def.name} joué (Supporter).`, 'supporter');
    this.anim('supporter', { cardId: def.id });
    await this.effects.resolveObjetEffects(playerIndex, def, target);
    if (this.effects.isAthenaOrDivineChildSupporter(def.id)) {
      this.effects.applyAiorosProtecteurIfEligible(playerIndex, { fromSupporter: true });
    }
    this.emit();
    return true;
  }

  async playObjetItemCard(playerIndex, handIndex, target) {
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    const def = getCardDef(card.cardId);
    if (!def) return false;

    const donDeVieEff = def.effects?.find((e) => e.type === 'don_de_vie');
    if (donDeVieEff) {
      if (!this.effects.listKnightsInPlay().length) {
        this.feedback('Don de Vie : aucun chevalier en jeu.', 'warn');
        return false;
      }
      const played = p.hand.splice(handIndex, 1)[0];
      p.discard.push(played);
      this.feedback(`${def.name} joué.`, 'objet');
      this.anim('objet', { cardId: def.id });
      this.effects.startDonDeVie(playerIndex, def, donDeVieEff);
      this.emit();
      return true;
    }

    const hasMoveEnergy = def.effects?.some((e) => e.type === 'move_energy_between_knights');
    const skipsKnight = this.effects.objetSkipsKnightTarget(def);

    if (def.effects?.some((e) => e.type === 'discard_hand_knight')) {
      if (!this.effects.listKnightsInHand(p).length) {
        this.feedback(`${def.name} : aucun Chevalier en main à défausser.`, 'warn');
        return false;
      }
    }
    if (def.effects?.some((e) => e.type === 'attach_energy_from_discard')) {
      if (!p.discard.some((c) => getCardDef(c.cardId)?.cardType === 'energie')) {
        this.feedback(`${def.name} : aucune Énergie en défausse.`, 'warn');
        return false;
      }
    }

    if (hasMoveEnergy) {
      const knight = target === 'active' ? p.active : p.bench[target];
      if (!knight || !knight.energies.length) return false;
    } else if (!skipsKnight) {
      const knight = target === 'active' ? p.active : p.bench[target];
      if (!knight) return false;
    }

    const played = p.hand.splice(handIndex, 1)[0];
    p.discard.push(played);
    this.feedback(`${def.name} joué.`, 'objet');
    this.anim('objet', { cardId: def.id });

    if (hasMoveEnergy) {
      this.state.pending = { type: 'moveEnergy', playerIndex, fromTarget: target };
      this.feedback('Harpe de Pandore : choisissez le chevalier destinataire.', 'objet');
      this.emit();
      return true;
    }

    await this.effects.resolveObjetEffects(playerIndex, def, target);
    this.emit();
    return true;
  }

  resolveDonDeViePick(playerIndex, instanceId) {
    return this.effects.resolveDonDeViePick(playerIndex, instanceId);
  }

  resolveDonDeVieAmount(playerIndex, amount) {
    return this.effects.resolveDonDeVieAmount(playerIndex, amount);
  }

  async resolveDeferredPrizesAtEndTurn() {
    for (let pi = 0; pi < this.state.players.length; pi++) {
      const p = this.state.players[pi];
      const count = p.modifiers.pendingPrizesAtEndTurn || 0;
      if (count <= 0) continue;
      p.modifiers.pendingPrizesAtEndTurn = 0;
      this.feedback(
        count > 1
          ? `${count} Récompenses (fin de tour).`
          : 'Récompense (fin de tour).',
        'prize',
      );
      const gameOver = await this.takePrizes(p, count);
      if (gameOver) {
        this.emit();
        return;
      }
    }
  }

  _detachKnightFromField(player, knight) {
    const result = detachKnightFromField(player, knight);
    if (result.removed) this.emit();
    return result;
  }

  resolveMoveEnergy(playerIndex, toTarget) {
    const pending = this.state.pending;
    if (pending?.type !== 'moveEnergy' || pending.playerIndex !== playerIndex) return false;

    const p = this.state.players[playerIndex];
    const fromKnight = this.effects.getKnightByTarget(p, pending.fromTarget);
    const toKnight = this.effects.getKnightByTarget(p, toTarget);
    if (!fromKnight || !toKnight || fromKnight === toKnight) return false;
    if (!fromKnight.energies.length) return false;

    const energy = fromKnight.energies.pop();
    toKnight.energies.push(energy);
    this.state.pending = null;
    this.feedback('Énergie déplacée (Harpe de Pandore).', 'energy');
    this.anim('attachEnergy', {
      cardId: energy.cardId,
      target: toTarget,
      playerIndex,
      fromDeck: false,
    });
    this.emit();
    return true;
  }

  pickTeleportSide(playerIndex, side) {
    const pending = this.state.pending;
    if (pending?.type !== 'teleportPickSide' || pending.playerIndex !== playerIndex) return false;
    const ft = pending.fromTalent;
    const p = this.state.players[playerIndex];
    const knight = ft ? resolveFieldKnight(p, { instanceId: ft.knightInstanceId }) : p.active;
    const def = getCardDef(knight?.cardId);
    const talent = def?.talent;
    this.state.pending = null;

    if (side === 'opponent') {
      if (
        !this.requestPickOpponentBenchActive(playerIndex, {
          sourceLabel: talent?.name || 'Téléportation',
          fromTalent: ft,
        })
      ) {
        this.feedback('Téléportation : aucun échange adverse possible.', 'warn');
        return false;
      }
      return true;
    }

    if (
      !this.requestPickOwnBenchActive(playerIndex, {
        sourceLabel: talent?.name || 'Téléportation',
        fromTalent: ft,
      })
    ) {
      this.feedback('Téléportation : aucun chevalier sur le banc.', 'warn');
      return false;
    }
    return true;
  }

  resolveDiscardEnergyFromHandForTalent(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (
      pending?.type !== 'discardEnergyFromHandForTalent' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isEnergie(card.cardId)) return false;

    p.discard.push(p.hand.splice(handIndex, 1)[0]);
    pending.remaining = (pending.remaining ?? pending.count) - 1;
    if (pending.remaining > 0) {
      this.feedback(`Défaussez encore ${pending.remaining} Énergie(s).`, 'talent');
      this.emit();
      return true;
    }

    const ft = pending.fromTalent;
    this.state.pending = null;
    const knight = ft ? resolveFieldKnight(p, { instanceId: ft.knightInstanceId }) : p.active;
    const def = getCardDef(knight?.cardId);
    const eff = def?.talent?.effects?.find((e) => e.type === 'teleport_once_per_turn');
    this.effects.continueTeleportAfterEnergyDiscard(playerIndex, knight, def?.talent, eff);
    this.emit();
    return true;
  }

  resolveDiscardForTalent(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'discardForTalent' || pending.playerIndex !== playerIndex) return false;
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card) return false;

    p.discard.push(p.hand.splice(handIndex, 1)[0]);
    pending.remaining -= 1;
    if (pending.remaining > 0) {
      this.feedback(`Défaussez encore ${pending.remaining} carte(s).`, 'talent');
      this.emit();
      return true;
    }

    const drawN = pending.thenDraw || 1;
    const ft = pending.fromTalent;
    this.state.pending = null;
    void this.draw(p, drawN).then(() => {
      if (ft) {
        const knight = resolveFieldKnight(p, { instanceId: ft.knightInstanceId });
        if (knight) knight.talentUsed = true;
      }
      this.feedback(`Savoir : pioche de ${drawN} carte(s).`, 'turn');
      this.emit();
    });
    return true;
  }

  switchActiveWithBench(playerIndex, benchIndex) {
    if (this.stadiumBlocksActiveSwap()) {
      this.feedback('Sanctuaire : aucun échange de Chevalier actif.', 'stadium');
      return false;
    }
    const p = this.state.players[playerIndex];
    if (!p.bench[benchIndex]) return false;
    const incoming = p.bench[benchIndex];
    if (this.effects.isKnightBenchNoSwap(incoming, { opponentSwap: false })) {
      this.feedback(`${getCardDef(incoming.cardId).name} ne peut pas être échangé.`, 'warn');
      return false;
    }
    if (!this.effects.canKnightBecomeActive(incoming)) {
      this.feedback('Aspros ne peut pas devenir actif sans Deuteros attaché.', 'warn');
      return false;
    }
    if (!p.active) {
      p.active = p.bench.splice(benchIndex, 1)[0];
      ensureUniqueFieldKnights(p);
      this.markKnightBecameActive(p.active);
      this.feedback(`${getCardDef(p.active.cardId).name} devient actif.`, 'play');
      this.emit();
      return true;
    }
    const oldActive = p.active;
    p.active = p.bench.splice(benchIndex, 1)[0];
    p.bench.push(oldActive);
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(p.active);
    this.onKnightSentToBench(oldActive);
    this.checkArgolPetrify(playerIndex, oldActive);
    this.feedback(`${getCardDef(p.active.cardId).name} devient actif (échange).`, 'objet');
    this.emit();
    return true;
  }

  swapActiveWithBenchIndex(playerIndex, benchIndex) {
    return this.switchActiveWithBench(playerIndex, benchIndex);
  }

  swapActiveWithBenchKnight(playerIndex, benchInstanceId, sourceLabel = '') {
    const p = this.state.players[playerIndex];
    const benchIndex = p.bench.findIndex((k) => k?.instanceId === benchInstanceId);
    if (benchIndex < 0) return false;
    const ok = this.switchActiveWithBench(playerIndex, benchIndex);
    if (ok && sourceLabel) {
      this.feedback(`${sourceLabel} : échange avec l'actif.`, 'talent');
    }
    return ok;
  }

  swapOpponentActiveWithBench(opponentIndex, benchIndex = 0) {
    if (this.stadiumBlocksSwapEffects()) {
      this.feedback('Sanctuaire : les effets d\'échange sont annulés.', 'stadium');
      return false;
    }
    const p = this.state.players[opponentIndex];
    if (!p.active || !p.bench[benchIndex]) return false;
    if (this.effects.isKnightBenchNoSwap(p.bench[benchIndex], { opponentSwap: true })) {
      this.feedback(`${getCardDef(p.bench[benchIndex].cardId).name} ne peut pas être échangé.`, 'warn');
      return false;
    }
    const oldActive = p.active;
    p.active = p.bench.splice(benchIndex, 1)[0];
    p.bench.push(oldActive);
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(p.active);
    this.onKnightSentToBench(oldActive);
    this.markKnightMovedToBenchByOpponentPower(oldActive, 1 - opponentIndex);
    this.checkArgolPetrify(opponentIndex, oldActive);
    this.feedback(`${getCardDef(p.active.cardId).name} devient actif adverse (échange).`, 'status');
    this.emit();
    return true;
  }

  /** Bench slots with a knight (sparse bench array). */
  filledBenchIndices(playerIndex, opts = {}) {
    const p = this.state.players[playerIndex];
    return p.bench
      .map((k, i) => {
        if (!k) return -1;
        if (opts.excludeNoSwap && this.effects.isKnightBenchNoSwap(k, { opponentSwap: true })) return -1;
        return i;
      })
      .filter((i) => i >= 0);
  }

  benchSwapChooserIndex(attackerIndex, meta = {}) {
    const opponentIndex = 1 - attackerIndex;
    const role = whoChoosesBenchSwap({
      description: meta.description,
      text: meta.cardText,
      effectText: meta.cardText,
      effects: meta.effect ? [meta.effect] : meta.effects,
    });
    return role === 'defender' ? opponentIndex : attackerIndex;
  }

  requestPickOpponentBenchActive(attackerIndex, meta = {}) {
    const opponentIndex = 1 - attackerIndex;
    const opp = this.state.players[opponentIndex];
    if (!opp.active || !opp.bench.some(Boolean)) return false;

    const indices = this.filledBenchIndices(opponentIndex, { excludeNoSwap: true });
    if (!indices.length) return false;

    const chooserPlayerIndex = this.benchSwapChooserIndex(attackerIndex, meta);

    if (indices.length === 1) {
      this.swapOpponentActiveWithBench(opponentIndex, indices[0]);
      this._completeTalentPickIfAny(meta);
      void this._continueAfterBenchPick(meta.resume);
      return true;
    }

    const chooserName = this.state.players[chooserPlayerIndex].name;
    this.state.pending = {
      type: 'pickOpponentBenchActive',
      chooserPlayerIndex,
      opponentIndex,
      attackerIndex,
      resume: meta.resume ?? null,
      sourceLabel: meta.sourceLabel || '',
      fromTalent: meta.fromTalent ?? null,
    };
    this.feedback(
      `${chooserName} : choisissez le chevalier de banc adverse qui devient actif.`,
      'status',
    );
    this.emit();
    return true;
  }

  requestPickOwnBenchActive(playerIndex, meta = {}) {
    if (this.stadiumBlocksActiveSwap()) {
      this.feedback('Sanctuaire : aucun échange de Chevalier actif.', 'stadium');
      void this._continueAfterBenchPick(meta.resume);
      return false;
    }
    const p = this.state.players[playerIndex];
    if (!p.active || !p.bench.some(Boolean)) return false;

    const indices = this.filledBenchIndices(playerIndex, { excludeNoSwap: true });
    if (!indices.length) return false;

    if (indices.length === 1) {
      this.switchActiveWithBench(playerIndex, indices[0]);
      this._completeTalentPickIfAny(meta);
      void this._continueAfterBenchPick(meta.resume);
      return true;
    }

    const chooserName = p.name;
    this.state.pending = {
      type: 'pickOwnBenchActive',
      chooserPlayerIndex: playerIndex,
      resume: meta.resume ?? null,
      sourceLabel: meta.sourceLabel || '',
      fromTalent: meta.fromTalent ?? null,
    };
    this.feedback(`${chooserName} : choisissez un chevalier de votre banc.`, 'status');
    this.emit();
    return true;
  }

  pickOpponentBenchActive(playerIndex, benchIndex) {
    const pending = this.state.pending;
    if (
      pending?.type !== 'pickOpponentBenchActive' ||
      pending.chooserPlayerIndex !== playerIndex
    ) {
      return false;
    }
    if (!this.swapOpponentActiveWithBench(pending.opponentIndex, benchIndex)) return false;

    this._completeTalentPickIfAny(pending);
    const resume = pending.resume;
    this.state.pending = null;
    void this._continueAfterBenchPick(resume);
    return true;
  }

  pickOwnBenchActive(playerIndex, benchIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'pickOwnBenchActive' || pending.chooserPlayerIndex !== playerIndex) {
      return false;
    }
    if (!this.switchActiveWithBench(playerIndex, benchIndex)) return false;

    this._completeTalentPickIfAny(pending);
    const resume = pending.resume;
    this.state.pending = null;
    void this._continueAfterBenchPick(resume);
    if (resume?.forceEndTurn) {
      this.state.forceEndTurnAfterTalent = true;
      void this.endTurn();
    }
    return true;
  }

  _completeTalentPickIfAny(meta) {
    const ft = meta?.fromTalent;
    if (!ft) return;
    const pl = this.state.players[ft.playerIndex];
    const k = resolveFieldKnight(pl, { instanceId: ft.knightInstanceId });
    if (k) k.talentUsed = true;
  }

  async _continueAfterBenchPick(resume) {
    if (!resume) {
      this._finishDeferredAttackAfterBenchPick();
      return;
    }
    if (resume.kind === 'objetEffects') {
      const def = getCardDef(resume.cardId);
      if (def) {
        await this.effects.resolveObjetEffects(resume.playerIndex, def, resume.target, resume.nextIndex);
      }
      if (!this.state.pending) this._finishDeferredAttackAfterBenchPick();
      return;
    }
    if (resume.kind === 'searchComboHand') {
      const filter = resume.energyFilter || { cardType: 'energie' };
      const count = resume.energyCount ?? 1;
      this.effects.searchDeckFilteredToHand(resume.playerIndex, filter, count);
      if (!this.state.pending) this._finishDeferredAttackAfterBenchPick();
      return;
    }
    this._finishDeferredAttackAfterBenchPick();
  }

  _finishDeferredAttackAfterBenchPick() {
    if (!this._pendingAttackFinish) return;
    const { playerIndex, atk, attackerName, fxMeta } = this._pendingAttackFinish;
    this._pendingAttackFinish = null;
    if (this.state.pending) return;
    if (fxMeta?.skipFinishAnim && !fxMeta?.damageDealt) {
      this.emit();
      this.scheduleAutoEndTurn(playerIndex);
      return;
    }
    void this.finishAttack(playerIndex, atk, attackerName, fxMeta?.damageDealt ?? 0, {
      ...(fxMeta || {}),
      skipVisual: !!fxMeta?.skipFinishAnim || !!fxMeta?.skipVisual,
      skipDamageApply: !!fxMeta?.skipDamageApply || !!fxMeta?.damageDealt,
    });
  }

  /** Cerbère cannot overwrite an unrelated pending (e.g. adversaire promote après KO). */
  _pendingBlocksCerbereAfterAttack(playerIndex) {
    const pending = this.state.pending;
    if (!pending) return false;
    if (pending.type === 'cerbereBenchBonus') return true;
    const actor = pending.chooserPlayerIndex ?? pending.playerIndex;
    if (
      pending.type === 'pickOpponentBenchActive' ||
      pending.type === 'pickOwnBenchActive' ||
      pending.type === 'revealOpponentHand' ||
      pending.type === 'pickDamageOpponentKnight' ||
      pending.type === 'pickBenchForDeckEnergy' ||
      pending.type === 'distributeDamage' ||
      pending.type === 'discardForAttack' ||
      pending.type === 'pickDisableOpponentAttack'
    ) {
      return actor === playerIndex;
    }
    if (pending.type === 'promoteActive' && pending.playerIndex !== playerIndex) return true;
    return false;
  }

  _tryApplyDeferredCerbere() {
    const playerIndex = this._deferCerbereForPlayerIndex;
    if (playerIndex == null || this.state.pending) return false;
    const p = this.state.players[playerIndex];
    if (!p?.modifiers?.nextAttackBenchBonus) {
      this._deferCerbereForPlayerIndex = null;
      return false;
    }
    this._deferCerbereForPlayerIndex = null;
    this.effects.applyCerbereBenchBonusAfterAttack(playerIndex);
    if (this.state.pending?.type === 'cerbereBenchBonus') {
      const atkName = p._currentAttackName;
      const attacks = getKnightAllAttacks(p.active);
      const atk = attacks.find((a) => a.name === atkName) ?? attacks[0];
      this._pendingAttackFinish = {
        playerIndex,
        atk,
        attackerName: getCardDef(p.active?.cardId)?.name || 'Chevalier',
        fxMeta: { skipFinishAnim: true, damageDealt: 0, attackerCardId: p.active?.cardId },
      };
    }
    this.emit();
    return true;
  }

  pickAiBenchSwapIndex(targetPlayerIndex) {
    const pending = this.state.pending;
    const preferWeakest = pending?.type === 'pickOpponentBenchActive';
    return this.pickAiBenchPromoteIndexFor(targetPlayerIndex, { preferWeakest });
  }

  pickAiBenchPromoteIndexFor(playerIndex, { preferWeakest = false } = {}) {
    const p = this.state.players[playerIndex];
    if (!p.bench.length) return 0;

    if (this.aiDifficulty === 'facile' && Math.random() < 0.35) {
      const filled = p.bench.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
      if (filled.length) return filled[Math.floor(Math.random() * filled.length)];
    }

    let best = 0;
    let bestScore = preferWeakest ? Infinity : -1;
    p.bench.forEach((k, i) => {
      if (!k) return;
      const score = this._aiScoreBenchKnight(k, playerIndex);
      const better = preferWeakest ? score < bestScore : score > bestScore;
      if (better) {
        bestScore = score;
        best = i;
      }
    });

    if (this.aiDifficulty === 'moyen' && this._aiRollSuboptimal() && p.bench.length > 1) {
      const ranked = p.bench
        .map((k, i) => (k ? { i, score: this._aiScoreBenchKnight(k, playerIndex) } : null))
        .filter(Boolean)
        .sort((a, b) => (preferWeakest ? a.score - b.score : b.score - a.score));
      if (ranked.length > 1) return ranked[1].i;
    }

    return best;
  }

  _aiRollSuboptimal() {
    if (this.aiDifficulty === 'facile') return Math.random() < 0.45;
    if (this.aiDifficulty === 'moyen') return Math.random() < 0.2;
    return false;
  }

  _aiAttackScoreCtx(playerIndex) {
    const opp = this.state.players[1 - playerIndex];
    const optimisticCoin = this.aiDifficulty === 'difficile';
    return {
      coin: optimisticCoin ? RULES.coin.heads : null,
      headsCount: optimisticCoin ? 1 : 0,
      opponentActive: opp.active,
    };
  }

  _aiScoreBenchKnight(knight, playerIndex) {
    if (!knight) return -1;
    const def = getCardDef(knight.cardId);
    let maxDmg = 0;
    const ctx = this._aiAttackScoreCtx(playerIndex);
    for (const atk of def?.attacks || []) {
      const dmg = this.effects.computeAttackDamage(playerIndex, atk, ctx);
      if (dmg > maxDmg) maxDmg = dmg;
    }
    return knight.currentHp + knight.energies.length * 8 + maxDmg * 0.4;
  }

  _aiScoreAttackOption(playerIndex, atk, attackIndex) {
    const opp = this.state.players[1 - playerIndex];
    const ctx = this._aiAttackScoreCtx(playerIndex);
    let damage = this.effects.computeAttackDamage(playerIndex, atk, ctx);
    let score = damage;
    if (opp.active && damage >= opp.active.currentHp) {
      score += this._aiIsHardTier() ? 80 : 40;
    }
    return { index: attackIndex, attack: atk, score, damage };
  }

  _aiPickAttack(playerIndex) {
    const attacks = this.getAttackOptions(playerIndex);
    const usable = attacks.filter((a) => a.canUse);
    if (!usable.length) return null;

    if (isLegendeTier(this.aiDifficulty)) {
      return pickLegendeAttack(this, playerIndex, this.aiCheatLevel);
    }

    if (this.aiDifficulty === 'expert') {
      return pickExpertAttack(this, playerIndex);
    }

    if (this.aiDifficulty === 'facile') {
      return usable[Math.floor(Math.random() * usable.length)];
    }

    const scored = usable.map((a) => ({
      ...a,
      ...this._aiScoreAttackOption(playerIndex, a.attack, a.index),
    }));
    scored.sort((a, b) => b.score - a.score);

    if (this.aiDifficulty === 'moyen') {
      if (this._aiRollSuboptimal() && scored.length > 1) {
        const pool = scored.slice(0, Math.min(3, scored.length));
        return pool[Math.floor(Math.random() * pool.length)];
      }
      if (Math.random() < 0.3 && scored.length > 1) return scored[1];
      return scored[0];
    }

    return scored[0];
  }

  _aiBestEnergyTarget(playerIndex) {
    const p = this.state.players[playerIndex];
    const opp = this.state.players[1 - playerIndex];
    const targets = [];
    if (p.active) targets.push('active');
    p.bench.forEach((k, i) => {
      if (k) targets.push(i);
    });
    if (!targets.length) return null;

    let bestTarget = targets[0];
    let bestScore = -1;
    for (const target of targets) {
      const knight = target === 'active' ? p.active : p.bench[target];
      if (!knight) continue;
      const def = getCardDef(knight.cardId);
      for (const atk of def?.attacks || []) {
        const cost = this.getEffectiveAttackCost(knight, atk);
        const canPay = countEnergiesForCost(knight, cost);
        const ctx = { coin: null, headsCount: 0, opponentActive: opp.active };
        const dmg = this.effects.computeAttackDamage(playerIndex, atk, ctx);
        const score = dmg + (canPay ? 25 : cost * 18);
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
    }
    return bestTarget;
  }

  _aiTryAttachEnergy(playerIndex) {
    if (this.actions.energy || !this.canAttachEnergy(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const eIdx = p.hand.findIndex((c) => isEnergie(c.cardId));
    if (eIdx < 0) return false;

    if (this.aiDifficulty === 'facile') {
      if (Math.random() < 0.4) return false;
      const target = p.active ? 'active' : 0;
      return this.attachEnergy(playerIndex, eIdx, target);
    }

    const target = this._aiBestEnergyTarget(playerIndex);
    if (target == null) return false;
    return this.attachEnergy(playerIndex, eIdx, target);
  }

  _aiTryRetreat(playerIndex) {
    if (!this.canRetreat(playerIndex)) return false;
    if (this.aiDifficulty === 'facile') return false;

    const p = this.state.players[playerIndex];
    const ratio = p.active.currentHp / Math.max(1, p.active.maxHp);
    const threshold = this._aiIsHardTier() ? 0.22 : 0.3;
    if (ratio > threshold) return false;

    const benchIdx = this.pickAiBenchPromoteIndexFor(playerIndex);
    const benchKnight = p.bench[benchIdx];
    if (!benchKnight) return false;

    const benchScore = this._aiScoreBenchKnight(benchKnight, playerIndex);
    const activeScore = this._aiScoreBenchKnight(p.active, playerIndex);
    const margin = this._aiIsHardTier() ? 1.1 : 1.2;
    if (benchScore < activeScore * margin) return false;

    return this.retreat(playerIndex, benchIdx);
  }

  async _aiTryPlayStadium(playerIndex) {
    if (!this.canPlayStadium(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const stIdx = p.hand.findIndex((c) => isStade(c.cardId));
    if (stIdx < 0) return false;

    if (this.aiDifficulty === 'facile' && Math.random() < 0.78) return false;
    if (this.aiDifficulty === 'moyen' && Math.random() < 0.55) return false;

    const st = this.state.stadium;
    if (st?.playerIndex === playerIndex) return false;
    return this.playStadium(playerIndex, stIdx);
  }

  async _aiTryPlayTool(playerIndex) {
    const p = this.state.players[playerIndex];
    if (p.modifiers.cantPlayCardNextTurn || !p.active) return false;
    const toolIdx = p.hand.findIndex((c) => isToolCard(c.cardId) && !p.active.attachedTool);
    if (toolIdx < 0) return false;

    if (this.aiDifficulty === 'facile' && Math.random() < 0.72) return false;
    if (this.aiDifficulty === 'moyen' && Math.random() < 0.5) return false;

    return this.playTool(playerIndex, toolIdx, 'active');
  }

  async _aiTryPlaySupporter(playerIndex) {
    if (!this.canPlaySupporter(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    if (!p.active) return false;

    const entIdx = p.hand.findIndex((c) => c.cardId === 'entrainement');
    if (entIdx >= 0) {
      if (this.aiDifficulty === 'facile' && Math.random() < 0.65) return false;
      if (this.aiDifficulty === 'moyen' && Math.random() < 0.35) return false;
      return await this.playObjet(playerIndex, entIdx, 'active');
    }

    if (!this._aiIsHardTier()) return false;

    const supIdx = p.hand.findIndex((c) => {
      if (!isSupporter(c.cardId)) return false;
      const def = getCardDef(c.cardId);
      if (def?.effects?.some((e) => e.type === 'voluntary_sacrifice_knight')) {
        return this.effects.listVoluntarySacrificeOptions(playerIndex).length > 0;
      }
      return true;
    });
    if (supIdx < 0) return false;
    return await this.playObjet(playerIndex, supIdx, 'active');
  }

  async _aiTryPlayBenchChevalier(playerIndex) {
    if (!this.canPlayChevalier(playerIndex)) return false;
    const p = this.state.players[playerIndex];

    const candidates = [];
    p.hand.forEach((c, i) => {
      if (!this.canPlayChevalier(playerIndex, i)) return;
      candidates.push({ idx: i, hp: getCardDef(c.cardId)?.hp || 0 });
    });
    if (!candidates.length) return false;

    const benchEmpty = p.bench.length === 0;
    const diff = this.aiDifficulty;

    if (benchEmpty) {
      if (diff === 'facile' && Math.random() >= 0.75) return false;
    } else if (diff === 'difficile' || this._aiIsExpertTier()) {
      /* always bench when a slot is free */
    } else if (diff === 'moyen') {
      if (Math.random() < 0.25) return false;
    } else if (Math.random() < 0.5) {
      return false;
    }

    candidates.sort((a, b) => b.hp - a.hp);
    return this.playChevalierToBench(playerIndex, candidates[0].idx);
  }

  _aiPickDamageOpponentKnightOption(playerIndex, options, amount = 20) {
    const opp = this.state.players[1 - playerIndex];
    let best = null;
    let bestScore = -Infinity;
    for (const opt of options || []) {
      const knight = opt.target === 'active' ? opp.active : opp.bench[opt.target];
      if (!knight || this.effects.isKnightBenchUntargetable(knight)) continue;
      let score = amount;
      if (knight.currentHp <= amount) {
        const def = getCardDef(knight.cardId);
        score += 80 + getPrizeCountForKnockout(def) * 20;
      } else {
        score += (amount / Math.max(1, knight.currentHp)) * 25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    return best;
  }

  _aiTryTalent(playerIndex) {
    if (this.state.pending) return false;
    const pick = pickAiTalent(this, playerIndex, this.aiDifficulty);
    if (!pick) return false;
    if (this.aiDifficulty === 'facile' && Math.random() < 0.35) return false;
    return this.useTalent(playerIndex, pick.zone);
  }

  _aiTryEvolve(playerIndex) {
    const p = this.state.players[playerIndex];
    const evoIdx = p.hand.findIndex((_, i) => this.canEvolveFromHand(playerIndex, i));
    if (evoIdx < 0) return false;

    if (this.aiDifficulty === 'facile' && Math.random() < 0.55) return false;

    const targets = ['active', ...p.bench.map((_, i) => i)];
    const legal = targets.filter((t) => this.canEvolve(playerIndex, evoIdx, t));
    if (!legal.length) return false;

    let best = legal[0];
    let bestGain = -Infinity;
    const evoDef = getCardDef(p.hand[evoIdx].cardId);
    for (const t of legal) {
      const knight = t === 'active' ? p.active : p.bench[t];
      const gain = (evoDef?.hp || 0) - (knight?.currentHp || 0);
      const onField = t === 'active' ? 5 : 0;
      if (gain + onField > bestGain) {
        bestGain = gain + onField;
        best = t;
      }
    }
    return this.evolveCosmo(playerIndex, evoIdx, best);
  }

  resolveAiPickOpponentBenchActive() {
    const pending = this.state.pending;
    const chooser = pending?.chooserPlayerIndex;
    if (pending?.type !== 'pickOpponentBenchActive' || chooser == null) {
      return false;
    }
    const idx = this.pickAiBenchSwapIndex(pending.opponentIndex);
    return this.pickOpponentBenchActive(chooser, idx);
  }

  resolveAiPickOwnBenchActive() {
    const pending = this.state.pending;
    const chooser = pending?.chooserPlayerIndex;
    if (pending?.type !== 'pickOwnBenchActive' || chooser == null) {
      return false;
    }
    const idx = this.pickAiBenchSwapIndex(chooser);
    return this.pickOwnBenchActive(chooser, idx);
  }

  markKnightBecameActive(knight) {
    if (!knight) return;
    knight.modifiers = knight.modifiers || {};
    this.clearKnightMovedToBenchByOpponentPower(knight);
    knight.modifiers.becameActiveTurnCount = this.state.turnCount ?? 0;
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].active?.instanceId === knight.instanceId) {
        void this.effects.onKnightBecameActive(i, knight);
        break;
      }
    }
  }

  buildFreshFieldKnight(cardInstance) {
    return createFieldKnight(cardInstance);
  }

  feedbackJulianPoseidonStackBlocked(def, player) {
    if (!isJulianPoseidonStackHandCard(def)) return;
    if (countPoseidonFamilyInPlay(player) > 0) {
      this.feedback('Une carte famille Poséidon est déjà en jeu de votre côté.', 'warn');
      return;
    }
    if (def?.id === POSEIDON_CARD_IDS.GOD) {
      this.feedback('Poséidon, Dieu des Océans ne peut être joué qu\'avec Julian Solo en main.', 'warn');
      return;
    }
    this.feedback('Julian Solo requiert Poséidon, Dieu des Océans en main.', 'warn');
  }

  /** Julian Solo + Poséidon Dieu des Océans depuis la main (clic sur l'une ou l'autre). */
  setupJulianStackFromHand(playerIndex, triggerHandIndex) {
    const p = this.state.players[playerIndex];
    const triggerCard = p.hand[triggerHandIndex];
    const triggerDef = getCardDef(triggerCard?.cardId);
    if (!isJulianPoseidonStackHandCard(triggerDef)) return null;

    const julianHandIndex = p.hand.findIndex(
      (c) => (getCardDef(c.cardId)?.id || c.cardId) === POSEIDON_CARD_IDS.JULIAN_SOLO,
    );
    const poseidonHandIndex = p.hand.findIndex(
      (c) => (getCardDef(c.cardId)?.id || c.cardId) === POSEIDON_CARD_IDS.GOD,
    );
    if (julianHandIndex < 0 || poseidonHandIndex < 0) return null;

    let julianRemoved;
    let poseidonRemoved;
    if (julianHandIndex > poseidonHandIndex) {
      [julianRemoved] = p.hand.splice(julianHandIndex, 1);
      [poseidonRemoved] = p.hand.splice(poseidonHandIndex, 1);
    } else if (julianHandIndex < poseidonHandIndex) {
      [poseidonRemoved] = p.hand.splice(poseidonHandIndex, 1);
      [julianRemoved] = p.hand.splice(julianHandIndex, 1);
    } else {
      return null;
    }

    const fk = createFieldKnight(julianRemoved);
    fk.underCard = {
      cardId: poseidonRemoved.cardId,
      instanceId: poseidonRemoved.instanceId,
    };
    return fk;
  }

  async triggerOnEnterKnight(playerIndex, knight) {
    const def = getCardDef(knight.cardId);
    await this.effects.applyOnEnterKnight(playerIndex, knight, def);
    const eff = def?.talent?.effects?.find((e) => e.type === 'on_enter_discard_hand_draw');
    if (!eff) return;
    const p = this.state.players[playerIndex];
    if (!p.hand.length) return;

    if (eff.optional) {
      if (!this.isAiControlled(playerIndex)) {
        this.state.pending = {
          type: 'optionalDiscardHandDraw',
          playerIndex,
          draw: eff.draw || 6,
          sourceLabel: def.name,
        };
        this.feedback(`${def.name} : défausser toute la main et piocher ${eff.draw || 6} ?`, 'talent');
        this.emit();
        return;
      }
      if (this._aiShouldOptionalDiscardHandDraw(p)) {
        await this._applyDiscardHandDraw(playerIndex, eff.draw || 6, def.name);
      }
      return;
    }

    await this._applyDiscardHandDraw(playerIndex, eff.draw || 6, def.name);
  }

  _aiShouldOptionalDiscardHandDraw(player) {
    if (player.hand.length >= 4) return true;
    if (this._aiIsHardTier?.()) return player.hand.length >= 2;
    return player.hand.length >= 3 && Math.random() < 0.6;
  }

  async _applyDiscardHandDraw(playerIndex, drawCount, knightName) {
    const p = this.state.players[playerIndex];
    while (p.hand.length) {
      p.discard.push(p.hand.pop());
    }
    this.emit();
    await this.draw(p, drawCount);
    this.feedback(`${knightName} : défausse de la main, pioche de ${drawCount}.`, 'talent');
  }

  resolveOptionalDiscardHandDraw(playerIndex, accept) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'optionalDiscardHandDraw' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const drawCount = pending.draw || 6;
    const label = pending.sourceLabel || 'Analyse de la situation';
    this.state.pending = null;
    if (!accept) {
      this.feedback(`${label} : main conservée.`, 'talent');
      this.emit();
      return true;
    }
    void this._applyDiscardHandDraw(playerIndex, drawCount, label);
    return true;
  }

  resolveAiSearchDeck(playerIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'searchDeck' || pending.playerIndex !== playerIndex) return false;
    const options = pending.options || [];
    if (!options.length) {
      this.state.pending = null;
      this.emit();
      return true;
    }
    const pick =
      this.aiCheatLevel !== 'none' || this._aiIsHardTier()
        ? pickDeckSearchOption(this, playerIndex, options, this.aiCheatLevel)
        : options[0];
    return this.resolveSearchDeck(playerIndex, (pick ?? options[0]).instanceId);
  }

  resolveAiPickDisableOpponentAttack(playerIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'pickDisableOpponentAttack' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const attackName = pending.attackNames?.[0];
    if (!attackName) {
      this.state.pending = null;
      this.emit();
      return true;
    }
    return this.resolvePickDisableOpponentAttack(playerIndex, attackName);
  }

  resolveRevealOpponentHandShuffle(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'revealOpponentHand' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const opp = this.state.players[pending.opponentIndex ?? 1 - playerIndex];
    const idx = opp.hand.findIndex((c) => c.instanceId === instanceId);
    if (idx < 0) return false;
    const [card] = opp.hand.splice(idx, 1);
    opp.deck.push(card);
    shuffleInPlace(opp.deck);
    const name = getCardDef(card.cardId)?.name || card.cardId;
    this.state.pending = null;
    this.feedback(`Télépathie : ${name} mélangée dans le deck adverse.`, 'attack');
    this.emit();
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  /** Talent Pétrifié — Argol de Persée */
  checkArgolPetrify(swapPlayerIndex, knightThatLeftActive) {
    if (this.state.turn !== swapPlayerIndex) return;
    if (this.knightMovedToBenchByOpponentPower(knightThatLeftActive)) {
      this.clearKnightMovedToBenchByOpponentPower(knightThatLeftActive);
      return;
    }
    const argolOwner = this.state.players[1 - swapPlayerIndex];
    if (argolOwner.active?.cardId !== 'argol-de-persee' || !knightThatLeftActive) return;

    const owner = this.state.players[swapPlayerIndex];
    const onBench = owner.bench.find((k) => k.instanceId === knightThatLeftActive.instanceId);
    const target = onBench || (owner.active?.instanceId === knightThatLeftActive.instanceId ? owner.active : null);
    if (!target) return;

    this.feedback('Pétrifié : le chevalier adverse est pétrifié (KO) !', 'talent');
    this.damageKnight(owner, target, target.currentHp, 'talent', argolOwner.index, argolOwner.active.cardId);
  }

  canPlayChevalier(playerIndex = this.state.turn, handIndex = null) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    const p = this.state.players[playerIndex];
    if (p.modifiers.cantPlayCardNextTurn) return false;
    if (p.bench.length >= RULES.maxBench) return false;
    if (handIndex == null) {
      return p.hand.some((c) => canPlayKnightCardFromHand(c.cardId, p));
    }
    const card = p.hand[handIndex];
    if (!card) return false;
    if (p.modifiers.cantReplayCardIds?.includes(card.cardId)) {
      return false;
    }
    return canPlayKnightCardFromHand(card.cardId, p);
  }

  canAttackThisTurn(playerIndex = this.state.turn) {
    if (this.isAttackTestMode) return true;
    if (!RULES.firstPlayerNoAttack) return true;
    const first = this.state.firstPlayer ?? 0;
    return !(playerIndex === first && (this.state.turnCount || 0) === 0);
  }

  async playChevalierToBench(playerIndex, handIndex) {
    const p = this.state.players[playerIndex];
    if (!this.canPlayChevalier(playerIndex, handIndex)) {
      const card = p?.hand[handIndex];
      const def = card ? getCardDef(card.cardId) : null;
      if (card && p.modifiers.cantReplayCardIds?.includes(card.cardId)) {
        this.feedback('Ce chevalier ne peut pas être remis en jeu ce tour.', 'warn');
      } else if (isJulianPoseidonStackHandCard(def)) {
        this.feedbackJulianPoseidonStackBlocked(def, p);
      } else if (card && isChevalier(card.cardId) && !isBaseChevalier(card.cardId)) {
        this.feedback('Seuls les chevaliers de base peuvent être placés sur le banc.', 'warn');
      }
      return false;
    }
    const card = p.hand[handIndex];
    const def = getCardDef(card.cardId);
    let fk;
    if (isJulianPoseidonStackHandCard(def)) {
      fk = this.setupJulianStackFromHand(playerIndex, handIndex);
      if (!fk) {
        this.feedbackJulianPoseidonStackBlocked(def, p);
        return false;
      }
    } else {
      p.hand.splice(handIndex, 1);
      fk = createFieldKnight(card);
    }

    p.bench.push(fk);
    ensureUniqueFieldKnights(p);
    this.maybeTriggerTalent(p, fk);
    await this.triggerOnEnterKnight(playerIndex, fk);
    this.feedback(`${def.name} envoyé sur le banc (${p.bench.length}/${RULES.maxBench}).`, 'play');
    this.anim('playCard', { from: 'hand', cardId: card.cardId });
    this.emit();
    return true;
  }

  evolveCosmo(playerIndex, handIndex, target) {
    if (!this.canEvolve(playerIndex, handIndex, target)) {
      if (!this.canEvolveThisTurn(playerIndex)) {
        this.feedback('Premier tour : évolution impossible.', 'warn');
        return false;
      }
      const p = this.state.players[playerIndex];
      const evoCard = p.hand[handIndex];
      const knight = target === 'active' ? p.active : p.bench[target];
      const evoDef = evoCard ? getCardDef(evoCard.cardId) : null;
      if (evoCard && knight && matchesEvolutionTarget(knight, evoCard.cardId)) {
        if (requiresEvolutionTool(evoDef)) {
          const toolId = evoDef.evolutionRequiresTool || RULES.evolution?.divineRequiresTool;
          if (toolId && !knightHasTool(knight, toolId)) {
            const toolName = getEvolutionRequiredToolName(evoDef) || getCardDef(toolId)?.name || 'outil requis';
            this.feedback(
              `Évolution impossible : ${toolName} doit être attaché à la cible.`,
              'warn',
            );
            return false;
          }
        }
        if (!this.isKnightEvolutionEligible(playerIndex, knight)) {
          this.feedback(
            'Évolution impossible : ce chevalier doit être en jeu depuis le début de votre tour.',
            'warn',
          );
          return false;
        }
      }
      return false;
    }
    const p = this.state.players[playerIndex];
    const evoCard = p.hand[handIndex];
    const evoDef = getCardDef(evoCard.cardId);
    const knight = target === 'active' ? p.active : p.bench[target];

    p.hand.splice(handIndex, 1);
    const damage = knight.maxHp - knight.currentHp;
    const fk = createFieldKnight(evoCard);
    if (RULES.evolution.keepDamage) {
      fk.currentHp = Math.max(1, fk.maxHp - damage);
    }
    fk.energies = [...knight.energies];
    const hadPoison = knight.statuses.includes('poisoned');
    const hadConfused = knight.statuses.includes('confused');
    fk.statuses = knight.statuses.filter((s) => s !== 'poisoned' && s !== 'confused');
    fk.talentUsed = knight.talentUsed;
    fk.modifiers = { ...knight.modifiers };
    fk.attachedTool = knight.attachedTool ? { ...knight.attachedTool } : null;

    if (target === 'active') {
      p.active = fk;
      this.markKnightBecameActive(fk);
    } else p.bench[target] = fk;
    ensureUniqueFieldKnights(p);
    void this.triggerOnEnterKnight(playerIndex, fk);

    const evoLabel =
      evoDef.stage === 'chevalier-divin'
        ? 'armure divine'
        : evoDef.stage === 'evolution'
          ? 'évolution'
          : RULES.vocabulary?.cosmoArdent || 'cosmo ardent';
    this.feedback(`Évolution en ${evoDef.name} (${evoLabel}) !`, 'evolution');
    if (hadPoison) {
      this.feedback('Empoisonné : soigné (évolution).', 'status');
      this.anim('status', { status: 'poisoned', removed: true });
    }
    if (hadConfused) {
      this.feedback('Confus : soigné (évolution).', 'status');
      this.anim('status', { status: 'confused', removed: true });
    }
    this.anim('evolution', { cardId: evoCard.cardId });
    this.emit();
    return true;
  }

  /** Armure des Gémeaux — cherche l'évolution dans le deck et fait évoluer l'actif. */
  evolveActiveFromDeckSearch(playerIndex, evolveCardId) {
    if (!this.canEvolveThisTurn(playerIndex)) {
      this.feedback('Premier tour : évolution impossible.', 'warn');
      return false;
    }
    const p = this.state.players[playerIndex];
    const active = p.active;
    if (!active) {
      this.feedback('Aucun chevalier actif à faire évoluer.', 'warn');
      return false;
    }
    const activeDef = getCardDef(active.cardId);
    const evoDef = getCardDef(evolveCardId);
    if (!evoDef) {
      this.feedback('Carte d\'évolution introuvable.', 'warn');
      return false;
    }
    if (evoDef.evolvesFrom && !matchesEvolution(active.cardId, evolveCardId)) {
      const fromLabel = formatEvolvesFrom(evoDef);
      this.feedback(`Évolution réservée à ${fromLabel}.`, 'warn');
      return false;
    }
    const deckIdx = p.deck.findIndex((c) => getCardDef(c.cardId)?.id === evolveCardId || c.cardId === evolveCardId);
    if (deckIdx < 0) {
      this.feedback(`${evoDef.name} introuvable dans le deck.`, 'warn');
      return false;
    }
    const [evoCard] = p.deck.splice(deckIdx, 1);
    const damage = active.maxHp - active.currentHp;
    const fk = createFieldKnight(evoCard);
    if (RULES.evolution.keepDamage) {
      fk.currentHp = Math.max(1, fk.maxHp - damage);
    }
    fk.energies = [...active.energies];
    const hadPoison = active.statuses.includes('poisoned');
    const hadConfused = active.statuses.includes('confused');
    fk.statuses = active.statuses.filter((s) => s !== 'poisoned' && s !== 'confused');
    fk.talentUsed = active.talentUsed;
    fk.modifiers = { ...active.modifiers };
    fk.attackedLastTurn = !!active.attackedLastTurn;
    fk.attackedThisTurn = !!active.attackedThisTurn;
    fk.attachedTool = active.attachedTool ? { ...active.attachedTool } : null;
    p.active = fk;
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(fk);
    void this.triggerOnEnterKnight(playerIndex, fk);
    this.feedback(`Évolution en ${evoDef.name} !`, 'evolution');
    if (hadPoison) {
      this.feedback('Empoisonné : soigné (évolution).', 'status');
      this.anim('status', { status: 'poisoned', removed: true });
    }
    if (hadConfused) {
      this.feedback('Confus : soigné (évolution).', 'status');
      this.anim('status', { status: 'confused', removed: true });
    }
    this.anim('evolution', { cardId: evoCard.cardId });
    this.emit();
    return true;
  }

  maybeTriggerTalent(player, knight) {
    const def = getCardDef(knight.cardId);
    if (!def?.talent || knight.talentUsed) return;
    if (this.effects.isTalentSilenced(knight, player.index)) return;
    const effects = def.talent.effects || [];
    if (effects.some((e) => ACTIVATED_TALENT_EFFECT_TYPES.includes(e.type))) return;
    const passiveOnly = [
      'attach_energy_if_opponent_played_supporter',
      'bench_silence_talents',
      'bench_bonus_active_attack_damage',
      'turn_start_thaw_recover_energy',
      'bench_reduce_damage',
      'return_prize_on_knockout',
      'heal_on_ko_opponent_active',
      'immune_status',
      'immune_heal_opponent',
      'immune_all_heal',
      'bench_bonus_melee_ally',
      'min_hp_threshold',
      'petrify_on_opponent_swap',
      'on_play_damage',
      'on_enter_heal_self',
      'on_enter_discard_hand_draw',
      'athena_or_divine_child_synergy',
      'redirect_damage_from_athena_to_self',
      'ally_attack_bonus_by_raw_types',
      'on_enter_energy_discard_attach_allies',
      'on_play_damage_all_except_self',
      'turn_start_recover_discard',
      'turn_start_manigoldo',
      'immune_all_status',
      'immune_all_status_if_hades_on_bench',
      'solo_combat_modifiers',
      'bonus_prize_when_knocked_out',
      'silence_opponent_active_talent',
      'on_play_draw',
      'on_play_swap_with_active',
      'poison_becomes_heal',
      'bench_untargetable',
      'bench_no_swap',
      'opponent_attack_bonus_if_opponent_status',
      'zelos_coward_prize_modifiers',
      'requires_attached_tool_to_active',
      'end_turn_damage_all_knights',
      'bench_allies_damage_end_turn',
    ];
    if (effects.some((e) => passiveOnly.includes(e.type))) return;
    knight.talentUsed = true;
  }

  _knightAtZone(player, zone) {
    if (zone === 'active') return player.active;
    if (typeof zone === 'number') return player.bench[zone];
    return null;
  }

  hasActivatableTalent(talent) {
    return (talent?.effects || []).some((e) => ACTIVATED_TALENT_EFFECT_TYPES.includes(e.type));
  }

  canUseTalentOnKnight(playerIndex, knight, talent) {
    if (!knight || !talent) return false;
    if (knight.talentUsed) return false;
    if (this.effects.isTalentSilenced(knight, playerIndex)) return false;
    const player = this.state.players[playerIndex];
    const effects = talent.effects || [];

    for (const eff of effects) {
      if (!ACTIVATED_TALENT_EFFECT_TYPES.includes(eff.type)) continue;
      if (eff.type === 'teleport_once_per_turn') {
        const opp = this.state.players[1 - playerIndex];
        if (eff.discardEnergyFromHand) {
          const hasEnergy = player.hand.some((c) => getCardDef(c.cardId)?.cardType === 'energie');
          if (!hasEnergy) continue;
        }
        const canOwn = player.bench.some(Boolean);
        const canOpp = !!(opp.active && opp.bench.some(Boolean));
        if (eff.swapScope === 'own_or_opponent' && (canOwn || canOpp)) return true;
        if (canOwn) return true;
        continue;
      }
      if (eff.type === 'discard_draw') {
        if (player.hand.length >= (eff.discard || 1)) return true;
        continue;
      }
      if (eff.type === 'swap_with_card_id') {
        if (eff.hpThreshold != null && knight.currentHp > eff.hpThreshold) continue;
        if (player.bench.some((k) => k?.cardId === eff.cardId)) return true;
        continue;
      }
      if (eff.type === 'transfer_energy_once_per_turn') {
        const hasSource =
          (player.active?.energies?.length > 0) ||
          player.bench.some((k) => k?.energies?.length > 0);
        if (hasSource && (player.active || player.bench.length)) return true;
        continue;
      }
      if (eff.type === 'melee_bonus_one_ally_turn') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (player.active || player.bench.length) return true;
        continue;
      }
      if (eff.type === 'swap_active_with_self_if_card_ids') {
        const active = player.active;
        if (!active || !player.bench.includes(knight)) continue;
        const ids = eff.cardIds || [];
        const activeId = getCardDef(active.cardId)?.id || active.cardId;
        if (ids.includes(activeId) || ids.includes(active.cardId)) return true;
        continue;
      }
      if (eff.type === 'recover_energy_from_discard') {
        const hasEnergy = player.discard.some((c) => getCardDef(c.cardId)?.cardType === 'energie');
        const benchTargets = player.bench.filter((k) => {
          if (!k) return false;
          const f = eff.attachFilter;
          return f ? this.effects.matchesDeckFilter(k.cardId, f) : true;
        });
        if (hasEnergy && benchTargets.length) return true;
        continue;
      }
      if (eff.type === 'search_deck') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        const searchable = player.deck.filter((c) =>
          this.effects.matchesDeckFilter(c.cardId, eff.filter),
        );
        if (searchable.length) return true;
        continue;
      }
      if (eff.type === 'search_deck_energy' && eff.attachTo === 'self') {
        if (eff.hpBelow != null && knight.currentHp >= eff.hpBelow) continue;
        const hasEnergy = player.deck.some((c) => getCardDef(c.cardId)?.cardType === 'energie');
        if (hasEnergy) return true;
        continue;
      }
      if (eff.type === 'draw_until_hand_size') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        const targetSize = eff.size ?? 4;
        if (player.hand.length < targetSize && player.deck.length) return true;
        continue;
      }
      if (eff.type === 'athena_sacrifice') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if ((knight.energies?.length ?? 0) >= (eff.minEnergy ?? 2)) return true;
        continue;
      }
      if (eff.type === 'bench_damage_once_per_turn') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        const opp = this.state.players[1 - playerIndex];
        if (opp.bench.length) return true;
        continue;
      }
      if (eff.type === 'discard_energy_confuse_opponent') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (knight.energies?.length > 0) return true;
        continue;
      }
      if (eff.type === 'discard_energy_poison_opponent') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (knight.energies?.length > 0) return true;
        continue;
      }
      if (eff.type === 'discard_energy_opponent_energy') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (knight.energies?.length > 0) return true;
        continue;
      }
      if (eff.type === 'look_top_deck') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (player.deck.length) return true;
        continue;
      }
      if (eff.type === 'bench_heal_once_per_turn') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (player.bench.includes(knight) && player.bench.some(Boolean)) return true;
        continue;
      }
      if (eff.type === 'copy_bench_attack_turn') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (player.active?.instanceId !== knight.instanceId) continue;
        if ((knight.energies?.length ?? 0) < (eff.discardEnergy || 1)) continue;
        const hasCopy = player.bench.some((bk) => {
          if (!bk) return false;
          return (getCardDef(bk.cardId)?.attacks || []).some(
            (a) => !/corps\s*à\s*corps/i.test(a.name) && a.name !== eff.excludeAttackName,
          );
        });
        if (hasCopy) return true;
        continue;
      }
      if (eff.type === 'kanon_submarine_sanctuary_once') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (!this.effects.isTalentSilenced(knight, playerIndex)) return true;
        continue;
      }
      if (eff.type === 'bench_return_to_hand') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (!player.bench.includes(knight)) continue;
        if (!this.isKnightEvolutionEligible(playerIndex, knight)) continue;
        return true;
      }
      if (eff.type === 'bench_can_attack_end_turn') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (!player.bench.includes(knight)) continue;
        return true;
      }
      if (eff.type === 'transfer_energy_to_hades_bench') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        const hadesIds = eff.hadesCardIds || ['hades-corps-humain', 'hades-vrai-corps'];
        const hasHades = player.bench.some((k) => {
          if (!k) return false;
          const id = getCardDef(k.cardId)?.id || k.cardId;
          return hadesIds.includes(id);
        });
        const sourcePool = eff.sourceSelfOnly ? [knight] : [player.active, ...player.bench];
        const hasEnergy = sourcePool.some((k) => k?.energies?.length > 0);
        if (hasHades && hasEnergy) return true;
        continue;
      }
      if (eff.type === 'swap_active_with_bench_tag') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (eff.fromBenchOnly && player.active?.instanceId === knight.instanceId) continue;
        const tags = eff.tags || ['spectre', 'juge'];
        const hasTagBench = player.bench.some(
          (k) => k && tags.some((t) => knightHasTag(getCardDef(k.cardId), t)),
        );
        if (player.active && hasTagBench) return true;
        continue;
      }
      if (eff.type === 'discard_hand_silence_opponent_talent') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        if (player.hand.length) return true;
        continue;
      }
      if (eff.type === 'turn_start_heal_other_friendly') {
        if (eff.oncePerTurn && knight.modifiers.talentOnceThisTurn) continue;
        const hasOtherAlly =
          (player.active && player.active.instanceId !== knight.instanceId) ||
          player.bench.some((k) => k && k.instanceId !== knight.instanceId);
        if (hasOtherAlly) return true;
        continue;
      }
    }
    return false;
  }

  getTalentOptions(playerIndex = this.state.turn) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex || this.state.winner) {
      return [];
    }
    const p = this.state.players[playerIndex];
    const out = [];
    const add = (knight, zone) => {
      if (!knight) return;
      const def = getCardDef(knight.cardId);
      if (!def?.talent || !this.hasActivatableTalent(def.talent)) return;
      out.push({
        zone,
        name: def.talent.name || 'Talent',
        canUse: this.canUseTalentOnKnight(playerIndex, knight, def.talent),
      });
    };
    add(p.active, 'active');
    p.bench.forEach((k, i) => add(k, i));
    return out;
  }

  canUseTalent(playerIndex = this.state.turn, zone = 'active') {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (this.state.pending) return false;
    const p = this.state.players[playerIndex];
    const knight = this._knightAtZone(p, zone);
    const def = getCardDef(knight?.cardId);
    if (!knight || !def?.talent) return false;
    return this.canUseTalentOnKnight(playerIndex, knight, def.talent);
  }

  useTalent(playerIndex, zone = 'active') {
    const p = this.state.players[playerIndex];
    const knight = this._knightAtZone(p, zone);
    const def = getCardDef(knight?.cardId);
    if (!this.canUseTalent(playerIndex, zone)) {
      if (knight && def?.talent && this.effects.isTalentSilenced(knight, playerIndex)) {
        this.feedback('Talent neutralisé (Mime de Veneta).', 'warn');
      }
      return false;
    }
    const talent = def.talent;
    const effects = talent.effects || [];

    if (effects.some((e) => e.type === 'teleport_once_per_turn')) {
      this.effects.resolveTeleportTalent(playerIndex, knight, talent);
      return true;
    }
    if (effects.some((e) => e.type === 'discard_draw')) {
      this.effects.resolveTalentDiscardDraw(playerIndex, knight, talent);
      return true;
    }
    if (effects.some((e) => e.type === 'swap_with_card_id')) {
      this.effects.resolveSwapWithCardId(playerIndex, knight, talent);
      return true;
    }
    if (effects.some((e) => e.type === 'transfer_energy_once_per_turn')) {
      return this.effects.resolveTransferEnergyTalent(playerIndex, knight);
    }
    if (effects.some((e) => e.type === 'melee_bonus_one_ally_turn')) {
      return this.effects.resolveMeleeBonusOneAllyTalent(playerIndex, knight, talent);
    }
    if (effects.some((e) => e.type === 'swap_active_with_self_if_card_ids')) {
      return this.effects.resolveAiorSwapTalent(playerIndex, knight, talent);
    }
    if (effects.some((e) => e.type === 'recover_energy_from_discard')) {
      return this.effects.resolveRecoverEnergyFromDiscard(p, knight, talent);
    }
    if (effects.some((e) => e.type === 'search_deck')) {
      const searchEff = effects.find((e) => e.type === 'search_deck');
      const oncePerTurn = !!searchEff?.oncePerTurn;
      if (oncePerTurn) knight.modifiers.talentOnceThisTurn = true;
      this.effects.resolveTalentSearch(p, knight, talent, { skipTalentUsed: oncePerTurn });
      return true;
    }
    const searchEnergy = effects.find((e) => e.type === 'search_deck_energy' && e.attachTo === 'self');
    if (searchEnergy) {
      if (searchEnergy.hpBelow != null && knight.currentHp >= searchEnergy.hpBelow) {
        this.feedback(`Talent : moins de ${searchEnergy.hpBelow} PV requis.`, 'warn');
        return false;
      }
      const targetLabel = zone === 'active' ? 'active' : zone;
      this.effects.searchDeckEnergy(playerIndex, searchEnergy.count || 1, knight, targetLabel);
      knight.talentUsed = true;
      return true;
    }
    const drawUntil = effects.find((e) => e.type === 'draw_until_hand_size');
    if (drawUntil) {
      return this.effects.resolveDrawUntilHandSizeTalent(playerIndex, knight, talent, drawUntil);
    }
    const sacrifice = effects.find((e) => e.type === 'athena_sacrifice');
    if (sacrifice) {
      if (sacrifice.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Sacrifice déjà utilisé ce tour.', 'warn');
        return false;
      }
      const ok = this.effects.resolveAthenaSacrifice(playerIndex, knight, sacrifice);
      if (ok && this.state.forceEndTurnAfterTalent) {
        this.state.forceEndTurnAfterTalent = false;
        void this.endTurn();
      }
      return ok;
    }
    const benchDmg = effects.find((e) => e.type === 'bench_damage_once_per_turn');
    if (benchDmg) {
      if (benchDmg.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveBenchDamageTalent(playerIndex, knight, benchDmg);
    }
    const hypnosSleep = effects.find((e) => e.type === 'discard_energy_confuse_opponent');
    if (hypnosSleep) {
      if (hypnosSleep.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveHypnosSleepTalent(playerIndex, knight, hypnosSleep);
    }
    const empoisonneur = effects.find((e) => e.type === 'discard_energy_poison_opponent');
    if (empoisonneur) {
      if (empoisonneur.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveDiscardEnergyPoisonOpponentTalent(
        playerIndex,
        knight,
        empoisonneur,
      );
    }
    const psychokinesis = effects.find((e) => e.type === 'discard_energy_opponent_energy');
    if (psychokinesis) {
      if (psychokinesis.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveDiscardEnergyOpponentEnergyTalent(
        playerIndex,
        knight,
        psychokinesis,
      );
    }
    const lookTop = effects.find((e) => e.type === 'look_top_deck');
    if (lookTop) {
      if (lookTop.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveLookTopDeckTalent(playerIndex, knight, lookTop);
    }
    const benchHeal = effects.find((e) => e.type === 'bench_heal_once_per_turn');
    if (benchHeal) {
      if (benchHeal.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveBenchHealOncePerTurn(playerIndex, knight, benchHeal);
    }
    const copyAttack = effects.find((e) => e.type === 'copy_bench_attack_turn');
    if (copyAttack) {
      if (copyAttack.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveCopyBenchAttackTalent(playerIndex, knight, copyAttack);
    }
    const kanonSanctuary = effects.find((e) => e.type === 'kanon_submarine_sanctuary_once');
    if (kanonSanctuary) {
      return this.effects.resolveKanonSubmarineSanctuary(playerIndex, knight, kanonSanctuary);
    }
    const benchReturn = effects.find((e) => e.type === 'bench_return_to_hand');
    if (benchReturn) {
      if (benchReturn.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveBenchReturnToHandTalent(playerIndex, knight, benchReturn);
    }
    const benchAttack = effects.find((e) => e.type === 'bench_can_attack_end_turn');
    if (benchAttack) {
      return this.effects.resolveBenchCanAttackTalent(playerIndex, knight, benchAttack);
    }
    const transferHades = effects.find((e) => e.type === 'transfer_energy_to_hades_bench');
    if (transferHades) {
      return this.effects.resolveTransferEnergyToHadesBench(playerIndex, knight, transferHades);
    }
    const charonSwap = effects.find((e) => e.type === 'swap_active_with_bench_tag');
    if (charonSwap) {
      return this.effects.resolveSwapActiveWithBenchTag(playerIndex, knight, charonSwap);
    }
    const reparateur = effects.find((e) => e.type === 'turn_start_heal_other_friendly');
    if (reparateur) {
      if (reparateur.oncePerTurn && knight.modifiers.talentOnceThisTurn) {
        this.feedback('Talent déjà utilisé ce tour.', 'warn');
        return false;
      }
      return this.effects.resolveTurnStartHealOtherFriendly(playerIndex, knight, reparateur);
    }
    const fairySend = effects.find((e) => e.type === 'discard_hand_silence_opponent_talent');
    if (fairySend) {
      return this.effects.resolveDiscardHandSilenceOpponentTalent(playerIndex, knight, fairySend);
    }
    return false;
  }

  resolveDiscardHandKnight(playerIndex, handIndex) {
    return this.effects.resolveDiscardHandKnight(playerIndex, handIndex);
  }

  resolveAttachEnergyFromDiscard(playerIndex, discardInstanceId) {
    return this.effects.resolveAttachEnergyFromDiscard(playerIndex, discardInstanceId);
  }

  resolveAttachEnergyFromHand(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'attachEnergyFromHand' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !isEnergie(card.cardId)) return false;
    const knight = this.effects.getKnightByTarget(p, pending.target);
    if (!knight) return false;
    if (!this.knightCanAttachEnergyFromHand(knight)) {
      this.feedback('Ce chevalier ne peut pas recevoir d\'Énergie depuis la main ce tour.', 'energy');
      return false;
    }

    const [energy] = p.hand.splice(handIndex, 1);
    knight.energies.push({ cardId: energy.cardId, instanceId: energy.instanceId });
    const resume = pending.resume;
    this.state.pending = null;
    this.feedback('Énergie attachée depuis la main.', 'energy');
    this.anim('attachEnergy', {
      cardId: energy.cardId,
      target: pending.target,
      playerIndex,
      fromDeck: false,
    });
    this.emit();
    if (resume?.kind === 'objetEffects') {
      void this._continueAfterBenchPick(resume);
    }
    return true;
  }

  resolveSearchDeck(playerIndex, deckInstanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'searchDeck' || pending.playerIndex !== playerIndex) return false;
    const p = this.state.players[playerIndex];
    const deckIdx = p.deck.findIndex((c) => c.instanceId === deckInstanceId);
    if (deckIdx < 0) return false;
    const [card] = p.deck.splice(deckIdx, 1);
    p.hand.push(card);
    const resume = pending.resume;
    let nextPending = null;
    if (resume?.kind === 'searchDeckRepeat' && resume.remaining > 0) {
      const pickIndex = resume.pickIndex ?? 2;
      const pickTotal = resume.pickTotal ?? (resume.remaining + 1);
      const searchable = p.deck.filter((c) =>
        this.effects.matchesDeckFilter(c.cardId, resume.filter),
      );
      if (searchable.length) {
        nextPending = {
          type: 'searchDeck',
          playerIndex,
          options: searchable.map((c) => ({ ...c })),
          resume: {
            kind: 'searchDeckRepeat',
            playerIndex,
            filter: resume.filter,
            remaining: resume.remaining - 1,
            pickIndex: pickIndex + 1,
            pickTotal,
          },
          progress: { current: pickIndex, total: pickTotal },
        };
      }
    } else if (resume?.searchRemaining > 1) {
      resume.searchRemaining -= 1;
      if (resume.searchUpToRemaining != null) {
        resume.searchUpToRemaining = Math.max(0, resume.searchUpToRemaining - 1);
      }
      const searchable = p.deck.filter((c) =>
        this.effects.matchesDeckFilter(c.cardId, resume.searchFilter),
      );
      if (searchable.length && resume.searchRemaining > 0) {
        nextPending = {
          type: 'searchDeck',
          playerIndex,
          options: searchable.map((c) => ({ ...c })),
          resume,
          progress: {
            current: Math.max(1, (resume.searchTotal || 0) - resume.searchRemaining + 1),
            total: resume.searchTotal || 1,
          },
          canFinishUpTo: !!resume.canFinishUpTo && resume.searchUpToRemaining > 0,
        };
      }
    }

    this.state.pending = nextPending;
    this.feedback(
      nextPending ? 'Choisissez une autre carte du deck.' : 'Carte ajoutée à la main.',
      resume ? 'objet' : 'talent',
    );
    this.emit();
    if (nextPending) return true;

    if (!nextPending && resume?.kind === 'searchDeckRepeat' && resume.parentResume) {
      void this._continueAfterBenchPick(resume.parentResume);
      return true;
    }
    if (resume) {
      void this._continueAfterBenchPick(resume);
    }
    return true;
  }

  resolvePickDisableOpponentAttack(playerIndex, attackName) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickDisableOpponentAttack' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const opp = this.state.players[pending.opponentIndex ?? 1 - playerIndex];
    if (!opp.active || !pending.attackNames?.includes(attackName)) return false;
    opp.active.modifiers.cantUseAttackOnNextTurn = attackName;
    this.state.pending = null;
    this.feedback(`OM : « ${attackName} » bloquée au prochain tour.`, 'status');
    this.emit();
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  resolveOptionalDiscardEnergyForAttack(playerIndex, discardCount) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'optionalDiscardEnergyForAttack' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const cont = this._attackContinuation;
    if (!cont) return false;
    const p = this.state.players[playerIndex];
    const active = p.active;
    const max = Math.min(pending.maxDiscard || 0, active?.energies?.length ?? 0);
    const n = Math.max(0, Math.min(discardCount ?? 0, max));
    let discarded = 0;
    while (discarded < n && active?.energies?.length) {
      const e = active.energies.pop();
      p.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
      discarded++;
    }
    cont.ctx.discardedEnergyCount = discarded;
    if (discarded > 0) {
      this.feedback(`${discarded} énergie(s) défaussée(s).`, 'energy');
    }
    this.state.pending = null;
    this._attackContinuation = null;
    this.emit();
    const def = getCardDef(p.active.cardId);
    const atk = this.getActiveAttackList(p.active)[cont.attackIndex];
    if (!atk) return false;
    return this._continueAttackAfterPrechecks(playerIndex, atk, def, cont.ctx, 0);
  }

  discardNamedCardForAttack(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'optionalDiscardNamedCardsForAttack' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card || !this.effects.cardMatchesNamedDiscard(card.cardId, pending.eff)) return false;
    if ((pending.discarded ?? 0) >= (pending.maxDiscard ?? 2)) return false;
    p.discard.push(p.hand.splice(handIndex, 1)[0]);
    pending.discarded = (pending.discarded ?? 0) + 1;
    this.feedback(`Carte défaussée (${pending.discarded}/${pending.maxDiscard}).`, 'attack');
    this.emit();
    return true;
  }

  resolveOptionalDiscardNamedCardsForAttack(playerIndex) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'optionalDiscardNamedCardsForAttack' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const cont = this._attackContinuation;
    if (!cont) return false;
    const p = this.state.players[playerIndex];
    cont.ctx.discardedNamedCardCount = pending.discarded ?? 0;
    if (cont.ctx.discardedNamedCardCount > 0) {
      this.feedback(
        `${cont.ctx.discardedNamedCardCount} carte(s) défaussée(s) pour bonus.`,
        'attack',
      );
    }
    this.state.pending = null;
    this._attackContinuation = null;
    this.emit();
    const def = getCardDef(p.active.cardId);
    const atk = this.getActiveAttackList(p.active)[cont.attackIndex];
    if (!atk) return false;
    return this._continueAttackAfterPrechecks(playerIndex, atk, def, cont.ctx, 0);
  }

  resolveDestructionOutilPick(playerIndex, instanceId) {
    return this.effects.resolveDestructionOutilPick(playerIndex, instanceId);
  }

  finishDestructionOutil(playerIndex) {
    return this.effects.finishDestructionOutil(playerIndex);
  }

  resolveCerbereBenchBonusPick(playerIndex, instanceId) {
    const ok = this.effects.resolveCerbereBenchBonusPick(playerIndex, instanceId);
    if (ok && !this.state.pending) this._finishDeferredAttackAfterBenchPick();
    return ok;
  }

  finishCerbereBenchBonus(playerIndex) {
    const ok = this.effects.finishCerbereBenchBonus(playerIndex);
    if (ok) this._finishDeferredAttackAfterBenchPick();
    return ok;
  }

  resolveTransferEnergyTalentStep(playerIndex, target) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'transferEnergyTalent' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    if (pending.step === 'from') {
      const fromKnight = this.effects.getKnightByTarget(p, target);
      if (!fromKnight?.energies?.length) return false;
      pending.fromTarget = target;
      pending.step = 'to';
      this.feedback('Proche des dieux : chevalier destinataire.', 'talent');
      this.emit();
      return true;
    }
    const fromKnight = this.effects.getKnightByTarget(p, pending.fromTarget);
    const toKnight = this.effects.getKnightByTarget(p, target);
    if (!fromKnight || !toKnight || fromKnight === toKnight || !fromKnight.energies.length) {
      return false;
    }
    const energy = fromKnight.energies.pop();
    toKnight.energies.push(energy);
    const sourceKnight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (sourceKnight) sourceKnight.talentUsed = true;
    this.state.pending = null;
    this.feedback('Énergie transférée.', 'energy');
    this.anim('attachEnergy', { cardId: energy.cardId, target, playerIndex, fromDeck: false });
    this.emit();
    return true;
  }

  resolvePickMeleeBonusAlly(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickMeleeBonusAlly' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight = this.effects.getKnightByTarget(p, opt.target);
    if (!knight) return false;
    knight.modifiers.meleeBonusThisTurn = pending.amount || 20;
    const sourceKnight = resolveFieldKnight(p, { instanceId: pending.fromTalent?.knightInstanceId });
    if (sourceKnight) {
      sourceKnight.modifiers.talentOnceThisTurn = true;
      sourceKnight.talentUsed = true;
    }
    this.state.pending = null;
    this.feedback(
      `Armes de la Balance : +${pending.amount || 20} corps à corps pour ${getCardDef(knight.cardId).name} ce tour.`,
      'talent',
    );
    this.emit();
    return true;
  }

  resolvePickHealAlly(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickHealAlly' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const opt = pending.options.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight =
      opt.target === 'active' ? p.active : p.bench[opt.target];
    if (!knight) return false;
    this.effects.applyHealToKnight(p, knight, pending.amount, playerIndex, opt.target);
    if (pending.fromTalent?.knightInstanceId) {
      const sourceKnight = resolveFieldKnight(p, { instanceId: pending.fromTalent.knightInstanceId });
      if (sourceKnight) sourceKnight.talentUsed = true;
    }
    this.state.pending = null;
    this.emit();
    return true;
  }

  resolvePickBenchForDeckEnergy(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickBenchForDeckEnergy' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const opt = pending.options.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight = p.bench[opt.target];
    if (!knight) return false;
    this.effects.searchDeckEnergy(playerIndex, pending.count || 1, knight, opt.target);
    this.state.pending = null;
    this.emit();
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  resolvePickDamageOpponentKnight(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickDamageOpponentKnight' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const opp = this.state.players[pending.opponentIndex ?? 1 - playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight = opt.target === 'active' ? opp.active : opp.bench[opt.target];
    if (!knight || this.effects.isKnightBenchUntargetable(knight)) return false;
    this.damageKnight(opp, knight, pending.amount || 0, 'attack', playerIndex, null);
    if (pending.fromTalent) {
      const pl = this.state.players[pending.fromTalent.playerIndex];
      const k = resolveFieldKnight(pl, { instanceId: pending.fromTalent.knightInstanceId });
      if (k) k.talentUsed = true;
    }
    this.state.pending = null;
    this.emit();
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  resolvePickBenchForEnergyRecover(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickBenchForEnergyRecover' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight = p.bench[opt.target];
    if (!knight) return false;
    const sourceKnight = resolveFieldKnight(p, { instanceId: pending.fromTalent?.knightInstanceId });
    const ok = this.effects.applyRecoverEnergyFromDiscard(
      p,
      sourceKnight,
      pending.energyDiscardIdx,
      knight,
    );
    this.state.pending = null;
    this.emit();
    return ok;
  }

  resolvePickRecoverFromDiscard(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickRecoverFromDiscard' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const p = this.state.players[playerIndex];
    const knight = p.bench[pending.benchIdx];
    if (!knight || knight.instanceId !== pending.knightInstanceId) return false;
    const ok = this.effects.applyBenchReturnToHand(
      playerIndex,
      knight,
      pending.benchIdx,
      opt.discardIdx,
      { oncePerTurn: pending.oncePerTurn },
    );
    this.state.pending = null;
    this.emit();
    return ok;
  }

  moveLookTopDeckCard(playerIndex, index, direction) {
    return this.effects.moveLookTopDeckCard(playerIndex, index, direction);
  }

  confirmLookTopDeck(playerIndex) {
    return this.effects.confirmLookTopDeck(playerIndex);
  }

  resolveDistributeDamageAssign(playerIndex, instanceId) {
    const ok = this.effects.resolveDistributeDamageAssign(playerIndex, instanceId);
    if (ok && !this.state.pending && this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return ok;
  }

  finishDistributeDamage(playerIndex) {
    const ok = this.effects.finishDistributeDamage(playerIndex);
    if (ok && this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return ok;
  }

  resolveSacrificeBenchForAttack(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'sacrificeBenchForAttack' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const p = this.state.players[playerIndex];
    const knight = p.bench[opt.target];
    if (!knight) return false;
    const attackIndex = pending.attackIndex;
    knight.modifiers.noPrizeOnKO = true;
    knight.currentHp = 0;
    this.state.pending = null;
    this.feedback('Sacrifice effectué (sans Récompense adverse).', 'ko');
    void this.knockOut(p, knight, { noPrize: true, source: 'sacrifice' }).then(() => {
      if (this.state.winner) return;
      p.modifiers.sacrificeDoneForAttack = true;
      this.attack(playerIndex, attackIndex, { skipSacrificeCheck: true });
    });
    return true;
  }

  resolveCharonSwapBench(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'charonSwapBench' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    if (!this.switchActiveWithBench(playerIndex, opt.target)) return false;
    const p = this.state.players[playerIndex];
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (knight) {
      knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
    }
    this.state.pending = null;
    this.feedback('Charon : échange effectué.', 'talent');
    this.emit();
    return true;
  }

  resolveTransferEnergyToHadesSource(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'transferEnergyToHades' || pending.playerIndex !== playerIndex) {
      return false;
    }
    if (pending.step !== 'from') return false;
    const p = this.state.players[playerIndex];
    let sourceKnight = null;
    if (p.active?.instanceId === instanceId) sourceKnight = p.active;
    else sourceKnight = p.bench.find((k) => k?.instanceId === instanceId);
    if (!sourceKnight?.energies?.length) return false;
    pending.sourceInstanceId = instanceId;
    pending.step = 'to';
    const hadesOptions = p.bench
      .map((k, i) => ({ knight: k, target: i }))
      .filter(({ knight: k }) => {
        if (!k) return false;
        const id = getCardDef(k.cardId)?.id || k.cardId;
        return (pending.hadesIds || []).includes(id);
      });
    pending.hadesOptions = hadesOptions.map(({ target, knight: k }) => ({
      target,
      instanceId: k.instanceId,
    }));
    this.feedback('Pharaon : choisissez Hadès (banc) comme destination.', 'talent');
    this.emit();
    return true;
  }

  resolveTransferEnergyToHadesDest(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'transferEnergyToHades' || pending.playerIndex !== playerIndex) {
      return false;
    }
    if (pending.step !== 'to') return false;
    const p = this.state.players[playerIndex];
    const opt = pending.hadesOptions?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const dest = p.bench[opt.target];
    let source = p.active;
    if (pending.sourceInstanceId !== p.active?.instanceId) {
      source = p.bench.find((k) => k?.instanceId === pending.sourceInstanceId);
    }
    if (!source?.energies?.length || !dest) return false;
    const e = source.energies.pop();
    dest.energies.push({ cardId: e.cardId, instanceId: e.instanceId });
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (knight) {
      knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
    }
    this.state.pending = null;
    this.feedback('Énergie transférée vers Hadès.', 'energy');
    this.emit();
    return true;
  }

  resolveDiscardHandSilenceOpponentTalent(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'discardHandSilenceOpponentTalent' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card) return false;
    p.hand.splice(handIndex, 1);
    p.discard.push(card);
    const opp = this.state.players[1 - playerIndex];
    opp.modifiers.activeTalentSilencedTurns = pending.turns || 2;
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (knight) {
      knight.modifiers.talentOnceThisTurn = true;
      knight.talentUsed = true;
    }
    this.state.pending = null;
    this.feedback(
      `Envoie de Fairy : talent de l'actif adverse annulé ${pending.turns || 2} tour(s).`,
      'status',
    );
    this.emit();
    return true;
  }

  resolvePickHealAllyNextTurn(playerIndex, instanceId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickHealAllyNextTurn' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const opt = pending.options?.find((o) => o.instanceId === instanceId);
    if (!opt) return false;
    const knight =
      opt.target === 'active' ? p.active : p.bench[opt.target];
    if (!knight) return false;
    const before = knight.currentHp;
    knight.currentHp = Math.min(knight.maxHp, knight.currentHp + (pending.amount || 30));
    const healed = knight.currentHp - before;
    this.state.pending = null;
    if (healed > 0) {
      this.feedback(`Nuée de Fairy : +${healed} PV sur ${getCardDef(knight.cardId).name}.`, 'heal');
      this.onKnightHealed(knight);
    }
    this.emit();
    return true;
  }

  resolveRecoverDiscard(playerIndex, discardInstanceId) {
    if (this.stadiumBlocksDiscardRecovery()) {
      this.feedback('Collier des 108 Perles : récupération depuis la défausse impossible.', 'stadium');
      return false;
    }
    const pending = this.state.pending;
    if (!pending || pending.type !== 'recoverDiscard' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const idx = p.discard.findIndex((c) => c.instanceId === discardInstanceId);
    if (idx < 0) return false;
    const [card] = p.discard.splice(idx, 1);
    p.hand.push(card);
    this.state.pending = null;
    this.feedback(`${getCardDef(card.cardId).name} récupéré en main.`, 'attack');
    this.emit();
    return true;
  }

  resolveAccelerationDiscardFromHand(playerIndex, handIndex) {
    return this.effects.resolveAccelerationDiscardFromHand(playerIndex, handIndex);
  }

  resolveAccelerationDiscardFromBench(playerIndex, benchIndex) {
    return this.effects.resolveAccelerationDiscardFromBench(playerIndex, benchIndex);
  }

  finishAccelerationEnergieDiscard(playerIndex) {
    void this.effects.finishAccelerationEnergieDiscard(playerIndex);
    return true;
  }

  resolveAccelerationAttach(playerIndex, instanceId) {
    void this.effects.resolveAccelerationAttach(playerIndex, instanceId);
    return true;
  }

  resolveLookTopPickOne(playerIndex, instanceId) {
    return this.effects.resolveLookTopPickOne(playerIndex, instanceId);
  }

  resolveVoluntarySacrificeKnight(playerIndex, instanceId) {
    return this.effects.resolveVoluntarySacrificeKnight(playerIndex, instanceId);
  }

  finishSearchDeckUpTo(playerIndex) {
    return this.effects.finishSearchDeckUpTo(playerIndex);
  }

  /** Annule une sélection de cible en cours (sans appliquer l'effet). */
  cancelPending(playerIndex) {
    const pending = this.state.pending;
    if (!pending) return false;

    const cancellable = [
      'pickHealAlly',
      'pickBenchForDeckEnergy',
      'pickBenchForEnergyRecover',
      'pickDamageOpponentKnight',
      'pickRecoverFromDiscard',
      'lookTopDeck',
      'moveEnergy',
      'pickOpponentBenchActive',
      'pickOwnBenchActive',
      'searchDeck',
      'recoverDiscard',
      'attachEnergyFromHand',
      'attachEnergyFromDiscard',
      'discardHandKnight',
      'teleportPickSide',
      'discardEnergyFromHandForTalent',
      'discardForTalent',
      'donDeVie',
    ];
    if (!cancellable.includes(pending.type)) return false;

    const owner = pending.chooserPlayerIndex ?? pending.playerIndex;
    if (owner !== playerIndex) return false;

    const finishAttackAfter =
      this._pendingAttackFinish?.playerIndex === playerIndex &&
      (pending.type === 'pickOpponentBenchActive' ||
        pending.type === 'pickOwnBenchActive' ||
        pending.type === 'pickDamageOpponentKnight' ||
        pending.type === 'pickBenchForDeckEnergy' ||
        pending.type === 'distributeDamage');

    if (pending.type === 'lookTopDeck') {
      this.effects.cancelLookTopDeck(playerIndex);
    }

    if (pending.fromTalent && pending.type !== 'lookTopDeck') {
      const pl = this.state.players[pending.fromTalent.playerIndex];
      const k = resolveFieldKnight(pl, { instanceId: pending.fromTalent.knightInstanceId });
      if (k) k.talentUsed = false;
    }

    this.state.pending = null;
    this.feedback('Action annulée.', 'info');
    this.emit();

    if (finishAttackAfter) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  /** Attaques utilisables ce tour : base + outil + copie temporaire (Kasa, etc.). */
  getActiveAttackList(knight) {
    if (!knight) return [];
    const attacks = [...getKnightAllAttacks(knight)];
    const copied = knight.modifiers?.copiedAttackThisTurn;
    if (copied) attacks.push(copied);
    return attacks;
  }

  getAttackOptions(playerIndex = this.state.turn) {
    const p = this.state.players[playerIndex];
    if (!p.active) return [];
    const baseCount = getKnightAllAttacks(p.active).length;
    const attacks = this.getActiveAttackList(p.active);
    if (!attacks.length) return [];
    return attacks.map((atk, index) => ({
      index,
      attack: atk,
      canUse: this.canUseAttack(p.active, atk, playerIndex),
      isToolAttack: !!atk.fromTool,
      isCopiedAttack: index >= baseCount,
    }));
  }

  attackFromBench(playerIndex, benchIndex, attackIndex, opts = {}) {
    const p = this.state.players[playerIndex];
    const benchKnight = p.bench[benchIndex];
    if (!benchKnight) return false;
    const def = getCardDef(benchKnight.cardId);
    const atk = def?.attacks?.[attackIndex];
    if (!atk || !this.canUseAttack(benchKnight, atk, playerIndex)) return false;

    const oldActive = p.active;
    const krest = p.bench.splice(benchIndex, 1)[0];
    if (oldActive) p.bench.push(oldActive);
    p.active = krest;
    ensureUniqueFieldKnights(p);

    const ok = this.attack(playerIndex, attackIndex);

    const updated = p.active;
    p.active = oldActive;
    if (updated) {
      if (oldActive) {
        const idx = p.bench.indexOf(oldActive);
        if (idx >= 0) p.bench[idx] = updated;
        else p.bench.push(updated);
      } else {
        p.bench.push(updated);
      }
    }
    ensureUniqueFieldKnights(p);

    if (ok && opts.mentalImage) {
      p.modifiers.pendingMentalImage = {
        krestInstanceId: updated?.instanceId,
        opponentTurnIndex: 1 - playerIndex,
        attackerPlayerIndex: 1 - playerIndex,
      };
      if (opts.endTurn) {
        updated.modifiers.talentOnceThisTurn = true;
        this.state.forceEndTurnAfterTalent = true;
        void this.endTurn();
      }
    }
    return ok;
  }

  resolvePickCopyBenchAttack(playerIndex, attackName) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickCopyBenchAttack' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const pick = pending.attacks?.find((a) => a.name === attackName);
    if (!pick) return false;
    const p = this.state.players[playerIndex];
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (!knight) return false;
    this.state.pending = null;
    const eff = { oncePerTurn: true };
    return this.effects.applyCopiedBenchAttack(
      playerIndex,
      knight,
      pick,
      pending.discardEnergy || 1,
      eff,
    );
  }

  resolvePickCopyOpponentAttack(playerIndex, attackName) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickCopyOpponentAttack' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    const pick = pending.attacks?.find((a) => a.name === attackName);
    if (!pick) return false;
    const p = this.state.players[playerIndex];
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (!knight) return false;
    this.state.pending = null;
    return this.effects.applyCopiedOpponentAttack(playerIndex, knight, pick);
  }

  resolvePickKanonSanctuary(playerIndex, choice) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickKanonSanctuary' || pending.playerIndex !== playerIndex) {
      return false;
    }
    if (pending.phase) return false;
    const p = this.state.players[playerIndex];
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (!knight) return false;
    const effOpts = { oncePerTurn: pending.oncePerTurn };

    if (choice === 'draw') {
      this.state.pending = null;
      return this.effects.applyKanonSanctuaryChoice(playerIndex, knight, 'draw', effOpts);
    }

    if (choice === 'attach') {
      const energyIdx = p.hand.findIndex((c) => getCardDef(c.cardId)?.cardType === 'energie');
      if (energyIdx < 0) {
        this.feedback('Aucune Énergie en main.', 'warn');
        return false;
      }
      const marinas = this.effects.listKanonMarinaTargets(p);
      if (!marinas.length) {
        this.feedback('Aucun Général Marina en jeu.', 'warn');
        return false;
      }
      if (this.needsPlayerChoice(playerIndex) && marinas.length > 1) {
        pending.phase = 'attach';
        this.feedback('Sanctuaire Sous-Marin : choisissez un Général Marina.', 'talent');
        this.emit();
        return true;
      }
      this.state.pending = null;
      return this.effects.applyKanonSanctuaryAttach(playerIndex, knight, marinas[0].target, effOpts);
    }

    if (choice === 'move') {
      const sources = this.effects.listKanonMarinaTargets(p, { requireEnergy: true });
      const allMarinas = this.effects.listKanonMarinaTargets(p);
      if (allMarinas.length < 2 || !sources.length) {
        this.feedback('Deux Généraux Marinas avec Énergie requis.', 'warn');
        return false;
      }
      if (!this.needsPlayerChoice(playerIndex)) {
        const dests = allMarinas.filter((m) => m.target !== sources[0].target);
        this.state.pending = null;
        return this.effects.applyKanonSanctuaryMove(
          playerIndex,
          knight,
          sources[0].target,
          dests[0]?.target ?? allMarinas[1].target,
          effOpts,
        );
      }
      if (sources.length === 1) {
        const dests = allMarinas.filter((m) => m.target !== sources[0].target);
        if (dests.length === 1) {
          this.state.pending = null;
          return this.effects.applyKanonSanctuaryMove(
            playerIndex,
            knight,
            sources[0].target,
            dests[0].target,
            effOpts,
          );
        }
        pending.phase = 'moveTo';
        pending.fromTarget = sources[0].target;
        this.feedback('Sanctuaire Sous-Marin : Marina destinataire.', 'talent');
        this.emit();
        return true;
      }
      pending.phase = 'moveFrom';
      this.feedback('Sanctuaire Sous-Marin : Marina source (avec Énergie).', 'talent');
      this.emit();
      return true;
    }

    return false;
  }

  resolvePickKanonSanctuaryTarget(playerIndex, target) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickKanonSanctuary' || pending.playerIndex !== playerIndex) {
      return false;
    }
    const p = this.state.players[playerIndex];
    const knight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
    if (!knight) return false;
    const effOpts = { oncePerTurn: pending.oncePerTurn };

    if (pending.phase === 'attach') {
      const marina = this.effects.getKanonMarinaAtTarget(p, target);
      if (!marina) return false;
      this.state.pending = null;
      return this.effects.applyKanonSanctuaryAttach(playerIndex, knight, target, effOpts);
    }

    if (pending.phase === 'moveFrom') {
      const fromKnight = this.effects.getKanonMarinaAtTarget(p, target);
      if (!fromKnight?.energies?.length) return false;
      const allMarinas = this.effects.listKanonMarinaTargets(p);
      const dests = allMarinas.filter((m) => m.target !== target);
      if (!dests.length) return false;
      pending.fromTarget = target;
      if (dests.length === 1) {
        this.state.pending = null;
        return this.effects.applyKanonSanctuaryMove(
          playerIndex,
          knight,
          target,
          dests[0].target,
          effOpts,
        );
      }
      pending.phase = 'moveTo';
      this.feedback('Sanctuaire Sous-Marin : Marina destinataire.', 'talent');
      this.emit();
      return true;
    }

    if (pending.phase === 'moveTo') {
      const toKnight = this.effects.getKanonMarinaAtTarget(p, target);
      if (!toKnight || target === pending.fromTarget) return false;
      this.state.pending = null;
      return this.effects.applyKanonSanctuaryMove(
        playerIndex,
        knight,
        pending.fromTarget,
        target,
        effOpts,
      );
    }

    return false;
  }

  resolvePickBenchSelfAttack(playerIndex, attackIndex) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickBenchSelfAttack' || pending.playerIndex !== playerIndex) {
      return false;
    }
    this.state.pending = null;
    const benchIdx = pending.benchIndex;
    const knight = this.state.players[playerIndex].bench[benchIdx];
    if (knight) knight.modifiers.talentOnceThisTurn = true;
    return this.attackFromBench(playerIndex, benchIdx, attackIndex, {
      endTurn: true,
      mentalImage: true,
    });
  }

  canUseAttack(knight, attack, playerIndex = this.state.turn) {
    if (!knight || this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (!this.canAttackThisTurn(playerIndex)) return false;
    if (this.actions.attack) return false;
    if (this.isAttackTestMode && playerIndex === 0) {
      return getKnightAllAttacks(knight).some((a) => a.name === attack.name);
    }
    if (knight.statuses.includes('paralyzed') || knight.statuses.includes('frozen')) return false;
    if (knight.modifiers.cantUseAttacks?.includes(attack.name)) return false;
    if (knight.modifiers.cantUseAttacks?.includes('*')) return false;
    const attackTax = knight.modifiers.attackTaxDiscardEnergy || 0;
    if (attackTax > 0 && knight.energies.length < attackTax) return false;
    const reqLast = (attack.effects || []).find((e) => e.type === 'requires_played_attack_last_turn');
    if (reqLast) {
      const pl = this.state.players[playerIndex];
      const prev = pl.playedAttackLastTurn ?? pl.lastAttackName;
      if (prev !== reqLast.requiredAttack) return false;
    }
    const sacrificeReq = (attack.effects || []).find((e) => e.type === 'requires_sacrifice_bench');
    if (sacrificeReq) {
      const pl = this.state.players[playerIndex];
      const hasTarget = pl.bench.some(
        (k) => k && this.effects.matchesSacrificeFilter(k.cardId, sacrificeReq),
      );
      if (!hasTarget) return false;
    }
    return countEnergiesForCost(knight, this.getEffectiveAttackCost(knight, attack));
  }

  attack(playerIndex, attackIndex, opts = {}) {
    const p = this.state.players[playerIndex];
    const def = getCardDef(p.active?.cardId);
    const atk = this.getActiveAttackList(p.active)[attackIndex];
    if (!atk || !this.canUseAttack(p.active, atk, playerIndex)) return false;

    if (!opts.skipSacrificeCheck) {
      const sacrificeReq = (atk.effects || []).find((e) => e.type === 'requires_sacrifice_bench');
      if (sacrificeReq && !p.modifiers.sacrificeDoneForAttack) {
        return this.effects.startSacrificeBenchForAttack(playerIndex, atk, attackIndex);
      }
    }

    this._attackKoNoPrize = (atk.effects || []).some((e) => e.type === 'ko_no_prize_on_attack');
    this._ignoreOpponentDamageMitigation = (atk.effects || []).some(
      (e) =>
        e.type === 'ignore_opponent_damage_mitigation' ||
        e.type === 'ignore_opponent_damage_reduction',
    );

    if (p.active) p.active.attackedThisTurn = true;

    this._deferredAttackSplashDone = false;
    this._deferredAttackSplashDamage = 0;
    this._deferredAttackSplashSummary = '';

    this._damageAttribution = {
      playerIndex,
      cardId: p.active?.cardId ?? null,
    };

    let damageDealt = 0;

    const attackTax = p.active.modifiers.attackTaxDiscardEnergy || 0;
    if (attackTax > 0) {
      this.effects.discardEnergyFromKnight(p.active, attackTax, p);
      p.active.modifiers.attackTaxDiscardEnergy = 0;
      p.active.modifiers.attackTaxExpiresOnTurnEnd = false;
      this.feedback(`Illusion : ${attackTax} Énergie(s) défaussée(s) pour attaquer.`, 'energy');
    }

    if (p.active.statuses.includes('confused')) {
      this._attackConfusedCheck = true;
    } else {
      this._attackConfusedCheck = false;
    }

    this.actions.attack = true;
    p._currentAttackName = atk.name;

    const opp = this.state.players[1 - playerIndex];
    const ctx = { coin: null, headsCount: 0, damageDealt: 0, attackName: atk.name, opponentActive: opp.active };

    const optDiscardEff = this.effects.getOptionalDiscardEnergyEffect(atk);
    if (optDiscardEff && p.active?.energies?.length) {
      const max = Math.min(optDiscardEff.maxDiscard ?? 3, p.active.energies.length);
      if (max > 0) {
        const swapOnDiscard = this.effects.attackSwapRequiresDiscardedEnergy(atk);
        if (this.isAiControlled(playerIndex)) {
          let discarded = 0;
          if (swapOnDiscard) {
            const opp = this.state.players[1 - playerIndex];
            if (opp.active && opp.bench.some(Boolean)) {
              const e = p.active.energies.pop();
              p.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
              discarded = 1;
            }
          } else {
            while (discarded < max && p.active.energies.length) {
              const e = p.active.energies.pop();
              p.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
              discarded++;
            }
          }
          ctx.discardedEnergyCount = discarded;
          if (discarded > 0) {
            this.feedback(`${discarded} énergie(s) défaussée(s) (optionnel).`, 'energy');
          }
        } else {
          this._attackContinuation = { playerIndex, attackIndex, ctx };
          this.state.pending = {
            type: 'optionalDiscardEnergyForAttack',
            playerIndex,
            maxDiscard: max,
            swapOnDiscard,
          };
          this.feedback(
            swapOnDiscard
              ? `Défaussez 0 ou 1 Énergie pour déclencher l'échange adverse, puis validez.`
              : `Défaussez 0 à ${max} Énergie(s) pour bonus, puis validez.`,
            'energy',
          );
          this.emit();
          return true;
        }
      }
    }

    const optNamedEff = this.effects.getOptionalDiscardNamedCardsEffect(atk);
    if (optNamedEff) {
      const matching = p.hand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => this.effects.cardMatchesNamedDiscard(c.cardId, optNamedEff));
      const max = Math.min(optNamedEff.maxDiscard ?? 2, matching.length);
      if (max > 0) {
        if (this.isAiControlled(playerIndex)) {
          let discarded = 0;
          while (discarded < max && matching.length) {
            const pick = matching.shift();
            const [card] = p.hand.splice(pick.i, 1);
            p.discard.push(card);
            discarded++;
          }
          ctx.discardedNamedCardCount = discarded;
          if (discarded > 0) {
            this.feedback(`${discarded} carte(s) défaussée(s) pour bonus.`, 'attack');
          }
        } else {
          this._attackContinuation = { playerIndex, attackIndex, ctx };
          this.state.pending = {
            type: 'optionalDiscardNamedCardsForAttack',
            playerIndex,
            maxDiscard: max,
            eff: optNamedEff,
            discarded: 0,
          };
          this.feedback(
            `Défaussez 0 à ${max} Saphir d'Odin pour +${optNamedEff.amountPerCard ?? 60} dégâts chacun, puis validez.`,
            'attack',
          );
          this.emit();
          return true;
        }
      }
    }

    if ((atk.effects || []).some((e) => e.type === 'io_projection_animale')) {
      return this.effects.startIoProjectionAnimale(playerIndex, attackIndex, atk, ctx);
    }

    return this._continueAttackAfterPrechecks(playerIndex, atk, def, ctx, damageDealt);
  }

  resolvePickIoAnimal(playerIndex, animalId) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'pickIoAnimal' || pending.playerIndex !== playerIndex) {
      return false;
    }
    if (!pending.animals?.some((a) => a.id === animalId)) return false;
    const cont = this._attackContinuation;
    if (!cont) return false;
    const p = this.state.players[playerIndex];
    const active = p.active;
    if (active?.lastIoAnimal === animalId) return false;
    if (!this.effects.applyIoAnimalChoice(playerIndex, animalId, cont.ctx)) return false;
    active.lastIoAnimal = animalId;
    this.state.pending = null;
    this._attackContinuation = null;
    this.emit();
    const def = getCardDef(p.active.cardId);
    const atk = this.getActiveAttackList(p.active)[cont.attackIndex];
    if (!atk) return false;
    return this._continueAttackAfterPrechecks(playerIndex, atk, def, cont.ctx, 0);
  }

  resolvePickIoBigTornadoStatus(playerIndex, status) {
    const pending = this.state.pending;
    if (
      !pending ||
      pending.type !== 'pickIoBigTornadoStatus' ||
      pending.playerIndex !== playerIndex
    ) {
      return false;
    }
    if (!pending.options?.includes(status)) return false;
    const opp = this.state.players[1 - playerIndex];
    if (!opp.active) return false;
    this.applyStatus(opp, opp.active, status);
    this.state.pending = null;
    this.feedback(`Big Tornado : ${RULES.status[status]?.label || status}.`, 'status');
    this.emit();
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      this._finishDeferredAttackAfterBenchPick();
    }
    return true;
  }

  async _resolveAttackEffectCoinFlips(playerIndex, atk, ctx) {
    for (const eff of atk.effects || []) {
      if (eff.type === 'multi_coin_flip') {
        const flipCount = eff.count || 1;
        let tails = 0;
        ctx.headsCount = 0;
        for (let i = 0; i < flipCount; i++) {
          const c = await this.awaitFlipCoinWithUI(`${atk.name} — lancer de pièce`, {
            flipIndex: i + 1,
            flipTotal: flipCount,
          });
          if (c === RULES.coin.heads) ctx.headsCount++;
          else tails++;
        }
        ctx.tailsCount = tails;
        this.feedback(formatCoinFlipSummary(ctx.headsCount, tails), 'coin');
        ctx.coin = ctx.headsCount > 0 ? RULES.coin.heads : RULES.coin.tails;
      } else if (eff.type === 'coin_flip') {
        ctx.coin = await this.awaitFlipCoinWithUI(`${atk.name} — effet d'attaque`);
        this.feedback(`Pièce : ${formatCoinFlipResult(ctx.coin)}`, 'coin');
      } else if (eff.type === 'multi_coin_flip_per_card_id') {
        const cardId = eff.cardId;
        const cardName = getCardDef(cardId)?.name || cardId;
        const sidePlayer = eff.side === 'own' ? playerIndex : 1 - playerIndex;
        const side = this.state.players[sidePlayer];
        let count = 0;
        if (side.active?.cardId === cardId) count++;
        side.bench.forEach((k) => {
          if (k?.cardId === cardId) count++;
        });
        ctx.headsCount = 0;
        let tails = 0;
        for (let i = 0; i < count; i++) {
          const c = await this.awaitFlipCoinWithUI(`${atk.name} — par ${cardName}`, {
            flipIndex: i + 1,
            flipTotal: count,
          });
          if (c === RULES.coin.heads) ctx.headsCount++;
          else tails++;
        }
        ctx.tailsCount = tails;
        if (count > 1) {
          this.feedback(formatCoinFlipSummary(ctx.headsCount, tails), 'coin');
        } else if (count === 1) {
          this.feedback(
            `Pièce : ${formatCoinFlipResult(ctx.headsCount ? RULES.coin.heads : RULES.coin.tails)}`,
            'coin',
          );
        }
        ctx.coin = ctx.headsCount > 0 ? RULES.coin.heads : RULES.coin.tails;
      }
    }
  }

  _continueAttackAfterPrechecks(playerIndex, atk, def, ctx, damageDealt = 0) {
    const p = this.state.players[playerIndex];

    this._deferredAttackCtx = { playerIndex, atk, def, ctx };

    if (
      this.state.pending?.type === 'discardForAttack' ||
      this.state.pending?.type === 'revealOpponentHand' ||
      this.state.pending?.type === 'pickDisableOpponentAttack' ||
      this.state.pending?.type === 'pickIoBigTornadoStatus'
    ) {
      this._pendingAttackFinish = { playerIndex, atk, attackerName: def.name };
      this.emit();
      return true;
    }

    if (
      this.state.pending?.type === 'pickOpponentBenchActive' ||
      this.state.pending?.type === 'pickOwnBenchActive' ||
      this.state.pending?.type === 'pickDamageOpponentKnight' ||
      this.state.pending?.type === 'pickBenchForDeckEnergy'
    ) {
      this._pendingAttackFinish = {
        playerIndex,
        atk,
        attackerName: def.name,
        fxMeta: {
          damageDealt,
          headsCount: ctx.headsCount,
          coin: ctx.coin,
          attackerCardId: p.active?.cardId,
          discardedEnergyCount: ctx.discardedEnergyCount ?? 0,
        },
      };
      this.emit();
      return true;
    }

    void this.finishAttack(playerIndex, atk, def.name, 0, {
      headsCount: ctx.headsCount,
      tailsCount: ctx.tailsCount,
      coin: ctx.coin,
      attackerCardId: p.active?.cardId,
      discardedEnergyCount: ctx.discardedEnergyCount ?? 0,
    });
    return true;
  }

  _buildAttackResultSummary(atk, ctx = {}, damageDealt = 0) {
    const lines = [];
    const mur = ctx.murCrystalDefense;
    if (mur) {
      lines.push(`Mur de Cristal : ${mur.coin === RULES.coin.heads ? 'Face' : 'Pile'}`);
      if (mur.blocked) {
        lines.push('Mur (face) : attaque annulée');
        if (mur.counterDealt > 0) {
          lines.push(`Contre Mur : -${mur.counterDealt} PV à l'actif adverse`);
        }
      } else if (mur.reduced > 0) {
        lines.push(`Mur (pile) : -${mur.reduced} dégâts`);
      }
    }
    const coin = ctx.coin;
    if (coin === RULES.coin.heads) lines.push('Pièce : Face');
    else if (coin === RULES.coin.tails) lines.push('Pièce : Pile');
    else if (ctx.headsCount > 0 && ctx.tailsCount != null) {
      lines.push(formatCoinFlipSummary(ctx.headsCount, ctx.tailsCount));
    } else if (ctx.headsCount > 0) {
      lines.push(`${ctx.headsCount} face(s)`);
    }

    for (const eff of atk.effects || []) {
      const statusLabel = (id) => RULES.status[id]?.label || id;
      switch (eff.type) {
        case 'attack_miss_on_tails':
          if (coin === RULES.coin.tails) lines.push('Pile : aucun dégât');
          break;
        case 'status':
          if (eff.target === 'opponent_active') lines.push(statusLabel(eff.status));
          break;
        case 'status_on_heads':
          if (coin === RULES.coin.heads && eff.target === 'opponent_active') {
            lines.push(statusLabel(eff.status));
          }
          break;
        case 'status_on_tails':
          if (coin === RULES.coin.tails && eff.target === 'opponent_active') {
            lines.push(statusLabel(eff.status));
          }
          break;
        case 'bench_damage': {
          const dmg = eff.damage || 0;
          if (eff.target === 'opponent_bench_all') lines.push(`Banc adverse : -${dmg} PV chacun`);
          else if (eff.target === 'self_bench_all') lines.push(`Votre banc : -${dmg} PV chacun`);
          else if (eff.target === 'all_bench') lines.push(`Tous les bancs : -${dmg} PV`);
          else if (eff.target === 'opponent_bench_one') lines.push(`Banc adverse : -${dmg} PV`);
          else lines.push(`Banc : -${dmg} PV`);
          break;
        }
        case 'reduce_damage_taken_next_turn':
          if (!eff.onHeads || coin === RULES.coin.heads) {
            lines.push(`Réduction dégâts (−${eff.amount || 0})`);
          }
          break;
        case 'immune_damage_next_turn':
          if (!eff.onHeads || coin === RULES.coin.heads) {
            lines.push('Aucun dégât au prochain tour adverse');
          }
          break;
        case 'reveal_opponent_hand_shuffle':
          lines.push('Carte adverse mélangée dans son deck');
          break;
        case 'discard_energy_on_heads':
          if (coin === RULES.coin.heads) lines.push('Énergie(s) défaussée(s)');
          break;
        case 'cant_retreat_next_turn':
          lines.push('Retraite bloquée au prochain tour');
          break;
        default:
          break;
      }
    }

    if (damageDealt > 0) lines.push(`Actif : -${damageDealt} PV`);
    else if (
      coin === RULES.coin.tails &&
      atk.effects?.some((e) => e.type === 'attack_miss_on_tails')
    ) {
      /* miss line already */
    } else if (coin && damageDealt === 0 && !lines.some((l) => l.includes('aucun dégât'))) {
      lines.push('Aucun dégât sur l\'actif');
    }

    return lines.filter(Boolean).join('\n');
  }

  _applyDeferredAttackOutcome() {
    const pending = this._deferredAttackOutcome;
    if (!pending) return 0;
    this._deferredAttackOutcome = null;
    const { playerIndex, atk, damage, ctx } = pending;
    const opp = this.state.players[1 - playerIndex];
    let damageDealt = 0;
    const attr = this._damageAttribution;
    const deferredFxId = getAttackFxId(
      attr?.cardId ?? this.state.players[playerIndex]?.active?.cardId,
      atk.name,
    );
    const skipDeferredDamageFx = deferredFxId === 'aldebaran-great-horn';
    if (skipDeferredDamageFx) {
      this._damageAnimSkipShake = true;
      this._damageAnimSkipSound = true;
    }
    if (
      opp.active &&
      damage > 0 &&
      !this.effects.hasEffect(atk, 'damage_opponent_any') &&
      !this.effects.attackSkipsDamageToKnight(atk, opp.active)
    ) {
      damageDealt = this._damageKnightSync(
        opp,
        opp.active,
        damage,
        'attack',
        playerIndex,
        attr?.cardId ?? this.state.players[playerIndex]?.active?.cardId,
      );
    } else if (
      opp.active &&
      damage > 0 &&
      this.effects.attackSkipsDamageToKnight(atk, opp.active)
    ) {
      this.feedback('Réincarnation : aucun dégât (cible protégée).', 'status');
    }
    if (this._murCrystalDefenseResult) {
      ctx.murCrystalDefense = this._murCrystalDefenseResult;
      this._murCrystalDefenseResult = null;
    }
    if (skipDeferredDamageFx) {
      this._damageAnimSkipShake = false;
      this._damageAnimSkipSound = false;
    }
    ctx.damageDealt = damageDealt;
    void this.effects.resolveAttackEffects(playerIndex, atk, ctx);
    return damageDealt;
  }

  _attackFinishDeferredByPending(pending = this.state.pending) {
    if (!pending) return false;
    return [
      'pickOpponentBenchActive',
      'pickOwnBenchActive',
      'revealOpponentHand',
      'pickDamageOpponentKnight',
      'pickBenchForDeckEnergy',
      'cerbereBenchBonus',
      'distributeDamage',
      'discardForAttack',
      'pickDisableOpponentAttack',
      'pickIoBigTornadoStatus',
    ].includes(pending.type);
  }

  async _applyDeferredAttackOutcomeAsync() {
    const pending = this._deferredAttackOutcome;
    if (!pending) return 0;
    this._deferredAttackOutcome = null;
    const { playerIndex, atk, damage, ctx } = pending;
    const opp = this.state.players[1 - playerIndex];
    let damageDealt = 0;
    const attr = this._damageAttribution;
    const deferredFxId = getAttackFxId(
      attr?.cardId ?? this.state.players[playerIndex]?.active?.cardId,
      atk.name,
    );
    const skipDeferredDamageFx = deferredFxId === 'aldebaran-great-horn';
    if (skipDeferredDamageFx) {
      this._damageAnimSkipShake = true;
      this._damageAnimSkipSound = true;
    }
    this._attackPipelineActive = true;
    try {
      if (
        opp.active &&
        damage > 0 &&
        !this.effects.hasEffect(atk, 'damage_opponent_any') &&
        !this.effects.attackSkipsDamageToKnight(atk, opp.active)
      ) {
        damageDealt = await this._damageKnightAsync(
          opp,
          opp.active,
          damage,
          'attack',
          playerIndex,
          attr?.cardId ?? this.state.players[playerIndex]?.active?.cardId,
        );
      } else if (
        opp.active &&
        damage > 0 &&
        this.effects.attackSkipsDamageToKnight(atk, opp.active)
      ) {
        this.feedback('Réincarnation : aucun dégât (cible protégée).', 'status');
      }
    } finally {
      this._attackPipelineActive = false;
    }
    if (this._murCrystalDefenseResult) {
      ctx.murCrystalDefense = this._murCrystalDefenseResult;
      this._murCrystalDefenseResult = null;
    }
    if (skipDeferredDamageFx) {
      this._damageAnimSkipShake = false;
      this._damageAnimSkipSound = false;
    }
    ctx.damageDealt = damageDealt;
    await this.effects.resolveAttackEffects(playerIndex, atk, ctx);
    return damageDealt;
  }

  _computeAndApplyAttackDamage(playerIndex, atk, ctx) {
    let damage = this.effects.computeAttackDamage(playerIndex, atk, ctx);
    if (
      atk.effects?.some((e) => e.type === 'attack_miss_on_tails') &&
      ctx.coin === RULES.coin.tails
    ) {
      damage = 0;
      this.feedback('Pile : aucun dégât.', 'coin');
    }
    this._deferredAttackOutcome = { playerIndex, atk, damage, ctx };
    return this._applyDeferredAttackOutcome();
  }

  async _computeAndApplyAttackDamageAsync(playerIndex, atk, ctx) {
    let damage = this.effects.computeAttackDamage(playerIndex, atk, ctx);
    if (
      atk.effects?.some((e) => e.type === 'attack_miss_on_tails') &&
      ctx.coin === RULES.coin.tails
    ) {
      damage = 0;
      this.feedback('Pile : aucun dégât.', 'coin');
    }
    this._deferredAttackOutcome = { playerIndex, atk, damage, ctx };
    return this._applyDeferredAttackOutcomeAsync();
  }

  _resolveAttackEffectCoinFlipsSync(playerIndex, atk, ctx) {
    for (const eff of atk.effects || []) {
      if (eff.type === 'multi_coin_flip') {
        const flipCount = eff.count || 1;
        let tails = 0;
        ctx.headsCount = 0;
        for (let i = 0; i < flipCount; i++) {
          const c = this.flipCoinWithUI(`${atk.name} — lancer de pièce`, {
            flipIndex: i + 1,
            flipTotal: flipCount,
          });
          if (c === RULES.coin.heads) ctx.headsCount++;
          else tails++;
        }
        ctx.tailsCount = tails;
        this.feedback(formatCoinFlipSummary(ctx.headsCount, tails), 'coin');
        ctx.coin = ctx.headsCount > 0 ? RULES.coin.heads : RULES.coin.tails;
      } else if (eff.type === 'coin_flip') {
        ctx.coin = this.flipCoinWithUI(`${atk.name} — effet d'attaque`);
        this.feedback(`Pièce : ${formatCoinFlipResult(ctx.coin)}`, 'coin');
      } else if (eff.type === 'multi_coin_flip_per_card_id') {
        const cardId = eff.cardId;
        const cardName = getCardDef(cardId)?.name || cardId;
        const sidePlayer = eff.side === 'own' ? playerIndex : 1 - playerIndex;
        const side = this.state.players[sidePlayer];
        let count = 0;
        if (side.active?.cardId === cardId) count++;
        side.bench.forEach((k) => {
          if (k?.cardId === cardId) count++;
        });
        ctx.headsCount = 0;
        let tails = 0;
        for (let i = 0; i < count; i++) {
          const c = this.flipCoinWithUI(`${atk.name} — par ${cardName}`, {
            flipIndex: i + 1,
            flipTotal: count,
          });
          if (c === RULES.coin.heads) ctx.headsCount++;
          else tails++;
        }
        ctx.tailsCount = tails;
        if (count > 1) {
          this.feedback(formatCoinFlipSummary(ctx.headsCount, tails), 'coin');
        } else if (count === 1) {
          this.feedback(
            `Pièce : ${formatCoinFlipResult(ctx.headsCount ? RULES.coin.heads : RULES.coin.tails)}`,
            'coin',
          );
        }
        ctx.coin = ctx.headsCount > 0 ? RULES.coin.heads : RULES.coin.tails;
      }
    }
  }

  _runAttackDamagePhaseSync(playerIndex, atk, ctx) {
    if (this._attackConfusedCheck) {
      this._attackConfusedCheck = false;
      const c = this.flipCoinWithUI('Confus — avant attaque');
      const heads = c === RULES.coin.heads ? 1 : 0;
      const tails = c === RULES.coin.tails ? 1 : 0;
      const coinSummary = formatCoinFlipSummary(heads, tails);
      this.feedback(`Confus : ${coinSummary}`, 'coin');
      ctx.coin = c;
      if (c === RULES.coin.tails) {
        const p = this.state.players[playerIndex];
        const selfDmg = this.damageKnight(
          p,
          p.active,
          RULES.status.confused.selfDamageOnTails,
          'confused',
        );
        this.feedback(`Pile : l'attaque échoue (−${selfDmg} PV).`, 'status');
        return {
          damageDealt: 0,
          resultSummary: [
            `Confus : ${coinSummary}`,
            'Pile : attaque annulée',
            selfDmg > 0 ? `−${selfDmg} PV (auto)` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
    }
    this._resolveAttackEffectCoinFlipsSync(playerIndex, atk, ctx);
    const damageDealt = this._computeAndApplyAttackDamage(playerIndex, atk, ctx);
    return {
      damageDealt,
      resultSummary: this._buildAttackResultSummary(atk, ctx, damageDealt),
    };
  }

  async _runAttackDamagePhaseAsync(playerIndex, atk, ctx) {
    if (this._attackConfusedCheck) {
      this._attackConfusedCheck = false;
      const c = await this.awaitFlipCoinWithUI('Confus — avant attaque');
      const heads = c === RULES.coin.heads ? 1 : 0;
      const tails = c === RULES.coin.tails ? 1 : 0;
      const coinSummary = formatCoinFlipSummary(heads, tails);
      this.feedback(`Confus : ${coinSummary}`, 'coin');
      ctx.coin = c;
      if (c === RULES.coin.tails) {
        const p = this.state.players[playerIndex];
        const selfDmg = this.damageKnight(
          p,
          p.active,
          RULES.status.confused.selfDamageOnTails,
          'confused',
        );
        this.feedback(`Pile : l'attaque échoue (−${selfDmg} PV).`, 'status');
        return {
          damageDealt: 0,
          resultSummary: [
            `Confus : ${coinSummary}`,
            'Pile : attaque annulée',
            selfDmg > 0 ? `−${selfDmg} PV (auto)` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
    }
    await this._resolveAttackEffectCoinFlips(playerIndex, atk, ctx);
    const damageDealt = await this._computeAndApplyAttackDamageAsync(playerIndex, atk, ctx);
    return {
      damageDealt,
      resultSummary: this._buildAttackResultSummary(atk, ctx, damageDealt),
    };
  }

  _attackVisualTimeoutMs(fxId, hasNameDescription = false, opts = {}) {
    const fxMs = this._attackFxDurationMs(fxId, opts);
    const nameMs = hasNameDescription
      ? (RULES.ui?.attackNameSplashMs ?? 900)
      : (RULES.ui?.attackNameSplashMs ?? 700);
    return fxMs + nameMs + 150;
  }

  _waitForAttackVisual(fxId, hasNameDescription = false, opts = {}) {
    if (this.headless) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(this._attackVisualTimer);
        this._attackVisualTimer = null;
        this._attackVisualResolve = null;
        resolve();
      };
      this._attackVisualResolve = finish;
      this._attackVisualTimer = setTimeout(() => {
        if (this._attackVisualResolve === finish) finish();
      }, this._attackVisualTimeoutMs(fxId, hasNameDescription, opts));
    });
  }

  notifyAttackFxVisualComplete() {
    if (this._attackVisualResolve) this._attackVisualResolve();
  }

  _waitForAttackResult(hasResultDescription = false) {
    if (this.headless) return Promise.resolve();
    const resultMs = hasResultDescription
      ? (RULES.ui?.attackSplashDescMs ?? 2800)
      : (RULES.ui?.attackSplashMs ?? 2000);
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(this._attackResultTimer);
        this._attackResultTimer = null;
        this._attackResultResolve = null;
        resolve();
      };
      this._attackResultResolve = finish;
      this._attackResultTimer = setTimeout(() => {
        if (this._attackResultResolve === finish) finish();
      }, resultMs + 150);
    });
  }

  notifyAttackResultComplete() {
    if (this._attackResultResolve) this._attackResultResolve();
  }

  /** @deprecated Use notifyAttackResultComplete — kept for compatibility. */
  notifyAttackFxComplete() {
    this.notifyAttackResultComplete();
  }

  async finishAttack(playerIndex, atk, attackerName, damageDealt, fxMeta = {}) {
    const p = this.state.players[playerIndex];
    p.modifiers.sacrificeDoneForAttack = false;
    this._attackKoNoPrize = false;
    this._ignoreOpponentDamageMitigation = false;

    const fxId =
      fxMeta.attackFxId ?? getAttackFxId(fxMeta.attackerCardId ?? p.active?.cardId, atk.name);
    const ctx =
      this._deferredAttackCtx?.ctx ??
      ({
        coin: fxMeta.coin ?? null,
        headsCount: fxMeta.headsCount ?? 0,
        tailsCount: fxMeta.tailsCount,
        damageDealt: 0,
        attackName: atk.name,
        opponentActive: this.state.players[1 - playerIndex].active,
        discardedEnergyCount: fxMeta.discardedEnergyCount ?? 0,
      });
    const hasNameDescription = !!String(atk?.description || '').trim();
    const skipVisual = !!fxMeta.skipVisual;
    const skipDamageApply = !!fxMeta.skipDamageApply;

    if (!skipVisual) {
      const previewDamage = this._previewAttackDamage(playerIndex, atk, ctx);
      const attackLethal =
        fxId === 'poseidon-trident-royal'
          ? this._wouldAttackKoActive(playerIndex, atk, ctx)
          : undefined;
      const visualWait = !this.headless
        ? this._waitForAttackVisual(fxId, hasNameDescription, { attackLethal })
        : null;
      this.anim('attackHit', {
        attackName: atk.name,
        label: atk.label,
        description: atk.description || '',
        damage: 0,
        pendingDamage: undefined,
        previewDamage,
        attackLethal,
        deferDamage: true,
        visualOnly: true,
        playerIndex,
        attackerName,
        attackerCardId: fxMeta.attackerCardId ?? p.active?.cardId,
        headsCount: ctx.headsCount ?? 0,
        tailsCount: ctx.tailsCount,
        coin: ctx.coin ?? null,
        discardedEnergyCount: fxMeta.discardedEnergyCount ?? 0,
        resultSummary: '',
      });
      if (visualWait) await visualWait;
    }

    let resultSummary = fxMeta.resultSummary ?? '';

    if (!skipDamageApply) {
      const phase = this.headless
        ? this._runAttackDamagePhaseSync(playerIndex, atk, ctx)
        : await this._runAttackDamagePhaseAsync(playerIndex, atk, ctx);
      damageDealt = phase.damageDealt;
      resultSummary = phase.resultSummary;
      this._deferredAttackCtx = null;
    } else {
      resultSummary =
        resultSummary || this._buildAttackResultSummary(atk, ctx, damageDealt);
    }

    if (this._attackFinishDeferredByPending()) {
      this._pendingAttackFinish = {
        playerIndex,
        atk,
        attackerName,
        fxMeta: {
          ...fxMeta,
          damageDealt,
          skipVisual: true,
          skipDamageApply: true,
          attackerCardId: fxMeta.attackerCardId ?? p.active?.cardId,
          resultSummary,
        },
      };
      this.emit();
      return;
    }

    if (!this.headless) {
      const hasResultDescription = !!String(resultSummary || '').trim();
      const resultWait = this._waitForAttackResult(hasResultDescription);
      this.anim('attackResult', {
        attackName: atk.name,
        label: atk.label,
        damage: damageDealt,
        resultSummary,
        playerIndex,
        attackerName,
      });
      await resultWait;
    }

    if (this.headless) {
      void this._resolvePendingAttackKnockOuts();
    } else {
      await this._resolvePendingAttackKnockOuts();
    }
    if (this.state.winner) {
      this.emit();
      return;
    }

    if (p.modifiers.nextAttackBenchBonus) {
      if (this._pendingBlocksCerbereAfterAttack(playerIndex)) {
        this._deferCerbereForPlayerIndex = playerIndex;
      } else {
        this.effects.applyCerbereBenchBonusAfterAttack(playerIndex);
      }
    }
    if (this._deferCerbereForPlayerIndex === playerIndex && !this.state.pending) {
      this._tryApplyDeferredCerbere();
    }
    if (this.state.winner) {
      this.emit();
      return;
    }

    if (this._attackFinishDeferredByPending()) {
      this._pendingAttackFinish = {
        playerIndex,
        atk,
        attackerName,
        fxMeta: {
          ...fxMeta,
          damageDealt,
          skipVisual: true,
          skipDamageApply: true,
          attackerCardId: fxMeta.attackerCardId ?? p.active?.cardId,
          resultSummary,
        },
      };
      this.emit();
      return;
    }

    if (this.isAttackTestMode) {
      this.actions.attack = false;
    }

    this.emit();
    if (!this.state.pending) this.scheduleAutoEndTurn(playerIndex);
    if (this._damageAttribution?.playerIndex === playerIndex) {
      this._damageAttribution = null;
    }
  }

  _attackFxDurationMs(fxId, opts = {}) {
    return attackFxDurationMs(fxId, RULES.ui?.attackFxMs ?? 2800, opts);
  }

  /** Expected damage before HP apply (coin flips in ctx, no mitigation). */
  _previewAttackDamage(playerIndex, atk, ctx) {
    let damage = this.effects.computeAttackDamage(playerIndex, atk, ctx);
    if (
      atk.effects?.some((e) => e.type === 'attack_miss_on_tails') &&
      ctx.coin === RULES.coin.tails
    ) {
      damage = 0;
    }
    return damage;
  }

  /** True when preview damage would reduce the defender's active to 0 HP or below. */
  _wouldAttackKoActive(playerIndex, atk, ctx) {
    const opp = this.state.players[1 - playerIndex];
    if (!opp?.active) return false;
    const damage = this._previewAttackDamage(playerIndex, atk, ctx);
    if (damage <= 0) return false;
    if (this.effects.attackSkipsDamageToKnight?.(atk, opp.active)) return false;
    return damage >= opp.active.currentHp;
  }

  queueAttackKnockOut(player, knight, options = {}) {
    const resolvedKnight = resolveFieldKnight(player, knight) || knight;
    if (!resolvedKnight) return;
    const queue = (this._pendingAttackKnockOuts ||= []);
    if (queue.some((entry) => entry.knightInstanceId === resolvedKnight.instanceId)) return;
    queue.push({
      playerIndex: player.index,
      knightInstanceId: resolvedKnight.instanceId,
      knight: resolvedKnight,
      options: { ...options },
    });
  }

  cancelPendingKnockOutForInstance(knightInstanceId) {
    if (!this._pendingAttackKnockOuts?.length || !knightInstanceId) return;
    this._pendingAttackKnockOuts = this._pendingAttackKnockOuts.filter(
      (entry) => entry.knightInstanceId !== knightInstanceId,
    );
  }

  async _resolvePendingAttackKnockOuts() {
    const queue = this._pendingAttackKnockOuts;
    if (!queue?.length) return;
    this._pendingAttackKnockOuts = [];
    for (const item of queue) {
      const victim = this.state.players[item.playerIndex];
      if (!victim) continue;
      const victimKnight =
        item.knight ||
        (victim.active?.instanceId === item.knightInstanceId
          ? victim.active
          : victim.bench.find((k) => k?.instanceId === item.knightInstanceId));
      if (!victimKnight || victimKnight.currentHp > 0) continue;
      await this.knockOut(victim, victimKnight, item.options || {});
      if (this.state.winner) return;
    }
  }

  _queueOrKnockOutOnLethalDamage(player, knight, source, attackerOptions = {}) {
    const knightDef = getCardDef(knight.cardId);
    const julianReveal =
      knightDef?.id === POSEIDON_CARD_IDS.JULIAN_SOLO && knight.underCard;
    if (source === 'attack' && !julianReveal) {
      const detached = this._detachKnightFromField(player, knight);
      if (!detached.removed) return;
      this.queueAttackKnockOut(player, detached.knight, {
        source,
        noPrize: this._attackKoNoPrize || false,
        fieldRemoved: true,
        wasActive: detached.wasActive,
      });
      return;
    }
    if (source === 'attack') {
      this.queueAttackKnockOut(player, knight, {
        source,
        noPrize: this._attackKoNoPrize || false,
      });
      return;
    }
    void this.knockOut(player, knight, { source, ...attackerOptions });
  }

  shouldAutoEndTurnFor(playerIndex) {
    if (this.isAttackTestMode) return false;
    if (this.state.winner || this.state.phase !== 'main') return false;
    if (this.gameMode === 'local2p') return playerIndex === this.state.turn;
    return this.aiEnabled && playerIndex === 0;
  }

  scheduleAutoEndTurn(playerIndex, { afterPromote = false } = {}) {
    if (!this.shouldAutoEndTurnFor(playerIndex)) return;
    clearTimeout(this._autoEndTurnTimer);
    const gapMs = RULES.ui?.actionGapMs ?? 600;
    const animMs = afterPromote
      ? gapMs
      : (RULES.ui?.autoEndTurnAfterAttackMs ?? 1650) + gapMs;
    this._autoEndTurnTimer = setTimeout(() => {
      this._autoEndTurnTimer = null;
      if (!this.shouldAutoEndTurnFor(playerIndex)) return;
      if (this.state.turn !== playerIndex || this.state.winner || this.state.pending) return;
      if (!this.actions.attack) return;
      void this.endTurn();
    }, animMs);
  }

  maybeScheduleAutoEndTurnAfterPromote() {
    const attacker = this._autoEndTurnAfterPromote;
    this._autoEndTurnAfterPromote = null;
    if (attacker == null || this.state.winner || this.state.pending) return;
    if (this.state.turn !== attacker || !this.actions.attack) return;
    if (this.isAiControlled(attacker)) {
      clearTimeout(this._aiResumeTimer);
      this._scheduleLater(() => this.aiResumeAfterPending());
      return;
    }
    this.scheduleAutoEndTurn(attacker, { afterPromote: true });
  }

  countAllEnergies(playerIndex) {
    const p = this.state.players[playerIndex];
    let n = 0;
    if (p.active) n += p.active.energies.length;
    p.bench.forEach((b) => (n += b.energies.length));
    return n;
  }

  discardForPending(playerIndex, handIndex) {
    const pending = this.state.pending;
    if (!pending || pending.type !== 'discardForAttack' || pending.playerIndex !== playerIndex) return false;
    const p = this.state.players[playerIndex];
    const card = p.hand[handIndex];
    if (!card) return false;
    p.hand.splice(handIndex, 1);
    p.discard.push(card);
    pending.remaining = (pending.remaining ?? 1) - 1;
    this.feedback('Carte défaussée.', 'attack');
    if (pending.remaining > 0) {
      this.feedback(`Encore ${pending.remaining} carte(s) à défausser.`, 'attack');
      this.emit();
      return true;
    }
    const thenDraw = pending.thenDraw;
    this.state.pending = null;
    if (thenDraw) {
      void this.draw(p, thenDraw).then(() => {
        this.feedback(`Savoir : pioche de ${thenDraw} carte(s).`, 'turn');
        this.emit();
      });
    }
    if (this._pendingAttackFinish?.playerIndex === playerIndex) {
      const { atk, attackerName } = this._pendingAttackFinish;
      this._pendingAttackFinish = null;
      this.finishAttack(playerIndex, atk, attackerName, 0, {
        attackerCardId: this.state.players[playerIndex].active?.cardId,
      });
    } else if (
      this.actions.attack &&
      !this.state.pending &&
      this.shouldAutoEndTurnFor(playerIndex)
    ) {
      this.scheduleAutoEndTurn(playerIndex);
    }
    this.emit();
    return true;
  }

  applyStatus(player, knight, statusId) {
    knight = resolveFieldKnight(player, knight);
    if (!knight) return;
    if (this.effects.knightHasImmuneStatus(knight, statusId, player.index)) {
      this.feedback(
        `${getCardDef(knight.cardId).name} est immunisé contre ${RULES.status[statusId]?.label || statusId}.`,
        'status',
      );
      return;
    }
    if (!knight.statuses.includes(statusId)) knight.statuses.push(statusId);
    this.anim('status', { status: statusId });
    this.feedback(`${RULES.status[statusId].label} appliqué.`, 'status');
  }

  applyToolPassiveDamageReduction(knight, dmg) {
    if (!knight?.attachedTool) return dmg;
    const toolDef = getCardDef(knight.attachedTool.cardId);
    for (const eff of toolDef?.passiveEffects || []) {
      if (eff.type === 'reduce_damage_taken' || eff.type === 'reduce_damage_taken_next_turn') {
        dmg = Math.max(0, dmg - (eff.amount || 0));
      }
    }
    return dmg;
  }

  damageKnight(
    player,
    knight,
    amount,
    source = 'damage',
    attackerPlayerIndex = null,
    attackerCardId = null,
  ) {
    if (this._attackPipelineActive) {
      return this._damageKnightAsync(
        player,
        knight,
        amount,
        source,
        attackerPlayerIndex,
        attackerCardId,
      );
    }
    return this._damageKnightSync(
      player,
      knight,
      amount,
      source,
      attackerPlayerIndex,
      attackerCardId,
    );
  }

  async _damageKnightAsync(
    player,
    knight,
    amount,
    source = 'damage',
    attackerPlayerIndex = null,
    attackerCardId = null,
  ) {
    knight = resolveFieldKnight(player, knight);
    if (!knight) return 0;
    knight = this.effects.resolveSeiyaProtectorRedirect(player, knight);
    knight = resolveFieldKnight(player, knight);
    if (!knight) return 0;
    if (amount <= 0 && source !== 'attack') return 0;

    if (
      source === 'attack' &&
      attackerPlayerIndex != null &&
      player.active &&
      knight.instanceId === player.active.instanceId
    ) {
      const atkName = this.state.players[attackerPlayerIndex]?._currentAttackName;
      const redirect = this.effects.tryMentalImageRedirect(
        player,
        knight,
        amount,
        attackerPlayerIndex,
        atkName,
      );
      if (redirect?.redirectKnight) {
        knight = redirect.redirectKnight;
      }
    }

    const skipMitigation =
      source === 'attack' &&
      attackerPlayerIndex != null &&
      attackerPlayerIndex !== player.index &&
      this._ignoreOpponentDamageMitigation;

    if (
      !skipMitigation &&
      source === 'attack' &&
      attackerPlayerIndex != null &&
      attackerPlayerIndex !== player.index &&
      attackerPlayerIndex === this.state.turn
    ) {
      const mur = player.modifiers.pendingMurCrystal;
      const murTargetsKnight =
        !mur?.shieldKnightInstanceId || mur.shieldKnightInstanceId === knight.instanceId;
      if (mur && mur.opponentTurnIndex === this.state.turn && murTargetsKnight) {
        const c = await this.awaitFlipCoinWithUI('Mur de Cristal — défense');
        player.modifiers.pendingMurCrystal = null;
        this.feedback(`Mur de Cristal — pièce : ${formatCoinFlipResult(c)}`, 'coin');
        this.anim('murCrystalDefense', {
          playerIndex: player.index,
          knightInstanceId: knight.instanceId,
          coin: c,
        });
        if (c === RULES.coin.heads) {
          this.feedback(
            `Mur de Cristal (face) : attaque annulée, ${mur.counterDamage || 30} dégâts à l'actif adverse.`,
            'status',
          );
          const attacker = this.state.players[attackerPlayerIndex];
          let counterDealt = 0;
          if (attacker?.active && (mur.counterDamage || 0) > 0) {
            counterDealt = await this._damageKnightAsync(
              attacker,
              attacker.active,
              mur.counterDamage,
              'counter',
              player.index,
              null,
            );
          }
          this._murCrystalDefenseResult = {
            coin: c,
            blocked: true,
            reduced: 0,
            counterDealt,
          };
          return 0;
        }
        const pileReduce = mur.reduceOnPile ?? 40;
        amount = Math.max(0, amount - pileReduce);
        this.feedback(`Mur de Cristal (pile) : −${pileReduce} dégâts.`, 'status');
        this._murCrystalDefenseResult = {
          coin: c,
          blocked: false,
          reduced: pileReduce,
          counterDealt: 0,
        };
      }
    }

    if (!skipMitigation && knight.modifiers.blockNextAttack && source === 'attack') {
      const counter = knight.modifiers.counterOnBlock || 0;
      knight.modifiers.blockNextAttack = false;
      knight.modifiers.counterOnBlock = 0;
      this.feedback('Mur de Cristal : attaque annulée.', 'status');
      if (counter > 0 && attackerPlayerIndex != null) {
        const attacker = this.state.players[attackerPlayerIndex];
        if (attacker?.active) {
          this.damageKnight(
            attacker,
            attacker.active,
            counter,
            'counter',
            player.index,
            knight.cardId,
          );
        }
      }
      return 0;
    }

    let dmg = amount;
    if (source === 'attack' && attackerPlayerIndex != null) {
      const def = getCardDef(knight.cardId);
      if (!skipMitigation) {
        const whenAttacked = def?.talent?.effects?.find((e) => e.type === 'when_attacked_coin_flip');
        if (whenAttacked && !this.effects.isTalentSilenced(knight, player.index)) {
          const c = await this.awaitFlipCoinWithUI('Armure de cristal — talent défensif');
          this.feedback(`Armure de cristal — pièce : ${formatCoinFlipResult(c)}`, 'coin');
          if (c === RULES.coin.heads && whenAttacked.reduceOnHeads) {
            dmg = Math.max(0, dmg - (whenAttacked.reduceOnHeads || 0));
            if (whenAttacked.reduceOnHeads) {
              this.feedback(`−${whenAttacked.reduceOnHeads} dégâts (face).`, 'status');
            }
          } else if (c === RULES.coin.tails && whenAttacked.blockOnTails) {
            this.feedback('Armure de cristal : attaque bloquée (pile).', 'status');
            return 0;
          }
        }
        dmg = this.effects.applyBenchDamageReduction(
          player.index,
          dmg,
          player.bench.some((k) => k?.instanceId === knight.instanceId)
            ? { benchOnly: true }
            : { activeOnly: true },
        );
        const gardeEff = def?.talent?.effects?.find(
          (e) => e.type === 'reduce_damage_if_did_not_attack_last_turn',
        );
        if (gardeEff && !this.effects.isTalentSilenced(knight, player.index) && !knight.attackedLastTurn) {
          const reduction = gardeEff.amount || 40;
          dmg = Math.max(0, dmg - reduction);
          this.feedback(`Garde : −${reduction} dégâts.`, 'status');
        }
      }
    }
    const reflectStored = knight.modifiers.reflectDamage || 0;
    if (knight.modifiers.reduceDamage && !skipMitigation) {
      dmg = Math.max(0, dmg - knight.modifiers.reduceDamage);
    }
    if (!skipMitigation) {
      dmg = this.effects.applyKrishnaFoiAbsolueReduction(player.index, knight, dmg);
    }
    if (knight.modifiers.extraDamageTaken) {
      dmg += knight.modifiers.extraDamageTaken;
      if (!knight.modifiers.extraDamageTakenUntilOwnerTurn) {
        knight.modifiers.extraDamageTaken = 0;
      }
    }
    if (!skipMitigation && knight.modifiers.immuneDamageNextTurn && source === 'attack') {
      knight.modifiers.immuneDamageNextTurn = false;
      this.feedback('Illusion musicale : aucun dégât ce tour.', 'status');
      return 0;
    }
    if (!skipMitigation) {
      dmg = this.applyToolPassiveDamageReduction(knight, dmg);
    }
    if (source === 'attack' && !skipMitigation) {
      dmg = this.effects.applySoloCombatDamageReduction(player.index, knight, dmg);
    }
    if (source === 'attack' && attackerPlayerIndex != null && !skipMitigation) {
      dmg = this.effects.applyBaianMurAirReduction(
        player.index,
        knight,
        dmg,
        attackerPlayerIndex,
      );
    }
    if (source === 'attack' && !skipMitigation) {
      dmg = this.effects.applyBaianMurDeDieuReduction(player.index, knight, dmg);
    }
    if (dmg <= 0) return 0;

    const def = getCardDef(knight.cardId);
    if (
      !skipMitigation &&
      def?.talent?.effects?.some((e) => e.type === 'reduce_damage_if_no_markers')
    ) {
      const eff = def.talent.effects.find((e) => e.type === 'reduce_damage_if_no_markers');
      if (this.effects.countDamageMarkers(knight) === 0) {
        dmg = Math.max(0, dmg - (eff.amount || 30));
      }
    }

    knight.currentHp -= dmg;
    this.anim('damage', {
      amount: dmg,
      knightId: knight.instanceId,
      playerIndex: player.index,
      skipShake: !!this._damageAnimSkipShake,
      skipSound: !!this._damageAnimSkipSound,
    });
    this.feedback(`${getCardDef(knight.cardId).name} : -${dmg} PV`, 'damage');

    if (source === 'attack' && reflectStored > 0 && attackerPlayerIndex != null) {
      this.effects.applyReflectDamage(knight, player, reflectStored, attackerPlayerIndex);
    }

    this.effects.applyMinHpThreshold(knight, def);

    if (dmg > 0 && this.matchStats) {
      let dealerIndex = attackerPlayerIndex;
      let dealerCardId = attackerCardId;
      if (dealerIndex == null && source === 'attack' && this._damageAttribution) {
        dealerIndex = this._damageAttribution.playerIndex;
        dealerCardId = dealerCardId ?? this._damageAttribution.cardId;
      }
      if (dealerCardId == null && dealerIndex != null && source === 'attack') {
        dealerCardId = this.state.players[dealerIndex]?.active?.cardId ?? null;
      }
      this.matchStats.recordDamage({
        victimPlayerIndex: player.index,
        amount: dmg,
        source,
        attackerPlayerIndex: dealerIndex,
        attackerCardId: dealerCardId,
      });
    }

    if (knight.currentHp <= 0) {
      if (this.effects.markSunreiPendingRevive(player, knight)) {
        return dmg;
      }
      if (this.isAttackTestMode && player.index === 1) {
        knight.currentHp = 1;
        return dmg;
      }
      this._queueOrKnockOutOnLethalDamage(player, knight, source);
    }
    return dmg;
  }

  _damageKnightSync(
    player,
    knight,
    amount,
    source = 'damage',
    attackerPlayerIndex = null,
    attackerCardId = null,
  ) {
    knight = resolveFieldKnight(player, knight);
    if (!knight) return 0;
    knight = this.effects.resolveSeiyaProtectorRedirect(player, knight);
    knight = resolveFieldKnight(player, knight);
    if (!knight) return 0;
    if (amount <= 0 && source !== 'attack') return 0;

    if (
      source === 'attack' &&
      attackerPlayerIndex != null &&
      player.active &&
      knight.instanceId === player.active.instanceId
    ) {
      const atkName = this.state.players[attackerPlayerIndex]?._currentAttackName;
      const redirect = this.effects.tryMentalImageRedirect(
        player,
        knight,
        amount,
        attackerPlayerIndex,
        atkName,
      );
      if (redirect?.redirectKnight) {
        knight = redirect.redirectKnight;
      }
    }

    const skipMitigation =
      source === 'attack' &&
      attackerPlayerIndex != null &&
      attackerPlayerIndex !== player.index &&
      this._ignoreOpponentDamageMitigation;

    if (
      !skipMitigation &&
      source === 'attack' &&
      attackerPlayerIndex != null &&
      attackerPlayerIndex !== player.index &&
      attackerPlayerIndex === this.state.turn
    ) {
      const mur = player.modifiers.pendingMurCrystal;
      const murTargetsKnight =
        !mur?.shieldKnightInstanceId || mur.shieldKnightInstanceId === knight.instanceId;
      if (mur && mur.opponentTurnIndex === this.state.turn && murTargetsKnight) {
        const c = this.flipCoinWithUI('Mur de Cristal — défense');
        player.modifiers.pendingMurCrystal = null;
        this.feedback(`Mur de Cristal — pièce : ${formatCoinFlipResult(c)}`, 'coin');
        this.anim('murCrystalDefense', {
          playerIndex: player.index,
          knightInstanceId: knight.instanceId,
          coin: c,
        });
        if (c === RULES.coin.heads) {
          this.feedback(
            `Mur de Cristal (face) : attaque annulée, ${mur.counterDamage || 30} dégâts à l'actif adverse.`,
            'status',
          );
          const attacker = this.state.players[attackerPlayerIndex];
          let counterDealt = 0;
          if (attacker?.active && (mur.counterDamage || 0) > 0) {
            counterDealt = this.damageKnight(
              attacker,
              attacker.active,
              mur.counterDamage,
              'counter',
              player.index,
              null,
            );
          }
          this._murCrystalDefenseResult = {
            coin: c,
            blocked: true,
            reduced: 0,
            counterDealt,
          };
          return 0;
        }
        const pileReduce = mur.reduceOnPile ?? 40;
        amount = Math.max(0, amount - pileReduce);
        this.feedback(`Mur de Cristal (pile) : −${pileReduce} dégâts.`, 'status');
        this._murCrystalDefenseResult = {
          coin: c,
          blocked: false,
          reduced: pileReduce,
          counterDealt: 0,
        };
      }
    }

    if (!skipMitigation && knight.modifiers.blockNextAttack && source === 'attack') {
      const counter = knight.modifiers.counterOnBlock || 0;
      knight.modifiers.blockNextAttack = false;
      knight.modifiers.counterOnBlock = 0;
      this.feedback('Mur de Cristal : attaque annulée.', 'status');
      if (counter > 0 && attackerPlayerIndex != null) {
        const attacker = this.state.players[attackerPlayerIndex];
        if (attacker?.active) {
          this.damageKnight(
            attacker,
            attacker.active,
            counter,
            'counter',
            player.index,
            knight.cardId,
          );
        }
      }
      return 0;
    }

    let dmg = amount;
    if (source === 'attack' && attackerPlayerIndex != null) {
      const def = getCardDef(knight.cardId);
      if (!skipMitigation) {
        const whenAttacked = def?.talent?.effects?.find((e) => e.type === 'when_attacked_coin_flip');
        if (whenAttacked && !this.effects.isTalentSilenced(knight, player.index)) {
          const c = this.flipCoinWithUI('Armure de cristal — talent défensif');
          this.feedback(`Armure de cristal — pièce : ${formatCoinFlipResult(c)}`, 'coin');
          if (c === RULES.coin.heads && whenAttacked.reduceOnHeads) {
            dmg = Math.max(0, dmg - (whenAttacked.reduceOnHeads || 0));
            if (whenAttacked.reduceOnHeads) {
              this.feedback(`−${whenAttacked.reduceOnHeads} dégâts (face).`, 'status');
            }
          } else if (c === RULES.coin.tails && whenAttacked.blockOnTails) {
            this.feedback('Armure de cristal : attaque bloquée (pile).', 'status');
            return 0;
          }
        }
        dmg = this.effects.applyBenchDamageReduction(
          player.index,
          dmg,
          player.bench.some((k) => k?.instanceId === knight.instanceId)
            ? { benchOnly: true }
            : { activeOnly: true },
        );
        const gardeEff = def?.talent?.effects?.find(
          (e) => e.type === 'reduce_damage_if_did_not_attack_last_turn',
        );
        if (gardeEff && !this.effects.isTalentSilenced(knight, player.index) && !knight.attackedLastTurn) {
          const reduction = gardeEff.amount || 40;
          dmg = Math.max(0, dmg - reduction);
          this.feedback(`Garde : −${reduction} dégâts.`, 'status');
        }
      }
    }
    const reflectStored = knight.modifiers.reflectDamage || 0;
    if (knight.modifiers.reduceDamage && !skipMitigation) {
      dmg = Math.max(0, dmg - knight.modifiers.reduceDamage);
    }
    if (!skipMitigation) {
      dmg = this.effects.applyKrishnaFoiAbsolueReduction(player.index, knight, dmg);
    }
    if (knight.modifiers.extraDamageTaken) {
      dmg += knight.modifiers.extraDamageTaken;
      if (!knight.modifiers.extraDamageTakenUntilOwnerTurn) {
        knight.modifiers.extraDamageTaken = 0;
      }
    }
    if (!skipMitigation && knight.modifiers.immuneDamageNextTurn && source === 'attack') {
      knight.modifiers.immuneDamageNextTurn = false;
      this.feedback('Illusion musicale : aucun dégât ce tour.', 'status');
      return 0;
    }
    if (!skipMitigation) {
      dmg = this.applyToolPassiveDamageReduction(knight, dmg);
    }
    if (source === 'attack' && !skipMitigation) {
      dmg = this.effects.applySoloCombatDamageReduction(player.index, knight, dmg);
    }
    if (source === 'attack' && attackerPlayerIndex != null && !skipMitigation) {
      dmg = this.effects.applyBaianMurAirReduction(
        player.index,
        knight,
        dmg,
        attackerPlayerIndex,
      );
    }
    if (source === 'attack' && !skipMitigation) {
      dmg = this.effects.applyBaianMurDeDieuReduction(player.index, knight, dmg);
    }
    if (dmg <= 0) return 0;

    const def = getCardDef(knight.cardId);
    if (
      !skipMitigation &&
      def?.talent?.effects?.some((e) => e.type === 'reduce_damage_if_no_markers')
    ) {
      const eff = def.talent.effects.find((e) => e.type === 'reduce_damage_if_no_markers');
      if (this.effects.countDamageMarkers(knight) === 0) {
        dmg = Math.max(0, dmg - (eff.amount || 30));
      }
    }

    knight.currentHp -= dmg;
    this.anim('damage', {
      amount: dmg,
      knightId: knight.instanceId,
      playerIndex: player.index,
      skipShake: !!this._damageAnimSkipShake,
      skipSound: !!this._damageAnimSkipSound,
    });
    this.feedback(`${getCardDef(knight.cardId).name} : -${dmg} PV`, 'damage');

    if (source === 'attack' && reflectStored > 0 && attackerPlayerIndex != null) {
      this.effects.applyReflectDamage(knight, player, reflectStored, attackerPlayerIndex);
    }

    this.effects.applyMinHpThreshold(knight, def);

    if (dmg > 0 && this.matchStats) {
      let dealerIndex = attackerPlayerIndex;
      let dealerCardId = attackerCardId;
      if (dealerIndex == null && source === 'attack' && this._damageAttribution) {
        dealerIndex = this._damageAttribution.playerIndex;
        dealerCardId = dealerCardId ?? this._damageAttribution.cardId;
      }
      if (dealerCardId == null && dealerIndex != null && source === 'attack') {
        dealerCardId = this.state.players[dealerIndex]?.active?.cardId ?? null;
      }
      this.matchStats.recordDamage({
        victimPlayerIndex: player.index,
        amount: dmg,
        source,
        attackerPlayerIndex: dealerIndex,
        attackerCardId: dealerCardId,
      });
    }

    if (knight.currentHp <= 0) {
      if (this.effects.markSunreiPendingRevive(player, knight)) {
        return dmg;
      }
      if (this.isAttackTestMode && player.index === 1) {
        knight.currentHp = 1;
        return dmg;
      }
      this._queueOrKnockOutOnLethalDamage(player, knight, source);
    }
    return dmg;
  }

  prizeRevealDurationMs(playerIndex) {
    return this.drawRevealDurationMs(playerIndex);
  }

  /** Calcule et met en file les Récompenses KO (synchrone — avant tout await). */
  _computeAndQueueKnockOutPrizes(player, knight, options) {
    const { isActive, koBy } = options;
    const taker = this.state.players[koBy];
    const victimDef = getCardDef(knight.cardId);
    let prizeCount = options.noPrize ? 0 : getPrizeCountForKnockout(victimDef);
    const victimBonusPrize = this.effects.getBonusPrizeWhenKnockedOut(victimDef);
    if (!options.noPrize && victimBonusPrize > 0) {
      prizeCount += victimBonusPrize;
      this.feedback(`+${victimBonusPrize} Récompense (talent).`, 'prize');
    }
    const zelosAdj = this.effects.getZelosCowardPrizeAdjustments(
      player,
      knight,
      taker,
      isActive,
    );
    if (!options.noPrize && zelosAdj.bonus > 0) {
      prizeCount += zelosAdj.bonus;
      this.feedback(`Zelos : +${zelosAdj.bonus} Récompense.`, 'prize');
    }
    if (!options.noPrize && zelosAdj.reduce > 0) {
      prizeCount = Math.max(0, prizeCount - zelosAdj.reduce);
      this.feedback(`Zelos : −${zelosAdj.reduce} Récompense.`, 'prize');
    }
    if (!options.noPrize && options.source === 'attack') {
      const killer = this.state.players[koBy];
      const bonusPrize = this.effects.getAttackerBonusPrizeOnKnockout(killer?.active);
      if (bonusPrize > 0) {
        prizeCount += bonusPrize;
        this.feedback(`Saphir d'Odin : +${bonusPrize} Récompense.`, 'prize');
      }
    }
    if (!options.noPrize && isActive && player.modifiers?.opponentActiveKoPrizeReduce > 0) {
      const reduce = player.modifiers.opponentActiveKoPrizeReduce;
      prizeCount = Math.max(0, prizeCount - reduce);
      player.modifiers.opponentActiveKoPrizeReduce = 0;
      if (reduce > 0) {
        this.feedback('Sacrifice : −1 Récompense pour l\'adversaire.', 'prize');
      }
    }
    if (!options.noPrize) {
      prizeCount = this.adjustKnockoutPrizeCount(prizeCount, victimDef);
      if (prizeCount < getPrizeCountForKnockout(victimDef)) {
        this.feedback('Puits des Âmes : 1 Récompense de moins.', 'stadium');
      }
    } else {
      this.feedback('KO sans Récompense.', 'prize');
    }
    if (prizeCount === 0 && !options.noPrize) {
      this.feedback('Sans valeur : aucune Récompense prise.', 'prize');
    }
    if (
      victimDef?.talent?.effects?.some((e) => e.type === 'return_prize_on_knockout') &&
      player.prizes.length
    ) {
      const returned = player.prizes.pop();
      player.hand.push(returned);
      this.feedback('Shakka : une Récompense récupérée en main.', 'prize');
    }
    const deferPrizes = !options.noPrize && options.immediatePrizes !== true;
    if (deferPrizes && prizeCount > 0) {
      taker.modifiers.pendingPrizesAtEndTurn =
        (taker.modifiers.pendingPrizesAtEndTurn || 0) + prizeCount;
      this.feedback(
        `${prizeCount} Récompense(s) à prendre à la fin du tour.`,
        'prize',
      );
      return { gameOver: false };
    }
    if (prizeCount > 0) {
      return { gameOver: false, takeNow: { taker, prizeCount } };
    }
    return { gameOver: false };
  }

  /** Prend jusqu'à `count` récompenses ; retourne true si la partie est gagnée. */
  async takePrizes(taker, count) {
    let taken = 0;
    for (let i = 0; i < count; i++) {
      if (taker.prizes.length === 0) break;
      const prize = taker.prizes.pop();
      taker.prizesTaken++;
      taken++;
      this.anim('prizeTake', { cardId: prize.cardId, playerIndex: taker.index });
      await this.pause(this.prizeRevealDurationMs(taker.index));
      taker.hand.push(prize);
      this.trimHand(taker);
      this.emit();
      if (taker.prizesTaken >= RULES.prizeCount) {
        this.state.winner = taker.index;
        this.state.phase = 'gameOver';
        this.feedback(`${taker.name} gagne la partie !`, 'win');
        return true;
      }
    }
    if (taken > 0) {
      const label =
        taken > 1 ? `${taken} Récompenses` : 'une Récompense';
      this.feedback(`${taker.name} prend ${label} !`, 'prize');
    }
    return false;
  }

  async knockOut(player, knight, options = {}) {
    const onField = resolveFieldKnight(player, knight);
    knight = onField || (options.fieldRemoved ? knight : null);
    if (!knight) return;
    const knightDef = getCardDef(knight.cardId);
    if (knightDef?.id === POSEIDON_CARD_IDS.JULIAN_SOLO && knight.underCard) {
      await this.effects.revealJulianToPoseidon(player, knight, options);
      return;
    }
    if (knight.modifiers?.noPrizeOnKO) {
      options = { ...options, noPrize: true };
    }
    if (this.isAttackTestMode && player.index === 1) {
      knight.currentHp = knight.maxHp;
      this.emit();
      return;
    }
    const isActive = options.fieldRemoved
      ? !!options.wasActive
      : player.active?.instanceId === knight.instanceId;
    const koBy = 1 - player.index;
    this.effects.applyFlipPrizesOnKoActive(koBy, player, knight, isActive);
    if (this.matchStats) {
      this.matchStats.recordKnockOut({
        victimPlayerIndex: player.index,
        turnCount: this.state.turnCount || 0,
      });
    }
    if (options.source === 'attack') {
      player.koBonusNextTurn = true;
    }

    if (!options.fieldRemoved) {
      if (isActive) {
        player.active = null;
      } else {
        player.bench = player.bench.filter((b) => b.instanceId !== knight.instanceId);
      }
      this.emit();
    }

    const prizeOutcome = this._computeAndQueueKnockOutPrizes(player, knight, {
      ...options,
      isActive,
      koBy,
    });

    const cardBack = { cardId: knight.cardId, instanceId: knight.cardInstanceId };
    player.discard.push(cardBack);
    await this.resolveKnightToolOnKnockout(player, knight);
    knight.energies.forEach((e) => player.discard.push({ cardId: e.cardId, instanceId: e.instanceId }));

    this.feedback(`${getCardDef(knight.cardId).name} est KO !`, 'ko');
    if (!options.fieldRemoved) {
      this.anim('ko', { cardId: knight.cardId, knightId: knight.instanceId, fieldRemoved: true });
      const koPause = RULES.ui?.koFxMs ?? RULES.ui?.genericAnimMs ?? 1200;
      await this.pause(koPause);
    }
    this.emit();

    if (prizeOutcome.gameOver) {
      this.emit();
      return;
    }
    if (prizeOutcome.takeNow) {
      const gameOver = await this.takePrizes(
        prizeOutcome.takeNow.taker,
        prizeOutcome.takeNow.prizeCount,
      );
      if (gameOver) {
        this.emit();
        return;
      }
    }

    if (isActive) {
      const killer = this.state.players[koBy];
      if (killer.active) {
        await this.effects.applyHealOnKnockout(killer, killer.active);
      }
      if (player.bench.length > 0) {
        clearTimeout(this._autoEndTurnTimer);
        this._autoEndTurnTimer = null;
        if (this.actions.attack && koBy === this.state.turn) {
          this._autoEndTurnAfterPromote = koBy;
        }
        this.state.pending = {
          type: 'promoteActive',
          playerIndex: player.index,
        };
        if (koBy === this.state.turn && killer?.modifiers?.nextAttackBenchBonus) {
          this._deferCerbereForPlayerIndex = koBy;
        }
        this.feedback('KO : choisissez un chevalier du banc comme actif.', 'ko');
        this.emit();
        void this.resumeAfterKnockOutPromote(player.index);
        return;
      } else if (this.tryWinByNoFieldChevaliers(player.index)) {
        this.emit();
        return;
      }
    } else if (this.tryWinByNoFieldChevaliers(player.index)) {
      this.emit();
      return;
    }
    this.emit();
  }

  async resumeAfterKnockOutPromote(victimIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'promoteActive' || pending.playerIndex !== victimIndex) return;

    if (this.isAiControlled(victimIndex)) {
      await this.pause(RULES.ai.thinkMs);
      if (
        this.state.pending?.type === 'promoteActive' &&
        this.state.pending.playerIndex === victimIndex
      ) {
        this.resolveAiPromoteActive(victimIndex);
      }
      this.scheduleAiResumeAfterPromote();
    }
  }

  scheduleAiResumeAfterPromote() {
    const pi = this.currentAiPlayerIndex;
    if (this.state.winner || this.state.turn !== pi || this.state.phase !== 'main') return;
    if (this.state.pending?.type === 'promoteActive') return;
    clearTimeout(this._aiResumeTimer);
    this._scheduleLater(() => this.aiResumeAfterPending());
  }

  promoteActive(playerIndex, benchIndex) {
    const pending = this.state.pending;
    if (pending?.type !== 'promoteActive' || pending.playerIndex !== playerIndex) {
      debugPromote('promoteActive rejected: pending mismatch', {
        playerIndex,
        benchIndex,
        pending,
      });
      return false;
    }

    const p = this.state.players[playerIndex];
    if (!p.bench[benchIndex]) {
      debugPromote('promoteActive rejected: empty bench slot', { playerIndex, benchIndex });
      return false;
    }
    const incoming = p.bench[benchIndex];
    if (!this.effects.canKnightBecomeActive(incoming)) {
      this.feedback('Aspros ne peut pas devenir actif sans Deuteros attaché.', 'warn');
      return false;
    }
    p.active = p.bench.splice(benchIndex, 1)[0];
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(p.active);
    this.state.pending = null;
    debugPromote('promoteActive ok', {
      playerIndex,
      benchIndex,
      cardId: p.active.cardId,
    });
    this.feedback(`${getCardDef(p.active.cardId).name} devient actif.`, 'play');
    this._tryApplyDeferredCerbere();
    this.emit();
    if (this._autoEndTurnAfterPromote != null) {
      this.maybeScheduleAutoEndTurnAfterPromote();
    } else if (this.isAiControlled(playerIndex)) {
      this.scheduleAiResumeAfterPromote();
    }
    return true;
  }

  pickAiBenchPromoteIndex(playerIndex = this.currentAiPlayerIndex) {
    return this.pickAiBenchPromoteIndexFor(playerIndex);
  }

  resolveAiPromoteActive(playerIndex = this.currentAiPlayerIndex) {
    const p = this.state.players[playerIndex];
    if (!p.bench.length) return false;
    const idx = this.pickAiBenchPromoteIndex(playerIndex);
    return this.promoteActive(playerIndex, idx);
  }

  /** Attend les effets de pioche asynchrones (supporters, etc.). */
  async _aiWaitForDrawEffects(maxSpins = 8000) {
    let spins = 0;
    while (this._drawEffectsInFlight > 0 && spins < maxSpins) {
      await delay(0);
      spins += 1;
    }
  }

  /** Attend la fin des animations d'attaque / KO en mode headless. */
  async _aiWaitForCombatIdle(maxSpins = 200) {
    let spins = 0;
    while (
      (this._attackVisualResolve ||
        this._attackResultResolve ||
        this._coinFlipDoneResolve ||
        this._pendingAttackKnockOuts?.length) &&
      spins < maxSpins
    ) {
      await delay(0);
      spins += 1;
    }
    if (this._pendingAttackKnockOuts?.length) {
      await this._resolvePendingAttackKnockOuts();
    }
  }

  /** Attend les reprises IA / fin de tour différées (headless inclus). */
  async _aiWaitForScheduled(maxSpins = 8000) {
    let spins = 0;
    while ((this._aiResumeTimer || this._autoEndTurnTimer) && spins < maxSpins) {
      await delay(0);
      spins += 1;
    }
    await this._aiWaitForCombatIdle();
  }

  /** Joueur devant trancher sur le pending courant (chooser prioritaire). */
  _pendingActorIndex(pending = this.state.pending) {
    if (!pending) return null;
    if (pending.type === 'promoteActive') return pending.playerIndex ?? null;
    return pending.chooserPlayerIndex ?? pending.playerIndex ?? null;
  }

  /** Résout synchrone un pending pour un joueur IA (headless / ai-battle). */
  resolveAiPendingFor(playerIndex) {
    const pending = this.state.pending;
    if (!pending || !this.isAiControlled(playerIndex)) return false;

    switch (pending.type) {
      case 'promoteActive':
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveAiPromoteActive(playerIndex);

      case 'discardForAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        if (!p.hand.length) {
          this.state.pending = null;
          this.emit();
          return true;
        }
        const idx = this._aiIsHardTier()
          ? this._aiPickDiscardIndexForAttack(playerIndex)
          : Math.floor(Math.random() * p.hand.length);
        return this.discardForPending(playerIndex, idx);
      }

      case 'optionalDiscardHandDraw':
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveOptionalDiscardHandDraw(
          playerIndex,
          this._aiShouldOptionalDiscardHandDraw(this.state.players[playerIndex]),
        );

      case 'revealOpponentHand': {
        if (pending.playerIndex !== playerIndex) return false;
        const opp = this.state.players[1 - playerIndex];
        if (!opp.hand.length) {
          this.state.pending = null;
          this.emit();
          return true;
        }
        const pick =
          this.aiCheatLevel === 'full_info'
            ? pickRevealOpponentHandCard(this, playerIndex, opp.hand)
            : opp.hand[Math.floor(Math.random() * opp.hand.length)];
        return this.resolveRevealOpponentHandShuffle(playerIndex, (pick ?? opp.hand[0]).instanceId);
      }

      case 'searchDeck':
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveAiSearchDeck(playerIndex);

      case 'pickDisableOpponentAttack':
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveAiPickDisableOpponentAttack(playerIndex);

      case 'moveEnergy': {
        if (pending.playerIndex !== playerIndex) return false;
        const fromTarget = pending.fromTarget;
        let toTarget = this._aiBestEnergyTarget(playerIndex) ?? (fromTarget === 'active' ? 0 : 'active');
        if (toTarget === fromTarget) {
          const bench = this.state.players[playerIndex].bench;
          toTarget = fromTarget === 'active' ? (bench.length ? 0 : 'active') : 'active';
        }
        return this.resolveMoveEnergy(playerIndex, toTarget);
      }

      case 'pickOpponentBenchActive':
        if (pending.chooserPlayerIndex !== playerIndex) return false;
        return this.resolveAiPickOpponentBenchActive();

      case 'pickOwnBenchActive':
        if (pending.chooserPlayerIndex !== playerIndex) return false;
        return this.resolveAiPickOwnBenchActive();

      case 'accelerationEnergieDiscard':
        if (pending.playerIndex !== playerIndex) return false;
        void this.effects.aiResolveAccelerationEnergie(
          playerIndex,
          pending.eff,
          pending.maxDiscard ?? 3,
        );
        return true;

      case 'accelerationEnergieAttach': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) {
          this.state.pending = null;
          this.emit();
          return true;
        }
        return this.resolveAccelerationAttach(playerIndex, opt.instanceId);
      }

      case 'discardForTalent': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        if (!p.hand.length) return this.cancelPending(playerIndex);
        return this.resolveDiscardForTalent(playerIndex, this._aiPickDiscardIndexForAttack(playerIndex));
      }

      case 'discardEnergyFromHandForTalent': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        const idx = p.hand.findIndex((c) => isEnergie(c.cardId));
        if (idx < 0) return this.cancelPending(playerIndex);
        return this.resolveDiscardEnergyFromHandForTalent(playerIndex, idx);
      }

      case 'teleportPickSide':
        if (pending.playerIndex !== playerIndex) return false;
        return (
          this.pickTeleportSide(playerIndex, 'opponent') || this.pickTeleportSide(playerIndex, 'own')
        );

      case 'pickHealAlly': {
        if (pending.playerIndex !== playerIndex) return false;
        const options = pending.options || [];
        if (!options.length) return this.cancelPending(playerIndex);
        const p = this.state.players[playerIndex];
        let best = options[0];
        let bestRatio = Infinity;
        for (const opt of options) {
          const knight = opt.target === 'active' ? p.active : p.bench[opt.target];
          if (!knight) continue;
          const ratio = knight.currentHp / Math.max(1, knight.maxHp || 1);
          if (ratio < bestRatio) {
            bestRatio = ratio;
            best = opt;
          }
        }
        return this.resolvePickHealAlly(playerIndex, best.instanceId);
      }

      case 'pickHuitiemeSensTransfer': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        const koKnight =
          pending.koKnight ||
          resolveFieldKnight(p, { instanceId: pending.koKnightInstanceId });
        if (!koKnight) {
          this._finishHuitiemeSensTransfer(0);
          return true;
        }
        const others = this._listHuitiemeSensTransferTargets(p, koKnight);
        const maxT = pending.maxTransfer ?? 0;
        this.resolvePickHuitiemeSensCount(playerIndex, maxT);
        let cur = this.state.pending;
        while (
          cur?.type === 'pickHuitiemeSensTransfer' &&
          cur.phase === 'target' &&
          cur.remaining > 0
        ) {
          const pick = this._aiPickHuitiemeSensTarget(p, others);
          if (!pick) {
            this._finishHuitiemeSensTransfer(cur.transferred || 0);
            break;
          }
          this.resolvePickHuitiemeSensTarget(playerIndex, pick.instanceId);
          cur = this.state.pending;
        }
        return true;
      }

      case 'pickBenchForDeckEnergy': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolvePickBenchForDeckEnergy(playerIndex, opt.instanceId);
      }

      case 'pickDamageOpponentKnight': {
        if (pending.playerIndex !== playerIndex) return false;
        const best = this._aiPickDamageOpponentKnightOption(
          playerIndex,
          pending.options,
          pending.amount || 20,
        );
        if (!best) return this.cancelPending(playerIndex);
        return this.resolvePickDamageOpponentKnight(playerIndex, best.instanceId);
      }

      case 'donDeVie': {
        if (pending.playerIndex !== playerIndex) return false;
        const options = pending.options || [];
        if (pending.phase === 'damageTarget') {
          if (!options.length) return this.cancelPending(playerIndex);
          let best = options[0];
          let bestHp = 0;
          for (const opt of options) {
            const loc = this.effects.findKnightInPlayByInstanceId(opt.instanceId);
            const hp = loc?.knight?.currentHp ?? 0;
            if (hp > bestHp) {
              bestHp = hp;
              best = opt;
            }
          }
          return this.resolveDonDeViePick(playerIndex, best.instanceId);
        }
        if (pending.phase === 'healTarget') {
          if (!options.length) return this.cancelPending(playerIndex);
          const own =
            options.find((o) => o.playerIndex === playerIndex) || options[0];
          return this.resolveDonDeViePick(playerIndex, own.instanceId);
        }
        if (pending.phase === 'amount' && pending.damageTarget) {
          const loc = this.effects.findKnightInPlayByInstanceId(
            pending.damageTarget.instanceId,
          );
          const max = pending.maxDamage ?? 40;
          const amount = Math.min(max, loc?.knight?.currentHp ?? 0);
          return this.resolveDonDeVieAmount(playerIndex, amount);
        }
        return false;
      }

      case 'sacrificeBenchForAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolveSacrificeBenchForAttack(playerIndex, opt.instanceId);
      }

      case 'charonSwapBench': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolveCharonSwapBench(playerIndex, opt.instanceId);
      }

      case 'transferEnergyToHades': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        if (pending.step === 'from') {
          const source =
            p.active?.energies?.length > 0
              ? p.active
              : p.bench.find((k) => k?.energies?.length > 0);
          if (!source) return this.cancelPending(playerIndex);
          this.resolveTransferEnergyToHadesSource(playerIndex, source.instanceId);
          pending = this.state.pending;
        }
        if (pending?.step === 'to') {
          const destOpt = pending.hadesOptions?.[0];
          if (!destOpt) return this.cancelPending(playerIndex);
          return this.resolveTransferEnergyToHadesDest(playerIndex, destOpt.instanceId);
        }
        return true;
      }

      case 'discardHandSilenceOpponentTalent': {
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveDiscardHandSilenceOpponentTalent(playerIndex, 0);
      }

      case 'pickHealAllyNextTurn': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        let best = pending.options?.[0];
        let bestHp = Infinity;
        for (const opt of pending.options || []) {
          const knight = opt.target === 'active' ? p.active : p.bench[opt.target];
          if (knight && knight.currentHp < bestHp) {
            bestHp = knight.currentHp;
            best = opt;
          }
        }
        if (!best) return this.cancelPending(playerIndex);
        return this.resolvePickHealAllyNextTurn(playerIndex, best.instanceId);
      }

      case 'recoverDiscard': {
        if (pending.playerIndex !== playerIndex) return false;
        const card = this.state.players[playerIndex].discard[0];
        if (!card) return this.cancelPending(playerIndex);
        return this.resolveRecoverDiscard(playerIndex, card.instanceId);
      }

      case 'attachEnergyFromHand': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolveAttachEnergyFromHand(playerIndex, opt.handIndex);
      }

      case 'attachEnergyFromDiscard': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt =
          pending.options?.find((o) => getCardDef(o.cardId)?.cardType === 'energie') ||
          pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolveAttachEnergyFromDiscard(playerIndex, opt.instanceId);
      }

      case 'discardHandKnight': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        const idx = p.hand.findIndex((c) => getCardDef(c.cardId)?.cardType === 'chevalier');
        if (idx < 0) return this.cancelPending(playerIndex);
        return this.resolveDiscardHandKnight(playerIndex, idx);
      }

      case 'optionalDiscardEnergyForAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        const max = Math.min(pending.maxDiscard || 0, p.active?.energies?.length ?? 0);
        const n = this._aiIsHardTier() ? max : Math.floor(Math.random() * (max + 1));
        return this.resolveOptionalDiscardEnergyForAttack(playerIndex, n);
      }

      case 'optionalDiscardNamedCardsForAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        return this.resolveOptionalDiscardNamedCardsForAttack(playerIndex);
      }

      case 'destructionOutilDiscard': {
        if (pending.playerIndex !== playerIndex) return false;
        const opts = pending.options || [];
        if (!opts.length) return this.finishDestructionOutil(playerIndex);
        const pick = opts[Math.floor(Math.random() * opts.length)];
        return this.resolveDestructionOutilPick(playerIndex, pick.instanceId);
      }

      case 'cerbereBenchBonus': {
        if (pending.playerIndex !== playerIndex) return false;
        const remaining = pending.remaining ?? 1;
        const pool = (pending.options || []).filter(
          (o) => !(pending.selected || []).includes(o.instanceId),
        );
        for (let i = 0; i < remaining && pool.length; i++) {
          const opt = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          if (opt) this.resolveCerbereBenchBonusPick(playerIndex, opt.instanceId);
        }
        if (this.state.pending?.type === 'cerbereBenchBonus') {
          return this.finishCerbereBenchBonus(playerIndex);
        }
        return true;
      }

      case 'distributeDamage': {
        if (pending.playerIndex !== playerIndex) return false;
        const opp = this.state.players[pending.opponentIndex ?? 1 - playerIndex];
        let cur = this.state.pending;
        while ((cur?.remaining ?? 0) > 0 && cur?.options?.length) {
          const ranked = [...cur.options].sort((a, b) => {
            const ka = a.target === 'active' ? opp.active : opp.bench[a.target];
            const kb = b.target === 'active' ? opp.active : opp.bench[b.target];
            return (ka?.currentHp ?? Infinity) - (kb?.currentHp ?? Infinity);
          });
          const pick = ranked[0];
          if (!pick) break;
          this.resolveDistributeDamageAssign(playerIndex, pick.instanceId);
          cur = this.state.pending;
          if (!cur || cur.type !== 'distributeDamage') break;
        }
        if (this.state.pending?.type === 'distributeDamage') {
          return this.finishDistributeDamage(playerIndex);
        }
        return true;
      }

      case 'lookTopDeck': {
        if (pending.playerIndex !== playerIndex) return false;
        return this.confirmLookTopDeck(playerIndex);
      }

      case 'lookTopPickOne': {
        if (pending.playerIndex !== playerIndex) return false;
        const pick = pending.cards?.[0];
        if (!pick) return false;
        return this.effects.resolveLookTopPickOne(playerIndex, pick.instanceId);
      }

      case 'voluntarySacrificePick': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt =
          pending.options?.find((o) => o.zone === 'active') || pending.options?.[0];
        if (!opt) return false;
        return this.effects.resolveVoluntarySacrificeKnight(playerIndex, opt.instanceId);
      }

      case 'pickBenchForEnergyRecover': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        let best = pending.options?.[0];
        let bestHp = Infinity;
        for (const opt of pending.options || []) {
          const knight = p.bench[opt.target];
          if (knight && knight.currentHp < bestHp) {
            bestHp = knight.currentHp;
            best = opt;
          }
        }
        if (!best) return this.cancelPending(playerIndex);
        return this.resolvePickBenchForEnergyRecover(playerIndex, best.instanceId);
      }

      case 'pickRecoverFromDiscard': {
        if (pending.playerIndex !== playerIndex) return false;
        const opts = pending.options || [];
        const pick =
          opts.find((o) => getCardDef(o.cardId)?.cardType === 'outil') ||
          opts[0];
        if (!pick) return this.cancelPending(playerIndex);
        return this.resolvePickRecoverFromDiscard(playerIndex, pick.instanceId);
      }

      case 'transferEnergyTalent': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        if (pending.step === 'from') {
          let bestTarget = 'active';
          let bestCount = p.active?.energies?.length ?? 0;
          p.bench.forEach((knight, index) => {
            const count = knight?.energies?.length ?? 0;
            if (knight && count > bestCount) {
              bestCount = count;
              bestTarget = index;
            }
          });
          return this.resolveTransferEnergyTalentStep(playerIndex, bestTarget);
        }
        let toTarget = this._aiBestEnergyTarget(playerIndex) ?? 'active';
        if (toTarget === pending.fromTarget) {
          toTarget = pending.fromTarget === 'active' ? (p.bench.length ? 0 : 'active') : 'active';
        }
        return this.resolveTransferEnergyTalentStep(playerIndex, toTarget);
      }

      case 'pickMeleeBonusAlly': {
        if (pending.playerIndex !== playerIndex) return false;
        const opt = pending.options?.[0];
        if (!opt) return this.cancelPending(playerIndex);
        return this.resolvePickMeleeBonusAlly(playerIndex, opt.instanceId);
      }

      case 'pickCopyBenchAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const attacks = pending.attacks || [];
        if (!attacks.length) return this.cancelPending(playerIndex);
        const pick = attacks[Math.floor(Math.random() * attacks.length)];
        return this.resolvePickCopyBenchAttack(playerIndex, pick.name);
      }

      case 'pickCopyOpponentAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const attacks = pending.attacks || [];
        if (!attacks.length) return this.cancelPending(playerIndex);
        const pick = attacks[Math.floor(Math.random() * attacks.length)];
        return this.resolvePickCopyOpponentAttack(playerIndex, pick.name);
      }

      case 'pickKanonSanctuary': {
        if (pending.playerIndex !== playerIndex) return false;
        const p = this.state.players[playerIndex];
        const kanonKnight = resolveFieldKnight(p, { instanceId: pending.knightInstanceId });
        if (!kanonKnight) return this.cancelPending(playerIndex);

        if (pending.phase === 'attach') {
          const marinas = this.effects.listKanonMarinaTargets(p);
          if (!marinas.length) return this.cancelPending(playerIndex);
          return this.resolvePickKanonSanctuaryTarget(playerIndex, marinas[0].target);
        }
        if (pending.phase === 'moveFrom') {
          const sources = this.effects.listKanonMarinaTargets(p, { requireEnergy: true });
          if (!sources.length) return this.cancelPending(playerIndex);
          let best = sources[0];
          for (const s of sources) {
            if ((s.knight.energies?.length ?? 0) > (best.knight.energies?.length ?? 0)) {
              best = s;
            }
          }
          return this.resolvePickKanonSanctuaryTarget(playerIndex, best.target);
        }
        if (pending.phase === 'moveTo') {
          const dests = this.effects
            .listKanonMarinaTargets(p)
            .filter((m) => m.target !== pending.fromTarget);
          if (!dests.length) return this.cancelPending(playerIndex);
          return this.resolvePickKanonSanctuaryTarget(playerIndex, dests[0].target);
        }

        const hasEnergy = p.hand.some((c) => getCardDef(c.cardId)?.cardType === 'energie');
        const marinas = this.effects.listKanonMarinaTargets(p);
        const canMove =
          marinas.length >= 2 &&
          this.effects.listKanonMarinaTargets(p, { requireEnergy: true }).length > 0;
        let pick = 'draw';
        if (hasEnergy && marinas.length) pick = 'attach';
        else if (canMove) pick = 'move';
        return this.resolvePickKanonSanctuary(playerIndex, pick);
      }

      case 'pickIoAnimal': {
        if (pending.playerIndex !== playerIndex) return false;
        const animals = pending.animals || [];
        if (!animals.length) {
          this.state.pending = null;
          this.emit();
          return true;
        }
        const pick = animals[Math.floor(Math.random() * animals.length)];
        return this.resolvePickIoAnimal(playerIndex, pick.id);
      }

      case 'pickIoBigTornadoStatus': {
        if (pending.playerIndex !== playerIndex) return false;
        const options = pending.options || ['confused', 'poisoned'];
        const pick = options[Math.floor(Math.random() * options.length)];
        return this.resolvePickIoBigTornadoStatus(playerIndex, pick);
      }

      case 'pickBenchSelfAttack': {
        if (pending.playerIndex !== playerIndex) return false;
        const attacks = pending.attacks || [];
        if (!attacks.length) return this.cancelPending(playerIndex);
        const pick = attacks[Math.floor(Math.random() * attacks.length)];
        return this.resolvePickBenchSelfAttack(playerIndex, pick.index);
      }

      default:
        return false;
    }
  }

  /** Résout le pending courant si un joueur IA doit décider. */
  resolveAnyAiPending() {
    const pending = this.state.pending;
    if (!pending) return false;
    const actor = this._pendingActorIndex(pending);
    if (actor == null || !this.isAiControlled(actor)) return false;
    return this.resolveAiPendingFor(actor);
  }

  aiResumeAfterPending() {
    if (this.state.winner) return;

    if (this.resolveAnyAiPending()) {
      this._scheduleLater(() => this.aiResumeAfterPending());
      return;
    }

    const pi = this.currentAiPlayerIndex;
    if (this.state.turn !== pi || this.state.phase !== 'main') return;
    void this.aiTurn();
  }

  canRetreat(playerIndex = this.state.turn) {
    if (this.state.phase !== 'main' || this.state.turn !== playerIndex) return false;
    if (this.actions.retreat) return false;
    const p = this.state.players[playerIndex];
    if (!p.active || p.bench.length === 0) return false;
    if (p.active.statuses.includes('paralyzed')) return false;
    if (p.active.modifiers.cantRetreat) return false;
    const def = getCardDef(p.active.cardId);
    return canPayRetreat(p.active, def.retreat);
  }

  retreat(playerIndex, benchIndex) {
    if (!this.canRetreat(playerIndex)) return false;
    const p = this.state.players[playerIndex];
    const def = getCardDef(p.active.cardId);
    const cost = def.retreat;

    for (let i = 0; i < cost; i++) {
      const e = p.active.energies.pop();
      if (e) p.discard.push({ cardId: e.cardId, instanceId: e.instanceId });
    }

    const oldActive = p.active;
    p.active = p.bench.splice(benchIndex, 1)[0];
    p.bench.push(oldActive);
    ensureUniqueFieldKnights(p);
    this.markKnightBecameActive(p.active);
    this.onKnightSentToBench(oldActive);
    this.clearPendingMurCrystalIfKnight(oldActive.instanceId, playerIndex, 'retraite');
    this.checkArgolPetrify(playerIndex, oldActive);
    this.actions.retreat = true;
    this.feedback(`Retraite (coût ${cost}).`, 'retreat');
    this.anim('retreat', {});
    this.emit();
    return true;
  }

  /** Exécute la phase principale Expert / Légende (ordre de tour évalué, attaque avec lookahead). */
  async _aiExpertMainPhase(gap, playerIndex = this.currentAiPlayerIndex) {
    const useLegende = isLegendeTier(this.aiDifficulty);
    const order = useLegende
      ? pickLegendeTurnOrder(this, playerIndex, this.aiCheatLevel)
      : pickExpertTurnOrder(this, playerIndex);
    const steps = buildExpertTurnSteps(order);
    const p = this.state.players[playerIndex];
    const opp = this.state.players[1 - playerIndex];

    for (const step of steps) {
      if (this.state.winner || this.state.pending) break;

      switch (step) {
        case 'energy':
          if (this._aiTryAttachEnergy(playerIndex)) await gap();
          break;
        case 'retreat':
          if (!this.state.pending) {
            this._aiTryRetreat(playerIndex);
            if (this.actions.retreat) await gap();
          }
          break;
        case 'bench':
          if (!p.modifiers.cantPlayCardNextTurn && !this.state.pending) {
            if (await this._aiTryPlayBenchChevalier(playerIndex)) await gap();
          }
          break;
        case 'stadium':
          if (!p.modifiers.cantPlayCardNextTurn && !this.state.pending) {
            if (await this._aiTryPlayStadium(playerIndex)) await gap();
          }
          break;
        case 'tool':
          if (!p.modifiers.cantPlayCardNextTurn && !this.state.pending) {
            if (await this._aiTryPlayTool(playerIndex)) await gap();
          }
          break;
        case 'supporter':
          if (
            !p.modifiers.cantPlayCardNextTurn &&
            !this.state.pending &&
            !this.actions.supporter &&
            (await this._aiTryPlaySupporter(playerIndex))
          ) {
            await this._aiWaitForDrawEffects();
            await gap();
          }
          break;
        case 'evolve':
          if (!this.state.pending && this._aiTryEvolve(playerIndex)) await gap();
          break;
        case 'talent':
          if (!this.state.pending && this._aiTryTalent(playerIndex)) await gap();
          break;
        case 'attack': {
          await this._aiWaitForDrawEffects();
          const pick = useLegende
            ? pickLegendeAttack(this, playerIndex, this.aiCheatLevel)
            : pickExpertAttack(this, playerIndex);
          if (!this.actions.attack && this.canAttackThisTurn(playerIndex) && pick && opp.active) {
            this.attack(playerIndex, pick.index);
            await gap();
            if (this.headless) await this._aiWaitForCombatIdle();
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** IA — comportement selon aiDifficulty (7 niveaux dont Légende / Ridicule / Absurde) */
  async aiTurn() {
    const pi = this.currentAiPlayerIndex;
    if (this.state.winner) return;

    if (this.state.pending) {
      const actor = this._pendingActorIndex();
      if (actor != null && this.isAiControlled(actor) && this.resolveAiPendingFor(actor)) {
        this._scheduleLater(() => this.aiResumeAfterPending());
        return;
      }
      if (this.state.turn !== pi || this.state.phase !== 'main') return;
    }

    if (this.state.turn !== pi || this.state.phase !== 'main') return;

    const p = this.state.players[pi];
    const opp = this.state.players[1 - pi];
    const gap = () => this.pause(RULES.ui?.actionGapMs);

    if (!p.active) {
      if (p.bench.length) {
        this.resolveAiPromoteActive(pi);
      } else if (this.tryWinByNoFieldChevaliers(pi)) {
        return;
      }
      await this.aiFinishTurn();
      return;
    }

    if (this._aiIsExpertTier()) {
      await this._aiExpertMainPhase(gap, pi);
    } else {
      if (this._aiTryAttachEnergy(pi)) await gap();

      if (!this.state.pending) {
        this._aiTryRetreat(pi);
        if (this.actions.retreat) await gap();
      }

      if (!p.modifiers.cantPlayCardNextTurn && !this.state.pending) {
        if (await this._aiTryPlayBenchChevalier(pi)) await gap();
        if (!this.state.pending && (await this._aiTryPlayStadium(pi))) await gap();
        if (!this.state.pending && (await this._aiTryPlayTool(pi))) await gap();
        if (!this.state.pending && !this.actions.supporter && (await this._aiTryPlaySupporter(pi))) {
          await this._aiWaitForDrawEffects();
          await gap();
        }
      }

      if (!this.state.pending && this._aiTryEvolve(pi)) await gap();

      if (!this.state.pending && this._aiTryTalent(pi)) await gap();

      await this._aiWaitForDrawEffects();
      const pick = this._aiPickAttack(pi);
      if (!this.actions.attack && this.canAttackThisTurn(pi) && pick && opp.active) {
        this.attack(pi, pick.index);
        await gap();
        if (this.headless) await this._aiWaitForCombatIdle();
      }
    }

    if (this.state.pending) {
      this._scheduleLater(() => this.aiResumeAfterPending());
      return;
    }

    await this.aiFinishTurn();
  }

  _aiPickDiscardIndexForAttack(playerIndex) {
    const p = this.state.players[playerIndex];
    let worst = 0;
    let worstScore = Infinity;
    p.hand.forEach((c, i) => {
      const def = getCardDef(c.cardId);
      const score =
        (def?.cardType === 'chevalier' ? 100 : 0) +
        (isEnergie(c.cardId) ? 50 : 0) +
        (isSupporter(c.cardId) || isStade(c.cardId) ? 30 : 0);
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    });
    return worst;
  }

  async aiFinishTurn() {
    clearTimeout(this._aiResumeTimer);
    const pi = this.currentAiPlayerIndex;
    await this.pause(RULES.ai.thinkMs);
    if (this.state.winner || this.state.turn !== pi) return;
    if (this.state.pending) {
      this.aiResumeAfterPending();
      return;
    }
    await this.endTurn();
  }
}
