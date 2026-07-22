/**
 * Copie Chevalier1 → ./game pour le déploiement (Railway).
 * Préserve les decks : fusionne game/data/saved-decks.json existant avec la source.
 * En local : node scripts/sync-game.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  mergeDeckStorageFiles,
  parseDeckStorageFile,
  writeDeckStorageFile,
} from './merge-deck-storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');
const SOURCE = path.resolve(SERVER_ROOT, '..', 'Chevalier1');
const TARGET = path.join(SERVER_ROOT, 'game');
const DECKS_REL = path.join('data', 'saved-decks.json');

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

const previousDecksPath = path.join(TARGET, DECKS_REL);
const previousDecks = parseDeckStorageFile(previousDecksPath);
const hadPreviousDecks =
  previousDecks.decks.length > 0 || previousDecks.folders.length > 0;

if (fs.existsSync(TARGET)) fs.rmSync(TARGET, { recursive: true, force: true });
copyDir(SOURCE, TARGET);

const sourceDecksPath = path.join(SOURCE, DECKS_REL);
const mergedDecksPath = path.join(TARGET, DECKS_REL);
if (hadPreviousDecks || fs.existsSync(sourceDecksPath)) {
  const merged = mergeDeckStorageFiles(sourceDecksPath, previousDecksPath);
  writeDeckStorageFile(mergedDecksPath, merged);
  const sourceCount = parseDeckStorageFile(sourceDecksPath).decks.length;
  const prevCount = previousDecks.decks.length;
  console.log(
    `Decks fusionnés : source=${sourceCount}, précédent game=${prevCount}, total=${merged.decks.length}`,
  );
}

console.log('Jeu copié :', TARGET);
