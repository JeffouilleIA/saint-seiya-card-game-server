import fs from 'fs';
import path from 'path';
import os from 'os';

const dir = path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Local Storage/leveldb');
const target = process.argv[2] || 'deck-1779521498797-xud5i';

for (const file of fs.readdirSync(dir)) {
  const t = fs.readFileSync(path.join(dir, file)).toString('latin1');
  const idx = t.indexOf(target);
  if (idx === -1) continue;
  console.log('Found in', file);
  console.log(t.slice(Math.max(0, idx - 200), idx + 4000));
}
