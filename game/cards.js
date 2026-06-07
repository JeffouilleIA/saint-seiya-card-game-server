/**
 * Base de données — data/cards.json (chevaliers) + data/objets.json (objets / énergies)
 */
import { repairFrenchDisplayText } from './text-encoding.js';

const TYPE_LABELS = {
  'chevalier-noir': 'Chevalier Noir',
  'armee-hades': "Armée d'Hadès",
  'armee-poseidon': 'Généraux de Poséidon',
  'chevalier-bronze': 'Chevalier de Bronze',
  'chevalier-argent': "Chevalier d'Argent",
  'chevalier-or': "Chevalier d'Or",
  'guerrier-divin-asgard': "Guerrier Divin d'Asgard",
  'chevalier-divin': 'Chevalier Divin',
  divinite: 'Divinité',
  energie: 'Énergie',
  objet: 'Objet',
  outil: 'Outil',
  supporter: 'Supporter',
  stade: 'Stade',
  dresseur: 'Dresseur',
};

/** @type {Record<string, object>} */
export let CARD_DATABASE = {};

/** rawType deck / filtre — miroir de armee-hades. */
export const KNIGHT_RAW_TYPE_ARMEE_POSEIDON = 'armee-poseidon';
/** knightType des Généraux de Poséidon (sous-type, comme Juge / Spectre). */
export const KNIGHT_TYPE_GENERAL_POSEIDON = 'GeneralPoseidon';
export const POSEIDON_FACTION = 'Poseidon';
/** Tags pour effets futurs (Julian Solo, Marina, thème mer). */
export const POSEIDON_KNIGHT_TAGS = {
  FACTION: 'poseidon',
  GENERAL: 'general-poseidon',
  JULIAN: 'julian-solo',
  MARINA: 'marina',
  FAMILLE: 'famille-poseidon',
  MER: 'mer',
};
/** Ids canoniques pour hooks d'effets Poseidon / Julian. */
export const POSEIDON_CARD_IDS = {
  /** Poséidon sous Julian (Dieu des Océans). */
  GOD: 'poseidon-dieu-oceans',
  /** Carte Divinité standalone (cards-divin.json). */
  GOD_STANDALONE: 'god_poseidon',
  JULIAN_SOLO: 'julian-solo',
  KANON_DRAGON_MERS: 'kanon-dragon-mers',
};

/** Anciens ids de cartes → id canonique (deck builder n’expose qu’une entrée). */
const CARD_ID_ALIASES = {
  'ikki-du-phenix-mechant': 'ikki-phenix-mechant',
  'aioros-du-sagittaire': 'aioros_sagittaire',
  'aior-du-lion': 'aior-du-lion',
  aior_du_lion: 'aior-du-lion',
  'aldebaran-du-taureau': 'aldebaran_taureau',
  asterion_chiens_de_chasse: 'asterion-des-chiens-de-chasse',
  'mu-du-belier': 'mu_belier',
  mu_jamir: 'mu-de-jamir',
  shion_du_belier: 'shion_belier',
  avenir_du_belier: 'avenir_belier',
  'masque-de-mort': 'masque-de-mort-du-cancer',
  masque_mort_cancer: 'masque-de-mort-du-cancer',
  shaka: 'shakka',
  'moises-de-la-baleine': 'moises_baleine',
  babel_centaure: 'babel-du-centaure',
  babel_du_centaure: 'babel-du-centaure',
  'shun-d-andromede': 'shun_andromede',
  'seiya-armure-divine': 'seiya_armure_divine',
  'shiryu-armure-divine': 'shiryu_armure_divine',
  athena_armure_divine: 'athena-armure-divine',
  'athena-armure-divine': 'athena-armure-divine',
  'hades-corps-humain': 'hades-corps-humain',
  'hades-vrai-corps': 'hades-vrai-corps',
};

/** Supporters déclenchant Protecteur d'Athéna (Aioros). */
export const ATHENA_OR_DIVINE_CHILD_CARD_IDS = ['supporter_athena', 'supporter_enfant_divin'];
export const AIOROS_CARD_ID = 'aioros_sagittaire';

/** Cibles du talent « Un ami précieux » (Aior du Lion). */
export const AIOR_LION_FRIEND_CARD_IDS = [
  'seiya-de-pegase',
  'seiya-cosmo-ardent',
  'shiryu-du-dragon',
  'shiryu-cosmo-ardent',
  'hyoga-du-cygne',
  'hyoga-cosmo-ardent',
  'shun_andromede',
  'shun-cosmo-ardent',
  'ikki-du-phenix',
  'ikki-phenix-mechant',
  'ikki-cosmo-ardent',
  'marine-aigle',
  'shina-du-cobra',
];

/** Cibles dont les dégâts sont redirigés vers Seiya Armure Divine (Protecteur). */
export const SEIYA_PROTECTED_TARGET_CARD_IDS = [
  ...ATHENA_OR_DIVINE_CHILD_CARD_IDS,
  'athena',
  'athena_armure_divine',
  'athena-armure-divine',
];

export const SEIYA_DIVINE_ARMOR_CARD_ID = 'seiya_armure_divine';

/** @type {Record<string, string>} */
let CARD_IMAGE_MAP = {};

let loadPromise = null;

function imagePath(file) {
  if (!file) return '';
  if (file.startsWith('/')) return file;
  if (file.startsWith('assets/')) return `/${file}`;
  return `/assets/cards/${file}`;
}

function repairDisplayText(value) {
  const out = repairFrenchDisplayText(value);
  if (typeof out === 'string' && out.includes('\uFFFD')) {
    console.warn('[cards] Caractère UTF-8 de remplacement restant dans:', out);
  }
  return out;
}

function sanitizeCardRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const next = { ...raw };
  for (const key of ['name', 'effectText', 'text', 'effect', 'description']) {
    if (typeof next[key] === 'string') next[key] = repairDisplayText(next[key]);
  }
  if (Array.isArray(next.attacks)) {
    next.attacks = next.attacks.map((attack) => {
      if (!attack || typeof attack !== 'object') return attack;
      const a = { ...attack };
      for (const key of ['name', 'effectText', 'description']) {
        if (typeof a[key] === 'string') a[key] = repairDisplayText(a[key]);
      }
      return a;
    });
  }
  return next;
}

function normalizeCard(raw) {
  raw = sanitizeCardRaw(raw);
  const category = raw.category || raw.type;

  if (category === 'stade' || category === 'supporter-stade' || raw.cardType === 'stade' || raw.type === 'stadium') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'stade',
      type: 'Stade',
      rawType: 'stade',
      image: imagePath(raw.image || CARD_IMAGE_MAP[raw.id]),
      text: raw.effectText || raw.text || '',
      effects: raw.effects || [],
      passiveEffects: raw.passiveEffects || [],
      effect: raw.effect || null,
      animation: raw.animation || null,
      tags: raw.tags || [],
    };
  }

  if (category === 'supporter' || raw.cardType === 'supporter') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'supporter',
      type: 'Supporter',
      rawType: 'supporter',
      image: imagePath(raw.image || CARD_IMAGE_MAP[raw.id]),
      text: raw.effectText || raw.text || '',
      effects: raw.effects || [],
    };
  }

  if (category === 'outil' || raw.cardType === 'outil') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'outil',
      type: 'Outil',
      rawType: 'outil',
      toolType: raw.toolType || null,
      image: imagePath(raw.image || CARD_IMAGE_MAP[raw.id]),
      text: raw.effectText || raw.text || '',
      effects: raw.effects || [],
      attachEffects: raw.attachEffects || raw.effects || [],
      passiveEffects: raw.passiveEffects || [],
      bonusAttacks: (raw.bonusAttacks || []).map((a, i) => ({
        key: `tool-attack${i + 1}`,
        label: '★',
        name: a.name,
        cost: a.cost ?? 0,
        damage: a.damage ?? 0,
        effects: a.effects || [],
        description: pickAttackDescription(a),
        fromTool: true,
      })),
      blocksEvolution: raw.blocksEvolution === true,
      tags: raw.tags || [],
      aliases: raw.aliases || [],
      restrictions: raw.restrictions || null,
      animation: raw.animation || null,
    };
  }

  if (category === 'objet' || raw.cardType === 'objet') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'objet',
      type: 'Objet',
      rawType: 'objet',
      image: imagePath(raw.image || CARD_IMAGE_MAP[raw.id]),
      text: raw.effectText || raw.text || '',
      effects: raw.effects || [],
    };
  }

  if (category === 'dresseur' || raw.cardType === 'dresseur') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'objet',
      type: 'Dresseur',
      rawType: 'dresseur',
      image: imagePath(raw.image),
      text: raw.text || raw.effectText || '',
      effects: raw.effects || [],
      effect: raw.effect,
    };
  }

  if (category === 'energie' || raw.cardType === 'energie') {
    return {
      id: raw.id,
      name: raw.name,
      cardType: 'energie',
      type: 'Énergie',
      rawType: 'energie',
      energyType: raw.energyType || 'base',
      image: imagePath(raw.image || CARD_IMAGE_MAP[raw.id]),
      effects: raw.effects || [],
    };
  }

  const isCosmoEvolution = raw.stage === 'evolution' && raw.type === 'chevalier-bronze';
  const stage = isCosmoEvolution
    ? 'cosmo ardent'
    : raw.stage === 'chevalier-divin'
      ? 'chevalier-divin'
      : raw.stage || 'base';
  const imageFile = raw.image || CARD_IMAGE_MAP[raw.id] || `${raw.id}.jpg`;
  return {
    id: raw.id,
    name: raw.name,
    cardType: 'chevalier',
    type: TYPE_LABELS[raw.type] || raw.type,
    rawType: raw.type,
    stage,
    knightType: raw.knightType || null,
    rewardCards: raw.rewardCards ?? null,
    tags: raw.tags || (raw.knightType ? [raw.knightType] : []),
    bronzeMineur: raw.bronzeMineur,
    // mineur/majeur = gameplay; 'autre' = deck builder display only
    bronzeCategory: raw.bronzeCategory || null,
    zodiacSign: raw.zodiacSign || null,
    zodiacRank: typeof raw.zodiacRank === 'number' ? raw.zodiacRank : null,
    evolvesFrom: raw.evolvesFrom,
    evolutionRequiresTool: raw.evolutionRequiresTool || null,
    faction: raw.faction || null,
    hp: raw.hp,
    retreat: raw.retreat ?? 0,
    image: imagePath(imageFile),
    talent: raw.talent
      ? {
          name: raw.talent.name,
          effects: raw.talent.effects || [],
          text: raw.talent.effect || raw.talent.text || describeTalent(raw.talent),
        }
      : null,
    attacks: (raw.attacks || []).map((a, i) => ({
      key: `attack${i + 1}`,
      label: `${i + 1}`,
      name: a.name,
      cost: a.cost ?? 0,
      damage: a.damage ?? 0,
      effects: a.effects || [],
      description: pickAttackDescription(a),
    })),
    playOnlyWithJulian: raw.playOnlyWithJulian === true,
    playRequiresStackFromHand: raw.playRequiresStackFromHand || null,
    testOnly: raw.testOnly === true,
    testDummy: raw.testOnly === true,
  };
}

