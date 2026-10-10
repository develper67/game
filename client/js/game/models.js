// Procedural low-poly models built from primitives with vertex colors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKINS, THEMES } from '/shared/skins.js';
import { patternTexture, labelTexture } from './textures.js';

const _c = new THREE.Color();

function colorize(geo, color) {
  const g = geo.index ? geo : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  _c.convertSRGBToLinear();
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export class MB {
  constructor() { this.geos = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(m);
    if (!geo.index) geo = geo; // keep
    colorize(geo, color);
    this.geos.push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  box(w, h, d, x, y, z, color, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, seg, x, y, z, color, rx, ry, rz) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz); }
  sphere(r, x, y, z, color, sx = 1, sy = 1, sz = 1, ws = 10, hs = 8) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  ico(r, x, y, z, color, sx = 1, sy = 1, sz = 1, detail = 0) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  cone(r, h, seg, x, y, z, color, rx, ry, rz) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }
  dodeca(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.DodecahedronGeometry(r, 0), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  torus(r, t, x, y, z, color, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) { return this.add(new THREE.TorusGeometry(r, t, 6, 12, arc), color, x, y, z, rx, ry, rz); }
  oct(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.OctahedronGeometry(r, 0), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  build() {
    if (!this.geos.length) return new THREE.BufferGeometry();
    for (const g of this.geos) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    const merged = mergeGeometries(this.geos, false);
    merged.computeBoundingSphere();
    return merged;
  }
}

// ---------------------------------------------------------------------------
// Prop templates for instancing: kind -> [{geo, basic?, tint?}]
// ---------------------------------------------------------------------------
const TRUNK = 0x7a4f2a, LEAF = 0x3f8f3a, PINE = 0x2f6f3a;

function layers(...l) { return l; }

const PROP_BUILDERS = {
  pine() {
    const t = new MB().cyl(0.18, 0.28, 1.6, 6, 0, 0.8, 0, TRUNK).build();
    const l = new MB().cone(1.7, 2.4, 7, 0, 2.6, 0, 0xffffff).cone(1.35, 2.1, 7, 0, 3.6, 0, 0xffffff).cone(0.95, 1.8, 7, 0, 4.6, 0, 0xffffff).build();
    return layers({ geo: t }, { geo: l, tint: true, base: PINE });
  },
  snowpine() {
    const t = new MB().cyl(0.18, 0.28, 1.6, 6, 0, 0.8, 0, TRUNK).build();
    const l = new MB().cone(1.7, 2.4, 7, 0, 2.6, 0, 0xffffff).cone(1.35, 2.1, 7, 0, 3.6, 0, 0xffffff).cone(0.95, 1.8, 7, 0, 4.6, 0, 0xffffff).build();
    const snow = new MB().cone(1.25, 0.9, 7, 0, 3.35, 0, 0xffffff).cone(0.95, 0.8, 7, 0, 4.3, 0, 0xffffff).cone(0.62, 0.75, 7, 0, 5.2, 0, 0xffffff).cone(1.72, 0.25, 7, 0, 1.55, 0, 0xffffff).build();
    return layers({ geo: t }, { geo: l, tint: true, base: 0x2e5e4a }, { geo: snow, base: 0xffffff });
  },
  dish() {
    return layers({ geo: new MB().cyl(0.15, 0.25, 2.2, 8, 0, 1.1, 0, 0x90a4ae).sphere(1.4, 0, 2.6, -0.2, 0xeceff1, 1, 1, 0.35, 14, 8).cyl(0.04, 0.04, 1.2, 6, 0, 2.6, -0.8, 0x607d8b, Math.PI / 2, 0, 0).build() });
  },
  tree() {
    const t = new MB().cyl(0.2, 0.3, 2.2, 6, 0, 1.1, 0, TRUNK).build();
    const l = new MB().ico(1.5, 0, 3.0, 0, 0xffffff, 1, 0.9, 1, 1).ico(1.0, 0.8, 3.6, 0.3, 0xffffff, 1, 1, 1, 0).ico(1.0, -0.7, 3.4, -0.4, 0xffffff, 1, 1, 1, 0).build();
    return layers({ geo: t }, { geo: l, tint: true, base: LEAF });
  },
  deadtree() {
    return layers({ geo: new MB().cyl(0.15, 0.25, 3.2, 6, 0, 1.6, 0, 0x6b5a4a).cyl(0.06, 0.1, 1.4, 5, 0.45, 2.6, 0, 0x6b5a4a, 0, 0, -0.8).cyl(0.05, 0.09, 1.2, 5, -0.4, 2.2, 0.1, 0x6b5a4a, 0, 0, 0.9).build() });
  },
  palm() {
    const t = new MB();
    for (let i = 0; i < 5; i++) t.cyl(0.17 - i * 0.015, 0.2 - i * 0.015, 0.95, 6, i * 0.06, 0.45 + i * 0.9, 0, 0x9c7a4f, 0, 0, -0.06);
    const l = new MB();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; l.box(0.5, 0.06, 2.2, Math.sin(a) * 1.0 + 0.3, 4.6, Math.cos(a) * 1.0, 0xffffff, 0.35 * Math.cos(a), a, 0.35 * Math.sin(a)); }
    return layers({ geo: t.build() }, { geo: l.build(), tint: true, base: 0x4caf50 });
  },
  cactus() {
    return layers({ geo: new MB().cyl(0.3, 0.33, 2.6, 8, 0, 1.3, 0, 0x4f9a46).cyl(0.18, 0.18, 0.9, 8, 0.55, 1.4, 0, 0x4f9a46, 0, 0, Math.PI / 2).cyl(0.17, 0.17, 0.9, 8, 0.85, 1.85, 0, 0x4f9a46).cyl(0.16, 0.16, 0.7, 8, -0.5, 1.1, 0, 0x4f9a46, 0, 0, Math.PI / 2).cyl(0.15, 0.15, 0.7, 8, -0.78, 1.45, 0, 0x4f9a46).build() });
  },
  rock() { return layers({ geo: new MB().dodeca(0.9, 0, 0.45, 0, 0xffffff, 1.1, 0.7, 1).build(), tint: true, base: 0x8d8d8d }); },
  bigrock() { return layers({ geo: new MB().dodeca(2.2, 0, 1.2, 0, 0xffffff, 1.1, 0.75, 1).dodeca(1.3, 1.2, 2.2, 0.4, 0xffffff).build(), tint: true, base: 0x9a8f86 }); },
  bush() { return layers({ geo: new MB().ico(0.7, 0, 0.45, 0, 0xffffff, 1.2, 0.8, 1.1, 1).ico(0.5, 0.5, 0.4, 0.2, 0xffffff, 1, 0.8, 1, 0).build(), tint: true, base: 0x4a9a3f }); },
  flowers() {
    const m = new MB();
    const cols = [0xff4d6d, 0xffd23f, 0xffffff, 0xc77dff];
    for (let i = 0; i < 5; i++) { const a = i * 1.3, r = 0.25 + (i % 2) * 0.15; m.box(0.03, 0.3, 0.03, Math.cos(a) * r, 0.15, Math.sin(a) * r, 0x3a7d2c); m.box(0.12, 0.08, 0.12, Math.cos(a) * r, 0.32, Math.sin(a) * r, cols[i % 4]); }
    return layers({ geo: m.build() });
  },
  grasstuft() {
    const m = new MB();
    for (let i = 0; i < 6; i++) { const a = i * 1.05; m.cone(0.05, 0.45, 3, Math.cos(a) * 0.15, 0.22, Math.sin(a) * 0.15, 0x5aa83f, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); }
    return layers({ geo: m.build() });
  },
  car() {
    const body = new MB().box(1.9, 0.7, 4.0, 0, 0.65, 0, 0xffffff).box(1.7, 0.6, 2.1, 0, 1.25, 0.2, 0xffffff).build();
    const rest = new MB()
      .box(1.72, 0.45, 0.04, 0, 1.25, -0.87, 0x22313f).box(1.72, 0.45, 0.04, 0, 1.25, 1.27, 0x22313f)
      .box(0.04, 0.42, 1.9, 0.86, 1.25, 0.2, 0x22313f).box(0.04, 0.42, 1.9, -0.86, 1.25, 0.2, 0x22313f)
      .cyl(0.36, 0.36, 0.3, 10, 0.88, 0.36, 1.3, 0x1b1b1b, 0, 0, Math.PI / 2).cyl(0.36, 0.36, 0.3, 10, -0.88, 0.36, 1.3, 0x1b1b1b, 0, 0, Math.PI / 2)
      .cyl(0.36, 0.36, 0.3, 10, 0.88, 0.36, -1.3, 0x1b1b1b, 0, 0, Math.PI / 2).cyl(0.36, 0.36, 0.3, 10, -0.88, 0.36, -1.3, 0x1b1b1b, 0, 0, Math.PI / 2)
      .box(0.4, 0.15, 0.05, 0.6, 0.75, -2.01, 0xfff5c0).box(0.4, 0.15, 0.05, -0.6, 0.75, -2.01, 0xfff5c0)
      .box(0.4, 0.15, 0.05, 0.6, 0.75, 2.01, 0xd00000).box(0.4, 0.15, 0.05, -0.6, 0.75, 2.01, 0xd00000)
      .box(1.95, 0.18, 0.15, 0, 0.42, -2.0, 0x888888).box(1.95, 0.18, 0.15, 0, 0.42, 2.0, 0x888888).build();
    return layers({ geo: body, tint: true, base: 0x2e86de, colorKey: 'color' }, { geo: rest });
  },
  barrel() { return layers({ geo: new MB().cyl(0.35, 0.35, 1.0, 10, 0, 0.5, 0, 0xffffff).cyl(0.36, 0.36, 0.06, 10, 0, 0.25, 0, 0x333333).cyl(0.36, 0.36, 0.06, 10, 0, 0.75, 0, 0x333333).build(), tint: true, base: 0x2d6cdf }); },
  crate() { return layers({ geo: new MB().box(1, 1, 1, 0, 0.5, 0, 0xb5834a).box(1.02, 0.12, 1.02, 0, 0.1, 0, 0x8a5a2b).box(1.02, 0.12, 1.02, 0, 0.9, 0, 0x8a5a2b).box(0.12, 1.0, 1.02, 0, 0.5, 0, 0x8a5a2b).build() }); },
  pallet() {
    return layers({ geo: new MB().box(1.2, 0.14, 1.2, 0, 0.07, 0, 0xc49a6c).box(1.0, 0.5, 1.0, 0, 0.39, 0, 0xd8b48a).box(0.9, 0.5, 0.9, 0.05, 0.89, 0, 0xc8a070).box(1.02, 0.04, 0.1, 0, 0.64, 0, 0xffffff).build() });
  },
  lamp() {
    const pole = new MB().cyl(0.07, 0.1, 4.4, 6, 0, 2.2, 0, 0x2f3542).box(0.9, 0.1, 0.15, 0.4, 4.4, 0, 0x2f3542).box(0.4, 0.15, 0.3, 0.8, 4.3, 0, 0x2f3542).build();
    const bulb = new MB().box(0.32, 0.06, 0.24, 0.8, 4.2, 0, 0xfff3b0).build();
    return layers({ geo: pole }, { geo: bulb, basic: true });
  },
  hay() { return layers({ geo: new MB().box(1.2, 1.0, 1.8, 0, 0.5, 0, 0xe9c46a).box(1.22, 0.05, 1.82, 0, 0.3, 0, 0xb08a3a).box(1.22, 0.05, 1.82, 0, 0.7, 0, 0xb08a3a).build() }); },
  bench() {
    return layers({ geo: new MB().box(1.8, 0.08, 0.5, 0, 0.45, 0, 0xa0522d).box(1.8, 0.4, 0.08, 0, 0.75, 0.22, 0xa0522d).box(0.08, 0.45, 0.45, 0.8, 0.22, 0, 0x2f3542).box(0.08, 0.45, 0.45, -0.8, 0.22, 0, 0x2f3542).build() });
  },
  table() {
    return layers({ geo: new MB().box(1.6, 0.08, 1.0, 0, 0.76, 0, 0x9c6b3e).box(0.08, 0.72, 0.08, 0.7, 0.36, 0.42, 0x6d4c2e).box(0.08, 0.72, 0.08, -0.7, 0.36, 0.42, 0x6d4c2e).box(0.08, 0.72, 0.08, 0.7, 0.36, -0.42, 0x6d4c2e).box(0.08, 0.72, 0.08, -0.7, 0.36, -0.42, 0x6d4c2e).build() });
  },
  bed() {
    return layers({ geo: new MB().box(1.8, 0.35, 2.1, 0, 0.18, 0, 0x6d4c2e).box(1.7, 0.2, 2.0, 0, 0.45, 0, 0xffffff).box(1.72, 0.12, 1.3, 0, 0.56, 0.35, 0x4cc9f0).box(0.6, 0.14, 0.35, -0.4, 0.62, -0.75, 0xfafafa).box(0.6, 0.14, 0.35, 0.4, 0.62, -0.75, 0xfafafa).box(1.8, 0.8, 0.1, 0, 0.6, -1.03, 0x6d4c2e).build() });
  },
  sofa() {
    return layers({ geo: new MB().box(2.0, 0.42, 0.9, 0, 0.21, 0, 0xffffff).box(2.0, 0.5, 0.22, 0, 0.66, 0.34, 0xffffff).box(0.22, 0.32, 0.9, 0.89, 0.56, 0, 0xffffff).box(0.22, 0.32, 0.9, -0.89, 0.56, 0, 0xffffff).build(), tint: true, base: 0xc0392b });
  },
  shelf() {
    const m = new MB().box(2.0, 2.2, 0.06, 0, 1.1, 0.27, 0x8d6e63).box(0.06, 2.2, 0.6, 0.97, 1.1, 0, 0x8d6e63).box(0.06, 2.2, 0.6, -0.97, 1.1, 0, 0x8d6e63);
    for (let i = 0; i < 4; i++) m.box(2.0, 0.05, 0.6, 0, 0.1 + i * 0.68, 0, 0xa1887f);
    const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6];
    for (let i = 0; i < 9; i++) m.box(0.28, 0.32, 0.3, -0.75 + (i % 5) * 0.37, 0.29 + Math.floor(i / 5) * 0.68 + 0.68, 0, cols[i % 5]);
    return layers({ geo: m.build() });
  },
  rack() {
    const m = new MB();
    for (const x of [-1.95, 1.95]) for (const z of [-0.45, 0.45]) m.box(0.1, 3.2, 0.1, x, 1.6, z, 0x2e5aac);
    for (const y of [0.15, 1.2, 2.25]) { m.box(4.0, 0.08, 0.12, 0, y, -0.45, 0xff8c00); m.box(4.0, 0.08, 0.12, 0, y, 0.45, 0xff8c00); m.box(4.0, 0.04, 0.95, 0, y + 0.04, 0, 0x9e9e9e); }
    const cols = [0xc49a6c, 0xb5834a, 0xd8b48a];
    for (let i = 0; i < 8; i++) m.box(0.8, 0.6, 0.8, -1.45 + (i % 4) * 0.97, 0.5 + Math.floor(i / 4) * 1.05, 0, cols[i % 3]);
    return layers({ geo: m.build() });
  },
  counter() { return layers({ geo: new MB().box(2.4, 0.95, 0.8, 0, 0.475, 0, 0xecf0f1).box(2.5, 0.06, 0.85, 0, 0.98, 0, 0x34495e).build() }); },
  snowman() {
    return layers({ geo: new MB().sphere(0.5, 0, 0.45, 0, 0xffffff).sphere(0.36, 0, 1.08, 0, 0xffffff).sphere(0.25, 0, 1.52, 0, 0xffffff).cone(0.05, 0.3, 6, 0, 1.52, -0.36, 0xff8c00, -Math.PI / 2).box(0.05, 0.05, 0.05, -0.09, 1.6, -0.22, 0x111111).box(0.05, 0.05, 0.05, 0.09, 1.6, -0.22, 0x111111).cyl(0.18, 0.2, 0.3, 8, 0, 1.85, 0, 0x222222).build() });
  },
  tank() { return layers({ geo: new MB().cyl(1.4, 1.4, 3.6, 14, 0, 1.8, 0, 0xffffff).sphere(1.4, 0, 3.6, 0, 0xffffff, 1, 0.35, 1).cyl(1.42, 1.42, 0.1, 14, 0, 1.2, 0, 0x666666).cyl(1.42, 1.42, 0.1, 14, 0, 2.6, 0, 0x666666).build(), tint: true, base: 0xd9d9d9 }); },
  generator() { return layers({ geo: new MB().box(2.0, 1.2, 1.4, 0, 0.6, 0, 0xf1c40f).box(1.6, 0.3, 1.0, 0, 1.35, 0, 0x2c3e50).cyl(0.08, 0.08, 0.6, 6, 0.6, 1.6, 0.3, 0x555555).build() }); },
  machine() {
    return layers({ geo: new MB().box(3.0, 2.0, 2.0, 0, 1.0, 0, 0x5d6d7e).box(1.0, 0.6, 0.1, -0.6, 1.4, -1.03, 0x1abc9c).box(0.3, 0.3, 0.1, 0.8, 1.4, -1.03, 0xe74c3c).cyl(0.2, 0.2, 2.6, 8, 1.2, 2.0, 0.6, 0x95a5a6, Math.PI / 2, 0, 0).cyl(0.25, 0.25, 0.8, 8, -1.0, 2.4, 0, 0x7f8c8d).build() });
  },
  ac() { return layers({ geo: new MB().box(1.8, 1.1, 1.4, 0, 0.55, 0, 0xbdc3c7).cyl(0.45, 0.45, 0.05, 12, 0, 1.12, 0, 0x2c3e50).box(1.82, 0.08, 1.42, 0, 0.3, 0, 0x95a5a6).build() }); },
  vending() {
    return layers({ geo: new MB().box(1.0, 2.0, 0.8, 0, 1.0, 0, 0xe74c3c).box(0.3, 0.6, 0.05, 0.3, 1.0, -0.41, 0x2c3e50).build() }, { geo: new MB().box(0.55, 1.2, 0.04, -0.15, 1.2, -0.41, 0x9fe8ff).build(), basic: true });
  },
  fountain() {
    return layers({ geo: new MB().cyl(2.2, 2.3, 0.7, 16, 0, 0.35, 0, 0xbdbdbd).cyl(0.4, 0.5, 2.2, 10, 0, 1.1, 0, 0xbdbdbd).cyl(1.0, 0.8, 0.3, 12, 0, 2.0, 0, 0xbdbdbd).build() }, { geo: new MB().cyl(2.0, 2.0, 0.05, 16, 0, 0.62, 0, 0x6ec6ff).sphere(0.3, 0, 2.3, 0, 0x9fe1ff, 1, 0.6, 1).build(), basic: true });
  },
  log() { return layers({ geo: new MB().cyl(0.35, 0.35, 3.0, 8, 0, 0.35, 0, 0x8b5a2b, 0, 0, Math.PI / 2).cyl(0.3, 0.3, 3.02, 8, 0, 0.35, 0, 0xd7a86e, 0, 0, Math.PI / 2).build() }); },
  cone() { return layers({ geo: new MB().box(0.5, 0.05, 0.5, 0, 0.025, 0, 0xff6b00).cone(0.2, 0.7, 8, 0, 0.4, 0, 0xff6b00).cyl(0.13, 0.155, 0.12, 8, 0, 0.4, 0, 0xffffff).build() }); },
  sign() { return layers({ geo: new MB().cyl(0.06, 0.06, 2.4, 6, 0, 1.2, 0, 0x7f8c8d).box(1.4, 0.8, 0.08, 0, 2.2, 0, 0x27ae60).box(1.2, 0.08, 0.09, 0, 2.2, 0, 0xffffff).build() }); },
  watertower() {
    const m = new MB();
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) m.box(0.2, 6, 0.2, x, 3, z, 0x6d4c41);
    m.cyl(2.0, 2.0, 2.6, 12, 0, 7.3, 0, 0x8d6e63).cone(2.2, 1.0, 12, 0, 9.1, 0, 0x5d4037);
    return layers({ geo: m.build() });
  },
  antenna() {
    const m = new MB();
    for (let i = 0; i < 6; i++) { const y = i * 2; m.box(0.08, 2, 0.08, -0.4 + i * 0.03, y + 1, -0.4 + i * 0.03, 0xe74c3c); m.box(0.08, 2, 0.08, 0.4 - i * 0.03, y + 1, 0.4 - i * 0.03, 0xffffff); m.box(0.8, 0.06, 0.06, 0, y + 1, 0, 0x95a5a6); }
    return layers({ geo: m.build() }, { geo: new MB().sphere(0.15, 0, 12.1, 0, 0xff2020).build(), basic: true });
  },
  plant() { return layers({ geo: new MB().cyl(0.25, 0.2, 0.4, 8, 0, 0.2, 0, 0xc0703a).ico(0.4, 0, 0.75, 0, 0x3f9a3a, 1, 1.1, 1).build() }); },
};

