// Reusable building generators. Every building has a real interior: floors,
// walls with door openings and windows, collision, loot spots, containers and
// (where it makes sense) crafting benches.
// Local frame convention: building centred at origin, front faces local -Z.

export const T = 0.3; // wall thickness
export const FH = 3.2; // floor height

const WIN = (at, w = 1.4, y0 = 1.0, y1 = 2.2) => ({ at, w, y0, y1, glass: true });
const DOOR = (at, w = 1.4, leaf = true, color, inside = 1) => ({ at, w, y0: 0, y1: 2.4, door: leaf ? { inside, color } : null });

// Evenly place windows along a wall, avoiding [skip0, skip1] range
function windowsAlong(len, every = 3.2, skip = null, w = 1.4, y0, y1) {
  const out = [];
  const n = Math.max(1, Math.floor((len - 1.2) / every));
  const step = len / (n + 1);
  for (let i = 1; i <= n; i++) {
    const c = step * i;
    const a = c - w / 2;
    if (skip && a + w > skip[0] - 0.3 && a < skip[1] + 0.3) continue;
    if (a < 0.5 || a + w > len - 0.5) continue;
    out.push(WIN(a, w, y0, y1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// House: 1 or 2 floors, pitched roof, interior wall, stairs, furniture, loot.
// ---------------------------------------------------------------------------
export function house(F, o = {}) {
  const w = o.w || 10, d = o.d || 8, floors = o.floors || 1;
  const wallM = o.wallM || 'plaster', wallC = o.wallC ?? 0xf2e2c4;
  const roofC = o.roofC ?? 0xb5473a, floorC = o.floorC ?? 0xb08055, trim = o.trim ?? 0xffffff;
  const hw = w / 2, hd = d / 2;
  const rng = F.b.rng;
  // foundation + floor
  F.box(-hw - 0.15, 0, -hd - 0.15, hw + 0.15, 0.12, hd + 0.15, 'planks', floorC);
  // porch step
  F.box(-1.2, 0, -hd - 1.1, 1.2, 0.06, -hd - 0.15, 'concrete', 0xb9b2a6);
  const doorAt = w * 0.55;
  const stairsX0 = hw - T - 1.1, stairsX1 = hw - T - 0.05;
  const stairZ0 = -hd + T + 0.4, stairRun = 3.9;
  for (let f = 0; f < floors; f++) {
    const y0 = f * FH + (f === 0 ? 0.12 : 0);
    const h = f === 0 ? FH - 0.12 : FH;
    const fy = f === 0 ? 0.12 : f * FH + 0.2; // walkable floor height
    // front wall
    const frontOps = f === 0
      ? [DOOR(doorAt, 1.4, true, o.doorC ?? 0x7a4a24), WIN(0.8), WIN(w - 2.2)]
      : windowsAlong(w, 3.0);
    F.wallX(-hw, hw, -hd + T / 2, y0, h, T, wallM, wallC, frontOps);
    // back wall
    const backOps = f === 0 ? [DOOR(w - 2.6, 1.2, false), WIN(1.2)] : windowsAlong(w, 3.0);
    F.wallX(-hw, hw, hd - T / 2, y0, h, T, wallM, wallC, backOps);
    // side walls
    const sideSkip = (f === 0 && floors > 1) ? null : null;
    F.wallZ(-hd + T, hd - T, -hw + T / 2, y0, h, T, wallM, wallC, windowsAlong(d - 2 * T, 3.0, sideSkip));
    F.wallZ(-hd + T, hd - T, hw - T / 2, y0, h, T, wallM, wallC, floors > 1 && f === 0 ? [] : windowsAlong(d - 2 * T, 3.0));
    // interior wall with doorway
    const ix = -hw + w * 0.42;
    F.wallZ(-hd + T, hd - T, ix, y0, h, 0.2, 'plaster', o.innerC ?? 0xfaf3e3, [{ at: (d - 2 * T) / 2 - 0.6, w: 1.2, y0: 0, y1: 2.3 }]);
    // ceiling / next floor
    const ceilY = (f + 1) * FH;
    const hole = (f < floors - 1) ? [stairsX0 - 0.1, stairZ0 - 0.1, hw - T + 0.01, stairZ0 + stairRun + 0.15] : null;
    F.slab(-hw - 0.05, -hd - 0.05, hw + 0.05, hd + 0.05, ceilY + 0.2, 0.2, f < floors - 1 ? 'planks' : 'plaster', f < floors - 1 ? floorC : 0xeeeeee, hole);
    if (f < floors - 1) {
      F.stairsZ(stairsX0, stairsX1, stairZ0, y0, ceilY + 0.2 - y0, stairRun, 1, 'planks', 0x8a5d3b);
      // railing around the stair hole (open at the top of the stairs)
      F.box(stairsX0 - 0.2, ceilY + 0.2, stairZ0 - 0.1, stairsX0 - 0.1, ceilY + 1.2, stairZ0 + stairRun - 0.6, 'wood', 0x6b4426);
      F.box(stairsX0 - 0.2, ceilY + 0.2, stairZ0 - 0.2, hw - T, ceilY + 1.2, stairZ0 - 0.1, 'wood', 0x6b4426);
    }
    // furniture + loot per floor
    if (f === 0) {
      F.prop('sofa', -hw + 1.6, fy, hd - 1.0, 2);
      F.prop('table', -hw + 1.9, fy, 0.2, 0);
      F.container('fridge', hw - 0.8, fy, hd - 0.8, 2, 0);
      F.container('cabinet', (ix + hw) / 2 - 0.4, fy, hd - T - 0.35, 2, 0);
      F.loot(-hw + 1.2, fy, -hd + 1.3, 0, 'house');
      F.loot((ix + hw) / 2, fy, 0.3, 0, 'house');
      F.prop('plant', -hw + 0.6, fy, -hd + 0.6, 0);
    } else {
      F.prop('bed', -hw + 1.4, fy, hd - 1.4, 0);
      F.container('cabinet', -hw + 2.5, fy, -hd + T + 0.35, 0, 1);
      F.loot((ix + hw) / 2 - 0.5, fy, hd - 1.2, 1, 'house');
      F.loot(-hw + 1.0, fy, -hd + 1.4, 0, 'house');
    }
  }
  // roof
  const topY = floors * FH + 0.2;
  F.box(-hw - 0.3, topY - 0.01, -hd - 0.3, hw + 0.3, topY + 0.12, hd + 0.3, 'wood', trim);
  F.prism(-hw - 0.4, -hd - 0.5, hw + 0.4, hd + 0.5, topY + 0.1, o.roofH || 2.2, true, 'roof', roofC);
  if (o.chimney !== false) F.box(hw - 2, topY, 0.6, hw - 1.3, topY + 2.6, 1.3, 'brick', 0x9b4b3b, { col: false });
  if (rng.chance(0.5)) F.prop('bush', -hw - 0.7, 0, -hd - 0.8, 0);
  if (rng.chance(0.5)) F.prop('bush', hw + 0.7, 0, -hd - 0.8, 0);
  F.prop('lamp', 0, 2.5, -hd - 0.2, 0, 0.0001, { wallLamp: true });
}

// ---------------------------------------------------------------------------
// Garage / workshop: wide opening, crafting bench, tool chests, car.
// ---------------------------------------------------------------------------
export function garage(F, o = {}) {
  const w = o.w || 8, d = o.d || 9, h = o.h || 3.6;
  const hw = w / 2, hd = d / 2;
  const wallC = o.wallC ?? 0xd9d4c7, wallM = o.wallM || 'concrete';
  F.box(-hw, 0, -hd, hw, 0.05, hd, 'concrete', 0x9a9a95);
  F.wallX(-hw, hw, -hd + T / 2, 0.05, h, T, wallM, wallC, [{ at: 0.9, w: w - 1.8, y0: 0, y1: 3.0 }]);
  F.wallX(-hw, hw, hd - T / 2, 0.05, h, T, wallM, wallC, [WIN(1.0, 1.6, 1.3, 2.3)]);
  F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.05, h, T, wallM, wallC, [DOOR(d - 2 * T - 2.2, 1.2, true, 0x546e7a)]);
  F.wallZ(-hd + T, hd - T, hw - T / 2, 0.05, h, T, wallM, wallC, [WIN(1.6, 1.4, 1.3, 2.3)]);
  // rolled-up garage door
  F.box(-hw + 0.8, 2.95, -hd - 0.05, hw - 0.8, 3.45, -hd + 0.4, 'metal', o.doorC ?? 0xc0392b, { col: false });
  F.slab(-hw - 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, h + 0.05 + 0.25, 0.25, 'roofflat', o.roofC ?? 0x5d6d7e);
  if (o.car !== false) F.prop('car', -0.6, 0.05, -0.4, 0, 1, { color: o.carC ?? F.b.rng.pick([0x2e86de, 0xe74c3c, 0xf1c40f, 0x27ae60, 0x8e44ad]) });
  F.bench(hw - T - 0.5, 0.05, 1.2, 1);
  F.container('toolbox', hw - T - 0.35, 0.05, -1.5, 1, 1);
  F.prop('shelf', 0.6, 0.05, hd - T - 0.35, 2);
  F.loot(hw - 1.4, 0.05, -hd + 1.4, 1, 'garage');
  F.loot(-hw + 1.2, 0.05, 1.2, 1, 'garage');
  F.prop('barrel', hw - 0.6, 0.05, hd - 0.7, 0);
}

// ---------------------------------------------------------------------------
// Warehouse: big hall, two large openings, racks, mezzanine with stairs.
// ---------------------------------------------------------------------------
export function warehouse(F, o = {}) {
  const w = o.w || 24, d = o.d || 18, h = o.h || 7;
  const hw = w / 2, hd = d / 2;
  const wallC = o.wallC ?? 0x7f8c8d, wallM = o.wallM || 'corrugated';
  F.box(-hw, 0, -hd, hw, 0.05, hd, 'concrete', o.floorC ?? 0x8f8f8a);
  const bigW = Math.min(6, w * 0.3);
  F.wallX(-hw, hw, -hd + T / 2, 0.05, h, T, wallM, wallC, [
    { at: w / 2 - bigW / 2, w: bigW, y0: 0, y1: 4.8 },
    DOOR(1.5, 1.3, true, 0x34495e),
    ...[w * 0.78].map((a) => WIN(a, 2.4, 4.6, 5.8)),
  ]);
  F.wallX(-hw, hw, hd - T / 2, 0.05, h, T, wallM, wallC, [
    { at: w * 0.7 - bigW / 2, w: bigW, y0: 0, y1: 4.8 },
    WIN(w * 0.2, 2.4, 4.6, 5.8),
  ]);
  const sideWins = (len) => {
    const out = []; const n = Math.floor(len / 5);
    for (let i = 0; i < n; i++) out.push(WIN(2 + i * 5, 2.4, 4.6, 5.8));
    return out;
  };
  F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.05, h, T, wallM, wallC, [...sideWins(d - 2 * T - 4), DOOR(d - 2 * T - 2.0, 1.3, true, 0x34495e)]);
  F.wallZ(-hd + T, hd - T, hw - T / 2, 0.05, h, T, wallM, wallC, sideWins(d - 2 * T - 2));
  // roof with skylights
  const roofY = h + 0.05 + 0.3;
  F.box(-hw - 0.2, roofY - 0.3, -hd - 0.2, hw + 0.2, roofY, -2, 'roofflat', o.roofC ?? 0x566573);
  F.box(-hw - 0.2, roofY - 0.3, 2, hw + 0.2, roofY, hd + 0.2, 'roofflat', o.roofC ?? 0x566573);
  F.box(-hw - 0.2, roofY - 0.3, -2, -hw + 3, roofY, 2, 'roofflat', o.roofC ?? 0x566573);
  F.box(hw - 3, roofY - 0.3, -2, hw + 0.2, roofY, 2, 'roofflat', o.roofC ?? 0x566573);
  F.box(-hw + 3, roofY - 0.12, -2, hw - 3, roofY - 0.06, 2, 'glass', 0xcfe9ff, { glass: true });
  // mezzanine along back-left
  const mzY = 3.4, mzD = 4.2;
  const mx0 = -hw + T, mx1 = -hw + w * 0.55;
  F.box(mx0, mzY - 0.25, hd - T - mzD, mx1, mzY, hd - T, 'metalfloor', 0x707b7c);
  // support posts
  F.box(mx1 - 0.25, 0.05, hd - T - mzD, mx1, mzY - 0.25, hd - T - mzD + 0.25, 'metal', 0xf1c40f);
  F.box((mx0 + mx1) / 2, 0.05, hd - T - mzD, (mx0 + mx1) / 2 + 0.25, mzY - 0.25, hd - T - mzD + 0.25, 'metal', 0xf1c40f);
  // railing
  F.box(mx0 + 1.4, mzY, hd - T - mzD, mx1, mzY + 1.0, hd - T - mzD + 0.08, 'metal', 0xf1c40f);
  F.box(mx1 - 0.08, mzY, hd - T - mzD, mx1, mzY + 1.0, hd - T, 'metal', 0xf1c40f);
  // stairs up to mezzanine (rising toward +z along left wall)
  F.stairsZ(mx0 + 0.05, mx0 + 1.3, hd - T - mzD - 4.6, 0.05, mzY - 0.05, 4.6, 1, 'metalfloor', 0x7f8c8d);
  // racks (right half, clear of both big openings)
  if (w >= 16) {
    F.prop('rack', hw * 0.5, 0.05, -hd * 0.33, 0);
    F.prop('rack', hw * 0.5, 0.05, hd * 0.17, 0);
  }
  // goodies
  F.container('crate', hw - 1.5, 0.05, -hd + 1.5, 0, 1);
  F.container('ammobox', hw - 1.4, 0.05, -hd * 0.1, 1, 2);
  F.container('crate', -hw + 3.5, mzY, hd - T - 1.0, 0, 2);
  F.container('locker', mx1 - 1.2, mzY, hd - T - 0.45, 2, 1);
  F.bench(hw - T - 0.5, 0.05, hd - 4.5, 1);
  F.loot(0, 0.05, 0, 1, 'warehouse');
  F.loot(hw - 3, 0.05, -2.5, 2, 'warehouse');
  F.loot(-hw + 5, mzY, hd - T - 2.0, 2, 'warehouse');
  F.loot(-hw + 2, 0.05, -hd + 2, 1, 'warehouse');
  F.prop('pallet', hw - 4, 0.05, hd - 2, 0);
  F.prop('pallet', -hw * 0.5, 0.05, -hd + 1.5, 0);
  F.prop('crate', -hw + 1.0, 0.05, -hd * 0.33, 0);
}

// ---------------------------------------------------------------------------
// Log cabin
// ---------------------------------------------------------------------------
export function cabin(F, o = {}) {
  const w = o.w || 7, d = o.d || 6, h = 2.9;
  const hw = w / 2, hd = d / 2;
  const logC = o.wallC ?? 0x8b5a2b;
  F.box(-hw - 0.2, 0, -hd - 0.2, hw + 0.2, 0.25, hd + 0.2, 'planks', 0x6e4a2a);
  F.wallX(-hw, hw, -hd + T / 2, 0.25, h, T, 'logs', logC, [DOOR(w / 2 - 0.6, 1.2, true, 0x5a3a1a), WIN(0.8, 1.2, 1.0, 2.0)]);
  F.wallX(-hw, hw, hd - T / 2, 0.25, h, T, 'logs', logC, [WIN(w / 2 - 0.6, 1.2, 1.0, 2.0)]);
  F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.25, h, T, 'logs', logC, [WIN((d - 2 * T) / 2 - 0.6, 1.2, 1.0, 2.0)]);
  F.wallZ(-hd + T, hd - T, hw - T / 2, 0.25, h, T, 'logs', logC, []);
  F.slab(-hw - 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, h + 0.25 + 0.15, 0.15, 'planks', 0x6e4a2a);
  F.prism(-hw - 0.5, -hd - 0.6, hw + 0.5, hd + 0.6, h + 0.4, 1.9, true, 'roof', o.roofC ?? 0x4a3b30);
  if (o.snowRoof) F.prism(-hw - 0.55, -hd - 0.65, hw + 0.55, hd + 0.65, h + 0.5, 1.9, true, 'snow', 0xffffff);
  // fireplace
  F.box(hw - T - 0.7, 0.25, -0.8, hw - T, 1.6, 0.8, 'stone', 0x8d8d8d);
  F.box(hw - T - 0.4, 0.25, -0.5, hw - T, 4.8, 0.5, 'stone', 0x8d8d8d, { col: false });
  F.prop('bed', -hw + 1.2, 0.25, hd - 1.4, 0, 0.9);
  F.container('chest', -hw + 0.9, 0.25, -hd + 0.8, 1, o.tier ?? 0);
  F.loot(0.3, 0.25, 0.4, o.tier ?? 0, 'cabin');
  F.prop('table', 0.6, 0.25, hd - 1.1, 0, 0.8);
  F.light(hw - T - 0.8, 1, 0, 0xff8c3a, 1.2, 6);
}

// ---------------------------------------------------------------------------
// Adobe house (desert): flat roof with parapet + outside stairs to the roof.
// ---------------------------------------------------------------------------
export function adobe(F, o = {}) {
  const w = o.w || 9, d = o.d || 7, h = 3.4;
  const hw = w / 2, hd = d / 2;
  const c = o.wallC ?? 0xe0b07a;
  F.box(-hw, 0, -hd, hw, 0.1, hd, 'tile', 0xc98d5a);
  F.wallX(-hw, hw, -hd + T / 2, 0.1, h, 0.4, 'adobe', c, [DOOR(w / 2 - 0.6, 1.2, true, 0x5d4037), WIN(1.0, 1.0, 1.1, 2.0), WIN(w - 2.0, 1.0, 1.1, 2.0)]);
  F.wallX(-hw, hw, hd - T / 2, 0.1, h, 0.4, 'adobe', c, [WIN(w / 2 - 0.5, 1.0, 1.1, 2.0), { at: 1.0, w: 1.1, y0: 0, y1: 2.3 }]);
  F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.1, h, 0.4, 'adobe', c, [WIN((d - 2 * T) / 2 - 0.5, 1.0, 1.1, 2.0)]);
  F.wallZ(-hd + T, hd - T, hw - T / 2, 0.1, h, 0.4, 'adobe', c, [WIN((d - 2 * T) / 2 - 0.5, 1.0, 1.1, 2.0)]);
  const ry = h + 0.1 + 0.3;
  F.slab(-hw, -hd, hw, hd, ry, 0.3, 'adobe', c);
  // parapet with a gap where the outside stairs arrive
  F.box(-hw, ry, -hd, hw, ry + 0.8, -hd + 0.25, 'adobe', c);
  F.box(-hw, ry, hd - 0.25, hw - 1.4, ry + 0.8, hd, 'adobe', c);
  F.box(-hw, ry, -hd + 0.25, -hw + 0.25, ry + 0.8, hd - 0.25, 'adobe', c);
  F.box(hw - 0.25, ry, -hd + 0.25, hw, ry + 0.8, hd, 'adobe', c);
  // vigas (decorative beams)
  for (let i = -hw + 1; i < hw; i += 1.5) F.box(i, ry - 0.6, -hd - 0.5, i + 0.18, ry - 0.42, -hd, 'wood', 0x6d4c41, { col: false });
  // outside stairs along +x side rising toward +z, ending at the parapet gap
  F.stairsX(hd, hd + 1.3, hw - 1.4 - 4.8, 0, ry, 4.8, 1, 'adobe', 0xc99a66);
  F.container('cabinet', -hw + 1.0, 0.1, hd - T - 0.4, 2, 0);
  F.prop('table', 0.5, 0.1, 0.3, 0);
  F.loot(-hw + 1.2, 0.1, -hd + 1.2, 0, 'house');
  F.loot(hw - 1.5, ry, 0, 1, 'roof');
  F.prop('barrel', hw + 0.6, 0, -hd + 0.8, 0);
}

