import { MapBuilder } from '../mapbuilder.js';
import { warehouse, office, shippingContainer, crane, garage, boundary, T } from '../buildings.js';
import { Reserve, footprint, scatter, overlay, winningTable } from './common.js';

export const meta = {
  id: 'harbor',
  name: 'Rust Harbor',
  desc: 'Docks stacked with shipping containers, giant cranes, a moored cargo ship and rusty warehouses.',
  size: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  theme: {
    skyTop: 0x5b7ea6, skyBottom: 0xc9d6e2, fog: 0xb4c2cf, fogNear: 40, fogFar: 150,
    ground: { m: 'concrete', c: 0x8f8f8a }, sun: { color: 0xfff4e0, intensity: 2.0, dir: [0.6, 1, 0.2] },
    hemi: { sky: 0xd0dcea, ground: 0x6d7b88, intensity: 1.2 },
  },
  noGround: true,
  water: { x: 0, y: -1.2, z: 0, w: 420, d: 420, c: 0x2b6f9e },
  killY: -0.9,
  weather: null,
  preview: { pos: [55, 40, -55], look: [0, 0, 0] },
};

const CONTAINER_COLORS = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0x839192, 0xa04000, 0x117a65];
const DOOR = (at, w, color, inside = 1) => ({ at, w, y0: 0, y1: 2.4, door: { inside, color } });
const WIN = (at, w = 1.4, y0 = 1.0, y1 = 2.2) => ({ at, w, y0, y1, glass: true });

