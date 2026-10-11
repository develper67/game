import { MapBuilder } from '../mapbuilder.js';
import { warehouse, garage, office, shippingContainer, boundary, fence, bridgeX, bridgeZ } from '../buildings.js';
import { Reserve, footprint, scatter, overlay, winningTable } from './common.js';

export const meta = {
  id: 'industrial',
  name: 'Industrial Yard',
  desc: 'Warehouses, a factory floor, humming machinery and ramps up to a raised central platform.',
  size: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  theme: {
    skyTop: 0x6d8fb3, skyBottom: 0xf2c9a0, fog: 0xd8c4ae, fogNear: 45, fogFar: 150,
    ground: { m: 'concrete', c: 0x8e8a80 }, sun: { color: 0xffe2c0, intensity: 2.3, dir: [-0.5, 1, -0.3] },
    hemi: { sky: 0xf0e0d0, ground: 0x7a7368, intensity: 1.15 },
  },
  killY: -20,
  weather: null,
  preview: { pos: [48, 36, 52], look: [0, 2, 0] },
};

const PLAT = 4.0; // central platform height

export function build() {
  const b = new MapBuilder('industrial', 2468);
  const R = new Reserve();
  const rng = b.rng;
  boundary(b, meta.size, { m: 'fence', c: 0x5d6d7e, h: 3 });
  const F = b.frame(0, 0, 0);

  // yard markings
  overlay(b, -60, -4, 60, 4, 'asphalt', 0x7b7b80, 0.02);
  overlay(b, -4, -60, 4, 60, 'asphalt', 0x7b7b80, 0.02);
  for (let x = -58; x < 58; x += 5) overlay(b, x, -0.12, x + 2.5, 0.12, 'paint', 0xffd23f, 0.03);

  // ------------------------------------------------ central raised platform with ramps + stairs
  b.box(-8, 0, -8, 8, PLAT, 8, 'metalfloor', 0x9097a0);
  overlay(b, -7.8, -7.8, 7.8, 7.8, 'paint', 0xffd23f, PLAT + 0.01);
  b.box(-7.6, PLAT + 0.01, -7.6, 7.6, PLAT + 0.02, 7.6, 'metalfloor', 0x787d84, { col: false });
  // railing with gaps for the ramps/stairs
  b.box(-8, PLAT, 7.9, -1.4, PLAT + 1.0, 8, 'metal', 0xf4a300); b.box(1.4, PLAT, 7.9, 8, PLAT + 1.0, 8, 'metal', 0xf4a300);
  b.box(-8, PLAT, -8, -1.4, PLAT + 1.0, -7.9, 'metal', 0xf4a300); b.box(1.4, PLAT, -8, 8, PLAT + 1.0, -7.9, 'metal', 0xf4a300);
  b.box(7.9, PLAT, -8, 8, PLAT + 1.0, -1.4, 'metal', 0xf4a300); b.box(7.9, PLAT, 1.4, 8, PLAT + 1.0, 8, 'metal', 0xf4a300);
  b.box(-8, PLAT, -8, -7.9, PLAT + 1.0, 8, 'metal', 0xf4a300);
  F.rampZ(-1.4, 1.4, 8 + 10, 0, PLAT, 10, -1, 'metalfloor', 0x8a8f96); // north ramp
  F.rampZ(-1.4, 1.4, -8 - 10, 0, PLAT, 10, 1, 'metalfloor', 0x8a8f96); // south ramp
  F.stairsX(-1.4, 1.4, 8 + 5, 0, PLAT, 5, -1, 'metalfloor', 0x8a8f96); // east stairs
  R.add(-9, -19, 9, 19); R.add(-9, -2, 14, 2);
  winningTable(b, 0, PLAT, 0);
  // catwalk from the platform west to the tank deck
  bridgeX(F, -22, -8, 0, PLAT, 2.4, 0x6b6f75);
  b.box(-30, 0, -6, -22, PLAT, 6, 'metalfloor', 0x9097a0);
  b.box(-30, PLAT, -6, -22, PLAT + 1.0, -5.9, 'metal', 0xf4a300); b.box(-30, PLAT, 5.9, -22, PLAT + 1.0, 6, 'metal', 0xf4a300);
  b.box(-30, PLAT, -6, -29.9, PLAT + 1.0, 6, 'metal', 0xf4a300);
  b.prop('tank', -27, PLAT, -2.5, 0, 0.8); b.prop('tank', -27, PLAT, 2.5, 0, 0.8);
  F.loot(-24, PLAT, 0, 2, 'deck');
  F.stairsZ(-29.5, -27.5, -6 - 4.5, 0, PLAT, 4.5, 1, 'metalfloor', 0x8a8f96);
  R.add(-31, -12, -21, 7);

  // ------------------------------------------------ buildings
  { warehouse(b.frame(-36, 38, 0), { w: 24, d: 16, wallC: 0x9e9e9e, roofC: 0x546e7a }); R.add(...footprint(-36, 38, 28, 21, 0)); }
  { warehouse(b.frame(32, 40, 0), { w: 22, d: 16, wallC: 0xb0855a, roofC: 0x6d4c41 }); R.add(...footprint(32, 40, 26, 21, 0)); }
  { warehouse(b.frame(-36, -38, 2), { w: 22, d: 16, wallC: 0x78909c, roofC: 0x455a64 }); R.add(...footprint(-36, -38, 26, 21, 2)); }
  // factory hall with machinery
  {
    const Fh = b.frame(34, -36, 2);
    warehouse(Fh, { w: 24, d: 18, h: 8, wallC: 0x8d6e63, roofC: 0x5d4037, floorC: 0x7d7a72 });
    for (const [x, z] of [[-6, -3], [6, -3]]) Fh.prop('machine', x, 0.05, z, 0, 1);
    Fh.prop('generator', -2, 0.05, 3.5, 0, 1);
    R.add(...footprint(34, -36, 28, 23, 2));
  }
  { office(b.frame(46, 8, 1), { w: 12, d: 10, wallC: 0xcfd8dc, floorC: 0x9e9e9e, sign: true, signC: 0xff6f00 }); R.add(...footprint(46, 8, 14, 13, 1)); }
  { garage(b.frame(-48, 6, 1), { w: 9, d: 9, wallC: 0xa1887f, doorC: 0xf4a300, carC: 0xf4a300 }); R.add(...footprint(-48, 6, 12, 12, 1)); }

  // silos + pipes
  for (const [x, z] of [[16, 18], [22, 18], [16, 24]]) { b.cylinder(x, 0, z, 2.2, 11, 'metal', 0xb0bec5); b.box(x - 0.3, 11, z - 0.3, x + 0.3, 12, z + 0.3, 'metal', 0x90a4ae, { col: false }); }
  b.box(13, 6, 20.8, 25, 6.6, 21.4, 'metal', 0x78909c, { col: false });
  b.box(18.7, 0, 20.7, 19.3, 6, 21.3, 'metal', 0x78909c);
  R.add(13, 15, 25, 27);
  // trailers with loading ramps
  const trailers = [[-14, 24, 0x2e86de], [-14, 32, 0xc0392b]];
  for (const [x, z, c] of trailers) {
    b.box(x - 5, 1.2, z - 1.25, x + 5, 4.0, z + 1.25, 'container', c);
    b.box(x - 5, 0, z - 1.0, x - 4.4, 1.2, z + 1.0, 'metal', 0x333333); b.box(x + 4.4, 0, z - 1.0, x + 5, 1.2, z + 1.0, 'metal', 0x333333);
    R.add(x - 6, z - 2, x + 6, z + 2);
  }
  // open trailer: ramp up into it
  {
    const x = 18, z = -14;
    b.box(x - 5, 0.8, z - 1.25, x + 5, 0.95, z + 1.25, 'metalfloor', 0x5d4037);
    b.box(x - 5, 0.95, z - 1.25, x + 5, 3.6, z - 1.15, 'container', 0x27ae60);
    b.box(x - 5, 0.95, z + 1.15, x + 5, 3.6, z + 1.25, 'container', 0x27ae60);
    b.box(x + 4.9, 0.95, z - 1.15, x + 5, 3.6, z + 1.15, 'container', 0x27ae60);
    b.box(x - 5, 3.5, z - 1.25, x + 5, 3.6, z + 1.25, 'container', 0x27ae60);
    b.box(x - 5, 0, z - 1.25, x + 5, 0.8, z + 1.25, 'metal', 0x333333);
    F.rampX(z - 1.0, z + 1.0, x - 8.0, 0, 0.95, 3.0, 1, 'metalfloor', 0x8a8f96);
    b.loot(x + 2, 0.95, z, 2, 'trailer');
    b.container('ammobox', x + 3.8, 0.95, z, 1, 2);
    R.add(x - 9, z - 3, x + 6, z + 3);
  }
  // container stacks
  for (const [x, z, n, r] of [[-20, -26, 2, 0], [-12, -30, 1, 1], [20, -48, 2, 0], [40, -10, 1, 1], [-48, 24, 1, 0]]) {
    for (let l = 0; l < n; l++) shippingContainer(b.frame(x, z, r, l * 2.6), { open: l === 0 && rng() < 0.6, color: rng.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd68910]), tier: 1, crate: l === 0 });
    R.add(...footprint(x, z, 7.5, 3.5, r));
  }
  // conveyor + machinery outdoors
  b.box(26, 0, 4, 40, 1.0, 5.6, 'metal', 0x37474f); b.box(26, 1.0, 4.1, 40, 1.1, 5.5, 'metalfloor', 0x212121, { col: false });
  R.add(25, 3, 41, 7);
  for (const [x, z] of [[-48, -12], [10, 48], [-10, 48], [52, -22]]) { b.prop('generator', x, 0, z, 0, 1); R.addCentered(x, z, 3, 3); }
  b.prop('tank', -50, 0, 48, 0, 1); b.prop('tank', -44, 0, 52, 0, 1); R.add(-55, 43, -40, 56);
  // fences around a scrapyard (craft resources)
  fence(b, 40, 20, 56, 20, 1.6, 0x90a4ae, 'metal'); fence(b, 40, 20, 40, 28, 1.6, 0x90a4ae, 'metal');
  R.add(39, 19, 57, 30);

  const res = [['scrap', 46, 24], ['scrap', 52, 26], ['scrap', -20, -16], ['scrap', 8, -26], ['parts', 48, 28], ['parts', -40, 12], ['parts', 26, 10],
    ['wood', -24, 46], ['wood', 4, 52], ['wood', -54, -30]];
  for (const [k, x, z] of res) { b.resource(k, x, 0, z); R.addCentered(x, z, 2.6, 2.6); }
  const outLoot = [[-54, -54, 1], [54, 54, 1], [-54, 54, 0], [54, -54, 0], [12, -54, 1], [-6, 40, 0], [-40, -16, 0], [30, 24, 1]];
  for (const [x, z, t] of outLoot) { b.loot(x, 0, z, t, 'outdoor'); R.addCentered(x, z, 2, 2); }
  b.container('toolbox', -4, 0, 22, 0, 1); R.addCentered(-4, 22, 2, 2);
  b.container('dumpster', 30, 0, -54, 0, 0); R.addCentered(30, -54, 3, 3);
  b.container('crate', -30, 0, 22, 0, 1); R.addCentered(-30, 22, 2, 2);

  b.grab.itemSpawns.push(
    { x: -24, y: PLAT, z: -3 }, // tank deck
    { x: -42.5, y: 3.4, z: 43.5 }, // warehouse mezzanine
    { x: 20, y: 0.95, z: -14 }, // open trailer
    { x: 48, y: 3.4, z: 12 }, // office upstairs
    { x: 34, y: 0.05, z: -36 }, // factory floor
    { x: -48, y: 0.05, z: 6 }, // garage
  );

  const spawns = [
    [-14, 0, 1.57], [14, -6, -1.57], [0, 22, 0], [0, -22, Math.PI], [-24, 14, 0], [24, -24, 0], [-52, -40, 0], [52, 40, 0],
    [-10, -48, Math.PI], [10, 36, 0], [-40, 4, 1.57], [36, -8, -1.57], [52, -40, 0], [-24, -44, 0], [-52, 36, 0], [22, 52, 0],
  ];
  for (const [x, z, yaw] of spawns) { b.spawn(x, 0.1, z, yaw); R.addCentered(x, z, 2.5, 2.5); }

  // ------------------------------------------------ yard life
  // twin striped smokestacks behind the factory: the landmark you see from everywhere
  for (const [x, z] of [[53, -52], [57, -44]]) {
    for (let i = 0; i < 7; i++) b.cylinder(x, i * 2.8, z, 1.5 - i * 0.07, 2.8, 'paint', i % 2 ? 0xf1f3f5 : 0xd9480f, { seg: 14, col: i === 0 });
    b.cylinder(x, 19.6, z, 1.15, 0.5, 'metal', 0x343a40, { seg: 14, col: false });
    R.addCentered(x, z, 3.6, 3.6);
  }
  // black & yellow hazard stripes around the foot of the central platform
  for (let t = -9; t < 9; t += 1) {
    const c = (t + 9) % 2 ? 0x212529 : 0xffd43b;
    overlay(b, t, -9, t + 1, -8, 'paint', c, 0.03); overlay(b, t, 8, t + 1, 9, 'paint', c, 0.03);
    overlay(b, -9, t, -8, t + 1, 'paint', c, 0.03); overlay(b, 8, t, 9, t + 1, 'paint', c, 0.03);
  }
  // overhead pipe bridge from the silos to the factory hall (decor, high above heads)
  for (const z of [27.4, 28.2]) b.box(13, 7.2, z - 0.3, 52, 7.8, z + 0.3, 'metal', z > 28 ? 0x4dabf7 : 0xadb5bd, { col: false });
  for (const x of [26, 38, 50]) { b.box(x - 0.2, 0, 27.3, x + 0.2, 7.2, 27.7, 'metal', 0x495057); R.addCentered(x, 27.5, 1, 1); }
  // forklifts, trucks at the loading doors, spools and pipes
  for (const [x, z, r] of [[-26, 30, 1], [24, 28, 0], [-24, -30, 1], [18, -20, 0]]) if (R.free(x, z, 1.5)) { b.prop('forklift', x, 0, z, r * Math.PI / 2, 1); R.addCentered(x, z, 2.6, 2.8); }
  for (const [x, z, r] of [[-36, 52, 0], [32, 54, 0]]) if (R.free(x, z, 2)) { b.prop('truck', x, 0, z, r, 1, { color: rng.pick([0xe03131, 0x1c7ed6, 0x2f9e44]) }); R.addCentered(x, z, 3, 8); }
  for (let x = -50; x <= 50; x += 20) for (const z of [-6.5, 6.5]) if (R.free(x, z, 0.8)) { b.prop('lamp', x, 0, z, 0, 1); R.addCentered(x, z, 1, 1); }
  scatter(b, R, [-58, -58, 58, 58], 10, ['cablespool', 'pipe', 'tires', 'sandbags'], { r: 1.6 });
  scatter(b, R, [-58, -58, 58, 58], 30, ['barrel', 'pallet', 'crate', 'cone', 'cone'], { r: 1.0 });
  scatter(b, R, [-58, -58, 58, 58], 6, ['car'], { r: 3, extra: (r) => ({ color: r.pick([0x546e7a, 0xf4a300, 0xffffff, 0x2e86de]) }) });
  return b.build(meta);
}
