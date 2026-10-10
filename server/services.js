// Wires together all server-side services and dispatches socket lifecycle events.
import { Matchmaking } from './matchmaking.js';
import { Profiles } from './profiles.js';
import { Economy } from './economy.js';

export function createServices({ io, hub }) {
  const services = {};
  services.profiles = new Profiles({ hub, services });
  services.economy = new Economy({ hub, services });
  // Minimal party + chat until the social stage replaces them.
  services.party = { get: () => null, allReady: () => true };
  services.chat = {
    matchAnnounce(match, text, kind = 'info') {
      io.to(match.room).emit('chat:msg', { channel: 'game', system: true, kind, text, at: Date.now() });
    },
  };
  services.matchmaking = new Matchmaking({ io, hub, services });

  const modules = [services.profiles, services.economy, services.matchmaking];

  services.onConnect = (client) => {
    for (const m of modules) m.register?.(client);
    for (const m of modules) m.onConnect?.(client);
  };
  services.onDisconnect = (client, replaced) => {
    for (const m of modules) {
      try { m.onDisconnect?.(client, replaced); } catch (e) { console.error(e); }
    }
  };
  services.shutdown = () => { services.matchmaking.shutdown(); };
  return services;
}
