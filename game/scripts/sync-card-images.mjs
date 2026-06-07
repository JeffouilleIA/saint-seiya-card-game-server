/**
 * Copy mapped photos from base image → assets/cards, update card-images.json + card JSON image fields.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseImage = path.resolve(root, '../../base image');
const assetsDir = path.join(root, 'assets/cards');
const mapPath = path.join(root, 'data/card-images.json');

/** cardId → source filename in base image */
const IMAGE_MAP = {
  'vieux-maitre': '20260523_234222.jpg',
  'dokko-de-la-balance': '20260523_234229.jpg',
  'milo-du-scorpion': '20260523_234233.jpg',
  'aioros-du-sagittaire': '20260523_234246.jpg',
  'aioros_sagittaire': '20260523_234246.jpg',
  'shura-du-capricorne': '20260523_234254.jpg',
  'le-grand-pope': '20260523_234309.jpg',
  'saga-mechant': '20260523_234313.jpg',
  'mu-de-jamir': '20260523_175513~2.jpg',
  'mu-du-belier': '20260523_175519~2.jpg',
  'aldebaran-du-taureau': '20260523_175526~2.jpg',
  'aldebaran_taureau': '20260523_175526~2.jpg',
  'masque-de-mort-du-cancer': '20260523_175531~2.jpg',
  saga: '20260523_175542~2.jpg',
  'saga-des-gemeaux': '20260523_175547~2.jpg',
  shakka: '20260523_175556~2.jpg',
  'shaka-de-la-vierge': '20260523_175606~2.jpg',
  poseidon: '20260523_234339.jpg',
  'athena-exclamation': '20260523_234352.jpg',
  'esprit-d-aioros': '20260523_234413.jpg',
  'entrainement-de-dokho': '20260523_234427.jpg',
  sanctuaire: '20260523_234641.jpg',
  'collier-des-108-perles': '20260523_234645.jpg',
  'puit-des-ames': '20260523_234652.jpg',
  'chateau-d-hades': '20260523_234705.jpg',
  'les-cinq-pics': '20260523_234713.jpg',
  'septieme-sens': '20260523_234729.jpg',
  'huitieme-sens': '20260523_234735.jpg',
  'dernier-souffle': '20260523_234739.jpg',
  'armes-de-la-balance': '20260523_234744.jpg',
  objet_tournoi_galactique: '20260523_175316.jpg',
  'shun-d-andromede': '20260523_175353.jpg',
};

const dataFiles = [
  'data/cards.json',
  'data/cards-argent.json',
  'data/cards-bronze-mineur.json',
  'data/cards-or.json',
  'data/objets.json',
];

fs.mkdirSync(assetsDir, { recursive: true });
const cardImages = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

let copied = 0;
for (const [cardId, file] of Object.entries(IMAGE_MAP)) {
  const src = path.join(baseImage, file);
  if (!fs.existsSync(src)) {
    console.warn('missing source', file, 'for', cardId);
    continue;
  }
  const destName = `${cardId}.jpg`;
  const dest = path.join(assetsDir, destName);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    copied++;
  }
  cardImages[cardId] = destName;
}

// Remove alias duplicate keys
delete cardImages.item_mission_gigas;
delete cardImages.item_entrainement_bronzes;

fs.writeFileSync(mapPath, `${JSON.stringify(cardImages, null, 2)}\n`);

for (const rel of dataFiles) {
  const fp = path.join(root, rel);
  const cards = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  for (const card of cards) {
    const file = cardImages[card.id];
    if (file && card.image !== file) {
      card.image = file;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(fp, `${JSON.stringify(cards, null, 2)}\n`);
}

console.log(JSON.stringify({ copied, mapped: Object.keys(IMAGE_MAP).length }, null, 2));