const STATUS_LABELS = {
  poisoned: 'Empoisonné',
  paralyzed: 'Paralysé',
  confused: 'Confus',
  frozen: 'Gelé',
};

function pickAttackDescription(attack) {
  for (const key of ['description', 'desc', 'text', 'effect', 'effectText']) {
    const v = attack[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const eff of attack.effects || []) {
    for (const key of ['text', 'description', 'desc']) {
      const v = eff[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return describeAttackEffects(attack.effects || []);
}

/**
 * Who picks which opponent bench knight becomes active after a swap effect.
 * @param {{ description?: string, text?: string, effectText?: string, effects?: object[] }} attackDef
 * @returns {'attacker' | 'defender'}
 */
export function whoChoosesBenchSwap(attackDef = {}) {
  for (const eff of attackDef.effects || []) {
    if (eff.chooser === 'defender' || eff.chooser === 'attacker') return eff.chooser;
  }

  const parts = [];
  if (attackDef.description) parts.push(attackDef.description);
  if (attackDef.text) parts.push(attackDef.text);
  if (attackDef.effectText) parts.push(attackDef.effectText);
  if (attackDef.name && attackDef.effects?.length) {
    parts.push(describeAttackEffects(attackDef.effects));
  }
  for (const eff of attackDef.effects || []) {
    for (const key of ['text', 'description', 'desc', 'effectText']) {
      if (typeof eff[key] === 'string' && eff[key].trim()) parts.push(eff[key].trim());
    }
  }

  const blob = parts.join(' ').toLowerCase();
  if (/l['']adversaire\s+échange/.test(blob) || /adversaire\s+échange\s+son/.test(blob)) {
    return 'defender';
  }
  return 'attacker';
}

function describeAttackEffects(effects) {
  if (!effects?.length) return '';
  const parts = [];
  for (const eff of effects) {
    switch (eff.type) {
      case 'status':
        parts.push(STATUS_LABELS[eff.status] || eff.status);
        break;
      case 'status_on_heads':
        parts.push(`Pile : ${STATUS_LABELS[eff.status] || eff.status}`);
        break;
      case 'coin_flip':
        parts.push('Lancez une pièce');
        break;
      case 'multi_coin_flip':
        parts.push(`Lancez ${eff.count || 2} pièce(s)`);
        break;
      case 'bench_damage':
        if (eff.target === 'opponent_bench_all' || eff.target === 'all_bench') {
          parts.push(`${eff.damage || 20} dégâts sur le(s) banc(s) adverse(s)`);
        } else {
          parts.push(`${eff.damage || 20} dégâts sur un chevalier de banc adverse`);
        }
        break;
      case 'discard_energy':
        parts.push(
          `Défaussez ${eff.count || 1} énergie(s) ${
            eff.target === 'opponent_active' ? "de l'adversaire" : 'attachée(s)'
          }`
        );
        break;
      case 'bonus_damage_per_energy':
        parts.push(`+${eff.amountPerEnergy || 20} dégâts par énergie attachée`);
        break;
      case 'bonus_damage_per_opponent_active_energy':
        parts.push(`+${eff.amountPerEnergy || 20} dégâts par énergie sur l'actif adverse`);
        break;
      case 'switch_active_self':
        parts.push('Échangez avec un chevalier de votre banc');
        break;
      case 'swap_opponent_active':
      case 'swap_opponent_active_on_heads':
        parts.push('Échangez le chevalier actif adverse avec un de son banc');
        break;
      case 'heal_self_equal_damage_dealt':
        parts.push('Soignez autant de PV que de dégâts infligés');
        break;
      case 'search_combo_hand':
        parts.push(
          `Cherche ${eff.comboCount ?? 2} carte(s) Supporter/Objet/Stade et ${eff.drawEnergy ?? eff.energyCount ?? 1} Énergie dans le deck`,
        );
        break;
      case 'search_deck_energy':
        parts.push('Cherche une Énergie dans le deck');
        break;
      case 'draw_until_hand_size':
        parts.push(`Pioche jusqu'à ${eff.size || 6} cartes en main`);
        break;
      case 'draw':
        parts.push(`Piochez ${eff.count || 1} carte(s)`);
        break;
      case 'bonus_attack_damage_this_turn':
        parts.push(`+${eff.amount || 0} dégâts aux attaques ce tour`);
        break;
      case 'discard_hand_draw':
        parts.push(
          `Défaussez la main, piochez ${eff.count || 6}${
            eff.countFirstTurn ? ` (${eff.countFirstTurn} au 1er tour)` : ''
          }`
        );
        break;
      case 'athena_choice':
        parts.push('Recycle défausse ou cherche Supporter/Objet');
        break;
      case 'survie':
        parts.push(
          `Si l'actif tombe à 0 PV : remonte à ${eff.healOnKO ?? 10} PV, effets retirés, pas de KO ni Récompense adverse (fin du tour adverse)`,
        );
        break;
      case 'acceleration_energie':
        parts.push(
          `Défaussez jusqu'à ${eff.maxDefausse ?? eff.maxDiscard ?? 3} Chevalier(s) Noir(s) (main/banc) : cherchez 1 Énergie par défausse et attachez-la à un Chevalier Noir ou Phénix Méchant`,
        );
        break;
      case 'coin_flip_search_knight':
        parts.push(`Lancez ${eff.flips || 2} pièce(s), cherchez un Chevalier par face`);
        break;
      case 'move_energy_between_knights':
        parts.push('Déplacez une Énergie entre vos Chevaliers');
        break;
      case 'baian_mur_air':
        parts.push(
          `−${eff.reduce ?? 60} dégâts des attaques adverses jusqu'à votre prochain tour ; ${eff.counterDamage ?? 20} dégâts à l'attaquant si réduit à 0`,
        );
        break;
      case 'reduce_damage_taken_next_turn':
        parts.push(`−${eff.amount || 40} dégâts subis au prochain tour`);
        break;
      case 'immune_damage_next_turn':
        parts.push(
          eff.onHeads
            ? 'Face : aucun dégât subi au prochain tour adverse'
            : 'Aucun dégât subi au prochain tour adverse',
        );
        break;
      case 'reveal_opponent_hand_shuffle':
        parts.push('Regardez la main adverse, choisissez une carte à mélanger dans son deck');
        break;
      case 'increase_damage_taken_next_turn':
        parts.push(`+${eff.amount || 20} dégâts subis au prochain tour`);
        break;
      case 'bonus_if_attack_used_last_turn':
      case 'bonus_if_played_attack_last_turn':
        parts.push(
          `+${eff.bonusDamage || 50} si « ${eff.requiredAttack || 'attaque précédente'} » au tour précédent`
        );
        break;
      case 'requires_played_attack_last_turn':
        parts.push(`Jouable seulement si « ${eff.requiredAttack} » au tour précédent`);
        break;
      case 'place_damage_markers_opponent_bench':
        parts.push(`${eff.count || 4} marqueur(s) de dégât sur le banc adverse`);
        break;
      case 'evolve_self_from_deck_search':
        parts.push(`Cherche ${eff.cardId || 'évolution'} et fait évoluer ce chevalier`);
        break;
      case 'optional_discard_energy_bonus':
        if (!eff.amountPerEnergy) {
          parts.push(
            `Défaussez jusqu'à ${eff.maxDiscard ?? 1} Énergie(s) (optionnel)`,
          );
        } else {
          parts.push(
            `Défaussez jusqu'à ${eff.maxDiscard ?? 3} Énergie(s) : +${eff.amountPerEnergy || 20} dégâts chacune`,
          );
        }
        break;
      case 'disable_chosen_attack_next_turn':
        parts.push('Bloque une attaque de l\'actif adverse au prochain tour');
        break;
      case 'bonus_damage_on_heads':
        parts.push(`+${eff.bonusDamage || 0} dégâts si face`);
        break;
      case 'bonus_damage_on_tails':
        parts.push(`${eff.bonusDamage || 0} dégâts si pile`);
        break;
      case 'bonus_damage_per_damage_marker':
        parts.push(
          `+${eff.amountPerMarker || 10} dégâts par marqueur de dégât sur le Chevalier actif adverse`,
        );
        break;
      case 'bonus_damage_per_heads':
        parts.push(`+${eff.amountPerHeads || 20} dégâts par pile`);
        break;
      case 'bonus_damage_per_own_bench':
        parts.push(`+${eff.amountPerBench || 10} dégâts par chevalier sur votre banc`);
        break;
      case 'bonus_damage_per_discard_chevaliers':
        parts.push(`+${eff.amountPerCard || 10} dégâts par chevalier en défausse`);
        break;
      case 'self_damage':
        parts.push(`${eff.damage || 0} dégâts à soi-même`);
        break;
      case 'attack_miss_on_tails':
        parts.push('Pile : aucun dégât');
        break;
      case 'multi_coin_flip_per_card_id':
        parts.push('Lancez une pièce par Homme de Docrates en jeu');
        break;
      case 'cant_retreat_next_turn':
        parts.push("L'adversaire ne peut pas battre en retraite au prochain tour");
        break;
      case 'discard_energy_on_heads':
        parts.push('Face : défaussez une énergie adverse');
        break;
      case 'bonus_damage_if_bench_card_ids':
        parts.push(`+${eff.bonusDamage || 0} si un allié est sur le banc`);
        break;
      case 'bonus_damage_if_bench_knight_damaged':
        parts.push(`+${eff.bonusDamage || 0} si ${eff.nameContains || 'allié'} blessé sur le banc`);
        break;
      case 'bonus_damage_if_opponent_poisoned':
        parts.push(`+${eff.bonusDamage || 0} si l'adversaire est empoisonné`);
        break;
      case 'status_both_actives':
        parts.push(`${STATUS_LABELS[eff.status] || eff.status} sur les deux actifs`);
        break;
      case 'heal_ally_next_turn':
        parts.push(`Au prochain tour : +${eff.amount || 30} PV sur un chevalier allié`);
        break;
      case 'attack_miss_on_tails':
        parts.push('Pile : aucun dégât');
        break;
      case 'bonus_damage_if_attacker_has_tool':
        parts.push(`+${eff.bonusDamage || 0} si ce chevalier a un outil attaché`);
        break;
      case 'bonus_damage_if_opponent_has_tool':
        parts.push(`+${eff.bonusDamage || 0} si l'actif adverse a un objet attaché`);
        break;
      case 'bonus_damage_per_bronze_mineur_on_bench':
        parts.push(`+${eff.amountPerBench || 10} par Bronze mineur sur votre banc`);
        break;
      case 'bonus_damage_if_bronze_mineur_on_bench':
        parts.push(`+${eff.bonusDamage || 0} si un Bronze mineur est sur votre banc`);
        break;
      case 'reduce_and_reflect_damage':
        parts.push(
          `−${eff.amount || 20} dégâts subis et renvoie ${eff.reflect || eff.amount || 20} jusqu'au prochain tour`,
        );
        break;
      case 'heal_other_friendly':
        parts.push(`Soigne ${eff.amount || 0} PV à un autre chevalier allié`);
        break;
      case 'coin_flip_ko_no_prize':
        parts.push('Face : KO sans Récompense');
        break;
      case 'discard_draw':
        parts.push(`Défaussez ${eff.discard || 1}, piochez ${eff.draw || 2}`);
        break;
      case 'pending_mur_crystal':
        parts.push(
          `Au prochain tour adverse, si ce chevalier est attaqué : pile −${eff.reduceOnPile ?? 40} dégâts, face annule et ${eff.counterDamage || 30} dégâts à l'actif adverse`,
        );
        break;
      case 'attack_blocked_unless_discard_energy':
        parts.push(
          `Au prochain tour adverse, l'actif doit défausser ${eff.energyCost || 2} Énergies pour attaquer`,
        );
        break;
      case 'flip_all_prizes_face_up':
        parts.push('Retournez face visible toutes vos Récompenses');
        break;
      case 'recover_from_discard':
        parts.push('Récupère un chevalier de la défausse');
        break;
      case 'destruction_outil':
        parts.push(`Défaussez jusqu'à ${eff.maxCibles ?? 2} Outil(s) en jeu`);
        break;
      case 'coin_flip_search_tag':
        parts.push('Pièce : Juge (face) ou Spectres (pile) depuis le deck');
        break;
      case 'bonus_degats_banc':
        parts.push(
          `Prochaine attaque : +${eff.bonus ?? 30} dégâts à ${eff.ciblesMax ?? 3} chevalier(s) de banc adverse(s)`,
        );
        break;
      case 'renouvellement_main':
        parts.push(
          `Mains défaussées — adv. pioche ${eff.opponentDraw ?? 8}, vous piochez ${eff.playerDraw ?? 5}`,
        );
        break;
      case 'search_deck':
        parts.push(
          eff.upTo
            ? `Cherchez jusqu'à ${eff.count || 1} carte(s) dans le deck`
            : `Cherchez ${eff.count || 1} carte(s) dans le deck`,
        );
        break;
      case 'shuffle_deck':
        parts.push('Mélangez votre deck');
        break;
      case 'discard_hand_knight':
        parts.push('Défaussez un Chevalier de votre main');
        break;
      case 'attach_energy_from_discard':
        parts.push('Attachez une Énergie de votre défausse à un Chevalier');
        break;
      case 'look_top_pick_one':
        parts.push(
          `Regardez les ${eff.count || 6} premières cartes du deck, gardez-en 1 en main, défaussez le reste`,
        );
        break;
      case 'voluntary_sacrifice_knight':
        parts.push(
          'Défaussez un chevalier actif ou de banc (+ attachements) ; actif : −1 Récompense au prochain KO actif ; continuez le tour',
        );
        break;
      case 'optional_discard_named_cards':
        parts.push(
          `Défaussez jusqu'à ${eff.maxDiscard ?? 2} carte(s) nomée(s) : +${eff.amountPerCard ?? 60} dégâts chacune`,
        );
        break;
      case 'recover_energy_from_discard':
        parts.push('Récupère 1 Énergie de la défausse');
        break;
      case 'distribute_damage_opponent_bench':
        parts.push(`Répartit ${eff.totalDamage || 30} dégâts sur le banc adverse`);
        break;
      case 'coin_flip_per_discarded_knight_bench_damage':
        parts.push(
          `Pièce par Chevalier en défausse : face = ${eff.damagePerHeads ?? 10} dégâts sur le banc adverse`,
        );
        break;
      case 'attach_self_as_tool_on_bench_knight':
        parts.push('Devient Outil sur un chevalier de banc ciblé');
        break;
      default:
        break;
    }
  }
  return [...new Set(parts)].join(' · ');
}

function describeTalent(talent) {
  const aioros = talent.effects?.find((e) => e.type === 'athena_or_divine_child_synergy');
  if (aioros) {
    return (
      talent.effect ||
      `Si vous avez joué Athéna ou Enfant Divin ce tour-ci, soignez ${aioros.heal || 30} dégâts à ce chevalier. Les attaques de ce chevalier infligent ${aioros.bonusDamage || 30} dégâts supplémentaires jusqu'à la fin du tour.`
    );
  }
  const search = talent.effects?.find((e) => e.type === 'search_deck');
  if (search) return 'Cherchez une carte correspondante dans votre deck et mettez-la dans votre main.';
  const drawUntil = talent.effects?.find((e) => e.type === 'draw_until_hand_size');
  if (drawUntil) {
    return (
      talent.effect ||
      `Piochez jusqu'à avoir ${drawUntil.size ?? 4} cartes en main (une fois par tour).`
    );
  }
  const minHp = talent.effects?.find((e) => e.type === 'min_hp_threshold');
  if (minHp) return `Les PV ne peuvent pas descendre sous ${minHp.threshold} (maintenus à ${minHp.set_hp_to}).`;
  const petrify = talent.effects?.find((e) => e.type === 'petrify_on_opponent_swap');
  if (petrify?.text) return petrify.text;
  const murDeDieu = talent.effects?.find((e) => e.type === 'baian_mur_de_dieu');
  if (murDeDieu) {
    return (
      talent.effect ||
      `Si ce chevalier est actif : −${murDeDieu.reduceDamage || 20} dégâts subis ; aucun dégât si l'attaque adverse inflige ${murDeDieu.zeroIfAtMost || 40} dégâts ou moins après les autres effets.`
    );
  }
  const garde = talent.effects?.find((e) => e.type === 'reduce_damage_if_did_not_attack_last_turn');
  if (garde) {
    return (
      talent.effect ||
      `Si ce chevalier n'a pas attaqué lors du tour précédent, réduisez de ${garde.amount || 40} les dégâts de chaque attaque reçue.`
    );
  }
  const intouchable = talent.effects?.find((e) => e.type === 'reduce_damage_if_no_markers');
  if (intouchable) {
    return (
      talent.effect ||
      `Si ce chevalier n'a aucun marqueur de dégâts, retirez ${intouchable.amount || 30} dégâts à toute attaque reçue.`
    );
  }
  const enterDiscard = talent.effects?.find((e) => e.type === 'on_enter_discard_hand_draw');
  if (enterDiscard) {
    return (
      talent.effect ||
      `Lorsque ce chevalier entre en jeu, vous pouvez défausser votre main. Si vous le faites, piochez ${enterDiscard.draw || 6} cartes.`
    );
  }
  const allyBonus = talent.effects?.find((e) => e.type === 'ally_attack_bonus_by_raw_types');
  if (allyBonus) {
    return (
      talent.effect ||
      `Les attaques de vos Chevaliers de Bronze, d'Argent et d'Or infligent ${allyBonus.amount || 30} dégâts supplémentaires.`
    );
  }
  const sacrifice = talent.effects?.find((e) => e.type === 'athena_sacrifice');
  if (sacrifice) {
    return (
      talent.effect ||
      `Sacrifice (${sacrifice.minEnergy || 2}+ Énergies) : ${sacrifice.damage || 110} dégâts, fin de tour, adversaire prend ${sacrifice.opponentPrizes || 2} Récompenses.`
    );
  }
  const hadesRecover = talent.effects?.find((e) => e.type === 'turn_start_recover_discard');
  if (hadesRecover) {
    return talent.effect || 'Au début de votre tour, récupérez un Chevalier ou Supporter de la défausse.';
  }
  const turnStartHeal = talent.effects?.find((e) => e.type === 'turn_start_heal_other_friendly');
  if (turnStartHeal) {
    return (
      talent.effect ||
      `Au début de votre tour, soignez ${turnStartHeal.amount || 20} PV à un autre chevalier allié.`
    );
  }
  const koHeal = talent.effects?.find((e) => e.type === 'heal_on_ko_opponent_active');
  if (koHeal) {
    const activeClause = koHeal.requiresActive !== false ? ' et que ce chevalier est actif' : '';
    const drawClause = koHeal.draw ? ` et piochez ${koHeal.draw} carte(s)` : '';
    return (
      talent.effect ||
      `Si ce chevalier met K.O. un chevalier adverse${activeClause}, soignez immédiatement ${koHeal.amount || 0} dégâts${drawClause}.`
    );
  }
  const infernalHeat = talent.effects?.find((e) => e.type === 'burn_opponent_active_end_turn');
  if (infernalHeat && !talent.effects?.some((e) => e.type === 'bench_allies_damage_end_turn')) {
    return (
      talent.effect ||
      `Si ce chevalier est votre chevalier actif, ajoutez ${infernalHeat.amount || 10} dégâts au chevalier actif adverse à la fin de chaque tour${
        infernalHeat.skipFirstTurn ? ', sauf lors du tout premier tour où ce chevalier devient actif' : ''
      }.`
    );
  }
  if (talent.effects?.some((e) => e.type === 'requires_attached_tool_to_active')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'end_turn_damage_all_knights')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'bench_can_attack_end_turn')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'immune_all_status_if_hades_on_bench')) {
    return talent.effect || 'Immunisé aux états spéciaux tant qu\'Hadès est sur le banc.';
  }
  if (talent.effects?.some((e) => e.type === 'on_play_draw')) {
    const d = talent.effects.find((e) => e.type === 'on_play_draw');
    return talent.effect || `Lorsque vous posez cette carte, piochez ${d?.count || 1} carte(s).`;
  }
  if (talent.effects?.some((e) => e.type === 'on_play_swap_with_active')) {
    return talent.effect || 'Lorsque vous posez cette carte sur le banc, échangez-la avec votre actif.';
  }
  if (talent.effects?.some((e) => e.type === 'solo_combat_modifiers')) {
    const s = talent.effects.find((e) => e.type === 'solo_combat_modifiers');
    return (
      talent.effect ||
      `Seul en jeu : +${s?.bonusDamage || 40} dégâts infligés${s?.excludeMelee ? ' (hors corps à corps)' : ''}, −${s?.reduceDamage || 40} dégâts subis.`
    );
  }
  if (talent.effects?.some((e) => e.type === 'discard_hand_silence_opponent_talent')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'opponent_attack_bonus_if_opponent_status')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'zelos_coward_prize_modifiers')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'silence_opponent_active_talent')) {
    const s = talent.effects.find((e) => e.type === 'silence_opponent_active_talent');
    return talent.effect || `Annule le talent de l'actif adverse pendant ${s?.turns || 2} tour(s).`;
  }
  if (talent.effects?.some((e) => e.type === 'poison_becomes_heal')) {
    const p = talent.effects.find((e) => e.type === 'poison_becomes_heal');
    return talent.effect || `Empoisonné : soigne ${p?.amount || 10} PV au Checkup (fin de tour) au lieu de subir des dégâts.`;
  }
  if (talent.effects?.some((e) => e.type === 'bench_untargetable')) {
    return talent.effect || 'Sur le banc : ne peut pas être attaqué.';
  }
  if (talent.effects?.some((e) => e.type === 'flip_prizes_on_ko_active')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'transfer_energy_to_hades_bench')) {
    return talent.effect;
  }
  if (talent.effects?.some((e) => e.type === 'swap_active_with_bench_tag')) {
    return talent.effect;
  }
  const copyOpp = talent.effects?.find((e) => e.type === 'copy_opponent_attack_on_active');
  if (copyOpp) {
    const reduction = copyOpp.reduceCopiedAttackCost ?? 0;
    const costNote =
      reduction > 0 ? ` ; son coût en Énergie est réduit de ${reduction} (minimum 0).` : '.';
    if (talent.effects?.some((e) => e.type === 'requires_julian_or_kanon_in_play')) {
      return (
        talent.effect ||
        `Tant que Julian Solo, Réceptacle de Poséidon ou Kanon du Dragon des Mers est en jeu, lorsque Kasa devient votre chevalier actif, choisissez une attaque d'un chevalier adverse. Kasa peut utiliser cette attaque jusqu'à la fin du tour${costNote}`
      );
    }
    return talent.effect;
  }
  return talent.effect || talent.name;
}

