/**
 * Chevalier TCG — serveur local + Railway.
 * - Jeu statique (Chevalier1)
 * - API decks : /api/decks
 * - Socket.io sur le même port (prêt multijoueur, polling + WebSocket)
 */
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Server as SocketServer } from 'socket.io';
import { fileURLToPath, pathToFileURL } from 'url';
import { attachMultiplayerLobby, getLobbyStats } from './lobby.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);

function resolveGameRoot() {
  if (process.env.GAME_ROOT) {
    return path.resolve(process.env.GAME_ROOT);
  }
  const sibling = path.join(__dirname, '..', 'Chevalier1');
  const bundled = path.join(__dirname, 'game');
  if (fs.existsSync(path.join(sibling, 'index.html'))) return sibling;
  if (fs.existsSync(path.join(bundled, 'index.html'))) return bundled;
  return sibling;
}

const GAME_ROOT = resolveGameRoot();
const DECKS_FILE = path.resolve(
  process.env.DECKS_FILE || path.join(GAME_ROOT, 'data', 'saved-decks.json'),
);

if (!fs.existsSync(GAME_ROOT)) {
  console.error(`Dossier jeu introuvable : ${GAME_ROOT}`);
  if (IS_RAILWAY) {
    console.error('Sur Railway : vérifiez que "npm run build" copie Chevalier1 dans ./game');
  } else {
    console.error('En local : placez Chevalier1 à côté du projet ou lancez npm run sync-game');
  }
  process.exit(1);
}

const { createDecksApi } = await import(pathToFileURL(path.join(GAME_ROOT, 'decks-api.js')).href);
const { readSharedDecks, readSharedDeckData, handleDecksApi } = createDecksApi(DECKS_FILE);

function menuHasDeckFolders() {
  try {
    const menuPath = path.join(GAME_ROOT, 'menu.js');
    return fs.readFileSync(menuPath, 'utf8').includes('UNFILED_FOLDER_LABEL');
  } catch {
    return false;
  }
}

const app = express();
app.disable('x-powered-by');

const httpServer = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || true;
const io = new SocketServer(httpServer, {
  path: '/socket.io/',
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingInterval: 25000,
  pingTimeout: 20000,
});

attachMultiplayerLobby(io);

function sendJson(res, status, body) {
  res.status(status).set('Cache-Control', 'no-store').json(body);
}

app.get('/health', (_req, res) => {
  const deckData = readSharedDeckData();
  sendJson(res, 200, {
    ok: true,
    gameRoot: GAME_ROOT,
    decksFile: DECKS_FILE,
    deckCount: deckData.decks.length,
    folderCount: deckData.folders.length,
    menuHasDeckFolders: menuHasDeckFolders(),
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
    port: PORT,
    railway: IS_RAILWAY,
    socketio: true,
    multiplayerRooms: getLobbyStats().roomCount,
  });
});

app.use(async (req, res, next) => {
  if (req.path !== '/api/decks') return next();
  try {
    const handled = await handleDecksApi(req, res, '/api/decks');
    if (!handled) sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error('API decks error:', err);
    sendJson(res, 500, { ok: false, error: 'Erreur serveur.' });
  }
});

app.use(
  express.static(GAME_ROOT, {
    index: 'index.html',
    etag: false,
    lastModified: false,
    setHeaders(res, filePath) {
      const ext = path.extname(filePath);
      if (['.js', '.html', '.json', '.css'].includes(ext)) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }),
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return next();
  }
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(GAME_ROOT, 'index.html'), (err) => {
    if (err) next();
  });
});

function getLocalAddresses() {
  const addrs = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

httpServer.listen(PORT, HOST, () => {
  console.log('Chevalier TCG — serveur démarré');
  console.log(`Jeu    : ${GAME_ROOT}`);
  console.log(`Decks  : ${DECKS_FILE}`);
  console.log(`Écoute : ${HOST}:${PORT}`);
  if (!IS_RAILWAY) {
    console.log(`Local  : http://127.0.0.1:${PORT}`);
    const addrs = getLocalAddresses();
    if (addrs.length) {
      console.log('Réseau LAN :');
      for (const ip of addrs) console.log(`  http://${ip}:${PORT}`);
    }
  }
  if (IS_RAILWAY && process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`Public : https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
});
