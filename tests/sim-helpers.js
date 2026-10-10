// Helpers to run bot-only matches in fast-forward without sockets.
import { Match } from '../server/match/Match.js';

export function fakeIo() {
  const sent = [];
  const target = { emit: (ev, data) => sent.push([ev, data]), volatile: null };
  target.volatile = target;
  return { io: { to: () => target }, sent };
}

export function runBotMatch(mode, mapId, { bots = 6, maxSeconds = 900, onTick } = {}) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const announcements = [];
  try {
    const { io, sent } = fakeIo();
    const services = { chat: { matchAnnounce: (m, text) => announcements.push(text) }, economy: null };
    const hub = { presenceChanged() {} };
    const m = new Match({ mode, practice: true, humans: [], services, hub, io, fillBots: false });
    for (let i = 0; i < bots; i++) m.addBot();
    m.loadMap(mapId);
    m.beginCountdown();
    now += 4100;
    m.tick();
    let t = 0;
    while (!m.ended && t < maxSeconds) {
      now += 50;
      t += 0.05;
      m.tick();
      if (onTick) onTick(m, t);
    }
    if (m.timer) clearInterval(m.timer);
    return { m, seconds: t, announcements, sent };
  } finally {
    Date.now = realNow;
  }
}