/** Accepte un tableau JSON ou un bundle { _meta, cards } (ex. cards-poseidon.json). */
function parseCardBundle(json) {
  if (Array.isArray(json)) return json.filter((c) => c?.id);
  if (json && Array.isArray(json.cards)) return json.cards.filter((c) => c?.id);
  return [];
}

function buildDatabase(rawCards) {
  const db = {};
  for (const raw of rawCards) {
    const card = normalizeCard(raw);
    const canonicalId = resolveCanonicalCardId(card.id);
    if (canonicalId !== card.id) card.id = canonicalId;
    db[card.id] = card;
  }
  if (db['entrainement']) {
    db['entrainement-marine'] = { ...db['entrainement'], id: 'entrainement-marine', name: 'Entraînement de Marine' };
  }
  if (db['stadium_elysion']) {
    db['stade-elysion'] = { ...db['stadium_elysion'], id: 'stade-elysion' };
  }
  return db;
}

/** Charge chevaliers + objets/énergies */
export function loadCards() {
  if (!loadPromise) {
    loadPromise = Promise.all([
      fetch('./data/cards.json').then((r) => {
        if (!r.ok) throw new Error(`cards.json (${r.status})`);
        return r.json();
      }),
      fetch('./data/cards-argent.json').then((r) => {
        if (!r.ok) throw new Error(`cards-argent.json (${r.status})`);
        return r.json();
      }),
      fetch('./data/cards-bronze-mineur.json').then((r) => {
        if (!r.ok) throw new Error(`cards-bronze-mineur.json (${r.status})`);
        return r.json();
      }),
      fetch('./data/cards-or.json').then((r) => {
        if (!r.ok) throw new Error(`cards-or.json (${r.status})`);
        return r.json();
      }),
      fetch('./data/cards-asgard.json').then((r) => (r.ok ? r.json() : [])),
      fetch('./data/cards-divin.json').then((r) => (r.ok ? r.json() : [])),
      fetch('./data/cards-hades.json').then((r) => (r.ok ? r.json() : [])),
      fetch('./data/cards-poseidon.json').then((r) => (r.ok ? r.json() : [])),
      fetch('./data/objets.json').then((r) => {
        if (!r.ok) throw new Error(`objets.json (${r.status})`);
        return r.json();
      }),
      fetch('./data/card-images.json')
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
      fetch('./data/test-dummies.json')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([chevaliers, argent, bronzeMineur, orCards, asgard, divin, hades, poseidon, objets, imageMap, testDummies]) => {
      CARD_IMAGE_MAP = imageMap || {};
      CARD_DATABASE = buildDatabase([
        ...chevaliers,
        ...argent,
        ...bronzeMineur,
        ...orCards,
        ...asgard,
        ...divin,
        ...hades,
        ...parseCardBundle(poseidon),
        ...objets,
        ...(Array.isArray(testDummies) ? testDummies : []),
      ]);
    });
  }
  return loadPromise;
}

/** Deck démo 60 : 15 chevaliers d'Argent, 22 énergies Étoile, 23 objets */
export const DEFAULT_DECK_LIST = [
  'marine-aigle',
  'capela-du-cocher',
  'kiki',
  'jamian-du-corbeau',
  'dante-du-cerbere',
  'arachne-de-la-tarentule',
  'babel-du-centaure',
  'tremy-de-la-fleche',
  'moises-de-la-baleine',
  'seiya-de-pegase',
  'shina-du-cobra',
  'misty-du-lezard',
  'asterion-des-chiens-de-chasse',
  'orphee-de-la-lyre',
  'hakurai',
  ...Array(22).fill('energie-etoile'),
  ...Array(17).fill('entrainement'),
  'supporter_vieux_maitre',
  'supporter_enfant_divin',
  ...Array(2).fill('armure-du-sagittaire'),
  ...Array(2).fill('bouclier-d-athena'),
];

export function resolveCanonicalCardId(cardId) {
  return CARD_ID_ALIASES[cardId] || cardId;
}

export function getCardDef(cardId) {
  return CARD_DATABASE[resolveCanonicalCardId(cardId)] || null;
}

/** Deck builder : une seule entrée par id canonique (pas d’alias legacy). */
export function isDeckBuilderPoolCard(cardOrId) {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
  if (!id) return false;
  return resolveCanonicalCardId(id) === id;
}

/** Cartes réservées au mode test (mannequins, etc.) — exclues du constructeur de deck. */
export function isTestOnlyCard(cardOrId) {
  const def = typeof cardOrId === 'string' ? getCardDef(cardOrId) : cardOrId;
  return def?.testOnly === true;
}

export const TEST_DUMMY_BENCH_IDS = [
  'test_dummy_bench_1',
  'test_dummy_bench_2',
  'test_dummy_bench_3',
];

export const TEST_DUMMY_ACTIVE_ID = 'test_dummy_active';

/** Chevaliers jouables dans le mode test d'attaques (au moins une attaque). */
export function getAttackTestKnights() {
  return Object.values(CARD_DATABASE)
    .filter((c) => c?.cardType === 'chevalier' && !c.testOnly && (c.attacks?.length ?? 0) > 0)
    .sort(comparePoolCards);
}

/** Resolved art URL for a card id (empty if none). */
export function getCardImageUrl(cardId) {
  return getCardDef(cardId)?.image || '';
}

export function isChevalier(cardId) {
  return getCardDef(cardId)?.cardType === 'chevalier';
}

/** Chevalier de bronze « mineur » (1 récompense au KO) — flag carte ou base ≤ 80 PV. */
export function isBronzeMineur(cardDef) {
  if (!cardDef || cardDef.rawType !== 'chevalier-bronze') return false;
  if (cardDef.bronzeCategory === 'mineur') return true;
  if (cardDef.bronzeCategory && cardDef.bronzeCategory !== 'mineur') return false;
  if (cardDef.bronzeMineur === true) return true;
  if (cardDef.bronzeMineur === false) return false;
  if (isEvolutionStage(cardDef.stage)) return false;
  return cardDef.stage === 'base' && (cardDef.hp ?? 999) <= 80;
}

/** Bronze majeur — formes de base des 5 Chevaliers (+ variante Ikki). */
export const BRONZE_MAJEUR_BASE_IDS = new Set([
  'seiya-de-pegase',
  'hyoga-du-cygne',
  'ikki-du-phenix',
  'ikki-phenix-mechant',
  'shun_andromede',
  'shiryu-du-dragon',
]);

/** Bronze simple — 1 récompense au KO (hors règle mineur). */
export const BRONZE_SIMPLE_IDS = new Set(['bronze_docrates', 'bronze_june']);

/** Deck builder display only — June, Docrates, etc. */
export const BRONZE_AUTRE_IDS = new Set([
  'bronze_docrates',
  'bronze_homme_docrates',
  'bronze_june',
]);

/** Cosmo ardent de la lignée des 5 Chevaliers (2 récompenses au KO). */
const BRONZE_MAJEUR_COSMO_IDS = new Set([
  'seiya-cosmo-ardent',
  'hyoga-cosmo-ardent',
  'ikki-cosmo-ardent',
  'shun-cosmo-ardent',
  'shiryu-cosmo-ardent',
]);

const KNIGHT_TYPE_REWARD_CARDS = {
  GuerrierDivinAsgard: 2,
  ChevalierDivin: 4,
  Divinite: 5,
  Spectre: 2,
  Juge: 3,
  GeneralPoseidon: 3,
};

function isBronzeMajeurLine(cardDef) {
  if (!cardDef) return false;
  return BRONZE_MAJEUR_BASE_IDS.has(cardDef.id) || BRONZE_MAJEUR_COSMO_IDS.has(cardDef.id);
}

/** Nombre de cartes Récompense prises par l'adversaire lors d'un KO (hors talents 0). */
export function getKnightRewardCards(cardDef) {
  if (!cardDef || cardDef.cardType !== 'chevalier') return null;
  if (typeof cardDef.rewardCards === 'number' && cardDef.rewardCards >= 0) {
    return cardDef.rewardCards;
  }
  if (cardDef.knightType && KNIGHT_TYPE_REWARD_CARDS[cardDef.knightType] != null) {
    return KNIGHT_TYPE_REWARD_CARDS[cardDef.knightType];
  }
  if (cardDef.stage === 'chevalier-divin' || cardDef.rawType === 'chevalier-divin') {
    return 4;
  }
  if (cardDef.rawType === 'divinite' || cardDef.knightType === 'Divinite') {
    return 5;
  }
  if (cardDef.rawType === 'chevalier-or') return 3;
  if (cardDef.rawType === KNIGHT_RAW_TYPE_ARMEE_POSEIDON) return 3;
  if (cardDef.rawType === 'guerrier-divin-asgard') return 2;
  if (cardDef.rawType === 'chevalier-argent') return 2;
  if (cardDef.rawType === 'chevalier-bronze') {
    if (BRONZE_SIMPLE_IDS.has(cardDef.id)) return 1;
    if (isBronzeMajeurLine(cardDef)) return 2;
    if (isBronzeMineur(cardDef)) return 1;
    return 1;
  }
  return 1;
}

export function getPrizeCountForKnockout(cardDef) {
  if (!cardDef || cardDef.cardType !== 'chevalier') return 1;
  if (
    cardDef.id === 'bronze_homme_docrates' ||
    cardDef.talent?.effects?.some((e) => e.type === 'zero_prize_on_knockout')
  ) {
    return 0;
  }
  return getKnightRewardCards(cardDef) ?? 1;
}

export function isEvolutionStage(stage) {
  return stage === 'cosmo ardent' || stage === 'chevalier-divin' || stage === 'evolution';
}

/** Bronze mineur ou majeur au stade de base (exclut Cosmo ardent et Chevalier divin). */
export function isBronzeBase(cardDef) {
  if (!cardDef || cardDef.rawType !== 'chevalier-bronze') return false;
  return !isEvolutionStage(cardDef.stage);
}

/** Deck builder display only — bronze hors mineur / majeur / cosmo ardent. */
export function isBronzeAutre(cardDef) {
  if (!cardDef || cardDef.rawType !== 'chevalier-bronze') return false;
  if (cardDef.bronzeCategory === 'autre') return true;
  if (cardDef.bronzeCategory && cardDef.bronzeCategory !== 'autre') return false;
  return BRONZE_AUTRE_IDS.has(cardDef.id);
}

/** Bronze majeur de base — les 5 Chevaliers (+ variante Ikki méchant). */
export function isBronzeMajeur(cardDef) {
  if (!cardDef || cardDef.rawType !== 'chevalier-bronze') return false;
  if (!isBronzeBase(cardDef)) return false;
  if (cardDef.bronzeCategory === 'majeur') return true;
  if (cardDef.bronzeCategory && cardDef.bronzeCategory !== 'majeur') return false;
  return BRONZE_MAJEUR_BASE_IDS.has(cardDef.id);
}

/** Forme de base des 5 Chevaliers de Bronze majeurs (Seiya, Ikki, Shiryu, Hyôga, Shun). */
export function isBronzeMajeurBase(cardDef) {
  if (!cardDef) return false;
  return BRONZE_MAJEUR_BASE_IDS.has(cardDef.id);
}

/** Cible Tournoi galactique : bronze mineur ou majeur de base (5 Chevaliers). */
export function isTournoiGalactiqueKnight(cardDef) {
  return isBronzeMineur(cardDef) || isBronzeMajeurBase(cardDef);
}

/** Ordre astrologique des Chevaliers d'or (Bélier → Poissons). */
export const ZODIAC_ORDER = [
  'belier',
  'taureau',
  'gemeaux',
  'cancer',
  'lion',
  'vierge',
  'balance',
  'scorpion',
  'sagittaire',
  'capricorne',
  'verseau',
  'poissons',
];

/**
 * Classement or par constellation : classiques puis récents (The Lost Canvas, etc.).
 * @type {Record<string, { sign: string, rank: number }>}
 */
export const GOLD_ZODIAC_META = {
  'mu-de-jamir': { sign: 'belier', rank: 0 },
  mu_belier: { sign: 'belier', rank: 1 },
  shion_belier: { sign: 'belier', rank: 2 },
  avenir_belier: { sign: 'belier', rank: 3 },
  aldebaran_taureau: { sign: 'taureau', rank: 0 },
  saga: { sign: 'gemeaux', rank: 0 },
  'le-grand-pope': { sign: 'gemeaux', rank: 1 },
  'saga-mechant': { sign: 'gemeaux', rank: 2 },
  'saga-des-gemeaux': { sign: 'gemeaux', rank: 3 },
  aspros_gemeaux: { sign: 'gemeaux', rank: 4 },
  deuteros: { sign: 'gemeaux', rank: 5 },
  'masque-de-mort-du-cancer': { sign: 'cancer', rank: 0 },
  manigoldo_cancer: { sign: 'cancer', rank: 1 },
  'aior-du-lion': { sign: 'lion', rank: 0 },
  regulus_lion: { sign: 'lion', rank: 1 },
  ilias_lion: { sign: 'lion', rank: 2 },
  shakka: { sign: 'vierge', rank: 0 },
  'shaka-de-la-vierge': { sign: 'vierge', rank: 1 },
  asmita_vierge: { sign: 'vierge', rank: 2 },
  'vieux-maitre': { sign: 'balance', rank: 0 },
  'dokko-de-la-balance': { sign: 'balance', rank: 1 },
  'milo-du-scorpion': { sign: 'scorpion', rank: 0 },
  aioros_sagittaire: { sign: 'sagittaire', rank: 0 },
  'shura-du-capricorne': { sign: 'capricorne', rank: 0 },
  krest_verseau: { sign: 'verseau', rank: 0 },
  albafica_poissons: { sign: 'poissons', rank: 0 },
  aphrodite_poissons: { sign: 'poissons', rank: 0 },
};

/**
 * Ordre d'apparition des Chevaliers d'argent — anime classique (1986).
 * Source : ordre utilisateur (18 assassins d'argent) ; ids mappés depuis cards-argent.json.
 * cards.json uniquement : argol-de-persee (Persée), juste après Capela (anime).
 * Absents du JSON (non listés) : Algol, Spartan, Dio, Sirius, Algethi, Shiva, Ptolémée.
 * Hors liste utilisateur (après les 18) : Tremy (Flèche, proxy Ptolémée), Kiki, Orphée, Hakurai.
 */
export const SILVER_ANIME_ORDER = [
  'marine-aigle',
  'shina-du-cobra',
  'misty-du-lezard',
  'moises_baleine',
  'asterion-des-chiens-de-chasse',
  'babel-du-centaure',
  'jamian-du-corbeau',
  'dante-du-cerbere',
  'capela-du-cocher',
  'argol-de-persee',
  'arachne-de-la-tarentule',
  'agora-du-lotus',
  'tremy-de-la-fleche',
  'kiki',
  'orphee-de-la-lyre',
  'hakurai',
];

/** Deck builder display only — or issus de The Lost Canvas. */
export const LOST_CANVAS_GOLD_IDS = new Set([
  'shion_belier',
  'avenir_belier',
  'aspros_gemeaux',
  'deuteros',
  'manigoldo_cancer',
  'regulus_lion',
  'ilias_lion',
  'asmita_vierge',
  'albafica_poissons',
  'krest_verseau',
]);

/** Deck builder display only — filtre Or classique vs Lost Canvas. */
export function isLostCanvasGold(cardDef) {
  if (!cardDef || cardDef.rawType !== 'chevalier-or') return false;
  if (LOST_CANVAS_GOLD_IDS.has(cardDef.id)) return true;
  // tag 'lost-canvas' = deck builder display only
  return (cardDef.tags || []).some((t) => String(t).toLowerCase() === 'lost-canvas');
}

const POOL_CARD_TYPE_ORDER = {
  chevalier: 0,
  energie: 1,
  supporter: 2,
  stade: 3,
  objet: 4,
  outil: 5,
};

const BRONZE_MAJEUR_POOL_ORDER = [
  'seiya-de-pegase',
  'shiryu-du-dragon',
  'hyoga-du-cygne',
  'shun_andromede',
  'ikki-du-phenix',
  'ikki-phenix-mechant',
];

const BRONZE_COSMO_POOL_ORDER = [
  'seiya-cosmo-ardent',
  'shiryu-cosmo-ardent',
  'hyoga-cosmo-ardent',
  'shun-cosmo-ardent',
  'ikki-cosmo-ardent',
];

const BRONZE_MINEUR_POOL_ORDER = [
  'bronze_jabu',
  'bronze_nachi',
  'bronze_ban',
  'bronze_ichi',
  'bronze_geki',
];

const BRONZE_AUTRE_POOL_ORDER = [
  'bronze_docrates',
  'bronze_homme_docrates',
  'bronze_june',
];

/**
 * Ordre d'apparition des Guerriers divins d'Asgard — anime classique (1986).
 * Source : ordre utilisateur ; ids mappés depuis cards-asgard.json.
 * Absents du JSON (non listés) : aucun des 8 chevaliers demandés.
 * Hors liste utilisateur (après les 8) : Hilda (hilda_polaris).
 */
export const ASGARD_ANIME_ORDER = [
  'thor_phecda',
  'fenril_alioth',
  'alberic_megrez',
  'hagen_merak',
  'mime_veneta',
  'syd_mizar',
  'bud_alcor',
  'siegfried_dubhe',
];

/**
 * Spectres (armée Hadès) — puissance croissante pour le deck builder.
 * Mapping rang user → id (faible → fort) ; absents du JSON notés, non listés.
 *  1 Zelos → zelos_grenouille
 *  2 Cube du Gobelin (absent) → charon_acheron
 *  3 Raimi → laimi_ver
 *  4 Stand (absent) | 5 Mills (absent)
 *  6 Gigant → giganto_cyclope | 7 Niobé → niobe_deep
 *  8 Ivan (absent) | 9 Rock (absent)
 * 10 Gordon → gordon_minotaure
 * 11 Queen (absent) | 12 Sylphide (absent) | 13 Valentine (absent)
 * 14 Pharaon → pharaon_sphinx | 15 Rune Balrog → rune_balron
 * 16 Myu → myu_papillon | 17 Kagaho → kagaho_benou
 * Exclut les Juges (knightType Juge, tag juge).
 */
export const SPECTRE_POWER_ORDER = [
  'zelos_grenouille', // 1 Zelos
  'charon_acheron', // 2 Cube du Gobelin (absent) → Charon
  'laimi_ver', // 3 Raimi → Laimi
  // 4 Stand (absent) | 5 Mills (absent)
  'giganto_cyclope', // 6 Gigant → Giganto
  'niobe_deep', // 7 Niobé
  // 8 Ivan (absent) | 9 Rock (absent)
  'gordon_minotaure', // 10 Gordon
  // 11 Queen (absent) | 12 Sylphide (absent) | 13 Valentine (absent)
  'pharaon_sphinx', // 14 Pharaon
  'rune_balron', // 15 Rune Balrog → Balron
  'myu_papillon', // 16 Myu
  'kagaho_benou', // 17 Kagaho
];

/** Chevaliers divins — même séquence que BRONZE_MAJEUR_POOL_ORDER (Seiya → Ikki). */
export const DIVINE_KNIGHT_ORDER = [
  'seiya_armure_divine',
  'shiryu_armure_divine',
  'hyoga_armure_divine',
  'shun_armure_divine',
  'ikki_armure_divine',
];

/**
 * Divinités (knightType Divinite) — puissance croissante pour le deck builder.
 * Critère : tier canonique (Thanatos/Hypnos < Athéna < Julian/Réceptacle/Poséidon
 * standalone < Hadès seigneur) puis pic de la lignée (PV max, puis dégâts max d'attaque).
 * Lignées évolutives côte à côte : Athéna→Armure Divine, Julian+Poséidon sous-stack,
 * Hadès corps humain→vrai corps. Exclut les Chevaliers divins (armures divines bronze).
 */
export const DIVINITY_POWER_ORDER = [
  'thanatos',
  'hypnos',
  'athena',
  'athena-armure-divine',
  POSEIDON_CARD_IDS.JULIAN_SOLO,
  POSEIDON_CARD_IDS.GOD,
  POSEIDON_CARD_IDS.GOD_STANDALONE,
  'hades-corps-humain',
  'hades-vrai-corps',
];

/** Lignée bronze majeur → armure divine (deck builder). */
export const DIVINE_KNIGHT_FROM_BRONZE = {
  'seiya-de-pegase': 'seiya_armure_divine',
  'shiryu-du-dragon': 'shiryu_armure_divine',
  'hyoga-du-cygne': 'hyoga_armure_divine',
  'shun_andromede': 'shun_armure_divine',
  'ikki-du-phenix': 'ikki_armure_divine',
  'ikki-phenix-mechant': 'ikki_armure_divine',
};

function poolIndexIn(list, id) {
  const idx = list.indexOf(id);
  return idx >= 0 ? idx : 999;
}

function getGoldZodiacSortKey(card) {
  const sign = card.zodiacSign || GOLD_ZODIAC_META[card.id]?.sign;
  if (!sign) return [99, 999];
  const signIdx = ZODIAC_ORDER.indexOf(sign);
  const rank =
    card.zodiacRank ??
    GOLD_ZODIAC_META[card.id]?.rank ??
    (card.stage === 'evolution' || card.evolvesFrom ? 1 : 0);
  return [signIdx >= 0 ? signIdx : 99, rank];
}

function getBronzePoolGroup(card) {
  if (card.rawType !== 'chevalier-bronze') return 9;
  if (card.stage === 'cosmo ardent') return 1;
  if (isBronzeAutre(card)) return 3;
  if (isBronzeMineur(card)) return 2;
  if (isBronzeMajeur(card)) return 0;
  return 4;
}

function getBronzePoolSortKey(card) {
  const group = getBronzePoolGroup(card);
  let within = 999;
  if (group === 0) within = poolIndexIn(BRONZE_MAJEUR_POOL_ORDER, card.id);
  else if (group === 1) within = poolIndexIn(BRONZE_COSMO_POOL_ORDER, card.id);
  else if (group === 2) within = poolIndexIn(BRONZE_MINEUR_POOL_ORDER, card.id);
  else if (group === 3) within = poolIndexIn(BRONZE_AUTRE_POOL_ORDER, card.id);
  return [group, within];
}

function getSilverAnimeSortKey(card) {
  return poolIndexIn(SILVER_ANIME_ORDER, card.id);
}

function getAsgardAnimeSortKey(card) {
  return poolIndexIn(ASGARD_ANIME_ORDER, card.id);
}

function isSpectreKnight(card) {
  return card?.rawType === 'armee-hades' && knightHasTag(card, 'spectre');
}

function getSpectrePowerSortKey(card) {
  return poolIndexIn(SPECTRE_POWER_ORDER, card.id);
}

function isChevalierDivinKnight(card) {
  if (!card || card.cardType !== 'chevalier') return false;
  return (
    card.stage === 'chevalier-divin' ||
    card.rawType === 'chevalier-divin' ||
    card.knightType === 'ChevalierDivin'
  );
}

function getDivineKnightSortKey(card) {
  return poolIndexIn(DIVINE_KNIGHT_ORDER, card.id);
}

function isDivinityKnight(card) {
  if (!card || card.cardType !== 'chevalier') return false;
  return card.knightType === 'Divinite' || card.rawType === 'divinite';
}

function getDivinityPowerSortKey(card) {
  return poolIndexIn(DIVINITY_POWER_ORDER, card.id);
}

/** Tri constructeur de deck : type → bronze/argent/or par groupe → nom. */
export function comparePoolCards(a, b) {
  const typeA = POOL_CARD_TYPE_ORDER[a.cardType] ?? 9;
  const typeB = POOL_CARD_TYPE_ORDER[b.cardType] ?? 9;
  if (typeA !== typeB) return typeA - typeB;

  if (a.cardType === 'chevalier' && b.cardType === 'chevalier') {
    if (a.rawType === 'chevalier-or' && b.rawType === 'chevalier-or') {
      const [za, ra] = getGoldZodiacSortKey(a);
      const [zb, rb] = getGoldZodiacSortKey(b);
      if (za !== zb) return za - zb;
      if (ra !== rb) return ra - rb;
    } else if (a.rawType === 'chevalier-bronze' && b.rawType === 'chevalier-bronze') {
      const [ga, wa] = getBronzePoolSortKey(a);
      const [gb, wb] = getBronzePoolSortKey(b);
      if (ga !== gb) return ga - gb;
      if (wa !== wb) return wa - wb;
    } else if (a.rawType === 'chevalier-argent' && b.rawType === 'chevalier-argent') {
      const wa = getSilverAnimeSortKey(a);
      const wb = getSilverAnimeSortKey(b);
      if (wa !== wb) return wa - wb;
    } else if (a.rawType === 'guerrier-divin-asgard' && b.rawType === 'guerrier-divin-asgard') {
      const wa = getAsgardAnimeSortKey(a);
      const wb = getAsgardAnimeSortKey(b);
      if (wa !== wb) return wa - wb;
    } else if (a.rawType === 'armee-hades' && b.rawType === 'armee-hades') {
      const spectreA = isSpectreKnight(a);
      const spectreB = isSpectreKnight(b);
      if (spectreA || spectreB) {
        const groupA = spectreA ? 0 : 1;
        const groupB = spectreB ? 0 : 1;
        if (groupA !== groupB) return groupA - groupB;
        if (spectreA && spectreB) {
          const wa = getSpectrePowerSortKey(a);
          const wb = getSpectrePowerSortKey(b);
          if (wa !== wb) return wa - wb;
        }
      }
    } else if (isChevalierDivinKnight(a) && isChevalierDivinKnight(b)) {
      const wa = getDivineKnightSortKey(a);
      const wb = getDivineKnightSortKey(b);
      if (wa !== wb) return wa - wb;
    } else if (isDivinityKnight(a) && isDivinityKnight(b)) {
      const wa = getDivinityPowerSortKey(a);
      const wb = getDivinityPowerSortKey(b);
      if (wa !== wb) return wa - wb;
    } else if (a.rawType !== b.rawType) {
      const rawOrder = [
        'chevalier-bronze',
        'chevalier-argent',
        'chevalier-or',
        'guerrier-divin-asgard',
        'armee-poseidon',
        'armee-hades',
        'chevalier-noir',
        'chevalier-divin',
        'divinite',
      ];
      const ra = rawOrder.indexOf(a.rawType);
      const rb = rawOrder.indexOf(b.rawType);
      const oa = ra >= 0 ? ra : 99;
      const ob = rb >= 0 ? rb : 99;
      if (oa !== ob) return oa - ob;
    }
  }

  return a.name.localeCompare(b.name, 'fr');
}

export function knightHasTool(knight, toolCardId) {
  if (!knight?.attachedTool) return false;
  const id = knight.attachedTool.cardId;
  if (id === toolCardId) return true;
  const def = getCardDef(id);
  return (def?.aliases || []).includes(toolCardId) || getToolIgnoreKey(id) === toolCardId;
}

/** Évolution nécessitant Sang d'Athéna (ou autre outil) attaché sur la cible. */
export function requiresEvolutionTool(evoDef) {
  return evoDef?.stage === 'chevalier-divin' || Boolean(evoDef?.evolutionRequiresTool);
}

/** Chevalier de base : jouable en actif / sur le banc (pas évolution en main). */
export function isBaseChevalier(cardId) {
  const def = getCardDef(cardId);
  if (!def || def.cardType !== 'chevalier') return false;
  if (isEvolutionStage(def.stage)) return false;
  if (def.evolvesFrom) return false;
  return true;
}

export function isEnergie(cardId) {
  return getCardDef(cardId)?.cardType === 'energie';
}

export function isObjetItem(cardId) {
  return getCardDef(cardId)?.cardType === 'objet';
}

export function isToolCard(cardId) {
  return getCardDef(cardId)?.cardType === 'outil';
}

/** Clés ignoreTools (ex. Elysion) — id canonique → alias spec. */
const TOOL_IGNORE_ALIASES = {
  tool_sang_athena: 'SangAthena',
  tool_pendentif_hades: 'PendentifHades',
};

/** Retourne l'alias ignoreTools d'un outil, ou son id. */
export function getToolIgnoreKey(cardId) {
  return TOOL_IGNORE_ALIASES[cardId] || cardId;
}

/** Toutes les clés reconnues pour ignoreTools / exemptions stade. */
export function getToolIgnoreKeys(cardId) {
  const def = getCardDef(cardId);
  const keys = new Set([cardId, getToolIgnoreKey(cardId)]);
  for (const alias of def?.aliases || []) keys.add(alias);
  return [...keys];
}

export function knightHasTag(cardDef, tag) {
  if (!cardDef || !tag) return false;
  const slug = String(tag).toLowerCase();
  const tags = (cardDef.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes(slug)) return true;
  const knightType = (cardDef.knightType || '').toLowerCase();
  if (knightType === slug) return true;
  const raw = (cardDef.rawType || '').replace(/-/g, '');
  if (raw === slug.replace(/-/g, '')) return true;
  return false;
}

export function isGeneralPoseidonKnight(knightDef) {
  if (!knightDef || knightDef.cardType !== 'chevalier') return false;
  return (
    knightDef.knightType === KNIGHT_TYPE_GENERAL_POSEIDON ||
    knightDef.rawType === KNIGHT_RAW_TYPE_ARMEE_POSEIDON ||
    knightHasTag(knightDef, POSEIDON_KNIGHT_TAGS.GENERAL)
  );
}

/**
 * Carte « famille Poséidon » pour le blocage duo Julian / Poséidon Dieu des Océans uniquement.
 * Compte Julian Solo et Poséidon sous stack (poseidon-dieu-oceans), pas les généraux marinas.
 */
export function isPoseidonFamilyCard(knightDef) {
  if (!knightDef || knightDef.cardType !== 'chevalier') return false;
  const id = knightDef.id;
  return id === POSEIDON_CARD_IDS.JULIAN_SOLO || id === POSEIDON_CARD_IDS.GOD;
}

/**
 * Duo Julian / Poséidon dieu des océans sur le plateau du joueur (actif + banc, pas l'adversaire).
 * Chaque emplacement compte au plus une fois : carte visible, ou sous-carte si Julian/Poséidon duo.
 */
function countPoseidonFamilyOnFieldKnight(knight) {
  if (!knight) return 0;
  const topDef = getCardDef(knight.cardId);
  if (isPoseidonFamilyCard(topDef)) return 1;
  const under = knight.underCard;
  if (!under) return 0;
  return isPoseidonFamilyCard(getCardDef(under.cardId)) ? 1 : 0;
}

/** Nombre de slots duo Julian/Poséidon en jeu côté joueur (actif + banc, pas la main ni l'adversaire). */
export function countPoseidonFamilyInPlay(player) {
  if (!player) return 0;
  let n = 0;
  if (player.active) n += countPoseidonFamilyOnFieldKnight(player.active);
  for (const k of player.bench || []) {
    if (k) n += countPoseidonFamilyOnFieldKnight(k);
  }
  return n;
}

/** Au moins une carte famille Poséidon sur le banc ou l'actif du joueur. */
export function playerHasPoseidonFamilyOnOwnField(player) {
  return countPoseidonFamilyInPlay(player) > 0;
}

/** Julian Solo actif ou sur le banc (avant transformation). */
export function playerHasJulianSoloInPlay(player) {
  if (!player) return false;
  return [player.active, ...(player.bench || [])].some(
    (k) => k && (getCardDef(k.cardId)?.id || k.cardId) === POSEIDON_CARD_IDS.JULIAN_SOLO,
  );
}

/** Julian Solo ou Kanon du Dragon des Mers actif ou sur le banc. */
export function playerHasJulianOrKanonDragonInPlay(player) {
  if (!player) return false;
  const ids = new Set([
    POSEIDON_CARD_IDS.JULIAN_SOLO,
    POSEIDON_CARD_IDS.KANON_DRAGON_MERS,
  ]);
  return [player.active, ...(player.bench || [])].some(
    (k) => k && ids.has(getCardDef(k.cardId)?.id || k.cardId),
  );
}

/** Julian Solo ou Poséidon Dieu des Océans (stack main). */
export function isJulianPoseidonStackHandCard(def) {
  if (!def) return false;
  return (
    def.id === POSEIDON_CARD_IDS.JULIAN_SOLO ||
    (def.id === POSEIDON_CARD_IDS.GOD && def.playOnlyWithJulian === true)
  );
}

/** Les deux cartes du duo Julian + Poséidon Dieu des Océans sont en main. */
export function playerHasJulianAndPoseidonGodInHand(player) {
  let hasJulian = false;
  let hasGod = false;
  for (const c of player?.hand || []) {
    const id = getCardDef(c.cardId)?.id || c.cardId;
    if (id === POSEIDON_CARD_IDS.JULIAN_SOLO) hasJulian = true;
    if (id === POSEIDON_CARD_IDS.GOD) hasGod = true;
  }
  return hasJulian && hasGod;
}

/**
 * Chevalier de base jouable depuis la main (banc, actif de départ, mulligan).
 * Duo Julian / Poséidon Dieu des Océans : les deux en main, pas de Julian ni Poséidon (duo) déjà sur son banc/actif.
 */
export function canPlayKnightCardFromHand(cardId, player) {
  if (!isBaseChevalier(cardId)) return false;
  const def = getCardDef(cardId);
  if (!def) return false;
  if (isJulianPoseidonStackHandCard(def)) {
    if (playerHasPoseidonFamilyOnOwnField(player)) return false;
    return playerHasJulianAndPoseidonGodInHand(player);
  }
  if (def.playOnlyWithJulian) return false;
  return true;
}

/** Vérifie si un outil peut être attaché à un chevalier. */
export function canAttachToolToKnight(toolDef, knightDef) {
  if (!toolDef || !knightDef) return false;
  const r = toolDef.restrictions;
  if (!r) return true;
  if (r.faction && resolveKnightFaction(knightDef) !== r.faction) return false;
  if (r.knightTypes?.length && !r.knightTypes.includes(knightDef.knightType)) return false;
  if (r.excludeCardIds?.includes(knightDef.id)) return false;
  if (r.forbiddenKnightTypes?.length && r.forbiddenKnightTypes.includes(knightDef.knightType)) {
    return false;
  }
  if (r.forbiddenTags?.length && r.forbiddenTags.some((t) => knightHasTag(knightDef, t))) {
    return false;
  }
  return true;
}

/** Attaques de base + attaques bonus de l'outil attaché. */
export function getKnightAllAttacks(knight) {
  if (!knight) return [];
  const def = getCardDef(knight.cardId);
  const base = def?.attacks || [];
  if (!knight.attachedTool) return base;
  const toolDef = getCardDef(knight.attachedTool.cardId);
  return [...base, ...(toolDef?.bonusAttacks || [])];
}

/** Faction d'un chevalier (champ carte ou inférence Bronze/Argent/Or = Athéna). */
export function resolveKnightFaction(knightDef) {
  if (!knightDef || knightDef.cardType !== 'chevalier') return null;
  if (knightDef.faction) return knightDef.faction;
  const t = knightDef.rawType;
  if (t === 'chevalier-bronze' || t === 'chevalier-argent' || t === 'chevalier-or') {
    return 'Athena';
  }
  if (t === KNIGHT_RAW_TYPE_ARMEE_POSEIDON) return POSEIDON_FACTION;
  return null;
}

/** true si l'outil attaché correspond à une entrée ignoreTools. */
export function toolMatchesIgnoreKey(attachedToolCardId, ignoreKeys) {
  if (!attachedToolCardId || !ignoreKeys?.length) return false;
  const keys = getToolIgnoreKeys(attachedToolCardId);
  return ignoreKeys.some((k) => keys.includes(k));
}

export function isSupporter(cardId) {
  return getCardDef(cardId)?.cardType === 'supporter';
}

export function isStade(cardId) {
  return getCardDef(cardId)?.cardType === 'stade';
}

export function isObjet(cardId) {
  return isObjetItem(cardId) || isSupporter(cardId) || isStade(cardId);
}

/** @deprecated */
export function isDresseur(cardId) {
  return isSupporter(cardId);
}

/** Carte de base autorisée pour chaque cosmo ardent (par id). */
const EVOLUTION_BASE_IDS = {
  'ikki-cosmo-ardent': ['ikki-du-phenix', 'ikki-phenix-mechant'],
  'seiya-cosmo-ardent': ['seiya-de-pegase'],
  'hyoga-cosmo-ardent': ['hyoga-du-cygne'],
  'shiryu-cosmo-ardent': ['shiryu-du-dragon'],
  'shun-cosmo-ardent': ['shun_andromede'],
  'ikki_armure_divine': ['ikki-cosmo-ardent'],
  'shun_armure_divine': ['shun-cosmo-ardent'],
  'hyoga_armure_divine': ['hyoga-cosmo-ardent'],
  'shiryu_armure_divine': ['shiryu-cosmo-ardent'],
  'athena-armure-divine': ['athena'],
  'hades-corps-humain': ['shun_andromede', 'shun-cosmo-ardent'],
  'hades-vrai-corps': ['hades-corps-humain'],
};

const HADES_CORPS_HUMAIN_ID = 'hades-corps-humain';
const PENDENTIF_HADES_TOOL_ID = 'tool_pendentif_hades';

/** Cibles interdites pour l'évolution Hadès corps humain via Pendentif d'Hadès. */
export function isForbiddenHadesCorpsHumainTarget(knightDef) {
  if (!knightDef) return true;
  const forbiddenKnightTypes = ['ChevalierDivin', 'Divinite', 'Spectre', 'Juge', KNIGHT_TYPE_GENERAL_POSEIDON];
  if (forbiddenKnightTypes.includes(knightDef.knightType)) return true;
  const forbiddenTags = [
    'ChevalierDivin',
    'Divinite',
    'spectre',
    'juge',
    'armee-hades',
    'armee-poseidon',
    'general-poseidon',
    'poseidon',
  ];
  return forbiddenTags.some((tag) => knightHasTag(knightDef, tag));
}

/** Cibles interdites pour la carte Supporter Sacrifice (Divinités et Chevaliers divins). */
export function isForbiddenSacrificeTarget(knightDef) {
  if (!knightDef) return true;
  const forbiddenKnightTypes = ['ChevalierDivin', 'Divinite'];
  if (forbiddenKnightTypes.includes(knightDef.knightType)) return true;
  if (knightDef.rawType === 'divinite' || knightDef.rawType === 'chevalier-divin') return true;
  if (knightDef.stage === 'chevalier-divin') return true;
  const forbiddenTags = ['ChevalierDivin', 'Divinite', 'divinite'];
  return forbiddenTags.some((tag) => knightHasTag(knightDef, tag));
}

/** Voie Pendentif : chevalier avec Pendentif d'Hadès attaché (hors cibles interdites). */
export function matchesHadesCorpsHumainViaPendentif(knight) {
  if (!knight?.attachedTool) return false;
  const knightDef = getCardDef(knight.cardId);
  if (!knightDef || knightDef.cardType !== 'chevalier') return false;
  if (isForbiddenHadesCorpsHumainTarget(knightDef)) return false;
  return knightHasTool(knight, PENDENTIF_HADES_TOOL_ID);
}

/** Nom de l'outil requis pour une évolution (UI / messages). */
export function getEvolutionRequiredToolName(evoDef) {
  if (!evoDef) return null;
  const toolId = evoDef.evolutionRequiresTool || null;
  if (!toolId) return null;
  return getCardDef(toolId)?.name || null;
}

/** Noms affichables des cartes sources autorisées pour une évolution. */
export function getEvolutionSourceNames(evoDef) {
  if (!evoDef) return [];
  if (evoDef.id === HADES_CORPS_HUMAIN_ID) {
    const ids = EVOLUTION_BASE_IDS[HADES_CORPS_HUMAIN_ID] || [];
    const shunNames = ids.map((id) => getCardDef(id)?.name).filter(Boolean);
    const toolName = getCardDef(PENDENTIF_HADES_TOOL_ID)?.name || 'Pendentif d\'Hadès';
    return [...shunNames, `tout chevalier portant ${toolName}`];
  }
  const ids = EVOLUTION_BASE_IDS[evoDef.id];
  if (ids?.length) {
    return ids.map((id) => getCardDef(id)?.name).filter(Boolean);
  }
  if (Array.isArray(evoDef.evolvesFrom)) {
    return evoDef.evolvesFrom.filter(Boolean);
  }
  if (evoDef.evolvesFrom) return [evoDef.evolvesFrom];
  return [];
}

export function formatEvolvesFrom(evoDef) {
  const names = getEvolutionSourceNames(evoDef);
  if (!names.length) return 'chevalier de base';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ou ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

function normalizeEvolutionName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function matchesEvolution(baseCardId, evolutionCardId) {
  const evo = getCardDef(evolutionCardId);
  const base = getCardDef(baseCardId);
  if (!evo?.evolvesFrom || !base) return false;

  const allowedIds = EVOLUTION_BASE_IDS[evo.id];
  if (allowedIds?.includes(base.id)) return true;

  if (Array.isArray(evo.evolvesFrom)) {
    return evo.evolvesFrom.some((fromRaw) => {
      const from = normalizeEvolutionName(fromRaw);
      const baseName = normalizeEvolutionName(base.name);
      return from === baseName || from === normalizeEvolutionName(base.id);
    });
  }

  const from = normalizeEvolutionName(evo.evolvesFrom);
  const baseName = normalizeEvolutionName(base.name);
  if (from === baseName) return true;
  if (from === 'ikki' && base.id === 'ikki-phenix-mechant') return true;
  if (from.startsWith('seiya') && base.id === 'seiya-de-pegase') return true;
  if (from === 'athena' || from === 'athéna') {
    return base.id === 'athena';
  }
  if (from.startsWith('shun') && (base.id === 'shun_andromede' || base.id === 'shun-cosmo-ardent')) {
    return true;
  }
  return false;
}

/** Cible compatible pour une évolution (inclut voie Pendentif d'Hadès). */
export function matchesEvolutionTarget(knight, evolutionCardId) {
  if (!knight) return false;
  if (evolutionCardId === HADES_CORPS_HUMAIN_ID) {
    if (matchesEvolution(knight.cardId, HADES_CORPS_HUMAIN_ID)) return true;
    return matchesHadesCorpsHumainViaPendentif(knight);
  }
  return matchesEvolution(knight.cardId, evolutionCardId);
}

export function buildDeckFromList(list = DEFAULT_DECK_LIST) {
  return list.map((cardId, i) => ({
    instanceId: `inst-${cardId}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    cardId: CARD_DATABASE[cardId] ? cardId : 'energie-etoile',
  }));
}
