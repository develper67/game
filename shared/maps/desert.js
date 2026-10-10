import { MapBuilder } from '../mapbuilder.js';
import { adobe, warehouse, garage, office, shippingContainer, lookoutTower, boundary } from '../buildings.js';
import { Reserve, footprint, scatter, overlay, winningTable } from './common.js';

export const meta = {
  id: 'desert',
  name: 'Dust Valley',
  desc: 'A sun-baked frontier town with adobe homes, a saloon, rail cars and two dusty warehouses.',
  size: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  theme: {
    skyTop: 0x4f9fe0, skyBottom: 0xffe2b8, fog: 0xf0d6ae, fogNear: 50, fogFar: 160,
    ground: { m: 'sand', c: 0xe9c792 }, sun: { color: 0xfff0d0, intensity: 2.6, dir: [0.35, 1, -0.4] },
    hemi: { sky: 0xfff1d6, ground: 0xc8a070, intensity: 1.2 },
  },
  killY: -20,
  weather: 'dust',
  preview: { pos: [50, 38, 50], look: [0, 0, 0] },
};

export function build() {
  const b = new MapBuilder('desert', 4242);
  const R = new Reserve();
  boundary(b, meta.size, { m: 'stone', c: 0xc98a52, h: 5 });

  // Main street (dirt) along X, side street along Z
  overlay(b, -60, -6, 60, 6, 'dirt', 0xd4a96a, 0.02);
  overlay(b, -5, -60, 5, 60, 'dirt', 0xd4a96a, 0.02);
  R.add(-60, -6, 60, 6);
  R.add(-5, -60, 5, 60);
  // well + plaza in the middle with the winning table beside it
  overlay(b, -9, -9, 9, 9, 'tile', 0xd8a874, 0.03);
  R.add(-10, -10, 10, 10);
  winningTable(b, 0, 0.03, 0);
  b.cylinder(6, 0, 6, 1.0, 0.9, 'stone', 0x9e8a78);
  b.box(5.2, 0.9, 5.2, 5.4, 2.6, 5.4, 'wood', 0x6d4c41, { col: false });
  b.box(6.6, 0.9, 6.6, 6.8, 2.6, 6.8, 'wood', 0x6d4c41, { col: false });
  b.box(5.1, 2.6, 5.1, 6.9, 2.8, 6.9, 'roof', 0x8d5524, { col: false });

  // North side: adobe homes + saloon facing the street
  const north = [
    [-40, 14, 'adobe', { w: 9, d: 7, wallC: 0xe0b07a }],
    [-25, 14, 'adobe', { w: 9, d: 7, wallC: 0xd99a6c }],
    [16, 15, 'saloon', {}],
    [36, 14, 'adobe', { w: 10, d: 8, wallC: 0xe8c39e }],
  ];
  for (const [x, z, kind, o] of north) {
    const F = b.frame(x, z, 0);
    if (kind === 'adobe') { adobe(F, o); R.add(...footprint(x, z, o.w + 4, o.d + 3, 0)); }
    else {
      office(F, { w: 14, d: 10, wallM: 'planks', wallC: 0xa0522d, floorC: 0x8d6e63, doorC: 0x5d4037, sign: true, signC: 0xb5651d, bench: true });
      R.add(...footprint(x, z, 16, 13, 0));
      b.prop('barrel', x - 8, 0, z - 6, 0, 1); b.prop('barrel', x + 8, 0, z - 6, 0, 1);
    }
  }
  // South side: general store (garage), sheriff office, adobes
  const southFrames = [
    [-38, -15, 'adobe', { w: 10, d: 8, wallC: 0xdcae80 }],
    [-18, -15, 'store', {}],
    [18, -16, 'sheriff', {}],
    [38, -14, 'adobe', { w: 9, d: 7, wallC: 0xe6b98f }],
  ];
  for (const [x, z, kind, o] of southFrames) {
    const F = b.frame(x, z, 2);
    if (kind === 'adobe') { adobe(F, o); R.add(...footprint(x, z, o.w + 4, o.d + 3, 2)); }
    else if (kind === 'store') { garage(F, { w: 10, d: 9, car: false, wallM: 'adobe', wallC: 0xe2b98a, doorC: 0x8d5524, roofC: 0x8d6e63 }); R.add(...footprint(x, z, 12, 12, 2)); }
    else { office(F, { w: 12, d: 9, wallM: 'adobe', wallC: 0xf0d2a8, floorC: 0xb08a68, doorC: 0x3e2723 }); R.add(...footprint(x, z, 14, 12, 2)); }
  }

  // Warehouses on the outskirts
  { const F = b.frame(-32, 40, 0); warehouse(F, { w: 24, d: 16, wallC: 0xc2a080, roofC: 0x9c7a5a, floorC: 0xb09a80 }); R.add(...footprint(-32, 40, 28, 22, 0)); }
  { const F = b.frame(32, -42, 2); warehouse(F, { w: 22, d: 16, wallC: 0xb5947a, roofC: 0x8d6e63, floorC: 0xa89070 }); R.add(...footprint(32, -42, 26, 22, 2)); }

  // Rail line with boxcars along the south edge
  overlay(b, -60, -54.5, 60, -51.5, 'planks', 0x6d4c41, 0.05);
  for (let x = -58; x < 58; x += 1.5) overlay(b, x, -55, x + 0.3, -51, 'wood', 0x5d4037, 0.08);
  R.add(-60, -57, 60, -49);
  const cars = [[-44, true, 0x8d3b2a], [-37, false, 0x6d4c41], [-22, true, 0x9c4a2a], [-15, false, 0x5d4037], [8, true, 0x7b3f2a], [15, false, 0x8d3b2a]];
  for (const [x, open, c] of cars) { const F = b.frame(x, -53, 0); F.oy = 0.3; shippingContainer(F, { open, color: c, tier: 1, crate: open && x < 0 }); b.box(x - 3, 0, -54.2, x + 3, 0.3, -51.8, 'metal', 0x3e2723); }

  // Lookout tower + far camp
  { const F = b.frame(-46, -22, 0); lookoutTower(F, { h: 5, tier: 2 }); R.add(-50, -32, -42, -18); }
  { const F = b.frame(48, 26, 1); lookoutTower(F, { h: 4.5, tier: 1 }); R.add(42, 20, 56, 32); }
  b.prop('watertower', 46, 0, -2, 0, 1); R.addCentered(46, -2, 5, 5);

  // Junkyard (scrap) next to the south warehouse + resource nodes
  const res = [
    ['scrap', 18, -30], ['scrap', 24, -28], ['scrap', 46, -30], ['parts', 12, -30], ['parts', -50, 30],
    ['wood', -52, 6], ['wood', -12, 32], ['wood', 26, 30], ['wood', 52, -12], ['scrap', -14, -40], ['parts', 52, 44],
  ];
  for (const [k, x, z] of res) { b.resource(k, x, 0, z); R.addCentered(x, z, 2.6, 2.6); }
  b.prop('car', 30, 0, -27, 1.3, 1, { color: 0x8d6e63 }); R.addCentered(30, -27, 5, 5);

  // Outdoor caches + containers
  const outLoot = [[-54, -40, 1], [54, 52, 1], [-20, 52, 0], [10, 50, 1], [-55, 50, 2], [40, 0, 0], [-8, -30, 0], [28, 8, 0]];
  for (const [x, z, t] of outLoot) { b.loot(x, 0, z, t, 'outdoor'); R.addCentered(x, z, 2, 2); }
  b.container('crate', -10, 0, 48, 0, 1); R.addCentered(-10, 48, 2, 2);
  b.container('chest', 54, 0, 54, 0, 2); R.addCentered(54, 54, 2, 2);
  b.container('dumpster', -30, 0, 7.5, 0, 0); R.addCentered(-30, 7.5, 3, 2);
  b.container('crate', 44, 0, -50, 0, 1); R.addCentered(44, -50, 2, 2);
  b.container('ammobox', -46, 0, -14, 0, 2); R.addCentered(-46, -14, 2, 2);

  // Grab the item spawns
  b.grab.itemSpawns.push(
    { x: -38.5, y: 3.4, z: 45.5 }, // warehouse mezzanine
    { x: -46, y: 5.0, z: -22 }, // lookout tower
    { x: 36, y: 3.9, z: 14 }, // adobe roof
    { x: -22, y: 0.42, z: -53 }, // boxcar
    { x: 52, y: 0.1, z: 52 }, // far corner
    { x: 30, y: 3.4, z: -48 }, // south warehouse mezzanine
  );

  const spawns = [
    [-45, 5, 0], [-30, 5, 0], [-12, 5, 0], [12, 5, 0], [28, 5, 0], [46, 5, 0], [-45, -5, Math.PI], [-12, -5, Math.PI], [12, -5, Math.PI], [46, -5, Math.PI],
    [0, 30, 0], [0, -32, Math.PI], [-52, 20, -1.57], [52, -26, 1.57], [-20, -46, Math.PI], [20, 46, 0],
  ];
  for (const [x, z, yaw] of spawns) { b.spawn(x, 0.1, z, yaw); R.addCentered(x, z, 2.5, 2.5); }

  // Desert dressing
  scatter(b, R, [-58, -58, 58, 58], 40, ['cactus', 'cactus', 'deadtree'], { r: 1.4, scale: [0.8, 1.3] });
  scatter(b, R, [-58, -58, 58, 58], 18, ['rock', 'bigrock'], { r: 2.5, scale: [0.7, 1.2] });
  scatter(b, R, [-58, -58, 58, 58], 10, ['barrel', 'hay', 'crate'], { r: 1.0 });
  scatter(b, R, [-58, -58, 58, 58], 25, ['grasstuft'], { r: 0.4, reserve: false, extra: () => ({}) });

  return b.build(meta);
}