// ---------------------------------------------------------------------------
// Shipping container (hollow with open end, or solid)
// ---------------------------------------------------------------------------
export function shippingContainer(F, o = {}) {
  const L = 6.1, W = 2.44, H = 2.6, t = 0.1;
  const c = o.color ?? 0xc0392b;
  if (!o.open) {
    F.box(-L / 2, 0, -W / 2, L / 2, H, W / 2, 'container', c);
    return;
  }
  F.box(-L / 2, 0, -W / 2, L / 2, 0.12, W / 2, 'metalfloor', 0x5d4037);
  F.box(-L / 2, 0, -W / 2, L / 2, H, -W / 2 + t, 'container', c);
  F.box(-L / 2, 0, W / 2 - t, L / 2, H, W / 2, 'container', c);
  F.box(L / 2 - t, 0, -W / 2 + t, L / 2, H, W / 2 - t, 'container', c);
  F.box(-L / 2, H - t, -W / 2, L / 2, H, W / 2, 'container', c);
  if (o.bothOpen !== true) {
    // swung-open doors as decoration
    F.box(-L / 2 - 0.05, 0.1, -W / 2 - 1.15, -L / 2 + 0.05, H - 0.1, -W / 2, 'container', c, { col: true });
  } else {
    F.box(-L / 2, 0, -W / 2 + t, -L / 2 + 0.01, 0.01, W / 2 - t, 'container', c, { col: false, vis: false });
  }
  if (o.loot !== false) F.loot(0.5, 0.12, 0, o.tier ?? 1, 'container');
  if (o.crate) F.container('crate', 2.2, 0.12, 0, 0, o.tier ?? 1);
}

