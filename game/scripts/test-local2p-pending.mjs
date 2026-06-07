/**
 * Vérifie que local 1v1 laisse les choix interactifs aux humains (pas d'auto-résolution IA).
 * node scripts/test-local2p-pending.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards } from '../cards.js';
import { GameEngine } from '../engine.js';

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

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const engine = new GameEngine({ gameMode: 'local2p' });
engine.reset({ gameMode: 'local2p' });

assert(!engine.isAiControlled(0), 'Joueur 1 non IA');
assert(!engine.isAiControlled(1), 'Joueur 2 non IA');
assert(engine.needsPlayerChoice(0), 'Joueur 1 needs choice');
assert(engine.needsPlayerChoice(1), 'Joueur 2 needs choice');

// searchDeck (Les 12 maisons) — joueur 2 doit voir un pending
const p1 = engine.state.players[1];
p1.deck.length = 0;
p1.deck.push(
  { instanceId: 'test-or-1', cardId: 'vieux-maitre' },
  { instanceId: 'test-or-2', cardId: 'vieux-maitre' },
);
engine.effects.searchDeckFilteredToHand(1, { type: 'chevalier-or' }, 1);
assert(engine.state.pending?.type === 'searchDeck', 'Joueur 2: searchDeck pending');
assert(engine.state.pending.playerIndex === 1, 'Joueur 2: pending owner');
assert(!engine.resolveAnyAiPending(), 'resolveAnyAiPending ne doit pas résoudre en local2p');

// talent search — joueur 2
engine.state.pending = null;
p1.deck.length = 0;
p1.deck.push({ instanceId: 'test-or-talent', cardId: 'vieux-maitre' });
const knight = p1.active || { instanceId: 'test-knight', cardId: 'vieux-maitre', talentUsed: false };
engine.effects.resolveTalentSearch(p1, knight, {
  name: 'Test talent',
  effects: [{ type: 'search_deck', filter: { type: 'chevalier-or' } }],
});
assert(engine.state.pending?.type === 'searchDeck', 'Joueur 2: talent searchDeck pending');

// damage split — joueur 2 choisit la cible
engine.state.pending = null;
const p0 = engine.state.players[0];
if (!p0.active) {
  p0.active = {
    instanceId: 'opp-active',
    cardId: 'vieux-maitre',
    currentHp: 100,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  };
}
p0.bench.length = 0;
p0.bench.push({
  instanceId: 'opp-bench',
  cardId: 'vieux-maitre',
  currentHp: 80,
  maxHp: 100,
  energies: [],
  statuses: [],
  modifiers: {},
});
engine.effects.damageOpponentAny(1, 30, { attackName: 'Test' });
assert(
  engine.state.pending?.type === 'pickDamageOpponentKnight',
  'Joueur 2: pickDamageOpponentKnight pending',
);
assert(engine.state.pending.playerIndex === 1, 'Joueur 2: damage pick owner');

// bench_damage opponent_bench_one — joueur 1 choisit (2+ cibles banc adverse)
engine.state.pending = null;
const p1Bench = engine.state.players[1].bench;
p1Bench.length = 0;
p1Bench.push(
  {
    instanceId: 'opp-bench-a',
    cardId: 'vieux-maitre',
    currentHp: 80,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
  {
    instanceId: 'opp-bench-b',
    cardId: 'vieux-maitre',
    currentHp: 90,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
);
engine.effects.applyBenchDamage(0, { target: 'opponent_bench_one', damage: 20 });
assert(
  engine.state.pending?.type === 'pickDamageOpponentKnight',
  'Joueur 1: bench one damage pending',
);
assert(engine.state.pending.playerIndex === 0, 'Joueur 1: bench damage pick owner');

// bench swap (pickOpponentBenchActive) — défenseur choisit, pas de playerIndex
engine.state.pending = null;
engine.state.turn = 0;
const defP = engine.state.players[1];
defP.active = {
  instanceId: 'def-active',
  cardId: 'vieux-maitre',
  currentHp: 100,
  maxHp: 100,
  energies: [],
  statuses: [],
  modifiers: {},
};
defP.bench.length = 0;
defP.bench.push(
  {
    instanceId: 'def-bench-a',
    cardId: 'vieux-maitre',
    currentHp: 80,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
  {
    instanceId: 'def-bench-b',
    cardId: 'vieux-maitre',
    currentHp: 90,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
);
engine.requestPickOpponentBenchActive(0, {
  effects: [{ type: 'swap_opponent_active_with_bench', chooser: 'defender' }],
  sourceLabel: 'Test échange',
});
assert(
  engine.state.pending?.type === 'pickOpponentBenchActive',
  'Joueur 2: pickOpponentBenchActive pending',
);
assert(engine.state.pending.chooserPlayerIndex === 1, 'Joueur 2: bench swap chooser');
assert(engine.state.pending.playerIndex == null, 'Bench swap: pas de playerIndex');
assert(!engine.resolveAnyAiPending(), 'Bench swap local2p: pas auto-résolu');
const swapIdx = engine.filledBenchIndices(1)[0];
assert(
  engine.pickOpponentBenchActive(1, swapIdx),
  'Joueur 2: résout le bench swap',
);
assert(!engine.state.pending, 'Bench swap: pending cleared');

// bench swap — attaquant choisit (joueur 1)
engine.state.pending = null;
engine.state.turn = 0;
engine.requestPickOpponentBenchActive(0, {
  effects: [{ type: 'swap_opponent_active_with_bench', chooser: 'attacker' }],
  sourceLabel: 'Test échange attaquant',
});
assert(engine.state.pending?.chooserPlayerIndex === 0, 'Joueur 1: bench swap chooser attaquant');
assert(
  engine.pickOpponentBenchActive(0, engine.filledBenchIndices(1)[0]),
  'Joueur 1: résout le bench swap adverse',
);

// pickOwnBenchActive — chooserPlayerIndex seulement
engine.state.pending = null;
const atkP = engine.state.players[0];
atkP.bench.length = 0;
atkP.bench.push(
  {
    instanceId: 'own-bench-a',
    cardId: 'vieux-maitre',
    currentHp: 80,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
  {
    instanceId: 'own-bench-b',
    cardId: 'vieux-maitre',
    currentHp: 90,
    maxHp: 100,
    energies: [],
    statuses: [],
    modifiers: {},
  },
);
engine.requestPickOwnBenchActive(0, { sourceLabel: 'Test propre banc' });
assert(engine.state.pending?.type === 'pickOwnBenchActive', 'Joueur 1: pickOwnBenchActive pending');
assert(engine.state.pending.chooserPlayerIndex === 0, 'Joueur 1: own bench chooser');
assert(engine.state.pending.playerIndex == null, 'Own bench: pas de playerIndex');

// pickHuitiemeSensTransfer — joueur humain, pas auto-résolu en local2p
engine.state.pending = null;
engine.state.turn = 1;
const hsP = engine.state.players[0];
const hsBench = {
  instanceId: 'hs-bench',
  cardId: 'vieux-maitre',
  currentHp: 90,
  maxHp: 100,
  energies: [],
  statuses: [],
  modifiers: {},
};
const hsKo = {
  instanceId: 'hs-ko',
  cardId: 'vieux-maitre',
  currentHp: 0,
  maxHp: 100,
  energies: [{ cardId: 'energie-cosmique', instanceId: 'hs-e1' }],
  statuses: [],
  modifiers: {},
};
hsP.active = hsKo;
hsP.bench = [hsBench];
engine.state.pending = {
  type: 'pickHuitiemeSensTransfer',
  playerIndex: 0,
  phase: 'target',
  koKnightInstanceId: 'hs-ko',
  maxTransfer: 1,
  remaining: 1,
  transferred: 0,
  options: [{ instanceId: 'hs-bench', target: 0 }],
};
assert(!engine.resolveAnyAiPending(), '8e Sens local2p: pas auto-résolu');
assert(
  engine.resolvePickHuitiemeSensTarget(0, 'hs-bench'),
  '8e Sens: résolution manuelle pendant le tour adverse',
);
assert(!engine.state.pending, '8e Sens: pending cleared after target pick');

// IA solo — bench swap auto-résolu
const aiEngine = new GameEngine({ gameMode: 'ai' });
aiEngine.reset({ gameMode: 'ai' });
assert(aiEngine.isAiControlled(1), 'Solo: J2 IA');
assert(!aiEngine.needsPlayerChoice(1), 'Solo: J2 pas de choix UI');
aiEngine.state.players[1].deck.length = 0;
aiEngine.state.players[1].deck.push({ instanceId: 'ai-or', cardId: 'vieux-maitre' });
aiEngine.effects.searchDeckFilteredToHand(1, { type: 'chevalier-or' }, 1);
assert(!aiEngine.state.pending, 'Solo IA: searchDeck auto-résolu');

console.log('OK — local2p pending + solo IA préservé');
