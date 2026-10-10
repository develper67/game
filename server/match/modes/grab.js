// GRAB THE ITEM: grab the Golden Rubber Chicken and deliver it to the winning
// table. Punch the carrier to knock it loose. First delivery wins.
const DELIVER_TIME = 2.0; // seconds the carrier must stay at the table
const PROTECT_MS = 1500; // a fresh carrier can't be knocked loose right away

export class GrabMode {
  constructor(m) {
    this.m = m;
    this.id = 'grab';
    this.combat = false;
    this.item = { state: 'ground', carrier: null, x: 0, y: 0, z: 0, since: 0 };
    this.noPickup = new Map(); // num -> until
    this.endsAt = 0;
    this.table = m.map.grab.table;
    this.deliverT = 0;
  }

  onStart() {
    this.endsAt = Date.now() + this.m.modeDef.duration * 1000;
    this.respawnItem(true);
  }

  respawnItem(first) {
    const t = this.table;
    const all = this.m.map.grab.itemSpawns;
    const far = all.filter((s) => Math.hypot(s.x - t.x, s.z - t.z) > 30 && s !== this.lastSpawn);
    const spawns = far.length ? far : all;
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    this.lastSpawn = s;
    this.setCarrier(null);
    this.item.state = 'ground';
    this.item.x = s.x; this.item.y = s.y; this.item.z = s.z;
    this.item.since = Date.now();
    this.m.ev({ k: 'item', state: 'spawn', x: s.x, y: s.y, z: s.z });
    this.m.broadcastMode();
    if (!first) this.m.announce('🐔 The Golden Rubber Chicken respawned somewhere new!', 'event');
    else this.m.announce('🐔 The Golden Rubber Chicken has appeared! Find it and deliver it to the glowing table.', 'event');
  }

  setCarrier(p) {
    if (this.item.carrier) this.item.carrier.speedMul = 1;
    this.item.carrier = p;
    this.deliverT = 0;
    if (p) {
      p.speedMul = 0.88;
      this.protectedUntil = Date.now() + PROTECT_MS;
      this.item.state = 'carried';
    }
  }

  pickup(p) {
    const now = Date.now();
    if (this.item.state !== 'ground' || !p.alive) return false;
    if ((this.noPickup.get(p.num) || 0) > now) return false;
    const prev = this.lastDropper;
    this.setCarrier(p);
    if (prev && prev !== p && this.lastDropTime && now - this.lastDropTime < 8000 && this.lastPuncher === p) {
      p.stats.steals++;
      this.m.announce(`🐔 ${p.name} stole the chicken from ${prev.name}!`, 'event');
    } else {
      this.m.announce(`🐔 ${p.name} grabbed the chicken!`, 'event');
    }
    this.m.ev({ k: 'item', state: 'carried', n: p.num });
    this.m.broadcastMode();
    return true;
  }

