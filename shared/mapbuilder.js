// Deterministic map construction toolkit. Both server and client run the same
// builder code so geometry, colliders and object ids match exactly.
import { mulberry32 } from './rng.js';

// Rotation r in {0,1,2,3} = r * 90deg using three.js rotation.y convention:
// local (x,z) -> world: r0 (x,z) r1 (z,-x) r2 (-x,-z) r3 (-z,x)
export function rotXZ(x, z, r) {
  switch (r & 3) {
    case 0: return [x, z];
    case 1: return [z, -x];
    case 2: return [-x, -z];
    default: return [-z, x];
  }
}

export class Frame {
  constructor(builder, ox, oz, r = 0, oy = 0) {
    this.b = builder; this.ox = ox; this.oz = oz; this.r = r & 3; this.oy = oy;
  }
  pt(lx, lz) {
    const [x, z] = rotXZ(lx, lz, this.r);
    return [this.ox + x, this.oz + z];
  }
  rect(lx0, lz0, lx1, lz1) {
    const [ax, az] = this.pt(lx0, lz0);
    const [bx, bz] = this.pt(lx1, lz1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  }
  yaw(localYaw = 0) { return localYaw + this.r * Math.PI / 2; }
  sub(lx, lz, r = 0, ly = 0) {
    const [x, z] = this.pt(lx, lz);
    return new Frame(this.b, x, z, (this.r + r) & 3, this.oy + ly);
  }
  // Box in local coordinates (min/max corners)
  box(lx0, y0, lz0, lx1, y1, lz1, m, c, flags) {
    const [x0, z0, x1, z1] = this.rect(lx0, lz0, lx1, lz1);
    return this.b.box(x0, this.oy + y0, z0, x1, this.oy + y1, z1, m, c, flags);
  }
  // Box from center + size in local coordinates
  cbox(lx, y0, lz, w, h, d, m, c, flags) {
    return this.box(lx - w / 2, y0, lz - d / 2, lx + w / 2, y0 + h, lz + d / 2, m, c, flags);
  }
  // Wall running along local X at z=lz from lx0..lx1 with openings [{at,w,y0,y1,glass,door}]
  wallX(lx0, lx1, lz, y0, h, t, m, c, openings = [], extra = {}) {
    return this._wall('x', lx0, lx1, lz, y0, h, t, m, c, openings, extra);
  }
  wallZ(lz0, lz1, lx, y0, h, t, m, c, openings = [], extra = {}) {
    return this._wall('z', lz0, lz1, lx, y0, h, t, m, c, openings, extra);
  }
  _wall(axis, a0, a1, at, y0, h, t, m, c, openings, extra) {
    const seg = (s0, s1, sy0, sy1, mm = m, cc = c, fl = extra) => {
      if (s1 - s0 < 0.01 || sy1 - sy0 < 0.01) return;
      if (axis === 'x') this.box(s0, sy0, at - t / 2, s1, sy1, at + t / 2, mm, cc, fl);
      else this.box(at - t / 2, sy0, s0, at + t / 2, sy1, s1, mm, cc, fl);
    };
    const ops = openings.map((o) => ({ ...o, s0: a0 + o.at, s1: a0 + o.at + o.w })).sort((p, q) => p.s0 - q.s0);
    let cur = a0;
    const top = y0 + h;
    for (const o of ops) {
      seg(cur, o.s0, y0, top);
      const oy0 = y0 + (o.y0 || 0), oy1 = Math.min(top, y0 + (o.y1 ?? h));
      seg(o.s0, o.s1, y0, oy0); // sill
      seg(o.s0, o.s1, oy1, top); // lintel
      if (o.glass) {
        const gt = 0.06;
        if (axis === 'x') this.box(o.s0, oy0, at - gt / 2, o.s1, oy1, at + gt / 2, 'glass', 0xaad8ff, { glass: true });
        else this.box(at - gt / 2, oy0, o.s0, at + gt / 2, oy1, o.s1, 'glass', 0xaad8ff, { glass: true });
        // window frame bars
        const fb = 0.08;
        if (axis === 'x') this.box(o.s0 + (o.s1 - o.s0) / 2 - fb / 2, oy0, at - t / 2 + 0.02, o.s0 + (o.s1 - o.s0) / 2 + fb / 2, oy1, at + t / 2 - 0.02, 'wood', 0xf3efe6, { decor: true, col: false });
        else this.box(at - t / 2 + 0.02, oy0, o.s0 + (o.s1 - o.s0) / 2 - fb / 2, at + t / 2 - 0.02, oy1, o.s0 + (o.s1 - o.s0) / 2 + fb / 2, 'wood', 0xf3efe6, { decor: true, col: false });
      }
      if (o.door) {
        // door leaf: hinge at s0, extends to s1; swings to the side given by o.door.inside (+1 = +local perpendicular)
        const inside = o.door.inside ?? 1;
        const dt = 0.08;
        let lb;
        if (axis === 'x') lb = [o.s0 + 0.02, at - dt / 2, o.s1 - 0.02, at + dt / 2];
        else lb = [at - dt / 2, o.s0 + 0.02, at + dt / 2, o.s1 - 0.02];
        const [x0, z0, x1, z1] = this.rect(lb[0], lb[1], lb[2], lb[3]);
        const hingeL = axis === 'x' ? [o.s0 + 0.02, at] : [at, o.s0 + 0.02];
        const tipL = axis === 'x' ? [o.s1 - 0.02, at] : [at, o.s1 - 0.02];
        const inL = axis === 'x' ? [0, inside] : [inside, 0];
        const hinge = this.pt(hingeL[0], hingeL[1]);
        const tip = this.pt(tipL[0], tipL[1]);
        const [ix, iz] = rotXZ(inL[0], inL[1], this.r);
        this.b.door({
          x0, z0, x1, z1, y0: this.oy + oy0, y1: this.oy + oy1 - 0.02,
          hinge, tip, inside: [ix, iz], color: o.door.color ?? 0x8b5a2b, open: !!o.door.open,
        });
      }
      cur = o.s1;
    }
    seg(cur, a1, y0, top);
  }
  // Floor slab with optional rectangular hole (local coords)
  slab(lx0, lz0, lx1, lz1, y, t, m, c, hole) {
    if (!hole) return this.box(lx0, y - t, lz0, lx1, y, lz1, m, c);
    const [hx0, hz0, hx1, hz1] = hole;
    this.box(lx0, y - t, lz0, hx0, y, lz1, m, c);
    this.box(hx1, y - t, lz0, lx1, y, lz1, m, c);
    this.box(hx0, y - t, lz0, hx1, y, hz0, m, c);
    this.box(hx0, y - t, hz1, hx1, y, lz1, m, c);
  }
  // Straight stairs rising along local +Z (dir=1) or -Z (dir=-1) starting at lz with width from lx0..lx1
  stairsZ(lx0, lx1, lz, y0, height, run, dir, m, c) {
    const n = Math.max(2, Math.round(height / 0.25));
    const sh = height / n, sd = run / n;
    for (let i = 0; i < n; i++) {
      const za = lz + dir * i * sd, zb = lz + dir * (i + 1) * sd;
      this.box(lx0, y0, Math.min(za, zb), lx1, y0 + sh * (i + 1), Math.max(za, zb), m, c, { stair: true });
    }
  }
  stairsX(lz0, lz1, lx, y0, height, run, dir, m, c) {
    const n = Math.max(2, Math.round(height / 0.25));
    const sh = height / n, sd = run / n;
    for (let i = 0; i < n; i++) {
      const xa = lx + dir * i * sd, xb = lx + dir * (i + 1) * sd;
      this.box(Math.min(xa, xb), y0, lz0, Math.max(xa, xb), y0 + sh * (i + 1), lz1, m, c, { stair: true });
    }
  }
  // Smooth ramp along local +Z: visual wedge + small invisible collision steps
  rampZ(lx0, lx1, lz, y0, height, run, dir, m, c) {
    const [x0, z0, x1, z1] = this.rect(lx0, Math.min(lz, lz + dir * run), lx1, Math.max(lz, lz + dir * run));
    // compute rising direction in world space
    const [dx, dz] = rotXZ(0, dir, this.r);
    this.b.ramps.push({ x0, z0, x1, z1, y0: this.oy + y0, h: height, dx, dz, m, c });
    const n = Math.max(3, Math.ceil(height / 0.12));
    const sh = height / n, sd = run / n;
    for (let i = 0; i < n; i++) {
      const za = lz + dir * i * sd, zb = lz + dir * (i + 1) * sd;
      this.box(lx0, y0, Math.min(za, zb), lx1, y0 + sh * (i + 1), Math.max(za, zb), m, c, { vis: false, stair: true });
    }
  }
  // Smooth ramp along local +X (dir=1) or -X (dir=-1)
  rampX(lz0, lz1, lx, y0, height, run, dir, m, c) {
    const [x0, z0, x1, z1] = this.rect(Math.min(lx, lx + dir * run), lz0, Math.max(lx, lx + dir * run), lz1);
    const [dx, dz] = rotXZ(dir, 0, this.r);
    this.b.ramps.push({ x0, z0, x1, z1, y0: this.oy + y0, h: height, dx, dz, m, c });
    const n = Math.max(3, Math.ceil(height / 0.12));
    const sh = height / n, sd = run / n;
    for (let i = 0; i < n; i++) {
      const xa = lx + dir * i * sd, xb = lx + dir * (i + 1) * sd;
      this.box(Math.min(xa, xb), y0, lz0, Math.max(xa, xb), y0 + sh * (i + 1), lz1, m, c, { vis: false, stair: true });
    }
  }
  point(lx, ly, lz) {
    const [x, z] = this.pt(lx, lz);
    return { x, y: this.oy + ly, z };
  }
  spawn(lx, ly, lz, yaw = 0) { const p = this.point(lx, ly, lz); this.b.spawn(p.x, p.y, p.z, this.yaw(yaw)); }
  loot(lx, ly, lz, tier = 0, tag = 'floor') { const p = this.point(lx, ly, lz); this.b.loot(p.x, p.y, p.z, tier, tag); }
  container(kind, lx, ly, lz, rotL = 0, tier = 0) { const p = this.point(lx, ly, lz); return this.b.container(kind, p.x, p.y, p.z, (this.r + rotL) & 3, tier); }
  bench(lx, ly, lz, rotL = 0) { const p = this.point(lx, ly, lz); return this.b.bench(p.x, p.y, p.z, (this.r + rotL) & 3); }
  resource(kind, lx, ly, lz) { const p = this.point(lx, ly, lz); return this.b.resource(kind, p.x, p.y, p.z); }
  prop(kind, lx, ly, lz, rotL = 0, s = 1, extra = {}) { const p = this.point(lx, ly, lz); return this.b.prop(kind, p.x, p.y, p.z, this.yaw(rotL * Math.PI / 2), s, extra); }
  light(lx, ly, lz, color, intensity, range) { const p = this.point(lx, ly, lz); this.b.light(p.x, p.y, p.z, color, intensity, range); }
  prism(lx0, lz0, lx1, lz1, y0, h, alongX, m, c) {
    const [x0, z0, x1, z1] = this.rect(lx0, lz0, lx1, lz1);
    // ridge axis: alongX in local space -> world axis depends on rotation
    const ridgeX = (this.r % 2 === 0) ? alongX : !alongX;
    this.b.prisms.push({ x0, z0, x1, z1, y0: this.oy + y0, h, ridgeX, m, c });
  }
}

export class MapBuilder {
  constructor(id, seed) {
    this.id = id;
    this.rng = mulberry32(seed);
    this.boxes = [];
    this.doors = [];
    this.ramps = [];
    this.prisms = [];
    this.props = [];
    this.spawns = [];
    this.lootSpots = [];
    this.containers = [];
    this.benches = [];
    this.resources = [];
    this.lights = [];
    this.grab = { itemSpawns: [], table: null };
    this.cylinders = [];
  }
  frame(ox, oz, r = 0, oy = 0) { return new Frame(this, ox, oz, r, oy); }

