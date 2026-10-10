import { MapBuilder } from '../mapbuilder.js';
import { house, garage, warehouse, cabin, fence, boundary } from '../buildings.js';
import { Reserve, footprint, scatter, overlay, roadX, roadZ, winningTable } from './common.js';

export const meta = {
  id: 'forest',
  name: 'Forest Town',
  desc: 'A sleepy town of houses, garages and a lumber mill, wrapped in thick pine woods.',
  size: { minX: -62, maxX: 62, minZ: -62, maxZ: 62 },
  theme: {
    skyTop: 0x4a9ff5, skyBottom: 0xcfe9ff, fog: 0xbfe0f5, fogNear: 45, fogFar: 150,
    ground: { m: 'grass', c: 0x6abf4b }, sun: { color: 0xfff1d6, intensity: 2.2, dir: [0.5, 1, 0.35] },
    hemi: { sky: 0xcfe9ff, ground: 0x5a7d3a, intensity: 1.15 },
  },
  killY: -20,
  weather: null,
  preview: { pos: [52, 40, 52], look: [0, 0, 0] },
};

export function build() {
  const b = new MapBuilder('forest', 7331);
  const R = new Reserve();
  const S = meta.size;
  boundary(b, S, { m: 'fence', c: 0x5d4037, h: 2.2 });

  // Roads
  roadX(b, -62, 62, 0, 8);
  roadZ(b, -62, -4, 0, 7);
  roadZ(b, 4, 30, 0, 7);
  R.add(-62, -4.5, 62, 4.5);
  R.add(-4, -62, 4, 30);
  // Plaza in the middle with the winning table
  overlay(b, -9, -9, 9, 9, 'cobble', 0xb8b1a3, 0.03);
  R.add(-10, -10, 10, 10);
  winningTable(b, 0, 0.03, 0);
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) b.prop('lamp', x, 0, z, 0, 1);
  b.prop('bench', -6, 0.03, 0, Math.PI / 2, 1);
  b.prop('bench', 6, 0.03, 0, -Math.PI / 2, 1);

  // North side houses (front faces road = -Z, r=0)
  const north = [
    { x: -38, z: 15, kind: 'house', o: { w: 10, d: 8, floors: 2, wallC: 0xf2e2c4, roofC: 0xb5473a } },
    { x: -22, z: 15, kind: 'house', o: { w: 10, d: 8, floors: 1, wallC: 0xbfd7ea, roofC: 0x34495e } },
    { x: 20, z: 15, kind: 'house', o: { w: 10, d: 8, floors: 2, wallC: 0xffe0b2, roofC: 0x6d4c41 } },
    { x: 36, z: 15, kind: 'garage', o: { w: 8, d: 9 } },
  ];
  const south = [
    { x: -38, z: -15, kind: 'garage', o: { w: 8, d: 9, doorC: 0x2980b9 } },
    { x: -22, z: -15, kind: 'house', o: { w: 10, d: 8, floors: 1, wallC: 0xd5f5e3, roofC: 0x1e8449 } },
    { x: 20, z: -15, kind: 'garage', o: { w: 11, d: 9, doorC: 0x27ae60, car: true } },
    { x: 36, z: -15, kind: 'house', o: { w: 10, d: 8, floors: 2, wallC: 0xfadbd8, roofC: 0x922b21 } },
  ];
  for (const h of north) {
    const F = b.frame(h.x, h.z, 0);
    if (h.kind === 'house') house(F, h.o); else garage(F, h.o);
    R.add(...footprint(h.x, h.z, h.o.w + 2, h.o.d + 3, 0));
    // little front path
    overlay(b, h.x - 0.8 + (h.kind === 'house' ? h.o.w * 0.05 + 0.75 : 0), 4, h.x + 0.8 + (h.kind === 'house' ? h.o.w * 0.05 + 0.75 : 0), h.z - h.o.d / 2 - 0.2, 'cobble', 0xa79e8f, 0.025);
  }
  for (const h of south) {
    const F = b.frame(h.x, h.z, 2);
    if (h.kind === 'house') house(F, h.o); else garage(F, h.o);
    R.add(...footprint(h.x, h.z, h.o.w + 2, h.o.d + 3, 0));
  }
  // Fences behind north houses (back yards)
  for (const h of north) {
    if (h.kind !== 'house') continue;
    fence(b, h.x - 6.5, h.z + 10, h.x + 6.5, h.z + 10, 1.1, 0xf5f5f5);
    fence(b, h.x - 6.5, h.z + 5, h.x - 6.5, h.z + 10, 1.1, 0xf5f5f5);
    R.add(h.x - 7, h.z + 4, h.x + 7, h.z + 10.5);
  }

  // Lumber mill (warehouse) north of town
  {
    const F = b.frame(0, 42, 0);
    warehouse(F, { w: 22, d: 16, h: 7, wallC: 0x9c6b3e, wallM: 'planks', roofC: 0x4e342e });
    R.add(...footprint(0, 42, 26, 22, 0));
    overlay(b, -3.5, 30, 3.5, 34, 'dirt', 0x8d6e4a, 0.02);
    // log piles outside = wood resource nodes
    b.resource('wood', -14, 0, 34);
    b.resource('wood', 14, 0, 34);
    b.prop('log', -15, 0, 37, 0, 1);
    b.prop('log', 15, 0, 37.5, 0, 1);
  }

  // Cabins in the woods
  {
    const F = b.frame(-45, 42, 1);
    cabin(F, { w: 7, d: 6, tier: 1 });
    R.add(...footprint(-45, 42, 10, 9, 1));
    const G = b.frame(46, -44, 3);
    cabin(G, { w: 7, d: 6, tier: 1 });
    R.add(...footprint(46, -44, 10, 9, 3));
    const H = b.frame(-46, -45, 0);
    cabin(H, { w: 6, d: 6, tier: 0, wallC: 0x7b4f2c });
    R.add(...footprint(-46, -45, 9, 9, 0));
  }
  // Forest workshop shed with a crafting bench (south woods)
  {
    const F = b.frame(14, -44, 0);
    garage(F, { w: 7, d: 8, car: false, wallC: 0x8d6e63, wallM: 'planks', doorC: 0x6d4c41 });
    R.add(...footprint(14, -44, 9, 10, 0));
  }

  // Resource nodes for Scavenge & Craft
  const resSpots = [
    ['wood', -30, 30], ['wood', 30, 34], ['wood', -52, 10], ['wood', 52, 12], ['wood', -20, -40], ['wood', 30, -52],
    ['scrap', 42, 6.5], ['scrap', -44, -7], ['scrap', 26, -26], ['scrap', -12, 30],
    ['parts', 8, -30], ['parts', -32, -28],
  ];
  for (const [k, x, z] of resSpots) { b.resource(k, x, 0, z); R.addCentered(x, z, 2.4, 2.4); }

  // Outdoor loot and a few hidden caches in the woods
  const outLoot = [[-52, 30, 1], [50, 30, 0], [-12, -50, 1], [54, -20, 0], [-55, -22, 0], [28, 46, 1], [-26, 50, 0], [6, 55, 1]];
  for (const [x, z, t] of outLoot) { b.loot(x, 0, z, t, 'woods'); R.addCentered(x, z, 2, 2); }
  b.container('crate', -50, 0, 22, 0, 1); R.addCentered(-50, 22, 2, 2);
  b.container('chest', 52, 0, 40, 1, 2); R.addCentered(52, 40, 2, 2);
  b.container('dumpster', 44, 0, 6.2, 0, 0); R.addCentered(44, 6.2, 3, 2);
  b.container('dumpster', -44, 0, -6.4, 0, 0); R.addCentered(-44, -6.4, 3, 2);
  b.container('crate', 4, 0, -54, 0, 1); R.addCentered(4, -54, 2, 2);

  // Grab the item spawn points (spread around, far from the table)
  b.grab.itemSpawns.push(
    { x: -38, y: 3.4, z: 16.5 }, // upstairs house
    { x: -8.5, y: 3.5, z: 47.5 }, // lumber mill mezzanine
    { x: 46, y: 0.3, z: -44 }, // east cabin
    { x: -52, y: 0.1, z: -30 }, // woods
    { x: 50, y: 0.1, z: 24 }, // woods
    { x: 20, y: 0.1, z: -16 }, // garage
  );

  // Street lamps
  for (let x = -54; x <= 54; x += 18) { b.prop('lamp', x, 0, 4.6, 0, 1); b.prop('lamp', x + 9, 0, -4.6, Math.PI, 1); }

  const spawns = [
    [-30, 5.5, 0], [-12, 5.5, 0], [12, 5.5, 0], [30, 5.5, 0], [-30, -5.5, Math.PI], [-12, -5.5, Math.PI], [12, -5.5, Math.PI], [30, -5.5, Math.PI],
    [-5.5, 22, 0], [5.5, -24, Math.PI], [-50, 0.5, -Math.PI / 2], [50, 0.5, Math.PI / 2], [-26, 28, 0], [26, -30, Math.PI], [0, 31, 0], [-52, -36, 0],
  ];
  for (const [x, z, yaw] of spawns) { b.spawn(x, 0.1, z, yaw); R.addCentered(x, z, 2.5, 2.5); }

  // Woods: dense pines around the edges, mixed trees closer to town
  const inTown = (x, z) => Math.abs(x) < 46 && z > -26 && z < 28;
  scatter(b, R, [-60, -60, 60, 60], 150, ['pine', 'pine', 'tree'], { r: 1.6, scale: [0.85, 1.4], avoid: (x, z) => !inTown(x, z) });
  scatter(b, R, [-46, -26, 46, 28], 12, ['tree'], { r: 1.6, scale: [0.9, 1.2] });
  scatter(b, R, [-60, -60, 60, 60], 22, ['rock', 'bush', 'bush'], { r: 1.2, scale: [0.7, 1.3] });
  scatter(b, R, [-60, -60, 60, 60], 10, ['log'], { r: 1.8 });
  scatter(b, R, [-60, -60, 60, 60], 40, ['flowers', 'grasstuft'], { r: 0.4, reserve: false });

  // Spawn points around town

  return b.build(meta);
}
