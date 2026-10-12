// Real-player matches: 2, 3 or 4 humans can play together without bots, the
// lobby host can start early, and a lone player still gets bots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';

let srv, base;
const sockets = [];

before(async () => {
  srv = await startServer({
    port: 0, dbFile: ':memory:', quiet: true, noSignals: true,
    matchConfig: { voteSeconds: 1, countdownSeconds: 1, durations: { tag: 4, hotpotato: 6, grab: 4, guns: 4, craft: 4 } },
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
function waitFor(s, ev, pred = () => true, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const found = s.events.find(([e, d]) => e === ev && pred(d));
    if (found) return resolve(found[1]);
    const t = setTimeout(() => { s.off(ev, h); reject(new Error('timeout waiting for ' + ev)); }, timeout);
    const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });
}
async function players(n, prefix) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = await register(`${prefix}${i}`);
    out.push({ u, s: await connect(u.token) });
  }
  return out;
}

for (const [n, mode] of [[2, 'tag'], [3, 'hotpotato'], [4, 'guns']]) {
  test(`${n} real players start a ${mode} match together with no bots`, async () => {
    const ps = await players(n, `Real${n}p`);
    for (const { s } of ps) assert.ok((await req(s, 'queue:join', { mode })).ok);
    const host = ps[0], other = ps[1];
    const upd = await waitFor(host.s, 'queue:update', (d) => d.players.length === n);
    assert.equal(upd.host.userId, host.u.user.id, 'first to queue hosts the lobby');
    // only the host may start early
    assert.match((await req(other.s, 'queue:startNow')).error, /Only/);
    assert.ok((await req(host.s, 'queue:startNow')).ok);
    const vote = await waitFor(host.s, 'match:vote');
    assert.equal(vote.players.length, n, 'only the real players are in the match');
    assert.ok(vote.players.every((p) => !p.bot), 'no bots in a real-player match');
    for (const { s } of ps) {
      const v = await waitFor(s, 'match:vote');
      assert.equal(v.matchId, vote.matchId, 'everyone is in the same match');
    }
    // the match plays through to the end with just these players
    for (const { s } of ps) { await waitFor(s, 'match:load'); s.emit('match:ready'); }
    const end = await waitFor(host.s, 'match:end', () => true, 30000);
    assert.equal(end.results.length, n);
    for (const { s } of ps) s.emit('match:leave');
  });
}

test('a lone player who starts early gets bots', async () => {
  const [{ s }] = await players(1, 'Lonely');
  assert.ok((await req(s, 'queue:join', { mode: 'tag' })).ok);
  assert.ok((await req(s, 'queue:startNow')).ok);
  const vote = await waitFor(s, 'match:vote');
  assert.ok(vote.players.some((p) => p.bot), 'bots fill in for a lone player');
  s.emit('match:leave');
});
