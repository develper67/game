// Procedural low-poly models built from primitives with vertex colors:
// instanced map props, loot pickups, objective items, containers, benches.
// Shapes are chunky with chamfered edges, flat-shaded facets and baked
// vertex shading (darker undersides, per-face color jitter) so they read
// well from first person without textures or extra materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { labelTexture } from './textures.js';

const _c = new THREE.Color();

function colorize(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  _c.convertSRGBToLinear();
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Box with 45deg chamfered edges and corners (44 triangles, flat normals)
const chamferCache = new Map();
function chamferBox(w, h, d, b) {
  const key = [w, h, d, b].map((v) => v.toFixed(3)).join(',');
  if (chamferCache.has(key)) return chamferCache.get(key).clone();
  const H = [w / 2, h / 2, d / 2];
  b = Math.min(b, H[0] * 0.9, H[1] * 0.9, H[2] * 0.9);
  const tris = [];
  const P = (i, s, j, sj, k, sk, inI, inJ, inK) => { const p = [0, 0, 0]; p[i] = s * (H[i] - inI); p[j] = sj * (H[j] - inJ); p[k] = sk * (H[k] - inK); return p; };
  // faces
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => P(i, s, j, a, k, c, 0, b, b));
    tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
  }
  // edges
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const si of [-1, 1]) for (const sj of [-1, 1]) {
      const a0 = P(i, si, j, sj, k, -1, 0, b, b), a1 = P(i, si, j, sj, k, 1, 0, b, b);
      const b0 = P(i, si, j, sj, k, -1, b, 0, b), b1 = P(i, si, j, sj, k, 1, b, 0, b);
      tris.push([a0, a1, b1], [a0, b1, b0]);
    }
  }
  // corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    tris.push([[sx * H[0], sy * (H[1] - b), sz * (H[2] - b)], [sx * (H[0] - b), sy * H[1], sz * (H[2] - b)], [sx * (H[0] - b), sy * (H[1] - b), sz * H[2]]]);
  }
  const pos = [];
  for (const t of tris) {
    const [a, c, e] = t;
    const n = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(new THREE.Vector3(e[0] - a[0], e[1] - a[1], e[2] - a[2]));
    const cen = [(a[0] + c[0] + e[0]) / 3, (a[1] + c[1] + e[1]) / 3, (a[2] + c[2] + e[2]) / 3];
    if (n.x * cen[0] + n.y * cen[1] + n.z * cen[2] < 0) pos.push(...a, ...e, ...c); else pos.push(...a, ...c, ...e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  chamferCache.set(key, g);
  return g.clone();
}

function flatten(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export class MB {
  constructor() { this.geos = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(m);
    colorize(geo, color);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    this.geos.push(geo);
    return this;
  }
  box(w, h, d, x, y, z, color, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  // chamfered box (bev = edge size)
  rbox(w, h, d, x, y, z, color, bev = 0.04, rx = 0, ry = 0, rz = 0) { return this.add(chamferBox(w, h, d, bev), color, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, seg, x, y, z, color, rx, ry, rz) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz); }
  // flat-shaded cylinder (faceted low-poly look)
  fcyl(rt, rb, h, seg, x, y, z, color, rx, ry, rz) { return this.add(flatten(new THREE.CylinderGeometry(rt, rb, h, seg)), color, x, y, z, rx, ry, rz); }
  sphere(r, x, y, z, color, sx = 1, sy = 1, sz = 1, ws = 10, hs = 8) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  ico(r, x, y, z, color, sx = 1, sy = 1, sz = 1, detail = 0) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  // faceted blob (foliage, rocks, clouds of leaves)
  blob(r, x, y, z, color, sx = 1, sy = 1, sz = 1, detail = 1, ry = 0) { return this.add(flatten(new THREE.IcosahedronGeometry(r, detail)), color, x, y, z, 0, ry, 0, sx, sy, sz); }
  cone(r, h, seg, x, y, z, color, rx, ry, rz) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }
  fcone(r, h, seg, x, y, z, color, rx, ry, rz) { return this.add(flatten(new THREE.ConeGeometry(r, h, seg)), color, x, y, z, rx, ry, rz); }
  dodeca(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.DodecahedronGeometry(r, 0), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  torus(r, t, x, y, z, color, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2, rs = 6, ts = 12) { return this.add(new THREE.TorusGeometry(r, t, rs, ts, arc), color, x, y, z, rx, ry, rz); }
  oct(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.OctahedronGeometry(r, 0), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  // multiply colors of everything added since index `from` by a vertical gradient
  grad(from, y0, y1, k0, k1 = 1) {
    for (let i = from; i < this.geos.length; i++) {
      const g = this.geos[i], p = g.attributes.position, c = g.attributes.color;
      for (let v = 0; v < p.count; v++) {
        const t = Math.min(1, Math.max(0, (p.getY(v) - y0) / (y1 - y0)));
        const k = k0 + (k1 - k0) * t;
        c.setXYZ(v, c.getX(v) * k, c.getY(v) * k, c.getZ(v) * k);
      }
    }
    return this;
  }
  get n() { return this.geos.length; }
  // jitter = per-face brightness variation, ao = [y0, y1, k] darkening toward y0
  build({ jitter = 0, ao = null, seed = 1 } = {}) {
    if (!this.geos.length) return new THREE.BufferGeometry();
    for (const g of this.geos) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    const merged = mergeGeometries(this.geos, false);
    const p = merged.attributes.position, c = merged.attributes.color;
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let v = 0; v < p.count; v += 3) {
      let k = jitter ? 1 + (rnd() - 0.5) * 2 * jitter : 1;
      for (let j = 0; j < 3; j++) {
        let kk = k;
        if (ao) kk *= ao[2] + (1 - ao[2]) * Math.min(1, Math.max(0, (p.getY(v + j) - ao[0]) / (ao[1] - ao[0])));
        if (kk !== 1) c.setXYZ(v + j, c.getX(v + j) * kk, c.getY(v + j) * kk, c.getZ(v + j) * kk);
      }
    }
    merged.computeBoundingSphere();
    return merged;
  }
}

// ---------------------------------------------------------------------------
// Prop templates for instancing: kind -> [{geo, basic?, tint?, base?, colorKey?, shadow?}]
// `tint` layers are white-ish and get a per-instance color (base or p[colorKey]).
// ---------------------------------------------------------------------------
const TRUNK = 0x7a4f2a, TRUNK_D = 0x5a3820, LEAF = 0x4fa83d, PINE = 0x2f7a43, W = 0xffffff;
const METAL = 0x8a949c, DARK = 0x2a2f36, WOOD = 0xb07a45, WOOD_D = 0x7e5230;

function layers(...l) { return l; }

function trunk(m, h, r0, r1, c = TRUNK) {
  m.fcyl(r1, r0, h, 7, 0, h / 2, 0, c);
  // root flare
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; m.fcone(r0 * 0.55, r0 * 2.2, 4, Math.cos(a) * r0 * 0.9, r0 * 0.6, Math.sin(a) * r0 * 0.9, TRUNK_D, Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); }
  return m;
}

function pineTiers(m, tiers, y0, r0, h0, col = W) {
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = r0 * (1 - t * 0.62), h = h0 * (1 - t * 0.25), y = y0 + i * h0 * 0.62;
    const from = m.n;
    m.fcone(r, h, 8, 0, y + h / 2, 0, col, 0, i * 0.4, 0);
    m.grad(from, y, y + h * 0.7, 0.62, 1.05);
  }
  return m;
}

