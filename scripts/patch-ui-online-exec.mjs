/**
 * Remplace les appels moteur mutants par execEngine / execEngineAsync dans ui.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ONLINE_GUEST_METHODS } from '../game/online-actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_PATH = path.join(__dirname, '..', 'game', 'ui.js');

const methods = [...ONLINE_GUEST_METHODS].sort((a, b) => b.length - a.length);
let src = fs.readFileSync(UI_PATH, 'utf8');

for (const method of methods) {
  const reVoidAsync = new RegExp(`void this\\.engine\\.${method}\\(`, 'g');
  src = src.replace(reVoidAsync, `void this.execEngineAsync('${method}', `);

  const reAwait = new RegExp(`await this\\.engine\\.${method}\\(`, 'g');
  src = src.replace(reAwait, `await this.execEngineAsync('${method}', `);

  const rePlain = new RegExp(`this\\.engine\\.${method}\\(`, 'g');
  src = src.replace(rePlain, `this.execEngine('${method}', `);
}

if (!src.includes('execEngine(method')) {
  console.error('execEngine helper missing — add it to ui.js first.');
  process.exit(1);
}

fs.writeFileSync(UI_PATH, src);
console.log('ui.js patched for online execEngine');