export function build() {
  const b = new MapBuilder('harbor', 1337);
  const R = new Reserve();
  const rng = b.rng;
  const S = meta.size;
  // land: quay slab + two piers (water everywhere else)
  b.box(S.minX, -3, -38, S.maxX, 0, S.maxZ, 'concrete', 0x8f8f8a);
  b.box(-32, -3, -60, -24, 0, -38, 'planks', 0x7a5c3e);
  b.box(44, -3, -60, 52, 0, -38, 'planks', 0x7a5c3e);
  // invisible walls around the map (over water too)
  boundary(b, S, { visible: false, h: 6 });
  // painted lanes + quay edge
  for (let x = -58; x < 58; x += 4) overlay(b, x, -37.6, x + 2, -37.2, 'paint', 0xffd23f, 0.02);
  overlay(b, -58, -14.5, 58, -13.5, 'paint', 0xf5f5f5, 0.02);
  R.add(-60, -40, 60, -36);
  for (let x = -55; x < 56; x += 9) { b.cylinder(x, 0, -37.3, 0.28, 0.7, 'metal', 0x37474f); }

  // ---------------- cargo ship (deck at y=3.2), boarded by two gangways
  const deckY = 3.2;
  b.box(-14, -3, -58, 30, deckY, -44, 'metal', 0x9b2d20);
  b.box(-14, -3, -58, 30, -0.6, -44, 'metal', 0x2b2b2b, { col: false });
  overlay(b, -13.8, -57.8, 29.8, -44.2, 'metalfloor', 0x6b7b8c, deckY + 0.02);
  const rail = (x0, z0, x1, z1) => b.box(x0, deckY, z0, x1, deckY + 1.05, z1, 'metal', 0xeeeeee);
  rail(-14, -44.15, 1.9, -44); rail(4.6, -44.15, 22.9, -44); rail(25.6, -44.15, 30, -44);
  rail(-14, -58, 30, -57.85); rail(-14, -58, -13.85, -44); rail(29.85, -58, 30, -44);
  const F0 = b.frame(0, 0, 0);
  F0.rampZ(2, 4.5, -38, 0, deckY, 6, -1, 'metalfloor', 0x8a8a8a);
  F0.rampZ(23, 25.5, -38, 0, deckY, 6, -1, 'metalfloor', 0x8a8a8a);
  b.box(1.9, deckY - 0.05, -44.1, 2.0, deckY + 1.0, -38, 'metal', 0xeeeeee, { col: false });
  b.box(4.5, deckY - 0.05, -44.1, 4.6, deckY + 1.0, -38, 'metal', 0xeeeeee, { col: false });
  // bridge superstructure (door faces the quay)
  {
    const F = b.frame(23, -53, 2, deckY);
    const w = 10, d = 8, hw = w / 2, hd = d / 2, h = 3.0;
    F.box(-hw, 0, -hd, hw, 0.05, hd, 'tile', 0xb0bec5);
    F.wallX(-hw, hw, -hd + T / 2, 0.05, h, T, 'panel', 0xf2f2f2, [DOOR(w / 2 - 0.6, 1.2, 0x546e7a), WIN(1.0, 1.8), WIN(w - 2.8, 1.8)]);
    F.wallX(-hw, hw, hd - T / 2, 0.05, h, T, 'panel', 0xf2f2f2, [WIN(1.5, 2.5), WIN(w - 4, 2.5)]);
    F.wallZ(-hd + T, hd - T, -hw + T / 2, 0.05, h, T, 'panel', 0xf2f2f2, [WIN(2.5, 2.0)]);
    F.wallZ(-hd + T, hd - T, hw - T / 2, 0.05, h, T, 'panel', 0xf2f2f2, [WIN(2.5, 2.0)]);
    F.slab(-hw - 0.2, -hd - 0.2, hw + 0.2, hd + 0.2, h + 0.35, 0.3, 'roofflat', 0xdddddd);
    F.box(-3, h + 0.35, -2, 3, h + 2.8, 2.5, 'panel', 0xf2f2f2);
    F.box(-3.05, h + 1.4, -2.05, 3.05, h + 2.3, 2.55, 'glass', 0x9fd3ff, { glass: true, col: false });
    F.box(-0.3, h + 2.8, -0.3, 0.3, h + 5.5, 0.3, 'metal', 0xf4a300, { col: false });
    F.container('locker', hw - 0.7, 0.05, hd - 0.6, 2, 2);
    F.container('safe', -hw + 0.8, 0.05, hd - 0.7, 2, 2);
    F.bench(-1.5, 0.05, hd - 0.75, 2);
    F.loot(2.0, 0.05, 0.5, 2, 'ship');
  }
  // containers on deck
  const deckCont = [[-9, -51, 0, true], [-9, -51, 1, false], [-1, -48, 0, false], [-1, -54, 0, true], [8, -51, 0, true], [8, -51, 1, false], [14, -48, 0, false]];
  for (const [x, z, lvl, open] of deckCont) {
    const F = b.frame(x, z, 0, deckY + lvl * 2.6);
    shippingContainer(F, { open, color: rng.pick(CONTAINER_COLORS), tier: 2, crate: open && x < 0 });
  }
  b.loot(-12.5, deckY, -45.5, 1, 'deck');

  // ---------------- container yard
  const xs = [-36, -26, -16, -6, 4], zs = [-28, -20, -12, -4, 4];
  let k = 0;
  for (const x of xs) {
    for (const z of zs) {
      k++;
      if ((x === -16 && z === -12) || (x === 4 && z === 4)) continue; // open plazas
      const height = 1 + (rng() < 0.45 ? 1 : 0) + (rng() < 0.15 ? 1 : 0);
      for (let lvl = 0; lvl < height; lvl++) {
        const open = lvl === 0 && rng() < 0.4;
        shippingContainer(b.frame(x, z, (k % 3 === 0) ? 2 : 0, lvl * 2.6), { open, color: rng.pick(CONTAINER_COLORS), tier: 1, crate: open && rng() < 0.4, loot: open });
      }
      R.add(x - 3.6, z - 1.8, x + 3.6, z + 1.8);
    }
  }
  // stair towers to reach container tops
  F0.stairsX(-18.7, -17.3, -29.5, 0, 2.6, 3.6, 1, 'metalfloor', 0xf4a300); // north side of the (-26,-20) stack
  F0.stairsX(-6.7, -5.3, 7.0, 0, 2.6, 3.6, -1, 'metalfloor', 0xf4a300); // south side of the (4,-4) stack
  b.loot(-26, 2.6, -20, 2, 'container-top');
  b.loot(4, 2.6, -4, 1, 'container-top');

  // quay crane
  crane(b.frame(-10, -33, 0), { span: 20, h: 16 });
  crane(b.frame(36, -32, 0), { span: 16, h: 14, color: 0x2e86de });
  R.add(-21, -37, 1, -29); R.add(27, -36, 45, -28);

  // ---------------- buildings
  { const F = b.frame(-32, 46, 0); warehouse(F, { w: 24, d: 16, wallC: 0x8e5b3c, roofC: 0x6d4c41, floorC: 0x8f8f8a }); R.add(...footprint(-32, 46, 28, 20, 0)); }
  { const F = b.frame(22, 46, 0); warehouse(F, { w: 22, d: 16, wallC: 0x4f6d7a, roofC: 0x37474f, floorC: 0x8f8f8a }); R.add(...footprint(22, 46, 26, 20, 0)); }
  { const F = b.frame(46, 12, 1); office(F, { w: 14, d: 10, wallC: 0xc5b8a5, floorC: 0x9e9e9e, sign: true, signC: 0x2e86de, bench: true }); R.add(...footprint(46, 12, 16, 14, 1)); }
  { const F = b.frame(-48, 18, 1); garage(F, { w: 9, d: 9, wallC: 0x8d8d8d, wallM: 'corrugated', doorC: 0xf4a300, carC: 0x546e7a }); R.add(...footprint(-48, 18, 12, 12, 1)); }

  winningTable(b, 24, 0, 4);
  R.addCentered(24, 4, 7, 7);

  // tanks, forklifts and clutter
  b.prop('tank', 50, 0, -18, 0, 1); b.prop('tank', 50, 0, -27, 0, 1);
  R.add(46, -31, 55, -14);
  for (const [x, z] of [[-44, -24], [-44, 0], [14, -26], [34, 24], [-6, 22]]) { b.prop('generator', x, 0, z, 0, 1); R.addCentered(x, z, 3, 3); }

  // resources
  const res = [['scrap', -44, -12], ['scrap', 12, -18], ['scrap', -12, 16], ['scrap', 36, -12], ['parts', -40, 30], ['parts', 40, 30], ['parts', 54, -4],
    ['wood', -52, 34], ['wood', 8, 30], ['wood', -20, 30]];
  for (const [kk, x, z] of res) { b.resource(kk, x, 0, z); R.addCentered(x, z, 2.6, 2.6); }
  const outLoot = [[-28, -58, 1], [48, -58, 2], [-54, -30, 0], [54, 34, 1], [-2, 30, 0], [30, -20, 0]];
  for (const [x, z, t] of outLoot) { b.loot(x, 0, z, t, 'outdoor'); R.addCentered(x, z, 2, 2); }
  b.container('ammobox', 48, 0, -50, 0, 2); R.addCentered(48, -50, 2, 2);
  b.container('crate', -28, 0, -50, 0, 1); R.addCentered(-28, -50, 2, 2);
  b.container('dumpster', -54, 0, 4, 1, 0); R.addCentered(-54, 4, 3, 3);
  b.container('toolbox', 30, 0, 20, 0, 1); R.addCentered(30, 20, 2, 2);

  b.grab.itemSpawns.push(
    { x: 23, y: deckY + 0.05, z: -53 }, // ship bridge
    { x: -26, y: 2.6, z: -20 }, // container top
    { x: -38.5, y: 3.4, z: 51.5 }, // warehouse mezzanine
    { x: -28, y: 0, z: -56 }, // pier end
    { x: 48, y: 3.4, z: 16 }, // office upstairs
    { x: -16, y: 0, z: -12 }, // yard plaza
  );

  const spawns = [
    [-50, -34, Math.PI], [-30, -34, Math.PI], [16, -34, Math.PI], [40, -40, Math.PI], [-54, -16, -1.57], [-54, 10, -1.57], [-2, -16, 0], [12, 0, 0],
    [36, 6, 1.57], [54, 22, 1.57], [-40, 36, 0], [0, 36, 0], [40, 36, 0], [-20, 22, 0], [20, -10, 0], [-46, -4, 0],
  ];
  for (const [x, z, yaw] of spawns) { b.spawn(x, 0.05, z, yaw); R.addCentered(x, z, 2.5, 2.5); }

  // ---------------- dock life
  // red & white lighthouse on a rocky islet out in the water (landmark, out of reach)
  lighthouse(b, 56, -54);
  // moored boats, buoys, mooring cleats on the piers, quay lamps
  b.prop('boat', -36.5, -1.45, -49, 0, 1.2, { color: 0xe8590c });
  b.prop('boat', -19.5, -1.45, -54, 0, 1.1, { color: 0x1c7ed6 });
  b.prop('boat', 39.5, -1.45, -50, 2, 1.2, { color: 0x2f9e44 });
  for (const [x, z] of [[-45, -55], [-19, -47], [34, -58], [55, -44], [-56, -46]]) b.prop('buoy', x, -1.55, z, 0, 1);
  for (let z = -58; z <= -41; z += 5.5) {
    b.prop('cleat', -31.6, 0, z, 1, 1); b.prop('cleat', -24.4, 0, z, 1, 1);
    b.prop('cleat', 44.4, 0, z, 1, 1); b.prop('cleat', 51.6, 0, z, 1, 1);
  }
  for (let x = -54; x <= 54; x += 18) if (R.free(x, -35.6, 0.6)) { b.prop('lamp', x, 0, -35.6, 0, 1); R.addCentered(x, -35.6, 0.8, 0.8); }
  for (const [x, z, r] of [[-14, -9.5, 1], [6.5, 1.5, 0], [-40, -32, 0]]) if (R.free(x, z, 1.4)) { b.prop('forklift', x, 0, z, r * Math.PI / 2, 1); R.addCentered(x, z, 2.4, 2.8); }
  scatter(b, R, [-58, 20, 58, 58], 8, ['tires', 'cablespool', 'trashcan'], { r: 1.0 });
  scatter(b, R, [-58, -36, 58, 18], 6, ['cablespool', 'tires', 'bollard'], { r: 1.0 });
  scatter(b, R, [-58, -36, 58, 58], 26, ['barrel', 'pallet', 'crate', 'cone'], { r: 1.0 });
  scatter(b, R, [-58, 20, 58, 58], 4, ['car'], { r: 3, extra: (r) => ({ color: r.pick([0x2e86de, 0xc0392b, 0xf1c40f, 0x27ae60]) }) });
  return b.build(meta);
}