  box(x0, y0, z0, x1, y1, z1, m = 'concrete', c = 0xcccccc, flags) {
    const b = { x0, y0, z0, x1, y1, z1, m, c };
    if (flags) {
      if (flags.col === false) b.col = false;
      if (flags.vis === false) b.vis = false;
      if (flags.glass) b.glass = true;
      if (flags.stair) b.stair = true;
      if (flags.decor) b.decor = true;
      if (flags.noPlayer) b.noPlayer = true;
      if (flags.id !== undefined) b.id = flags.id;
      if (flags.emissive) b.emissive = true;
    }
    this.boxes.push(b);
    return b;
  }
  cbox(x, y0, z, w, h, d, m, c, flags) {
    return this.box(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2, m, c, flags);
  }
  door(d) {
    d.id = 'd' + this.doors.length;
    this.doors.push(d);
    this.box(d.x0, d.y0, d.z0, d.x1, d.y1, d.z1, 'door', d.color, { id: d.id, vis: false });
    return d;
  }
  spawn(x, y, z, yaw = 0) { this.spawns.push({ x, y, z, yaw }); }
  loot(x, y, z, tier = 0, tag = 'floor') { this.lootSpots.push({ id: 'l' + this.lootSpots.length, x, y, z, tier, tag }); }
  container(kind, x, y, z, r = 0, tier = 0) {
    const dims = CONTAINER_DIMS[kind] || CONTAINER_DIMS.crate;
    const [w, d] = (r % 2 === 0) ? [dims.w, dims.d] : [dims.d, dims.w];
    const c = { id: 'c' + this.containers.length, kind, x, y, z, r, tier };
    this.containers.push(c);
    this.box(x - w / 2, y, z - d / 2, x + w / 2, y + dims.h, z + d / 2, 'container', 0, { vis: false });
    return c;
  }
  bench(x, y, z, r = 0) {
    const [w, d] = (r % 2 === 0) ? [2.0, 0.9] : [0.9, 2.0];
    const bn = { id: 'b' + this.benches.length, x, y, z, r };
    this.benches.push(bn);
    this.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.95, z + d / 2, 'bench', 0, { vis: false });
    return bn;
  }
  resource(kind, x, y, z) {
    const rn = { id: 'r' + this.resources.length, kind, x, y, z };
    this.resources.push(rn);
    return rn;
  }
  prop(kind, x, y, z, yaw = 0, s = 1, extra = {}) {
    const p = { kind, x, y, z, yaw, s, ...extra };
    this.props.push(p);
    const col = PROP_COLLIDERS[kind];
    if (col) {
      for (const cb of col) {
        // rotate collider offsets by yaw (assume multiples of 90deg or symmetric)
        const q = Math.round(yaw / (Math.PI / 2)) & 3;
        const [ax, az] = rotXZ(cb[0] * s, cb[2] * s, q);
        const [bx, bz] = rotXZ(cb[3] * s, cb[5] * s, q);
        this.box(x + Math.min(ax, bx), y + cb[1] * s, z + Math.min(az, bz), x + Math.max(ax, bx), y + cb[4] * s, z + Math.max(az, bz), 'prop', 0, { vis: false });
      }
    }
    return p;
  }
  // Collides like a cylinder approximated by a box; rendered as a cylinder.
  cylinder(x, y0, z, r, h, m, c, opts = {}) {
    this.cylinders.push({ x, y0, z, r, h, m, c, seg: opts.seg || 12 });
    if (opts.col !== false) {
      const rr = r * 0.85;
      this.box(x - rr, y0, z - rr, x + rr, y0 + h, z + rr, m, c, { vis: false });
    }
  }
  light(x, y, z, color = 0xffe7b0, intensity = 1, range = 10) {
    this.lights.push({ x, y, z, color, intensity, range });
  }