const PROP_BUILDERS = {
  pine() {
    const t = trunk(new MB(), 1.7, 0.27, 0.17).build({ jitter: 0.06 });
    const l = pineTiers(new MB(), 4, 1.2, 1.8, 1.9).build({ jitter: 0.07, ao: [1.2, 5.5, 0.75] });
    return layers({ geo: t }, { geo: l, tint: true, base: PINE });
  },
  snowpine() {
    const t = trunk(new MB(), 1.7, 0.27, 0.17).build({ jitter: 0.06 });
    const l = pineTiers(new MB(), 4, 1.2, 1.8, 1.9).build({ jitter: 0.07, ao: [1.2, 5.5, 0.75] });
    const s = new MB();
    for (let i = 0; i < 4; i++) {
      const t2 = i / 4, r = 1.8 * (1 - t2 * 0.62), h = 1.9 * (1 - t2 * 0.25), y = 1.2 + i * 1.9 * 0.62;
      s.fcone(r * 0.62, h * 0.46, 8, 0, y + h * 0.77, 0, W, 0, i * 0.4, 0);
      s.fcone(r * 1.02, 0.12, 8, 0, y + 0.08, 0, 0xeef4fb, 0, i * 0.4, 0);
    }
    return layers({ geo: t }, { geo: l, tint: true, base: 0x2e6650 }, { geo: s.build({ jitter: 0.04 }), tint: true, base: 0xf4f8ff });
  },
  tree() {
    const t = trunk(new MB(), 2.3, 0.3, 0.2);
    t.fcyl(0.07, 0.12, 1.2, 5, 0.42, 2.2, 0.1, TRUNK, 0, 0, -0.75).fcyl(0.06, 0.11, 1.0, 5, -0.36, 2.0, -0.15, TRUNK, 0.3, 0, 0.8);
    const l = new MB()
      .blob(1.55, 0, 3.2, 0, W, 1.05, 0.88, 1.05)
      .blob(1.05, 0.95, 3.75, 0.35, W, 1, 0.9, 1)
      .blob(1.0, -0.85, 3.55, -0.45, W, 1, 0.9, 1)
      .blob(0.95, 0.2, 4.25, -0.5, W, 1, 0.9, 1)
      .blob(0.85, -0.3, 2.75, 0.95, W, 1, 0.85, 1)
      .build({ jitter: 0.08, ao: [2.0, 4.8, 0.62] });
    return layers({ geo: t.build({ jitter: 0.05 }) }, { geo: l, tint: true, base: LEAF });
  },
  birch() {
    const t = new MB().fcyl(0.12, 0.18, 4.2, 6, 0, 2.1, 0, 0xf2efe6);
    for (let i = 0; i < 9; i++) { const a = i * 2.3, y = 0.5 + i * 0.42; t.box(0.1, 0.05, 0.05, Math.cos(a) * 0.15, y, Math.sin(a) * 0.15, 0x2d2a26, 0, -a, 0); }
    const l = new MB()
      .blob(1.0, 0, 4.4, 0, W, 0.95, 1.25, 0.95)
      .blob(0.75, 0.55, 3.7, 0.2, W, 1, 1.1, 1)
      .blob(0.7, -0.5, 3.9, -0.25, W, 1, 1.1, 1)
      .blob(0.6, 0.1, 5.3, 0.2, W)
      .build({ jitter: 0.09, ao: [3.0, 5.6, 0.65] });
    return layers({ geo: t.build({ jitter: 0.04 }) }, { geo: l, tint: true, base: 0x9bcf4e });
  },
  deadtree() {
    const m = new MB().fcyl(0.14, 0.26, 3.3, 6, 0, 1.65, 0, 0x6e5c4c)
      .fcyl(0.05, 0.1, 1.5, 5, 0.5, 2.6, 0, 0x6e5c4c, 0, 0, -0.8).fcyl(0.03, 0.06, 0.6, 4, 0.95, 3.2, 0, 0x6e5c4c, 0, 0, -0.2)
      .fcyl(0.05, 0.09, 1.3, 5, -0.42, 2.2, 0.1, 0x6e5c4c, 0, 0, 0.9).fcyl(0.04, 0.07, 0.9, 5, 0.05, 3.1, -0.35, 0x6e5c4c, -0.6, 0, 0);
    return layers({ geo: m.build({ jitter: 0.07, ao: [0, 2.5, 0.75] }) });
  },
  palm() {
    const t = new MB();
    for (let i = 0; i < 6; i++) t.fcyl(0.16 - i * 0.012, 0.2 - i * 0.012, 0.8, 7, i * i * 0.012, 0.4 + i * 0.78, 0, i % 2 ? 0xa6825a : 0x8f6c46, 0, 0, -0.05 - i * 0.02);
    t.sphere(0.14, 0.5, 4.55, 0.12, 0x6b4a2a).sphere(0.14, 0.28, 4.5, -0.15, 0x6b4a2a).sphere(0.13, 0.38, 4.45, 0.25, 0x5e4126);
    const l = new MB();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = 0.4, cy = 4.75;
      // two-piece drooping frond
      l.box(0.55, 0.05, 1.3, cx + Math.sin(a) * 0.6, cy + 0.1, Math.cos(a) * 0.6, W, -0.25, a, 0);
      l.box(0.42, 0.05, 1.1, cx + Math.sin(a) * 1.6, cy - 0.32, Math.cos(a) * 1.6, 0xd8e8c8, 0.55, a, 0);
    }
    return layers({ geo: t.build({ jitter: 0.05 }) }, { geo: l.build({ jitter: 0.08 }), tint: true, base: 0x4caf50 });
  },
  cactus() {
    const G = 0x4c9a48;
    const m = new MB();
    const arm = (x, y0, h, side) => {
      m.fcyl(0.17, 0.17, 0.5, 8, x * 0.55, y0, 0, G, 0, 0, Math.PI / 2);
      m.fcyl(0.16, 0.17, h, 8, x * 0.85, y0 + h / 2, 0, G);
      m.sphere(0.16, x * 0.85, y0 + h, 0, G, 1, 0.8, 1, 8, 5);
      void side;
    };
    m.fcyl(0.3, 0.34, 2.7, 10, 0, 1.35, 0, G).sphere(0.3, 0, 2.7, 0, G, 1, 0.75, 1, 10, 5);
    arm(1, 1.3, 0.9, 1); arm(-1, 0.95, 0.7, -1);
    m.ico(0.09, 0, 3.0, 0, 0xff6f91).ico(0.07, 0.18, 2.88, 0.1, 0xffd23f);
    // rib stripes
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; m.box(0.03, 2.4, 0.03, Math.cos(a) * 0.31, 1.3, Math.sin(a) * 0.31, 0x3b7f3a); }
    return layers({ geo: m.build({ jitter: 0.06, ao: [0, 1.5, 0.75] }) });
  },
  rock() {
    const m = new MB().add(flatten(new THREE.DodecahedronGeometry(0.9, 0)), W, 0, 0.42, 0, 0.2, 0.4, 0.1, 1.15, 0.68, 1)
      .add(flatten(new THREE.DodecahedronGeometry(0.42, 0)), W, 0.75, 0.2, 0.35, 0.5, 0.2, 0, 1, 0.7, 1);
    return layers({ geo: m.build({ jitter: 0.1, ao: [0, 0.9, 0.7] }), tint: true, base: 0x9a948c });
  },
  bigrock() {
    const m = new MB().add(flatten(new THREE.DodecahedronGeometry(2.2, 0)), W, 0, 1.1, 0, 0.3, 0.2, 0.1, 1.12, 0.72, 1)
      .add(flatten(new THREE.DodecahedronGeometry(1.35, 0)), W, 1.0, 2.2, 0.35, 0.4, 0.8, 0.2, 1, 0.85, 1)
      .add(flatten(new THREE.DodecahedronGeometry(0.8, 0)), W, -1.8, 0.4, 1.2, 0.1, 0.5, 0, 1, 0.7, 1);
    return layers({ geo: m.build({ jitter: 0.1, ao: [0, 2.4, 0.66] }), tint: true, base: 0xa39486 });
  },
  bush() {
    const m = new MB().blob(0.72, 0, 0.5, 0, W, 1.2, 0.85, 1.1).blob(0.52, 0.55, 0.42, 0.25, W, 1, 0.85, 1).blob(0.48, -0.5, 0.4, -0.2, W, 1, 0.85, 1).blob(0.4, 0.1, 0.85, -0.3, W);
    return layers({ geo: m.build({ jitter: 0.09, ao: [0, 1.1, 0.6] }), tint: true, base: 0x4f9f3f });
  },
  flowers() {
    const m = new MB();
    const cols = [0xff4d6d, 0xffd23f, 0xffffff, 0xc77dff, 0xff8c42];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = 0.15 + (i % 3) * 0.13, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.24 + (i % 3) * 0.08;
      m.box(0.025, h, 0.025, x, h / 2, z, 0x3a7d2c).box(0.12, 0.03, 0.05, x + 0.06, h * 0.4, z, 0x4f9a3a, 0, a, 0.4);
      m.box(0.14, 0.05, 0.05, x, h, z, cols[i % 5]).box(0.05, 0.05, 0.14, x, h, z, cols[i % 5]).box(0.05, 0.06, 0.05, x, h + 0.01, z, 0xffe066);
    }
    return layers({ geo: m.build({ jitter: 0.05 }), shadow: false });
  },
  grasstuft() {
    const m = new MB();
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.05 + (i % 3) * 0.07; m.fcone(0.05, 0.42 + (i % 4) * 0.08, 3, Math.cos(a) * r, 0.22, Math.sin(a) * r, i % 2 ? 0x6cbf45 : 0x4f9a35, Math.cos(a) * 0.35, a, Math.sin(a) * 0.35); }
    return layers({ geo: m.build({ ao: [0, 0.45, 0.6] }), shadow: false });
  },
  fern() {
    const m = new MB();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; m.box(0.16, 0.03, 0.75, Math.sin(a) * 0.35, 0.3, Math.cos(a) * 0.35, i % 2 ? 0x5aa83f : 0x4a9535, -0.55, a, 0); }
    return layers({ geo: m.build({ jitter: 0.08, ao: [0, 0.5, 0.6] }), shadow: false });
  },
  mushroom() {
    const m = new MB();
    for (const [x, z, s] of [[0, 0, 1], [0.22, 0.12, 0.7], [-0.15, 0.18, 0.55]]) {
      m.fcyl(0.05 * s, 0.07 * s, 0.22 * s, 6, x, 0.11 * s, z, 0xf2ead8);
      m.sphere(0.16 * s, x, 0.22 * s, z, 0xe84a3c, 1, 0.6, 1, 8, 5);
      m.box(0.04 * s, 0.03 * s, 0.04 * s, x + 0.06 * s, 0.3 * s, z, W).box(0.04 * s, 0.03 * s, 0.04 * s, x - 0.05 * s, 0.29 * s, z + 0.05 * s, W);
    }
    return layers({ geo: m.build({ jitter: 0.04 }), shadow: false });
  },
  stump() {
    const m = new MB().fcyl(0.38, 0.45, 0.55, 9, 0, 0.27, 0, TRUNK).cyl(0.34, 0.34, 0.04, 9, 0, 0.56, 0, 0xd9b27c).torus(0.2, 0.012, 0, 0.585, 0, 0xb08a5a, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i * 1.6; m.fcone(0.15, 0.6, 4, Math.cos(a) * 0.38, 0.12, Math.sin(a) * 0.38, TRUNK_D, Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1); }
    return layers({ geo: m.build({ jitter: 0.06, ao: [0, 0.5, 0.7] }) });
  },
  tumbleweed() {
    const m = new MB();
    for (let i = 0; i < 6; i++) m.torus(0.42 - i * 0.03, 0.025, 0, 0.42, 0, 0xb59a6a, i * 0.55, i * 0.9, 0, Math.PI * 2, 3, 10);
    return layers({ geo: m.build({ jitter: 0.1 }), shadow: false });
  },
  cowskull() {
    const m = new MB().rbox(0.3, 0.16, 0.42, 0, 0.08, 0, 0xf2ead8, 0.05).rbox(0.18, 0.12, 0.2, 0, 0.07, -0.25, 0xe8dfcb, 0.04)
      .box(0.06, 0.05, 0.02, -0.07, 0.12, -0.11, 0x3a3128).box(0.06, 0.05, 0.02, 0.07, 0.12, -0.11, 0x3a3128)
      .fcone(0.05, 0.4, 5, 0.3, 0.16, 0.08, 0xefe6d0, 0, 0, -1.2).fcone(0.05, 0.4, 5, -0.3, 0.16, 0.08, 0xefe6d0, 0, 0, 1.2);
    return layers({ geo: m.build({ jitter: 0.05 }), shadow: false });
  },
  snowpile() {
    const m = new MB().blob(0.7, 0, 0.1, 0, W, 1.3, 0.45, 1).blob(0.45, 0.6, 0.05, 0.2, W, 1, 0.5, 1).blob(0.4, -0.55, 0.05, -0.1, W, 1, 0.5, 1);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 0.4, 0.85] }), tint: true, base: 0xf4f8ff, shadow: false });
  },
  dish() {
    const m = new MB().fcyl(0.15, 0.25, 2.2, 8, 0, 1.1, 0, 0x90a4ae).rbox(0.6, 0.3, 0.6, 0, 0.15, 0, 0x78909c, 0.05)
      .sphere(1.4, 0, 2.6, -0.2, 0xeef2f4, 1, 1, 0.32, 16, 8).torus(1.36, 0.05, 0, 2.6, -0.2, 0xb0bec5, 0, 0, 0, Math.PI * 2, 4, 20)
      .cyl(0.04, 0.04, 1.3, 6, 0, 2.6, -0.85, 0x607d8b, Math.PI / 2, 0, 0).rbox(0.18, 0.18, 0.25, 0, 2.6, -1.5, 0x455a64, 0.03);
    return layers({ geo: m.build({ jitter: 0.03 }) });
  },
  car() {
    const body = new MB()
      .rbox(1.94, 0.62, 4.1, 0, 0.68, 0, W, 0.16)
      .rbox(1.74, 0.6, 2.1, 0, 1.24, 0.25, W, 0.18)
      .rbox(1.97, 0.12, 0.9, 0, 0.94, -1.55, 0xe6e6e6, 0.05)
      .build({ ao: [0.35, 1.4, 0.72] });
    const g = 0x24313f, tire = 0x1b1b1f, hub = 0xc9ced3;
    const rest = new MB()
      // windows
      .rbox(1.6, 0.42, 0.06, 0, 1.28, -0.83, g, 0.02, -0.35, 0, 0).rbox(1.6, 0.4, 0.06, 0, 1.28, 1.32, g, 0.02, 0.3, 0, 0)
      .box(0.05, 0.38, 1.75, 0.88, 1.28, 0.25, g).box(0.05, 0.38, 1.75, -0.88, 1.28, 0.25, g)
      .box(0.06, 0.4, 0.06, 0.88, 1.28, 0.25, 0x222222).box(0.06, 0.4, 0.06, -0.88, 1.28, 0.25, 0x222222)
      // bumpers, grille, lights
      .rbox(2.0, 0.22, 0.22, 0, 0.42, -2.04, 0x8d949b, 0.06).rbox(2.0, 0.22, 0.22, 0, 0.42, 2.04, 0x8d949b, 0.06)
      .box(1.0, 0.18, 0.04, 0, 0.7, -2.06, 0x2b2f33)
      .rbox(0.38, 0.16, 0.06, 0.66, 0.74, -2.05, 0xfff3b0, 0.03).rbox(0.38, 0.16, 0.06, -0.66, 0.74, -2.05, 0xfff3b0, 0.03)
      .rbox(0.4, 0.14, 0.06, 0.66, 0.78, 2.05, 0xe0202a, 0.03).rbox(0.4, 0.14, 0.06, -0.66, 0.78, 2.05, 0xe0202a, 0.03)
      .box(0.1, 0.08, 0.16, 0.98, 1.08, -0.65, 0x2b2f33).box(0.1, 0.08, 0.16, -0.98, 1.08, -0.65, 0x2b2f33)
      .box(0.3, 0.04, 0.04, 0.98, 0.8, 0.0, 0x8d949b).box(0.3, 0.04, 0.04, -0.98, 0.8, 0.0, 0x8d949b);
    for (const x of [0.86, -0.86]) for (const z of [1.32, -1.32]) {
      rest.fcyl(0.37, 0.37, 0.3, 12, x, 0.37, z, tire, 0, 0, Math.PI / 2).fcyl(0.2, 0.2, 0.32, 8, x, 0.37, z, hub, 0, 0, Math.PI / 2);
      rest.rbox(0.12, 0.42, 0.9, x * 1.1, 0.62, z, 0x2b2f33, 0.04);
    }
    return layers({ geo: body, tint: true, base: 0x2e86de, colorKey: 'color' }, { geo: rest.build({ jitter: 0.03 }) });
  },
  truck() {
    const cab = new MB().rbox(2.3, 1.4, 1.9, 0, 1.15, -2.55, W, 0.14).rbox(2.2, 0.9, 1.4, 0, 2.2, -2.75, W, 0.16).build({ ao: [0.4, 2.6, 0.75] });
    const g = 0x24313f, tire = 0x1b1b1f;
    const rest = new MB()
      .rbox(2.4, 2.5, 4.4, 0, 1.95, 0.8, 0xf2f2ee, 0.08).box(2.42, 0.35, 4.42, 0, 1.6, 0.8, 0xe4572e)
      .box(2.0, 0.6, 0.06, 0, 2.3, -3.47, g, 0.15).box(0.06, 0.55, 0.9, 1.11, 2.25, -2.75, g).box(0.06, 0.55, 0.9, -1.11, 2.25, -2.75, g)
      .rbox(2.4, 0.3, 0.25, 0, 0.55, -3.55, 0x8d949b, 0.06).box(1.3, 0.4, 0.04, 0, 1.0, -3.52, 0x2b2f33)
      .rbox(0.36, 0.2, 0.06, 0.8, 1.05, -3.52, 0xfff3b0, 0.03).rbox(0.36, 0.2, 0.06, -0.8, 1.05, -3.52, 0xfff3b0, 0.03)
      .box(2.3, 0.3, 6.6, 0, 0.6, -0.3, 0x2b2f33);
    for (const x of [1.0, -1.0]) for (const z of [-2.5, 1.0, 2.2]) rest.fcyl(0.45, 0.45, 0.36, 12, x, 0.45, z, tire, 0, 0, Math.PI / 2).fcyl(0.22, 0.22, 0.38, 8, x, 0.45, z, 0xc9ced3, 0, 0, Math.PI / 2);
    return layers({ geo: cab, tint: true, base: 0x2e86de, colorKey: 'color' }, { geo: rest.build({ jitter: 0.03, ao: [0.3, 3, 0.8] }) });
  },
  forklift() {
    const m = new MB().rbox(1.2, 0.9, 1.8, 0, 0.75, 0.2, 0xf4b400, 0.1).rbox(1.1, 0.25, 0.6, 0, 1.3, 0.75, 0x2b2f33, 0.05)
      .box(0.08, 2.0, 0.08, 0.5, 1.5, 0.6, 0x2b2f33).box(0.08, 2.0, 0.08, -0.5, 1.5, 0.6, 0x2b2f33).box(1.1, 0.08, 1.1, 0, 2.5, 0.15, 0x2b2f33)
      .box(0.08, 2.0, 0.08, 0.5, 1.5, -0.35, 0x2b2f33).box(0.08, 2.0, 0.08, -0.5, 1.5, -0.35, 0x2b2f33)
      .box(0.12, 2.2, 0.12, 0.35, 1.2, -0.8, 0x55595e).box(0.12, 2.2, 0.12, -0.35, 1.2, -0.8, 0x55595e)
      .box(0.14, 0.06, 1.1, 0.25, 0.2, -1.4, 0x9aa0a6).box(0.14, 0.06, 1.1, -0.25, 0.2, -1.4, 0x9aa0a6)
      .rbox(0.5, 0.35, 0.1, 0, 1.4, -0.2, 0x24313f, 0.03);
    for (const [x, z, r] of [[0.6, -0.4, 0.32], [-0.6, -0.4, 0.32], [0.6, 0.85, 0.26], [-0.6, 0.85, 0.26]]) m.fcyl(r, r, 0.25, 10, x, r, z, 0x1b1b1f, 0, 0, Math.PI / 2);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 1.5, 0.8] }) });
  },
  barrel() {
    const m = new MB().cyl(0.35, 0.35, 0.98, 14, 0, 0.49, 0, W)
      .torus(0.352, 0.025, 0, 0.3, 0, 0xd8d8d8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 14).torus(0.352, 0.025, 0, 0.68, 0, 0xd8d8d8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 14)
      .torus(0.33, 0.03, 0, 0.98, 0, 0xc8c8c8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 14)
      .cyl(0.31, 0.31, 0.02, 14, 0, 0.985, 0, 0xb5b5b5).cyl(0.05, 0.05, 0.04, 8, 0.15, 1.0, 0.08, 0x8a8a8a);
    return layers({ geo: m.build({ ao: [0, 1, 0.72] }), tint: true, base: 0x2d6cdf });
  },
  crate() {
    const m = new MB().rbox(0.98, 0.98, 0.98, 0, 0.49, 0, 0xc99a5e, 0.03);
    for (const s of [-1, 1]) {
      m.box(1.01, 0.12, 0.12, 0, 0.06 + 0.43 * (s + 1), 0.45, 0x9c6b3a).box(1.01, 0.12, 0.12, 0, 0.06 + 0.43 * (s + 1), -0.45, 0x9c6b3a);
      m.box(0.12, 0.12, 1.01, 0.45, 0.06 + 0.43 * (s + 1), 0, 0x9c6b3a).box(0.12, 0.12, 1.01, -0.45, 0.06 + 0.43 * (s + 1), 0, 0x9c6b3a);
      m.box(0.12, 1.0, 0.12, 0.45 * s, 0.5, 0.45, 0x9c6b3a).box(0.12, 1.0, 0.12, 0.45 * s, 0.5, -0.45, 0x9c6b3a);
    }
    m.box(0.08, 1.15, 0.03, 0, 0.49, -0.5, 0xa77442, 0, 0, 0.78).box(0.08, 1.15, 0.03, 0, 0.49, 0.5, 0xa77442, 0, 0, -0.78);
    return layers({ geo: m.build({ jitter: 0.05, ao: [0, 1, 0.75] }) });
  },
  pallet() {
    const m = new MB();
    for (let i = 0; i < 5; i++) m.box(0.2, 0.04, 1.2, -0.5 + i * 0.25, 0.13, 0, 0xc8a070);
    for (const z of [-0.5, 0, 0.5]) m.box(1.2, 0.1, 0.12, 0, 0.06, z, 0xa98055);
    m.rbox(0.55, 0.42, 0.55, -0.28, 0.36, -0.28, 0xd8b48a, 0.03).rbox(0.55, 0.42, 0.55, 0.28, 0.36, -0.28, 0xcfa878, 0.03)
      .rbox(0.55, 0.42, 0.55, -0.28, 0.36, 0.28, 0xcfa878, 0.03).rbox(0.55, 0.42, 0.55, 0.28, 0.36, 0.28, 0xd8b48a, 0.03)
      .rbox(0.55, 0.42, 0.55, 0, 0.78, 0, 0xd2ad80, 0.03)
      .box(1.13, 0.06, 0.04, 0, 0.42, -0.565, 0x3a6fd8).box(0.04, 0.06, 1.13, 0.565, 0.42, 0, 0x3a6fd8);
    return layers({ geo: m.build({ jitter: 0.06, ao: [0, 1, 0.75] }) });
  },
  lamp() {
    const pole = new MB().rbox(0.32, 0.3, 0.32, 0, 0.15, 0, 0x3a4250, 0.05).fcyl(0.06, 0.09, 4.3, 8, 0, 2.3, 0, 0x3a4250)
      .fcyl(0.1, 0.1, 0.12, 8, 0, 0.45, 0, 0x2a303a).fcyl(0.035, 0.035, 0.95, 6, 0.42, 4.38, 0, 0x3a4250, 0, 0, Math.PI / 2 - 0.12)
      .rbox(0.5, 0.16, 0.34, 0.85, 4.38, 0, 0x2a303a, 0.05).fcone(0.06, 0.18, 6, 0, 4.5, 0, 0x2a303a)
      .build({ jitter: 0.03 });
    const bulb = new MB().box(0.38, 0.04, 0.24, 0.85, 4.28, 0, 0xfff1b8).build();
    return layers({ geo: pole }, { geo: bulb, basic: true });
  },
  hay() {
    const m = new MB().rbox(1.2, 1.0, 1.8, 0, 0.5, 0, 0xe9c46a, 0.14);
    for (let i = 0; i < 7; i++) m.box(1.21, 0.012, 1.81, 0, 0.12 + i * 0.13, 0, i % 2 ? 0xd6ae4f : 0xf2d27e);
    m.box(1.23, 1.01, 0.05, 0, 0.5, -0.45, 0x8b6b2e).box(1.23, 1.01, 0.05, 0, 0.5, 0.45, 0x8b6b2e);
    return layers({ geo: m.build({ jitter: 0.05, ao: [0, 1, 0.75] }) });
  },
  bench() {
    const m = new MB();
    for (let i = 0; i < 3; i++) m.rbox(1.8, 0.05, 0.13, 0, 0.45, -0.17 + i * 0.15, 0xb5733d, 0.015);
    for (let i = 0; i < 2; i++) m.rbox(1.8, 0.12, 0.04, 0, 0.66 + i * 0.17, 0.25, 0xb5733d, 0.015, -0.2, 0, 0);
    for (const x of [-0.75, 0.75]) m.box(0.07, 0.43, 0.07, x, 0.21, -0.18, 0x2c3a33).box(0.07, 0.85, 0.07, x, 0.42, 0.24, 0x2c3a33, -0.2, 0, 0).box(0.07, 0.05, 0.48, x, 0.4, 0.02, 0x2c3a33);
    return layers({ geo: m.build({ jitter: 0.04 }) });
  },
  table() {
    const m = new MB().rbox(1.6, 0.08, 1.0, 0, 0.76, 0, 0xa8743f, 0.03).box(1.4, 0.1, 0.8, 0, 0.67, 0, 0x7e5230);
    for (const [x, z] of [[0.7, 0.42], [-0.7, 0.42], [0.7, -0.42], [-0.7, -0.42]]) m.rbox(0.08, 0.72, 0.08, x, 0.36, z, 0x6d4c2e, 0.02);
    return layers({ geo: m.build({ jitter: 0.04, ao: [0, 0.75, 0.7] }) });
  },
  bed() {
    const m = new MB().rbox(1.8, 0.32, 2.1, 0, 0.2, 0, 0x7e5230, 0.04).rbox(1.68, 0.22, 1.98, 0, 0.46, 0, 0xf6f3ec, 0.08)
      .rbox(1.74, 0.12, 1.3, 0, 0.57, 0.33, 0x4ca3d9, 0.05).box(1.76, 0.02, 0.2, 0, 0.635, -0.3, 0x3b86bd)
      .rbox(0.62, 0.16, 0.36, -0.42, 0.62, -0.74, W, 0.07).rbox(0.62, 0.16, 0.36, 0.42, 0.62, -0.74, W, 0.07)
      .rbox(1.86, 0.95, 0.1, 0, 0.6, -1.04, 0x6d4c2e, 0.03).rbox(1.86, 0.5, 0.08, 0, 0.36, 1.04, 0x6d4c2e, 0.03);
    return layers({ geo: m.build({ jitter: 0.03 }) });
  },
  sofa() {
    const m = new MB().rbox(2.0, 0.3, 0.9, 0, 0.2, 0, W, 0.06).rbox(0.92, 0.18, 0.72, -0.47, 0.42, -0.06, W, 0.07).rbox(0.92, 0.18, 0.72, 0.47, 0.42, -0.06, W, 0.07)
      .rbox(2.0, 0.55, 0.24, 0, 0.62, 0.34, W, 0.08).rbox(0.24, 0.36, 0.9, 0.9, 0.5, 0, W, 0.08).rbox(0.24, 0.36, 0.9, -0.9, 0.5, 0, W, 0.08)
      .box(0.08, 0.08, 0.08, 0.85, 0.04, 0.35, 0x3a2a1e).box(0.08, 0.08, 0.08, -0.85, 0.04, 0.35, 0x3a2a1e).box(0.08, 0.08, 0.08, 0.85, 0.04, -0.35, 0x3a2a1e).box(0.08, 0.08, 0.08, -0.85, 0.04, -0.35, 0x3a2a1e);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 0.9, 0.72] }), tint: true, base: 0xc0392b });
  },
  shelf() {
    const m = new MB().box(2.0, 2.2, 0.05, 0, 1.1, 0.28, 0x7a5a48).rbox(0.07, 2.2, 0.6, 0.97, 1.1, 0, 0x8d6e63, 0.02).rbox(0.07, 2.2, 0.6, -0.97, 1.1, 0, 0x8d6e63, 0.02);
    for (let i = 0; i < 4; i++) m.rbox(2.0, 0.05, 0.6, 0, 0.1 + i * 0.68, 0, 0xa1887f, 0.015);
    const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c];
    let k = 0;
    for (let row = 0; row < 3; row++) {
      let x = -0.9;
      while (x < 0.85) {
        const w = 0.08 + ((k * 7) % 5) * 0.025, h = 0.3 + ((k * 3) % 4) * 0.06;
        if ((k * 5) % 11 === 3) { m.rbox(0.36, 0.3, 0.32, x + 0.18, 0.28 + row * 0.68, 0, 0xd2ad80, 0.02); x += 0.4; } else { m.box(w, h, 0.32, x + w / 2, 0.13 + row * 0.68 + h / 2, 0, cols[k % cols.length]); x += w + 0.01; }
        k++;
      }
    }
    return layers({ geo: m.build({ jitter: 0.05 }) });
  },
  rack() {
    const m = new MB();
    for (const x of [-1.95, 1.95]) for (const z of [-0.45, 0.45]) m.box(0.1, 3.2, 0.1, x, 1.6, z, 0x2e5aac);
    for (const x of [-1.95, 1.95]) for (let y = 0.4; y < 3; y += 0.55) m.box(0.04, 0.04, 0.9, x, y, 0, 0x2e5aac, 0.5, 0, 0);
    for (const y of [0.15, 1.2, 2.25]) { m.box(4.0, 0.1, 0.1, 0, y, -0.45, 0xff8c00); m.box(4.0, 0.1, 0.1, 0, y, 0.45, 0xff8c00); m.box(4.0, 0.04, 0.95, 0, y + 0.04, 0, 0x9e9e9e); }
    const cols = [0xc49a6c, 0xb5834a, 0xd8b48a];
    for (let i = 0; i < 8; i++) m.rbox(0.8, 0.6 - (i % 3) * 0.08, 0.8, -1.45 + (i % 4) * 0.97, 0.5 + Math.floor(i / 4) * 1.05 - (i % 3) * 0.04, 0, cols[i % 3], 0.03);
    m.rbox(0.9, 0.5, 0.8, -1.0, 2.55, 0, 0x6a8caf, 0.04).rbox(0.7, 0.4, 0.7, 1.2, 2.5, 0, 0xc49a6c, 0.03);
    return layers({ geo: m.build({ jitter: 0.04 }) });
  },
  counter() {
    const m = new MB().rbox(2.4, 0.9, 0.78, 0, 0.45, 0.02, 0xeef1f3, 0.03).box(2.2, 0.7, 0.02, 0, 0.45, -0.38, 0xd5dde3)
      .rbox(2.5, 0.07, 0.86, 0, 0.94, 0, 0x34495e, 0.02).box(2.42, 0.08, 0.7, 0, 0.04, 0.04, 0x2c3e50)
      .rbox(0.36, 0.22, 0.3, 0.7, 1.08, 0.1, 0x2c3e50, 0.03).box(0.3, 0.14, 0.02, 0.7, 1.12, -0.06, 0x5ce1e6, -0.5, 0, 0);
    return layers({ geo: m.build({ jitter: 0.02 }) });
  },
  kitchen() {
    const m = new MB().rbox(2.4, 0.88, 0.7, 0, 0.44, 0.04, 0xf6f2e8, 0.03).rbox(2.5, 0.06, 0.78, 0, 0.91, 0, 0x5d6d7e, 0.02);
    for (const x of [-0.8, 0, 0.8]) m.box(0.74, 0.7, 0.02, x, 0.46, -0.32, 0xe8e1d0).box(0.18, 0.03, 0.03, x, 0.72, -0.34, 0x9aa0a6);
    m.box(0.6, 0.03, 0.45, -0.7, 0.945, 0, 0xc9d3dc).fcyl(0.02, 0.02, 0.25, 6, -0.7, 1.06, 0.22, 0xc9d3dc);
    for (const [x, z] of [[0.55, -0.12], [0.95, -0.12], [0.55, 0.18], [0.95, 0.18]]) m.cyl(0.1, 0.1, 0.02, 10, x, 0.95, z, 0x2b2b2b);
    return layers({ geo: m.build({ jitter: 0.02 }) });
  },
  snowman() {
    const m = new MB().blob(0.5, 0, 0.45, 0, W, 1, 0.92, 1, 2).blob(0.36, 0, 1.08, 0, W, 1, 0.95, 1, 2).blob(0.26, 0, 1.52, 0, W, 1, 1, 1, 2)
      .cone(0.05, 0.32, 6, 0, 1.52, -0.38, 0xff8c00, -Math.PI / 2).sphere(0.04, -0.09, 1.6, -0.23, 0x111111).sphere(0.04, 0.09, 1.6, -0.23, 0x111111)
      .sphere(0.035, 0, 1.18, -0.34, 0x111111).sphere(0.035, 0, 1.0, -0.36, 0x111111)
      .torus(0.24, 0.06, 0, 1.33, 0, 0xd62839, Math.PI / 2).box(0.1, 0.32, 0.04, 0.16, 1.2, -0.24, 0xd62839, 0, 0, 0.3)
      .fcyl(0.17, 0.19, 0.3, 10, 0, 1.86, 0, 0x22252b).fcyl(0.28, 0.28, 0.03, 12, 0, 1.72, 0, 0x22252b)
      .fcyl(0.02, 0.025, 0.7, 4, 0.55, 1.15, 0, 0x6b4a2a, 0, 0, -1.0).fcyl(0.02, 0.025, 0.7, 4, -0.55, 1.15, 0, 0x6b4a2a, 0, 0, 1.0);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 0.6, 0.8] }) });
  },
  tank() {
    const m = new MB().cyl(1.4, 1.4, 3.6, 18, 0, 1.8, 0, W).sphere(1.4, 0, 3.6, 0, W, 1, 0.35, 1, 18, 6)
      .torus(1.41, 0.05, 0, 1.2, 0, 0xb8b8b8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 18).torus(1.41, 0.05, 0, 2.6, 0, 0xb8b8b8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 18)
      .box(0.5, 3.6, 0.04, 0, 1.9, -1.45, 0x6d6d6d).fcyl(0.1, 0.1, 0.4, 8, 0, 4.1, 0, 0x8a8a8a)
      .fcyl(0.12, 0.12, 0.9, 8, 1.4, 0.4, 0, 0x8a8a8a, 0, 0, Math.PI / 2);
    for (let y = 0.3; y < 3.6; y += 0.35) m.box(0.5, 0.04, 0.06, 0, y, -1.5, 0x5d5d5d);
    return layers({ geo: m.build({ ao: [0, 2, 0.75] }), tint: true, base: 0xdcdcdc });
  },
  generator() {
    const m = new MB().rbox(2.0, 1.15, 1.4, 0, 0.72, 0, 0xf1c40f, 0.08).box(2.1, 0.15, 1.5, 0, 0.08, 0, 0x2c3e50)
      .rbox(1.5, 0.28, 1.0, 0, 1.4, 0, 0x2c3e50, 0.05).fcyl(0.08, 0.08, 0.7, 8, 0.6, 1.75, 0.3, 0x555555).fcyl(0.1, 0.1, 0.08, 8, 0.6, 2.1, 0.3, 0x333333)
      .rbox(0.5, 0.4, 0.05, -0.55, 0.8, -0.71, 0x34495e, 0.02).box(0.1, 0.06, 0.03, -0.65, 0.88, -0.74, 0x2ecc71).box(0.1, 0.06, 0.03, -0.45, 0.88, -0.74, 0xe74c3c);
    for (let i = 0; i < 5; i++) m.box(0.06, 0.6, 0.02, 0.2 + i * 0.14, 0.72, -0.71, 0x9a7d0a);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 1.4, 0.75] }) });
  },
  machine() {
    const m = new MB().rbox(3.0, 1.9, 2.0, 0, 1.0, 0, 0x5d6d7e, 0.1).box(3.1, 0.2, 2.1, 0, 0.1, 0, 0x2c3e50)
      .rbox(1.0, 0.6, 0.08, -0.6, 1.35, -1.03, 0x22313f, 0.03).box(0.86, 0.46, 0.02, -0.6, 1.35, -1.08, 0x1abc9c)
      .fcyl(0.12, 0.12, 0.06, 10, 0.55, 1.45, -1.04, 0xe74c3c, Math.PI / 2, 0, 0).fcyl(0.12, 0.12, 0.06, 10, 0.95, 1.45, -1.04, 0xf1c40f, Math.PI / 2, 0, 0)
      .cyl(0.2, 0.2, 2.6, 10, 1.2, 2.05, 0.55, 0x95a5a6, Math.PI / 2, 0, 0).fcyl(0.25, 0.25, 0.9, 10, -1.0, 2.4, 0, 0x7f8c8d)
      .box(3.02, 0.2, 0.2, 0, 1.92, -0.9, 0xf4b400).box(0.6, 0.6, 2.02, 1.0, 0.6, 0, 0x4a5a6a);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 2, 0.75] }) });
  },
  ac() {
    const m = new MB().rbox(1.8, 1.05, 1.4, 0, 0.55, 0, 0xc5ccd1, 0.06).box(1.84, 0.1, 1.44, 0, 0.08, 0, 0x8a949c)
      .cyl(0.5, 0.5, 0.06, 16, 0, 1.08, 0, 0x2c3e50).cyl(0.12, 0.12, 0.08, 8, 0, 1.1, 0, 0x7f8c8d);
    for (let i = 0; i < 4; i++) m.box(0.9, 0.02, 0.1, 0, 1.115, 0, 0x55606a, 0, i * Math.PI / 4, 0);
    for (let i = 0; i < 8; i++) m.box(1.4, 0.03, 0.02, 0, 0.25 + i * 0.09, -0.71, 0x8a949c);
    return layers({ geo: m.build({ jitter: 0.03 }) });
  },
  vending() {
    const m = new MB().rbox(1.0, 2.0, 0.8, 0, 1.0, 0, 0xe74c3c, 0.06).rbox(0.3, 0.7, 0.05, 0.32, 1.1, -0.41, 0x2c3e50, 0.02)
      .box(0.2, 0.08, 0.03, 0.32, 0.6, -0.42, 0x111111).box(0.6, 0.16, 0.06, -0.12, 0.3, -0.41, 0x2c3e50).rbox(1.02, 0.25, 0.82, 0, 1.9, 0, 0xc0392b, 0.05);
    for (let i = 0; i < 6; i++) m.box(0.06, 0.06, 0.02, 0.27 + (i % 2) * 0.1, 1.3 - Math.floor(i / 2) * 0.1, -0.44, 0xecf0f1);
    const glow = new MB().box(0.58, 1.2, 0.04, -0.14, 1.2, -0.41, 0xbff2ff);
    const cols = [0xff6b6b, 0xffd23f, 0x4cd964, 0x5ac8fa];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) glow.box(0.12, 0.18, 0.02, -0.33 + c * 0.19, 0.78 + r * 0.28, -0.44, cols[(r + c) % 4]);
    return layers({ geo: m.build({ jitter: 0.02 }) }, { geo: glow.build(), basic: true });
  },
  fountain() {
    const m = new MB().fcyl(2.25, 2.35, 0.7, 20, 0, 0.35, 0, 0xc9c4ba).torus(2.2, 0.12, 0, 0.7, 0, 0xe0dbd0, Math.PI / 2, 0, 0, Math.PI * 2, 4, 24)
      .fcyl(0.4, 0.55, 2.2, 10, 0, 1.1, 0, 0xc9c4ba).fcyl(1.05, 0.7, 0.32, 14, 0, 2.05, 0, 0xd6d1c6).torus(1.02, 0.06, 0, 2.2, 0, 0xe8e3d8, Math.PI / 2, 0, 0, Math.PI * 2, 4, 16)
      .fcyl(0.15, 0.2, 0.6, 8, 0, 2.5, 0, 0xc9c4ba);
    const w = new MB().cyl(2.05, 2.05, 0.04, 20, 0, 0.62, 0, 0x6ec6ff).cyl(0.92, 0.92, 0.04, 14, 0, 2.18, 0, 0x8fd6ff)
      .sphere(0.22, 0, 2.95, 0, 0xc8f0ff, 1, 1.4, 1).cyl(0.95, 1.6, 1.5, 14, 0, 1.4, 0, 0xbfeaff);
    return layers({ geo: m.build({ jitter: 0.04, ao: [0, 1.5, 0.75] }) }, { geo: w.build(), basic: true });
  },
  log() {
    const m = new MB().fcyl(0.35, 0.35, 3.0, 9, 0, 0.35, 0, 0x7d5230, 0, 0, Math.PI / 2)
      .cyl(0.3, 0.3, 3.02, 9, 0, 0.35, 0, 0xe0b880, 0, 0, Math.PI / 2).torus(0.18, 0.015, 1.515, 0.35, 0, 0xb08a5a, 0, Math.PI / 2, 0).torus(0.18, 0.015, -1.515, 0.35, 0, 0xb08a5a, 0, Math.PI / 2, 0)
      .fcyl(0.05, 0.08, 0.4, 5, 0.6, 0.72, 0.1, 0x7d5230, 0.3, 0, -0.4);
    return layers({ geo: m.build({ jitter: 0.06 }) });
  },
  cone() {
    const m = new MB().rbox(0.5, 0.05, 0.5, 0, 0.025, 0, 0xff6b00, 0.02).cone(0.2, 0.72, 10, 0, 0.41, 0, 0xff6b00)
      .cyl(0.135, 0.158, 0.11, 10, 0, 0.43, 0, W).cyl(0.085, 0.105, 0.08, 10, 0, 0.6, 0, W);
    return layers({ geo: m.build({ ao: [0, 0.7, 0.8] }), shadow: false });
  },
  sign() {
    const m = new MB().fcyl(0.05, 0.06, 2.4, 6, 0, 1.2, 0, 0x8a949c).rbox(1.4, 0.8, 0.07, 0, 2.2, 0, 0x2e9e5b, 0.04)
      .box(1.28, 0.68, 0.075, 0, 2.2, 0, 0x27ae60).box(1.0, 0.08, 0.08, 0, 2.3, 0, W).box(0.7, 0.08, 0.08, -0.15, 2.1, 0, W).fcone(0.08, 0.16, 3, 0.38, 2.1, 0, W, 0, 0, -Math.PI / 2);
    return layers({ geo: m.build({ jitter: 0.02 }) });
  },
  billboard() {
    const m = new MB().box(0.25, 5.5, 0.25, -2.4, 2.75, 0.2, 0x5d6d7e).box(0.25, 5.5, 0.25, 2.4, 2.75, 0.2, 0x5d6d7e)
      .rbox(6.4, 3.0, 0.2, 0, 5.4, 0, 0x2c3e50, 0.05).box(6.0, 2.6, 0.05, 0, 5.4, -0.11, 0xffd23f)
      .box(2.4, 1.6, 0.03, -1.4, 5.4, -0.14, 0xff5e5b).box(2.6, 0.4, 0.03, 1.5, 5.9, -0.14, 0x2c3e50).box(2.0, 0.3, 0.03, 1.2, 5.3, -0.14, 0x2c3e50).box(1.6, 0.3, 0.03, 1.0, 4.8, -0.14, 0xff5e5b)
      .box(6.4, 0.08, 0.6, 0, 3.85, -0.2, 0x5d6d7e);
    return layers({ geo: m.build({ jitter: 0.02 }) });
  },
  watertower() {
    const m = new MB();
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) m.box(0.22, 6, 0.22, x, 3, z, 0x6d4c41);
    for (const y of [2, 4]) { m.box(2.6, 0.1, 0.1, 0, y, -1.2, 0x5d4037).box(2.6, 0.1, 0.1, 0, y, 1.2, 0x5d4037).box(0.1, 0.1, 2.6, -1.2, y, 0, 0x5d4037).box(0.1, 0.1, 2.6, 1.2, y, 0, 0x5d4037); }
    m.box(0.08, 3.6, 0.08, 0, 3, -1.2, 0x5d4037, 0, 0, 0.75).box(0.08, 3.6, 0.08, 0, 3, 1.2, 0x5d4037, 0, 0, -0.75);
    m.rbox(3.2, 0.2, 3.2, 0, 6.05, 0, 0x5d4037, 0.04);
    m.fcyl(2.0, 2.0, 2.6, 14, 0, 7.4, 0, 0x9c7356);
    for (const y of [6.6, 7.4, 8.2]) m.torus(2.01, 0.04, 0, y, 0, 0x4a4a4a, Math.PI / 2, 0, 0, Math.PI * 2, 3, 14);
    m.fcone(2.25, 1.1, 14, 0, 9.25, 0, 0x5d4037).fcyl(0.06, 0.06, 0.4, 6, 0, 9.9, 0, 0x4a4a4a);
    return layers({ geo: m.build({ jitter: 0.05, ao: [0, 6, 0.7] }) });
  },
  antenna() {
    const m = new MB();
    for (let i = 0; i < 6; i++) {
      const y = i * 2, w = 0.45 - i * 0.04;
      for (const [x, z] of [[-w, -w], [w, -w], [-w, w], [w, w]]) m.box(0.07, 2.02, 0.07, x, y + 1, z, i % 2 ? 0xffffff : 0xe74c3c);
      m.box(w * 2, 0.05, 0.05, 0, y + 1, -w, 0x95a5a6, 0, 0, 0.8).box(w * 2, 0.05, 0.05, 0, y + 1, w, 0x95a5a6, 0, 0, -0.8);
      m.box(0.05, 0.05, w * 2, -w, y + 1, 0, 0x95a5a6, 0.8, 0, 0).box(0.05, 0.05, w * 2, w, y + 1, 0, 0x95a5a6, -0.8, 0, 0);
    }
    return layers({ geo: m.build() }, { geo: new MB().sphere(0.16, 0, 12.1, 0, 0xff2020).build(), basic: true });
  },
  plant() {
    const m = new MB().fcyl(0.26, 0.19, 0.42, 10, 0, 0.21, 0, 0xc4693a).torus(0.26, 0.04, 0, 0.42, 0, 0xd27a48, Math.PI / 2, 0, 0, Math.PI * 2, 4, 10).cyl(0.23, 0.23, 0.02, 10, 0, 0.4, 0, 0x4a3324);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; m.blob(0.16, Math.cos(a) * 0.17, 0.72 + (i % 2) * 0.12, Math.sin(a) * 0.17, i % 2 ? 0x3f9a3a : 0x52b04a, 0.8, 1.8, 0.8, 0); }
    m.blob(0.2, 0, 0.98, 0, 0x4aa844, 0.9, 1.5, 0.9, 0);
    return layers({ geo: m.build({ jitter: 0.06 }) });
  },
  planter() {
    const m = new MB().rbox(1.6, 0.6, 0.8, 0, 0.3, 0, 0xb9b2a6, 0.05).box(1.45, 0.04, 0.65, 0, 0.6, 0, 0x4a3324)
      .blob(0.42, -0.4, 0.82, 0, 0x4f9f3f, 1.2, 0.8, 1).blob(0.4, 0.35, 0.8, 0.05, 0x5aa846, 1.2, 0.8, 1).blob(0.25, 0, 0.95, -0.1, 0x63b34d);
    for (const [x, c] of [[-0.55, 0xff4d6d], [0.1, 0xffd23f], [0.6, 0xffffff]]) m.box(0.1, 0.06, 0.1, x, 1.0, -0.2, c);
    return layers({ geo: m.build({ jitter: 0.06 }) });
  },
  umbrella() {
    const m = new MB().fcyl(0.45, 0.45, 0.05, 12, 0, 0.75, 0, W).fcyl(0.04, 0.06, 0.72, 6, 0, 0.37, 0, 0x6d6d6d).fcyl(0.25, 0.3, 0.04, 10, 0, 0.02, 0, 0x6d6d6d)
      .fcyl(0.025, 0.025, 2.3, 6, 0, 1.4, 0, 0xdedede);
    const top = new MB();
    for (let i = 0; i < 8; i++) top.add(flatten(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4)), i % 2 ? 0xff5e5b : W, 0, 2.45, 0);
    for (const a of [0, 2.1, 4.2]) m.rbox(0.36, 0.05, 0.36, Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8, 0x8d6e63, 0.02).box(0.04, 0.45, 0.04, Math.cos(a) * 0.8, 0.22, Math.sin(a) * 0.8, 0x6d6d6d);
    return layers({ geo: m.build({ jitter: 0.03 }) }, { geo: top.build({ jitter: 0.04 }) });
  },
  hydrant() {
    const m = new MB().fcyl(0.15, 0.17, 0.62, 10, 0, 0.31, 0, 0xe03131).sphere(0.16, 0, 0.64, 0, 0xe03131, 1, 0.8, 1, 10, 6).fcyl(0.04, 0.05, 0.08, 6, 0, 0.78, 0, 0xc92a2a)
      .fcyl(0.06, 0.06, 0.38, 8, 0, 0.45, 0, 0xf1f3f5, 0, 0, Math.PI / 2).fcyl(0.07, 0.07, 0.1, 8, 0, 0.42, -0.17, 0xf1f3f5, Math.PI / 2, 0, 0)
      .fcyl(0.2, 0.22, 0.06, 10, 0, 0.03, 0, 0xc92a2a);
    return layers({ geo: m.build({ ao: [0, 0.6, 0.8] }), shadow: false });
  },
  trashcan() {
    const m = new MB().fcyl(0.3, 0.26, 0.9, 12, 0, 0.45, 0, 0x2f7d4f).torus(0.3, 0.03, 0, 0.9, 0, 0x256b42, Math.PI / 2, 0, 0, Math.PI * 2, 4, 12)
      .sphere(0.3, 0, 0.92, 0, 0x2f7d4f, 1, 0.35, 1, 12, 4).box(0.24, 0.04, 0.04, 0, 1.03, 0, 0x1d4f32)
      .box(0.18, 0.18, 0.01, 0, 0.55, -0.29, W);
    return layers({ geo: m.build({ ao: [0, 0.9, 0.75] }) });
  },
  mailbox() {
    const m = new MB().fcyl(0.04, 0.04, 1.0, 6, 0, 0.5, 0, 0x6d4c41).rbox(0.24, 0.24, 0.48, 0, 1.12, 0, 0x2f6fd6, 0.06).box(0.03, 0.18, 0.03, 0.14, 1.25, 0.1, 0xe03131);
    return layers({ geo: m.build({ jitter: 0.03 }), shadow: false });
  },
  bollard() {
    const m = new MB().fcyl(0.12, 0.13, 0.9, 10, 0, 0.45, 0, 0xf4b400).box(0.25, 0.08, 0.25, 0, 0.6, 0, 0x2b2f33).sphere(0.12, 0, 0.9, 0, 0xf4b400, 1, 0.5, 1, 10, 4);
    return layers({ geo: m.build({ ao: [0, 0.9, 0.8] }), shadow: false });
  },
  cleat() {
    const m = new MB().fcyl(0.22, 0.28, 0.5, 10, 0, 0.25, 0, 0x2b2f33).sphere(0.27, 0, 0.5, 0, 0x2b2f33, 1, 0.55, 1, 10, 4).box(0.7, 0.1, 0.12, 0, 0.42, 0, 0x2b2f33);
    return layers({ geo: m.build({ ao: [0, 0.5, 0.8] }) });
  },
  buoy() {
    const m = new MB().fcyl(0.35, 0.45, 0.7, 10, 0, 0.35, 0, 0xe8590c).box(0.06, 0.8, 0.06, 0, 1.0, 0, 0x343a40).box(0.4, 0.06, 0.06, 0, 1.3, 0, 0x343a40)
      .torus(0.44, 0.06, 0, 0.35, 0, W, Math.PI / 2, 0, 0, Math.PI * 2, 4, 10);
    return layers({ geo: m.build() }, { geo: new MB().sphere(0.08, 0, 1.45, 0, 0xffe066).build(), basic: true });
  },
  boat() {
    const hull = new MB().rbox(1.6, 0.5, 4.0, 0, 0.45, 0, W, 0.18).fcone(0.8, 1.0, 4, 0, 0.45, -2.3, W, -Math.PI / 2, Math.PI / 4, 0);
    const rest = new MB().box(1.3, 0.08, 3.6, 0, 0.62, 0.1, 0xb08055).box(1.4, 0.1, 0.25, 0, 0.75, 0.4, 0x8d6e63).box(1.4, 0.1, 0.25, 0, 0.75, -0.8, 0x8d6e63)
      .box(1.62, 0.08, 4.02, 0, 0.25, 0, 0xf1f3f5).fcyl(0.03, 0.03, 1.8, 5, 0.5, 0.95, 1.0, 0x8d6e63, 0.9, 0, 0.2);
    return layers({ geo: hull.build({ ao: [0, 0.7, 0.7] }), tint: true, base: 0x2b8a9e, colorKey: 'color' }, { geo: rest.build({ jitter: 0.04 }) });
  },
  tires() {
    const m = new MB();
    for (let i = 0; i < 3; i++) m.torus(0.36, 0.14, (i % 2) * 0.05, 0.14 + i * 0.27, 0, 0x1f2124, Math.PI / 2, 0, 0, Math.PI * 2, 6, 14);
    m.torus(0.36, 0.14, 0.55, 0.36, 0.45, 0x26282c, 0, 0.6, 0, Math.PI * 2, 6, 14);
    return layers({ geo: m.build({ jitter: 0.04 }) });
  },
  sandbags() {
    const m = new MB();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - (r % 2); i++) m.rbox(0.55, 0.22, 0.4, -0.85 + i * 0.57 + (r % 2) * 0.28, 0.11 + r * 0.21, 0, 0xc8b48a, 0.09);
    return layers({ geo: m.build({ jitter: 0.08, ao: [0, 0.7, 0.75] }) });
  },
  cablespool() {
    const m = new MB().fcyl(0.75, 0.75, 0.1, 14, 0, 0.75, -0.55, 0xb08055, Math.PI / 2, 0, 0).fcyl(0.75, 0.75, 0.1, 14, 0, 0.75, 0.55, 0xb08055, Math.PI / 2, 0, 0)
      .fcyl(0.5, 0.5, 1.0, 14, 0, 0.75, 0, 0x2b2f33, Math.PI / 2, 0, 0).fcyl(0.15, 0.15, 1.25, 8, 0, 0.75, 0, 0x8d6e63, Math.PI / 2, 0, 0);
    return layers({ geo: m.build({ jitter: 0.05 }) });
  },
  pipe() {
    const m = new MB().cyl(0.25, 0.25, 4.0, 12, 0, 0.3, 0, 0x95a5a6, 0, 0, Math.PI / 2)
      .fcyl(0.3, 0.3, 0.1, 12, 1.9, 0.3, 0, 0x7f8c8d, 0, 0, Math.PI / 2).fcyl(0.3, 0.3, 0.1, 12, -1.9, 0.3, 0, 0x7f8c8d, 0, 0, Math.PI / 2)
      .box(0.15, 0.1, 0.5, 1.2, 0.05, 0, 0x5d6d7e).box(0.15, 0.1, 0.5, -1.2, 0.05, 0, 0x5d6d7e);
    return layers({ geo: m.build({ ao: [0, 0.6, 0.75] }) });
  },
  picket() {
    const m = new MB().box(2.0, 0.08, 0.04, 0, 0.3, 0, W).box(2.0, 0.08, 0.04, 0, 0.75, 0, W);
    for (let i = 0; i < 9; i++) m.box(0.1, 0.95, 0.03, -0.92 + i * 0.23, 0.475, 0.03, W).fcone(0.07, 0.1, 4, -0.92 + i * 0.23, 1.0, 0.03, W, 0, Math.PI / 4, 0);
    return layers({ geo: m.build({ jitter: 0.03, ao: [0, 1, 0.75] }), tint: true, base: 0xf8f6f0, colorKey: 'color', shadow: false });
  },
  chainlink() {
    const m = new MB().fcyl(0.04, 0.04, 2.0, 6, -1, 1.0, 0, 0x9aa0a6).fcyl(0.04, 0.04, 2.0, 6, 1, 1.0, 0, 0x9aa0a6).fcyl(0.03, 0.03, 2.0, 6, 0, 1.95, 0, 0x9aa0a6, 0, 0, Math.PI / 2);
    for (let i = 0; i < 11; i++) { m.box(0.012, 1.95, 0.012, -1 + i * 0.2, 0.98, 0, 0xb8bec4, 0, 0, 0.5).box(0.012, 1.95, 0.012, -1 + i * 0.2, 0.98, 0, 0xb8bec4, 0, 0, -0.5); }
    return layers({ geo: m.build(), shadow: false });
  },
  rug() {
    const m = new MB().box(2.4, 0.02, 1.6, 0, 0.01, 0, W).box(2.1, 0.022, 1.3, 0, 0.012, 0, 0xf2e6c8).box(1.8, 0.024, 1.0, 0, 0.014, 0, W)
      .box(0.5, 0.026, 0.5, 0, 0.016, 0, 0xf2e6c8, 0, Math.PI / 4, 0);
    return layers({ geo: m.build(), tint: true, base: 0xb83b5e, colorKey: 'color', shadow: false });
  },
  chair() {
    const m = new MB().rbox(0.46, 0.06, 0.46, 0, 0.46, 0, 0xa8743f, 0.02).rbox(0.46, 0.5, 0.05, 0, 0.74, 0.21, 0x9a6a3a, 0.02);
    for (const [x, z] of [[0.19, 0.19], [-0.19, 0.19], [0.19, -0.19], [-0.19, -0.19]]) m.box(0.05, 0.45, 0.05, x, 0.225, z, 0x6d4c2e);
    return layers({ geo: m.build({ jitter: 0.04 }) });
  },
  stool() {
    const m = new MB().fcyl(0.2, 0.2, 0.06, 10, 0, 0.72, 0, 0xd62839).fcyl(0.03, 0.03, 0.7, 6, 0, 0.36, 0, 0xb0b7bd).fcyl(0.18, 0.2, 0.03, 10, 0, 0.015, 0, 0xb0b7bd)
      .torus(0.14, 0.015, 0, 0.3, 0, 0xb0b7bd, Math.PI / 2);
    return layers({ geo: m.build(), shadow: false });
  },
  desk() {
    const m = new MB().rbox(1.6, 0.06, 0.8, 0, 0.74, 0, 0xd9cbb3, 0.02).rbox(0.45, 0.7, 0.75, 0.55, 0.36, 0, 0x8a949c, 0.02)
      .box(0.05, 0.7, 0.7, -0.75, 0.36, 0, 0x8a949c).box(0.4, 0.02, 0.02, 0.55, 0.5, -0.38, 0x2b2f33).box(0.4, 0.02, 0.02, 0.55, 0.25, -0.38, 0x2b2f33)
      .rbox(0.6, 0.38, 0.04, -0.15, 1.0, 0.2, 0x22252b, 0.02).box(0.54, 0.32, 0.01, -0.15, 1.0, 0.177, 0x5ac8fa).box(0.06, 0.18, 0.06, -0.15, 0.82, 0.22, 0x22252b)
      .rbox(0.45, 0.03, 0.16, -0.15, 0.78, -0.12, 0x2b2f33, 0.01);
    return layers({ geo: m.build({ jitter: 0.03 }) });
  },
  tv() {
    const m = new MB().rbox(1.4, 0.45, 0.45, 0, 0.225, 0, 0x5d4037, 0.03).rbox(1.3, 0.75, 0.06, 0, 0.9, 0.05, 0x1b1d22, 0.02).box(0.2, 0.08, 0.15, 0, 0.5, 0.05, 0x1b1d22);
    const scr = new MB().box(1.2, 0.66, 0.01, 0, 0.9, 0.015, 0x6fb7e8);
    return layers({ geo: m.build({ jitter: 0.02 }) }, { geo: scr.build(), basic: true, shadow: false });
  },
  lampfloor() {
    const m = new MB().fcyl(0.18, 0.2, 0.04, 10, 0, 0.02, 0, 0x2b2f33).fcyl(0.02, 0.02, 1.5, 6, 0, 0.77, 0, 0x2b2f33);
    const shade = new MB().fcyl(0.16, 0.26, 0.3, 10, 0, 1.6, 0, 0xfff1c7);
    return layers({ geo: m.build() }, { geo: shade.build(), basic: true, shadow: false });
  },
  painting() {
    const m = new MB().rbox(1.0, 0.75, 0.05, 0, 0, 0, 0xc49a3a, 0.02).box(0.86, 0.6, 0.02, 0, 0, -0.02, 0x8fd0f0)
      .box(0.86, 0.22, 0.021, 0, -0.19, -0.022, 0x5aa846).ico(0.08, 0.25, 0.15, -0.03, 0xffe066).box(0.3, 0.25, 0.021, -0.2, -0.05, -0.023, 0x4a7f3a, 0, 0, Math.PI / 4);
    return layers({ geo: m.build(), shadow: false });
  },
};

