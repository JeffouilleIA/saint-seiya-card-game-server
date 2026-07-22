/**
 * Fusion de fichiers saved-decks ({ folders, decks } ou tableau legacy).
 */
import fs from 'fs';
import path from 'path';

export function parseDeckStorageFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { folders: [], decks: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) {
      return { folders: [], decks: parsed.filter(Boolean) };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.decks)) {
      return {
        folders: Array.isArray(parsed.folders) ? parsed.folders.filter(Boolean) : [],
        decks: parsed.decks.filter(Boolean),
      };
    }
  } catch {
    /* ignore */
  }
  return { folders: [], decks: [] };
}

export function mergeDeckStorage(...layers) {
  const folderById = new Map();
  const deckById = new Map();
  for (const layer of layers) {
    for (const folder of layer?.folders || []) {
      if (folder?.id) folderById.set(folder.id, folder);
    }
    for (const deck of layer?.decks || []) {
      if (deck?.id) deckById.set(deck.id, deck);
    }
  }
  return {
    folders: [...folderById.values()],
    decks: [...deckById.values()],
  };
}

export function writeDeckStorageFile(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    folders: data.folders || [],
    decks: data.decks || [],
  };
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return payload;
}

export function mergeDeckStorageFiles(...filePaths) {
  const layers = filePaths.map(parseDeckStorageFile);
  return mergeDeckStorage(...layers);
}