// ---------------------------------------------------------------------------
// Research facility: corridor with labs either side
// ---------------------------------------------------------------------------
export function facility(F, o = {}) {
  const w = o.w || 30, d = o.d || 20, h = 3.6;
  const hw = w / 2, hd = d / 2;
  const c = o.wallC ?? 0xdfe6e9, m = 'panel';
  F.box(-hw, 0, -hd, hw, 0.1, hd, 'tile', 0xbfc9ca);
  const cw = 3.2; // corridor width along x axis through the middle
  // outer walls
  F.wallX(-hw, hw, -hd + T / 2, 0.1, h, T, m, c, [WIN(2, 2, 1.1, 2.4), WIN(w - 4, 2, 1.1, 2.4), WIN(w / 2 - 6, 2, 1.1, 2.4), WIN(w / 2 + 4, 2, 1.1, 2.4)]);
  F.wallX(-hw, hw, hd - T / 2, 0.1, h, T, m, c, [WIN(2, 2, 1.1, 2.4), WIN(w - 4, 2, 1.1, 2.4), WIN(w / 2 - 6, 2, 1.1, 2.4), WIN(w / 2 + 4, 2, 1.1, 2.4)]);
  F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.1, h, T, m, c, [DOOR((d - 2 * T) / 2 - 0.8, 1.6, true, 0x2980b9)]);
  F.wallZ(-hd + T, hd - T, hw - T / 2, 0.1, h, T, m, c, [DOOR((d - 2 * T) / 2 - 0.8, 1.6, true, 0x2980b9, -1)]);
  // corridor walls (with doors into each lab)
  const labs = 3;
  const labW = (w - 2 * T) / labs;
  const corrOps = [];
  for (let i = 0; i < labs; i++) corrOps.push({ at: i * labW + labW / 2 - 0.6, w: 1.2, y0: 0, y1: 2.3, door: { inside: 1, color: 0x95a5a6 } });
  F.wallX(-hw + T, hw - T, -cw / 2, 0.1, h, 0.2, m, 0xecf0f1, corrOps.map((x) => ({ ...x, door: { inside: -1, color: 0x95a5a6 } })));
  F.wallX(-hw + T, hw - T, cw / 2, 0.1, h, 0.2, m, 0xecf0f1, corrOps);
  // lab dividers
  for (let i = 1; i < labs; i++) {
    const x = -hw + T + i * labW;
    F.wallZ(-hd + T, -cw / 2, x, 0.1, h, 0.2, m, 0xecf0f1, []);
    F.wallZ(cw / 2, hd - T, x, 0.1, h, 0.2, m, 0xecf0f1, []);
  }
  F.slab(-hw, -hd, hw, hd, h + 0.1 + 0.3, 0.3, 'roofflat', 0x95a5a6);
  // ceiling light panels
  for (let x = -hw + 3; x < hw - 2; x += 5) F.box(x - 0.6, h + 0.05, -0.3, x + 0.6, h + 0.1, 0.3, 'light', 0xffffff, { col: false, emissive: true });
  // lab contents
  for (let i = 0; i < labs; i++) {
    const cx = -hw + T + i * labW + labW / 2;
    // south labs (z < 0)
    F.prop('counter', cx, 0.1, -hd + T + 0.45, 0);
    F.container(i === 1 ? 'safe' : 'locker', cx + labW / 2 - 0.8, 0.1, -cw / 2 - 0.5, 2, i === 1 ? 2 : 1);
    F.loot(cx - 1.5, 0.1, -hd + 2.5, 2, 'lab');
    // north labs (z > 0)
    if (i === 1) F.bench(cx, 0.1, hd - T - 0.55, 2);
    else F.prop('counter', cx, 0.1, hd - T - 0.45, 2);
    F.container('locker', cx - labW / 2 + 0.7, 0.1, cw / 2 + 0.45, 0, 1);
    F.loot(cx + 1.2, 0.1, hd - 2.6, i === 1 ? 2 : 1, 'lab');
  }
  F.loot(-hw + 3, 0.1, 0, 1, 'corridor');
  F.loot(hw - 3, 0.1, 0, 1, 'corridor');
  F.prop('vending', 0, 0.1, -cw / 2 + 0.45, 0);
}