  build(meta) {
    if (!meta.noGround) {
      const s = meta.size;
      this.box(s.minX - 6, -3, s.minZ - 6, s.maxX + 6, 0, s.maxZ + 6, 'ground', 0, { vis: false });
    }
    return {
      ...meta,
      id: this.id,
      boxes: this.boxes,
      doors: this.doors,
      ramps: this.ramps,
      prisms: this.prisms,
      props: this.props,
      cylinders: this.cylinders,
      spawns: this.spawns,
      lootSpots: this.lootSpots,
      containers: this.containers,
      benches: this.benches,
      resources: this.resources,
      lights: this.lights,
      grab: this.grab,
    };
  }
}

export const CONTAINER_DIMS = {
  crate: { w: 1.0, d: 1.0, h: 0.9, name: 'Wooden Crate' },
  locker: { w: 0.8, d: 0.6, h: 1.9, name: 'Locker' },
  cabinet: { w: 1.2, d: 0.55, h: 1.0, name: 'Cabinet' },
  fridge: { w: 0.8, d: 0.75, h: 1.8, name: 'Fridge' },
  toolbox: { w: 1.1, d: 0.6, h: 1.0, name: 'Tool Chest' },
  dumpster: { w: 2.0, d: 1.2, h: 1.3, name: 'Dumpster' },
  safe: { w: 0.8, d: 0.8, h: 1.0, name: 'Safe' },
  chest: { w: 1.1, d: 0.7, h: 0.75, name: 'Chest' },
  ammobox: { w: 1.0, d: 0.6, h: 0.6, name: 'Military Case' },
};