const templateCache = new Map();
export function propTemplate(kind) {
  if (!templateCache.has(kind)) {
    const b = PROP_BUILDERS[kind];
    templateCache.set(kind, b ? b() : null);
  }
  return templateCache.get(kind);
}

// ---------------------------------------------------------------------------
// Weapons: 3 material slots (base/accent/grip) so skins can restyle them.
// Built pointing towards -Z, grip at origin.
// ---------------------------------------------------------------------------
const WEAPON_PARTS = {
  pistol: (b, a, g) => {
    b.box(0.07, 0.09, 0.32, 0, 0.06, -0.12);
    a.box(0.03, 0.03, 0.06, 0, 0.06, -0.31, 0, 0, 0);
    g.box(0.065, 0.16, 0.08, 0, -0.04, 0.0, -0.25, 0, 0);
    a.box(0.02, 0.06, 0.06, 0, -0.005, -0.08);
  },
  revolver: (b, a, g) => {
    b.box(0.06, 0.06, 0.36, 0, 0.07, -0.18);
    a.cyl(0.055, 0.055, 0.1, 8, 0, 0.05, -0.02, Math.PI / 2, 0, 0);
    b.box(0.07, 0.07, 0.12, 0, 0.05, 0.03);
    g.box(0.06, 0.15, 0.08, 0, -0.05, 0.08, -0.4, 0, 0);
  },
  smg: (b, a, g) => {
    b.box(0.08, 0.11, 0.42, 0, 0.06, -0.1);
    a.box(0.04, 0.04, 0.12, 0, 0.07, -0.37);
    g.box(0.06, 0.15, 0.07, 0, -0.05, 0.02, -0.2, 0, 0);
    a.box(0.05, 0.2, 0.06, 0, -0.06, -0.16);
    g.box(0.05, 0.05, 0.22, 0, 0.06, 0.2);
  },
  shotgun: (b, a, g) => {
    b.box(0.08, 0.1, 0.55, 0, 0.06, -0.2);
    a.cyl(0.03, 0.03, 0.5, 8, 0, 0.1, -0.45, Math.PI / 2, 0, 0);
    a.box(0.09, 0.07, 0.2, 0, 0.0, -0.35);
    g.box(0.07, 0.13, 0.32, 0, 0.0, 0.2, 0.2, 0, 0);
  },
  rifle: (b, a, g) => {
    b.box(0.08, 0.12, 0.6, 0, 0.06, -0.18);
    a.box(0.035, 0.035, 0.22, 0, 0.08, -0.58);
    a.box(0.06, 0.22, 0.08, 0, -0.09, -0.15, 0.25, 0, 0);
    g.box(0.06, 0.14, 0.07, 0, -0.05, 0.05, -0.2, 0, 0);
    g.box(0.07, 0.14, 0.3, 0, 0.03, 0.27);
    a.box(0.04, 0.05, 0.18, 0, 0.15, -0.1);
  },
  sniper: (b, a, g) => {
    b.box(0.07, 0.1, 0.75, 0, 0.06, -0.25);
    a.cyl(0.022, 0.022, 0.45, 8, 0, 0.08, -0.82, Math.PI / 2, 0, 0);
    a.cyl(0.045, 0.045, 0.32, 10, 0, 0.17, -0.15, Math.PI / 2, 0, 0);
    g.box(0.06, 0.14, 0.07, 0, -0.05, 0.05, -0.2, 0, 0);
    g.box(0.07, 0.16, 0.35, 0, 0.02, 0.3);
  },
  blaster: (b, a, g) => {
    b.box(0.1, 0.14, 0.5, 0, 0.07, -0.15);
    a.cyl(0.05, 0.035, 0.22, 10, 0, 0.07, -0.5, Math.PI / 2, 0, 0);
    a.torus(0.06, 0.015, 0, 0.07, -0.36, 0, 0, 0);
    a.box(0.12, 0.04, 0.3, 0, 0.16, -0.12);
    g.box(0.07, 0.15, 0.08, 0, -0.06, 0.04, -0.2, 0, 0);
  },
};

