// Coins, crates, skins and persistent match rewards. Every coin change is
// computed and applied on the server inside a database transaction.
import crypto from 'node:crypto';
import db from './db.js';
import { selfProfile } from './auth.js';
import { SKINS, CRATES, RARITIES, RARITY_IDS, skinsByRarity } from '../shared/skins.js';
import { WEAPON_IDS } from '../shared/items.js';

export class Economy {
  constructor({ hub, services }) {
    this.hub = hub;
    this.services = services;
  }

  register(client) {
    const s = client.socket;
    s.on('econ:state', (d, ack) => { if (typeof ack === 'function') ack(this.state(client.userId)); });
    s.on('crate:open', (d, ack) => {
      let r;
      try { r = this.openCrate(client.userId, d && d.crate, d && d.requestId); } catch (e) { console.error(e); r = { error: 'Server error.' }; }
      if (typeof ack === 'function') ack(r);
    });
    s.on('skin:equip', (d, ack) => {
      const r = this.equip(client.userId, d && d.weapon, d && d.skin);
      if (typeof ack === 'function') ack(r);
    });
  }

  coins(userId) {
    const u = db.get('SELECT coins FROM users WHERE id = ?', [userId]);
    return u ? u.coins : 0;
  }

  ownedSkins(userId) {
    return db.all('SELECT skin_id, count, acquired_at FROM skins_owned WHERE user_id = ? ORDER BY acquired_at DESC', [userId]);
  }

  equippedSkins(userId) {
    const rows = db.all('SELECT weapon, skin_id FROM skins_equipped WHERE user_id = ?', [userId]);
    const out = {};
    for (const r of rows) if (SKINS[r.skin_id]) out[r.weapon] = r.skin_id;
    return out;
  }

  state(userId) {
    return {
      coins: this.coins(userId),
      owned: this.ownedSkins(userId).map((r) => ({ id: r.skin_id, count: r.count, at: r.acquired_at })),
      equipped: this.equippedSkins(userId),
    };
  }

  openCrate(userId, crateId, requestId) {
    const crate = CRATES[crateId];
    if (!crate) return { error: 'Unknown crate.' };
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return { error: 'Invalid request id.' };
    return db.tx(() => {
      const prev = db.get('SELECT result FROM transactions WHERE user_id = ? AND request_id = ?', [userId, requestId]);
      if (prev) return { ...JSON.parse(prev.result), replay: true };
      const u = db.get('SELECT coins FROM users WHERE id = ?', [userId]);
      if (!u) return { error: 'Account not found.' };
      if (u.coins < crate.price) return { error: `Not enough coins. ${crate.name} costs ${crate.price}.` };
      // roll rarity with a cryptographically strong RNG
      const roll = crypto.randomInt(0, 1_000_000) / 1_000_000;
      let acc = 0, rarity = 'common';
      for (const r of RARITY_IDS) {
        acc += crate.odds[r] || 0;
        if (roll < acc) { rarity = r; break; }
        rarity = r;
      }
      if (!crate.odds[rarity]) rarity = RARITY_IDS.find((r) => crate.odds[r] > 0);
      const pool = skinsByRarity(rarity);
      const skinId = pool[crypto.randomInt(0, pool.length)];
      const owned = db.get('SELECT count FROM skins_owned WHERE user_id = ? AND skin_id = ?', [userId, skinId]);
      const now = Date.now();
      let refund = 0;
      if (owned) {
        refund = RARITIES[rarity].dupCoins;
        db.run('UPDATE skins_owned SET count = count + 1 WHERE user_id = ? AND skin_id = ?', [userId, skinId]);
      } else {
        db.run('INSERT INTO skins_owned (user_id, skin_id, count, acquired_at) VALUES (?, ?, 1, ?)', [userId, skinId, now]);
      }
      const delta = -crate.price + refund;
      db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [delta, userId]);
      const coins = db.get('SELECT coins FROM users WHERE id = ?', [userId]).coins;
      const result = { ok: true, crate: crate.id, skin: skinId, rarity, duplicate: !!owned, refund, coins, price: crate.price };
      db.run('INSERT INTO transactions (user_id, request_id, kind, amount, result, created_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, requestId, 'crate:' + crate.id, delta, JSON.stringify(result), now]);
      return result;
    });
  }

  equip(userId, weapon, skinId) {
    if (!WEAPON_IDS.includes(weapon)) return { error: 'Unknown weapon.' };
    if (skinId === null || skinId === '' || skinId === undefined) {
      db.run('DELETE FROM skins_equipped WHERE user_id = ? AND weapon = ?', [userId, weapon]);
      return { ok: true, equipped: this.equippedSkins(userId) };
    }
    const skin = SKINS[skinId];
    if (!skin || skin.weapon !== weapon) return { error: 'That skin does not fit this weapon.' };
    if (!db.get('SELECT 1 FROM skins_owned WHERE user_id = ? AND skin_id = ?', [userId, skinId])) return { error: 'You do not own that skin.' };
    db.run('INSERT INTO skins_equipped (user_id, weapon, skin_id) VALUES (?, ?, ?) ON CONFLICT(user_id, weapon) DO UPDATE SET skin_id = excluded.skin_id', [userId, weapon, skinId]);
    return { ok: true, equipped: this.equippedSkins(userId) };
  }

  // Called once per match by the Match. Idempotent per (user, match).
  applyMatchResults(match, results) {
    const out = {};
    const now = Date.now();
    db.tx(() => {
      for (const r of results) {
        if (r.bot || !r.userId) continue;
        if (db.get('SELECT 1 FROM match_history WHERE user_id = ? AND match_id = ?', [r.userId, match.id])) continue;
        const elims = r.stats ? r.stats.elims || 0 : 0;
        db.run('UPDATE users SET coins = coins + ?, wins = wins + ?, matches = matches + 1, elims = elims + ? WHERE id = ?', [r.coins, r.won ? 1 : 0, elims, r.userId]);
        db.run('INSERT INTO match_history (user_id, match_id, mode, map, placement, won, elims, coins, practice, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [r.userId, match.id, match.modeId, match.mapId || '', r.placement, r.won ? 1 : 0, elims, r.coins, match.practice ? 1 : 0, now]);
        db.run('INSERT INTO mode_stats (user_id, mode, wins, matches) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, mode) DO UPDATE SET wins = wins + excluded.wins, matches = matches + 1',
          [r.userId, match.modeId, r.won ? 1 : 0]);
      }
    });
    for (const r of results) {
      if (r.bot || !r.userId) continue;
      const u = db.get('SELECT * FROM users WHERE id = ?', [r.userId]);
      if (u) out[r.userId] = selfProfile(u);
    }
    return out;
  }
}