// Collider boxes for props, in local units relative to (x,y,z) before scale: [x0,y0,z0,x1,y1,z1]
export const PROP_COLLIDERS = {
  pine: [[-0.3, 0, -0.3, 0.3, 4, 0.3]],
  snowpine: [[-0.3, 0, -0.3, 0.3, 4, 0.3]],
  dish: [[-0.4, 0, -0.4, 0.4, 3.0, 0.4]],
  tree: [[-0.3, 0, -0.3, 0.3, 3.5, 0.3]],
  deadtree: [[-0.25, 0, -0.25, 0.25, 3.5, 0.25]],
  palm: [[-0.25, 0, -0.25, 0.25, 4, 0.25]],
  cactus: [[-0.35, 0, -0.35, 0.35, 2.6, 0.35]],
  rock: [[-0.9, 0, -0.8, 0.9, 1.1, 0.8]],
  bigrock: [[-2.2, 0, -2, 2.2, 3, 2]],
  car: [[-1.0, 0, -2.1, 1.0, 1.5, 2.1]],
  barrel: [[-0.35, 0, -0.35, 0.35, 1.0, 0.35]],
  crate: [[-0.5, 0, -0.5, 0.5, 1.0, 0.5]],
  pallet: [[-0.6, 0, -0.6, 0.6, 1.2, 0.6]],
  lamp: [[-0.12, 0, -0.12, 0.12, 4.5, 0.12]],
  hay: [[-0.6, 0, -0.9, 0.6, 1.0, 0.9]],
  bench: [[-0.9, 0, -0.3, 0.9, 0.5, 0.3]],
  table: [[-0.8, 0, -0.5, 0.8, 0.8, 0.5]],
  bed: [[-0.9, 0, -1.05, 0.9, 0.6, 1.05]],
  sofa: [[-1.0, 0, -0.45, 1.0, 0.85, 0.45]],
  shelf: [[-1.0, 0, -0.3, 1.0, 2.2, 0.3]],
  rack: [[-2.0, 0, -0.5, 2.0, 3.2, 0.5]],
  counter: [[-1.2, 0, -0.4, 1.2, 1.0, 0.4]],
  snowman: [[-0.5, 0, -0.5, 0.5, 1.7, 0.5]],
  tank: [[-1.4, 0, -1.4, 1.4, 4, 1.4]],
  generator: [[-1.0, 0, -0.7, 1.0, 1.5, 0.7]],
  machine: [[-1.5, 0, -1.0, 1.5, 2.5, 1.0]],
  ac: [[-0.9, 0, -0.7, 0.9, 1.2, 0.7]],
  vending: [[-0.5, 0, -0.4, 0.5, 2.0, 0.4]],
  fountain: [[-2.2, 0, -2.2, 2.2, 0.7, 2.2], [-0.4, 0, -0.4, 0.4, 2.2, 0.4]],
  log: [[-1.5, 0, -0.35, 1.5, 0.7, 0.35]],
  // street furniture, yard and dock props
  forklift: [[-0.6, 0, -0.75, 0.6, 2.4, 1.15]],
  truck: [[-1.25, 0, -3.65, 1.25, 3.2, 3.05]],
  planter: [[-0.8, 0, -0.4, 0.8, 0.62, 0.4]],
  trashcan: [[-0.3, 0, -0.3, 0.3, 1.0, 0.3]],
  hydrant: [[-0.18, 0, -0.18, 0.18, 0.8, 0.18]],
  bollard: [[-0.14, 0, -0.14, 0.14, 0.95, 0.14]],
  cleat: [[-0.35, 0, -0.15, 0.35, 0.55, 0.15]],
  sandbags: [[-1.15, 0, -0.22, 1.15, 0.66, 0.22]],
  cablespool: [[-0.75, 0, -0.65, 0.75, 1.5, 0.65]],
  pipe: [[-2.0, 0, -0.3, 2.0, 0.6, 0.3]],
  umbrella: [[-0.45, 0, -0.45, 0.45, 0.8, 0.45], [-0.05, 0.8, -0.05, 0.05, 2.5, 0.05]],
  billboard: [[-2.55, 0, 0.05, -2.25, 5.5, 0.35], [2.25, 0, 0.05, 2.55, 5.5, 0.35], [-3.2, 3.9, -0.15, 3.2, 6.9, 0.15]],
  picket: [[-1.0, 0, -0.05, 1.0, 1.05, 0.08]],
  chainlink: [[-1.0, 0, -0.06, 1.0, 2.0, 0.06]],
  mailbox: [[-0.13, 0, -0.25, 0.13, 1.3, 0.25]],
  bush: null,
  flowers: null,
  grasstuft: null,
  cone: null,
  sign: [[-0.08, 0, -0.08, 0.08, 2.4, 0.08]],
  watertower: [[-1.32, 0, -1.32, -1.08, 6, -1.08], [1.08, 0, -1.32, 1.32, 6, -1.08], [-1.32, 0, 1.08, -1.08, 6, 1.32], [1.08, 0, 1.08, 1.32, 6, 1.32]],
  antenna: [[-0.5, 0, -0.5, 0.5, 12, 0.5]],
  plant: [[-0.3, 0, -0.3, 0.3, 1.2, 0.3]],
  stool: null,
  tv: null,
  boat: null,
};
