// Parties: up to 4 friends that queue together. Invitations are real-time,
// expire after a minute and can only target online, accepted friends.
import crypto from 'node:crypto';
import { PARTY, MODE_IDS } from '../shared/constants.js';

export class Parties {
  constructor({ hub, services }) {
    this.hub = hub;
    this.services = services;
    this.parties = new Map();
    this.invites = new Map();
    this.graceTimers = new Map(); // userId -> timeout
    this.timer = setInterval(() => this.expireInvites(), 1000);
  }

  shutdown() { clearInterval(this.timer); for (const t of this.graceTimers.values()) clearTimeout(t); }

  get(id) { return id ? this.parties.get(id) || null : null; }

  partyOf(userId) {
    for (const p of this.parties.values()) if (p.members.includes(userId)) return p;
    return null;
  }

  allReady(p) { return p.members.every((id) => id === p.leader || p.ready.has(id)); }

  register(client) {
    const s = client.socket;
    const handle = (ev, fn) => s.on(ev, (d, ack) => {
      let r;
      try { r = fn(d || {}) || { ok: true }; } catch (e) { console.error(e); r = { error: 'Server error.' }; }
      if (typeof ack === 'function') ack(r);
    });
    handle('party:create', () => this.create(client));
    handle('party:invite', (d) => this.invite(client, +d.userId));
    handle('party:respond', (d) => this.respond(client, String(d.inviteId || ''), !!d.accept));
    handle('party:leave', () => this.leave(client.userId, 'left'));
    handle('party:kick', (d) => this.kick(client, +d.userId));
    handle('party:promote', (d) => this.promote(client, +d.userId));
    handle('party:ready', (d) => this.setReady(client, !!d.ready));
    handle('party:mode', (d) => this.setMode(client, d.mode));
    handle('party:start', (d) => this.start(client, d));
  }

  // ---------------------------------------------------------------- lifecycle
  onConnect(client) {
    const p = this.partyOf(client.userId);
    if (p) {
      client.partyId = p.id;
      if (this.graceTimers.has(client.userId)) { clearTimeout(this.graceTimers.get(client.userId)); this.graceTimers.delete(client.userId); }
      this.push(p);
      this.services.chat?.partyAnnounce(p.id, `${client.username} reconnected.`);
    } else {
      this.hub.emitTo(client.userId, 'party:state', null);
    }
    // pending invites for this user
    for (const inv of this.invites.values()) if (inv.to === client.userId) this.sendInvite(inv);
  }

  onDisconnect(client, replaced) {
    if (replaced) return;
    const p = this.partyOf(client.userId);
    if (!p) return;
    // leadership moves to an online member right away; the member keeps their slot for a grace period
    if (p.leader === client.userId) {
      const next = p.members.find((id) => id !== client.userId && this.hub.isOnline(id));
      if (next) { p.leader = next; this.services.chat?.partyAnnounce(p.id, `${this.hub.usernameOf(next)} is now the party leader.`); }
    }
    p.ready.delete(client.userId);
    this.push(p);
    const t = setTimeout(() => {
      this.graceTimers.delete(client.userId);
      if (!this.hub.isOnline(client.userId)) this.leave(client.userId, 'disconnected');
    }, PARTY.DISCONNECT_GRACE_MS);
    t.unref?.();
    this.graceTimers.set(client.userId, t);
  }

  // ---------------------------------------------------------------- actions
  create(client) {
    if (this.partyOf(client.userId)) return { error: 'You are already in a party.' };
    if (!this.services.friends.friendIds(client.userId).length) return { error: 'You need at least one accepted friend to create a party.' };
    const p = { id: 'p' + crypto.randomBytes(5).toString('hex'), leader: client.userId, members: [client.userId], ready: new Set(), mode: 'tag', createdAt: Date.now() };
    this.parties.set(p.id, p);
    client.partyId = p.id;
    this.push(p);
    this.hub.presenceChanged(client.userId);
    this.services.chat?.sendHistory(client, 'party');
    return { ok: true };
  }

