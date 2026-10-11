// Hostile clients: malformed payloads must never crash the server, and
// movement cheats (speed hacks, flying) must be corrected.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';

let srv, base;
const sockets = [];

before(async () => {
  srv = await startServer({
    port: 0, dbFile: ':memory:', quiet: true, noSignals: true,
    matchConfig: { voteSeconds: 1, countdownSeconds: 1, durations: { tag: 8, hotpotato: 30, grab: 8, guns: 8, craft: 8 } },
  });
  base = `http://localhost:${srv.port}`;
});
after(async () => { for (const s of sockets) s.disconnect(); await srv.close(); });

async function register(name) {
  const r = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'password1' }) });
  return r.json();
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.events = [];
    s.onAny((ev, d) => s.events.push([ev, d]));
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const req = (s, ev, d = {}) => new Promise((resolve) => s.emit(ev, d, resolve));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(s, ev, pred = () => true, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const found = s.events.find(([e, d]) => e === ev && pred(d));
    if (found) return resolve(found[1]);
    const t = setTimeout(() => { s.off(ev, h); reject(new Error('timeout waiting for ' + ev)); }, timeout);
    const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });
}
// an object that throws when converted to a string or number
const evil = { toString: 1, valueOf: 1 };

async function alive(s) {
  const st = await req(s, 'econ:state');
  assert.equal(typeof st.coins, 'number', 'server still answers');
}

test('malformed social, economy and profile payloads are rejected without crashing', async () => {
  const u = await register('Hostile');
  const s = await connect(u.token);
  const payloads = [
    ['skin:equip', { weapon: 'pistol', skin: evil }],
    ['skin:equip', { weapon: evil, skin: 'x' }],
    ['skin:equip', { weapon: 'pistol', skin: '__proto__' }],
    ['crate:open', { crate: '__proto__', requestId: 'abcdefgh12' }],
    ['crate:open', { crate: evil, requestId: evil }],
    ['profile:get', { username: evil }],
    ['profile:avatar', { color: evil, hat: evil, face: evil }],
    ['profile:avatar', 'nope'],
    ['chat:send', { channel: evil, text: evil }],
    ['friend:request', { username: evil }],
    ['party:invite', { userId: evil }],
    ['party:respond', { inviteId: evil, accept: evil }],
    ['queue:join', { mode: evil, practice: evil }],
    ['queue:join', { mode: '__proto__', practice: true }],
  ];
  for (const [ev, d] of payloads) {
    const r = await Promise.race([req(s, ev, d), wait(600).then(() => ({ timeout: true }))]);
    assert.ok(!r || r.error || r.timeout || r.ok === undefined || r.ok, `${ev} answered`);
  }
  await alive(s);
});

test('in-match garbage during voting and play never crashes; speed hacks are corrected', async () => {
  const u = await register('Speedy');
  const s = await connect(u.token);
  const r = await req(s, 'queue:join', { mode: 'craft', practice: true });
  assert.ok(r.ok, JSON.stringify(r));
  await waitFor(s, 'match:vote');
  // well-formed and malformed movement packets while the map is still being voted on
  s.emit('st', [1, 0.5, 0, 0.5, 0, 0, 0, 0, 50]);
  s.emit('st', [1, evil, 0, 0, 0, 0, 0, 0]);
  s.emit('match:vote', evil);
  for (let i = 0; i < 30; i++) s.emit('match:vote', i % 2 ? 'forest' : 'desert');
  s.emit('match:vote', 'forest');
  const load = await waitFor(s, 'match:load');
  s.emit('st', [2, 1, 1, 1, 0, 0, 0, 0]);
  s.emit('match:ready');
  const init = await waitFor(s, 'match:init');
  assert.equal(typeof init.tpSeq, 'number', 'init carries the teleport sequence');
  await waitFor(s, 'match:go');
  for (const d of [
    { a: 'slot', s: evil }, { a: 'use', k: 'door', id: evil }, { a: 'use', k: 'loot', id: evil },
    { a: 'use', k: 'player', id: evil }, { a: 'craft', r: '__proto__' }, { a: 'craft', r: 'constructor' },
    { a: 'craft', r: evil }, { a: 'shoot', d: evil, ads: evil }, { a: evil }, null, 'x',
  ]) s.emit('act', d);
  s.emit('match:ready'); s.emit('match:ready');
  await wait(200);
  await alive(s);

  // speed hack: many small steps sent much faster than the client tick
  const me = init.players.find((p) => p.num === load.you);
  let tpSeq = s.events.filter(([e]) => e === 'tp').map(([, d]) => d.seq).pop() ?? init.tpSeq;
  s.events.length = 0;
  let x = me.x;
  for (let i = 0; i < 40; i++) { x += 0.9; s.emit('st', [100 + i, x, me.y, me.z, 0, 0, 5, tpSeq, 50]); }
  const corr = await waitFor(s, 'tp');
  assert.ok(corr.x < me.x + 8, `speed hack corrected (server kept x=${corr.x}, tried ${x})`);
  tpSeq = corr.seq;

  // flying: climbing straight up with no ground below gets corrected
  s.events.length = 0;
  let y = corr.y;
  for (let i = 0; i < 12; i++) { y += 0.9; s.emit('st', [200 + i, corr.x, y, corr.z, 0, 0, 1, tpSeq, 50]); await wait(55); }
  const fly = await waitFor(s, 'tp');
  assert.ok(fly.y < corr.y + 4, `flying corrected (server kept y=${fly.y})`);
  await alive(s);
  s.emit('match:leave');
});
