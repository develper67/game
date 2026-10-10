import { MapBuilder } from '../mapbuilder.js';
import { boundary, bridgeX, bridgeZ } from '../buildings.js';
import { Reserve, overlay, winningTable } from './common.js';

export const meta = {
  id: 'rooftop',
  name: 'Rooftop Chaos',
  desc: 'Nine city rooftops linked by bridges and ramps high above the streets. Don’t look down!',
  size: { minX: -52, maxX: 52, minZ: -52, maxZ: 52 },
  theme: {
    skyTop: 0x34295f, skyBottom: 0xff9e72, fog: 0xe4a08a, fogNear: 60, fogFar: 230,
    ground: { m: 'asphalt', c: 0x55555c }, sun: { color: 0xffc89a, intensity: 2.4, dir: [-0.7, 0.6, 0.4] },
    hemi: { sky: 0xffd2b0, ground: 0x5a4a6a, intensity: 1.2 }, cloud: 0xffd9c4,
  },
  noGround: true,
  killY: 2,
  weather: null,
  preview: { pos: [58, 42, 58], look: [0, 12, 0] },
};

const HALF = 11; // building half size
const CENTERS = [-34, 0, 34];
const H = [
  [12, 14, 12],
  [14, 16, 14],
  [12, 14, 13],
];
const WALL_COLORS = [0x8d99ae, 0xb08968, 0x6c757d, 0xa3b18a, 0x9a8c98, 0xbc6c25, 0x7f8c8d, 0xc9ada7, 0x84a59d];
const DOOR = (at, w = 1.2, color = 0x546e7a, inside = 1) => ({ at, w, y0: 0, y1: 2.3, door: { inside, color } });
const WIN = (at, w = 1.2, y0 = 1.0, y1 = 2.1) => ({ at, w, y0, y1, glass: true });