// Striped lighthouse with a glowing lantern room on a rocky islet (visual landmark).
function lighthouse(b, x, z) {
  b.prop('bigrock', x, -2.2, z, 0, 1.3);
  b.prop('rock', x + 2.6, -1.4, z + 1.5, 0, 1.2);
  const r = 1.6;
  for (let i = 0; i < 6; i++) b.cylinder(x, 0.6 + i * 1.6, z, r - i * 0.08, 1.6, 'paint', i % 2 ? 0xf8f9fa : 0xe03131, { col: false, seg: 16 });
  b.cylinder(x, 10.2, z, 1.6, 0.3, 'metal', 0x343a40, { col: false, seg: 16 });
  b.cylinder(x, 10.5, z, 1.05, 1.6, 'glass', 0xfff3bf, { col: false, seg: 12 });
  b.box(x - 0.55, 10.7, z - 0.55, x + 0.55, 11.8, z + 0.55, 'light', 0xfff3bf, { col: false, emissive: true });
  b.cylinder(x, 12.1, z, 1.3, 0.35, 'metal', 0xc92a2a, { col: false, seg: 16 });
  b.cylinder(x, 12.45, z, 0.7, 0.5, 'metal', 0xc92a2a, { col: false, seg: 12 });
  b.cylinder(x, 0.6, z, 2.2, 0.4, 'concrete', 0xced4da, { col: false, seg: 16 });
}
