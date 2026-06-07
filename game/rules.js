/**
 * Règles et hypothèses provisoires — Chevalier TCG V1
 * Modifier ce fichier pour ajuster le moteur sans toucher au gameplay UI.
 *
 * RÈGLES IMPLÉMENTÉES (résumé) :
 * - Deck 60 cartes ; composition cible 8 chevaliers / 22 énergies / reste dresseur
 * - 7 cartes Récompense par joueur ; victoire si toutes les récompenses sont prises
 * - Zones : deck, main, actif, banc (max 5), défausse, énergies attachées, stade (global, max 1)
 * - Stade : un seul stade en jeu (ou zéro) ; jouer un nouveau stade remplace l'ancien
 *   (l'ancien va dans la défausse de celui qui l'avait joué). Effet global tant qu'il est en jeu.
 *   Hooks moteur : getStadiumEffect(), applyStadiumTurnStart (début de tour), modifyDamageWithStadium (dégâts).
 * - Début : pioche initiale, choix du chevalier actif, puis tours alternés
 * - Tour : pioche 1, 1 énergie attachable, 1 dresseur, chevaliers de base sur le banc (jusqu'à 5), 1 attaque, 1 retraite
 * - Coûts d'attaque = énergies attachées au chevalier ; retraite = défausser N énergies (coût carte)
 * - KO → récompenses selon catégorie (voir getPrizeCountForKnockout / knockoutPrizes) + choix du nouveau actif depuis le banc
 * - Effets de cartes connus (statuts, pièce, talents, cosmo ardent)
 * - Retirer une armure : 0 dégât à l'ennemi (si mécanique armure ajoutée plus tard)
 */

