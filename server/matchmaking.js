// Matchmaking: per-mode queues that group parties together, plus practice
// matches against bots. Matches start with a map vote.
import { MODES, MODE_IDS, MATCH } from '../shared/constants.js';
import { Match } from './match/Match.js';

let lobbySeq = 1;

export class Matchmaking {
  constructor({ io, hub, services }) {
    this.io = io;
    this.hub = hub;
    this.services = services;
    this.matches = new Map();
    this.lobbies = new Map(); // forming queue lobbies: id -> lobby
    this.timer = setInterval(() => this.tick(), 500);
  }

  shutdown() {
    clearInterval(this.timer);
    for (const m of this.matches.values()) if (m.timer) clearInterval(m.timer);
  }

  register(client) {
    const s = client.socket;
    s.on('queue:join', (d, ack) => this.safe(ack, () => this.join(client, d)));
    s.on('queue:leave', (d, ack) => this.safe(ack, () => this.leaveQueue(client, true)));
    s.on('queue:startNow', (d, ack) => this.safe(ack, () => this.startNow(client)));
    // lets a reconnecting client find out whether its match still exists
    s.on('match:status', (d, ack) => this.safe(ack, () => ({ matchId: client.matchId || null })));
  }

  safe(ack, fn) {
    let r;
    try { r = fn() || { ok: true }; } catch (e) { console.error(e); r = { error: 'Server error.' }; }
    if (typeof ack === 'function') ack(r);
  }

  humanInfo(client) {
    const avatar = this.services.profiles.avatarOf(client.userId);
    const skins = this.services.economy ? this.services.economy.equippedSkins(client.userId) : {};
    return { userId: client.userId, username: client.username, avatar, skins, partyId: client.partyId, client };
  }

  // Who comes along: the whole party (if leader) or just this client.
  groupFor(client) {
    const party = client.partyId ? this.services.party.get(client.partyId) : null;
    if (!party) return { clients: [client], party: null };
    if (party.leader !== client.userId) return { error: 'Only the party leader can start a match for the party.' };
    const clients = [];
    for (const uid of party.members) {
      const c = this.hub.get(uid);
      if (!c) return { error: `${this.hub.usernameOf(uid)} is offline.` };
      if (c.matchId) return { error: `${c.username} is still in a match.` };
      clients.push(c);
    }
    if (!this.services.party.allReady(party)) return { error: 'Everyone in the party must be READY.' };
    return { clients, party };
  }

  join(client, d = {}) {
    const mode = d.mode;
    if (!MODE_IDS.includes(mode)) return { error: 'Pick a game mode.' };
    if (client.matchId) return { error: 'You are already in a match.' };
    const g = this.groupFor(client);
    if (g.error) return { error: g.error };
    for (const c of g.clients) if (c.queue) this.leaveQueue(c, false);
    if (d.practice) {
      this.createMatch(mode, true, g.clients);
      return { ok: true, practice: true };
    }
    // find a forming lobby with room
    let lobby = null;
    for (const l of this.lobbies.values()) {
      if (l.mode === mode && l.clients.length + g.clients.length <= MATCH.MAX_PLAYERS && !l.starting) { lobby = l; break; }
    }
    if (!lobby) {
      lobby = { id: 'q' + (lobbySeq++), mode, clients: [], createdAt: Date.now(), countdownEndsAt: 0, soloEndsAt: 0, starting: false };
      this.lobbies.set(lobby.id, lobby);
    }
    for (const c of g.clients) {
      lobby.clients.push(c);
      c.queue = lobby.id;
      this.hub.presenceChanged(c.userId);
    }
    this.refreshLobby(lobby);
    return { ok: true, lobby: lobby.id };
  }

