// 2.5D navigation grid for bots. Every grid column (0.5 m) may hold several
// walkable levels (ground, floors, roofs, stairs). Edges connect walkable
// neighbours: walk (small height change), jump (up to 1.2 m) and drop (down).
import { PHYS } from '../../shared/constants.js';
import { CollisionWorld } from '../../shared/physics.js';

const CELL = 0.5;
const FOOT = 0.3; // footprint half-size used for clearance tests
const CLEAR_H = 1.75;
const STEP = PHYS.STEP_HEIGHT;
const JUMP_UP = 1.2;
const MAX_DROP = 9;

export class NavGrid {
  constructor(map, world) {
    this.map = map;
    this.world = world;
    const s = map.size;
    this.minX = s.minX; this.minZ = s.minZ;
    this.nx = Math.ceil((s.maxX - s.minX) / CELL);
    this.nz = Math.ceil((s.maxZ - s.minZ) / CELL);
    this.killY = map.killY ?? -20;
    this.build();
  }

  colIndex(i, j) { return j * this.nx + i; }
  cx(i) { return this.minX + (i + 0.5) * CELL; }
  cz(j) { return this.minZ + (j + 0.5) * CELL; }

  build() {
    const world = this.world;
    const ncols = this.nx * this.nz;
    const colStart = new Int32Array(ncols + 1);
    const ys = [];
    const colOf = [];
    const groundY = this.map.noGround ? null : 0;
    const tmpBoxes = [];
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const c = this.colIndex(i, j);
        colStart[c] = ys.length;
        const x = this.cx(i), z = this.cz(j);
        tmpBoxes.length = 0;
        world.query(x - FOOT, z - FOOT, x + FOOT, z + FOOT, (b) => { if (!b.noPlayer) tmpBoxes.push(b); return false; });
        const cands = [];
        if (groundY !== null) cands.push(groundY);
        for (const b of tmpBoxes) if (b.y1 > this.killY + 0.5 && b.y1 < 60) cands.push(b.y1);
        cands.sort((a, b) => a - b);
        let last = -1e9;
        for (const h of cands) {
          if (h - last < 0.05) continue;
          if (h <= this.killY + 0.5) continue;
          // the surface must actually be free above for a standing body
          let blocked = false;
          for (const b of tmpBoxes) {
            if (b.y0 < h + CLEAR_H && b.y1 > h + 0.04) { blocked = true; break; }
          }
          if (blocked) continue;
          // must have support: ground or a box top at h within footprint
          ys.push(h);
          colOf.push(c);
          last = h;
        }
      }
    }
    colStart[ncols] = ys.length;
    this.colStart = colStart;
    this.ny = new Float32Array(ys);
    this.ncol = new Int32Array(colOf);
    const N = ys.length;
    this.count = N;

    // Build edges. Store as CSR arrays.
    const edgeTo = [];
    const edgeCost = [];
    const edgeType = [];
    const offs = new Int32Array(N + 1);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let n = 0; n < N; n++) {
      offs[n] = edgeTo.length;
      const c = this.ncol[n];
      const i = c % this.nx, j = (c / this.nx) | 0;
      const h = this.ny[n];
      for (const [di, dj] of dirs) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const cc = this.colIndex(ii, jj);
        const diag = di !== 0 && dj !== 0;
        for (let m = colStart[cc]; m < colStart[cc + 1]; m++) {
          const hh = this.ny[m];
          const dy = hh - h;
          let type = 0;
          if (Math.abs(dy) <= STEP) type = 0;
          else if (dy > 0 && dy <= JUMP_UP) type = 1;
          else if (dy < 0 && dy >= -MAX_DROP) type = 2;
          else continue;
          if (diag) {
            // forbid corner cutting: both orthogonal neighbours need a node at similar height
            if (type !== 0) continue;
            if (!this._hasLevel(this.colIndex(ii, j), h, hh) || !this._hasLevel(this.colIndex(i, jj), h, hh)) continue;
          }
          if (type === 1 && !this._columnClear(c, h, hh + CLEAR_H)) continue; // head room for jump
          if (type === 2 && !this._columnClear(cc, hh, h + CLEAR_H)) continue; // free fall space
          const horiz = diag ? 1.4142 * CELL : CELL;
          let cost = horiz + Math.abs(dy) * 0.4;
          if (type === 1) cost += 1.5;
          if (type === 2) cost += 0.6 + Math.max(0, -dy - 3) * 0.6;
          edgeTo.push(m); edgeCost.push(cost); edgeType.push(type);
        }
      }
    }
    offs[N] = edgeTo.length;
    this.offs = offs;
    this.eTo = new Int32Array(edgeTo);
    this.eCost = new Float32Array(edgeCost);
    this.eType = new Uint8Array(edgeType);

    // Connected components (treat edges as undirected) so we can reject unreachable goals quickly.
    const comp = new Int32Array(N).fill(-1);
    const adjRev = this._reverseAdjacency();
    let ncomp = 0;
    const stack = [];
    const compSize = [];
    for (let s = 0; s < N; s++) {
      if (comp[s] !== -1) continue;
      let size = 0;
      comp[s] = ncomp; stack.push(s);
      while (stack.length) {
        const u = stack.pop(); size++;
        for (let e = offs[u]; e < offs[u + 1]; e++) { const v = this.eTo[e]; if (comp[v] === -1) { comp[v] = ncomp; stack.push(v); } }
        for (const v of adjRev[u]) if (comp[v] === -1) { comp[v] = ncomp; stack.push(v); }
      }
      compSize.push(size);
      ncomp++;
    }
    this.comp = comp;
    this.compSize = compSize;
    let best = 0;
    for (let k = 1; k < compSize.length; k++) if (compSize[k] > compSize[best]) best = k;
    this.mainComp = best;
    // scratch buffers for A*
    this.gScore = new Float32Array(N);
    this.cameFrom = new Int32Array(N);
    this.visit = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.stamp = 0;
  }

  _reverseAdjacency() {
    const rev = Array.from({ length: this.count }, () => []);
    for (let u = 0; u < this.count; u++) for (let e = this.offs[u]; e < this.offs[u + 1]; e++) rev[this.eTo[e]].push(u);
    return rev;
  }

  _hasLevel(c, h1, h2) {
    const lo = Math.min(h1, h2) - STEP, hi = Math.max(h1, h2) + STEP;
    for (let m = this.colStart[c]; m < this.colStart[c + 1]; m++) if (this.ny[m] >= lo && this.ny[m] <= hi) return true;
    return false;
  }

  _columnClear(c, y0, y1) {
    const i = c % this.nx, j = (c / this.nx) | 0;
    const x = this.cx(i), z = this.cz(j);
    return !this.world.overlaps(x - FOOT, y0 + 0.05, z - FOOT, x + FOOT, y1, z + FOOT, (b) => !b.noPlayer);
  }

  nodePos(n) {
    const c = this.ncol[n];
    return { x: this.cx(c % this.nx), y: this.ny[n], z: this.cz((c / this.nx) | 0) };
  }

  // Closest node to a world position (prefers the level just below the feet)
  nearest(x, y, z, maxRing = 6) {
    const i0 = Math.floor((x - this.minX) / CELL), j0 = Math.floor((z - this.minZ) / CELL);
    let best = -1, bestD = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const c = this.colIndex(i, j);
          for (let m = this.colStart[c]; m < this.colStart[c + 1]; m++) {
            const h = this.ny[m];
            let dy = h - y;
            if (dy > STEP + 0.1) dy *= 4; // levels above the feet are unlikely
            const d = (di * di + dj * dj) * CELL * CELL + dy * dy * 2;
            if (d < bestD) { bestD = d; best = m; }
          }
        }
      }
      if (best !== -1 && ring >= 1) break;
    }
    return best;
  }

  sameComponent(a, b) { return a >= 0 && b >= 0 && this.comp[a] === this.comp[b]; }

  // A* path. Returns array of node indices (start..goal) or null.
  findPath(start, goal, maxExpand = 40000) {
    if (start < 0 || goal < 0) return null;
    if (this.comp[start] !== this.comp[goal]) return null;
    if (start === goal) return [start];
    const stamp = ++this.stamp;
    const g = this.gScore, came = this.cameFrom, visit = this.visit, closed = this.closed;
    const gp = this.nodePos(goal);
    const heap = new MinHeap();
    visit[start] = stamp; g[start] = 0; came[start] = -1;
    heap.push(start, this._h(start, gp));
    let expanded = 0;
    let bestNode = start, bestH = Infinity;
    while (heap.size) {
      const u = heap.pop();
      if (u === goal) return this._reconstruct(goal);
      if (closed[u] === stamp) continue;
      closed[u] = stamp;
      const hu = this._h(u, gp);
      if (hu < bestH) { bestH = hu; bestNode = u; }
      if (++expanded > maxExpand) break;
      for (let e = this.offs[u]; e < this.offs[u + 1]; e++) {
        const v = this.eTo[e];
        if (closed[v] === stamp) continue;
        const ng = g[u] + this.eCost[e];
        if (visit[v] !== stamp || ng < g[v]) {
          visit[v] = stamp; g[v] = ng; came[v] = u;
          heap.push(v, ng + this._h(v, gp));
        }
      }
    }
    // partial path towards the best node found
    return bestNode !== start ? this._reconstruct(bestNode) : null;
  }

  _h(n, gp) {
    const c = this.ncol[n];
    const dx = this.cx(c % this.nx) - gp.x, dz = this.cz((c / this.nx) | 0) - gp.z, dy = this.ny[n] - gp.y;
    return Math.sqrt(dx * dx + dz * dz + dy * dy * 0.3);
  }

  _reconstruct(n) {
    const out = [];
    while (n !== -1) { out.push(n); n = this.cameFrom[n]; }
    return out.reverse();
  }

  // Edge type between consecutive nodes (0 walk, 1 jump, 2 drop)
  edgeType(a, b) {
    for (let e = this.offs[a]; e < this.offs[a + 1]; e++) if (this.eTo[e] === b) return this.eType[e];
    return 0;
  }

  randomNode(rng = Math.random, comp = this.mainComp) {
    for (let k = 0; k < 200; k++) {
      const n = Math.floor(rng() * this.count);
      if (this.comp[n] === comp) return n;
    }
    return -1;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= pri) break;
      k[i] = k[par]; p[i] = p[par];
      i = par;
    }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && p[r] < p[l]) l = r;
        if (p[l] >= lp) break;
        k[i] = k[l]; p[i] = p[l];
        i = l;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}

const navCache = new Map();
export function getNav(map) {
  if (!navCache.has(map.id)) {
    // doors are treated as open: bots open closed doors as they walk through them
    const world = new CollisionWorld(map.boxes.filter((b) => b.col !== false && b.m !== 'door'));
    navCache.set(map.id, new NavGrid(map, world));
  }
  return navCache.get(map.id);
}