// ---------------------------------------------------------------------------
// Two-storey office / saloon style building with exterior balcony stairs
// ---------------------------------------------------------------------------
export function office(F, o = {}) {
  const w = o.w || 14, d = o.d || 10;
  const hw = w / 2, hd = d / 2;
  const c = o.wallC ?? 0xbdc3c7, m = o.wallM || 'concrete';
  F.box(-hw, 0, -hd, hw, 0.1, hd, 'tile', o.floorC ?? 0xa0a4a8);
  const stairsX0 = -hw + T + 0.05, stairsX1 = -hw + T + 1.25;
  const sz0 = hd - T - 4.0 - 1.4;
  for (let f = 0; f < 2; f++) {
    const y0 = f * FH + (f === 0 ? 0.1 : 0);
    const h = f === 0 ? FH - 0.1 : FH;
    const fy = f === 0 ? 0.1 : FH + 0.2;
    F.wallX(-hw, hw, -hd + T / 2, y0, h, T, m, c, f === 0 ? [DOOR(w / 2 - 0.8, 1.6, true, o.doorC ?? 0x2c3e50), WIN(1.2, 2.2), WIN(w - 3.4, 2.2)] : windowsAlong(w, 3.2, null, 2.0));
    F.wallX(-hw, hw, hd - T / 2, y0, h, T, m, c, f === 0 ? [WIN(w - 3.4, 2.2), DOOR(3.0, 1.2, false)] : windowsAlong(w, 3.2, null, 2.0));
    F.wallZ(-hd + T, hd - T, -hw + T / 2, y0, h, T, m, c, f === 0 ? [] : windowsAlong(d - 2 * T, 3.2));
    F.wallZ(-hd + T, hd - T, hw - T / 2, y0, h, T, m, c, windowsAlong(d - 2 * T, 3.2));
    const ceil = (f + 1) * FH + 0.2;
    F.slab(-hw - 0.05, -hd - 0.05, hw + 0.05, hd + 0.05, ceil, 0.2, f === 0 ? 'tile' : 'roofflat', f === 0 ? (o.floorC ?? 0xa0a4a8) : 0x7f8c8d,
      f === 0 ? [stairsX0 - 0.05, sz0 - 0.1, stairsX1 + 0.2, sz0 + 4.0] : null);
    if (f === 0) {
      F.stairsZ(stairsX0, stairsX1, sz0, 0.1, ceil - 0.1, 4.0, 1, 'tile', 0x8d9399);
      F.box(stairsX1 + 0.2, ceil, sz0 - 0.1, stairsX1 + 0.3, ceil + 1.0, sz0 + 3.0, 'metal', 0x34495e);
      F.box(stairsX0, ceil, sz0 - 0.2, stairsX1 + 0.3, ceil + 1.0, sz0 - 0.1, 'metal', 0x34495e);
      F.box(0.5, 0.1, -0.5, 3.5, 1.05, 0.4, 'wood', 0x795548); // reception desk
      F.container('cabinet', hw - 1.0, 0.1, hd - T - 0.4, 2, 1);
      F.loot(hw - 2, 0.1, -hd + 1.6, 1, 'office');
      F.loot(-hw + 3, 0.1, -1.0, 0, 'office');
      F.prop('plant', hw - 0.6, 0.1, -hd + 0.6, 0);
    } else {
      F.wallX(-hw + T, hw - T, -1.0, fy, h - 0.2, 0.2, 'plaster', 0xecf0f1, [{ at: 3.0, w: 1.2, y0: 0, y1: 2.3 }, { at: w - 5, w: 1.2, y0: 0, y1: 2.3 }]);
      F.container('locker', hw - 0.8, fy, -hd + T + 0.4, 0, 1);
      F.container('safe', hw - 1.0, fy, hd - T - 0.5, 2, 2);
      F.prop('table', 0, fy, -2.5, 0);
      F.loot(-1.0, fy, -hd + 1.3, 1, 'office');
      F.loot(2.5, fy, hd - 1.5, 2, 'office');
      if (o.bench) F.bench(-hw + 3.5, fy, hd - T - 0.55, 2);
    }
  }
  // roof parapet
  const ry = 2 * FH + 0.2;
  F.box(-hw, ry, -hd, hw, ry + 0.6, -hd + 0.2, m, c);
  F.box(-hw, ry, hd - 0.2, hw, ry + 0.6, hd, m, c);
  F.box(-hw, ry, -hd, -hw + 0.2, ry + 0.6, hd, m, c);
  F.box(hw - 0.2, ry, -hd, hw, ry + 0.6, hd, m, c);
  F.prop('ac', hw - 2, ry, 0, 0);
  if (o.sign) F.box(-hw + 1, ry + 0.6, -hd - 0.1, hw - 1, ry + 1.8, -hd + 0.1, 'sign', o.signC ?? 0xe74c3c, { col: false });
}

