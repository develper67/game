// Socket-level integration tests: auth, friends, parties, invitations, chat permissions, economy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';

let srv, base;
const clients = [];

before(async () => {
  srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true });
  base = `http://localhost:${srv.port}`;
});
after(async () => {
  for (const c of clients) c.disconnect();
  await srv.close();
});

async function post(path, body, token) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

async function register(name) {
  const r = await post('/api/register', { username: name, password: 'password1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    clients.push(s);
    s.events = [];
    s.onAny((ev, d) => s.events.push([ev, d]));
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}

const req = (s, ev, d = {}) => new Promise((resolve) => s.emit(ev, d, resolve));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(s, ev, pred = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const found = s.events.find(([e, d]) => e === ev && pred(d));
    if (found) return resolve(found[1]);
    const t = setTimeout(() => { s.off(ev, h); reject(new Error('timeout waiting for ' + ev)); }, timeout);
    const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });
}

test('auth: validation, unique usernames, hashing, sessions', async () => {
  assert.equal((await post('/api/register', { username: 'ab', password: 'password1' })).status, 400);
  assert.equal((await post('/api/register', { username: 'bad name!', password: 'password1' })).status, 400);
  assert.equal((await post('/api/register', { username: 'shorty', password: '123' })).status, 400);
  const a = await register('Alice');
  assert.ok(a.token.length > 30);
  const dup = await post('/api/register', { username: 'alice', password: 'password1' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /taken/);
  assert.equal((await post('/api/login', { username: 'alice', password: 'nope' })).status, 401);
  const ok = await post('/api/login', { username: 'ALICE', password: 'password1' });
  assert.equal(ok.status, 200);
  // the stored hash is never the password
  const row = (await import('../server/db.js')).default.get('SELECT pass_hash FROM users WHERE username = ?', ['Alice']);
  assert.match(row.pass_hash, /^scrypt\$/);
  assert.ok(!row.pass_hash.includes('password1'));
  // sockets reject bad tokens
  await assert.rejects(connect('not-a-real-token-at-all-xxxxxxxx'));
  // logout invalidates the session
  await post('/api/logout', {}, ok.body.token);
  const me = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + ok.body.token } });
  assert.equal(me.status, 401);
});

