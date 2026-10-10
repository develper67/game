import { MapBuilder } from '../mapbuilder.js';
import { cabin, facility, garage, lookoutTower, warehouse, boundary } from '../buildings.js';
import { Reserve, footprint, scatter, overlay, winningTable } from './common.js';

export const meta = {
  id: 'snow',
  name: 'Frostbite',
  desc: 'Snowy cabins around a frozen lake and a remote research facility full of rare tech.',
  size: { minX: -58, maxX: 58, minZ: -58, maxZ: 58 },
  theme: {
    skyTop: 0x7fa8d4, skyBottom: 0xe8f1fa, fog: 0xdde8f2, fogNear: 30, fogFar: 125,
    ground: { m: 'snow', c: 0xf2f7fc }, sun: { color: 0xf0f6ff, intensity: 1.9, dir: [-0.4, 1, 0.3] },
    hemi: { sky: 0xe8f1fa, ground: 0xa8bccf, intensity: 1.3 }, cloud: 0xf5f8fb,
  },
  killY: -20,
  weather: 'snow',
  preview: { pos: [-48, 36, -48], look: [0, 0, 5] },
};

export function build() {
  const b = new MapBuilder('snow', 9001);
  const R = new Reserve();
  boundary(b, meta.size, { m: 'logs', c: 0x6d4c41, h: 2.4 });

  // Frozen lake (visual ice, walkable)
  overlay(b, -34, -18, -8, 2, 'ice', 0xcfe8f7, 0.03);
  R.add(-34, -18, -8, 2);
  // trails
  overlay(b, -3, -58, 3, 58, 'dirt', 0xe0e6ec, 0.02);
  overlay(b, -58, 6, 58, 11, 'dirt', 0xe0e6ec, 0.02);
  R.add(-3.5, -58, 3.5, 58); R.add(-58, 5.5, 58, 11.5);

  // Research facility (north) + satellite dish + antenna
  { const F = b.frame(0, 32, 0); facility(F, { w: 32, d: 20, wallC: 0xdfe6e9 }); R.add(...footprint(0, 32, 36, 24, 0)); }
  b.prop('dish', 22, 0, 46, Math.PI, 1); R.addCentered(22, 46, 4, 4);
  b.prop('antenna', -22, 0, 47, 0, 1); R.addCentered(-22, 47, 3, 3);
  b.prop('generator', 19, 0, 24, 0, 1); R.addCentered(19, 24, 3, 3);
  // Storage hall (east)
  { const F = b.frame(40, 28, 3); warehouse(F, { w: 20, d: 14, h: 6, wallC: 0x90a4ae, wallM: 'corrugated', roofC: 0xcfd8dc, floorC: 0x9e9e9e }); R.add(...footprint(40, 28, 24, 18, 3)); }
  // Snowcat garage (south east)
  { const F = b.frame(36, -28, 2); garage(F, { w: 10, d: 9, carC: 0xe53935, wallC: 0xb0bec5, wallM: 'corrugated', doorC: 0xff6f00, roofC: 0xeceff1 }); R.add(...footprint(36, -28, 12, 12, 2)); }

  // Cabins around the lake and woods
  const cabins = [
    [-44, 24, 1, { w: 7, d: 6, tier: 1, snowRoof: true }],
    [-46, -2, 1, { w: 7, d: 6, tier: 0, snowRoof: true, wallC: 0x7b4f2c }],
    [-42, -40, 0, { w: 8, d: 6, tier: 1, snowRoof: true }],
    [-16, -40, 0, { w: 7, d: 6, tier: 0, snowRoof: true, wallC: 0x6d4c41 }],
    [14, -38, 0, { w: 7, d: 6, tier: 1, snowRoof: true }],
    [20, -10, 2, { w: 8, d: 7, tier: 0, snowRoof: true, wallC: 0x8b5a2b }],
    [44, -4, 3, { w: 7, d: 6, tier: 1, snowRoof: true }],
  ];
  for (const [x, z, r, o] of cabins) { cabin(b.frame(x, z, r), o); R.add(...footprint(x, z, o.w + 3.5, o.d + 3.5, r)); }
  // Tool shed with a bench (west)
  { const F = b.frame(-30, 40, 1); garage(F, { w: 7, d: 8, car: false, wallM: 'logs', wallC: 0x8b5a2b, doorC: 0x5d4037, roofC: 0xeceff1 }); R.add(...footprint(-30, 40, 10, 10, 1)); }
  // Lookout towers
  { lookoutTower(b.frame(-6, -26, 0), { h: 5, tier: 2, color: 0x6d4c41, roofC: 0xeceff1 }); R.add(-10, -34, -2, -22); }
  { lookoutTower(b.frame(50, 48, 2), { h: 4.5, tier: 1, color: 0x6d4c41, roofC: 0xeceff1 }); R.add(45, 43, 55, 56); }

  winningTable(b, 6, 0.0, -6);
  R.addCentered(6, -6, 6, 6);

  // Resources: woodpiles near cabins, scrap near facility & garage, parts in the storage yard
  const res = [['wood', -38, 20], ['wood', -50, -18], ['wood', -28, -46], ['wood', 8, -48], ['wood', 30, -46], ['wood', -52, 44],
    ['scrap', 12, 20], ['scrap', 30, 14], ['scrap', 48, -18], ['parts', 52, 14], ['parts', -12, 20]];
  for (const [k, x, z] of res) { b.resource(k, x, 0, z); R.addCentered(x, z, 2.6, 2.6); }

  const outLoot = [[-52, 52, 1], [52, -52, 1], [-12, -52, 0], [28, 52, 2], [-54, -26, 0], [10, 0, 0], [-36, 8, 0], [54, 36, 1]];
  for (const [x, z, t] of outLoot) { b.loot(x, 0, z, t, 'outdoor'); R.addCentered(x, z, 2, 2); }
  b.container('crate', -24, 0, 15, 0, 1); R.addCentered(-24, 15, 2, 2);
  b.container('chest', 30, 0, -52, 0, 2); R.addCentered(30, -52, 2, 2);
  b.container('ammobox', 9, 0, 22, 0, 2); R.addCentered(9, 22, 2, 2);
  b.container('crate', -52, 0, 8, 0, 0); R.addCentered(-52, 8, 2, 2);

  b.grab.itemSpawns.push(
    { x: -6, y: 5.0, z: -26 }, // lookout tower
    { x: 0, y: 0.1, z: 26 }, // facility lab
    { x: -42, y: 0.3, z: -40 }, // SW cabin
    { x: 44, y: 0.3, z: -4 }, // east cabin
    { x: -21, y: 0.05, z: -14 }, // on the lake
    { x: 35.5, y: 3.4, z: 24 }, // storage mezzanine
  );

  const spawns = [
    [-12, 8, 0], [12, 8, 0], [-30, 8.5, 0], [30, 8.5, 0], [-50, 8.5, -1.57], [50, 8.5, 1.57], [0, -14, Math.PI], [0, -50, Math.PI],
    [-21, -22, Math.PI], [-36, -26, 0], [24, -24, 0], [0, 48, 0], [-40, 50, 0], [36, 46, 0], [-14, 18, 0], [14, -26, Math.PI],
  ];
  for (const [x, z, yaw] of spawns) { b.spawn(x, 0.1, z, yaw); R.addCentered(x, z, 2.5, 2.5); }

  // Winter dressing
  scatter(b, R, [-56, -56, 56, 56], 120, ['snowpine', 'snowpine', 'pine'], { r: 1.6, scale: [0.85, 1.5] });
  scatter(b, R, [-56, -56, 56, 56], 14, ['snowman', 'log', 'rock'], { r: 1.3 });
  scatter(b, R, [-56, -56, 56, 56], 12, ['bush'], { r: 1.0, scale: [0.6, 1.0] });

  return b.build(meta);
}