// Contact-shadow blob radius (meters at scale 1) per prop kind; 0 = none
const BLOB = {
  pine: 1.7, snowpine: 1.7, tree: 1.9, birch: 1.2, deadtree: 0.9, palm: 1.6, cactus: 0.8, rock: 1.1, bigrock: 2.6, bush: 1.0, stump: 0.6, fern: 0.5,
  car: 2.2, truck: 3.4, forklift: 1.3, barrel: 0.5, crate: 0.75, pallet: 0.85, lamp: 0.4, hay: 1.1, bench: 1.0, table: 1.0, bed: 1.3, sofa: 1.2,
  shelf: 1.1, rack: 2.2, counter: 1.3, kitchen: 1.3, snowman: 0.6, tank: 1.7, generator: 1.3, machine: 1.9, ac: 1.1, vending: 0.7, fountain: 2.6,
  log: 1.4, cone: 0.3, sign: 0.3, watertower: 2.4, antenna: 0.8, plant: 0.4, planter: 0.9, umbrella: 1.0, hydrant: 0.3, trashcan: 0.4,
  mailbox: 0.2, bollard: 0.2, cleat: 0.35, tires: 0.6, sandbags: 1.1, cablespool: 0.9, pipe: 1.0, chair: 0.35, stool: 0.25, desk: 0.9, tv: 0.8,
  lampfloor: 0.25, dish: 1.0, billboard: 1.2,
};
export function propBlob(kind) { return BLOB[kind] || 0; }
export const PROP_KINDS = Object.keys(PROP_BUILDERS);

