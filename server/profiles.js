// Player profiles: stats, avatar customisation, match history.
import db from './db.js';
import { AVATAR_COLORS, AVATAR_HATS, AVATAR_FACES, MODE_IDS } from '../shared/constants.js';

export class Profiles {
  constructor({ hub, services }) {
    this.hub = hub;
    this.services = services;
  }

  register(client) {
    const s = client.socket;
    s.on('profile:get', (d, ack) => {
      if (typeof ack !== 'function') return;
      const target = d && d.username ? db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [String(d.username).slice(0, 32)]) : { id: client.userId };
      if (!target) return ack({ error: 'Player not found.' });
      ack({ profile: this.publicProfile(target.id, client.userId) });
    });
    s.on('profile:avatar', (d, ack) => {
      const r = this.setAvatar(client.userId, d || {});
      if (typeof ack === 'function') ack(r);
    });
  }

  avatarOf(userId) {
    const u = db.get('SELECT avatar_color, avatar_hat, avatar_face FROM users WHERE id = ?', [userId]);
    return u ? { color: u.avatar_color, hat: u.avatar_hat, face: u.avatar_face } : { color: '#cccccc', hat: 'none', face: 'happy' };
  }

  setAvatar(userId, d) {
    const color = String(d.color || '');
    const hat = String(d.hat || '');
    const face = String(d.face || '');
    if (!AVATAR_COLORS.includes(color)) return { error: 'Invalid color.' };
    if (!AVATAR_HATS.includes(hat)) return { error: 'Invalid hat.' };
    if (!AVATAR_FACES.includes(face)) return { error: 'Invalid face.' };
    db.run('UPDATE users SET avatar_color = ?, avatar_hat = ?, avatar_face = ? WHERE id = ?', [color, hat, face, userId]);
    return { ok: true, avatar: { color, hat, face } };
  }

  publicProfile(userId, viewerId) {
    const u = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!u) return null;
    const modeRows = db.all('SELECT mode, wins, matches FROM mode_stats WHERE user_id = ?', [userId]);
    const modeStats = Object.fromEntries(MODE_IDS.map((m) => [m, { wins: 0, matches: 0 }]));
    for (const r of modeRows) modeStats[r.mode] = { wins: r.wins, matches: r.matches };
    const history = db.all('SELECT match_id, mode, map, placement, won, elims, coins, practice, created_at FROM match_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]);
    const econ = this.services.economy;
    const skins = econ ? econ.ownedSkins(userId) : [];
    const equipped = econ ? econ.equippedSkins(userId) : {};
    const self = userId === viewerId;
    return {
      id: u.id,
      username: u.username,
      avatar: { color: u.avatar_color, hat: u.avatar_hat, face: u.avatar_face },
      wins: u.wins, matches: u.matches, elims: u.elims,
      coins: u.coins,
      createdAt: u.created_at,
      lastSeen: u.last_seen,
      status: this.hub.status(u.id),
      modeStats,
      history: history.map((h) => ({ mode: h.mode, map: h.map, placement: h.placement, won: !!h.won, elims: h.elims, coins: h.coins, practice: !!h.practice, at: h.created_at })),
      skins: skins.map((s) => s.skin_id),
      skinCount: skins.length,
      equipped,
      self,
      friendship: self || !this.services.friends ? null : this.services.friends.relation(viewerId, userId),
    };
  }
}