  refreshLobby(lobby) {
    const now = Date.now();
    const humans = lobby.clients.length;
    if (humans >= MATCH.MAX_PLAYERS) lobby.countdownEndsAt = now;
    else if (humans >= 2) {
      if (!lobby.countdownEndsAt) lobby.countdownEndsAt = now + 12000;
      lobby.soloEndsAt = 0;
    } else {
      lobby.countdownEndsAt = 0;
      if (!lobby.soloEndsAt) lobby.soloEndsAt = now + MATCH.QUEUE_SOLO_WAIT_SECONDS * 1000;
    }
    const payload = {
      lobby: lobby.id, mode: lobby.mode,
      players: lobby.clients.map((c) => ({ username: c.username, partyId: c.partyId })),
      countdownEndsAt: lobby.countdownEndsAt, soloEndsAt: lobby.soloEndsAt, max: MATCH.MAX_PLAYERS,
      serverTime: now,
    };
    for (const c of lobby.clients) c.socket.emit('queue:update', payload);
  }

  leaveQueue(client, notify) {
    const lobby = client.queue ? this.lobbies.get(client.queue) : null;
    client.queue = null;
    if (!lobby) return { ok: true };
    // party members leave together
    const leaving = new Set([client]);
    if (client.partyId) for (const c of lobby.clients) if (c.partyId === client.partyId) leaving.add(c);
    lobby.clients = lobby.clients.filter((c) => !leaving.has(c));
    for (const c of leaving) {
      c.queue = null;
      if (notify || c !== client) c.socket.emit('queue:left', { lobby: lobby.id });
      this.hub.presenceChanged(c.userId);
    }
    if (!lobby.clients.length) this.lobbies.delete(lobby.id);
    else this.refreshLobby(lobby);
    return { ok: true };
  }

  startNow(client) {
    const lobby = client.queue ? this.lobbies.get(client.queue) : null;
    if (!lobby) return { error: 'You are not in a queue.' };
    // allowed when everyone in the lobby is from the requester's group
    const sameGroup = lobby.clients.every((c) => c === client || (client.partyId && c.partyId === client.partyId));
    if (!sameGroup) return { error: 'Other players are queued — the match starts automatically.' };
    if (client.partyId && this.services.party.get(client.partyId)?.leader !== client.userId) return { error: 'Only the party leader can do that.' };
    this.launchLobby(lobby);
    return { ok: true };
  }

  tick() {
    const now = Date.now();
    for (const lobby of [...this.lobbies.values()]) {
      lobby.clients = lobby.clients.filter((c) => this.hub.get(c.userId) === c);
      if (!lobby.clients.length) { this.lobbies.delete(lobby.id); continue; }
      if ((lobby.countdownEndsAt && now >= lobby.countdownEndsAt) || (lobby.soloEndsAt && now >= lobby.soloEndsAt)) this.launchLobby(lobby);
    }
  }

  launchLobby(lobby) {
    if (lobby.starting) return;
    lobby.starting = true;
    this.lobbies.delete(lobby.id);
    const clients = lobby.clients.filter((c) => this.hub.get(c.userId) === c);
    for (const c of clients) c.queue = null;
    if (clients.length) this.createMatch(lobby.mode, false, clients);
  }

  createMatch(mode, practice, clients) {
    const m = new Match({
      mode, practice,
      humans: clients.map((c) => this.humanInfo(c)),
      services: this.services, hub: this.hub, io: this.io,
      onFinished: (match) => this.matches.delete(match.id),
    });
    this.matches.set(m.id, m);
    for (const c of clients) {
      c.queue = null;
      this.hub.presenceChanged(c.userId);
    }
    m.start();
    return m;
  }

  findMatchFor(userId) {
    for (const m of this.matches.values()) {
      if (m.ended || m.state === 'disposed') continue;
      const p = m.players.get('u' + userId);
      if (p && !p.left) return { m, p };
    }
    return null;
  }

  onConnect(client) {
    const found = this.findMatchFor(client.userId);
    if (found) {
      const { m, p } = found;
      m.rejoin(p, client);
      this.hub.presenceChanged(client.userId);
    }
  }

  onDisconnect(client) {
    if (client.queue) this.leaveQueue(client, false);
    const found = this.findMatchFor(client.userId);
    if (found && found.p.client === client) found.m.onDisconnect(found.p);
  }

  matchOf(client) {
    if (!client.matchId) return null;
    return this.matches.get(client.matchId) || null;
  }
}

export { MODES };
