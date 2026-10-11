// Friends, presence, blocking, muting and reports.
import db from './db.js';
import { USERNAME_RE } from '../shared/constants.js';

// client payload fields: only plain strings/numbers are accepted
const idOf = (v) => (typeof v === 'number' || typeof v === 'string' ? +v : NaN);
const str = (v) => (typeof v === 'string' ? v : '');

export class Friends {
  constructor({ hub, services }) {
    this.hub = hub;
    this.services = services;
    hub.onPresence((userId, status) => this.broadcastPresence(userId, status));
    this.reportTimes = new Map();
  }

  register(client) {
    const s = client.socket;
    const uid = client.userId;
    const handle = (ev, fn) => s.on(ev, (d, ack) => {
      let r;
      try { r = fn(d || {}) || { ok: true }; } catch (e) { console.error(e); r = { error: 'Server error.' }; }
      if (typeof ack === 'function') ack(r);
    });
    handle('friends:list', () => ({ ok: true, ...this.state(uid) }));
    handle('friends:search', (d) => this.search(uid, d.q));
    handle('friends:request', (d) => this.request(uid, d));
    handle('friends:accept', (d) => this.accept(uid, idOf(d.userId)));
    handle('friends:decline', (d) => this.decline(uid, idOf(d.userId)));
    handle('friends:cancel', (d) => this.cancel(uid, idOf(d.userId)));
    handle('friends:remove', (d) => this.remove(uid, idOf(d.userId)));
    handle('user:block', (d) => this.block(uid, idOf(d.userId), d.on !== false));
    handle('user:mute', (d) => this.mute(uid, idOf(d.userId), d.on !== false));
    handle('user:report', (d) => this.report(uid, d));
  }

  onConnect(client) {
    this.push(client.userId);
    this.pushLists(client.userId);
  }

  // ------------------------------------------------------------- queries
  user(id) { return db.get('SELECT id, username, avatar_color, avatar_hat, avatar_face FROM users WHERE id = ?', [id]); }
  view(u) { return { id: u.id, username: u.username, avatar: { color: u.avatar_color, hat: u.avatar_hat, face: u.avatar_face }, status: this.hub.status(u.id) }; }

  areFriends(a, b) {
    return !!db.get("SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))", [a, b, b, a]);
  }

  friendIds(userId) {
    return db.all("SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS id FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)", [userId, userId, userId]).map((r) => r.id);
  }

