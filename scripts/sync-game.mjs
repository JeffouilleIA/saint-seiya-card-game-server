/**
 * Copie Chevalier1 → ./game pour le déploiement (Railway).
 * En local : node scripts/sync-game.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');
const SOURCE = path.resolve(SERVER_ROOT, '..', 'Chevalier1');
const TARGET = path.join(SERVER_ROOT, 'game');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'backend', '.cursor', 'game']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

const hasSource = fs.existsSync(path.join(SOURCE, 'index.html'));
const hasTarget = fs.existsSync(path.join(TARGET, 'index.html'));

if (!hasSource) {
  if (hasTarget) {
    console.log('Chevalier1 absent — ./game déjà présent, sync ignorée.');
    process.exit(0);
  }
  console.error('Chevalier1 introuvable :', SOURCE);
  process.exit(1);
}

if (fs.existsSync(TARGET)) fs.rmSync(TARGET, { recursive: true, force: true });
copyDir(SOURCE, TARGET);
console.log('Jeu copié :', TARGET);
