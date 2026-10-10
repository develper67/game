// Real-time chat with server-enforced channel permissions:
//  lobby     - everyone online who is not in a match
//  party     - members of the sender's party only
//  game      - players in the sender's current match
//  gameparty - the sender's party members who are in the same match
import crypto from 'node:crypto';
import { CHAT } from '../shared/constants.js';

const COLORS = ['#ffd23f', '#4cc9f0', '#3ddc97', '#ff9f1c', '#c77dff', '#ff8fa3', '#9ef01a', '#f6bd60'];

export function sanitize(text) {
  if (typeof text !== 'string') return '';
  // strip control characters + zero-width chars, collapse whitespace
  let t = text.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length > CHAT.MAX_LEN) t = t.slice(0, CHAT.MAX_LEN);
  return t;
}

export class Chat {
  constructor({ io, hub, services }) {
    this.io = io;
    this.hub = hub;
    this.services = services;
    this.lobby = [];
    this.partyHist = new Map();
    this.matchHist = new Map();
    this.rate = new Map();
  }

  register(client) {
    const s = client.socket;
    s.on('chat:send', (d, ack) => {
      let r;
      try { r = this.send(client, d || {}); } catch (e) { console.error(e); r = { error: 'Server error.' }; }
      if (typeof ack === 'function') ack(r);
    });
    s.on('chat:history', (d) => this.sendHistory(client, d && d.channel));
  }

  onConnect(client) {
    this.sendHistory(client, 'lobby');
    if (client.partyId) this.sendHistory(client, 'party');
  }

  colorOf(userId) { return COLORS[userId % COLORS.length]; }

  checkRate(userId, text) {
    const now = Date.now();
    let r = this.rate.get(userId);
    if (!r) { r = { times: [], last: '', lastAt: 0 }; this.rate.set(userId, r); }
    r.times = r.times.filter((t) => now - t < CHAT.RATE_WINDOW_MS);
    if (r.times.length && now - r.times[r.times.length - 1] < CHAT.MIN_INTERVAL_MS) return 'Slow down a little!';
    if (r.times.length >= CHAT.RATE_COUNT) return 'You are sending messages too fast. Wait a few seconds.';
    if (r.last === text.toLowerCase() && now - r.lastAt < 15000) return "Please don't repeat the same message.";
    r.times.push(now);
    r.last = text.toLowerCase();
    r.lastAt = now;
    return null;
  }

  // Resolve who may receive a message on `channel` from `client`. Returns {error} or {recipients, scope}
  route(client, channel) {
    const party = client.partyId ? this.services.party.get(client.partyId) : null;
    const match = client.matchId ? this.services.matchmaking.matches.get(client.matchId) : null;
    switch (channel) {
      case 'lobby': {
        if (client.matchId) return { error: 'Lobby chat is not available during a match. Use match chat.' };
        const recipients = [...this.hub.clients.values()].filter((c) => !c.matchId);
        return { recipients, scope: 'lobby' };
      }
      case 'party': {
        if (!party) return { error: 'You are not in a party.' };
        const recipients = party.members.map((id) => this.hub.get(id)).filter(Boolean);
        return { recipients, scope: 'party:' + party.id };
      }
      case 'game': {
        if (!match || match.ended) return { error: 'You are not in a match.' };
        const recipients = match.humans().filter((p) => p.client && p.connected).map((p) => p.client);
        return { recipients, scope: 'match:' + match.id };
      }
      case 'gameparty': {
        if (!match || match.ended) return { error: 'You are not in a match.' };
        if (!party) return { error: 'You are not in a party.' };
        const recipients = match.humans().filter((p) => p.client && p.connected && party.members.includes(p.userId)).map((p) => p.client);
        return { recipients, scope: 'mparty:' + match.id + ':' + party.id };
      }
      default:
        return { error: 'Unknown chat channel.' };
    }
  }

  send(client, d) {
    const text = sanitize(d.text);
    if (!text) return { error: 'Type a message first.' };
    const routed = this.route(client, d.channel);
    if (routed.error) return routed;
    const rl = this.checkRate(client.userId, text);
    if (rl) return { error: rl };
    const msg = { id: crypto.randomBytes(6).toString('hex'), channel: d.channel, fromId: client.userId, from: client.username, color: this.colorOf(client.userId), text, at: Date.now() };
    const silenced = this.services.friends.silencedBy(client.userId);
    for (const c of routed.recipients) {
      if (c.userId !== client.userId && silenced.has(c.userId)) continue;
      c.socket.emit('chat:msg', msg);
    }
    this.store(routed.scope, msg);
    return { ok: true };
  }

  store(scope, msg) {
    let arr;
    if (scope === 'lobby') arr = this.lobby;
    else if (scope.startsWith('party:')) { const k = scope.slice(6); if (!this.partyHist.has(k)) this.partyHist.set(k, []); arr = this.partyHist.get(k); }
    else if (scope.startsWith('match:') || scope.startsWith('mparty:')) { const k = scope.split(':')[1]; if (!this.matchHist.has(k)) this.matchHist.set(k, []); arr = this.matchHist.get(k); }
    if (!arr) return;
    arr.push(msg);
    if (arr.length > CHAT.HISTORY) arr.splice(0, arr.length - CHAT.HISTORY);
  }

  sendHistory(client, channel) {
    let msgs = [];
    if (channel === 'lobby') msgs = this.lobby;
    else if (channel === 'party' && client.partyId) msgs = this.partyHist.get(client.partyId) || [];
    else return;
    const fr = this.services.friends;
    const hidden = new Set();
    for (const m of msgs) {
      if (!m.fromId || hidden.has(m.fromId)) continue;
      if (fr.hasBlocked(client.userId, m.fromId) || fr.hasBlocked(m.fromId, client.userId) || fr.hasMuted(client.userId, m.fromId)) hidden.add(m.fromId);
    }
    client.socket.emit('chat:history', { channel, messages: msgs.filter((m) => !hidden.has(m.fromId)) });
  }

  clearParty(client) { client.socket.emit('chat:clear', { channel: 'party' }); }

  system(channel, text, kind = 'info') {
    return { id: crypto.randomBytes(6).toString('hex'), channel, system: true, kind, text, at: Date.now() };
  }

  matchAnnounce(match, text, kind = 'info') {
    const msg = this.system('game', text, kind);
    this.io.to(match.room).emit('chat:msg', msg);
    this.store('match:' + match.id, msg);
  }

  partyAnnounce(partyId, text) {
    const p = this.services.party.get(partyId);
    if (!p) return;
    const msg = this.system('party', text, 'info');
    for (const id of p.members) this.hub.emitTo(id, 'chat:msg', msg);
    this.store('party:' + partyId, msg);
  }

  lobbyAnnounce(text, kind = 'event') {
    const msg = this.system('lobby', text, kind);
    for (const c of this.hub.clients.values()) if (!c.matchId) c.socket.emit('chat:msg', msg);
    this.store('lobby', msg);
  }

  matchEnded(matchId) { setTimeout(() => this.matchHist.delete(matchId), 60_000).unref?.(); }
}
