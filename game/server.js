/**
 * Serveur local pour Chrome (modules ES) + API decks (data/saved-decks.json)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDecksApi } from './decks-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const { DECKS_FILE, handleDecksApi } = createDecksApi(path.join(__dirname, 'data', 'saved-decks.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
};

const server = http.createServer(async (req, res) => {
  let urlPath = req.url.split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    /* malformed escape sequences */
  }

  if (urlPath.startsWith('/api/decks')) {
    try {
      if (await handleDecksApi(req, res, urlPath)) return;
    } catch (err) {
      console.error('API decks:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Erreur serveur.' }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, urlPath.replace(/^\//, ''));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.js' || ext === '.html' || ext === '.json' || ext === '.css') {
      headers['Cache-Control'] = 'no-cache';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Chevalier TCG → http://localhost:${PORT}`);
  console.log(`Decks projet → ${DECKS_FILE}`);
});
