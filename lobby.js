/**

 * Salles multijoueur 2 joueurs — codes de room, decks, prêt, démarrage, reconnexion.

 */



const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const RECONNECT_GRACE_MS = 15 * 60 * 1000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';



/** @type {Map<string, object>} */

const rooms = new Map();



/** @type {Map<string, string>} socketId → roomCode */

const socketRooms = new Map();



function randomCode(length = 6) {

  let code = '';

  for (let i = 0; i < length; i += 1) {

    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];

  }

  return code;

}



function normalizeToken(value) {

  const token = String(value || '').trim();

  return token.length >= 8 && token.length <= 64 ? token : null;

}



function allocateCode() {

  for (let attempt = 0; attempt < 40; attempt += 1) {

    const code = randomCode();

    if (!rooms.has(code)) return code;

  }

  throw new Error('Impossible de générer un code de salle.');

}



function emptyPlayer(seat) {

  return {

    seat,

    socketId: null,

    playerToken: null,

    name: seat === 0 ? 'Hôte' : 'Invité',

    deckId: null,

    ready: false,

    disconnectedAt: null,

  };

}



function createRoomRecord(hostSocketId, hostToken) {

  const code = allocateCode();

  const room = {

    code,

    status: 'waiting',

    hostId: hostSocketId,

    createdAt: Date.now(),

    players: [emptyPlayer(0), emptyPlayer(1)],

    game: null,

  };

  room.players[0].socketId = hostSocketId;

  room.players[0].playerToken = hostToken;

  rooms.set(code, room);

  return room;

}



function findRoom(code) {

  if (!code) return null;

  return rooms.get(String(code).trim().toUpperCase()) || null;

}



function seatForToken(room, playerToken) {

  if (!playerToken) return null;

  return room.players.find((p) => p.playerToken === playerToken) ?? null;

}



function publicRoomView(room) {

  return {

    code: room.code,

    status: room.status,

    hostId: room.hostId,

    inGame: room.status === 'playing',

    players: room.players.map((p) => ({

      seat: p.seat,

      name: p.name,

      deckId: p.deckId,

      ready: p.ready,

      connected: Boolean(p.socketId),

    })),

  };

}



function seatForSocket(room, socketId) {

  return room.players.find((p) => p.socketId === socketId) ?? null;

}



function broadcastRoom(io, room) {

  const payload = publicRoomView(room);

  io.to(`room:${room.code}`).emit('mp:room', payload);

}



function reconnectPayload(room, seat) {

  return {

    ok: true,

    seat: seat.seat,

    reconnected: true,

    ...publicRoomView(room),

    start: room.game?.startPayload ?? null,

    state: room.game?.lastState ?? null,

    seq: room.game?.lastSeq ?? 0,

  };

}



function attachSocketToSeat(io, socket, room, seat, { joinRoomChannel = true } = {}) {

  leaveRoom(io, socket, { preserveInGame: true });

  seat.socketId = socket.id;

  seat.disconnectedAt = null;

  socketRooms.set(socket.id, room.code);

  if (joinRoomChannel) socket.join(`room:${room.code}`);

  if (room.status === 'playing' && seat.seat === 0) {

    room.hostId = socket.id;

  }

}



function leaveRoom(io, socket, { preserveInGame = false } = {}) {

  const code = socketRooms.get(socket.id);

  if (!code) return null;

  socketRooms.delete(socket.id);

  socket.leave(`room:${code}`);



  const room = rooms.get(code);

  if (!room) return null;



  const seat = seatForSocket(room, socket.id);

  if (seat) {

    seat.socketId = null;

    seat.ready = false;

    if (room.status === 'playing') {

      seat.disconnectedAt = Date.now();

      if (!preserveInGame) {

        io.to(`room:${code}`).emit('mp:player-disconnected', {

          seat: seat.seat,

          name: seat.name,

          graceMs: RECONNECT_GRACE_MS,

        });

      }

      broadcastRoom(io, room);

      return { closed: false, code, room: publicRoomView(room), inGame: true };

    }

  }



  if (room.status === 'playing') {

    return { closed: false, code, room: publicRoomView(room), inGame: true };

  }



  const connected = room.players.filter((p) => p.socketId);

  if (connected.length === 0) {

    rooms.delete(code);

    return { closed: true, code };

  }



  if (room.hostId === socket.id) {

    const nextHost = connected[0];

    room.hostId = nextHost.socketId;

    if (nextHost.seat !== 0) {

      const p0 = room.players[0];

      const p1 = room.players[1];

      room.players[0] = { ...p1, seat: 0 };

      room.players[1] = { ...p0, seat: 1 };

    }

  }



  broadcastRoom(io, room);

  return { closed: false, code, room: publicRoomView(room) };

}



