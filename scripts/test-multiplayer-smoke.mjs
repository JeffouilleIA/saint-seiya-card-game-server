/**
 * Smoke test lobby + sync multijoueur (sans navigateur).
 */
import { io } from 'socket.io-client';

const URL = process.env.TEST_URL || 'http://127.0.0.1:3000';

function emitAsync(socket, event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (reply) => resolve(reply || { ok: false }));
  });
}

function assertBothReady(room, label) {
  const players = room?.players || [];
  const summary = players.map((p) => ({ seat: p.seat, ready: p.ready, deckId: p.deckId }));
  if (players.length < 2 || !players.every((p) => p.deckId && p.ready)) {
    throw new Error(`${label}: both players must stay ready — ${JSON.stringify(summary)}`);
  }
}

async function main() {
  const health = await fetch(`${URL}/health`).then((r) => r.json());
  if (!health.ok || !health.multiplayer) {
    throw new Error(`Health check failed: ${JSON.stringify(health)}`);
  }
  console.log('Health OK', { branch: health.gitBranch, rooms: health.multiplayerRooms });

  const host = io(URL, { path: '/socket.io/', transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    host.once('connect', resolve);
    host.once('connect_error', reject);
  });

  const hostToken = `test-host-${Date.now()}`;
  const guestToken = `test-guest-${Date.now()}`;

  const created = await emitAsync(host, 'mp:create', { name: 'HostTest', playerToken: hostToken });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  console.log('Room created', created.code);

  const guest = io(URL, { path: '/socket.io/', transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    guest.once('connect', resolve);
    guest.once('connect_error', reject);
  });

  const joined = await emitAsync(guest, 'mp:join', {
    code: created.code,
    name: 'GuestTest',
    playerToken: guestToken,
  });
  if (!joined.ok) throw new Error(`join failed: ${joined.error}`);

  const deckA = 'deck-1780782458146-lptba';
  const deckB = 'deck-1779521498797-xud5i';

  let hostReady = await emitAsync(host, 'mp:update', { deckId: deckA, ready: true });
  let guestReady = await emitAsync(guest, 'mp:update', { deckId: deckA, ready: true });
  assertBothReady(guestReady.room, 'after both ready');

  // Simulate lobby re-render auto-sync (deck only, no ready flag).
  hostReady = await emitAsync(host, 'mp:update', { deckId: deckA });
  assertBothReady(hostReady.room, 'after host deck resync');
  guestReady = await emitAsync(guest, 'mp:update', { deckId: deckA });
  assertBothReady(guestReady.room, 'after guest deck resync');

  // Host changes deck: ready must reset, then host can ready again before start.
  hostReady = await emitAsync(host, 'mp:update', { deckId: deckB, ready: false });
  const hostPlayer = hostReady.room?.players?.find((p) => p.seat === 0);
  if (!hostPlayer?.deckId || hostPlayer.deckId !== deckB) {
    throw new Error(`after deck change: expected host deck ${deckB}, got ${JSON.stringify(hostPlayer)}`);
  }
  if (hostPlayer.ready) {
    throw new Error('after deck change: host ready must be false');
  }
  hostReady = await emitAsync(host, 'mp:update', { deckId: deckB, ready: true });
  if (!hostReady.room?.players?.find((p) => p.seat === 0)?.ready) {
    throw new Error('after deck change: host should be ready again');
  }
  assertBothReady(hostReady.room, 'after host deck change and re-ready');

  const startPromise = new Promise((resolve) => {
    guest.once('mp:start', resolve);
  });
  const started = await emitAsync(host, 'mp:start', {});
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  const startPayload = await startPromise;
  console.log('Game started', startPayload.code);

  guest.disconnect();
  host.disconnect();

  const guest2 = io(URL, { path: '/socket.io/', transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    guest2.once('connect', resolve);
    guest2.once('connect_error', reject);
  });

  const reconnected = await emitAsync(guest2, 'mp:reconnect', {
    code: created.code,
    name: 'GuestTest',
    playerToken: guestToken,
  });
  if (!reconnected.ok) throw new Error(`reconnect failed: ${reconnected.error}`);
  console.log('Guest reconnected seat', reconnected.seat, 'hasStart', Boolean(reconnected.start));

  guest2.disconnect();
  console.log('Multiplayer smoke test passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
