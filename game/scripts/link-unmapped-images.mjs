/**
 * Link unmapped card photos → assets/cards/{cardId}.jpg
 * Only cards with no existing mapping / missing image file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE_IMAGE = 'c:/Users/jeffp/OneDrive/Documents/base image';
const ASSETS = path.join(ROOT, 'assets/cards');
const DATA = path.join(ROOT, 'data');

const CARD_FILES = [
  'cards.json',
  'cards-argent.json',
  'cards-bronze-mineur.json',
  'cards-or.json',
  'objets.json',
];

/** cardId → source filename (resolved under base image or assets/cards) */
const LINKS = {
  'shun-d-andromede': '20260523_175353.jpg',
  'vieux-maitre': '20260523_234222.jpg',
  'dokko-de-la-balance': '20260523_234229.jpg',
  'milo-du-scorpion': '20260523_234233.jpg',
  'aioros-du-sagittaire': '20260523_234246.jpg',
  'aioros_sagittaire': '20260523_234246.jpg',
  'shura-du-capricorne': '20260523_234254.jpg',
  'le-grand-pope': '20260523_234309.jpg',
  'saga-mechant': '20260523_234313.jpg',
  'stadium_elysion': '20260523_091044.jpg',
  'stade-elysion': '20260523_091044.jpg',
  'collier-des-108-perles': '20260523_234645.jpg',
  'puit-des-ames': '20260523_234652.jpg',
  'chateau-d-hades': '20260523_234705.jpg',
  'les-cinq-pics': '20260523_234713.jpg',
  'septieme-sens': '20260523_234729.jpg',
  'huitieme-sens': '20260523_234735.jpg',
  'dernier-souffle': '20260523_234739.jpg',
  'armes-de-la-balance': '20260523_234744.jpg',
  'objet_tournoi_galactique': '20260523_175316.jpg',
  poseidon: '20260523_234339.jpg',
  'athena-exclamation': '20260523_234352.jpg',
  'esprit-d-aioros': '20260523_234413.jpg',
};

function resolveSource(filename) {
  const candidates = [
    path.join(BASE_IMAGE, filename),
    path.join(ASSETS, filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isMapped(cardId, imageMap, assetFiles) {
  if (imageMap[cardId]) {
    const f = imageMap[cardId];
    if (assetFiles.has(f) || assetFiles.has(`${cardId}.jpg`) || assetFiles.has(`${cardId}.png`)) {
      return true;
    }
  }
  return assetFiles.has(`${cardId}.jpg`) || assetFiles.has(`${cardId}.png`);
}

function loadCards() {
  const byId = new Map();
  for (const file of CARD_FILES) {
    const arr = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
    for (const c of arr) {
      byId.set(c.id, { card: c, file });
    }
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

const imageMap = JSON.parse(fs.readFileSync(path.join(DATA, 'card-images.json'), 'utf8'));
const assetFiles = new Set(fs.readdirSync(ASSETS));
const cardsById = loadCards();

const linked = [];
const skipped = [];
const errors = [];

for (const [cardId, srcName] of Object.entries(LINKS)) {
  if (isMapped(cardId, imageMap, assetFiles)) {
    skipped.push({ cardId, reason: 'already mapped' });
    continue;
  }
  if (!cardsById.has(cardId)) {
    errors.push({ cardId, reason: 'card id not in data files' });
    continue;
  }

  const srcPath = resolveSource(srcName);
  if (!srcPath) {
    errors.push({ cardId, reason: `source not found: ${srcName}` });
    continue;
  }

  const ext = path.extname(srcPath).toLowerCase() || '.jpg';
  const destName = `${cardId}${ext}`;
  const destPath = path.join(ASSETS, destName);

  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
  }

  imageMap[cardId] = destName;
  const { file } = cardsById.get(cardId);
  updateCardImageField(path.join(DATA, file), cardId, destName);
  linked.push({ cardId, filename: destName, source: srcName });
}

fs.writeFileSync(
  path.join(DATA, 'card-images.json'),
  `${JSON.stringify(imageMap, null, 2)}\n`,
  'utf8',
);

console.log('LINKED', linked.length);
for (const l of linked) console.log(`  ${l.cardId} → ${l.filename} (from ${l.source})`);
if (skipped.length) {
  console.log('SKIPPED', skipped.length);
  skipped.forEach((s) => console.log(`  ${s.cardId}: ${s.reason}`));
}
if (errors.length) {
  console.log('ERRORS', errors.length);
  errors.forEach((e) => console.log(`  ${e.cardId}: ${e.reason}`));
}