  drop(p, from) {
    if (this.item.carrier !== p) return;
    const now = Date.now();
    this.setCarrier(null);
    this.item.state = 'ground';
    // toss it a little away from the attacker
    let dx = 0, dz = 0;
    if (from) { dx = p.x - from.x; dz = p.z - from.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
    this.item.x = p.x + dx * 1.2; this.item.y = p.y + 0.05; this.item.z = p.z + dz * 1.2;
    // make sure we don't drop it inside a wall
    if (this.m.world.overlaps(this.item.x - 0.2, this.item.y + 0.1, this.item.z - 0.2, this.item.x + 0.2, this.item.y + 0.6, this.item.z + 0.2)) {
      this.item.x = p.x; this.item.z = p.z;
    }
    this.item.since = now;
    this.noPickup.set(p.num, now + 1200);
    this.lastDropper = p;
    this.lastPuncher = from;
    this.lastDropTime = now;
    this.m.ev({ k: 'item', state: 'drop', n: p.num, x: this.item.x, y: this.item.y, z: this.item.z, by: from ? from.num : -1 });
    this.m.broadcastMode();
  }

  onUse(p, d) {
    if (d.k !== 'chicken') return false;
    if (this.item.state === 'ground' && Math.hypot(this.item.x - p.x, this.item.z - p.z) < 2.6 && Math.abs(this.item.y - p.y) < 2.2) this.pickup(p);
    return true;
  }

  onPunch(a, t) {
    this.m.knockback(t, a, 6, 3.4);
    if (t === this.item.carrier) {
      if (Date.now() < this.protectedUntil) { this.m.emitTo(a, 'ev', { k: 'toast', text: 'They just grabbed it — wait a moment!' }); return true; }
      this.drop(t, a);
    }
    return true;
  }

  tick(dt, now) {
    const alive = this.m.alivePlayers();
    if (alive.length < 2) { this.m.finish({ winners: alive, reason: 'Everyone else left.' }); return; }
    const it = this.item;
    if (it.state === 'carried' && it.carrier) {
      const c = it.carrier;
      it.x = c.x; it.y = c.y; it.z = c.z;
      c.stats.heldTime += dt;
      const t = this.table;
      const inZone = Math.hypot(c.x - t.x, c.z - t.z) < t.r + 1.0 && Math.abs(c.y - t.y) < 2;
      const prevT = this.deliverT;
      this.deliverT = inZone ? this.deliverT + dt : 0;
      if ((prevT === 0) !== (this.deliverT === 0)) this.m.broadcastMode();
      if (this.deliverT >= DELIVER_TIME) {
        c.stats.deliveries++;
        this.m.ev({ k: 'deliver', n: c.num });
        this.m.announce(`🏆 ${c.name} delivered the Golden Rubber Chicken!`, 'victory');
        this.m.finish({ winners: [c], reason: `${c.name} delivered the chicken to the table.` });
        return;
      }
    } else if (it.state === 'ground') {
      // touch pickup
      for (const p of alive) {
        if (Math.hypot(p.x - it.x, p.z - it.z) < 1.0 && it.y - p.y < 1.9 && p.y - it.y < 1.2) { if (this.pickup(p)) break; }
      }
      if (it.state === 'ground' && now - it.since > 45000) this.respawnItem(false);
    }
    if (now >= this.endsAt) {
      let best = null;
      for (const p of alive) if (!best || p.stats.heldTime > best.stats.heldTime) best = p;
      if (best && best.stats.heldTime > 0.5) this.m.finish({ winners: [best], reason: `Time! ${best.name} held the chicken the longest.` });
      else this.m.finish({ winners: [], reason: 'Time ran out and nobody held the chicken.' });
    }
  }

  onLeave(p) { if (this.item.carrier === p) this.drop(p, null); }

  onFell(p) {
    if (this.item.carrier === p) { this.setCarrier(null); this.respawnItem(false); }
    const s = this.m.randomSpawn([]);
    this.m.placePlayer(p, s.x, s.y, s.z, s.yaw);
  }

  state() {
    const it = this.item;
    return {
      mode: 'grab', endsAt: this.endsAt, protectedUntil: this.protectedUntil || 0, deliverStart: this.deliverT > 0 ? Date.now() - this.deliverT * 1000 : 0, deliverTime: DELIVER_TIME,
      item: { state: it.state, carrier: it.carrier ? it.carrier.num : -1, x: Math.round(it.x * 100) / 100, y: Math.round(it.y * 100) / 100, z: Math.round(it.z * 100) / 100 },
      table: { x: this.table.x, y: this.table.y, z: this.table.z, r: this.table.r },
    };
  }

  score(p) { return p.stats.deliveries * 10000 + Math.round(p.stats.heldTime * 10); }

  rewards(p) {
    const out = [];
    if (p.stats.deliveries) out.push({ label: 'Chicken delivered', coins: 60 });
    if (p.stats.steals) out.push({ label: `Steals x${p.stats.steals}`, coins: Math.min(40, p.stats.steals * 10) });
    if (p.stats.heldTime > 3) out.push({ label: 'Chicken carrier', coins: Math.min(20, Math.round(p.stats.heldTime / 4)) });
    return out;
  }
}
