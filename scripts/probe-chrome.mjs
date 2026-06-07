import fs from 'fs';
import path from 'path';
import os from 'os';

function profiles() {
  const bases = [
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data'),
  ];
  const out = [];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const ldb = path.join(base, name, 'Local Storage', 'leveldb');
      if (fs.existsSync(ldb)) out.push(ldb);
    }
  }
  return out;
}

function extractArrays(text) {
  const found = [];
  let pos = 0;
  while (pos < text.length) {
    const i = text.indexOf('chevalier-decks', pos);
    if (i === -1) break;
    const slice = text.slice(i);
    const start = slice.indexOf('[');
    if (start === -1) { pos = i + 1; continue; }
    let depth = 0;
    for (let j = start; j < slice.length && j < start + 600000; j++) {
      if (slice[j] === '[') depth++;
      else if (slice[j] === ']') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(slice.slice(start, j + 1));
            if (Array.isArray(parsed) && parsed.every((d) => d?.id && d?.name && d?.cards)) {
              found.push(parsed);
            }
          } catch {}
          break;
        }
      }
    }
    pos = i + 1;
  }
  return found;
}

const byId = new Map();
for (const dir of profiles()) {
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(log|ldb|sst)$/i.test(file)) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(dir, file)); } catch { continue; }
    for (const enc of ['latin1', 'utf8']) {
      for (const arr of extractArrays(buf.toString(enc))) {
        for (const deck of arr) {
          const prev = byId.get(deck.id);
          const score = (deck.cards?.length ?? 0) + (deck.name?.length ?? 0);
          const prevScore = (prev?.cards?.length ?? 0) + (prev?.name?.length ?? 0);
          if (!prev || score > prevScore) byId.set(deck.id, deck);
        }
      }
    }
  }
}

console.log('Unique decks:', byId.size);
for (const d of [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
  const total = d.cards.reduce((s, c) => s + c.count, 0);
  console.log(`  ${d.name} (${total} cartes, id=${d.id})`);
}