class SlotBuilder {
  constructor() { this.geos = []; }
  push(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    this.geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(w, h, d, x, y, z, rx, ry, rz) { this.push(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  cyl(r1, r2, h, s, x, y, z, rx, ry, rz) { this.push(new THREE.CylinderGeometry(r1, r2, h, s), x, y, z, rx, ry, rz); }
  torus(r, t, x, y, z, rx, ry, rz) { this.push(new THREE.TorusGeometry(r, t, 6, 12), x, y, z, rx, ry, rz); }
  build() { return this.geos.length ? mergeGeometries(this.geos, false) : null; }
}

const weaponGeoCache = new Map();
function weaponGeos(type) {
  if (!weaponGeoCache.has(type)) {
    const b = new SlotBuilder(), a = new SlotBuilder(), g = new SlotBuilder();
    (WEAPON_PARTS[type] || WEAPON_PARTS.pistol)(b, a, g);
    weaponGeoCache.set(type, [b.build(), a.build(), g.build()]);
  }
  return weaponGeoCache.get(type);
}

const DEFAULT_SKIN = { base: 0x3a3f4a, accent: 0x9aa5b1, grip: 0x5b3a29, pattern: 'solid' };
const BLASTER_DEFAULT = { base: 0xeef2ff, accent: 0x7b6cff, grip: 0x2b2d42, pattern: 'solid', glow: 0x3020a0 };
const skinMatCache = new Map();
export function skinMaterials(skinId, weaponType) {
  const key = (skinId || 'default') + ':' + (skinId ? '' : weaponType);
  if (skinMatCache.has(key)) return skinMatCache.get(key);
  const skin = skinId ? SKINS[skinId] : null;
  const th = skin ? THEMES[skin.theme] : (weaponType === 'blaster' ? BLASTER_DEFAULT : DEFAULT_SKIN);
  const mk = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
  let base;
  if (th.pattern && th.pattern !== 'solid') base = mk(0xffffff, { map: patternTexture(th) });
  else base = mk(th.base);
  if (th.glow) base.emissive = new THREE.Color(th.glow);
  if (th.metal) { base = new THREE.MeshPhongMaterial({ color: th.pattern === 'solid' ? th.base : 0xffffff, map: th.pattern !== 'solid' ? patternTexture(th) : null, shininess: 90, specular: 0xffffff, emissive: th.glow || 0 }); }
  const accent = mk(th.accent, th.glow ? { emissive: new THREE.Color(th.glow).multiplyScalar(0.6) } : {});
  const grip = mk(th.grip);
  const mats = { base, accent, grip, animated: !!th.animated };
  skinMatCache.set(key, mats);
  return mats;
}

export function weaponModel(type, skinId) {
  const [gb, ga, gg] = weaponGeos(type);
  const mats = skinMaterials(skinId, type);
  const grp = new THREE.Group();
  if (gb) grp.add(new THREE.Mesh(gb, mats.base));
  if (ga) grp.add(new THREE.Mesh(ga, mats.accent));
  if (gg) grp.add(new THREE.Mesh(gg, mats.grip));
  grp.userData.weapon = type;
  grp.userData.mats = mats;
  return grp;
}

// muzzle offset (local) for effects
export const MUZZLE = { pistol: -0.34, revolver: -0.38, smg: -0.44, shotgun: -0.7, rifle: -0.7, sniper: -1.05, blaster: -0.62 };

// ---------------------------------------------------------------------------
// Items: loot pickups, objective props
// ---------------------------------------------------------------------------
const lambertVC = () => new THREE.MeshLambertMaterial({ vertexColors: true });
let _vcMat = null;
export function vcMaterial() { if (!_vcMat) _vcMat = lambertVC(); return _vcMat; }
let _vcBasic = null;
export function vcBasicMaterial() { if (!_vcBasic) _vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true }); return _vcBasic; }

const itemGeoCache = new Map();
function itemGeo(key, fn) {
  if (!itemGeoCache.has(key)) itemGeoCache.set(key, fn());
  return itemGeoCache.get(key);
}

const AMMO_COLORS = { light: 0xffd166, shells: 0xef476f, rifle: 0x06d6a0, heavy: 0x118ab2, cells: 0xc77dff };
const MAT_BUILD = {
  wood: () => new MB().cyl(0.08, 0.08, 0.5, 6, -0.1, 0.08, 0, 0xa0693a, 0, 0, Math.PI / 2).cyl(0.08, 0.08, 0.5, 6, 0.08, 0.08, 0.06, 0xb07a45, 0, 0, Math.PI / 2).cyl(0.08, 0.08, 0.5, 6, 0, 0.22, 0.03, 0x8b5a2b, 0, 0, Math.PI / 2).build(),
  scrap: () => new MB().box(0.3, 0.05, 0.25, 0, 0.05, 0, 0x9aa5b1, 0.2, 0.3, 0).box(0.2, 0.05, 0.3, 0.05, 0.12, 0.02, 0x7f8c8d, -0.3, 0.8, 0.1).cyl(0.04, 0.04, 0.35, 6, -0.05, 0.18, 0, 0xb0bec5, 0.4, 0, 1.2).build(),
  cloth: () => new MB().box(0.36, 0.08, 0.28, 0, 0.05, 0, 0xf4f1de).box(0.34, 0.08, 0.26, 0, 0.13, 0, 0xe07a5f).box(0.32, 0.08, 0.24, 0, 0.21, 0, 0x81b29a).build(),
  parts: () => new MB().torus(0.13, 0.05, 0, 0.14, 0, 0xe09f3e, Math.PI / 2.5, 0, 0).cyl(0.04, 0.04, 0.3, 6, 0.12, 0.12, 0.05, 0x9aa5b1, 0, 0, 1.2).box(0.1, 0.1, 0.1, -0.1, 0.06, 0.1, 0x777777).build(),
  electronics: () => new MB().box(0.34, 0.03, 0.24, 0, 0.05, 0, 0x2e7d32).box(0.08, 0.04, 0.08, -0.06, 0.08, 0, 0x222222).box(0.06, 0.06, 0.04, 0.08, 0.09, 0.05, 0xffd23f).box(0.04, 0.08, 0.04, 0.1, 0.1, -0.06, 0x2ec4b6).build(),
  gunpowder: () => new MB().cyl(0.13, 0.15, 0.3, 8, 0, 0.15, 0, 0x3d405b).cyl(0.06, 0.06, 0.06, 8, 0, 0.33, 0, 0xc0c0c0).box(0.18, 0.1, 0.01, 0, 0.18, -0.145, 0xffd23f).build(),
  rare: () => new MB().oct(0.18, 0, 0.25, 0, 0xc77dff, 0.8, 1.4, 0.8).oct(0.1, 0.13, 0.12, 0.05, 0xe0aaff, 0.8, 1.4, 0.8).build(),
};
const HEAL_BUILD = {
  bandage: () => new MB().cyl(0.1, 0.1, 0.16, 10, 0, 0.1, 0, 0xffffff, 0, 0, Math.PI / 2).cyl(0.04, 0.04, 0.17, 8, 0, 0.1, 0, 0xe8d8c0, 0, 0, Math.PI / 2).build(),
  medkit: () => new MB().box(0.4, 0.26, 0.28, 0, 0.13, 0, 0xffffff).box(0.06, 0.18, 0.29, 0, 0.13, 0, 0xe63946).box(0.18, 0.06, 0.29, 0, 0.13, 0, 0xe63946).box(0.14, 0.04, 0.05, 0, 0.28, 0, 0x555555).build(),
};
const ARMOR_BUILD = {
  vest: () => new MB().box(0.42, 0.5, 0.16, 0, 0.3, 0, 0x6b705c).box(0.12, 0.12, 0.17, -0.13, 0.5, 0, 0x6b705c).box(0.44, 0.06, 0.17, 0, 0.12, 0, 0x3f4238).build(),
  plate: () => new MB().box(0.44, 0.52, 0.18, 0, 0.31, 0, 0x5c677d).box(0.36, 0.36, 0.05, 0, 0.32, -0.1, 0xb0bec5).box(0.12, 0.12, 0.18, -0.14, 0.52, 0, 0x5c677d).build(),
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
  if (kind === 'ammo') geo = itemGeo('ammo:' + t, () => new MB().box(0.36, 0.22, 0.24, 0, 0.11, 0, 0x5b4a33).box(0.37, 0.08, 0.25, 0, 0.12, 0, AMMO_COLORS[t] || 0xffffff).box(0.06, 0.1, 0.06, -0.08, 0.27, 0, 0xd4a017).box(0.06, 0.1, 0.06, 0.02, 0.27, 0, 0xd4a017).box(0.06, 0.1, 0.06, 0.12, 0.27, 0, 0xd4a017).build());
  else if (kind === 'mat') geo = itemGeo('mat:' + t, MAT_BUILD[t] || MAT_BUILD.scrap);
  else if (kind === 'heal') geo = itemGeo('heal:' + t, HEAL_BUILD[t] || HEAL_BUILD.bandage);
  else if (kind === 'armor') geo = itemGeo('armor:' + t, ARMOR_BUILD[t] || ARMOR_BUILD.vest);
  else geo = itemGeo('unk', () => new MB().box(0.3, 0.3, 0.3, 0, 0.15, 0, 0xff00ff).build());
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, t === 'rare' ? vcBasicMaterial() : vcMaterial());
  mesh.scale.setScalar(1.3);
  g.add(mesh);
  return g;
}