const templateCache = new Map();
export function propTemplate(kind) {
  if (!templateCache.has(kind)) {
    const b = PROP_BUILDERS[kind];
    templateCache.set(kind, b ? b() : null);
  }
  return templateCache.get(kind);
}

// Weapons live in weapons.js (re-exported for existing imports).
export { weaponModel, skinMaterials, MUZZLE } from './weapons.js';
import { weaponModel } from './weapons.js';

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const lambertVC = () => new THREE.MeshLambertMaterial({ vertexColors: true });
let _vcMat = null;
export function vcMaterial() { if (!_vcMat) _vcMat = lambertVC(); return _vcMat; }
let _vcBasic = null;
export function vcBasicMaterial() { if (!_vcBasic) _vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true }); return _vcBasic; }
let _vcShiny = null;
function vcShiny() { if (!_vcShiny) _vcShiny = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, specular: 0x333333 }); return _vcShiny; }

const itemGeoCache = new Map();
function itemGeo(key, fn) {
  if (!itemGeoCache.has(key)) itemGeoCache.set(key, fn());
  return itemGeoCache.get(key);
}

// ---------------------------------------------------------------------------
// Doors (one mesh per door: panelled leaf, frame-side hinges, knobs both sides)
// Spans x 0..len, y 0..height, z +-0.035 in the pivot's frame.
// ---------------------------------------------------------------------------
export function doorModel(len, height, color) {
  const key = `door:${len.toFixed(2)}:${height.toFixed(2)}:${color}`;
  const geo = itemGeo(key, () => {
    const m = new MB().rbox(len, height, 0.07, len / 2, height / 2, 0, color, 0.015);
    _c.set(color);
    const dark = _c.clone().multiplyScalar(0.8).getHex(), light = _c.clone().lerp(new THREE.Color(0xffffff), 0.12).getHex();
    const pw = len - 0.3;
    for (const zs of [-1, 1]) {
      for (const [y0, y1] of [[0.12, 0.47], [0.53, 0.92]]) {
        const ph = (y1 - y0) * height;
        m.box(pw, ph, 0.012, len / 2, (y0 + y1) / 2 * height, zs * 0.038, dark);
        m.rbox(pw - 0.1, ph - 0.1, 0.02, len / 2, (y0 + y1) / 2 * height, zs * 0.042, light, 0.008);
      }
      m.sphere(0.055, len - 0.13, height * 0.47, zs * 0.085, 0xd4af37, 1, 1, 0.8, 8, 6).fcyl(0.035, 0.035, 0.05, 6, len - 0.13, height * 0.47, zs * 0.05, 0xb8952e, Math.PI / 2, 0, 0);
    }
    for (const y of [0.18, 0.82]) m.box(0.04, 0.16, 0.09, 0.02, y * height, 0, 0x6b6b6b);
    return m.build({ jitter: 0.02 });
  });
  return new THREE.Mesh(geo, vcMaterial());
}

