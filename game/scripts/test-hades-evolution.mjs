/**
 * Test voies d'évolution Hadès corps humain (Shun + Pendentif).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  loadCards,
  getCardDef,
  formatEvolvesFrom,
  matchesEvolution,
  matchesEvolutionTarget,
  matchesHadesCorpsHumainViaPendentif,
  isForbiddenHadesCorpsHumainTarget,
  knightHasTool,
} from '../cards.js';

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

const HADES = 'hades-corps-humain';
const PENDENTIF = 'tool_pendentif_hades';

function mkKnight(cardId, toolId = null) {
  return {
    instanceId: `test-${cardId}`,
    cardId,
    attachedTool: toolId ? { cardId: toolId } : null,
  };
}

let passed = 0;
let failed = 0;

function assert(label, cond) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(` FAIL ${label}`);
  }
}

console.log('=== Hadès corps humain — règles d\'évolution ===\n');

// Shun paths (card-only match)
assert('Shun base match', matchesEvolution('shun_andromede', HADES));
assert('Shun cosmo ardent match', matchesEvolution('shun-cosmo-ardent', HADES));
assert('Hyoga base no card match', !matchesEvolution('hyoga-du-cygne', HADES));

// Pendentif path
const hyogaBronze = mkKnight('hyoga-du-cygne', PENDENTIF);
assert('Hyoga + pendentif via target', matchesEvolutionTarget(hyogaBronze, HADES));
assert('Hyoga + pendentif via helper', matchesHadesCorpsHumainViaPendentif(hyogaBronze));

const hyogaDivin = mkKnight('hyoga_armure_divine', PENDENTIF);
assert('Hyoga divin interdit (type)', isForbiddenHadesCorpsHumainTarget(getCardDef('hyoga_armure_divine')));
assert('Hyoga divin + pendentif refusé', !matchesHadesCorpsHumainViaPendentif(hyogaDivin));
assert('Hyoga divin + pendentif target refusé', !matchesEvolutionTarget(hyogaDivin, HADES));

const spectre = mkKnight('rhadamantys', PENDENTIF);
assert('Spectre interdit', isForbiddenHadesCorpsHumainTarget(getCardDef('rhadamantys')));
assert('Spectre + pendentif refusé', !matchesEvolutionTarget(spectre, HADES));

const juge = mkKnight('minos', PENDENTIF);
assert('Juge interdit', isForbiddenHadesCorpsHumainTarget(getCardDef('minos')));
assert('Juge + pendentif refusé', !matchesEvolutionTarget(juge, HADES));

const shunNoTool = mkKnight('shun_andromede');
assert('Shun sans pendentif match target (voie Shun)', matchesEvolutionTarget(shunNoTool, HADES));
assert('Shun sans pendentif pas via pendentif', !matchesHadesCorpsHumainViaPendentif(shunNoTool));

const shunTool = mkKnight('shun_andromede', PENDENTIF);
assert('Shun + pendentif match', matchesEvolutionTarget(shunTool, HADES));
assert('Shun + pendentif has tool', knightHasTool(shunTool, PENDENTIF));

const hyogaNoTool = mkKnight('hyoga-du-cygne');
assert('Hyoga sans pendentif pas éligible', !matchesEvolutionTarget(hyogaNoTool, HADES));

const evoDef = getCardDef(HADES);
const fromLabel = formatEvolvesFrom(evoDef);
assert('Label UI mentionne Pendentif', fromLabel.includes('Pendentif'));
console.log(`\nformatEvolvesFrom: ${fromLabel}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