// Golden Rubber Chicken
export function chickenModel() {
  const geo = itemGeo('chicken', () => new MB()
    .sphere(0.28, 0, 0.32, 0, 0xffc93c, 1.1, 0.85, 1.35)
    .sphere(0.17, 0, 0.62, -0.28, 0xffc93c)
    .cone(0.06, 0.16, 6, 0, 0.6, -0.48, 0xff8c00, -Math.PI / 2)
    .box(0.05, 0.12, 0.14, 0, 0.8, -0.27, 0xe63946)
    .box(0.05, 0.08, 0.06, 0, 0.5, -0.4, 0xe63946)
    .sphere(0.035, 0.09, 0.67, -0.4, 0x111111).sphere(0.035, -0.09, 0.67, -0.4, 0x111111)
    .box(0.04, 0.2, 0.04, 0.1, 0.06, 0.02, 0xff8c00).box(0.04, 0.2, 0.04, -0.1, 0.06, 0.02, 0xff8c00)
    .sphere(0.12, 0, 0.42, 0.36, 0xffd966, 1.4, 0.8, 0.6)
    .sphere(0.12, 0.3, 0.35, 0.02, 0xffd966, 0.4, 0.8, 1.2).sphere(0.12, -0.3, 0.35, 0.02, 0xffd966, 0.4, 0.8, 1.2)
    .build());
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0xffffff, emissive: 0x332200 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

// The Boob-tato: a silly, squishy, googly-eyed cartoon prop. No anatomy, just goofy.
export function potatoModel() {
  const geo = itemGeo('potato', () => new MB()
    .sphere(0.3, -0.24, 0.32, 0, 0xffb3c7, 1, 1, 0.95, 14, 10)
    .sphere(0.3, 0.24, 0.32, 0, 0xffb3c7, 1, 1, 0.95, 14, 10)
    // googly eyes
    .sphere(0.11, -0.24, 0.38, -0.26, 0xffffff, 1, 1, 0.5).sphere(0.11, 0.24, 0.38, -0.26, 0xffffff, 1, 1, 0.5)
    .sphere(0.05, -0.21, 0.35, -0.31, 0x111111).sphere(0.05, 0.27, 0.41, -0.31, 0x111111)
    // big silly grin below
    .torus(0.12, 0.025, 0, 0.17, -0.25, 0x7a1f3d, 0, 0, Math.PI, Math.PI)
    // fuse on top
    .cyl(0.02, 0.025, 0.22, 6, 0, 0.72, 0.05, 0x5b4a33, 0.3, 0, 0)
    .build());
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  spark.position.set(0, 0.84, 0.08);
  g.add(spark);
  g.userData.mat = mat;
  g.userData.spark = spark;
  return g;
}

// Winning table for Grab the Item
export function tableModel() {
  const g = new THREE.Group();
  const geo = itemGeo('wintable', () => new MB()
    .cyl(0.9, 0.9, 0.12, 20, 0, 0.9, 0, 0xffd23f)
    .cyl(0.12, 0.2, 0.85, 10, 0, 0.42, 0, 0x8a5a00)
    .cyl(0.5, 0.6, 0.08, 16, 0, 0.04, 0, 0x8a5a00)
    .cyl(0.95, 0.95, 0.04, 20, 0, 0.97, 0, 0xffffff)
    .build());
  g.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, emissive: 0x332200 })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 16;
  g.add(beam);
  g.userData.ring = ring;
  return g;
}

