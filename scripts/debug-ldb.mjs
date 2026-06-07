import fs from 'fs';
import path from 'path';
import os from 'os';

const file = path.join(
  os.homedir(),
  'AppData/Local/Google/Chrome/User Data/Default/Local Storage/leveldb/000259.ldb',
);
const text = fs.readFileSync(file).toString('latin1');

const idx = text.indexOf('chevalier-deck-stats');
console.log('stats idx', idx);
const slice = text.slice(idx, idx + 200000);

// deck stat keys look like "deck-123..." with name inside
const entries = [...slice.matchAll(/"(deck-\d{13}-[a-z0-9]+)"[^}]{0,120}?"name":"([^"]+)"/g)];
const byId = new Map();
for (const m of entries) byId.set(m[1], m[2]);

// also broken keys deckId in stats
for (const m of slice.matchAll(/deck-\d{13}-[a-z0-9]+/g)) {
  const id = m[0];
  if (byId.has(id)) continue;
  const ctx = slice.slice(m.index, m.index + 150);
  const nm = ctx.match(/"name":"([^"]+)"/);
  if (nm) byId.set(id, nm[1]);
}

console.log('stats decks', byId.size);
for (const [id, name] of byId) console.log(name, id);

// cards from main decks blob - between deck ids in chevalier-decks section
const deckIdx = text.indexOf('chevalier-decks');
const blob = text.slice(deckIdx, deckIdx + 400000);
const ids = [...blob.matchAll(/deck-\d{13}-[a-z0-9]+/g)].map((m) => m[0]);
const uniqueIds = [...new Set(ids)];
console.log('\ndeck ids in decks blob', uniqueIds.length);

function cardsForRegion(start, end) {
  const region = blob.slice(start, end);
  const cards = [];
  for (const m of region.matchAll(/"id":"([a-zA-Z0-9_\-]+)","count":(\d+)/g)) {
    if (m[1].startsWith('deck-')) continue;
    cards.push({ id: m[1], count: Number(m[2]) });
  }
  return cards;
}

const idPositions = [...blob.matchAll(/deck-\d{13}-[a-z0-9]+/g)];
for (let i = 0; i < idPositions.length; i++) {
  const id = idPositions[i][0];
  const start = idPositions[i].index;
  const end = i + 1 < idPositions.length ? idPositions[i + 1].index : start + 15000;
  const cards = cardsForRegion(start, end);
  if (cards.length >= 3) {
    const name = byId.get(id) || blob.slice(start, start + 120).match(/"name":"([^"]+)"/)?.[1] || id;
    const total = cards.reduce((s, c) => s + c.count, 0);
    console.log(`CARDS ${name}: ${total} (${cards.length} entries)`);
  }
}