// Glowing bulbs / flames for map lights, merged into one mesh
export function lightModel(lights) {
  const m = new MB();
  for (const l of lights) {
    _c.set(l.color);
    const warm = _c.r > _c.b * 1.6;
    if (warm) {
      // little campfire flame: logs + layered flame cones
      m.fcyl(0.05, 0.05, 0.5, 5, l.x, l.y - 0.55, l.z, 0x5d3a1e, 0, 0.6, Math.PI / 2).fcyl(0.05, 0.05, 0.5, 5, l.x, l.y - 0.55, l.z, 0x4a2d16, 0, -0.6, Math.PI / 2);
      m.fcone(0.2, 0.5, 6, l.x, l.y - 0.32, l.z, 0xff6a1a).fcone(0.13, 0.4, 6, l.x + 0.03, l.y - 0.3, l.z, 0xffb02e).fcone(0.07, 0.28, 5, l.x, l.y - 0.3, l.z + 0.02, 0xfff1a8);
    } else {
      m.sphere(0.16, l.x, l.y, l.z, l.color, 1, 1, 1, 8, 6);
    }
  }
  const mesh = new THREE.Mesh(m.build(), vcBasicMaterial());
  mesh.name = 'lights';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Items: loot pickups, objective props
// ---------------------------------------------------------------------------
const AMMO_COLORS = { light: 0xffd166, shells: 0xef476f, rifle: 0x06d6a0, heavy: 0x118ab2, cells: 0xc77dff };
const MAT_BUILD = {
  wood: () => new MB().fcyl(0.08, 0.08, 0.5, 7, -0.1, 0.08, 0, 0xa0693a, 0, 0, Math.PI / 2).fcyl(0.08, 0.08, 0.5, 7, 0.08, 0.08, 0.06, 0xb07a45, 0, 0, Math.PI / 2)
    .fcyl(0.08, 0.08, 0.5, 7, 0, 0.22, 0.03, 0x8b5a2b, 0, 0, Math.PI / 2).cyl(0.065, 0.065, 0.505, 7, 0, 0.22, 0.03, 0xe0b880, 0, 0, Math.PI / 2)
    .box(0.03, 0.3, 0.02, 0.18, 0.15, 0.12, 0xd62839).build({ jitter: 0.05 }),
  scrap: () => new MB().rbox(0.32, 0.05, 0.26, 0, 0.05, 0, 0xa7b1bb, 0.01, 0.2, 0.3, 0).rbox(0.22, 0.05, 0.3, 0.05, 0.12, 0.02, 0x7f8c8d, 0.01, -0.3, 0.8, 0.1)
    .fcyl(0.04, 0.04, 0.35, 6, -0.05, 0.18, 0, 0xc9d1d8, 0.4, 0, 1.2).torus(0.07, 0.025, 0.1, 0.2, -0.06, 0xb87333, 0.5, 0, 0).build({ jitter: 0.06 }),
  cloth: () => new MB().rbox(0.36, 0.08, 0.28, 0, 0.05, 0, 0xf4f1de, 0.03).rbox(0.34, 0.08, 0.26, 0, 0.13, 0, 0xe07a5f, 0.03).rbox(0.32, 0.08, 0.24, 0, 0.21, 0, 0x81b29a, 0.03)
    .box(0.04, 0.26, 0.3, 0.1, 0.13, 0, 0xc49a3a).build({ jitter: 0.03 }),
  parts: () => {
    const m = new MB().torus(0.13, 0.045, 0, 0.14, 0, 0xe09f3e, Math.PI / 2.5, 0, 0, Math.PI * 2, 4, 10);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; m.box(0.05, 0.05, 0.05, Math.cos(a) * 0.18, 0.14 + Math.sin(a) * 0.18 * Math.cos(Math.PI / 2.5), Math.sin(a) * 0.18 * Math.sin(Math.PI / 2.5) * -1, 0xe09f3e, Math.PI / 2.5, 0, a); }
    return m.fcyl(0.04, 0.04, 0.3, 6, 0.14, 0.08, 0.1, 0xb0bec5, 0, 0, 1.2).rbox(0.1, 0.1, 0.1, -0.14, 0.06, 0.12, 0x6d7a86, 0.02).build({ jitter: 0.04 });
  },
  electronics: () => new MB().rbox(0.34, 0.03, 0.24, 0, 0.05, 0, 0x2e7d32, 0.008).box(0.08, 0.04, 0.08, -0.06, 0.085, 0, 0x222222).box(0.06, 0.06, 0.04, 0.08, 0.09, 0.05, 0xffd23f)
    .fcyl(0.02, 0.02, 0.08, 6, 0.1, 0.1, -0.06, 0x2ec4b6).box(0.2, 0.012, 0.012, 0, 0.068, -0.08, 0xd4af37).box(0.012, 0.012, 0.16, -0.12, 0.068, 0, 0xd4af37).build(),
  gunpowder: () => new MB().fcyl(0.13, 0.15, 0.3, 10, 0, 0.15, 0, 0x3d405b).fcyl(0.06, 0.06, 0.06, 8, 0, 0.33, 0, 0xc0c0c0).box(0.18, 0.1, 0.01, 0, 0.18, -0.145, 0xffd23f)
    .box(0.03, 0.03, 0.012, 0, 0.18, -0.152, 0x111111).build(),
  rare: () => new MB().oct(0.18, 0, 0.25, 0, 0xc77dff, 0.8, 1.4, 0.8).oct(0.1, 0.13, 0.12, 0.05, 0xe0aaff, 0.8, 1.4, 0.8).oct(0.08, -0.12, 0.1, -0.04, 0xa45cf0, 0.8, 1.4, 0.8).build(),
};
const HEAL_BUILD = {
  bandage: () => new MB().fcyl(0.1, 0.1, 0.16, 12, 0, 0.1, 0, 0xffffff, 0, 0, Math.PI / 2).fcyl(0.04, 0.04, 0.17, 8, 0, 0.1, 0, 0xe8d8c0, 0, 0, Math.PI / 2)
    .box(0.17, 0.02, 0.1, 0.0, 0.01, -0.12, 0xf4f1ea).box(0.02, 0.06, 0.06, 0.081, 0.15, 0, 0xe63946).box(0.02, 0.02, 0.06, 0.082, 0.15, 0, 0xffffff).build(),
  medkit: () => new MB().rbox(0.4, 0.26, 0.28, 0, 0.13, 0, 0xffffff, 0.04).box(0.07, 0.18, 0.29, 0, 0.13, 0, 0xe63946).box(0.18, 0.07, 0.29, 0, 0.13, 0, 0xe63946)
    .box(0.07, 0.07, 0.01, 0, 0.13, 0.146, 0xe63946).rbox(0.16, 0.04, 0.05, 0, 0.28, 0, 0x555555, 0.015).box(0.41, 0.03, 0.29, 0, 0.21, 0, 0xe9ecef).build(),
};
const ARMOR_BUILD = {
  vest: () => new MB().rbox(0.42, 0.5, 0.16, 0, 0.3, 0, 0x6b705c, 0.05).rbox(0.12, 0.14, 0.17, -0.13, 0.52, 0, 0x6b705c, 0.03).rbox(0.12, 0.14, 0.17, 0.13, 0.52, 0, 0x6b705c, 0.03)
    .box(0.44, 0.06, 0.17, 0, 0.12, 0, 0x3f4238).rbox(0.14, 0.1, 0.03, -0.1, 0.3, -0.09, 0x565a4a, 0.01).rbox(0.14, 0.1, 0.03, 0.1, 0.3, -0.09, 0x565a4a, 0.01).build({ jitter: 0.03 }),
  plate: () => new MB().rbox(0.44, 0.52, 0.18, 0, 0.31, 0, 0x5c677d, 0.05).rbox(0.36, 0.36, 0.05, 0, 0.32, -0.1, 0xb0bec5, 0.03).rbox(0.12, 0.12, 0.18, -0.14, 0.53, 0, 0x5c677d, 0.03)
    .rbox(0.12, 0.12, 0.18, 0.14, 0.53, 0, 0x5c677d, 0.03).box(0.18, 0.04, 0.01, 0, 0.42, -0.13, 0x22313f).build({ jitter: 0.02 }),
};