// ---------------------------------------------------------------------------
// Mall shop unit (front faces -Z towards the corridor)
// ---------------------------------------------------------------------------
export function shop(F, o = {}) {
  const w = o.w || 10, d = o.d || 9, h = o.h || 4.0;
  const hw = w / 2, hd = d / 2;
  const c = o.wallC ?? 0xf5f5f5;
  const accent = o.accent ?? 0xe84393;
  F.box(-hw, 0, -hd, hw, 0.08, hd, 'tile', o.floorC ?? 0xd6d6d6);
  // storefront: glass panes with a wide entrance
  F.wallX(-hw, hw, -hd + 0.1, 0.08, h, 0.2, 'panel', accent, [
    { at: 0.4, w: hw - 1.8, y0: 0.4, y1: 3.0, glass: true },
    { at: hw - 1.2, w: 2.4, y0: 0, y1: 3.0 },
    { at: hw + 1.4, w: hw - 1.8, y0: 0.4, y1: 3.0, glass: true },
  ]);
  if (!o.noBackWall) F.wallX(-hw, hw, hd - 0.1, 0.08, h, 0.2, 'plaster', c, [{ at: w - 2, w: 1.1, y0: 0, y1: 2.3, door: { inside: -1, color: 0x7f8c8d } }]);
  if (!o.noLeft) F.wallZ(-hd + 0.2, hd - 0.2, -hw + 0.1, 0.08, h, 0.2, 'plaster', c, []);
  if (!o.noRight) F.wallZ(-hd + 0.2, hd - 0.2, hw - 0.1, 0.08, h, 0.2, 'plaster', c, []);
  // sign above storefront
  F.box(-hw + 0.5, h - 0.7, -hd - 0.12, hw - 0.5, h - 0.1, -hd + 0.0, 'sign', accent, { col: false, emissive: true });
  F.prop('counter', -hw + 2.0, 0.08, hd - 2.2, 0);
  F.prop('shelf', hw - 1.0, 0.08, 0, 1);
  F.prop('shelf', 0.8, 0.08, 1.2, 0);
  F.container(o.container || 'cabinet', -hw + 1.0, 0.08, hd - 0.6, 2, o.tier ?? 1);
  F.loot(-1.5, 0.08, -1.0, o.tier ?? 0, 'shop');
  F.loot(hw - 2.5, 0.08, hd - 1.5, o.tier ?? 1, 'shop');
  if (o.bench) F.bench(hw - 1.2, 0.08, hd - 1.2, 2);
}

