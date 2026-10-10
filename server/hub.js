// Tracks connected (authenticated) users and their current activity.
import db from './db.js';

export class Hub {
  constructor(io) {
    this.io = io;
    this.clients = new Map(); // userId -> client
    this.listeners = { presence: [] };
  }

  get(userId) { return this.clients.get(userId) || null; }
  isOnline(userId) { return this.clients.has(userId); }

  add(client) {
    this.clients.set(client.userId, client);
  }

  remove(client) {
    if (this.clients.get(client.userId) === client) this.clients.delete(client.userId);
  }

  emitTo(userId, ev, data) {
    const c = this.clients.get(userId);
    if (c) c.socket.emit(ev, data);
  }

  status(userId) {
    const c = this.clients.get(userId);
    if (!c) return 'offline';
    if (c.matchId) return 'in_match';
    if (c.queue) return 'in_queue';
    if (c.partyId) return 'in_party';
    return 'online';
  }

  onPresence(fn) { this.listeners.presence.push(fn); }
  presenceChanged(userId) {
    for (const fn of this.listeners.presence) {
      try { fn(userId, this.status(userId)); } catch (e) { console.error(e); }
    }
  }

  usernameOf(userId) {
    const c = this.clients.get(userId);
    if (c) return c.username;
    const row = db.get('SELECT username FROM users WHERE id = ?', [userId]);
    return row ? row.username : '?';
  }
}
