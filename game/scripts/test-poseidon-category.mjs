import { readFileSync } from 'fs';
import {
  loadCards,
  getCardDef,
  getKnightRewardCards,
  getPrizeCountForKnockout,
  isGeneralPoseidonKnight,
  isPoseidonFamilyCard,
  canPlayKnightCardFromHand,
  countPoseidonFamilyInPlay,
  playerHasJulianAndPoseidonGodInHand,
  resolveKnightFaction,
  POSEIDON_CARD_IDS,
  KNIGHT_RAW_TYPE_ARMEE_POSEIDON,
  KNIGHT_TYPE_GENERAL_POSEIDON,
} from '../cards.js';

const orig = globalThis.fetch;
globalThis.fetch = (url) => {
  const path = url.replace('./', '');
  const data = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(data)) });
};

await loadCards();
globalThis.fetch = orig;

const mockDef = {
  id: 'stub-general-poseidon',
  cardType: 'chevalier',
  rawType: KNIGHT_RAW_TYPE_ARMEE_POSEIDON,
  knightType: KNIGHT_TYPE_GENERAL_POSEIDON,
  tags: ['Poseidon', 'general-poseidon'],
  faction: 'Poseidon',
  rewardCards: 3,
};

const reward = getKnightRewardCards(mockDef);
const isGeneral = isGeneralPoseidonKnight(mockDef);
const faction = resolveKnightFaction(mockDef);

if (reward !== 3) throw new Error(`Expected reward 3, got ${reward}`);
if (!isGeneral) throw new Error('isGeneralPoseidonKnight failed');
if (faction !== 'Poseidon') throw new Error(`Expected faction Poseidon, got ${faction}`);

const bundle = JSON.parse(readFileSync(new URL('../data/cards-poseidon.json', import.meta.url), 'utf8'));
if (bundle._meta.rawType !== 'armee-poseidon') throw new Error('Invalid _meta');
if (!Array.isArray(bundle.cards) || bundle.cards.length !== 9) {
  throw new Error(`Expected 9 cards, got ${bundle.cards?.length}`);
}

const expectedIds = [
  'julian-solo',
  'poseidon-dieu-oceans',
  'kanon-dragon-mers',
  'kasa-lyumnades',
  'sorrento-sirene',
  'krishna-chrysaor',
  'baian-cheval-marin',
  'io-scylla',
  'isaac-kraken',
];

const poseidonFamilyBlockingIds = [POSEIDON_CARD_IDS.JULIAN_SOLO, POSEIDON_CARD_IDS.GOD];
const poseidonGeneralIds = expectedIds.filter((id) => !poseidonFamilyBlockingIds.includes(id));

for (const id of expectedIds) {
  const def = getCardDef(id);
  if (!def) throw new Error(`Card not loaded: ${id}`);
}

for (const id of poseidonFamilyBlockingIds) {
  if (!isPoseidonFamilyCard(getCardDef(id))) {
    throw new Error(`Must count as poseidon family for duo block: ${id}`);
  }
}
for (const id of poseidonGeneralIds) {
  if (isPoseidonFamilyCard(getCardDef(id))) {
    throw new Error(`General must not count as poseidon family for duo block: ${id}`);
  }
}

const julian = getCardDef(POSEIDON_CARD_IDS.JULIAN_SOLO);
const god = getCardDef(POSEIDON_CARD_IDS.GOD);
if (julian.knightType !== 'Divinite') throw new Error('Julian must be Divinite');
if (god.knightType !== 'Divinite') throw new Error('Poseidon god must be Divinite');
if (julian.rawType !== 'divinite' || god.rawType !== 'divinite') {
  throw new Error('Julian and Poseidon god must have rawType divinite');
}
if (getKnightRewardCards(julian) !== 5) throw new Error('Julian reward must be 5');
if (getKnightRewardCards(god) !== 5) throw new Error('Poseidon god reward must be 5');
if (getPrizeCountForKnockout(god) !== 5) throw new Error('KO prize for god must be 5');
if (!god.playOnlyWithJulian) throw new Error('playOnlyWithJulian must be set on god card');
if (god.hp !== 240) throw new Error(`Poseidon god hp must be 240, got ${god.hp}`);
if (god.attacks.length !== 2) throw new Error('Poseidon god must have 2 attacks');
if (god.attacks.some((a) => a.name === 'Big Will')) throw new Error('Big Will must be removed');
const trident = god.attacks.find((a) => a.name === 'Trident Royal');
const colere = god.attacks.find((a) => a.name === 'Colère du Dieu des Mers');
if (!trident || trident.cost !== 2 || trident.damage !== 110) {
  throw new Error('Trident Royal must be cost 2 / damage 110');
}
if (!colere || colere.cost !== 4 || colere.damage !== 60) {
  throw new Error('Colère du Dieu des Mers must be cost 4 / damage 60');
}
if (julian.playRequiresStackFromHand !== POSEIDON_CARD_IDS.GOD) {
  throw new Error('Julian must require poseidon-dieu-oceans in hand');
}
if (!isGeneralPoseidonKnight(getCardDef('kanon-dragon-mers'))) {
  throw new Error('Kanon must be GeneralPoseidon');
}

