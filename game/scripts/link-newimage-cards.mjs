/**
 * Copy card photos from Documents/newimage → assets/cards/{cardId}.jpg
 * and update data/card-images.json (+ card JSON image fields when present).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NEWIMAGE = path.resolve('C:/Users/jeffp/Documents/newimage');
const ASSETS = path.join(ROOT, 'assets/cards');
const DATA = path.join(ROOT, 'data');

/** cardId → source filename in newimage (identified from card photos) */
const LINKS = {
  fenril_alioth: '20260524_223000.jpg',
  thor_phecda: '20260524_224451.jpg',
  hagen_merak: '20260524_224458.jpg',
  mime_veneta: '20260524_224510.jpg',
  alberic_megrez: '20260524_224517.jpg',
  syd_mizar: '20260524_224522.jpg',
  bud_alcor: '20260524_224529.jpg',
  ikki_armure_divine: '20260524_224636.jpg',
  shun_armure_divine: '20260524_224718.jpg',
  hyoga_armure_divine: '20260524_224845.jpg',
  shiryu_armure_divine: '20260524_225021.jpg',
  les_12_maisons: '20260524_223023~2.jpg',
  tool_apprentice_training: '20260524_222907.jpg',
  tool_healing_volcano: '20260524_225330.jpg',
  support_princess_flamme: '20260524_225321.jpg',
  god_poseidon: '20260524_222634.jpg',
  tool_black_knight_training: '20260524_222824.jpg',
  support_lord_odin: '20260524_225302.jpg',
  support_jango: '20260524_225317.jpg',
  stadium_dead_queen_island: '20260524_225325.jpg',
  siegfried_dubhe: '20260524_225159.jpg',
  hilda_polaris: '20260524_225159.jpg',
  athena: '20260524_225235.jpg',
  'athena-armure-divine': '20260524_225302.jpg',
  thanatos: '20260524_225317.jpg',
  hypnos: '20260524_225321.jpg',
  'hades-corps-humain': '20260524_225325.jpg',
  'hades-vrai-corps': '20260524_225330.jpg',
};

const CARD_FILES = [
  'cards.json',
  'cards-argent.json',
  'cards-bronze-mineur.json',
  'cards-or.json',
  'cards-asgard.json',
  'cards-divin.json',
  'objets.json',
];

function loadCards() {
  const byId = new Map();
  for (const file of CARD_FILES) {
    const fp = path.join(DATA, file);
    if (!fs.existsSync(fp)) continue;
    const arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
    for (const c of arr) byId.set(c.id, { card: c, file });
  }
  return byId;
}

function updateCardImageField(filePath, cardId, destName) {
  const arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;
  for (const c of arr) {
    if (c.id === cardId) {
      c.image = destName;
      changed = true;
      break;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(arr, null, 2)}\n`, 'utf8');
  }
  return changed;
}

fs.mkdirSync(ASSETS, { recursive: true });
const imageMap = JSON.parse(fs.readFileSync(path.join(DATA, 'card-images.json'), 'utf8'));
const cardsById = loadCards();
const linked = [];
const errors = [];

for (const [cardId, srcName] of Object.entries(LINKS)) {
  const srcPath = path.join(NEWIMAGE, srcName);
  if (!fs.existsSync(srcPath)) {
    errors.push({ cardId, reason: `source not found: ${srcName}` });
    continue;
  }
  if (!cardsById.has(cardId)) {
    errors.push({ cardId, reason: 'card id not in data files' });
    continue;
  }

  const destName = `${cardId}.jpg`;
  const destPath = path.join(ASSETS, destName);
  fs.copyFileSync(srcPath, destPath);

  imageMap[cardId] = destName;
  const { file } = cardsById.get(cardId);
  updateCardImageField(path.join(DATA, file), cardId, destName);
  linked.push({ cardId, destName, source: srcName });
}

fs.writeFileSync(
  path.join(DATA, 'card-images.json'),
  `${JSON.stringify(imageMap, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({ linked, errors, unmatchedInNewimage: listUnmatched() }, null, 2));

function listUnmatched() {
  const used = new Set(Object.values(LINKS));
  return fs
    .readdirSync(NEWIMAGE)
    .filter((f) => f.match(/\.(jpe?g|png|webp)$/i) && !used.has(f))
    .sort();
}
