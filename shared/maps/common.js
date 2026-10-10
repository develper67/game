// Helpers shared by map definitions.

export class Reserve {
  constructor() { this.rects = []; }
  add(x0, z0, x1, z1, pad = 0) {
    this.rects.push([Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad]);
  }
  addCentered(x, z, w, d, pad = 0) { this.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, pad); }
  free(x, z, r = 0) {
    for (const [a, b, c, d] of this.rects) if (x + r > a && x - r < c && z + r > b && z - r < d) return false;
    return true;
  }
}

// Footprint of a building of size w x d rotated by r (multiples of 90deg)
export function footprint(x, z, w, d, r) {
  return (r % 2 === 0) ? [x - w / 2, z - d / 2, x + w / 2, z + d / 2] : [x - d / 2, z - w / 2, x + d / 2, z + w / 2];
}

export function scatter(b, reserve, area, count, kinds, opts = {}) {
  const rng = b.rng;
  const [x0, z0, x1, z1] = area;
  let placed = 0, tries = 0;
  const minR = opts.r ?? 1.2;
  while (placed < count && tries < count * 30) {
    tries++;
    const x = rng.range(x0, x1), z = rng.range(z0, z1);
    if (!reserve.free(x, z, minR)) continue;
    if (opts.avoid && !opts.avoid(x, z)) continue;
    const kind = Array.isArray(kinds) ? rng.pick(kinds) : kinds;
    const s = opts.scale ? rng.range(opts.scale[0], opts.scale[1]) : 1;
    const rot = opts.rotate === false ? 0 : rng.int(0, 3) * Math.PI / 2;
    b.prop(kind, x, opts.y ?? 0, z, rot, s, opts.extra ? opts.extra(rng) : {});
    if (opts.reserve !== false) reserve.addCentered(x, z, minR * 2, minR * 2);
    placed++;
  }
  return placed;
}

// Flat visual-only ground overlay (roads, plazas, paths)
export function overlay(b, x0, z0, x1, z1, m, c, y = 0.015) {
  b.box(Math.min(x0, x1), 0, Math.min(z0, z1), Math.max(x0, x1), y, Math.max(z0, z1), m, c, { col: false });
}

export function roadX(b, x0, x1, z, w, c = 0x4a4a4f, lines = true) {
  overlay(b, x0, z - w / 2, x1, z + w / 2, 'asphalt', c, 0.02);
  if (lines) for (let x = x0 + 2; x < x1 - 2; x += 6) overlay(b, x, z - 0.12, x + 3, z + 0.12, 'paint', 0xf5f5dc, 0.03);
}
export function roadZ(b, z0, z1, x, w, c = 0x4a4a4f, lines = true) {
  overlay(b, x - w / 2, z0, x + w / 2, z1, 'asphalt', c, 0.02);
  if (lines) for (let z = z0 + 2; z < z1 - 2; z += 6) overlay(b, x - 0.12, z, x + 0.12, z + 3, 'paint', 0xf5f5dc, 0.03);
}

export function winningTable(b, x, y, z) {
  b.grab.table = { x, y, z, r: 1.6 };
  b.box(x - 0.9, y, z - 0.9, x + 0.9, y + 0.95, z + 0.9, 'table', 0, { vis: false });
}

export function spawnRing(b, cx, cz, radius, n, y = 0.1, reserve) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    if (reserve && !reserve.free(x, z, 0.6)) continue;
    b.spawn(x, y, z, Math.atan2(x - cx, z - cz));
  }
}