// Searchable containers: body + lid groups
const CONTAINER_STYLE = {
  crate: { c: 0xb5834a, lid: 0x8a5a2b },
  locker: { c: 0x5c7cba, lid: 0x4a6aa8 },
  cabinet: { c: 0xd9c4a0, lid: 0xb59a70 },
  fridge: { c: 0xf2f2f2, lid: 0xdcdcdc },
  toolbox: { c: 0xd62828, lid: 0xa31f1f },
  dumpster: { c: 0x2a9d8f, lid: 0x1d6f65 },
  safe: { c: 0x4a4e69, lid: 0x22223b },
  chest: { c: 0x8b5a2b, lid: 0x6b3f18 },
  ammobox: { c: 0x556b2f, lid: 0x3e4f22 },
};
export function containerModel(kind, dims) {
  const st = CONTAINER_STYLE[kind] || CONTAINER_STYLE.crate;
  const { w, d, h } = dims;
  const g = new THREE.Group();
  const tall = kind === 'locker' || kind === 'fridge';
  const bodyGeo = itemGeo('cont:' + kind, () => {
    const m = new MB().box(w, tall ? h : h * 0.82, d, 0, (tall ? h : h * 0.82) / 2, 0, st.c);
    if (kind === 'crate' || kind === 'chest') m.box(w + 0.02, 0.1, d + 0.02, 0, h * 0.4, 0, st.lid);
    if (kind === 'locker') { for (let i = 0; i < 3; i++) m.box(w * 0.5, 0.03, 0.01, 0, h * 0.75 + i * 0.06, -d / 2 - 0.005, 0x2b3a5a); }
    if (kind === 'safe') m.cyl(0.08, 0.08, 0.04, 12, 0.15, h * 0.45, -d / 2 - 0.02, 0xc0c0c0, Math.PI / 2, 0, 0);
    if (kind === 'ammobox') m.box(w * 0.5, 0.14, 0.01, 0, h * 0.4, -d / 2 - 0.005, 0xffd23f);
    if (kind === 'toolbox') { for (let i = 0; i < 3; i++) m.box(w * 0.9, 0.02, 0.01, 0, h * 0.2 + i * h * 0.22, -d / 2 - 0.005, 0x999999); }
    return m.build();
  });
  const body = new THREE.Mesh(bodyGeo, vcMaterial());
  g.add(body);
  const lidPivot = new THREE.Group();
  if (tall) {
    // front door hinged on the left side
    const doorGeo = itemGeo('contdoor:' + kind, () => new MB().box(w * 0.96, h * 0.96, 0.04, w * 0.48, 0, 0, st.lid).box(0.04, 0.25, 0.05, w * 0.85, 0, -0.04, 0x777777).build());
    lidPivot.position.set(-w * 0.48, h / 2, -d / 2 - 0.02);
    lidPivot.add(new THREE.Mesh(doorGeo, vcMaterial()));
    lidPivot.userData.axis = 'y';
  } else {
    const lidGeo = itemGeo('contlid:' + kind, () => new MB().box(w + 0.04, h * 0.18, d + 0.04, 0, h * 0.09, d / 2, st.lid).build());
    lidPivot.position.set(0, h * 0.82, -d / 2);
    lidPivot.add(new THREE.Mesh(lidGeo, vcMaterial()));
    lidPivot.userData.axis = 'x';
  }
  g.add(lidPivot);
  g.userData.lid = lidPivot;
  g.userData.body = body;
  return g;
}