// ---------------------------------------------------------------------------
// Fence along x or z (with collision)
// ---------------------------------------------------------------------------
export function fence(b, x0, z0, x1, z1, h = 1.2, color = 0xd7ccc8, m = 'planks') {
  const t = 0.12;
  if (Math.abs(z1 - z0) < 0.01) b.box(Math.min(x0, x1), 0, z0 - t / 2, Math.max(x0, x1), h, z0 + t / 2, m, color);
  else b.box(x0 - t / 2, 0, Math.min(z0, z1), x0 + t / 2, h, Math.max(z0, z1), m, color);
}

// Invisible + visible boundary around map bounds
export function boundary(b, size, style = {}) {
  const { minX, maxX, minZ, maxZ } = size;
  const h = style.h ?? 6;
  const m = style.m || 'fence', c = style.c ?? 0x6d4c41;
  const vis = style.visible !== false;
  const th = 0.5;
  b.box(minX - th, -2, minZ - th, maxX + th, h, minZ, m, c, { vis });
  b.box(minX - th, -2, maxZ, maxX + th, h, maxZ + th, m, c, { vis });
  b.box(minX - th, -2, minZ, minX, h, maxZ, m, c, { vis });
  b.box(maxX, -2, minZ, maxX + th, h, maxZ, m, c, { vis });
  // tall invisible walls so nobody jumps out
  b.box(minX - th, h, minZ - th, maxX + th, 40, minZ, m, c, { vis: false });
  b.box(minX - th, h, maxZ, maxX + th, 40, maxZ + th, m, c, { vis: false });
  b.box(minX - th, h, minZ, minX, 40, maxZ, m, c, { vis: false });
  b.box(maxX, h, minZ, maxX + th, 40, maxZ, m, c, { vis: false });
}