  invite(client, targetId) {
    const uid = client.userId;
    const friends = this.services.friends;
    if (!friends.areFriends(uid, targetId)) return { error: 'You can only invite accepted friends.' };
    if (!this.hub.isOnline(targetId)) return { error: `${this.hub.usernameOf(targetId)} is offline.` };
    if (friends.isBlocked(uid, targetId)) return { error: 'You cannot invite that player.' };
    let p = this.partyOf(uid);
    if (!p) {
      const r = this.create(client);
      if (r.error) return r;
      p = this.partyOf(uid);
    }
    if (p.members.includes(targetId)) return { error: `${this.hub.usernameOf(targetId)} is already in your party.` };
    if (p.members.length >= PARTY.MAX_SIZE) return { error: 'Your party is full (4 players).' };
    for (const inv of this.invites.values()) {
      if (inv.partyId === p.id && inv.to === targetId) return { error: `You already invited ${this.hub.usernameOf(targetId)}. Waiting for an answer.` };
    }
    const inv = { id: 'i' + crypto.randomBytes(6).toString('hex'), partyId: p.id, from: uid, to: targetId, expiresAt: Date.now() + PARTY.INVITE_TTL_MS };
    this.invites.set(inv.id, inv);
    this.sendInvite(inv);
    this.push(p);
    return { ok: true, message: `Invite sent to ${this.hub.usernameOf(targetId)}.` };
  }

  sendInvite(inv) {
    const p = this.parties.get(inv.partyId);
    if (!p) return;
    const fromView = this.services.friends.view(this.services.friends.user(inv.from));
    this.hub.emitTo(inv.to, 'party:invite', { id: inv.id, from: fromView, partyId: inv.partyId, size: p.members.length, max: PARTY.MAX_SIZE, expiresAt: inv.expiresAt });
  }

  respond(client, inviteId, accept) {
    const inv = this.invites.get(inviteId);
    if (!inv || inv.to !== client.userId) return { error: 'That invitation is no longer valid.' };
    this.invites.delete(inviteId);
    const p = this.parties.get(inv.partyId);
    const fromName = this.hub.usernameOf(inv.from);
    if (Date.now() > inv.expiresAt) {
      this.hub.emitTo(inv.from, 'party:inviteResult', { to: client.username, result: 'expired' });
      return { error: 'That invitation has expired.' };
    }
    if (!accept) {
      this.hub.emitTo(inv.from, 'party:inviteResult', { to: client.username, result: 'declined' });
      if (p) this.push(p);
      return { ok: true };
    }
    if (!p) return { error: 'That party no longer exists.' };
    if (client.matchId) return { error: 'Finish your current match first.' };
    if (p.members.length >= PARTY.MAX_SIZE) {
      this.hub.emitTo(inv.from, 'party:inviteResult', { to: client.username, result: 'full' });
      return { error: 'That party is already full.' };
    }
    if (p.members.includes(client.userId)) return { ok: true };
    const current = this.partyOf(client.userId);
    if (current) this.leave(client.userId, 'switched');
    if (client.queue) this.services.matchmaking.leaveQueue(client, true);
    p.members.push(client.userId);
    client.partyId = p.id;
    // cancel any queue the party was in: the group changed
    for (const id of p.members) { const c = this.hub.get(id); if (c && c.queue) this.services.matchmaking.leaveQueue(c, true); }
    this.hub.emitTo(inv.from, 'party:inviteResult', { to: client.username, result: 'accepted' });
    this.push(p);
    this.hub.presenceChanged(client.userId);
    this.services.chat?.partyAnnounce(p.id, `🎉 ${client.username} joined the party (invited by ${fromName}).`);
    this.services.chat?.sendHistory(client, 'party');
    return { ok: true };
  }

  leave(userId, reason = 'left') {
    const p = this.partyOf(userId);
    if (!p) return { error: 'You are not in a party.' };
    p.members = p.members.filter((id) => id !== userId);
    p.ready.delete(userId);
    const c = this.hub.get(userId);
    if (c) {
      c.partyId = null;
      if (c.queue) this.services.matchmaking.leaveQueue(c, true);
      c.socket.emit('party:state', null);
      this.services.chat?.clearParty(c);
      this.hub.presenceChanged(userId);
    }
    // drop invites this user sent for this party
    for (const [id, inv] of this.invites) if (inv.partyId === p.id && inv.from === userId) this.invites.delete(id);
    const name = this.hub.usernameOf(userId);
    if (!p.members.length) {
      this.parties.delete(p.id);
      for (const [id, inv] of this.invites) if (inv.partyId === p.id) { this.invites.delete(id); this.hub.emitTo(inv.to, 'party:inviteRevoked', { id }); }
      return { ok: true };
    }
    if (p.leader === userId) {
      p.leader = p.members.find((id) => this.hub.isOnline(id)) || p.members[0];
      this.services.chat?.partyAnnounce(p.id, `${this.hub.usernameOf(p.leader)} is now the party leader.`);
    }
    for (const id of p.members) { const m = this.hub.get(id); if (m && m.queue) this.services.matchmaking.leaveQueue(m, true); }
    this.services.chat?.partyAnnounce(p.id, reason === 'kicked' ? `${name} was removed from the party.` : reason === 'disconnected' ? `${name} disconnected and left the party.` : `${name} left the party.`);
    this.push(p);
    return { ok: true };
  }

