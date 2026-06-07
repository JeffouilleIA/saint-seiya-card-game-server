/**
 * Importe les decks Chrome + deck démo Chevalier1 → data/shared-decks.json
 * node scripts/import-decks.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(SERVER_ROOT, 'data', 'shared-decks.json');
const CHEVALIER_ROOT = path.resolve(SERVER_ROOT, '..', 'Chevalier1');

const CHROME_PROFILES = [
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Local Storage/leveldb'),
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Profile 1/Local Storage/leveldb'),
];

function tryParseDeckArray(str) {
  try {
    const parsed = JSON.parse(str);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return [];
    const ok = parsed.every(
      (d) => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards),
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

function extractAllDecksFromBuffer(buf) {
  const text = buf.toString('utf8');
  const found = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const keyIdx = text.indexOf('chevalier-decks', searchFrom);
    if (keyIdx === -1) break;
    const slice = text.slice(keyIdx);
    const start = slice.indexOf('[');
    if (start === -1) {
      searchFrom = keyIdx + 1;
      continue;
    }
    let depth = 0;
    let parsed = null;
    for (let i = start; i < slice.length; i++) {
      if (slice[i] === '[') depth++;
      else if (slice[i] === ']') {
        depth--;
        if (depth === 0) {
          parsed = tryParseDeckArray(slice.slice(start, i + 1));
          break;
        }
      }
    }
    if (parsed?.length) found.push(...parsed);
    searchFrom = keyIdx + 1;
  }
  return found;
}

function readChromeDecks() {
  const byId = new Map();
  for (const dir of CHROME_PROFILES) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log') || f.endsWith('.ldb'));
    for (const file of files) {
      try {
        const buf = fs.readFileSync(path.join(dir, file));
        for (const deck of extractAllDecksFromBuffer(buf)) {
          if (!byId.has(deck.id) || deck.cards.length >= (byId.get(deck.id).cards?.length ?? 0)) {
            byId.set(deck.id, deck);
          }
        }
      } catch {
        /* locked */
      }
    }
  }
  return [...byId.values()];
}

async function loadDefaultDeckFromChevalier() {
  globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^\.\/data\//, '');
    const filePath = path.join(CHEVALIER_ROOT, 'data', rel);
    if (!fs.existsSync(filePath)) return { ok: false, status: 404 };
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, json: async () => data };
  };
  const cardsMod = await import(pathToFileURL(path.join(CHEVALIER_ROOT, 'cards.js')).href);
  await cardsMod.loadCards();
  const { DEFAULT_DECK_LIST } = cardsMod;
  const map = new Map();
  for (const id of DEFAULT_DECK_LIST) {
    map.set(id, (map.get(id) || 0) + 1);
  }
  return {
    id: 'deck-demo-chevalier',
    name: 'Deck démo (Chevalier1)',
    cards: [...map.entries()].map(([id, count]) => ({ id, count })),
  };
}

function sanitizeDeck(deck) {
  if (!deck?.id || !deck?.name || !Array.isArray(deck.cards)) return null;
  const cards = deck.cards
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

function mergeDecks(existing, incoming) {
  const byId = new Map();
  for (const deck of existing) {
    const clean = sanitizeDeck(deck);
    if (clean) byId.set(clean.id, clean);
  }
  for (const deck of incoming) {
    const clean = sanitizeDeck(deck);
    if (!clean) continue;
    const prev = byId.get(clean.id);
    if (!prev || clean.cards.length >= prev.cards.length) {
      byId.set(clean.id, clean);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

const chromeDecks = readChromeDecks();
const defaultDeck = await loadDefaultDeckFromChevalier();
const existing = fs.existsSync(OUT_FILE)
  ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
  : [];

const merged = mergeDecks(existing, [...chromeDecks, defaultDeck]);
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

console.log(`Import terminé : ${merged.length} deck(s) → ${OUT_FILE}`);
for (const d of merged) {
  const total = d.cards.reduce((s, c) => s + c.count, 0);
  console.log(`  • ${d.name} (${total} cartes)`);
}