export function build() {
  const b = new MapBuilder('rooftop', 31337);
  const R = new Reserve();
  const rng = b.rng;
  boundary(b, meta.size, { visible: false, h: 30 });
  // street level far below (visual only) + distant skyline
  b.box(-140, -1, -140, 140, 0, 140, 'asphalt', 0x4a4a52, { col: false });
  for (const v of [-17, 17]) { overlay(b, v - 6, -140, v + 6, 140, 'asphalt', 0x3d3d44, 0.02); overlay(b, -140, v - 6, 140, v + 6, 'asphalt', 0x3d3d44, 0.02); }
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, r = 80 + rng() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, w = 10 + rng() * 14, hh = 18 + rng() * 45;
    b.box(x - w / 2, 0, z - w / 2, x + w / 2, hh, z + w / 2, 'panel', rng.pick([0x5c5470, 0x6d6875, 0x4a4e69, 0x7a6c8a]), { col: false });
    for (let y = 5; y < hh - 3; y += 6.5) b.box(x - w / 2 - 0.05, y, z - w / 2 - 0.05, x + w / 2 + 0.05, y + 0.9, z + w / 2 + 0.05, 'light', 0xc9a66b, { col: false, emissive: true });
  }

  // which sides of each roof have connectors: key "r,c,side" -> offset
  const conn = new Map();
  const addConn = (r, c, side, off) => { const k = `${r},${c},${side}`; if (!conn.has(k)) conn.set(k, []); conn.get(k).push(off); };
  const F0 = b.frame(0, 0, 0);
  // horizontal neighbours (along x)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const ax = CENTERS[c], bx = CENTERS[c + 1], z = CENTERS[r] + (r === 1 ? -5 : 4), za = z - CENTERS[r];
    const ha = H[r][c], hb = H[r][c + 1];
    const x0 = ax + HALF, x1 = bx - HALF;
    if (ha === hb) bridgeX(F0, x0, x1, z, ha, 2.4, 0x8d6e63);
    else if (ha < hb) { F0.rampX(z - 1.2, z + 1.2, x0, ha, hb - ha, x1 - x0, 1, 'metalfloor', 0x9aa0a6); rampRails(b, x0, x1, z, Math.min(ha, hb), Math.max(ha, hb), 'x'); }
    else { F0.rampX(z - 1.2, z + 1.2, x1, hb, ha - hb, x1 - x0, -1, 'metalfloor', 0x9aa0a6); rampRails(b, x0, x1, z, Math.min(ha, hb), Math.max(ha, hb), 'x'); }
    addConn(r, c, 'E', za); addConn(r, c + 1, 'W', za);
  }
  // vertical neighbours (along z)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const az = CENTERS[r], bz = CENTERS[r + 1], x = CENTERS[c] + (c === 1 ? 5 : -4), xa = x - CENTERS[c];
    const ha = H[r][c], hb = H[r + 1][c];
    const z0 = az + HALF, z1 = bz - HALF;
    if (ha === hb) bridgeZ(F0, z0, z1, x, ha, 2.4, 0x8d6e63);
    else if (ha < hb) { F0.rampZ(x - 1.2, x + 1.2, z0, ha, hb - ha, z1 - z0, 1, 'metalfloor', 0x9aa0a6); rampRails(b, z0, z1, x, Math.min(ha, hb), Math.max(ha, hb), 'z'); }
    else { F0.rampZ(x - 1.2, x + 1.2, z1, hb, ha - hb, z1 - z0, -1, 'metalfloor', 0x9aa0a6); rampRails(b, z0, z1, x, Math.min(ha, hb), Math.max(ha, hb), 'z'); }
    addConn(r, c, 'S', xa); addConn(r + 1, c, 'N', xa);
  }

  let idx = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cx = CENTERS[c], cz = CENTERS[r], h = H[r][c];
    const wc = WALL_COLORS[idx++];
    // building body
    b.box(cx - HALF, 0, cz - HALF, cx + HALF, h, cz + HALF, 'concrete', wc);
    for (let y = 2.5; y < h - 1.5; y += 3.2) {
      b.box(cx - HALF - 0.06, y, cz - HALF - 0.06, cx + HALF + 0.06, y + 1.3, cz + HALF + 0.06, 'glass', 0x2b3a55, { col: false });
    }
    overlay(b, cx - HALF + 0.3, cz - HALF + 0.3, cx + HALF - 0.3, cz + HALF - 0.3, 'roofflat', 0x7b7f86, h + 0.02);
    // parapets with gaps for connectors
    const F = b.frame(cx, cz, 0, h);
    const gaps = (side) => (conn.get(`${r},${c},${side}`) || []).map((off) => ({ at: off + HALF - 1.4, w: 2.8, y0: 0, y1: 1.2 }));
    F.wallX(-HALF, HALF, -HALF + 0.15, 0, 0.9, 0.3, 'concrete', 0xd6d6d6, gaps('N'));
    F.wallX(-HALF, HALF, HALF - 0.15, 0, 0.9, 0.3, 'concrete', 0xd6d6d6, gaps('S'));
    F.wallZ(-HALF + 0.3, HALF - 0.3, -HALF + 0.15, 0, 0.9, 0.3, 'concrete', 0xd6d6d6, gaps('W'));
    F.wallZ(-HALF + 0.3, HALF - 0.3, HALF - 0.15, 0, 0.9, 0.3, 'concrete', 0xd6d6d6, gaps('E'));
    decorateRoof(b, F, r, c, h, rng);
    R.add(cx - HALF, cz - HALF, cx + HALF, cz + HALF);
  }
  return b.build(meta);
}

function rampRails(b, a0, a1, at, ylo, yhi, axis) {
  // invisible safety walls + visible posts along both sides of a ramp
  const n = 6;
  for (const s of [-1.3, 1.3]) {
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t;
      const y = ylo + (yhi - ylo) * t;
      if (axis === 'x') b.box(a - 0.05, y - 0.3, at + s - 0.05, a + 0.05, y + 1.0, at + s + 0.05, 'metal', 0x37474f, { col: false });
      else b.box(at + s - 0.05, y - 0.3, a - 0.05, at + s + 0.05, y + 1.0, a + 0.05, 'metal', 0x37474f, { col: false });
    }
    const seg = 12;
    for (let i = 0; i < seg; i++) {
      const ta = i / seg, tb = (i + 1) / seg;
      const p0 = a0 + (a1 - a0) * ta, p1 = a0 + (a1 - a0) * tb;
      const ytop = ylo + (yhi - ylo) * tb + 1.0;
      if (axis === 'x') b.box(Math.min(p0, p1), ylo, at + s - 0.08, Math.max(p0, p1), ytop, at + s + 0.08, 'metal', 0, { vis: false });
      else b.box(at + s - 0.08, ylo, Math.min(p0, p1), at + s + 0.08, ytop, Math.max(p0, p1), 'metal', 0, { vis: false });
    }
  }
}