export function itemModel(kind, t) {
  if (kind === 'weapon') {
    const m = weaponModel(t, null);
    m.scale.setScalar(1.25);
    m.rotation.y = Math.PI / 2;
    m.position.y = 0.15;
    const g = new THREE.Group(); g.add(m); return g;
  }
  let geo;
  if (kind === 'ammo') {
    geo = itemGeo('ammo:' + t, () => {
      const c = AMMO_COLORS[t] || 0xffffff;
      const m = new MB().rbox(0.36, 0.22, 0.24, 0, 0.11, 0, 0x5b4a33, 0.025).box(0.37, 0.08, 0.25, 0, 0.12, 0, c).rbox(0.38, 0.03, 0.26, 0, 0.225, 0, 0x473826, 0.01);
      for (let i = 0; i < 3; i++) m.fcyl(0.028, 0.028, 0.08, 8, -0.09 + i * 0.09, 0.27, 0, 0xd4a017).cone(0.028, 0.05, 8, -0.09 + i * 0.09, 0.335, 0, t === 'shells' ? c : 0xb87333);
      return m.build({ jitter: 0.03 });
    });
  } else if (kind === 'mat') geo = itemGeo('mat:' + t, MAT_BUILD[t] || MAT_BUILD.scrap);
  else if (kind === 'heal') geo = itemGeo('heal:' + t, HEAL_BUILD[t] || HEAL_BUILD.bandage);
  else if (kind === 'armor') geo = itemGeo('armor:' + t, ARMOR_BUILD[t] || ARMOR_BUILD.vest);
  else geo = itemGeo('unk', () => new MB().box(0.3, 0.3, 0.3, 0, 0.15, 0, 0xff00ff).build());
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, t === 'rare' ? vcBasicMaterial() : vcMaterial());
  mesh.scale.setScalar(1.3);
  g.add(mesh);
  return g;
}

