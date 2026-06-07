/**
 * Krishna de Chrysaor — Foi Absolue, Lance d'Or, Maharoshini (node scripts/test-krishna.mjs)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef, POSEIDON_CARD_IDS } from '../cards.js';
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

function makeEngine() {
  const feedback = [];
  const engine = new GameEngine({
    gameMode: 'local2p',
    headless: true,
    onFeedback: (msg, type) => feedback.push({ msg, type }),
  });
  return { engine, feedback };
}

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

function benchKnight(cardId, instanceId = `bench-${cardId}`) {
  const def = getCardDef(cardId);
  return {
    instanceId,
    cardInstanceId: instanceId,
    cardId,
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

const krishnaDef = getCardDef('krishna-chrysaor');
assert('hp 180', krishnaDef.hp === 180);
assert('retreat 3', krishnaDef.retreat === 3);
assert('talent Foi Absolue', krishnaDef.talent?.name === 'Foi Absolue');

const lance = krishnaDef.attacks.find((a) => a.name === "Lance d'Or");
const maharoshini = krishnaDef.attacks.find((a) => a.name === 'Maharoshini');
assert('Lance d Or mitigation effect', lance?.effects?.[0]?.type === 'ignore_opponent_damage_mitigation');
assert('Maharoshini discard + attach block', maharoshini?.effects?.length === 2);

const images = loadJson('card-images.json');
assert('card image mapped', images['krishna-chrysaor'] === 'Chrysaor.jpg' || images['krishna-chrysaor'] === 'krishna_chrysaor.jpg');

// Foi Absolue — −30 when active + poseidon-dieu-oceans on own field
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  const krishna = p0.active;
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD));
  const hpBefore = krishna.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(p0, krishna, 100, 'attack', 1);
  assert('foi absolue −30 with poseidon on field', krishna.currentHp === hpBefore - 70);
}

// Foi Absolue — no reduction without Poseidon
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  const krishna = p0.active;
  const hpBefore = krishna.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(p0, krishna, 100, 'attack', 1);
  assert('foi absolue inactive without poseidon', krishna.currentHp === hpBefore - 100);
}

// Foi Absolue — only when active (not on bench)
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  const krishna = p0.active;
  p0.active = p0.bench[0] ?? engine.state.players[1].active;
  p0.bench = [krishna];
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD));
  const hpBefore = krishna.currentHp;
  engine.state.turn = 1;
  engine.damageKnight(p0, krishna, 100, 'attack', 1);
  assert('foi absolue only on active knight', krishna.currentHp === hpBefore - 100);
}

// Foi Absolue — immune confused / paralyzed / frozen
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD));
  const krishna = p0.active;
  engine.applyStatus(p0, krishna, 'confused');
  engine.applyStatus(p0, krishna, 'paralyzed');
  engine.applyStatus(p0, krishna, 'frozen');
  assert('foi absolue immune statuses', krishna.statuses.length === 0);
}

// playerHasPoseidonGodInPlay uses poseidon-dieu-oceans (not god_poseidon only)
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD));
  assert(
    'poseidon-dieu-oceans detected on bench',
    engine.effects.playerHasPoseidonGodInPlay(0),
  );
  p0.bench = [];
  p0.bench.push(benchKnight(POSEIDON_CARD_IDS.GOD_STANDALONE));
  assert(
    'god_poseidon alone not counted for foi absolue',
    !engine.effects.playerHasPoseidonGodInPlay(0, [POSEIDON_CARD_IDS.GOD]),
  );
}

// Lance d'Or — ignores reduction and nullification
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const opp = engine.state.players[1];
  opp.active = benchKnight('baian-cheval-marin', 'opp-baian');
  opp.active.currentHp = 140;
  opp.active.maxHp = 140;
  opp.active.modifiers.immuneDamageNextTurn = true;
  const lanceIdx = krishnaDef.attacks.findIndex((a) => a.name === "Lance d'Or");
  engine.attack(0, lanceIdx);
  assert('lance d or ignores nullification', opp.active.currentHp === 140 - 60);
}

// Lance d'Or — ignores Mur de Dieu style reduction
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const opp = engine.state.players[1];
  opp.active = benchKnight('baian-cheval-marin', 'opp-baian2');
  opp.active.currentHp = 140;
  opp.active.maxHp = 140;
  const lanceIdx = krishnaDef.attacks.findIndex((a) => a.name === "Lance d'Or");
  engine.attack(0, lanceIdx);
  assert('lance d or ignores mur de dieu on baian', opp.active.currentHp === 80);
}

// Maharoshini — discard 1 energy + block attach next owner turn
{
  const { engine } = makeEngine();
  engine.initAttackTest('krishna-chrysaor');
  const p0 = engine.state.players[0];
  const p1 = engine.state.players[1];
  p1.active.energies.push({ instanceId: 'e-opp', cardId: 'energie-etoile' });
  p1.hand.push({ instanceId: 'h-e', cardId: 'energie-etoile' });
  const mahIdx = krishnaDef.attacks.findIndex((a) => a.name === 'Maharoshini');
  engine.attack(0, mahIdx);
  assert('maharoshini discards opponent energy', p1.active.energies.length === 0);
  assert('maharoshini sets attach block', p1.active.modifiers.cannotAttachEnergyFromHand === true);

  await engine.endTurn();
  assert('block active on opponent next turn', p1.active.modifiers.cannotAttachEnergyFromHand === true);
  const blocked = engine.attachEnergy(1, 0, 'active');
  assert('cannot attach energy from hand while blocked', blocked === false);

  await engine.endTurn();
  assert('block cleared after opponent turn ends', !p1.active.modifiers.cannotAttachEnergyFromHand);
  p1.hand.push({ instanceId: 'h-e2', cardId: 'energie-etoile' });
  engine.state.turn = 1;
  const ok = engine.attachEnergy(1, 0, 'active');
  assert('attach allowed after block expires', ok === true);
}

console.log('All Krishna tests passed.');
