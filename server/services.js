// Wires together all server-side services and dispatches socket lifecycle events.
import { Matchmaking } from './matchmaking.js';
import { Profiles } from './profiles.js';
import { Economy } from './economy.js';
import { Friends } from './friends.js';
import { Parties } from './party.js';
import { Chat } from './chat.js';

export function createServices({ io, hub, opts = {} }) {
  const services = { config: opts.matchConfig || {} };
  services.profiles = new Profiles({ hub, services });
  services.economy = new Economy({ hub, services });
  services.friends = new Friends({ hub, services });
  services.party = new Parties({ hub, services });
  services.chat = new Chat({ io, hub, services });
  services.matchmaking = new Matchmaking({ io, hub, services });

  const modules = [services.profiles, services.economy, services.friends, services.party, services.chat, services.matchmaking];

  services.onConnect = (client) => {
    for (const m of modules) m.register?.(client);
    for (const m of modules) m.onConnect?.(client);
  };
  services.onDisconnect = (client, replaced) => {
    for (const m of modules) {
      try { m.onDisconnect?.(client, replaced); } catch (e) { console.error(e); }
    }
  };
  services.shutdown = () => { services.matchmaking.shutdown(); services.party.shutdown(); };
  return services;
}