// Golden Rubber Chicken: long neck, open squawking beak, floppy comb.
export function chickenModel() {
  const geo = itemGeo('chicken', () => {
    const G = 0xffc93c, G2 = 0xffb21e, R = 0xe63946, O = 0xff8c1a;
    const m = new MB()
      .sphere(0.27, 0, 0.32, 0.05, G, 1.0, 0.82, 1.45, 14, 10) // body
      .sphere(0.13, 0, 0.42, 0.42, G2, 1.0, 0.9, 1.0, 10, 8) // tail
      .fcyl(0.075, 0.1, 0.34, 10, 0, 0.6, -0.24, G, -0.55, 0, 0) // neck
      .sphere(0.15, 0, 0.78, -0.36, G, 1, 1, 1.05, 14, 10) // head
      // open beak
      .cone(0.075, 0.2, 8, 0, 0.8, -0.56, O, -Math.PI / 2 - 0.15).cone(0.06, 0.15, 8, 0, 0.72, -0.53, 0xe0701a, -Math.PI / 2 + 0.35)
      // comb + wattle
      .sphere(0.05, 0, 0.94, -0.42, R).sphere(0.06, 0, 0.95, -0.34, R).sphere(0.05, 0, 0.93, -0.26, R)
      .sphere(0.04, 0, 0.66, -0.5, R, 0.8, 1.5, 0.8)
      // big cartoon eyes
      .sphere(0.055, 0.1, 0.83, -0.44, 0xffffff, 1, 1, 0.7).sphere(0.055, -0.1, 0.83, -0.44, 0xffffff, 1, 1, 0.7)
      .sphere(0.028, 0.115, 0.835, -0.48, 0x111111).sphere(0.028, -0.115, 0.835, -0.48, 0x111111)
      // wings
      .sphere(0.13, 0.27, 0.36, 0.02, G2, 0.35, 0.8, 1.25).sphere(0.13, -0.27, 0.36, 0.02, G2, 0.35, 0.8, 1.25)
      // skinny legs + feet
      .fcyl(0.025, 0.025, 0.2, 6, 0.1, 0.1, 0.05, O).fcyl(0.025, 0.025, 0.2, 6, -0.1, 0.1, 0.05, O)
      .box(0.12, 0.03, 0.14, 0.1, 0.015, 0.0, O).box(0.12, 0.03, 0.14, -0.1, 0.015, 0.0, O);
    return m.build();
  });
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0xfff2c0, emissive: 0x3a2600 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

// The Boob-tato: a squishy, lumpy cartoon potato with googly eyes, a goofy
// grin and a lit fuse. Just a silly potato.
export function potatoModel() {
  const geo = itemGeo('potato', () => {
    const body = new THREE.SphereGeometry(0.36, 16, 12);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.07 * Math.sin(x * 9 + 1) * Math.cos(z * 8) + 0.05 * Math.sin(y * 11 + 2);
      p.setXYZ(i, x * k * 1.25, y * k * 0.92, z * k * 0.95);
    }
    body.computeVertexNormals();
    const m = new MB().add(body, 0xe0ad62, 0, 0.34, 0);
    // potato "eyes" (little dents) + rosy cheeks
    for (const [x, y, z] of [[0.3, 0.45, 0.18], [-0.33, 0.25, 0.12], [0.12, 0.62, 0.2], [-0.2, 0.55, 0.22], [0.36, 0.2, -0.08]]) m.sphere(0.035, x, y, z, 0xa8763c, 1, 1, 0.6, 6, 4);
    m.sphere(0.07, 0.25, 0.3, -0.3, 0xff8fa3, 1, 0.6, 0.4).sphere(0.07, -0.25, 0.3, -0.3, 0xff8fa3, 1, 0.6, 0.4)
      // googly eyes
      .sphere(0.12, -0.14, 0.47, -0.27, 0xffffff, 1, 1, 0.55).sphere(0.12, 0.14, 0.47, -0.27, 0xffffff, 1, 1, 0.55)
      .sphere(0.055, -0.11, 0.44, -0.33, 0x111111).sphere(0.055, 0.17, 0.5, -0.33, 0x111111)
      // goofy grin + tongue
      .torus(0.12, 0.028, 0, 0.27, -0.29, 0x5a1f2a, 0, 0, Math.PI, Math.PI).sphere(0.04, 0.03, 0.17, -0.31, 0xff6b81, 1, 0.6, 0.6)
      // little sprout
      .box(0.03, 0.1, 0.03, -0.1, 0.68, 0.02, 0x4f9a3a, 0, 0, 0.3).box(0.09, 0.02, 0.05, -0.15, 0.73, 0.02, 0x5aa846, 0, 0, 0.5)
      // fuse
      .fcyl(0.02, 0.025, 0.22, 6, 0.04, 0.73, 0.06, 0x5b4a33, 0.3, 0, -0.2);
    return m.build();
  });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  spark.position.set(0.06, 0.85, 0.1);
  g.add(spark);
  g.userData.mat = mat;
  g.userData.spark = spark;
  return g;
}

// Winning table for Grab the Item: a golden podium table with a glowing ring
export function tableModel() {
  const g = new THREE.Group();
  const geo = itemGeo('wintable', () => {
    const m = new MB()
      .fcyl(0.95, 1.05, 0.14, 12, 0, 0.07, 0, 0x3b2a5a) // plinth
      .fcyl(0.8, 0.9, 0.1, 12, 0, 0.19, 0, 0xffc93c)
      .fcyl(0.16, 0.26, 0.7, 10, 0, 0.58, 0, 0x5a3e8a) // column
      .torus(0.2, 0.04, 0, 0.6, 0, 0xffd23f, Math.PI / 2, 0, 0, Math.PI * 2, 4, 10)
      .fcyl(0.92, 0.85, 0.12, 20, 0, 0.94, 0, 0xffc93c) // gold top
      .cyl(0.82, 0.82, 0.02, 20, 0, 1.0, 0, 0xd62839) // red velvet
      .torus(0.88, 0.04, 0, 1.0, 0, 0xffe27a, Math.PI / 2, 0, 0, Math.PI * 2, 4, 24);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.sphere(0.05, Math.cos(a) * 0.92, 0.88, Math.sin(a) * 0.92, 0xffe27a, 1, 1, 1, 6, 4); }
    // star emblem on the cloth
    for (let i = 0; i < 5; i++) m.box(0.08, 0.012, 0.36, 0, 1.015, 0, 0xffd23f, 0, (i / 5) * Math.PI, 0);
    return m.build();
  });
  g.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x8a7a40, emissive: 0x221400 })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 16;
  g.add(beam);
  g.userData.ring = ring;
  return g;
}