function purgeStaleRooms() {

  const now = Date.now();

  for (const [code, room] of rooms) {

    const anyConnected = room.players.some((p) => p.socketId);

    const allDisconnected = room.players.every((p) => !p.socketId);

    if (room.status === 'playing' && allDisconnected) {

      const lastDisconnect = Math.max(

        ...room.players.map((p) => p.disconnectedAt || room.createdAt),

      );

      if (now - lastDisconnect > RECONNECT_GRACE_MS) {

        rooms.delete(code);

        continue;

      }

    }

    if (!anyConnected && now - room.createdAt > ROOM_TTL_MS) {

      rooms.delete(code);

    }

  }

}



setInterval(purgeStaleRooms, 60 * 1000).unref?.();



function reply(socket, cb, payload) {

  if (typeof cb === 'function') cb(payload);

  else socket.emit('mp:reply', payload);

}



export function attachMultiplayerLobby(io) {

  io.on('connection', (socket) => {

    socket.on('mp:create', (data, cb) => {

      try {

        const playerToken = normalizeToken(data?.playerToken) || randomCode(12);

        leaveRoom(io, socket);

        const room = createRoomRecord(socket.id, playerToken);

        socketRooms.set(socket.id, room.code);

        socket.join(`room:${room.code}`);

        const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : 'Hôte';

        room.players[0].name = name;

        const view = publicRoomView(room);

        broadcastRoom(io, room);

        reply(socket, cb, { ok: true, seat: 0, playerToken, ...view });

      } catch (err) {

        reply(socket, cb, { ok: false, error: err.message || 'Erreur serveur.' });

      }

    });



    socket.on('mp:join', (data, cb) => {

      try {

        const code = String(data?.code || '').trim().toUpperCase();

        const room = findRoom(code);

        if (!room) {

          reply(socket, cb, { ok: false, error: 'Salle introuvable.' });

          return;

        }

        if (room.status !== 'waiting') {

          reply(socket, cb, { ok: false, error: 'La partie a déjà commencé. Utilisez « Rejoindre » avec votre session.' });

          return;

        }

        const guest = room.players[1];

        if (guest.socketId && guest.socketId !== socket.id) {

          reply(socket, cb, { ok: false, error: 'Salle complète.' });

          return;

        }



        const playerToken = normalizeToken(data?.playerToken) || randomCode(12);

        leaveRoom(io, socket);

        guest.socketId = socket.id;

        guest.playerToken = playerToken;

        guest.ready = false;

        guest.disconnectedAt = null;

        guest.name =

          typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : 'Invité';

        socketRooms.set(socket.id, room.code);

        socket.join(`room:${room.code}`);

        const view = publicRoomView(room);

        broadcastRoom(io, room);

        reply(socket, cb, { ok: true, seat: 1, playerToken, ...view });

      } catch (err) {

        reply(socket, cb, { ok: false, error: err.message || 'Erreur serveur.' });

      }

    });



    socket.on('mp:reconnect', (data, cb) => {

      try {

        const code = String(data?.code || '').trim().toUpperCase();

        const playerToken = normalizeToken(data?.playerToken);

        const room = findRoom(code);

        if (!room) {

          reply(socket, cb, { ok: false, error: 'Salle introuvable.' });

          return;

        }

        if (room.status !== 'playing') {

          reply(socket, cb, { ok: false, error: 'Aucune partie en cours dans cette salle.' });

          return;

        }

        const seat = seatForToken(room, playerToken);

        if (!seat) {

          reply(socket, cb, { ok: false, error: 'Session introuvable pour cette salle.' });

          return;

        }

        if (seat.disconnectedAt && Date.now() - seat.disconnectedAt > RECONNECT_GRACE_MS) {

          reply(socket, cb, { ok: false, error: 'Délai de reconnexion expiré.' });

          return;

        }



        attachSocketToSeat(io, socket, room, seat);

        if (typeof data?.name === 'string' && data.name.trim()) {

          seat.name = data.name.trim().slice(0, 24);

        }



        const payload = reconnectPayload(room, seat);

        broadcastRoom(io, room);

        socket.to(`room:${room.code}`).emit('mp:player-reconnected', {

          seat: seat.seat,

          name: seat.name,

        });

        reply(socket, cb, payload);

        socket.emit('mp:rejoined', payload);

      } catch (err) {

        reply(socket, cb, { ok: false, error: err.message || 'Erreur serveur.' });

      }

    });



    socket.on('mp:leave', (_data, cb) => {

      const result = leaveRoom(io, socket);

      reply(socket, cb, { ok: true, ...(result || {}) });

    });



    socket.on('mp:update', (data, cb) => {

      const code = socketRooms.get(socket.id);

      const room = findRoom(code);

      if (!room) {

        reply(socket, cb, { ok: false, error: 'Pas dans une salle.' });

        return;

      }

      const seat = seatForSocket(room, socket.id);

      if (!seat) {

        reply(socket, cb, { ok: false, error: 'Joueur introuvable.' });

        return;

      }

      if (room.status !== 'waiting') {

        reply(socket, cb, { ok: false, error: 'Partie en cours.' });

        return;

      }



      if (typeof data?.name === 'string' && data.name.trim()) {

        seat.name = data.name.trim().slice(0, 24);

      }

      if (typeof data?.deckId === 'string' && data.deckId) {

        if (seat.deckId !== data.deckId) {

          seat.deckId = data.deckId;

          seat.ready = false;

        }

      }

      if (typeof data?.ready === 'boolean') {

        seat.ready = data.ready && Boolean(seat.deckId);

      }



      broadcastRoom(io, room);

      reply(socket, cb, { ok: true, room: publicRoomView(room) });

    });



    socket.on('mp:start', (_data, cb) => {

      const code = socketRooms.get(socket.id);

      const room = findRoom(code);

      if (!room) {

        reply(socket, cb, { ok: false, error: 'Pas dans une salle.' });

        return;

      }

      if (room.hostId !== socket.id) {

        reply(socket, cb, { ok: false, error: 'Seul l’hôte peut lancer la partie.' });

        return;

      }

      const p0 = room.players[0];

      const p1 = room.players[1];

      if (!p0.socketId || !p1.socketId) {

        reply(socket, cb, { ok: false, error: 'En attente du 2e joueur.' });

        return;

      }

      if (!p0.deckId || !p1.deckId) {

        reply(socket, cb, { ok: false, error: 'Chaque joueur doit choisir un deck.' });

        return;

      }

      if (!p0.ready || !p1.ready) {

        reply(socket, cb, { ok: false, error: 'Les deux joueurs doivent être prêts.' });

        return;

      }



      room.status = 'playing';

      const startPayload = {

        code: room.code,

        decks: [

          { seat: 0, deckId: p0.deckId, name: p0.name },

          { seat: 1, deckId: p1.deckId, name: p1.name },

        ],

      };

      room.game = {

        startPayload,

        lastState: null,

        lastSeq: 0,

      };

      io.to(`room:${room.code}`).emit('mp:start', startPayload);

      broadcastRoom(io, room);

      reply(socket, cb, { ok: true, start: startPayload });

    });



    socket.on('mp:state', (data) => {

      const code = socketRooms.get(socket.id);

      const room = findRoom(code);

      if (!room || room.status !== 'playing') return;

      if (room.hostId !== socket.id) return;

      const seq = data?.seq ?? 0;

      const state = data?.state ?? null;

      if (room.game) {

        room.game.lastSeq = seq;

        room.game.lastState = state;

      }

      socket.to(`room:${code}`).emit('mp:state', { seq, state });

    });



    socket.on('mp:action', (data) => {

      const code = socketRooms.get(socket.id);

      const room = findRoom(code);

      if (!room || room.status !== 'playing') return;

      const seat = seatForSocket(room, socket.id);

      if (!seat || seat.seat === 0) return;

      io.to(`room:${room.code}`).except(socket.id).emit('mp:action', {

        seat: seat.seat,

        action: data?.action ?? null,

      });

    });



    socket.on('disconnect', () => {

      leaveRoom(io, socket);

    });

  });

}



export function getLobbyStats() {

  let waiting = 0;

  let playing = 0;

  for (const room of rooms.values()) {

    if (room.status === 'playing') playing += 1;

    else waiting += 1;

  }

  return { roomCount: rooms.size, waiting, playing };

}


