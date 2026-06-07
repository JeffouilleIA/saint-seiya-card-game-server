/**
 * Importe les decks du jeu local Chevalier1 → Chevalier1/data/saved-decks.json
 * (lu par le serveur réseau via /api/decks)
 *
 * node scripts/import-chevalier1-decks.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHEVALIER_ROOT = path.resolve(__dirname, '..', '..', 'Chevalier1');
const OUT_FILE = path.join(CHEVALIER_ROOT, 'data', 'saved-decks.json');

function browserLevelDbDirs() {
  const bases = [
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data'),
  ];
  const dirs = [];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const ldb = path.join(base, name, 'Local Storage', 'leveldb');
      if (fs.existsSync(ldb)) dirs.push(ldb);
    }
  }
  return dirs;
}

function parseObjectAt(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return { obj: JSON.parse(text.slice(start, i + 1)), end: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractDeckObjects(text) {
  const decks = [];
  let pos = 0;
  while (pos < text.length) {
    const marker = text.indexOf('"id":"deck-', pos);
    if (marker === -1) break;
    const start = text.lastIndexOf('{', marker);
    if (start === -1 || start < pos) {
      pos = marker + 1;
      continue;
    }
    const parsed = parseObjectAt(text, start);
    if (parsed?.obj?.id?.startsWith('deck-') && parsed.obj.name && Array.isArray(parsed.obj.cards)) {
      decks.push(parsed.obj);
      pos = parsed.end;
    } else {
      pos = marker + 1;
    }
  }
  return decks;
}

function extractByRegions(text) {
  const decks = [];
  const names = new Map();
  for (const m of text.matchAll(/"(deck-\d{13}-[a-z0-9]+)"[^}]{0,250}?"name":"([^"]+)"/g)) {
    names.set(m[1], m[2]);
  }

  for (const section of text.split('chevalier-decks')) {
    const blob = section.slice(0, 600000);
    const positions = [...blob.matchAll(/deck-\d{13}-[a-z0-9]+/g)];
    for (let i = 0; i < positions.length; i++) {
      const id = positions[i][0];
      const start = positions[i].index;
      const end = i + 1 < positions.length ? positions[i + 1].index : start + 25000;
      const region = blob.slice(start, end);
      const cards = [];
      for (const cm of region.matchAll(/"id":"([a-zA-Z0-9_\-]+)","count":(\d+)/g)) {
        if (cm[1].startsWith('deck-')) continue;
        cards.push({ id: cm[1], count: Number(cm[2]) });
      }
      if (cards.length < 5) continue;
      const name =
        names.get(id) ||
        region.match(/"name":"([^"]+)"/)?.[1] ||
        'Sans nom';
      decks.push({ id, name, cards });
    }
  }
  return decks;
}

function sanitizeDeck(deck) {
  const cards = (deck.cards || [])
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({ id: c.id, count: Math.max(1, Math.min(60, Number(c.count) || 1)) }))
    .filter((c) => c.count > 0);
  if (!cards.length) return null;
  return {
    id: deck.id,
    name: String(deck.name).trim() || 'Sans nom',
    cards,
  };
}

function mergeDecks(list) {
  const byId = new Map();
  for (const raw of list) {
    const deck = sanitizeDeck(raw);
    if (!deck) continue;
    const prev = byId.get(deck.id);
    const score = deck.cards.reduce((s, c) => s + c.count, 0);
    const prevScore = prev ? prev.cards.reduce((s, c) => s + c.count, 0) : 0;
    if (!prev || score >= prevScore) byId.set(deck.id, deck);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function loadDefaultDeck() {
  globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^\.\/data\//, '');
    const filePath = path.join(CHEVALIER_ROOT, 'data', rel);
    if (!fs.existsSync(filePath)) return { ok: false, status: 404 };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  };
  const cardsMod = await import(pathToFileURL(path.join(CHEVALIER_ROOT, 'cards.js')).href);
  await cardsMod.loadCards();
  const map = new Map();
  for (const id of cardsMod.DEFAULT_DECK_LIST) {
    map.set(id, (map.get(id) || 0) + 1);
  }
  return {
    id: 'deck-demo-chevalier',
    name: 'Deck démo (Chevalier1)',
    cards: [...map.entries()].map(([id, count]) => ({ id, count })),
  };
}

const allRaw = [];
for (const dir of browserLevelDbDirs()) {
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(log|ldb|sst)$/i.test(file)) continue;
    let buf;
    try {
      buf = fs.readFileSync(path.join(dir, file));
    } catch {
      continue;
    }
    const latin = buf.toString('latin1');
    allRaw.push(...extractDeckObjects(latin));
    allRaw.push(...extractByRegions(latin));
    allRaw.push(...extractDeckObjects(buf.toString('utf8')));
    allRaw.push(...extractByRegions(buf.toString('utf8')));
  }
}

const existing = fs.existsSync(OUT_FILE)
  ? mergeDecks(JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')))
  : [];

const defaultDeck = await loadDefaultDeck();
const merged = mergeDecks([...existing, ...allRaw, defaultDeck]);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

console.log(`Importé ${merged.length} deck(s) dans le projet Chevalier1 :`);
for (const d of merged) {
  const total = d.cards.reduce((s, c) => s + c.count, 0);
  console.log(`  • ${d.name} (${total} cartes)`);
}
console.log(`\n→ ${OUT_FILE}`);
