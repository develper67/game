// End-to-end match flow over real sockets: practice match, voting, loading,
// movement validation, actions, results + persisted rewards, rejoin, parties.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';
import db from '../server/db.js';

let srv, base;
const sockets = [];

before(async () => {
  srv = await startServer({
    port: 0, dbFile: ':memory:', quiet: true, noSignals: true,
    matchConfig: { voteSeconds: 1, countdownSeconds: 1, durations: { tag: 5, hotpotato: 30, grab: 6, guns: 6, craft: 6 } },
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

async function startPractice(s, mode, map = 'forest') {
  s.events.length = 0;
  const r = await req(s, 'queue:join', { mode, practice: true });
  assert.ok(r.ok, JSON.stringify(r));
  const vote = await waitFor(s, 'match:vote');
  assert.equal(vote.maps.length, 7);
  s.emit('match:vote', map);
  await waitFor(s, 'match:vote', (d) => d.players.find((p) => p.num === d.you).vote === map);
  const load = await waitFor(s, 'match:load');
  // the loaded map must be the most-voted map (only humans vote)
  const votes = s.events.filter(([e]) => e === 'match:vote').map(([, d]) => d);
  const last = votes[votes.length - 1];
  const max = Math.max(...Object.values(last.counts));
  assert.ok(last.counts[load.mapId] === max, `loaded ${load.mapId} but votes were ${JSON.stringify(last.counts)}`);
  assert.equal(load.mapId, map, 'my vote decides when I am the only voter');
  s.emit('match:ready');
  const init = await waitFor(s, 'match:init');
  return { load, init };
}

test('practice TAG match: vote, play, anti-cheat, results and rewards saved', async () => {
  const u = await register('Runner');
  const s = await connect(u.token);
  const { load, init } = await startPractice(s, 'tag');
  assert.equal(init.state, 'countdown');
  assert.ok(init.roster.length >= 4, 'bots fill the match');
  assert.ok(init.roster.filter((r) => r.bot).every((r) => r.name.startsWith('BOT ')), 'bots are clearly labelled');
  const me = init.players.find((p) => p.num === load.you);
  await waitFor(s, 'match:go');
  // valid movement is accepted
  let pos = { x: me.x, y: me.y, z: me.z };
  let tpSeq = s.events.filter(([e]) => e === 'tp').map(([, d]) => d.seq).pop() || 0;
  for (let i = 1; i <= 5; i++) {
    pos = { ...pos, x: pos.x + 0.2 };
    s.emit('st', [i, pos.x, pos.y, pos.z, 0, 0, 5, tpSeq, 50]);
    await wait(60);
  }
  const snap = await waitFor(s, 's');
  assert.ok(snap.p.length >= 4 * 7);
  // teleport hack gets corrected
  s.events.length = 0;
  s.emit('st', [99, pos.x + 40, pos.y, pos.z + 40, 0, 0, 5, tpSeq, 50]);
  const corr = await waitFor(s, 'tp');
  assert.ok(Math.abs(corr.x - pos.x) < 1.5, 'server keeps the last valid position');
  tpSeq = corr.seq;
  // actions are validated: no guns in TAG, shooting does nothing
  s.emit('act', { a: 'shoot', d: [0, 0, -1] });
  s.emit('act', { a: 'punch', yaw: 0, pitch: 0 });
  await waitFor(s, 'ev', (e) => e.k === 'punch');
  assert.ok(!s.events.some(([e, d]) => e === 'ev' && d.k === 'shot'), 'no shots in tag');
  // in-game chat works, lobby chat is blocked during a match
  assert.ok((await req(s, 'chat:send', { channel: 'game', text: 'gg bots' })).ok);
  assert.match((await req(s, 'chat:send', { channel: 'lobby', text: 'hi' })).error, /not available/);
  // wait for the 5s round to end
  const end = await waitFor(s, 'match:end', () => true, 15000);
  const mine = end.results.find((r) => r.num === end.you);
  assert.ok(mine.coins > 0, 'participation coins');
  assert.ok(mine.rewards.some((r) => r.label === 'Participation'));
  assert.ok(end.profile.matches === 1);
  const row = db.get('SELECT coins, matches FROM users WHERE id = ?', [u.user.id]);
  assert.equal(row.matches, 1);
  assert.equal(row.coins, 300 + mine.coins, 'coins persisted');
  const hist = db.all('SELECT * FROM match_history WHERE user_id = ?', [u.user.id]);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].mode, 'tag');
});

test('hidden guns: loot pickup range + container search are validated by the server', async () => {
  const u = await register('Looter');
  const s = await connect(u.token);
  const { load, init } = await startPractice(s, 'guns', 'forest');
  await waitFor(s, 'match:go');
  const me = init.players.find((p) => p.num === load.you);
  // try to pick up loot that is far away -> ignored
  const far = init.loot.find((l) => Math.hypot(l.x - me.x, l.z - me.z) > 10);
  s.emit('act', { a: 'use', k: 'loot', id: far.id });
  await wait(300);
  assert.ok(!s.events.some(([e, d]) => e === 'ev' && d.k === 'loot-' && d.id === far.id), 'far loot not picked up');
  // shooting without a weapon does nothing
  s.emit('act', { a: 'shoot', d: [0, 0, -1] });
  // crafting is not available in hidden guns
  s.emit('act', { a: 'craft', r: 'pistol' });
  await wait(200);
  assert.ok(!s.events.some(([e, d]) => e === 'ev' && (d.k === 'shot' || d.k === 'crafted')));
  // leaving forfeits the match
  s.emit('match:leave');
  await wait(300);
  const st = await req(s, 'queue:join', { mode: 'tag', practice: true });
  assert.ok(st.ok, 'can queue again after leaving');
});

test('disconnect and rejoin an ongoing match', async () => {
  const u = await register('Comeback');
  const s = await connect(u.token);
  const { load } = await startPractice(s, 'hotpotato');
  await waitFor(s, 'match:go');
  s.disconnect();
  await wait(300);
  const s2 = await connect(u.token);
  const reload = await waitFor(s2, 'match:load');
  assert.equal(reload.rejoin, true);
  assert.equal(reload.matchId, load.matchId);
  s2.emit('match:ready');
  const init = await waitFor(s2, 'match:init');
  assert.equal(init.state, 'playing');
  assert.equal(init.you, load.you);
  s2.emit('match:leave');
});

test('a party queues together into the same match', async () => {
  const a = await register('LeaderA'), b = await register('MemberB');
  const sa = await connect(a.token), sb = await connect(b.token);
  await req(sa, 'friends:request', { username: 'MemberB' });
  await req(sb, 'friends:accept', { userId: a.user.id });
  await req(sa, 'party:invite', { userId: b.user.id });
  const inv = await waitFor(sb, 'party:invite');
  await req(sb, 'party:respond', { inviteId: inv.id, accept: true });
  // member cannot start; leader must wait for READY
  assert.match((await req(sb, 'party:start', { mode: 'grab', practice: true })).error, /leader/);
  assert.match((await req(sa, 'party:start', { mode: 'grab', practice: true })).error, /READY/);
  await req(sb, 'party:ready', { ready: true });
  sa.events.length = 0; sb.events.length = 0;
  assert.ok((await req(sa, 'party:start', { mode: 'grab', practice: true })).ok);
  const va = await waitFor(sa, 'match:vote'), vb = await waitFor(sb, 'match:vote');
  assert.equal(va.matchId, vb.matchId, 'party members are in the same match');
  // in-game party channel only reaches the party
  sa.emit('match:vote', 'mall'); sb.emit('match:vote', 'mall');
  await waitFor(sa, 'match:load'); await waitFor(sb, 'match:load');
  sa.emit('match:ready'); sb.emit('match:ready');
  await waitFor(sa, 'match:init'); await waitFor(sb, 'match:init');
  assert.ok((await req(sa, 'chat:send', { channel: 'gameparty', text: 'flank left' })).ok);
  await waitFor(sb, 'chat:msg', (m) => m.channel === 'gameparty' && m.text === 'flank left');
  sa.emit('match:leave'); sb.emit('match:leave');
});
