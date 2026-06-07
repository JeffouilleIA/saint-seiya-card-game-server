import fs from 'fs';
import path from 'path';
import os from 'os';

const dir = path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Local Storage/leveldb');
const ids = new Set();
for (const file of fs.readdirSync(dir)) {
  try {
    const t = fs.readFileSync(path.join(dir, file)).toString('latin1');
    for (const m of t.matchAll(/deck-\d+-[a-z0-9]+/g)) ids.add(m[0]);
  } catch {}
}
console.log('deck ids in leveldb:', ids.size);
for (const id of ids) console.log(' ', id);
