/**
 * Client multijoueur internet — Socket.io, lobby, sync de partie, reconnexion.
 */

let ioPromise = null;

const PLAYER_TOKEN_KEY = 'chevalier-mp-player-token';
const LAST_ROOM_KEY = 'chevalier-mp-last-room';

function loadSocketIoClient() {
  if (typeof window !== 'undefined' && window.io) {
    return Promise.resolve(window.io);
  }
  if (ioPromise) return ioPromise;
  ioPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.async = true;
    script.onload = () => {
      if (window.io) resolve(window.io);
      else reject(new Error('Socket.io client indisponible.'));
    };
    script.onerror = () => reject(new Error('Impossible de charger Socket.io.'));
    document.head.appendChild(script);
  });
  return ioPromise;
}

function emitAsync(socket, event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (reply) => resolve(reply || { ok: false, error: 'Pas de réponse.' }));
  });
}

export function getPlayerToken() {
  if (typeof sessionStorage === 'undefined') return randomToken();
  let token = sessionStorage.getItem(PLAYER_TOKEN_KEY);
  if (!token) {
    token = randomToken();
    sessionStorage.setItem(PLAYER_TOKEN_KEY, token);
  }
  return token;
}

function randomToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function rememberLastRoom(code, seat) {
  if (typeof sessionStorage === 'undefined' || !code) return;
  sessionStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, seat, at: Date.now() }));
}

export function readLastRoom() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LAST_ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastRoom() {
  sessionStorage?.removeItem(LAST_ROOM_KEY);
}

export class MultiplayerClient {
  constructor() {
    /** @type {import('socket.io-client').Socket | null} */
    this.socket = null;
    this.connected = false;
    this.room = null;
    this.seat = null;
    this.playerToken = getPlayerToken();
    /** @type {((room: object) => void) | null} */
    this.onRoomUpdate = null;
    /** @type {((payload: object) => void) | null} */
    this.onGameStart = null;
    /** @type {((payload: object) => void) | null} */
    this.onGameState = null;
    /** @type {((payload: object) => void) | null} */
    this.onGameAction = null;
    /** @type {(() => void) | null} */
    this.onOpponentLeft = null;
    /** @type {((payload: object) => void) | null} */
    this.onPlayerDisconnected = null;
    /** @type {((payload: object) => void) | null} */
    this.onPlayerReconnected = null;
    /** @type {((payload: object) => void) | null} */
    this.onRejoined = null;
    this._stateSeq = 0;
  }

  get isHost() {
    if (this.room?.hostId && this.socket?.id) {
      return this.room.hostId === this.socket.id;
    }
    return Number(this.seat) === 0;
  }

  get inRoom() {
    return Boolean(this.room?.code);
  }

  async connect() {
    if (this.socket?.connected) return;
    const io = await loadSocketIoClient();
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 12,
    });

    this.socket.on('connect', () => {
      this.connected = true;
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
    });
    this.socket.on('mp:room', (room) => {
      this.room = room;
      this.onRoomUpdate?.(room);
    });
    this.socket.on('mp:start', (payload) => {
      rememberLastRoom(payload.code, this.seat);
      this.onGameStart?.(payload);
    });
    this.socket.on('mp:state', (payload) => {
      this.onGameState?.(payload);
    });
    this.socket.on('mp:action', (payload) => {
      this.onGameAction?.(payload);
    });
    this.socket.on('mp:opponent-left', () => {
      this.onOpponentLeft?.();
    });
    this.socket.on('mp:player-disconnected', (payload) => {
      this.onPlayerDisconnected?.(payload);
    });
    this.socket.on('mp:player-reconnected', (payload) => {
      this.onPlayerReconnected?.(payload);
    });
    this.socket.on('mp:rejoined', (payload) => {
      this.onRejoined?.(payload);
    });

    await new Promise((resolve, reject) => {
      if (this.socket.connected) {
        resolve();
        return;
      }
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err || new Error('Connexion Socket.io échouée.'));
      };
      const cleanup = () => {
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
      };
      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
    });
  }

  async createRoom(name = 'Hôte') {
    await this.connect();
    this.playerToken = randomToken();
    const reply = await emitAsync(this.socket, 'mp:create', { name, playerToken: this.playerToken });
    if (!reply.ok) throw new Error(reply.error || 'Création de salle impossible.');
    if (reply.playerToken) {
      this.playerToken = reply.playerToken;
      sessionStorage?.setItem(PLAYER_TOKEN_KEY, this.playerToken);
    }
    this.room = reply;
    this.seat = reply.seat;
    rememberLastRoom(reply.code, reply.seat);
    return reply;
  }

  async joinRoom(code, name = 'Invité') {
    await this.connect();
    this.playerToken = randomToken();
    const reply = await emitAsync(this.socket, 'mp:join', { code, name, playerToken: this.playerToken });
    if (!reply.ok) throw new Error(reply.error || 'Impossible de rejoindre.');
    if (reply.playerToken) {
      this.playerToken = reply.playerToken;
      sessionStorage?.setItem(PLAYER_TOKEN_KEY, this.playerToken);
    }
    this.room = reply;
    this.seat = reply.seat;
    rememberLastRoom(reply.code, reply.seat);
    return reply;
  }

  async reconnectRoom(code, name) {
    await this.connect();
    const reply = await emitAsync(this.socket, 'mp:reconnect', {
      code,
      name,
      playerToken: this.playerToken,
    });
    if (!reply.ok) throw new Error(reply.error || 'Reconnexion impossible.');
    this.room = reply;
    this.seat = reply.seat;
    rememberLastRoom(reply.code, reply.seat);
    return reply;
  }

  async leaveRoom() {
    if (!this.socket) return;
    await emitAsync(this.socket, 'mp:leave', {});
    this.room = null;
    this.seat = null;
    clearLastRoom();
  }

  async updateSelf({ name, deckId, ready } = {}) {
    if (!this.socket) return { ok: false, error: 'Non connecté.' };
    const payload = {};
    if (typeof name === 'string') payload.name = name;
    if (typeof deckId === 'string') payload.deckId = deckId;
    if (typeof ready === 'boolean') payload.ready = ready;
    const reply = await emitAsync(this.socket, 'mp:update', payload);
    if (reply.ok && reply.room) this.room = reply.room;
    return reply;
  }

  async startGame() {
    if (!this.socket) return { ok: false, error: 'Non connecté.' };
    return emitAsync(this.socket, 'mp:start', {});
  }

  pushState(state) {
    if (!this.socket || !this.isHost || !state) return;
    this._stateSeq += 1;
    this.socket.emit('mp:state', { seq: this._stateSeq, state });
  }

  sendAction(action) {
    if (!this.socket || this.isHost) return;
    this.socket.emit('mp:action', { action });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.room = null;
    this.seat = null;
  }
}

/** @type {MultiplayerClient | null} */
let sharedClient = null;

export function getMultiplayerClient() {
  if (!sharedClient) sharedClient = new MultiplayerClient();
  return sharedClient;
}

