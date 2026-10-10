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

export function roadX(b, x0, x1, z, w, c = 0x8a8a90, lines = true) {
  overlay(b, x0, z - w / 2, x1, z + w / 2, 'asphalt', c, 0.02);
  if (lines) for (let x = x0 + 2; x < x1 - 2; x += 6) overlay(b, x, z - 0.12, x + 3, z + 0.12, 'paint', 0xf5f5dc, 0.03);
}
export function roadZ(b, z0, z1, x, w, c = 0x8a8a90, lines = true) {
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

// Floor slab over [x0,x1]x[z0,z1] (top at y) with rectangular holes [[hx0,hz0,hx1,hz1],...]
export function slabWithHoles(b, x0, z0, x1, z1, y, t, holes, m, c, flags) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const [a, bb, cc, d] of holes) { xs.add(Math.max(x0, Math.min(x1, a))); xs.add(Math.max(x0, Math.min(x1, cc))); zs.add(Math.max(z0, Math.min(z1, bb))); zs.add(Math.max(z0, Math.min(z1, d))); }
  const X = [...xs].sort((p, q) => p - q), Z = [...zs].sort((p, q) => p - q);
  const inHole = (cx, cz) => holes.some(([a, bb, cc, d]) => cx > a && cx < cc && cz > bb && cz < d);
  for (let j = 0; j < Z.length - 1; j++) {
    let start = null;
    for (let i = 0; i <= X.length - 1; i++) {
      const filled = i < X.length - 1 && !inHole((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2);
      if (filled && start === null) start = X[i];
      if (!filled && start !== null) { b.box(start, y - t, Z[j], X[i], y, Z[j + 1], m, c, flags); start = null; }
    }
  }
}
