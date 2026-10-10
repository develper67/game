import { MapBuilder } from '../mapbuilder.js';
import { shop, boundary } from '../buildings.js';
import { Reserve, overlay, winningTable, slabWithHoles } from './common.js';

export const meta = {
  id: 'mall',
  name: 'Abandoned Mall',
  desc: 'Two floors of dusty shops around a skylit atrium, a department store, food court and back rooms.',
  size: { minX: -48, maxX: 48, minZ: -32, maxZ: 32 },
  theme: {
    skyTop: 0x6a7fb0, skyBottom: 0xd7d2e8, fog: 0x3b3550, fogNear: 35, fogFar: 110,
    ground: { m: 'tile', c: 0xd8d0c4 }, sun: { color: 0xfff2dd, intensity: 1.6, dir: [0.3, 1, 0.2] },
    hemi: { sky: 0xf2eee6, ground: 0x8a8070, intensity: 1.1 }, ambient: 0.85, clouds: false,
  },
  indoor: true,
  killY: -20,
  weather: null,
  preview: { pos: [7.5, 9.8, 4.6], look: [-16, 0.5, -3.5] },
};

const UP = 5.2; // upper floor height
const ROOF = 11;
const T = 0.3;
const DOOR = (at, w = 1.3, color = 0x7f8c8d, inside = 1) => ({ at, w, y0: 0, y1: 2.4, door: { inside, color } });
const OPEN = (at, w, y1 = 3.2) => ({ at, w, y0: 0, y1 });