// Rooftop structures per building (local frame centered on the roof at y=0)
function decorateRoof(b, F, r, c, h, rng) {
  const key = r * 3 + c;
  const hut = (x, z, rot, tier, bench) => {
    const G = F.sub(x, z, rot);
    const w = 4.4, d = 4.0, hh = 2.9;
    G.wallX(-w / 2, w / 2, -d / 2 + 0.12, 0, hh, 0.24, 'brick', 0xb5651d, [DOOR(w / 2 - 0.6, 1.2)]);
    G.wallX(-w / 2, w / 2, d / 2 - 0.12, 0, hh, 0.24, 'brick', 0xb5651d, [WIN(w / 2 - 0.6)]);
    G.wallZ(-d / 2 + 0.24, d / 2 - 0.24, -w / 2 + 0.12, 0, hh, 0.24, 'brick', 0xb5651d, []);
    G.wallZ(-d / 2 + 0.24, d / 2 - 0.24, w / 2 - 0.12, 0, hh, 0.24, 'brick', 0xb5651d, []);
    G.box(-w / 2 - 0.15, hh, -d / 2 - 0.15, w / 2 + 0.15, hh + 0.25, d / 2 + 0.15, 'roofflat', 0x6d6d6d);
    G.box(-w / 2 + 0.3, hh - 0.05, -d / 2 + 0.3, w / 2 - 0.3, hh, d / 2 - 0.3, 'light', 0xfff3c4, { col: false, emissive: true });
    if (bench) G.bench(0, 0, d / 2 - 0.7, 2);
    else G.container(tier >= 2 ? 'safe' : 'locker', w / 2 - 0.6, 0, d / 2 - 0.5, 2, tier);
    G.loot(-0.9, 0, 0.1, tier, 'hut');
  };
  const greenhouse = (x, z, rot) => {
    const G = F.sub(x, z, rot);
    const w = 6, d = 8, hh = 2.8;
    const panes = (len) => { const o = []; for (let a = 0.3; a < len - 1.2; a += 1.6) o.push(WIN(a, 1.3, 0.6, 2.5)); return o; };
    G.wallX(-w / 2, w / 2, -d / 2 + 0.06, 0, hh, 0.12, 'metal', 0xeeeeee, [DOOR(w / 2 - 0.6, 1.2, 0x9aa5b1)]);
    G.wallX(-w / 2, w / 2, d / 2 - 0.06, 0, hh, 0.12, 'metal', 0xeeeeee, panes(w));
    G.wallZ(-d / 2 + 0.12, d / 2 - 0.12, -w / 2 + 0.06, 0, hh, 0.12, 'metal', 0xeeeeee, panes(d - 0.24));
    G.wallZ(-d / 2 + 0.12, d / 2 - 0.12, w / 2 - 0.06, 0, hh, 0.12, 'metal', 0xeeeeee, panes(d - 0.24));
    G.box(-w / 2, hh, -d / 2, w / 2, hh + 0.08, d / 2, 'glass', 0xcfe9ff, { glass: true });
    G.prop('plant', -1.8, 0, 2, 0, 1.2); G.prop('plant', 1.8, 0, 2.6, 0, 1.0); G.prop('plant', -1.8, 0, -0.5, 0, 1.3);
    G.bench(1.6, 0, -0.4, 1);
    G.loot(0, 0, 1.2, 1, 'greenhouse');
  };
  const ac = (x, z) => F.prop('ac', x, 0, z, 0, 1);
  switch (key) {
    case 0: hut(-5, -5, 1, 1, false); ac(5, 5); ac(5, 1.5); F.resource('scrap', -6, 0, 6); F.loot(6, 0, -6, 0, 'roof'); F.spawn(2, 0.05, -7, 0); F.spawn(-2, 0.05, 6, Math.PI); break;
    case 1: greenhouse(-4, 3, 0); F.prop('watertower', 5, 0, -5, 0, 0.8); F.resource('wood', 6, 0, 6); F.loot(-6, 0, -7, 1, 'roof'); F.spawn(4, 0.05, 2, 0); F.spawn(-7, 0.05, -4, 1.57); break;
    case 2: hut(5, 5, 2, 2, false); ac(-5, -5); F.prop('antenna', -6, 0, 6, 0, 0.7); F.resource('parts', 6, 0, -6); F.loot(-2, 0, 0, 1, 'roof'); F.spawn(-4, 0.05, -1, 0); F.spawn(2, 0.05, -8, 0); break;
    case 3: hut(-6, 5, 1, 1, true); ac(5, -6); ac(5, -2.5); F.loot(4, 0, 6, 1, 'roof'); F.resource('scrap', -5, 0, -6); F.spawn(2, 0.05, 2, 0); F.spawn(-3, 0.05, -8, 0); break;
    case 4: {
      // centre: helipad with the winning table + penthouse corner rooms
      F.box(-5, 0.02, -5, 5, 0.04, 5, 'paint', 0x3b3b3b, { col: false });
      F.box(-3.4, 0.04, -0.4, 3.4, 0.06, 0.4, 'paint', 0xffd23f, { col: false });
      F.box(-3.4, 0.04, -3.4, -2.6, 0.06, 3.4, 'paint', 0xffd23f, { col: false });
      F.box(2.6, 0.04, -3.4, 3.4, 0.06, 3.4, 'paint', 0xffd23f, { col: false });
      winningTable(F.b, F.ox, h, F.oz);
      hut(-7, -7, 1, 2, false); hut(7, 7, 3, 2, true);
      F.loot(7, 0, -7, 2, 'roof'); F.loot(-7, 0, 7, 2, 'roof');
      break;
    }
    case 5: greenhouse(4, -3, 2); ac(-6, 6); F.resource('wood', -6, 0, -6); F.loot(-2, 0, 6, 1, 'roof'); F.spawn(-5, 0.05, 1, 1.57); F.spawn(6, 0.05, 7, 0); break;
    case 6: hut(5, -5, 3, 1, false); F.prop('watertower', -5, 0, 5, 0, 0.8); F.resource('parts', 6, 0, 6); F.loot(-6, 0, -6, 0, 'roof'); F.spawn(-1, 0.05, -2, 0); F.spawn(2, 0.05, 7, Math.PI); break;
    case 7: hut(-5, 5, 0, 1, false); ac(5, 5); ac(6, -6); F.resource('scrap', -6, 0, -6); F.loot(2, 0, -2, 1, 'roof'); F.spawn(-2, 0.05, -6, 0); F.spawn(7, 0.05, 1, -1.57); break;
    case 8: hut(-5, -5, 0, 2, true); F.prop('antenna', 6, 0, 6, 0, 0.7); F.resource('wood', 5, 0, -6); F.loot(-6, 0, 6, 1, 'roof'); F.spawn(3, 0.05, 2, 0); F.spawn(-2, 0.05, 7, Math.PI); break;
    default:
  }
  // extra searchable crates + loot on every roof
  const extra = { 0: [['crate', 8.5, -8.5]], 1: [['ammobox', -8.5, 8.5]], 2: [['crate', -8.5, -8.5]], 3: [['crate', 8.5, 8.5]], 4: [['ammobox', -8.5, 3], ['crate', 8.5, -3]],
    5: [['crate', -8.5, -8.5]], 6: [['crate', 8.5, -0.5]], 7: [['ammobox', -8.5, -1]], 8: [['crate', 8.5, 8.5]] };
  for (const [kind, x, z] of extra[key] || []) F.container(kind, x, 0, z, 0, kind === 'ammobox' ? 2 : 1);
  F.loot(0.5, 0, -8.6, key === 4 ? 2 : 0, 'roof');

  // item spawns: inside huts / greenhouses on outer buildings
  const spawnsFor = { 0: [-5, -5, 0.05], 2: [5, 5, 0.05], 3: [-6, 5, 0.05], 5: [4, -3, 0.05], 6: [5, -5, 0.05], 8: [-5, -5, 0.05] };
  if (spawnsFor[key]) { const [x, z, y] = spawnsFor[key]; const p = F.point(x, y, z); F.b.grab.itemSpawns.push(p); }
}