  kick(client, targetId) {
    const p = this.partyOf(client.userId);
    if (!p || p.leader !== client.userId) return { error: 'Only the party leader can remove players.' };
    if (!p.members.includes(targetId) || targetId === client.userId) return { error: 'That player is not in your party.' };
    this.hub.emitTo(targetId, 'party:kicked', { by: client.username });
    return this.leave(targetId, 'kicked');
  }

  promote(client, targetId) {
    const p = this.partyOf(client.userId);
    if (!p || p.leader !== client.userId) return { error: 'Only the party leader can do that.' };
    if (!p.members.includes(targetId)) return { error: 'That player is not in your party.' };
    p.leader = targetId;
    p.ready.delete(targetId);
    this.services.chat?.partyAnnounce(p.id, `${this.hub.usernameOf(targetId)} is now the party leader.`);
    this.push(p);
    return { ok: true };
  }

  setReady(client, ready) {
    const p = this.partyOf(client.userId);
    if (!p) return { error: 'You are not in a party.' };
    if (ready) p.ready.add(client.userId); else p.ready.delete(client.userId);
    this.push(p);
    return { ok: true };
  }

  setMode(client, mode) {
    const p = this.partyOf(client.userId);
    if (!p || p.leader !== client.userId) return { error: 'Only the party leader can choose the mode.' };
    if (!MODE_IDS.includes(mode)) return { error: 'Unknown mode.' };
    p.mode = mode;
    this.push(p);
    return { ok: true };
  }

  start(client, d) {
    const p = this.partyOf(client.userId);
    if (!p) return { error: 'You are not in a party.' };
    if (p.leader !== client.userId) return { error: 'Only the party leader can start a match.' };
    const mode = MODE_IDS.includes(d.mode) ? d.mode : p.mode;
    return this.services.matchmaking.join(client, { mode, practice: !!d.practice });
  }

  // a friendship ended or a block happened: cancel invites between those users
  friendsChanged(userId) {
    for (const [id, inv] of this.invites) {
      if ((inv.from === userId || inv.to === userId) && !this.services.friends.areFriends(inv.from, inv.to)) {
        this.invites.delete(id);
        this.hub.emitTo(inv.to, 'party:inviteRevoked', { id });
        const p = this.parties.get(inv.partyId);
        if (p) this.push(p);
      }
    }
  }

  blocked(a, b) { this.friendsChanged(a); this.friendsChanged(b); }

  expireInvites() {
    const now = Date.now();
    for (const [id, inv] of this.invites) {
      if (now > inv.expiresAt) {
        this.invites.delete(id);
        this.hub.emitTo(inv.to, 'party:inviteExpired', { id });
        this.hub.emitTo(inv.from, 'party:inviteResult', { to: this.hub.usernameOf(inv.to), result: 'expired' });
        const p = this.parties.get(inv.partyId);
        if (p) this.push(p);
      }
    }
  }

  view(p) {
    const fr = this.services.friends;
    return {
      id: p.id,
      leader: p.leader,
      mode: p.mode,
      max: PARTY.MAX_SIZE,
      members: p.members.map((id) => {
        const u = fr.user(id);
        return { ...fr.view(u), ready: p.ready.has(id), online: this.hub.isOnline(id), leader: id === p.leader };
      }),
      invites: [...this.invites.values()].filter((i) => i.partyId === p.id).map((i) => ({ id: i.id, to: { id: i.to, username: this.hub.usernameOf(i.to) }, expiresAt: i.expiresAt })),
      allReady: this.allReady(p),
    };
  }

  push(p) {
    const v = this.view(p);
    for (const id of p.members) this.hub.emitTo(id, 'party:state', v);
  }
}
