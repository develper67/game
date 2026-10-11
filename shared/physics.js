// Shared collision world + character movement.
// All solid geometry is axis-aligned boxes stored as {x0,y0,z0,x1,y1,z1}.
// Used by the client (local player prediction) and by the server (bots + validation + hitscan).
import { PHYS } from './constants.js';

const CELL = 4;

export class CollisionWorld {
  constructor(boxes = []) {
    this.boxes = [];
    this.grid = new Map();
    this.disabled = new Set();
    // visit marks live in the world, not on the boxes: several worlds (one per
    // match) are built from the same cached map boxes
    this.marks = [];
    this._stamp = 1;
    for (const b of boxes) this.add(b);
  }

  add(b) {
    const idx = this.boxes.length;
    this.boxes.push(b);
    this.marks.push(0);
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(idx);
      }
    }
    return idx;
  }

  setDisabled(id, disabled) {
    if (disabled) this.disabled.add(id); else this.disabled.delete(id);
  }

  // Calls cb(box) for every enabled box overlapping the XZ rectangle (no duplicates).
  query(x0, z0, x1, z1, cb) {
    const stamp = ++this._stamp;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.grid.get(cx * 73856093 ^ cz * 19349663);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const idx = arr[i];
          if (this.marks[idx] === stamp) continue;
          this.marks[idx] = stamp;
          const b = this.boxes[idx];
          if (b.id !== undefined && this.disabled.has(b.id)) continue;
          if (b.x1 <= x0 || b.x0 >= x1 || b.z1 <= z0 || b.z0 >= z1) continue;
          if (cb(b) === true) return true;
        }
      }
    }
    return false;
  }

  // True if the AABB intersects any solid box.
  overlaps(x0, y0, z0, x1, y1, z1, filter) {
    return this.query(x0, z0, x1, z1, (b) => {
      if (b.y1 <= y0 || b.y0 >= y1) return false;
      if (filter && !filter(b)) return false;
      return true;
    });
  }

  // Ray cast against boxes. Returns {t, box, nx, ny, nz} or null. dir must be normalized.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
    let best = null;
    let bestT = maxDist;
    // Walk grid cells along the ray (2D DDA in XZ)
    const stamp = ++this._stamp;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = dx !== 0 ? (((dx > 0 ? cx + 1 : cx) * CELL) - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (((dz > 0 ? cz + 1 : cz) * CELL) - oz) / dz : Infinity;
    let t = 0;
    for (let iter = 0; iter < 512; iter++) {
      const arr = this.grid.get(cx * 73856093 ^ cz * 19349663);
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const idx = arr[i];
          if (this.marks[idx] === stamp) continue;
          this.marks[idx] = stamp;
          const b = this.boxes[idx];
          if (b.id !== undefined && this.disabled.has(b.id)) continue;
          if (filter && !filter(b)) continue;
          const hit = rayBox(ox, oy, oz, dx, dy, dz, b, bestT);
          if (hit && hit.t < bestT) { bestT = hit.t; best = hit; best.box = b; }
        }
      }
      if (best && best.t <= t) break;
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      if (t > bestT) break;
    }
    return best;
  }

  // Highest solid surface at (x,z) below y (within the radius footprint). Returns -Infinity if none.
  groundHeight(x, z, y, r = PHYS.RADIUS) {
    let best = -Infinity;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (b.y1 <= y + 0.01 && b.y1 > best) best = b.y1;
      return false;
    });
    return best;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  let axis = -1;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.x0 || ox > b.x1) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (b.x0 - ox) * inv, t2 = (b.x1 - ox) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; axis = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.y0 || oy > b.y1) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (b.y0 - oy) * inv, t2 = (b.y1 - oy) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; axis = 1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.z0 || oz > b.z1) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (b.z0 - oz) * inv, t2 = (b.z1 - oz) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; axis = 2; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return { t: 0, nx: -dx, ny: -dy, nz: -dz }; // origin inside box
  return {
    t: tmin,
    nx: axis === 0 ? (dx > 0 ? -1 : 1) : 0,
    ny: axis === 1 ? (dy > 0 ? -1 : 1) : 0,
    nz: axis === 2 ? (dz > 0 ? -1 : 1) : 0,
  };
}

