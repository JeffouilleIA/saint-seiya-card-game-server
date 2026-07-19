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

  await emitAsync(host, 'mp:update', { deckId: 'deck-1780782458146-lptba', ready: true });
  await emitAsync(guest, 'mp:update', { deckId: 'deck-1780782458146-lptba', ready: true });

  // Simulate lobby re-render auto-sync (deck only, no ready flag).
  await emitAsync(host, 'mp:update', { deckId: 'deck-1780782458146-lptba' });
  await emitAsync(guest, 'mp:update', { deckId: 'deck-1780782458146-lptba' });

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
