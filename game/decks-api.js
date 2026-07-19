/**
 * API fichiers decks partagés (Chevalier1/data/saved-decks.json)
 */
import fs from 'fs';
import path from 'path';

export function createDecksApi(decksFile) {
  const DECKS_FILE = path.resolve(decksFile);

  function sendJson(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }

  function readBody(req, maxBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > maxBytes) {
          reject(new Error('Body too large'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  function ensureDecksFile() {
    const dir = path.dirname(DECKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DECKS_FILE)) fs.writeFileSync(DECKS_FILE, '[]\n', 'utf8');
  }

  function sanitizeFolderEntry(folder) {
    if (!folder || typeof folder.id !== 'string' || typeof folder.name !== 'string') {
      return null;
    }
    return { id: folder.id, name: folder.name.trim() || 'Sans nom' };
  }

  function sanitizeFolderList(folders) {
    const out = [];
    const seen = new Set();
    for (const folder of folders || []) {
      const clean = sanitizeFolderEntry(folder);
      if (!clean || seen.has(clean.id)) continue;
      seen.add(clean.id);
      out.push(clean);
    }
    return out;
  }

  function sanitizeDeckEntry(deck) {
    if (!deck || typeof deck.id !== 'string' || typeof deck.name !== 'string' || !Array.isArray(deck.cards)) {
      return null;
    }
    const cards = deck.cards
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({ id: c.id, count: Math.max(0, Number(c.count) || 0) }))
      .filter((c) => c.count > 0);
    if (!cards.length) return null;
    const clean = { id: deck.id, name: deck.name.trim() || 'Sans nom', cards };
    if (typeof deck.folderId === 'string' && deck.folderId) {
      clean.folderId = deck.folderId;
    }
    return clean;
  }

  function sanitizeDeckList(decks) {
    const out = [];
    const seen = new Set();
    for (const deck of decks || []) {
      const clean = sanitizeDeckEntry(deck);
      if (!clean || seen.has(clean.id)) continue;
      seen.add(clean.id);
      out.push(clean);
    }
    return out;
  }

  function parseStoredDeckFile(parsed) {
    if (Array.isArray(parsed)) {
      return { folders: [], decks: sanitizeDeckList(parsed) };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.decks)) {
      return {
        folders: sanitizeFolderList(parsed.folders),
        decks: sanitizeDeckList(parsed.decks),
      };
    }
    return { folders: [], decks: [] };
  }

  function readSharedDeckData() {
    ensureDecksFile();
    try {
      const parsed = JSON.parse(fs.readFileSync(DECKS_FILE, 'utf8'));
      return parseStoredDeckFile(parsed);
    } catch {
      return { folders: [], decks: [] };
    }
  }

  function writeSharedDeckData({ folders = [], decks = [] } = {}) {
    ensureDecksFile();
    const payload = {
      folders: sanitizeFolderList(folders),
      decks: sanitizeDeckList(decks),
    };
    const tmp = `${DECKS_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, DECKS_FILE);
    return payload;
  }

  async function handleDecksApi(req, res, urlPath) {
    if (urlPath === '/api/decks' && req.method === 'GET') {
      const data = readSharedDeckData();
      sendJson(res, 200, { ok: true, shared: true, ...data });
      return true;
    }
    if (urlPath === '/api/decks' && req.method === 'PUT') {
      let payload;
      try {
        const raw = await readBody(req);
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'JSON invalide.' });
        return true;
      }
      if (!Array.isArray(payload.decks)) {
        sendJson(res, 400, { ok: false, error: 'Champ "decks" (tableau) requis.' });
        return true;
      }
      const data = writeSharedDeckData({
        folders: payload.folders,
        decks: payload.decks,
      });
      sendJson(res, 200, { ok: true, ...data });
      return true;
    }
    return false;
  }

  return { DECKS_FILE, readSharedDecks: () => readSharedDeckData().decks, readSharedDeckData, handleDecksApi };
}
