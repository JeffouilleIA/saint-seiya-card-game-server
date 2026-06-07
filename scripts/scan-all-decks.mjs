/**
 * Extraction exhaustive des decks Chrome (toutes origines localhost:8080, :3000, IP…)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROFILES = [];

function addProfile(base) {
  if (!fs.existsSync(base)) return;
  for (const name of fs.readdirSync(base)) {
    const ldb = path.join(base, name, 'Local Storage', 'leveldb');
    if (fs.existsSync(ldb)) PROFILES.push(ldb);
  }
}

addProfile(path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data'));
addProfile(path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data'));

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

function extractAllFromText(text) {
  const found = [];
  let pos = 0;
  while (pos < text.length) {
    const keyIdx = text.indexOf('chevalier-decks', pos);
    if (keyIdx === -1) break;
    const slice = text.slice(keyIdx);
    const start = slice.indexOf('[');
    if (start === -1) {
      pos = keyIdx + 1;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = start; i < slice.length && i < start + 500000; i++) {
      const ch = slice[i];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > start) {
      const parsed = tryParseDeckArray(slice.slice(start, end + 1));
      if (parsed?.length) found.push(...parsed);
    }
    pos = keyIdx + 1;
  }
  return found;
}

function deckScore(deck) {
  const cards = deck.cards?.length ?? 0;
  const total = (deck.cards || []).reduce((s, c) => s + (Number(c.count) || 0), 0);
  const nameLen = (deck.name || '').length;
  return cards * 1000 + total + nameLen;
}

function mergeById(decks) {
  const byId = new Map();
  for (const deck of decks) {
    if (!deck?.id) continue;
    const prev = byId.get(deck.id);
    if (!prev || deckScore(deck) > deckScore(prev)) {
      byId.set(deck.id, deck);
    }
  }
  return [...byId.values()];
}

const all = [];
for (const dir of PROFILES) {
  const files = fs.readdirSync(dir).filter((f) => /\.(log|ldb|sst)$/i.test(f));
  for (const file of files) {
    try {
      const buf = fs.readFileSync(path.join(dir, file));
      all.push(...extractAllFromText(buf.toString('latin1')));
      all.push(...extractAllFromText(buf.toString('utf8')));
    } catch {
      /* locked */
    }
  }
  console.error(`Scanned ${dir}: ${files.length} files`);
}

const merged = mergeById(all).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
console.log(JSON.stringify(merged, null, 2));
console.error(`\nTotal unique decks: ${merged.length}`);