test('friends, party invitations and chat permissions', async () => {
  const u1 = await register('Pat1'), u2 = await register('Pat2'), u3 = await register('Pat3'), u4 = await register('Pat4');
  const s1 = await connect(u1.token), s2 = await connect(u2.token), s3 = await connect(u3.token), s4 = await connect(u4.token);

  // cannot create a party without friends
  assert.match((await req(s1, 'party:create')).error, /friend/);

  // friend request + accept
  assert.ok((await req(s1, 'friends:request', { username: 'pat2' })).ok);
  await waitFor(s2, 'friends:incoming');
  const st2 = await req(s2, 'friends:list');
  assert.equal(st2.incoming[0].username, 'Pat1');
  assert.ok((await req(s2, 'friends:accept', { userId: u1.user.id })).ok);
  const st1 = await waitFor(s1, 'friends:state', (d) => d.friends.length === 1);
  assert.equal(st1.friends[0].username, 'Pat2');
  assert.equal(st1.friends[0].status, 'online');

  // search
  const sr = await req(s1, 'friends:search', { q: 'Pat' });
  assert.ok(sr.results.find((x) => x.username === 'Pat2').relation === 'friends');

  // inviting a non-friend fails
  assert.match((await req(s1, 'party:invite', { userId: u3.user.id })).error, /friends/);

  // invite (auto-creates party) + real-time invitation + decline
  assert.ok((await req(s1, 'party:invite', { userId: u2.user.id })).ok);
  let inv = await waitFor(s2, 'party:invite');
  assert.equal(inv.from.username, 'Pat1');
  assert.ok((await req(s2, 'party:respond', { inviteId: inv.id, accept: false })).ok);
  const declined = await waitFor(s1, 'party:inviteResult', (d) => d.result === 'declined');
  assert.equal(declined.to, 'Pat2');
  let p2 = s2.events.filter(([e]) => e === 'party:state').pop();
  assert.ok(!p2 || p2[1] === null, 'declining does not join');

  // invite again + accept
  s2.events.length = 0;
  assert.ok((await req(s1, 'party:invite', { userId: u2.user.id })).ok);
  inv = await waitFor(s2, 'party:invite');
  assert.ok((await req(s2, 'party:respond', { inviteId: inv.id, accept: true })).ok);
  const party = await waitFor(s2, 'party:state', (d) => d && d.members.length === 2);
  assert.equal(party.leader, u1.user.id);

  // expired invitation cannot be accepted
  await req(s1, 'friends:request', { username: 'Pat3' });
  await req(s3, 'friends:accept', { userId: u1.user.id });
  assert.ok((await req(s1, 'party:invite', { userId: u3.user.id })).ok);
  const inv3 = await waitFor(s3, 'party:invite');
  for (const i of srv.services.party.invites.values()) i.expiresAt = Date.now() - 1;
  await waitFor(s3, 'party:inviteExpired', (d) => d.id === inv3.id, 3000);
  assert.ok((await req(s3, 'party:respond', { inviteId: inv3.id, accept: true })).error);

  // party chat goes only to party members; lobby chat goes to everyone in the lobby
  s3.events.length = 0; s4.events.length = 0;
  assert.ok((await req(s1, 'chat:send', { channel: 'party', text: 'secret party plan' })).ok);
  await waitFor(s2, 'chat:msg', (m) => m.text === 'secret party plan');
  await wait(150);
  assert.ok(!s3.events.some(([e, d]) => e === 'chat:msg' && d.text === 'secret party plan'), 'party message leaked to non-member');
  assert.ok(!s4.events.some(([e, d]) => e === 'chat:msg' && d.text === 'secret party plan'), 'party message leaked to stranger');
  assert.match((await req(s4, 'chat:send', { channel: 'party', text: 'hi' })).error, /not in a party/);
  assert.ok((await req(s4, 'chat:send', { channel: 'lobby', text: '<b>hello</b> lobby' })).ok);
  const lm = await waitFor(s1, 'chat:msg', (m) => m.channel === 'lobby');
  assert.equal(lm.text, '<b>hello</b> lobby'); // stored as plain text; the client renders with textContent
  // in-game channel is rejected outside of matches
  assert.match((await req(s4, 'chat:send', { channel: 'game', text: 'gg' })).error, /not in a match/);

  // spam protection
  await wait(450);
  assert.ok((await req(s4, 'chat:send', { channel: 'lobby', text: 'one' })).ok);
  const fast = await req(s4, 'chat:send', { channel: 'lobby', text: 'two' });
  assert.ok(fast.error);
  await wait(450);
  assert.ok((await req(s4, 'chat:send', { channel: 'lobby', text: 'three' })).ok);
  await wait(450);
  assert.match((await req(s4, 'chat:send', { channel: 'lobby', text: 'three' })).error, /repeat/);

  // blocking hides messages
  assert.ok((await req(s1, 'user:block', { userId: u4.user.id, on: true })).ok);
  s1.events.length = 0;
  await wait(450);
  assert.ok((await req(s4, 'chat:send', { channel: 'lobby', text: 'can you hear me' })).ok);
  await wait(200);
  assert.ok(!s1.events.some(([e, d]) => e === 'chat:msg' && d.text === 'can you hear me'), 'blocked user message delivered');
  assert.match((await req(s4, 'friends:request', { username: 'Pat1' })).error, /can't/);

  // ready + leadership transfer on leave
  assert.ok((await req(s2, 'party:ready', { ready: true })).ok);
  const pr = await waitFor(s1, 'party:state', (d) => d && d.allReady);
  assert.ok(pr.allReady);
  assert.ok((await req(s1, 'party:leave')).ok);
  const after = await waitFor(s2, 'party:state', (d) => d && d.members.length === 1);
  assert.equal(after.leader, u2.user.id);
});

test('economy: crate purchases are server-side and idempotent', async () => {
  const u = await register('Buyer');
  const s = await connect(u.token);
  const st = await req(s, 'econ:state');
  assert.equal(st.coins, 300);
  const rid = 'req_' + Math.random().toString(36).slice(2, 12);
  const r1 = await req(s, 'crate:open', { crate: 'basic', requestId: rid });
  assert.ok(r1.ok, JSON.stringify(r1));
  assert.equal(r1.coins, 300 - 150 + (r1.refund || 0));
  const r2 = await req(s, 'crate:open', { crate: 'basic', requestId: rid });
  assert.ok(r2.replay);
  assert.equal(r2.skin, r1.skin);
  const st2 = await req(s, 'econ:state');
  assert.equal(st2.coins, r1.coins, 'duplicate request must not charge twice');
  assert.equal(st2.owned.length, 1);
  // can't afford premium now
  const r3 = await req(s, 'crate:open', { crate: 'legend', requestId: 'req_other_123' });
  assert.match(r3.error, /Not enough coins/);
  // equip owned skin, reject unowned
  const skin = r1.skin;
  const weapon = skin.split('_')[0];
  assert.ok((await req(s, 'skin:equip', { weapon, skin })).ok);
  const bad = await req(s, 'skin:equip', { weapon: 'pistol', skin: 'pistol_gold' });
  if (skin !== 'pistol_gold') assert.ok(bad.error);
  // clients cannot set coins: there is no such event; profile reflects server state
  const prof = await req(s, 'profile:get', {});
  assert.equal(prof.profile.coins, st2.coins);
  assert.deepEqual(Object.values(prof.profile.equipped), [skin]);
});
