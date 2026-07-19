/**
 * Hilda de Polaris — talent + attaques Rayon de l'anneau / Boule d'énergie
 * node scripts/test-hilda-polaris.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadCards, getCardDef } from '../cards.js';
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

const CARD_ID = 'hilda_polaris';
const BENCH_ASGARD = 'siegfried_dubhe';
const OBJET_ID = 'armure-du-sagittaire';

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`OK: ${msg}`);

function makeEngine() {
  return new GameEngine({ gameMode: 'local2p', headless: true });
}

async function waitAttackEffects(engine) {
  await engine._aiWaitForCombatIdle?.();
  await new Promise((r) => setTimeout(r, 50));
}

const def = getCardDef(CARD_ID);
if (!def) {
  fail('Carte hilda_polaris introuvable');
  process.exit(1);
}

assertCardJson(def);

// --- Rayon de l'anneau : énergie défausse → Guerrier Asgard au choix ---
{
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const p0 = engine.state.players[0];
  p0.discard.push({ cardId: 'energie-etoile', instanceId: 'disc-energy-1' });
  p0.bench.push({
    instanceId: 'bench-asgard-1',
    cardId: BENCH_ASGARD,
    currentHp: 90,
    maxHp: 90,
    energies: [],
    statuses: [],
    modifiers: {},
    attachedTool: null,
  });
  engine.attack(0, 0);
  await waitAttackEffects(engine);
  if (engine.state.pending?.type !== 'pickKnightForDiscardEnergyAttach') {
    fail(`Rayon : pending attendu pickKnightForDiscardEnergyAttach, reçu ${engine.state.pending?.type}`);
  } else {
    ok('Rayon : pending choix Guerrier Asgard');
    const benchOpt = engine.state.pending.options.find((o) => o.target === 0);
    engine.resolvePickKnightForDiscardEnergyAttach(0, benchOpt.instanceId);
    await waitAttackEffects(engine);
    if (p0.discard.length !== 0) fail('Rayon : énergie toujours en défausse');
    else ok('Rayon : énergie retirée de la défausse');
    if (p0.bench[0].energies.length !== 1) fail('Rayon : énergie non attachée au banc');
    else ok('Rayon : énergie attachée au Guerrier Asgard choisi');
  }
}

// --- Rayon : cible unique (actif seul) ---
{
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const p0 = engine.state.players[0];
  p0.discard.push({ cardId: 'energie-etoile', instanceId: 'disc-energy-2' });
  engine.attack(0, 0);
  await waitAttackEffects(engine);
  if (engine.state.pending) fail(`Rayon solo : pending inattendu ${engine.state.pending?.type}`);
  else if (p0.active.energies.length < 2) fail('Rayon solo : énergie non attachée à l\'actif');
  else ok('Rayon solo : énergie attachée sans choix');
}

// --- Boule d'énergie : récupère un Objet en défausse ---
{
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const p0 = engine.state.players[0];
  while (p0.active.energies.length < 3) {
    p0.active.energies.push({ cardId: 'energie-etoile', instanceId: `extra-e-${p0.active.energies.length}` });
  }
  p0.discard.push({ cardId: OBJET_ID, instanceId: 'disc-objet-1' });
  engine.attack(0, 1);
  await waitAttackEffects(engine);
  if (engine.state.pending?.type === 'recoverDiscard') {
    ok('Boule : pending choix Objet en défausse');
    engine.resolveRecoverDiscard(0, 'disc-objet-1');
    await waitAttackEffects(engine);
  }
  const inHand = p0.hand.some((c) => c.cardId === OBJET_ID);
  if (!inHand) fail('Boule : Objet non récupéré en main');
  else ok('Boule : Objet récupéré en main');
  if (p0.discard.some((c) => c.cardId === OBJET_ID)) fail('Boule : Objet encore en défausse');
}

// --- Talent : recherche Guerrier Asgard ---
{
  const engine = makeEngine();
  engine.initAttackTest(CARD_ID);
  const p0 = engine.state.players[0];
  p0.deck.push({ cardId: BENCH_ASGARD, instanceId: 'deck-asgard-1' });
  engine.useTalent(0);
  if (engine.state.pending?.type !== 'searchDeck') {
    fail(`Talent : pending searchDeck attendu, reçu ${engine.state.pending?.type}`);
  } else {
    engine.resolveSearchDeck(0, 'deck-asgard-1');
    const found = p0.hand.some((c) => c.cardId === BENCH_ASGARD);
    if (!found) fail('Talent : Guerrier Asgard non ajouté à la main');
    else ok('Talent : Guerrier Asgard cherché et ajouté à la main');
  }
}

process.exit(failed ? 1 : 0);

function assertCardJson(def) {
  if (def.hp !== 80) fail(`JSON hp=${def.hp}, attendu 80`);
  else ok('JSON : 80 PV');
  if (def.talent?.name !== 'Le réveil des Guerriers Divins') {
    fail(`JSON talent="${def.talent?.name}"`);
  } else {
    ok('JSON : talent Le réveil des Guerriers Divins');
  }
  if (def.attacks?.length !== 2) fail(`JSON : ${def.attacks?.length} attaques, attendu 2`);
  else ok('JSON : 2 attaques');
  const rayon = def.attacks?.[0];
  if (rayon?.name !== "Rayon de l'anneau" || rayon?.cost !== 1 || rayon?.damage !== 40) {
    fail(`JSON Rayon : ${JSON.stringify(rayon)}`);
  } else {
    ok('JSON : Rayon de l\'anneau 1/40');
  }
  const boule = def.attacks?.[1];
  if (boule?.name !== "Boule d'énergie" || boule?.cost !== 3 || boule?.damage !== 60) {
    fail(`JSON Boule : ${JSON.stringify(boule)}`);
  } else {
    ok('JSON : Boule d\'énergie 3/60');
  }
}