export function benchModel() {
  const geo = itemGeo('bench', () => {
    const m = new MB()
      .box(2.0, 0.1, 0.9, 0, 0.9, 0, 0x8d6e63)
      .box(0.1, 0.85, 0.1, 0.92, 0.43, 0.38, 0x5d4037).box(0.1, 0.85, 0.1, -0.92, 0.43, 0.38, 0x5d4037)
      .box(0.1, 0.85, 0.1, 0.92, 0.43, -0.38, 0x5d4037).box(0.1, 0.85, 0.1, -0.92, 0.43, -0.38, 0x5d4037)
      .box(1.9, 0.06, 0.8, 0, 0.3, 0, 0x6d4c41)
      .box(2.0, 1.0, 0.06, 0, 1.45, 0.42, 0xa1887f) // pegboard
      .box(0.3, 0.2, 0.25, -0.6, 1.05, 0, 0xd62828) // vise
      .box(0.08, 0.3, 0.02, -0.4, 1.5, 0.38, 0x9aa5b1).box(0.3, 0.05, 0.02, 0.2, 1.6, 0.38, 0x9aa5b1).box(0.04, 0.35, 0.02, 0.5, 1.45, 0.38, 0xe09f3e)
      .cyl(0.12, 0.12, 0.05, 12, 0.5, 0.98, -0.1, 0x9aa5b1)
      .box(0.5, 0.04, 0.3, 0.1, 0.97, -0.1, 0x3d405b);
    return m.build();
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

export function resourceModel(kind) {
  const geo = itemGeo('res:' + kind, () => {
    const m = new MB();
    if (kind === 'wood') {
      for (let i = 0; i < 6; i++) m.cyl(0.18, 0.18, 1.8, 7, (i % 3) * 0.38 - 0.38, 0.18 + Math.floor(i / 3) * 0.33, Math.floor(i / 3) * 0.05, i % 2 ? 0xa0693a : 0x8b5a2b, 0, 0, Math.PI / 2 + 0.0);
    } else if (kind === 'scrap') {
      m.box(1.4, 0.4, 1.2, 0, 0.2, 0, 0x7f8c8d, 0, 0.3, 0).box(0.8, 0.5, 0.6, 0.2, 0.55, 0.1, 0xa0522d, 0.3, 0.6, 0.2).cyl(0.06, 0.06, 1.2, 6, -0.3, 0.6, 0, 0x95a5a6, 0.5, 0, 1).box(0.5, 0.05, 0.7, -0.3, 0.45, -0.2, 0xb0bec5, 0.4, 0, 0.3).cyl(0.3, 0.3, 0.15, 10, 0.4, 0.75, -0.2, 0x34495e, 1.2, 0, 0);
    } else {
      m.box(1.0, 0.6, 0.8, 0, 0.3, 0, 0x5d6d7e).torus(0.2, 0.07, 0.2, 0.75, 0, 0xe09f3e, 1.2, 0, 0).torus(0.14, 0.05, -0.25, 0.68, 0.1, 0xb0bec5, 0.3, 0.5, 0).box(0.25, 0.25, 0.25, -0.2, 0.75, -0.2, 0x2e7d32);
    }
    return m.build();
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, vcMaterial()));
  return g;
}