const standaloneGod = getCardDef(POSEIDON_CARD_IDS.GOD_STANDALONE);
if (!standaloneGod) throw new Error('god_poseidon (divin bundle) must load');
if (standaloneGod.id === POSEIDON_CARD_IDS.GOD) {
  throw new Error('god_poseidon must not alias poseidon-dieu-oceans');
}

const emptyPlayer = { hand: [], active: null, bench: [] };
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.GOD, emptyPlayer)) {
  throw new Error('Poseidon god cannot be played alone');
}
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, emptyPlayer)) {
  throw new Error('Julian cannot be played without Poseidon in hand');
}
const withGodOnly = {
  hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }, { cardId: POSEIDON_CARD_IDS.GOD }],
  active: null,
  bench: [],
};
if (!canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, withGodOnly)) {
  throw new Error('Julian must be playable with Poseidon in hand');
}
if (!canPlayKnightCardFromHand(POSEIDON_CARD_IDS.GOD, withGodOnly)) {
  throw new Error('Poseidon god must be playable with Julian in hand');
}
if (!playerHasJulianAndPoseidonGodInHand(withGodOnly)) {
  throw new Error('playerHasJulianAndPoseidonGodInHand');
}
const julianOnly = { hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }], active: null, bench: [] };
const godOnly = { hand: [{ cardId: POSEIDON_CARD_IDS.GOD }], active: null, bench: [] };
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, julianOnly)) {
  throw new Error('Julian alone must not be playable');
}
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.GOD, godOnly)) {
  throw new Error('Poseidon god alone must not be playable');
}
const withKanonOnBench = {
  hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }, { cardId: POSEIDON_CARD_IDS.GOD }],
  active: null,
  bench: [{ cardId: 'kanon-dragon-mers' }],
};
if (countPoseidonFamilyInPlay(withKanonOnBench) !== 0) {
  throw new Error('General Poseidon must not count toward family block');
}
if (!canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, withKanonOnBench)) {
  throw new Error('Julian+Poseidon must be playable with only a general marina on bench');
}
if (!canPlayKnightCardFromHand(POSEIDON_CARD_IDS.GOD, withKanonOnBench)) {
  throw new Error('Poseidon god must be playable with only a general marina on bench');
}

const withJulianOnField = {
  hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }, { cardId: POSEIDON_CARD_IDS.GOD }],
  active: { cardId: POSEIDON_CARD_IDS.JULIAN_SOLO },
  bench: [],
};
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, withJulianOnField)) {
  throw new Error('Julian blocked when Julian Solo already in play');
}
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.GOD, withJulianOnField)) {
  throw new Error('Poseidon god blocked when Julian Solo already in play');
}

const julianStackOnBench = {
  hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }, { cardId: POSEIDON_CARD_IDS.GOD }],
  active: null,
  bench: [
    {
      cardId: POSEIDON_CARD_IDS.JULIAN_SOLO,
      underCard: { cardId: POSEIDON_CARD_IDS.GOD },
    },
  ],
};
if (countPoseidonFamilyInPlay(julianStackOnBench) !== 1) {
  throw new Error('Julian+Poseidon stack must count as one family slot on own field');
}
if (canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, julianStackOnBench)) {
  throw new Error('Second Julian stack blocked when own Julian stack already in play');
}

const duoOnHandOpponentHasKanon = {
  hand: [{ cardId: POSEIDON_CARD_IDS.JULIAN_SOLO }, { cardId: POSEIDON_CARD_IDS.GOD }],
  active: { cardId: 'vieux-maitre' },
  bench: [],
};
const opponentBoardOnly = {
  hand: [],
  active: { cardId: 'vieux-maitre' },
  bench: [{ cardId: 'kanon-dragon-mers' }],
};
if (countPoseidonFamilyInPlay(duoOnHandOpponentHasKanon) !== 0) {
  throw new Error('Own count must ignore opponent field');
}
if (countPoseidonFamilyInPlay(opponentBoardOnly) !== 0) {
  throw new Error('Opponent general marina must not count as poseidon family block');
}
if (!canPlayKnightCardFromHand(POSEIDON_CARD_IDS.JULIAN_SOLO, duoOnHandOpponentHasKanon)) {
  throw new Error('Julian must be playable when opponent has only a general marina');
}

console.log('OK — 9 cartes Poseidon chargées, Julian/Poséidon règles validées');
