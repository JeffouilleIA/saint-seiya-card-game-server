/**
 * Shina du Cobra — Chef de meute : échange actif ↔ Chevalier d'Argent (banc)
 * node scripts/test-shina-chef-meute.mjs
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

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
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

const shinaDef = getCardDef('shina-du-cobra');
assert(shinaDef?.talent?.name === 'Chef de meute', 'Shina talent name');
assert(
  shinaDef.talent.effects?.some((e) => e.type === 'swap_active_with_bench_filter'),
  'Shina talent has swap_active_with_bench_filter effect',
);

const engine = new GameEngine({ gameMode: 'local2p', headless: true });
engine.reset();
engine.state.phase = 'main';
engine.state.turn = 0;
engine.state.winner = null;

const shina = {
  instanceId: 'shina-active',
  cardId: 'shina-du-cobra',
  currentHp: shinaDef.hp,
  maxHp: shinaDef.hp,
  energies: [],
  statuses: [],
  modifiers: {},
  talentUsed: false,
  ownerIndex: 0,
};

const mistyDef = getCardDef('misty-du-lezard');
const misty = {
  instanceId: 'misty-bench',
  cardId: 'misty-du-lezard',
  currentHp: mistyDef.hp,
  maxHp: mistyDef.hp,
  energies: [],
  statuses: [],
  modifiers: {},
  talentUsed: false,
  ownerIndex: 0,
};

engine.state.players[0].active = shina;
engine.state.players[0].bench.push(misty);

const talent = shinaDef.talent;
assert(engine.hasActivatableTalent(talent), 'Chef de meute is activatable');

const options = engine.getTalentOptions(0);
assert(
  options.some((o) => o.zone === 'active' && o.name === 'Chef de meute' && o.canUse),
  'Talent button option visible and usable',
);

assert(engine.canUseTalent(0, 'active'), 'canUseTalent(active)');

const ok = engine.useTalent(0, 'active');
assert(ok, 'useTalent returns true');
assert(engine.state.players[0].active?.cardId === 'misty-du-lezard', 'Misty is now active');
assert(
  engine.state.players[0].bench.some((k) => k?.cardId === 'shina-du-cobra'),
  'Shina moved to bench',
);
assert(shina.talentUsed, 'Shina talent marked used');

console.log('PASS: Shina Chef de meute talent visible and swap works');
