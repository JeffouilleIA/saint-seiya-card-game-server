/**
 * Tests corrections audit talents/attaques (node scripts/test-audit-fixes.mjs)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
import { EffectResolver } from '../effects.js';
import { flipCoin } from '../rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, 'data', rel), 'utf8'));
}

globalThis.fetch = (url) => {
  const rel = String(url).replace(/^\.\/data\//, '');
  try {
    const data = loadJson(rel);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  } catch {
    return Promise.resolve({ ok: false, status: 404 });
  }
};

await loadCards();

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

function makeKnight(cardId, hp = 100, instanceId = cardId) {
  const def = getCardDef(cardId);
  return {
    cardId,
    instanceId,
    maxHp: def?.hp ?? hp,
    currentHp: def?.hp ?? hp,
    energies: [],
    statuses: [],
    modifiers: {},
    talentUsed: false,
  };
}

function makeGame(overrides = {}) {
  const damageLog = [];
  const state = {
    turnCount: 1,
    players: [
      {
        index: 0,
        deck: [],
        hand: [],
        discard: [],
        bench: [],
        active: null,
        modifiers: {},
      },
      {
        index: 1,
        deck: [],
        hand: [],
        discard: [],
        bench: [],
        active: null,
        modifiers: {},
      },
    ],
    pending: null,
    ...overrides.state,
  };
  const game = {
    state,
    aiEnabled: false,
    headless: true,
    flipCoinWithUI: () => flipCoin(),
    isAiControlled: () => false,
    needsPlayerChoice: () => false,
    feedback: () => {},
    emit: () => {},
    anim: () => {},
    isKnightEvolutionEligible: () => true,
    damageKnight: (pl, knight, amount) => {
      damageLog.push({ playerIndex: pl.index, instanceId: knight.instanceId, amount });
      knight.currentHp -= amount;
    },
    _damageAttribution: null,
  };
  return { game, damageLog, resolver: new EffectResolver(game) };
}

// P0 — Ruine sépulcrale : heads × damagePerHeads par banc
{
  const { game, damageLog, resolver } = makeGame();
  const p0 = game.state.players[0];
  const p1 = game.state.players[1];
  p0.discard = [
    { cardId: 'manigoldo_cancer', instanceId: 'd1' },
    { cardId: 'avenir_belier', instanceId: 'd2' },
    { cardId: 'asmita_vierge', instanceId: 'd3' },
  ];
  p1.bench = [makeKnight('dokko-de-la-balance', 150, 'b1'), makeKnight('milo-du-scorpion', 150, 'b2')];

  let flipIdx = 0;
  const flipSeq = [0.1, 0.1, 0.9];
  const origRandom = Math.random;
  Math.random = () => flipSeq[flipIdx++] ?? 0.9;

  resolver.resolveCoinFlipPerDiscardedKnightBenchDamage(0, { damagePerHeads: 10 });
  Math.random = origRandom;

  const expected = 20;
  if (damageLog.length !== 2) fail(`Ruine sépulcrale: attendu 2 cibles, reçu ${damageLog.length}`);
  else if (damageLog.some((d) => d.amount !== expected)) {
    fail(`Ruine sépulcrale: attendu ${expected} dmg/banc (2 faces), reçu ${damageLog.map((d) => d.amount).join(', ')}`);
  } else ok(`Ruine sépulcrale: 2 faces → ${expected} dégâts sur chaque banc`);
}

// P1 — Albafica banc : dégâts alliés seulement fin de VOTRE tour
{
  const { game, damageLog, resolver } = makeGame();
  const p0 = game.state.players[0];
  const p1 = game.state.players[1];
  p0.bench = [
    makeKnight('albafica_poissons', 150, 'a1'),
    makeKnight('dokko-de-la-balance', 150, 'a2'),
  ];
  p1.bench = [makeKnight('milo-du-scorpion', 150, 'b1')];

  damageLog.length = 0;
  resolver.applyEndOfTurnKnightTalents(1);
  if (damageLog.length !== 0) fail('Albafica: aucun dégât attendu à la fin du tour adverse');
  else ok('Albafica: pas de dégâts banc alliés à la fin du tour adverse');

  damageLog.length = 0;
  resolver.applyEndOfTurnKnightTalents(0);
  const allyHits = damageLog.filter((d) => d.playerIndex === 0);
  if (allyHits.length !== 1 || allyHits[0].amount !== 10) {
    fail(`Albafica: attendu 10 dmg sur 1 allié banc, reçu ${JSON.stringify(allyHits)}`);
  } else ok('Albafica: 10 dégâts sur allié banc à la fin de votre tour');
}

// P2 — Répartition dégâts IA : priorité aux plus faibles
{
  const { game, damageLog, resolver } = makeGame();
  game.isAiControlled = () => true;
  game.needsPlayerChoice = () => false;
  const p1 = game.state.players[1];
  p1.bench = [
    makeKnight('dokko-de-la-balance', 150, 'weak'),
    makeKnight('milo-du-scorpion', 150, 'strong'),
  ];
  p1.bench[0].currentHp = 30;
  p1.bench[1].currentHp = 120;

  resolver.startDistributeDamage(0, 30, { benchOnly: true });
  const weakHit = damageLog.find((d) => d.instanceId === 'weak')?.amount ?? 0;
  const strongHit = damageLog.find((d) => d.instanceId === 'strong')?.amount ?? 0;
  if (weakHit + strongHit !== 30) fail(`Distribute: total attendu 30, reçu ${weakHit}+${strongHit}`);
  else if (weakHit < strongHit) fail(`Distribute: plus de dégâts sur le plus fort (${weakHit}/${strongHit})`);
  else ok(`Distribute banc: 30 dmg → faible ${weakHit}, fort ${strongHit}`);
}

// P1 — Connais le futur : remise pioche dans l'ordre choisi
{
  const { game, resolver } = makeGame();
  game.needsPlayerChoice = () => true;
  const p0 = game.state.players[0];
  p0.deck = [
    { cardId: 'c3', instanceId: 'c3' },
    { cardId: 'c2', instanceId: 'c2' },
    { cardId: 'c1', instanceId: 'c1' },
  ];
  const knight = makeKnight('avenir_belier', 150, 'av1');
  resolver.resolveLookTopDeckTalent(0, knight, { count: 3, oncePerTurn: true });
  if (game.state.pending?.type !== 'lookTopDeck') fail('Look top: pending attendu');
  else {
    resolver.moveLookTopDeckCard(0, 0, 1);
    resolver.confirmLookTopDeck(0);
    const top = p0.deck[p0.deck.length - 1]?.instanceId;
    if (top !== 'c2') fail(`Look top: dessus attendu c2, reçu ${top}`);
    else ok('Connais le futur: réordonnancement pioche OK');
  }
}

process.exit(failed ? 1 : 0);