// Ray vs. axis aligned box given as min/max (used for player hitboxes). Returns t or -1.
export function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxT) {
  let tmin = 0, tmax = maxT;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// ---------------------------------------------------------------------------
// Character body movement. body: {x,y,z,vx,vy,vz,onGround}
// y is the FEET position. input: {fx, fz (world-space wish dir, normalized or 0), sprint, jump}
// opts: {speedMul, height}
// Returns events: {landed: impactSpeed|0, jumped: bool, stepped: dy}
// ---------------------------------------------------------------------------
export function stepBody(world, body, input, dt, opts = {}) {
  const R = PHYS.RADIUS;
  const H = opts.height || PHYS.HEIGHT;
  const speedMul = opts.speedMul ?? 1;
  const ev = { landed: 0, jumped: false, stepped: 0 };

  const maxSpeed = (input.sprint ? PHYS.SPRINT_SPEED : PHYS.WALK_SPEED) * speedMul;
  const wishX = input.fx * maxSpeed, wishZ = input.fz * maxSpeed;

  if (body.onGround) {
    // accelerate towards wish velocity with friction
    const k = Math.min(1, PHYS.GROUND_FRICTION * dt);
    body.vx += (wishX - body.vx) * k;
    body.vz += (wishZ - body.vz) * k;
  } else {
    const k = Math.min(1, PHYS.GROUND_FRICTION * PHYS.AIR_CONTROL * dt);
    if (input.fx !== 0 || input.fz !== 0) {
      body.vx += (wishX - body.vx) * k;
      body.vz += (wishZ - body.vz) * k;
    }
  }

  if (input.jump && body.onGround) {
    body.vy = PHYS.JUMP_SPEED * (opts.jumpMul ?? 1);
    body.onGround = false;
    ev.jumped = true;
  }

  body.vy += PHYS.GRAVITY * dt;
  if (body.vy < -PHYS.MAX_FALL_SPEED) body.vy = -PHYS.MAX_FALL_SPEED;

  // Substep to avoid tunnelling through thin walls.
  const dist = Math.max(Math.abs(body.vx), Math.abs(body.vz), Math.abs(body.vy)) * dt;
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  const sdt = dt / steps;
  let wasGround = body.onGround;
  body.onGround = false;
  for (let s = 0; s < steps; s++) {
    moveAxis(world, body, 'x', body.vx * sdt, R, H, wasGround, ev);
    moveAxis(world, body, 'z', body.vz * sdt, R, H, wasGround, ev);
    const vyBefore = body.vy;
    const landed = moveVertical(world, body, body.vy * sdt, R, H);
    if (landed === 1) {
      if (!wasGround && vyBefore < -2) ev.landed = Math.max(ev.landed, -vyBefore);
      body.onGround = true;
      body.vy = 0;
      wasGround = true;
    } else if (landed === -1) {
      body.vy = Math.min(0, body.vy);
    }
  }
  // Ground snap: stay glued to the ground when walking down small steps.
  if (!body.onGround && wasGround && body.vy <= 0) {
    const g = world.groundHeight(body.x, body.z, body.y + 0.01, R - 0.02);
    if (g > body.y - PHYS.STEP_HEIGHT && g <= body.y + 0.01) {
      if (!world.overlaps(body.x - R, g + 0.001, body.z - R, body.x + R, g + H, body.z + R)) {
        ev.stepped += g - body.y;
        body.y = g;
        body.onGround = true;
        body.vy = 0;
      }
    }
  }
  if (!body.onGround) {
    // Check if standing exactly on something (vy was 0 and nothing moved)
    if (body.vy <= 0 && world.overlaps(body.x - R + 0.01, body.y - 0.02, body.z - R + 0.01, body.x + R - 0.01, body.y, body.z + R - 0.01)) {
      body.onGround = true;
    }
  }
  return ev;
}

function moveAxis(world, body, axis, d, R, H, canStep, ev) {
  if (d === 0) return;
  const nx = axis === 'x' ? body.x + d : body.x;
  const nz = axis === 'z' ? body.z + d : body.z;
  const y0 = body.y + 0.001, y1 = body.y + H;
  let blockTop = -Infinity;
  let blocked = false;
  let limit = d;
  world.query(nx - R, nz - R, nx + R, nz + R, (b) => {
    if (b.y1 <= y0 || b.y0 >= y1) return false;
    if (b.noPlayer) return false;
    blocked = true;
    if (b.y1 > blockTop) blockTop = b.y1;
    // compute allowed movement up to the face
    if (axis === 'x') {
      const allowed = d > 0 ? (b.x0 - R) - body.x : (b.x1 + R) - body.x;
      if (d > 0 ? allowed < limit : allowed > limit) limit = allowed;
    } else {
      const allowed = d > 0 ? (b.z0 - R) - body.z : (b.z1 + R) - body.z;
      if (d > 0 ? allowed < limit : allowed > limit) limit = allowed;
    }
    return false;
  });
  if (!blocked) {
    if (axis === 'x') body.x = nx; else body.z = nz;
    return;
  }
  // Try stepping up
  if (canStep && blockTop - body.y <= PHYS.STEP_HEIGHT && blockTop - body.y > 0) {
    const ny = blockTop + 0.001;
    if (!world.overlaps(nx - R, ny, nz - R, nx + R, ny + H, nz + R, (b) => !b.noPlayer)) {
      ev.stepped += ny - body.y;
      body.y = ny;
      if (axis === 'x') body.x = nx; else body.z = nz;
      return;
    }
  }
  // Slide up to the obstacle face (never move backwards into geometry).
  if ((d > 0 && limit > 0) || (d < 0 && limit < 0)) {
    if (axis === 'x') body.x += limit * 0.999; else body.z += limit * 0.999;
  }
  if (axis === 'x') body.vx = 0; else body.vz = 0;
}

// returns 1 if landed, -1 if hit ceiling, 0 otherwise
function moveVertical(world, body, d, R, H) {
  if (d === 0) return 0;
  const ny = body.y + d;
  let result = 0;
  if (d < 0) {
    let top = -Infinity;
    world.query(body.x - R, body.z - R, body.x + R, body.z + R, (b) => {
      if (b.noPlayer) return false;
      if (b.y1 <= ny || b.y0 >= body.y + H) return false;
      if (b.y1 <= body.y + 0.002 && b.y1 > top) top = b.y1;
      return false;
    });
    if (top > -Infinity && ny < top) {
      body.y = top;
      return 1;
    }
    body.y = ny;
    return 0;
  } else {
    let bottom = Infinity;
    world.query(body.x - R, body.z - R, body.x + R, body.z + R, (b) => {
      if (b.noPlayer) return false;
      if (b.y0 >= ny + H || b.y1 <= body.y) return false;
      if (b.y0 >= body.y + H - 0.002 && b.y0 < bottom) bottom = b.y0;
      return false;
    });
    if (bottom < Infinity && ny + H > bottom) {
      body.y = bottom - H - 0.001;
      result = -1;
    } else body.y = ny;
    return result;
  }
}

export function lineOfSight(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = world.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, (b) => !b.glass);
  return !hit;
}

export function yawToDir(yaw) {
  // yaw 0 looks toward -Z (three.js camera default)
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
