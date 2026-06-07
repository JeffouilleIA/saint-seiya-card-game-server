import fs from 'fs';
import path from 'path';
import os from 'os';

function dirs() {
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

const names = new Map();
const cardData = new Map();

for (const dir of dirs()) {
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(log|ldb|sst)$/i.test(file)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(dir, file)).toString('latin1');
    } catch {
      continue;
    }

    for (const m of text.matchAll(/"(deck-\d{13}-[a-z0-9]+)"[^}]{0,200}?"name":"([^"]+)"/g)) {
      names.set(m[1], m[2]);
    }
    for (const m of text.matchAll(/deck-\d{13}-[a-z0-9]+/g)) {
      const id = m[0];
      const ctx = text.slice(m.index, m.index + 200);
      const nm = ctx.match(/"name":"([^"]+)"/);
      if (nm && (!names.has(id) || names.get(id).length < nm[1].length)) {
        names.set(id, nm[1]);
      }
    }

    const deckSections = text.split('chevalier-decks');
    for (const section of deckSections.slice(1)) {
      const blob = section.slice(0, 500000);
      const positions = [...blob.matchAll(/deck-\d{13}-[a-z0-9]+/g)];
      for (let i = 0; i < positions.length; i++) {
        const id = positions[i][0];
        const start = positions[i].index;
        const end = i + 1 < positions.length ? positions[i + 1].index : start + 20000;
        const region = blob.slice(start, end);
        const cards = [];
        for (const cm of region.matchAll(/"id":"([a-zA-Z0-9_\-]+)","count":(\d+)/g)) {
          if (cm[1].startsWith('deck-')) continue;
          cards.push({ id: cm[1], count: Number(cm[2]) });
        }
        if (cards.length < 3) continue;
        const total = cards.reduce((s, c) => s + c.count, 0);
        const prev = cardData.get(id);
        if (!prev || total > prev.total) {
          cardData.set(id, { cards, total });
        }
      }
    }
  }
}

console.log('Names from stats/metadata:', names.size);
for (const [id, name] of [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))) {
  const cd = cardData.get(id);
  console.log(`${name.padEnd(24)} ${cd ? cd.total + ' cartes' : 'PAS DE LISTE'}  ${id}`);
}
console.log('\nCard lists without name:', [...cardData.keys()].filter((id) => !names.has(id)).length);
