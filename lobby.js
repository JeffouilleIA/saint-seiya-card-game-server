/**
 * Salles multijoueur 2 joueurs — codes de room, decks, prêt, démarrage.
 */

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
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
    name: seat === 0 ? 'Hôte' : 'Invité',
    deckId: null,
    ready: false,
  };
}

function createRoomRecord(hostSocketId) {
  const code = allocateCode();
  const room = {
    code,
    status: 'waiting',
    hostId: hostSocketId,
    createdAt: Date.now(),
    players: [emptyPlayer(0), emptyPlayer(1)],
  };
  room.players[0].socketId = hostSocketId;
  rooms.set(code, room);
  return room;
}

function findRoom(code) {
  if (!code) return null;
  return rooms.get(String(code).trim().toUpperCase()) || null;
}

function publicRoomView(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
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

function leaveRoom(io, socket) {
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
  }

  if (room.status === 'playing') {
    io.to(`room:${code}`).emit('mp:opponent-left');
    rooms.delete(code);
    return { closed: true, code };
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
    if (!anyConnected && now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}

setInterval(purgeStaleRooms, 5 * 60 * 1000).unref?.();

function reply(socket, cb, payload) {
  if (typeof cb === 'function') cb(payload);
  else socket.emit('mp:reply', payload);
}

export function attachMultiplayerLobby(io) {
  io.on('connection', (socket) => {
    socket.on('mp:create', (data, cb) => {
      try {
        leaveRoom(io, socket);
        const room = createRoomRecord(socket.id);
        socketRooms.set(socket.id, room.code);
        socket.join(`room:${room.code}`);
        const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : 'Hôte';
        room.players[0].name = name;
        const view = publicRoomView(room);
        broadcastRoom(io, room);
        reply(socket, cb, { ok: true, seat: 0, ...view });
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
          reply(socket, cb, { ok: false, error: 'La partie a déjà commencé.' });
          return;
        }
        const guest = room.players[1];
        if (guest.socketId && guest.socketId !== socket.id) {
          reply(socket, cb, { ok: false, error: 'Salle complète.' });
          return;
        }

        leaveRoom(io, socket);
        guest.socketId = socket.id;
        guest.ready = false;
        guest.name =
          typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : 'Invité';
        socketRooms.set(socket.id, room.code);
        socket.join(`room:${room.code}`);
        const view = publicRoomView(room);
        broadcastRoom(io, room);
        reply(socket, cb, { ok: true, seat: 1, ...view });
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
        seat.deckId = data.deckId;
        seat.ready = false;
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
      io.to(`room:${room.code}`).emit('mp:start', startPayload);
      broadcastRoom(io, room);
      reply(socket, cb, { ok: true, start: startPayload });
    });

    socket.on('mp:state', (data) => {
      const code = socketRooms.get(socket.id);
      const room = findRoom(code);
      if (!room || room.status !== 'playing') return;
      if (room.hostId !== socket.id) return;
      socket.to(`room:${code}`).emit('mp:state', {
        seq: data?.seq ?? 0,
        state: data?.state ?? null,
      });
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
  return { roomCount: rooms.size };
}