export const RULES = {
  deckSize: 60,
  deckComposition: {
    chevaliers: 8,
    energies: 22,
    // le reste = cartes Dresseur disponibles
  },

  prizeCount: 7, // nombre de Récompenses par joueur

  /** Cartes Récompense prises quand un chevalier est mis KO (voir getPrizeCountForKnockout). */
  knockoutPrizes: {
    default: 1,
    chevalierOr: 3,
    chevalierArgent: 2,
    chevalierBronzeMajeur: 2,
    chevalierBronzeSimple: 1,
    chevalierBronzeMineur: 1,
    cosmoArdentMajeurLine: 2,
    GuerrierDivinAsgard: 2,
    ChevalierDivin: 4,
    Divinite: 5,
  },

  openingHand: 7, // hypothèse provisoire
  drawPerTurn: 1, // hypothèse provisoire

  /** Repioche initiale tant qu'aucun chevalier de base en main (actif possible) */
  openingMulligan: {
    requireChevalier: true,
    requireBaseChevalier: true,
    maxAttempts: 30,
  },

  /** Le joueur qui commence ne peut pas attaquer lors de son premier tour */
  firstPlayerNoAttack: true,

  /** Aucun joueur ne peut évoluer lors de son premier tour */
  firstTurnNoEvolution: true,

  maxBench: 5, // hypothèse provisoire
  /** null = pas de limite de main ; nombre = défausse silencieuse au-delà (trimHand). */
  maxHand: null,

  actionsPerTurn: {
    attachEnergy: 1,
    supporter: 1,
    /** Un stade jouable par tour (remplace l'éventuel stade en jeu). */
    stadium: 1,
    objet: null, // illimité par tour
    attack: 1,
    retreat: 1,
  },

  /** Stade en jeu : effet global ; remplacement → défausse chez playerIndex du stade remplacé. */
  stadium: {
    maxInPlay: 1,
  },

  // illimité par tour : chevaliers de base sur le banc tant qu'il reste de la place (maxBench)
  playChevalierFromHandPerTurn: null,

  winConditions: {
    allPrizesTaken: true,
    // pas de victoire par deck vide en V1 ; victoire si plus d'actif ni de banc
    opponentNoChevaliers: true,
  },

  energy: {
    cardId: 'energie-base',
    // hypothèse provisoire : toute énergie compte pour tout coût (pas de types d'énergie en V1)
    generic: true,
  },

  /** Marqueurs de dégât (Bouclier de la Méduse, etc.) */
  damageMarkerUnit: 10,

  status: {
    poisoned: {
      id: 'poisoned',
      label: 'Empoisonné',
      // Pokémon Checkup : 10 PV (marqueur) sur l'actif empoisonné en fin de chaque tour (~20 PV/cycle)
      damagePerCheckup: 10,
    },
    paralyzed: {
      id: 'paralyzed',
      label: 'Paralysé',
      // hypothèse provisoire : ne peut pas attaquer ni battre en retraite ce tour
      blocksAttack: true,
      blocksRetreat: true,
      clearAtEndOfTurn: true,
    },
    confused: {
      id: 'confused',
      label: 'Confus',
      // Avant attaque : pièce — face = attaque normale ; pile = échec, 30 dégâts auto, aucun effet d'attaque
      attackRequiresCoin: true,
      selfDamageOnTails: 30,
      // Disparaît si le chevalier quitte l'actif (retraite / échange), évolue ou est soigné
      clearsOnLeaveActive: true,
      clearsOnEvolve: true,
      clearsOnHeal: true,
    },
    frozen: {
      id: 'frozen',
      label: 'Gelé',
      // hypothèse provisoire : ne peut pas attaquer ; pièce en début de tour pour dégeler
      blocksAttack: true,
      thawCoinAtTurnStart: true,
    },
  },

  coin: {
    heads: 'face',
    tails: 'pile',
  },

  evolution: {
    // hypothèse provisoire : le cosmo ardent remplace le chevalier, PV max mis à jour, dégâts conservés
    keepDamage: true,
    /** Chevalier Divin : Sang d'Athéna attaché sur la cible (id ou alias SangAthena). */
    divineRequiresTool: 'tool_sang_athena',
    /** Évolution uniquement sur chevaliers actif/banc présents au début du tour (pas joués ce tour). */
    mustBeOnFieldAtTurnStart: true,
    // IKKI DU PHÉNIX MÉCHANT compte comme base "Ikki" pour évolution
    aliases: {
      Ikki: ['ikki-phenix-mechant'],
      Seiya: ['seiya-de-pegase'],
    },
  },

  armor: {
    // Retirer une armure inflige zéro dégât à l'ennemi (règle explicite utilisateur)
    removeDealsZeroDamage: true,
  },

  vocabulary: {
    cosmo: 'cosmo',
    cosmoArdent: 'cosmo ardent',
    attack1: '1',
    attack2: '2',
    attack3: '3',
  },

  ai: {
    enabled: true,
    /** Pause before each AI resume / end-of-turn step */
    thinkMs: 1600,
    /** After turn-start draw + emit, before first AI action */
    turnStartDelayMs: 1750,
  },

  ui: {
    /** Center overlay at true turn start (before draw) */
    turnStartBannerMs: 1600,
    /** local2p: hold after perspective flip, before draw */
    perspectiveFlipBeforeDrawMs: 1000,
    /** Gap between sequential engine actions (AI steps, turn handoff) */
    actionGapMs: 1100,
    endTurnGapMs: 1050,
    drawEmitGapMs: 650,
    drawQueueGapMs: 280,
    /** Pioche en rafale : délai entre cartes */
    drawQueueBurstGapMs: 55,
    drawQueueBurstCenterMs: 200,
    drawQueueBurstFlyMs: 380,
    drawQueueBurstAiCenterMs: 140,
    drawQueueBurstAiFlyMs: 280,
    /** Multi-draw (supporters, etc.) — total animation budget */
    drawBurstTotalMs: 2800,
    drawBurstAiTotalMs: 2500,
    drawBurstMinMs: 80,
    drawBurstMaxMs: 400,
    drawBurstGapMs: 50,
    drawBurstAiGapMs: 40,
    attackSplashMs: 2000,
    attackNameSplashMs: 750,
    /** Splash with attack description (name + text + damage) */
    attackSplashDescMs: 2800,
    autoEndTurnAfterAttackMs: 2800,
    /** Legacy total hint (center + fly + drawEmitGap) */
    drawRevealMs: 3000,
    drawRevealCenterMs: 780,
    drawRevealFlyMs: 1650,
    drawRevealAiCenterMs: 520,
    drawRevealAiFlyMs: 1280,
    attackFxMs: 2800,
    attachEnergyFxMs: 1850,
    healFxMs: 1850,
    /** Pause after KO animation before bench promote (AI auto-pick) */
    koFxMs: 1550,
    bannerPulseMs: 1900,
    /** Overlay central lancer de pièce (annonce → résultat) */
    coinFlipOverlayMs: 2000,
    genericAnimMs: 1550,
    cardTransitionMs: 700,
    bannerTransitionMs: 450,
    cardHoverScale: 1.42,
    cardFieldHoverScale: 1.72,
    cardActiveHoverScale: 1.95,
    cardDrawRevealScale: 3,
    /** Délai (ms) avant le mega zoom (niveau 2) au survol d'une carte */
    cardMegaZoomDelayMs: 2000,
    /** Grace (ms) après mouseleave avant fermeture du mega zoom actif */
    cardMegaZoomLeaveGraceMs: 320,
    /** Ignore mouseleave pendant l'animation d'ouverture (ms) */
    cardMegaZoomSuppressLeaveMs: 480,
  },
};

let _testCoinFlipFn = null;

/** Tests headless : forcer face/pile (null = aléatoire). */
export function setTestCoinFlip(fn) {
  _testCoinFlipFn = typeof fn === 'function' ? fn : null;
}

export function flipCoin() {
  if (_testCoinFlipFn) return _testCoinFlipFn();
  return Math.random() < 0.5 ? RULES.coin.heads : RULES.coin.tails;
}

/** Résumé FR pour plusieurs lancers (ex. « 2 faces, 1 pile »). */
export function formatCoinFlipSummary(heads, tails) {
  const parts = [];
  if (heads > 0) parts.push(`${heads} ${heads > 1 ? 'faces' : 'face'}`);
  if (tails > 0) parts.push(`${tails} ${tails > 1 ? 'piles' : 'pile'}`);
  return parts.join(', ');
}

/** Libellé FR d'un seul lancer (Face / Pile). */
export function formatCoinFlipResult(coin) {
  if (coin === RULES.coin.heads) return 'Face';
  if (coin === RULES.coin.tails) return 'Pile';
  return String(coin || '');
}

export function canPayRetreat(fieldKnight, retreatCost) {
  return fieldKnight && fieldKnight.energies.length >= retreatCost;
}

export function countEnergiesForCost(fieldKnight, cost) {
  return fieldKnight.energies.length >= cost;
}