export function build() {
  const b = new MapBuilder('mall', 777);
  const R = new Reserve();
  const S = meta.size;
  boundary(b, S, { m: 'concrete', c: 0xb9b1a3, h: ROOF + 0.4 });
  const F = b.frame(0, 0, 0);
  const wallC = 0xece6da, accentWall = 0xd9cfbd;

  // ------------------------------------------------ roof + skylight over atrium
  slabWithHoles(b, S.minX, S.minZ, S.maxX, S.maxZ, ROOF + 0.4, 0.4, [[-12, -5, 8, 5]], 'roofflat', 0x9e9688);
  b.box(-12, ROOF + 0.1, -5, 8, ROOF + 0.2, 5, 'glass', 0xcfe9ff, { glass: true });
  // ceiling lights under the roof (food court + atrium) and under the upper floor
  for (let x = 24; x < 46; x += 6) for (let z = -26; z < 28; z += 8) b.box(x - 0.8, ROOF - 0.05, z - 0.3, x + 0.8, ROOF, z + 0.3, 'light', 0xffffff, { col: false, emissive: true });
  for (let x = -26; x < 20; x += 6) { b.box(x - 0.8, UP - 0.35, -0.3 - 6, x + 0.8, UP - 0.3, 0.3 - 6, 'light', 0xfff7e0, { col: false, emissive: true }); b.box(x - 0.8, UP - 0.35, 5.7, x + 0.8, UP - 0.3, 6.3, 'light', 0xfff7e0, { col: false, emissive: true }); }

  // ------------------------------------------------ upper floor (shops band + dept store)
  const atrium = [-12, -5, 8, 5];
  const escW = [-27, -6.9, -17, -4.7];
  const escE = [9, 4.7, 19, 6.9];
  slabWithHoles(b, -28, -17, 20, 17, UP, 0.3, [atrium, escW, escE], 'tile', 0xcfc6b8);
  // escalators (as steps) + side panels
  F.stairsX(escW[1], escW[3], escW[0], 0, UP, escW[2] - escW[0], 1, 'metalfloor', 0x9aa5b1);
  F.stairsX(escE[1], escE[3], escE[2], 0, UP, escE[2] - escE[0], -1, 'metalfloor', 0x9aa5b1);
  b.box(escW[0], UP, escW[1] - 0.1, escW[2], UP + 1.0, escW[1], 'glass', 0xcfe9ff, { glass: true });
  b.box(escW[0], UP, escW[3], escW[2], UP + 1.0, escW[3] + 0.1, 'glass', 0xcfe9ff, { glass: true });
  b.box(escW[0] - 0.1, UP, escW[1], escW[0], UP + 1.0, escW[3], 'glass', 0xcfe9ff, { glass: true });
  b.box(escE[0], UP, escE[1] - 0.1, escE[2], UP + 1.0, escE[1], 'glass', 0xcfe9ff, { glass: true });
  b.box(escE[0], UP, escE[3], escE[2], UP + 1.0, escE[3] + 0.1, 'glass', 0xcfe9ff, { glass: true });
  b.box(escE[2], UP, escE[1], escE[2] + 0.1, UP + 1.0, escE[3], 'glass', 0xcfe9ff, { glass: true });
  // atrium railings
  const rail = 'glass';
  b.box(-12, UP, -5.1, 8, UP + 1.0, -5, rail, 0xcfe9ff, { glass: true });
  b.box(-12, UP, 5, 8, UP + 1.0, 5.1, rail, 0xcfe9ff, { glass: true });
  b.box(-12.1, UP, -5, -12, UP + 1.0, 5, rail, 0xcfe9ff, { glass: true });
  b.box(8, UP, -5, 8.1, UP + 1.0, 5, rail, 0xcfe9ff, { glass: true });
  for (const [x0, z0, x1, z1] of [[-12.2, -5.2, -11.9, -4.9], [7.9, -5.2, 8.2, -4.9], [-12.2, 4.9, -11.9, 5.2], [7.9, 4.9, 8.2, 5.2]]) b.box(x0, 0, z0, x1, UP, z1, 'metal', 0xb0a898);
  // balcony overlooking the food court
  b.box(19.9, UP, -7, 20, UP + 1.0, 7, rail, 0xcfe9ff, { glass: true });
  // back area ceilings (single storey service zone)
  b.box(-47.7, UP - 0.3, 17.2, 20, UP, 31.7, 'roofflat', 0xa09888);
  b.box(-47.7, UP - 0.3, -31.7, 20, UP, -17.2, 'roofflat', 0xa09888);

  // ------------------------------------------------ atrium dressing
  b.prop('fountain', -2, 0, 0, 0, 1);
  b.prop('bench', -9, 0, -3.2, 0, 1); b.prop('bench', 5, 0, 3.2, Math.PI, 1);
  b.prop('plant', -10.8, 0, 3.8, 0, 1.4); b.prop('plant', 6.8, 0, -3.8, 0, 1.4);
  R.add(-12, -7, 8, 7);

  // ------------------------------------------------ shops (ground + upper), 4 per row
  const names = [
    [0xe84393, 1, 'cabinet', false], [0x00b894, 0, 'locker', true], [0x0984e3, 1, 'cabinet', false], [0xfdcb6e, 2, 'safe', false],
    [0x6c5ce7, 0, 'cabinet', false], [0xd63031, 1, 'toolbox', true], [0x00cec9, 0, 'cabinet', false], [0xe17055, 2, 'locker', false],
  ];
  const xs = [-22, -10, 2, 14];
  let si = 0;
  for (const level of [0, 1]) {
    for (const side of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const [accent, tier, container, bench] = names[(si++) % names.length];
        const oy = level ? UP : 0;
        const Fs = b.frame(xs[i], side * 12, side > 0 ? 0 : 2, oy);
        // outer shops skip the wall shared with the department store / food court
        const outerW = side > 0 ? i === 0 : i === 3, outerE = side > 0 ? i === 3 : i === 0;
        shop(Fs, { w: 12, d: 10, h: level ? ROOF - UP : UP - 0.08, accent, tier: Math.min(2, tier + level), container, bench: bench && level === 0, backDoor: level === 0, noLeft: outerW, noRight: outerE, wallC });
      }
    }
  }

  // ------------------------------------------------ department store (west), two floors
  F.wallZ(-17, 17, -28 + 0.15, 0, UP, T, 'panel', accentWall, [OPEN(14, 6, 3.6)]);
  F.wallZ(-17, 17, -28 + 0.15, UP, ROOF - UP, T, 'panel', accentWall, [OPEN(14, 6, 3.0)]);
  F.wallX(-47.7, -27.7, 17 - 0.15, 0, UP - 0.3, T, 'plaster', wallC, [DOOR(3, 1.3)]);
  F.wallX(-47.7, -27.7, -17 + 0.15, 0, UP - 0.3, T, 'plaster', wallC, [DOOR(3, 1.3, 0x7f8c8d, -1)]);
  F.wallX(-47.7, -27.7, 17 - 0.15, UP, ROOF - UP, T, 'plaster', wallC, []);
  F.wallX(-47.7, -27.7, -17 + 0.15, UP, ROOF - UP, T, 'plaster', wallC, []);
  const deptHole = [-47.5, -12.2, -45.0, -2];
  slabWithHoles(b, -47.7, -16.85, -28, 16.85, UP, 0.3, [deptHole], 'tile', 0xc9b8a6);
  F.stairsZ(-47.5, -45.2, -12, 0, UP, 10, 1, 'tile', 0xa89c8c);
  b.box(-45.1, UP, -12.2, -45.0, UP + 1.0, -3, 'metal', 0x6d6d6d);
  b.box(-47.5, UP, -12.3, -45.0, UP + 1.0, -12.2, 'metal', 0x6d6d6d);
  b.box(-44.5, 0, -2, -44.3, UP - 0.3, -1.8, 'metal', 0x6d6d6d);
  for (const y of [0, UP]) {
    for (let x = -42; x <= -32; x += 5) for (let z = -12; z <= 12; z += 6) b.prop(Math.abs(z) < 3 && y === 0 ? 'counter' : 'shelf', x, y, z, z === 0 ? 0 : 1, 1);
  }
  F.loot(-40, 0, -14.5, 1, 'dept'); F.loot(-30.5, 0, 9, 0, 'dept'); F.loot(-36, 0, 3, 1, 'dept');
  F.loot(-40, UP, 14.5, 2, 'dept'); F.loot(-30.5, UP, -9, 1, 'dept'); F.loot(-36, UP, 3, 2, 'dept');
  F.container('cabinet', -47, 0, 8, 1, 1); F.container('locker', -47.1, UP, 8, 1, 2); F.container('safe', -30, UP, 15.8, 2, 2);
  R.add(-48, -17, -28, 17);

  // ------------------------------------------------ back service corridors + rooms
  for (const side of [1, -1]) {
    const zc0 = side * 17.15, zc1 = side * 21;
    // wall between corridor and rooms (z = 21) with a door per room
    const rooms = side > 0 ? [[-47.7, -28, 'dept storage'], [-28, -8, 'storage'], [-8, 20, 'maintenance']] : [[-47.7, -20, 'loading dock'], [-20, 0, 'security'], [0, 20, 'janitor']];
    const ops = rooms.map(([a, bb]) => DOOR((a + bb) / 2 - 0.65 - (-47.7), 1.3, 0x95a5a6, side));
    F.wallX(-47.7, 20, zc1 + side * 0.15, 0, UP - 0.3, T, 'plaster', 0xd5cdbf, ops);
    // partitions between rooms
    for (let k = 1; k < rooms.length; k++) F.wallZ(Math.min(zc1, side * 31.7), Math.max(zc1, side * 31.7), rooms[k][0], 0, UP - 0.3, 0.2, 'plaster', 0xd5cdbf, []);
    void zc0;
    // room contents
    for (const [a, bb, kind] of rooms) {
      const cx = (a + bb) / 2, cz = side * 26.5;
      if (kind === 'dept storage' || kind === 'maintenance') F.bench(cx, 0, side * 30.9, side > 0 ? 2 : 0);
      if (kind === 'security') { F.container('safe', a + 1.2, 0, side * 30.9, side > 0 ? 2 : 0, 2); F.container('locker', bb - 1, 0, side * 30.9, side > 0 ? 2 : 0, 1); F.bench(cx + 4, 0, side * 30.9, side > 0 ? 2 : 0); }
      if (kind === 'loading dock') { b.prop('pallet', cx - 6, 0, cz, 0, 1); b.prop('pallet', cx + 4, 0, cz + side * 2, 0, 1); F.container('crate', cx, 0, cz, 0, 1); }
      if (kind === 'janitor') { F.container('cabinet', cx, 0, side * 31.0, side > 0 ? 2 : 0, 0); b.prop('barrel', cx + 6, 0, cz, 0, 1); }
      if (kind === 'storage') { b.prop('rack', cx, 0, cz, 0, 1); F.container('crate', cx - 6, 0, cz, 0, 1); F.container('ammobox', cx + 6, 0, cz, 0, 2); }
      if (kind === 'maintenance') { b.prop('generator', cx - 8, 0, cz, 0, 1); b.prop('machine', cx + 7, 0, cz, 0, 1); }
      if (kind === 'dept storage') { b.prop('shelf', cx - 5, 0, cz, 0, 1); F.container('crate', cx + 5, 0, cz, 0, 1); }
      F.loot(cx + (kind === 'storage' ? 3 : -2.5), 0, cz + side * 1.2, kind === 'security' || kind === 'maintenance' ? 2 : 1, 'backroom');
    }
    R.add(-48, Math.min(zc0, side * 32), 20, Math.max(zc0, side * 32));
  }

  // ------------------------------------------------ food court (east)
  F.wallZ(-31.7, -7, 20 + 0.15, 0, ROOF, T, 'panel', accentWall, [DOOR(31.7 - 21 + 0.9, 1.3, 0x95a5a6, 1)]);
  F.wallZ(7, 31.7, 20 + 0.15, 0, ROOF, T, 'panel', accentWall, [DOOR(10.6, 1.3, 0x95a5a6, 1)]);
  // kiosks along the east wall
  const kiosks = [[-25, 0xff7675], [-14, 0xfdcb6e], [5, 0x55efc4], [15, 0x74b9ff]];
  for (const [z, c] of kiosks) {
    b.box(44.5, 0, z - 4, 47.7, 3.2, z + 4, 'panel', c);
    b.box(44.4, 3.2, z - 4.2, 47.7, 3.9, z + 4.2, 'sign', c, { col: false, emissive: true });
    b.prop('counter', 43.2, 0, z, 1, 1);
    F.container('cabinet', 41.2, 0, z + 2.6, 1, 0);
    F.loot(41.5, 0, z - 2.5, 0, 'kiosk');
  }
  // kitchen room with a bench (north-east corner)
  F.wallX(30, 47.7, 22 + 0.15, 0, 3.4, T, 'plaster', 0xeeeeee, [DOOR(2, 1.3, 0xb0bec5, 1)]);
  F.wallZ(22.3, 31.7, 30 + 0.15, 0, 3.4, T, 'plaster', 0xeeeeee, []);
  b.box(30, 3.4, 22, 47.7, 3.6, 31.7, 'roofflat', 0xcccccc);
  F.bench(39, 0, 31.0, 2);
  F.container('fridge', 46.8, 0, 26, 3, 1);
  F.loot(35, 0, 27, 1, 'kitchen');
  // tables
  for (let x = 26; x <= 38; x += 6) for (let z = -20; z <= 20; z += 8) { if (Math.abs(z) < 5 && Math.abs(x - 34) < 4) continue; b.prop('table', x, 0, z, 0, 1); }
  b.prop('vending', 21, 0, -10, 1, 1); b.prop('vending', 21, 0, 10, 1, 1);
  b.prop('plant', 22, 0, -27, 0, 1.5); b.prop('plant', 22, 0, 20, 0, 1.5);
  winningTable(b, 34, 0, 0);
  R.add(20, -32, 48, 32);

  // resource piles for crafting (back rooms)
  for (const [k, x, z] of [['scrap', 6, 26.5], ['parts', 14, 29.5], ['wood', -40, -24], ['scrap', -26, -27], ['parts', 10, -27], ['wood', -22, 29]]) b.resource(k, x, 0, z);

  // ------------------------------------------------ spawns
  const spawns = [
    [-24, -2, 1.57], [-16, 2, 1.57], [12, -2, -1.57], [16, 2, -1.57], [-2, -6, 0], [-2, 6, Math.PI],
    [-38, -6, 1.57], [-38, 6, 1.57], [26, -28, 0], [26, 28, Math.PI], [42, 0, 1.57], [-20, 19, 0], [10, -19, 0],
    [-14, -6, 1.57], [0, 6.2, 0], [-34.5, 1.5, 1.57],
  ];
  spawns.forEach(([x, z, yaw], i) => b.spawn(x, i === 14 || i === 15 ? UP : 0.1, z, yaw));
  b.spawns[14].x = -6; b.spawns[14].z = 6.1;

  // ------------------------------------------------ grab item spawns (far from the food court table)
  b.grab.itemSpawns.push(
    { x: -36, y: UP, z: -14 }, // dept store upstairs
    { x: -18, y: 0, z: 27 }, // north storage
    { x: -10, y: 0, z: -27 }, // security office
    { x: -22, y: UP, z: 13 }, // upper shop
    { x: -34, y: 0, z: -27 }, // loading dock
    { x: 2, y: UP, z: -13 }, // upper shop south
  );
  void overlay;
  return b.build(meta);
}