// ---------------------------------------------------------------------------
// Searchable containers: body + lid/door groups. Front faces local +Z.
// ---------------------------------------------------------------------------
const CONTAINER_STYLE = {
  crate: { c: 0xc99a5e, lid: 0xa77442 },
  locker: { c: 0x5c7cba, lid: 0x4f6eaa },
  cabinet: { c: 0xc9a77a, lid: 0xa8835a },
  fridge: { c: 0xf2f4f5, lid: 0xe6eaec },
  toolbox: { c: 0xd62828, lid: 0xb31f1f },
  dumpster: { c: 0x2a9d8f, lid: 0x1d6f65 },
  safe: { c: 0x4a4e69, lid: 0x3a3d55 },
  chest: { c: 0x8b5a2b, lid: 0x74461f },
  ammobox: { c: 0x5b6b35, lid: 0x4a5a28 },
};
export function containerModel(kind, dims) {
  const st = CONTAINER_STYLE[kind] || CONTAINER_STYLE.crate;
  const { w, d, h } = dims;
  const g = new THREE.Group();
  const tall = kind === 'locker' || kind === 'fridge';
  const bh = tall ? h : h * 0.82;
  const bodyGeo = itemGeo('cont:' + kind, () => {
    const m = new MB().rbox(w, bh, d, 0, bh / 2, 0, st.c, Math.min(0.05, w * 0.05));
    const fz = d / 2 + 0.006;
    if (kind === 'crate') {
      for (const y of [0.06, bh - 0.06]) { m.box(w + 0.02, 0.1, 0.1, 0, y, d / 2 - 0.04, 0x9c6b3a).box(w + 0.02, 0.1, 0.1, 0, y, -d / 2 + 0.04, 0x9c6b3a); m.box(0.1, 0.1, d + 0.02, w / 2 - 0.04, y, 0, 0x9c6b3a).box(0.1, 0.1, d + 0.02, -w / 2 + 0.04, y, 0, 0x9c6b3a); }
      for (const s of [-1, 1]) for (const zz of [-1, 1]) m.box(0.1, bh, 0.1, s * (w / 2 - 0.04), bh / 2, zz * (d / 2 - 0.04), 0x9c6b3a);
      m.box(0.08, bh * 1.2, 0.03, 0, bh / 2, fz, 0xa77442, 0, 0, 0.72).box(0.08, bh * 1.2, 0.03, 0, bh / 2, -fz, 0xa77442, 0, 0, -0.72);
      m.box(0.24, 0.12, 0.01, 0.2, bh * 0.75, fz + 0.01, 0x2b2b2b);
    }
    if (kind === 'chest') {
      for (const x of [-w * 0.32, w * 0.32]) m.box(0.07, bh + 0.01, d + 0.02, x, bh / 2, 0, 0xd4a017);
      m.rbox(0.14, 0.16, 0.05, 0, bh - 0.08, fz + 0.01, 0xd4a017, 0.02).box(0.04, 0.06, 0.02, 0, bh - 0.11, fz + 0.04, 0x2b2b2b);
    }
    if (kind === 'locker') {
      m.box(w + 0.02, 0.06, d + 0.02, 0, 0.03, 0, 0x2b3a5a);
    }
    if (kind === 'fridge') m.box(w + 0.01, 0.08, d + 0.01, 0, 0.04, 0, 0x9aa5ad);
    if (kind === 'cabinet') {
      for (const y of [0.25, 0.58]) { m.rbox(w * 0.86, bh * 0.36, 0.03, 0, y * bh * 1.22, fz, 0xb08b5e, 0.012).rbox(0.16, 0.04, 0.04, 0, y * bh * 1.22, fz + 0.03, 0xd4af37, 0.01); }
    }
    if (kind === 'toolbox') {
      for (let i = 0; i < 3; i++) { const y = bh * (0.2 + i * 0.27); m.box(w * 0.92, bh * 0.22, 0.02, 0, y, fz, 0xc22323).rbox(w * 0.5, 0.035, 0.04, 0, y + bh * 0.06, fz + 0.025, 0xd5dbe0, 0.01); }
      for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) m.fcyl(0.05, 0.05, 0.05, 8, x, 0.05, d / 2 - 0.08, 0x222222, 0, 0, Math.PI / 2);
    }
    if (kind === 'dumpster') {
      m.box(w + 0.04, 0.1, d + 0.04, 0, bh * 0.85, 0, 0x237f74).box(w * 0.4, 0.3, 0.01, 0, bh * 0.45, fz, 0xf2f2f2);
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) m.fcyl(0.08, 0.08, 0.06, 8, x, 0.08, z, 0x222222, 0, 0, Math.PI / 2);
      m.box(0.06, 0.06, d + 0.3, w / 2 + 0.06, bh * 0.6, 0, 0x1d6f65).box(0.06, 0.06, d + 0.3, -w / 2 - 0.06, bh * 0.6, 0, 0x1d6f65);
    }
    if (kind === 'safe') {
      m.rbox(w * 0.8, bh * 0.8, 0.03, 0, bh / 2, fz, 0x3d4058, 0.02)
        .fcyl(0.09, 0.09, 0.04, 14, -0.12, bh * 0.55, fz + 0.03, 0xc0c0c0, Math.PI / 2, 0, 0).fcyl(0.04, 0.04, 0.05, 8, -0.12, bh * 0.55, fz + 0.05, 0x777777, Math.PI / 2, 0, 0)
        .box(0.03, 0.22, 0.04, 0.18, bh * 0.5, fz + 0.03, 0xd4af37).box(0.12, 0.03, 0.04, 0.18, bh * 0.5, fz + 0.05, 0xd4af37);
      for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) m.box(0.08, 0.06, 0.08, x, 0.03, d / 2 - 0.06, 0x222233);
    }
    if (kind === 'ammobox') {
      m.box(w * 0.5, 0.14, 0.01, -w * 0.15, bh * 0.5, fz, 0xffd23f).box(w * 0.12, 0.14, 0.01, w * 0.3, bh * 0.5, fz, 0xffd23f);
      for (const x of [-w * 0.32, w * 0.32]) m.rbox(0.08, 0.12, 0.04, x, bh - 0.06, fz + 0.01, 0x8a949c, 0.01);
      m.box(0.3, 0.04, 0.06, 0, bh * 0.5, -d / 2 - 0.02, 0x3a4220).box(0.3, 0.04, 0.06, 0, bh * 0.5, d / 2 + 0.03, 0x3a4220);
    }
    return m.build({ jitter: 0.03, ao: [0, bh, 0.78] });
  });
  const body = new THREE.Mesh(bodyGeo, vcMaterial());
  g.add(body);
  const lidPivot = new THREE.Group();
  if (tall) {
    // front door hinged on the right edge, swinging out of the +Z face
    const doorGeo = itemGeo('contdoor:' + kind, () => {
      const m = new MB().rbox(w * 0.96, h * 0.96, 0.04, -w * 0.48, 0, 0, st.lid, 0.015);
      if (kind === 'locker') {
        for (let i = 0; i < 4; i++) m.box(w * 0.5, 0.025, 0.012, -w * 0.48, h * 0.32 + i * 0.06, 0.025, 0x2b3a5a);
        m.box(0.04, 0.18, 0.05, -w * 0.86, 0, 0.03, 0xc8ced3).box(0.14, 0.08, 0.012, -w * 0.48, h * 0.2, 0.025, 0xe9ecef);
      } else {
        m.box(w * 0.94, 0.02, 0.012, -w * 0.48, h * 0.2, 0.024, 0xc6cdd2).rbox(0.04, 0.5, 0.05, -w * 0.86, -h * 0.05, 0.04, 0xc8ced3, 0.015)
          .rbox(0.04, 0.22, 0.05, -w * 0.86, h * 0.33, 0.04, 0xc8ced3, 0.015).box(0.2, 0.06, 0.01, -w * 0.4, h * 0.38, 0.024, 0xe63946);
      }
      return m.build();
    });
    lidPivot.position.set(w * 0.48, h / 2, d / 2 + 0.02);
    lidPivot.add(new THREE.Mesh(doorGeo, vcMaterial()));
    lidPivot.userData.axis = 'y';
  } else {
    const lh = h * 0.18;
    const lidGeo = itemGeo('contlid:' + kind, () => {
      const m = new MB();
      if (kind === 'chest') {
        m.add(new THREE.CylinderGeometry(d / 2 + 0.02, d / 2 + 0.02, w + 0.04, 12, 1, false, 0, Math.PI), st.lid, 0, 0.02, d / 2, 0, 0, Math.PI / 2, 1, 1, 0.6);
        for (const x of [-w * 0.32, w * 0.32]) m.add(new THREE.CylinderGeometry(d / 2 + 0.035, d / 2 + 0.035, 0.07, 12, 1, false, 0, Math.PI), 0xd4a017, x, 0.02, d / 2, 0, 0, Math.PI / 2, 1, 1, 0.6);
      } else {
        m.rbox(w + 0.04, lh, d + 0.04, 0, lh / 2, d / 2, st.lid, Math.min(0.04, lh * 0.4));
        if (kind === 'crate') for (const x of [-w * 0.3, 0, w * 0.3]) m.box(0.06, 0.02, d + 0.05, x, lh + 0.005, d / 2, 0x9c6b3a);
        if (kind === 'toolbox') m.rbox(w * 0.5, 0.05, 0.05, 0, lh + 0.04, d / 2, 0xd5dbe0, 0.015);
        if (kind === 'dumpster') for (const x of [-w / 4, w / 4]) m.rbox(w / 2 - 0.04, 0.05, d + 0.06, x, lh + 0.02, d / 2, 0x237f74, 0.02);
        if (kind === 'ammobox') m.rbox(w * 0.3, 0.04, 0.06, 0, lh + 0.03, d / 2, 0x3a4220, 0.015);
      }
      return m.build({ jitter: 0.03 });
    });
    lidPivot.position.set(0, h * 0.82, -d / 2);
    lidPivot.add(new THREE.Mesh(lidGeo, vcMaterial()));
    lidPivot.userData.axis = 'x';
  }
  g.add(lidPivot);
  g.userData.lid = lidPivot;
  g.userData.body = body;
  return g;
}

// Crafting workbench with a pegboard of tools and a floating CRAFT sign
export function benchModel() {
  const geo = itemGeo('bench', () => {
    const m = new MB()
      .rbox(2.0, 0.1, 0.9, 0, 0.9, 0, 0xb5834a, 0.03)
      .box(1.95, 0.04, 0.85, 0, 0.84, 0, 0x8d6e63);
    for (const [x, z] of [[0.92, 0.38], [-0.92, 0.38], [0.92, -0.38], [-0.92, -0.38]]) m.rbox(0.1, 0.85, 0.1, x, 0.43, z, 0x6d4c41, 0.02);
    m.rbox(1.9, 0.06, 0.8, 0, 0.3, 0, 0x7e5230, 0.02)
      .rbox(0.5, 0.25, 0.4, -0.55, 0.45, 0, 0xd2ad80, 0.03).rbox(0.4, 0.2, 0.35, 0.45, 0.43, 0.05, 0x3a6fd8, 0.03)
      .rbox(2.0, 1.0, 0.06, 0, 1.45, 0.42, 0xc9a77a, 0.02); // pegboard
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) m.box(0.02, 0.02, 0.01, -0.8 + i * 0.2, 1.1 + j * 0.22, 0.385, 0x7a5a3a);
    // tools: hammer, wrench, saw, screwdriver
    m.box(0.05, 0.32, 0.03, -0.6, 1.5, 0.37, 0x8d6e63).rbox(0.18, 0.07, 0.05, -0.6, 1.68, 0.37, 0x6d7a86, 0.015)
      .box(0.04, 0.34, 0.02, -0.25, 1.48, 0.37, 0xb0bec5).torus(0.05, 0.016, -0.25, 1.67, 0.37, 0xb0bec5, 0, 0, 0, Math.PI * 1.5)
      .box(0.36, 0.14, 0.01, 0.2, 1.5, 0.38, 0xc9d1d8).rbox(0.1, 0.12, 0.03, 0.43, 1.5, 0.37, 0xd62839, 0.01)
      .box(0.03, 0.2, 0.03, 0.72, 1.45, 0.37, 0xb0bec5).rbox(0.05, 0.1, 0.05, 0.72, 1.6, 0.37, 0xf4b400, 0.015);
    // vise
    m.rbox(0.28, 0.16, 0.22, -0.7, 1.03, -0.2, 0x2f6fd6, 0.03).rbox(0.08, 0.14, 0.06, -0.7, 1.05, -0.35, 0x2f6fd6, 0.02).fcyl(0.015, 0.015, 0.3, 6, -0.7, 1.0, -0.42, 0xc8ced3, 0, 0, Math.PI / 2);
    // blueprint + parts on the top
    m.box(0.5, 0.012, 0.36, 0.15, 0.956, -0.1, 0x2a6fb5).box(0.36, 0.014, 0.012, 0.15, 0.958, -0.1, 0xd8ecff).box(0.012, 0.014, 0.26, 0.15, 0.958, -0.1, 0xd8ecff)
      .torus(0.06, 0.02, 0.62, 0.97, -0.12, 0xe09f3e, Math.PI / 2).box(0.05, 0.05, 0.05, 0.75, 0.975, 0.05, 0x7f8c8d);
    return m.build({ jitter: 0.03, ao: [0, 0.9, 0.7] });
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, vcMaterial()));
  // floating "CRAFT" sign (shown in Scavenge & Craft)
  const label = labelTexture('🛠 CRAFT', { color: '#06283a', bg: 'rgba(76,201,240,0.92)' });
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.tex, transparent: true }));
  sign.scale.set(0.3 * label.aspect, 0.3, 1);
  sign.position.set(0, 2.2, 0);
  g.add(sign);
  g.userData.sign = sign;
  return g;
}

// Harvestable resource nodes (scaled down by the game as they deplete)
export function resourceModel(kind) {
  const geo = itemGeo('res:' + kind, () => {
    const m = new MB();
    if (kind === 'wood') {
      // log pile with bright cut ends
      const rows = [[3, 0.2], [2, 0.53], [1, 0.84]];
      for (const [n, y] of rows) for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.4, c = (i + n) % 2 ? 0x8b5a2b : 0x7a4c22;
        m.fcyl(0.19, 0.19, 1.8, 8, x, y, 0, c, Math.PI / 2, 0, 0).cyl(0.155, 0.155, 1.82, 8, x, y, 0, 0xe3bd86, Math.PI / 2, 0, 0)
          .torus(0.08, 0.012, x, y, 0.912, 0xb08a5a).torus(0.08, 0.012, x, y, -0.912, 0xb08a5a);
      }
      m.box(0.08, 0.5, 0.08, 0.78, 0.25, 0.5, 0x5d4037).box(0.08, 0.5, 0.08, -0.78, 0.25, 0.5, 0x5d4037).box(0.08, 0.5, 0.08, 0.78, 0.25, -0.5, 0x5d4037).box(0.08, 0.5, 0.08, -0.78, 0.25, -0.5, 0x5d4037);
      m.fcyl(0.03, 0.03, 0.6, 5, 0.3, 1.1, 0.3, 0x8d6e63, 0.4, 0, 0.9).rbox(0.18, 0.08, 0.05, 0.52, 1.28, 0.3, 0x9aa5b1, 0.02, 0.4, 0, 0.9);
    } else if (kind === 'scrap') {
      m.rbox(1.4, 0.4, 1.2, 0, 0.2, 0, 0x7f8c8d, 0.06, 0, 0.3, 0).rbox(0.9, 0.55, 0.06, 0.15, 0.6, 0.2, 0xa0522d, 0.02, 0.3, 0.6, 0.25)
        .fcyl(0.06, 0.06, 1.2, 6, -0.3, 0.6, 0, 0xb0bec5, 0.5, 0, 1).rbox(0.6, 0.05, 0.7, -0.3, 0.45, -0.2, 0xc9d1d8, 0.02, 0.4, 0, 0.3)
        .torus(0.26, 0.11, 0.42, 0.78, -0.2, 0x1f2124, 1.2, 0, 0, Math.PI * 2, 6, 12).fcyl(0.12, 0.12, 0.25, 8, 0.42, 0.78, -0.2, 0x9aa0a6, 1.2 + Math.PI / 2, 0, 0)
        .rbox(0.3, 0.3, 0.3, -0.45, 0.62, 0.35, 0xd68910, 0.03, 0.3, 0.5, 0).box(0.5, 0.04, 0.04, 0.1, 0.92, 0.1, 0xe74c3c, 0.6, 0.2, 0.5);
    } else {
      m.rbox(1.0, 0.6, 0.8, 0, 0.3, 0, 0x4a6a8a, 0.05).box(1.02, 0.08, 0.82, 0, 0.55, 0, 0x3a5470).box(0.4, 0.14, 0.01, 0, 0.32, 0.41, 0xffd23f);
      m.torus(0.22, 0.07, 0.15, 0.82, 0, 0xe09f3e, 1.2, 0, 0, Math.PI * 2, 4, 10);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; m.box(0.09, 0.09, 0.08, 0.15 + Math.cos(a) * 0.3, 0.82 + Math.sin(a) * 0.3 * Math.cos(1.2), -Math.sin(a) * 0.3 * Math.sin(1.2), 0xe09f3e, 1.2, 0, a); }
      m.torus(0.14, 0.05, -0.28, 0.7, 0.12, 0xb0bec5, 0.3, 0.5, 0).rbox(0.25, 0.25, 0.25, -0.25, 0.72, -0.22, 0x2e7d32, 0.03).box(0.12, 0.03, 0.12, -0.25, 0.86, -0.22, 0xffd23f);
    }
    return m.build({ jitter: 0.04, ao: [0, 0.8, 0.75] });
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, vcMaterial()));
  return g;
}
