// Server-side bots. They use the same physics as players and act through the
// same validated match functions (punch, shoot, use, craft...) as humans.
import { stepBody, lineOfSight, lookDir } from '../../shared/physics.js';
import { PHYS } from '../../shared/constants.js';
import { WEAPONS, RECIPES, HEALS } from '../../shared/items.js';
import { heldWeapon, canAfford, bestHeal } from './inventory.js';

export const BOT_NAMES = [
  'Noodle', 'Biscuit', 'Pickles', 'Waffles', 'Turbo', 'Sprocket', 'Gizmo', 'Nugget', 'Pebble', 'Bloop', 'Zippy', 'Mochi',
  'Taco', 'Bean', 'Rocket', 'Fuzzy', 'Clank', 'Dizzy', 'Pixel', 'Sparky', 'Wobble', 'Chonk', 'Scooter', 'Toast',
];

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class BotBrain {
  constructor(m, p) {
    this.m = m;
    this.p = p;
    this.skill = 0.45 + Math.random() * 0.45;
    this.speedFactor = 0.9 + this.skill * 0.1;
    this.path = null;
    this.pi = 0;
    this.goal = null; // {x,y,z} or {player}
    this.goalSetAt = 0;
    this.repathAt = 0;
    this.sprint = true;
    this.lastProgress = { x: p.x, z: p.z, t: Date.now() };
    this.stunUntil = 0;
    this.nextThink = 0;
    this.desiredYaw = p.yaw;
    this.desiredPitch = 0;
    this.aimOverride = false;
    this.visCache = new Map();
    this.ignore = new Map();
    this.fleePoint = null;
    this.fleeUntil = 0;
    this.wanderPoint = null;
    this.wanderUntil = 0;
    this.enemy = null;
    this.enemySince = 0;
    this.burstUntil = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeSwitch = 0;
    this.lastHurtBy = null;
    this.lastHurtAt = 0;
    this.jumpCd = 0;
    this.stuckCount = 0;
  }

  get nav() { return this.m.nav; }

  onHurt(attacker) {
    if (attacker && attacker !== this.p) { this.lastHurtBy = attacker; this.lastHurtAt = Date.now(); }
  }

  // ------------------------------------------------------------ main update
  update(dt, now) {
    const p = this.p;
    if (p.frozen || this.m.state !== 'playing') {
      this.applyMove(dt, 0, 0, false, false);
      return;
    }
    if (now >= this.nextThink) {
      this.nextThink = now + 140 + Math.random() * 90;
      try { this.think(now); } catch (e) { console.error('bot think error', e); }
    }
    let fx = 0, fz = 0, jump = false;
    const stunned = now < this.stunUntil;
    const searching = !!p.search || p.healUntil > now;
    if (!stunned && !searching) {
      const tgt = this.steerTarget(now);
      if (tgt) {
        let dx = tgt.x - p.x, dz = tgt.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.08) {
          fx = dx / d; fz = dz / d;
          if (tgt.jump && p.onGround && now > this.jumpCd) { jump = true; this.jumpCd = now + 500; }
          if (!this.aimOverride) this.desiredYaw = Math.atan2(-fx, -fz);
        }
      }
      if (this.strafe && this.aimOverride) {
        // circle-strafe sideways relative to look
        const sy = this.desiredYaw + (Math.PI / 2) * this.strafeDir;
        const sx = -Math.sin(sy), sz = -Math.cos(sy);
        fx = fx * 0.4 + sx * 0.8; fz = fz * 0.4 + sz * 0.8;
        const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L;
        if (now > this.strafeSwitch) { this.strafeDir *= -1; this.strafeSwitch = now + 700 + Math.random() * 1200; }
      }
      // stuck detection
      if (fx !== 0 || fz !== 0) {
        const moved = Math.hypot(p.x - this.lastProgress.x, p.z - this.lastProgress.z);
        if (moved > 0.6) { this.lastProgress = { x: p.x, z: p.z, t: now }; this.stuckCount = 0; }
        else if (now - this.lastProgress.t > 700) {
          if (p.onGround && now > this.jumpCd) { jump = true; this.jumpCd = now + 600; }
          if (now - this.lastProgress.t > 1600) {
            this.path = null; this.repathAt = 0; this.stuckCount++;
            this.lastProgress = { x: p.x, z: p.z, t: now };
            if (this.stuckCount > 2) { this.goal = null; this.wanderPoint = null; this.fleePoint = null; this.stuckCount = 0; }
          }
        }
      } else {
        this.lastProgress = { x: p.x, z: p.z, t: now };
      }
    }
    this.applyMove(dt, fx, fz, this.sprint && !searching, jump);
    // turn smoothly
    const turn = (5 + this.skill * 7) * dt;
    const dy = angDiff(p.yaw, this.desiredYaw);
    p.yaw += Math.max(-turn, Math.min(turn, dy));
    p.pitch += Math.max(-turn, Math.min(turn, this.desiredPitch - p.pitch));
    this.openNearbyDoors();
  }

  applyMove(dt, fx, fz, sprint, jump) {
    const p = this.p;
    const body = p;
    stepBody(this.m.world, body, { fx, fz, sprint, jump }, dt, { speedMul: p.speedMul * this.speedFactor });
    const moving = Math.hypot(p.vx, p.vz) > 0.5;
    p.flags = (moving ? 1 : 0) | (sprint && moving ? 2 : 0) | (p.onGround ? 4 : 0);
  }

  openNearbyDoors() {
    const p = this.p;
    for (const d of this.m.map.doors) {
      if (this.m.doorState.get(d.id)) continue;
      const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
      if (Math.abs(cx - p.x) < 1.5 && Math.abs(cz - p.z) < 1.5 && Math.abs(d.y0 - p.y) < 1.5) this.m.toggleDoor(p, d.id);
    }
  }

  // Returns next point to walk to (with jump flag) following the A* path.
  steerTarget(now) {
    const p = this.p;
    const g = this.goalPos();
    if (!g) return null;
    // direct approach when close and visible on the same level
    const gd = Math.hypot(g.x - p.x, g.z - p.z);
    if (gd < 0.35 && Math.abs(g.y - p.y) < 1.2) return null;
    if (gd < 5 && Math.abs(g.y - p.y) < 0.6 && this.clearLine(p, g)) return { x: g.x, z: g.z };
    if (!this.path || now >= this.repathAt) this.computePath(g, now);
    if (!this.path) return { x: g.x, z: g.z };
    const nav = this.nav;
    while (this.pi < this.path.length) {
      const np = nav.nodePos(this.path[this.pi]);
      if (Math.hypot(np.x - p.x, np.z - p.z) < 0.45 && Math.abs(np.y - p.y) < 1.1) this.pi++;
      else break;
    }
    if (this.pi >= this.path.length) {
      // reached the end of a partial path without getting to the goal: give up on it for a while
      if (this.pathPartial && (Math.hypot(g.x - p.x, g.z - p.z) > 2.5 || Math.abs(g.y - p.y) > 1.8)) { this.markUnreachable(); return null; }
      this.path = null;
      return { x: g.x, z: g.z };
    }
    const np = nav.nodePos(this.path[this.pi]);
    const jump = np.y - p.y > 0.5 && Math.hypot(np.x - p.x, np.z - p.z) < 1.4;
    return { x: np.x, z: np.z, jump };
  }

  computePath(g, now) {
    const p = this.p;
    const nav = this.nav;
    const a = nav.nearest(p.x, p.y, p.z);
    const b = nav.nearest(g.x, g.y, g.z);
    this.repathAt = now + (this.goal && this.goal.player ? 700 : 2500) + Math.random() * 300;
    if (a < 0 || b < 0) { this.path = null; return; }
    if (!nav.sameComponent(a, b)) { this.path = null; this.markUnreachable(); return; }
    this.path = nav.findPath(a, b, 60000);
    this.pathPartial = nav.lastPartial;
    this.pi = 0;
    if (this.path) this.smooth();
    else this.markUnreachable();
  }

  // skip waypoints we can walk to in a straight line on the same level
  smooth() {
    const p = this.p, nav = this.nav, path = this.path;
    const maxK = Math.min(path.length - 1, this.pi + 14);
    for (let k = maxK; k > this.pi; k--) {
      const q = nav.nodePos(path[k]);
      if (Math.abs(q.y - p.y) > 0.3) continue;
      let flat = true;
      for (let j = this.pi; j <= k; j++) if (Math.abs(nav.ny[path[j]] - p.y) > 0.3) { flat = false; break; }
      if (!flat) continue;
      if (this.clearLine(p, q)) { this.pi = k; return; }
    }
  }

  clearLine(a, b) {
    const w = this.m.world;
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.01) return true;
    const ux = dx / L, uz = dz / L;
    const px = -uz * 0.32, pz = ux * 0.32;
    for (const [ox, oz] of [[0, 0], [px, pz], [-px, -pz]]) {
      for (const h of [0.35, 1.3]) {
        const hit = w.raycast(a.x + ox, a.y + h, a.z + oz, ux, 0, uz, L, (bx) => !bx.noPlayer);
        if (hit) return false;
      }
    }
    // must not walk off a ledge on the way: sample ground
    for (let t = 0.6; t < L; t += 0.8) {
      const x = a.x + ux * t, z = a.z + uz * t;
      const gy = w.groundHeight(x, z, a.y + 0.5, 0.2);
      if (gy === -Infinity || a.y - gy > 0.7) return false;
    }
    return true;
  }

  markUnreachable() {
    if (this.goal && this.goal.key) this.ignore.set(this.goal.key, Date.now() + 20000);
    this.goal = null;
    this.path = null;
  }

  goalPos() {
    const g = this.goal;
    if (!g) return null;
    if (g.player) {
      if (!g.player.alive || g.player.left) { this.goal = null; return null; }
      return g.player;
    }
    return g;
  }

  setGoal(g) {
    const prev = this.goal;
    if (prev && g && prev.key && prev.key === g.key) {
      if (!g.player) { prev.x = g.x; prev.y = g.y; prev.z = g.z; }
      return;
    }
    this.goal = g;
    this.path = null;
    this.repathAt = 0;
    this.goalSetAt = Date.now();
  }

  ignored(key) { const t = this.ignore.get(key); return t && t > Date.now(); }

  // ------------------------------------------------------------ helpers
  canSee(q, now) {
    const c = this.visCache.get(q.num);
    if (c && now - c.t < 300) return c.v;
    const p = this.p;
    const v = lineOfSight(this.m.world, p.x, p.y + PHYS.EYE_HEIGHT, p.z, q.x, q.y + 1.3, q.z);
    this.visCache.set(q.num, { t: now, v });
    return v;
  }

  others() { return this.m.byNum.filter((q) => q !== this.p && q.alive && !q.left); }

  nearestOther(filter) {
    let best = null, bd = Infinity;
    for (const q of this.others()) {
      if (filter && !filter(q)) continue;
      const d = dist2(q, this.p) + Math.abs(q.y - this.p.y) * 2;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  face(q, pitchToo = true) {
    const p = this.p;
    const dx = q.x - p.x, dz = q.z - p.z;
    this.desiredYaw = Math.atan2(-dx, -dz);
    if (pitchToo) {
      const dy = (q.y + 1.2) - (p.y + PHYS.EYE_HEIGHT);
      this.desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
  }

  faceNow(q) {
    this.face(q);
    this.p.yaw = this.desiredYaw;
    this.p.pitch = this.desiredPitch;
  }

  flee(threat, now) {
    const p = this.p;
    if (!this.fleePoint || now > this.fleeUntil || dist2(this.fleePoint, p) < 2 || dist2(this.fleePoint, threat) < 8) {
      let best = null, bestS = -Infinity;
      for (let i = 0; i < 18; i++) {
        const n = this.nav.randomNode(Math.random);
        if (n < 0) continue;
        const q = this.nav.nodePos(n);
        const dp = dist2(q, p);
        if (dp > 30 || dp < 6) continue;
        const dt = dist2(q, threat);
        // prefer points away from the threat and not across it
        const toQx = q.x - p.x, toQz = q.z - p.z, toTx = threat.x - p.x, toTz = threat.z - p.z;
        const across = (toQx * toTx + toQz * toTz) / ((Math.hypot(toQx, toQz) * Math.hypot(toTx, toTz)) || 1);
        const s = dt - dp * 0.3 - across * 10 + Math.random() * 3;
        if (s > bestS) { bestS = s; best = q; }
      }
      this.fleePoint = best;
      this.fleeUntil = now + 2500 + Math.random() * 1500;
    }
    if (this.fleePoint) this.setGoal({ ...this.fleePoint, key: 'flee' + Math.round(this.fleePoint.x) + ',' + Math.round(this.fleePoint.z) });
    this.sprint = true;
  }

  wander(now, radius = 22) {
    const p = this.p;
    if (!this.wanderPoint || now > this.wanderUntil || dist2(this.wanderPoint, p) < 1.5) {
      for (let i = 0; i < 20; i++) {
        const n = this.nav.randomNode(Math.random);
        if (n < 0) continue;
        const q = this.nav.nodePos(n);
        if (dist2(q, p) < radius && dist2(q, p) > 5) { this.wanderPoint = q; break; }
      }
      this.wanderUntil = now + 6000 + Math.random() * 4000;
    }
    if (this.wanderPoint) this.setGoal({ ...this.wanderPoint, key: 'wander' + Math.round(this.wanderPoint.x) + ',' + Math.round(this.wanderPoint.z) });
  }

  // ------------------------------------------------------------ decision making
  think(now) {
    const ac = this.arriveCheck;
    if (ac && now >= ac.at) {
      this.arriveCheck = null;
      const k = ac.key;
      let stillThere = false;
      if (k.startsWith('loot')) stillThere = this.m.loot.has(+k.slice(4));
      else if (k.startsWith('cont')) { const st = this.m.containers.get(k.slice(4)); stillThere = !!st && !st.opened; }
      else if (k.startsWith('res')) { const st = this.m.resources.get(k.slice(3)); stillThere = false && st; }
      if (stillThere && !this.p.search) this.ignore.set(k, now + 15000);
    }
    this.aimOverride = false;
    this.strafe = false;
    this.desiredPitch = 0;
    const mode = this.m.mode;
    switch (mode.id) {
      case 'tag': return this.thinkTag(now, mode);
      case 'hotpotato': return this.thinkPotato(now, mode);
      case 'grab': return this.thinkGrab(now, mode);
      case 'guns':
      case 'craft': return this.thinkBattle(now, mode);
      default: return this.wander(now);
    }
  }

  thinkTag(now, mode) {
    const p = this.p;
    if (mode.it === p) {
      const blocked = now < mode.noTagBackUntil ? mode.lastTagger : null;
      const target = this.nearestOther((q) => q !== blocked);
      if (!target) return;
      this.sprint = true;
      this.setGoal({ player: target, key: 'chase' + target.num });
      const d = dist2(target, p);
      if (d < 2.2 && Math.abs(target.y - p.y) < 1.5 && now >= p.cd.tag) {
        this.faceNow(target);
        this.m.punch(p);
      }
    } else if (mode.it) {
      const it = mode.it;
      const d = dist2(it, p);
      if (d < 18 || (d < 30 && this.canSee(it, now))) this.flee(it, now);
      else { this.sprint = false; this.wander(now); }
      // occasionally shove a nearby player out of spite
      if (Math.random() < 0.03) {
        const q = this.nearestOther((x) => x !== it);
        if (q && dist2(q, p) < 2) { this.faceNow(q); this.m.punch(p); }
      }
    }
  }

  thinkPotato(now, mode) {
    const p = this.p;
    const holder = mode.holder;
    if (holder === p) {
      const blocked = now < mode.noPassBackUntil ? mode.lastGiver : null;
      const target = this.nearestOther((q) => q !== blocked);
      if (!target) return;
      this.sprint = true;
      this.setGoal({ player: target, key: 'pass' + target.num });
      if (dist2(target, p) < 2.6 && Math.abs(target.y - p.y) < 1.5 && now >= p.cd.tag && this.canSee(target, now)) {
        this.faceNow(target);
        this.m.use(p, { k: 'player', id: target.num });
      }
    } else if (holder) {
      const d = dist2(holder, p);
      const timeLeft = (mode.popAt - now) / 1000;
      if (d < 16 || (timeLeft < 6 && d < 25)) this.flee(holder, now);
      else { this.sprint = false; this.wander(now, 15); }
    } else {
      this.sprint = false;
      this.wander(now, 12);
    }
  }

  thinkGrab(now, mode) {
    const p = this.p;
    const it = mode.item;
    if (it.state === 'carried' && it.carrier === p) {
      const t = mode.table;
      this.sprint = true;
      // walk right up to the table and stay there until the delivery completes
      const dx = p.x - t.x, dz = p.z - t.z, dl = Math.hypot(dx, dz) || 1;
      if (dl < t.r + 0.6) this.setGoal(null);
      else this.setGoal({ x: t.x + (dx / dl) * 1.3, y: t.y, z: t.z + (dz / dl) * 1.3, key: 'table' });
      // shove chasers that get too close
      const q = this.nearestOther();
      if (q && dist2(q, p) < 1.8 && Math.random() < 0.3) { this.faceNow(q); this.m.punch(p); }
    } else if (it.state === 'carried' && it.carrier) {
      const c = it.carrier;
      this.sprint = true;
      this.setGoal({ player: c, key: 'carrier' + c.num });
      if (dist2(c, p) < 2.2 && Math.abs(c.y - p.y) < 1.5) { this.faceNow(c); this.m.punch(p); }
    } else {
      this.sprint = true;
      this.setGoal({ x: it.x, y: it.y, z: it.z, key: 'chicken' + Math.round(it.x) + ',' + Math.round(it.z) });
      if (dist2(it, p) < 2.2 && Math.abs(it.y - p.y) < 2) this.m.use(p, { k: 'chicken' });
      // brawl with whoever is also near the chicken
      const q = this.nearestOther();
      if (q && dist2(q, p) < 1.9 && dist2(it, p) < 6 && Math.random() < 0.25) { this.faceNow(q); this.m.punch(p); }
    }
  }

  // ------------------------------------------------------------ combat modes
  bestWeaponSlot() {
    const inv = this.p.inv;
    let best = 0, bestScore = -1;
    for (let i = 0; i < 3; i++) {
      const w = inv.slots[i];
      if (!w) continue;
      const def = WEAPONS[w.t];
      const ammo = w.mag + (inv.ammo[def.ammo] || 0);
      if (ammo <= 0) continue;
      const score = def.rarity * 10 + def.dmg * def.pellets / def.interval / 50;
      if (score > bestScore) { bestScore = score; best = i + 1; }
    }
    return best;
  }

  hasUsableGun() { return this.bestWeaponSlot() > 0; }

  pickEnemy(now) {
    const p = this.p;
    let best = null, bd = Infinity;
    for (const q of this.others()) {
      const d = dist2(q, p);
      if (d > 55) continue;
      if (!this.canSee(q, now)) continue;
      // facing check: bots notice enemies in front or ones that hurt them
      const dir = lookDir(p.yaw, 0);
      const dot = ((q.x - p.x) * dir.x + (q.z - p.z) * dir.z) / (d || 1);
      const recentlyHurt = this.lastHurtBy === q && now - this.lastHurtAt < 4000;
      if (dot < -0.2 && d > 8 && !recentlyHurt) continue;
      const score = d - (recentlyHurt ? 15 : 0);
      if (score < bd) { bd = score; best = q; }
    }
    if (best !== this.enemy) { this.enemy = best; this.enemySince = now; }
    return best;
  }

  thinkBattle(now, mode) {
    const p = this.p;
    const enemy = this.pickEnemy(now);
    const slot = this.bestWeaponSlot();
    if (slot && p.inv.held !== slot && !(p.reloadUntil > now)) this.m.selectSlot(p, slot);
    const w = heldWeapon(p);

    if (enemy) {
      const d = dist2(enemy, p);
      if (w) {
        const def = WEAPONS[w.t];
        this.aimOverride = true;
        this.face(enemy);
        this.strafe = d < def.range * 0.8;
        // keep a sensible distance
        if (d > def.range * 0.6) { this.sprint = true; this.setGoal({ player: enemy, key: 'hunt' + enemy.num }); }
        else if (d < 5 && def.pellets === 1) { this.flee(enemy, now); this.aimOverride = true; this.face(enemy); }
        else this.setGoal(null);
        if (w.mag === 0) { this.m.reload(p); return; }
        const reaction = 650 - this.skill * 400;
        if (now - this.enemySince > reaction && d < def.range) {
          if (def.auto && now > this.burstUntil + 400) this.burstUntil = now + 300 + Math.random() * 500;
          if (!def.auto || now < this.burstUntil) this.fireAt(enemy, def, d);
        }
        return;
      }
      // fists
      if (d < 14 || this.lastHurtBy === enemy) {
        this.sprint = true;
        this.setGoal({ player: enemy, key: 'brawl' + enemy.num });
        if (d < 2.1 && Math.abs(enemy.y - p.y) < 1.4) { this.faceNow(enemy); this.m.punch(p); }
        if (d < 8) return;
      }
    }

    // heal when safe
    if (p.hp < 60 && !(p.healUntil > now)) {
      const h = bestHeal(p);
      if (h && !enemy) { this.m.heal(p); return; }
    }
    // reload when safe
    if (w && w.mag < WEAPONS[w.t].mag * 0.5 && (p.inv.ammo[WEAPONS[w.t].ammo] || 0) > 0 && !(p.reloadUntil > now)) this.m.reload(p);
    if (p.search) return; // busy searching / harvesting

    if (mode.crafting && this.tryCraft(now)) return;
    const lootGoal = this.lootGoal(now, mode);
    if (lootGoal) return;
    // hunt
    const target = this.nearestOther();
    if (target && (this.hasUsableGun() || this.allLooted || Math.random() < 0.5)) {
      this.sprint = true;
      this.setGoal({ player: target, key: 'hunt' + target.num });
    } else this.wander(now);
  }

  fireAt(enemy, def, d) {
    const p = this.p;
    const err = (0.05 - this.skill * 0.035) * (1 + Math.min(1, Math.hypot(enemy.vx || 0, enemy.vz || 0) / 6)) + d * 0.0006;
    const ey = p.y + PHYS.EYE_HEIGHT;
    const tx = enemy.x + (Math.random() - 0.5) * 2 * err * d;
    const ty = enemy.y + (Math.random() < 0.15 * this.skill ? 1.65 : 1.1) + (Math.random() - 0.5) * 2 * err * d;
    const tz = enemy.z + (Math.random() - 0.5) * 2 * err * d;
    const dx = tx - p.x, dy = ty - ey, dz = tz - p.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.asin(dy / L);
    this.desiredYaw = p.yaw;
    this.desiredPitch = p.pitch;
    this.m.shoot(p, { d: [dx / L, dy / L, dz / L] });
  }

  // Pick something to loot. Returns true if a goal was set.
  lootGoal(now, mode) {
    const p = this.p;
    const inv = p.inv;
    const w = heldWeapon(p);
    const needGun = !this.hasUsableGun();
    const freeSlot = inv.slots.some((s) => !s);
    let best = null, bestScore = Infinity;
    const consider = (key, x, y, z, value, onArrive) => {
      if (this.ignored(key)) return;
      const d = Math.hypot(x - p.x, z - p.z) + Math.abs(y - p.y) * 3;
      if (d > 70) return;
      const s = d / value;
      if (s < bestScore) { bestScore = s; best = { key, x, y, z, onArrive }; }
    };
    for (const l of this.m.loot.values()) {
      let v = 0;
      if (l.kind === 'weapon') {
        const def = WEAPONS[l.t];
        const myBest = inv.slots.reduce((m, s) => Math.max(m, s ? WEAPONS[s.t].rarity : -1), -1);
        if (needGun) v = 5; else if (freeSlot || def.rarity > myBest) v = 1.5 + def.rarity;
      } else if (l.kind === 'ammo') {
        const uses = inv.slots.some((s) => s && WEAPONS[s.t].ammo === l.t);
        v = uses ? ((inv.ammo[l.t] || 0) < 40 ? 3 : 0.6) : 0.2;
      } else if (l.kind === 'heal') v = p.hp < 80 ? 2 : 0.8;
      else if (l.kind === 'armor') v = p.armor < 50 ? 2.2 : 0.4;
      else if (l.kind === 'mat') v = mode.crafting ? 1.4 : 0;
      if (v <= 0) continue;
      consider('loot' + l.id, l.x, l.y, l.z, v, () => this.m.use(p, { k: 'loot', id: l.id }));
    }
    for (const c of this.m.map.containers) {
      const st = this.m.containers.get(c.id);
      if (!st || st.opened) continue;
      consider('cont' + c.id, c.x, c.y, c.z, (needGun ? 2.5 : 1.3) + c.tier * 0.4, () => this.m.use(p, { k: 'container', id: c.id }));
    }
    if (mode.crafting) {
      for (const r of this.m.map.resources) {
        const st = this.m.resources.get(r.id);
        if (!st || st.left <= 0) continue;
        consider('res' + r.id, r.x, r.y, r.z, 1.6, () => this.m.use(p, { k: 'res', id: r.id }));
      }
    }
    this.allLooted = !best;
    if (!best) return false;
    if (!needGun && bestScore > 25) return false; // nothing worth the trip
    this.sprint = true;
    this.setGoal({ x: best.x, y: best.y, z: best.z, key: best.key });
    if (Math.hypot(best.x - p.x, best.z - p.z) < 1.9 && Math.abs(best.y - p.y) < 1.8) {
      best.onArrive();
      // if nothing happened (e.g. someone else is searching it) avoid it for a while
      if (!this.arriveCheck || this.arriveCheck.key !== best.key) this.arriveCheck = { key: best.key, at: now + 2200 };
    }
    return true;
  }

  // Scavenge & Craft: walk to a bench and craft the most useful affordable recipe.
  tryCraft(now) {
    const p = this.p;
    const inv = p.inv;
    const recipe = this.chooseRecipe();
    if (!recipe) return false;
    // nearest bench
    let bench = null, bd = Infinity;
    for (const b of this.m.map.benches) {
      if (this.ignored('bench' + b.id)) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z) + Math.abs(b.y - p.y) * 3;
      if (d < bd) { bd = d; bench = b; }
    }
    if (!bench || bd > 90) return false;
    this.sprint = true;
    if (Math.hypot(bench.x - p.x, bench.z - p.z) < 2.6 && Math.abs(bench.y - p.y) < 1.8) {
      this.setGoal(null);
      this.m.craft(p, recipe.id);
      return true;
    }
    this.setGoal({ x: bench.x, y: bench.y, z: bench.z, key: 'bench' + bench.id });
    return true;
  }

  chooseRecipe() {
    const p = this.p;
    const inv = p.inv;
    const afford = (id) => { const r = RECIPES.find((x) => x.id === id); return r && canAfford(inv, r.cost) ? r : null; };
    const myBest = inv.slots.reduce((m, s) => Math.max(m, s ? WEAPONS[s.t].rarity : -1), -1);
    const gunsByValue = ['blaster', 'rifle', 'sniper', 'smg', 'revolver', 'shotgun', 'pistol'];
    for (const g of gunsByValue) {
      if (WEAPONS[g].rarity <= myBest && myBest >= 0) continue;
      const r = afford(g);
      if (r && (myBest < 0 || inv.slots.some((s) => !s))) return r;
    }
    // ammo for weapons we carry
    for (const s of inv.slots) {
      if (!s) continue;
      const a = WEAPONS[s.t].ammo;
      if ((inv.ammo[a] || 0) + s.mag < 20) { const r = afford('ammo_' + a); if (r) return r; }
    }
    if (p.armor < 40) { const r = afford('plate') || afford('vest'); if (r) return r; }
    if (inv.heals.bandage + inv.heals.medkit === 0) { const r = afford('medkit') || afford('bandage'); if (r) return r; }
    return null;
  }
}

export { HEALS };