  isBlocked(a, b) {
    return !!db.get('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [a, b, b, a]);
  }

  hasBlocked(blocker, target) { return !!db.get('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [blocker, target]); }
  hasMuted(user, target) { return !!db.get('SELECT 1 FROM mutes WHERE user_id = ? AND muted_id = ?', [user, target]); }

  // Set of user ids that should NOT receive messages from `senderId`
  silencedBy(senderId) {
    const rows = db.all('SELECT blocker_id AS id FROM blocks WHERE blocked_id = ? UNION SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? UNION SELECT user_id AS id FROM mutes WHERE muted_id = ?', [senderId, senderId, senderId]);
    return new Set(rows.map((r) => r.id));
  }

  relation(viewer, target) {
    if (this.hasBlocked(viewer, target)) return 'blocked';
    const row = db.get('SELECT requester_id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)', [viewer, target, target, viewer]);
    if (!row) return null;
    if (row.status === 'accepted') return 'friends';
    return row.requester_id === viewer ? 'pending_out' : 'pending_in';
  }

  state(userId) {
    const friends = this.friendIds(userId).map((id) => this.user(id)).filter(Boolean).map((u) => this.view(u));
    const order = { in_match: 1, in_queue: 1, in_party: 1, online: 0, offline: 2 };
    friends.sort((a, b) => (order[a.status] - order[b.status]) || a.username.localeCompare(b.username));
    const incoming = db.all("SELECT requester_id AS id FROM friendships WHERE addressee_id = ? AND status = 'pending' ORDER BY created_at DESC", [userId]).map((r) => this.user(r.id)).filter(Boolean).map((u) => this.view(u));
    const outgoing = db.all("SELECT addressee_id AS id FROM friendships WHERE requester_id = ? AND status = 'pending' ORDER BY created_at DESC", [userId]).map((r) => this.user(r.id)).filter(Boolean).map((u) => this.view(u));
    return { friends, incoming, outgoing };
  }

  push(userId) { if (this.hub.isOnline(userId)) this.hub.emitTo(userId, 'friends:state', this.state(userId)); }

  pushLists(userId) {
    const muted = db.all('SELECT muted_id AS id FROM mutes WHERE user_id = ?', [userId]).map((r) => r.id);
    const blocked = db.all('SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?', [userId]).map((r) => r.id);
    const blockedUsers = blocked.map((id) => this.user(id)).filter(Boolean).map((u) => ({ id: u.id, username: u.username }));
    this.hub.emitTo(userId, 'social:lists', { muted, blocked, blockedUsers });
  }

  broadcastPresence(userId, status) {
    for (const fid of this.friendIds(userId)) {
      if (this.hub.isOnline(fid)) this.hub.emitTo(fid, 'friends:presence', { id: userId, status });
    }
  }

  // ------------------------------------------------------------- actions
  search(userId, q) {
    q = String(q || '').trim();
    if (q.length < 1) return { results: [] };
    if (q.length > 16 || !/^[A-Za-z0-9_]+$/.test(q)) return { error: 'Search with letters, numbers or _ only.' };
    const rows = db.all("SELECT id, username, avatar_color, avatar_hat, avatar_face FROM users WHERE username LIKE ? ESCAPE '\\' COLLATE NOCASE AND id != ? ORDER BY length(username), username LIMIT 12", [q.replace(/_/g, '\\_') + '%', userId]);
    const results = rows.filter((u) => !this.hasBlocked(u.id, userId)).map((u) => ({ ...this.view(u), relation: this.relation(userId, u.id) }));
    return { results };
  }

  request(userId, d) {
    let target = null;
    if (d.userId) target = this.user(idOf(d.userId));
    else if (typeof d.username === 'string') {
      const name = d.username.trim();
      if (!USERNAME_RE.test(name)) return { error: 'That is not a valid username.' };
      target = db.get('SELECT id, username, avatar_color, avatar_hat, avatar_face FROM users WHERE username = ? COLLATE NOCASE', [name]);
    }
    if (!target) return { error: 'No player with that username.' };
    if (target.id === userId) return { error: "You can't add yourself." };
    if (this.hasBlocked(userId, target.id)) return { error: `You blocked ${target.username}. Unblock them first.` };
    if (this.hasBlocked(target.id, userId)) return { error: `You can't send a friend request to ${target.username}.` };
    const rel = this.relation(userId, target.id);
    if (rel === 'friends') return { error: `You are already friends with ${target.username}.` };
    if (rel === 'pending_out') return { error: `Friend request to ${target.username} is already pending.` };
    if (rel === 'pending_in') return this.accept(userId, target.id);
    const pendingCount = db.get("SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ? AND status = 'pending'", [userId]).n;
    if (pendingCount >= 50) return { error: 'You have too many pending requests.' };
    db.run("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)", [userId, target.id, Date.now()]);
    this.push(userId);
    this.push(target.id);
    this.hub.emitTo(target.id, 'friends:incoming', { from: this.view(this.user(userId)) });
    return { ok: true, message: `Friend request sent to ${target.username}.` };
  }

  accept(userId, fromId) {
    const row = db.get("SELECT 1 FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'", [fromId, userId]);
    if (!row) return { error: 'That friend request no longer exists.' };
    db.run("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?", [fromId, userId]);
    this.push(userId);
    this.push(fromId);
    const me = this.user(userId);
    this.hub.emitTo(fromId, 'friends:accepted', { by: this.view(me) });
    this.services.party?.friendsChanged(userId);
    this.services.party?.friendsChanged(fromId);
    return { ok: true, message: 'Friend added!' };
  }

  decline(userId, fromId) {
    const r = db.run("DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'", [fromId, userId]);
    if (!r.changes) return { error: 'That friend request no longer exists.' };
    this.push(userId);
    this.push(fromId);
    return { ok: true };
  }

  cancel(userId, toId) {
    db.run("DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'", [userId, toId]);
    this.push(userId);
    this.push(toId);
    return { ok: true };
  }

  remove(userId, friendId) {
    const r = db.run("DELETE FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))", [userId, friendId, friendId, userId]);
    if (!r.changes) return { error: 'You are not friends with that player.' };
    this.push(userId);
    this.push(friendId);
    this.services.party?.friendsChanged(userId);
    this.services.party?.friendsChanged(friendId);
    return { ok: true };
  }

  block(userId, targetId, on) {
    const t = this.user(targetId);
    if (!t || targetId === userId) return { error: 'Player not found.' };
    if (on) {
      db.tx(() => {
        db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [userId, targetId, Date.now()]);
        db.run('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)', [userId, targetId, targetId, userId]);
      });
      this.services.party?.blocked(userId, targetId);
    } else {
      db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [userId, targetId]);
    }
    this.push(userId);
    this.push(targetId);
    this.pushLists(userId);
    return { ok: true };
  }

  mute(userId, targetId, on) {
    const t = this.user(targetId);
    if (!t || targetId === userId) return { error: 'Player not found.' };
    if (on) db.run('INSERT OR IGNORE INTO mutes (user_id, muted_id, created_at) VALUES (?, ?, ?)', [userId, targetId, Date.now()]);
    else db.run('DELETE FROM mutes WHERE user_id = ? AND muted_id = ?', [userId, targetId]);
    this.pushLists(userId);
    return { ok: true };
  }

  report(userId, d) {
    const targetId = idOf(d.userId);
    if (!this.user(targetId) || targetId === userId) return { error: 'Player not found.' };
    const now = Date.now();
    const recent = (this.reportTimes.get(userId) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= 10) return { error: 'You have sent too many reports. Try again later.' };
    recent.push(now);
    this.reportTimes.set(userId, recent);
    const reason = (str(d.reason) || 'Other').slice(0, 40);
    const details = str(d.details).slice(0, 300);
    const message = str(d.message).slice(0, 200);
    const channel = str(d.channel).slice(0, 20);
    db.run('INSERT INTO reports (reporter_id, reported_id, reason, message, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, targetId, reason + (details ? ': ' + details : ''), message, channel, now]);
    return { ok: true };
  }
}
