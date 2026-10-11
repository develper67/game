// Builds Three.js meshes for a map: merged static geometry per material (with
// baked vertex-color ambient occlusion), instanced props with contact-shadow
// blobs, individually animated doors/containers/benches, and the environment
// (gradient sky with sun + clouds, distant hills, fog and lights).
import * as THREE from 'three';
import { tex, TEX_SCALE, blobTexture, setTextureQuality } from './textures.js';
import { propTemplate, propBlob, containerModel, benchModel, resourceModel, tableModel, doorModel, lightModel } from './models.js';
import { CONTAINER_DIMS } from '/shared/mapbuilder.js';

const _col = new THREE.Color();
const _c2 = new THREE.Color();

const AO = 0.34; // darkening at the foot of walls standing on something
const AO_H = 2.4; // height (m) over which that darkening fades out

// Materials whose large undersides read as interior ceilings
const CEIL_FROM = new Set(['plaster', 'roofflat', 'tile', 'concrete', 'panel', 'adobe', 'stucco']);
const CEIL_C = new THREE.Color(0xf6f2ea);

// Face writer shared by boxes, roofs and ramps. Colors are linear RGB.
function quad(arr, p0, p1, p2, p3, n, uv, cols) {
  const base = arr.pos.length / 3;
  const ps = [p0, p1, p2, p3];
  for (let i = 0; i < 4; i++) {
    arr.pos.push(ps[i][0], ps[i][1], ps[i][2]); arr.nor.push(n[0], n[1], n[2]);
    const c = cols[i] || cols[0];
    arr.col.push(c[0], c[1], c[2]);
    arr.uv.push(uv[i][0], uv[i][1]);
  }
  arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function tri(arr, a, b, c, col, uvs) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const base = arr.pos.length / 3;
  for (const [i, v] of [a, b, c].entries()) {
    arr.pos.push(v[0], v[1], v[2]); arr.nor.push(n[0] / l, n[1] / l, n[2] / l); arr.col.push(col[0], col[1], col[2]);
    arr.uv.push(uvs[i][0], uvs[i][1]);
  }
  arr.idx.push(base, base + 1, base + 2);
}
const lin = (hex) => { _col.set(hex ?? 0xffffff).convertSRGBToLinear(); return [_col.r, _col.g, _col.b]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Add a box. Vertical faces get a vertical AO gradient when the box rests on
// something (ao=true); big undersides of slabs go to the ceiling group.
function pushBox(getArr, key, b, scale, ao) {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const arr = getArr(key);
  const c = lin(b.c);
  const s = 1 / scale;
  const h = y1 - y0;
  // vertical rows: split tall faces at AO_H so the gradient matches neighbours
  const ys = ao && h > AO_H + 0.05 ? [y0, y0 + AO_H, y1] : [y0, y1];
  const k = (y) => (ao ? 1 - AO * (1 - Math.min(1, (y - y0) / AO_H)) : 1);
  for (let r = 0; r < ys.length - 1; r++) {
    const ya = ys[r], yb = ys[r + 1];
    const ca = mul(c, k(ya)), cb = mul(c, k(yb));
    const cs = [ca, ca, cb, cb];
    quad(arr, [x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [1, 0, 0], [[-z1 * s, ya * s], [-z0 * s, ya * s], [-z0 * s, yb * s], [-z1 * s, yb * s]], cs);
    quad(arr, [x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0], [[z0 * s, ya * s], [z1 * s, ya * s], [z1 * s, yb * s], [z0 * s, yb * s]], cs);
    quad(arr, [x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, 1], [[x0 * s, ya * s], [x1 * s, ya * s], [x1 * s, yb * s], [x0 * s, yb * s]], cs);
    quad(arr, [x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [0, 0, -1], [[-x1 * s, ya * s], [-x0 * s, ya * s], [-x0 * s, yb * s], [-x1 * s, yb * s]], cs);
  }
  // top
  quad(arr, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s]], [c]);
  // bottom (skipped when resting on the ground)
  if (y0 > 0.01) {
    const area = (x1 - x0) * (z1 - z0);
    if (y0 > 0.4 && area > 3 && h <= 0.7 && CEIL_FROM.has(b.m)) {
      _c2.setRGB(c[0], c[1], c[2]).lerp(CEIL_C, 0.55);
      const cs = 1 / TEX_SCALE.ceiling;
      quad(getArr('ceiling'), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * cs, z0 * cs], [x1 * cs, z0 * cs], [x1 * cs, z1 * cs], [x0 * cs, z1 * cs]], [[_c2.r, _c2.g, _c2.b]]);
    } else {
      quad(arr, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]], [mul(c, 0.9)]);
    }
  }
}

// Gable roof: thick sloped slabs with fascia trim, a ridge cap and (optionally)
// gable walls inset under the overhang.
function pushRoof(getArr, p) {
  const { x0, z0, x1, z1, y0, h, ridgeX } = p;
  const th = p.thick ?? 0.16;
  const rc = lin(p.c);
  const trimKey = p.trimC === undefined && p.m === 'snow' ? 'snow' : 'trim';
  const tc = lin(p.trimC ?? (p.m === 'snow' ? 0xffffff : 0xf3eee4));
  const s = 1 / (TEX_SCALE[p.m] || 2.5);
  // work in a local (a = along ridge, b = across) frame, then map to world
  const A0 = ridgeX ? x0 : z0, A1 = ridgeX ? x1 : z1, B0 = ridgeX ? z0 : x0, B1 = ridgeX ? z1 : x1;
  const bm = (B0 + B1) / 2, half = (B1 - B0) / 2;
  const W = (q) => (ridgeX ? [q[0], q[1], q[2]] : [q[2], q[1], q[0]]);
  const yt = y0 + h;
  const slopeLen = Math.hypot(half, h);
  const roof = getArr(p.m), trim = getArr(trimKey);
  // quad from local points, wound so its normal agrees with the local hint
  const Q = (arr, pts, cols, uv, hint) => {
    const P = pts.map(W), H = W(hint);
    const ab = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], ad = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
    let n = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / l);
    const C = [0, 1, 2, 3].map((i) => cols[i] || cols[0]);
    if (n[0] * H[0] + n[1] * H[1] + n[2] * H[2] >= 0) quad(arr, P[0], P[1], P[2], P[3], n, uv, C);
    else quad(arr, P[3], P[2], P[1], P[0], n.map((v) => -v), [uv[3], uv[2], uv[1], uv[0]], [C[3], C[2], C[1], C[0]]);
  };
  const tu = [[0, 0], [1, 0], [1, 0.1], [0, 0.1]];
  for (const side of [-1, 1]) {
    const be = side < 0 ? B0 : B1; // eave line
    const uvT = [[A0 * s, 0], [A1 * s, 0], [A1 * s, slopeLen * s], [A0 * s, slopeLen * s]];
    // roof surface (prism top lifted by th so the overhang has thickness) + soffit
    Q(roof, [[A0, y0 + th, be], [A1, y0 + th, be], [A1, yt + th, bm], [A0, yt + th, bm]], [rc, rc, mul(rc, 1.07), mul(rc, 1.07)], uvT, [0, 1, side]);
    Q(roof, [[A0, y0, be], [A1, y0, be], [A1, yt, bm], [A0, yt, bm]], [mul(rc, 0.5)], uvT, [0, -1, -side]);
    // fascia along the eave
    Q(trim, [[A0, y0, be], [A1, y0, be], [A1, y0 + th, be], [A0, y0 + th, be]], [tc], tu, [0, 0, side]);
    // rake boards at both gable ends
    for (const ae of [A0, A1]) Q(trim, [[ae, y0, be], [ae, yt, bm], [ae, yt + th, bm], [ae, y0 + th, be]], [tc], tu, [ae === A0 ? -1 : 1, 0, 0]);
  }
  // ridge cap
  const rw = 0.14, rh = 0.1, ry = yt + th;
  const capC = mul(rc, 0.78);
  Q(roof, [[A0, ry + rh, bm - rw], [A1, ry + rh, bm - rw], [A1, ry + rh, bm + rw], [A0, ry + rh, bm + rw]], [capC], tu, [0, 1, 0]);
  for (const sd of [-1, 1]) Q(roof, [[A0, ry - 0.06, bm + sd * rw], [A1, ry - 0.06, bm + sd * rw], [A1, ry + rh, bm + sd * rw], [A0, ry + rh, bm + sd * rw]], [mul(capC, 0.85)], tu, [0, 0, sd]);
  for (const ae of [A0, A1]) Q(roof, [[ae, ry - 0.06, bm - rw], [ae, ry - 0.06, bm + rw], [ae, ry + rh, bm + rw], [ae, ry + rh, bm - rw]], [capC], tu, [ae === A0 ? -1 : 1, 0, 0]);
  // gable walls, inset under the overhang
  if (p.gable !== false) {
    const ia = p.gableInset ?? 0, ib = p.eaveInset ?? 0;
    const gKey = p.gableM || 'siding';
    const gc = mul(lin(p.gableC ?? 0xf1e7d3), 0.97);
    const gs = 1 / (TEX_SCALE[gKey] || 2.4);
    const garr = getArr(gKey);
    const under = (b) => yt - (h * Math.abs(b - bm)) / half; // soffit height at b
    for (const ae of [A0 + ia, A1 - ia]) {
      const out = ae < (A0 + A1) / 2 ? -1 : 1;
      const bl = B0 + ib, br = B1 - ib;
      const pts = [[ae, y0, bl], [ae, y0, br], [ae, under(br), br], [ae, yt, bm], [ae, under(bl), bl]];
      const H = W([out, 0, 0]);
      const uvOf = (q) => [q[2] * gs, q[1] * gs];
      for (let i = 1; i < pts.length - 1; i++) {
        let a = pts[0], b = pts[i], c = pts[i + 1];
        const wa = W(a), wb = W(b), wc = W(c);
        const nb = [wb[0] - wa[0], wb[1] - wa[1], wb[2] - wa[2]], nc = [wc[0] - wa[0], wc[1] - wa[1], wc[2] - wa[2]];
        const nx = nb[1] * nc[2] - nb[2] * nc[1], nz = nb[0] * nc[1] - nb[1] * nc[0];
        if (nx * H[0] + nz * H[2] < 0) [b, c] = [c, b];
        tri(garr, W(a), W(b), W(c), gc, [uvOf(a), uvOf(b), uvOf(c)]);
      }
    }
  }
}

function pushRamp(arr, r, scale) {
  // wedge rising along (dx,dz) from y0 to y0+h over the rectangle
  const { x0, z0, x1, z1, y0, h, dx, dz } = r;
  const c = lin(r.c);
  const s = 1 / scale;
  const hAt = (x, z) => {
    let t;
    if (dx > 0) t = (x - x0) / (x1 - x0); else if (dx < 0) t = (x1 - x) / (x1 - x0);
    else if (dz > 0) t = (z - z0) / (z1 - z0); else t = (z1 - z) / (z1 - z0);
    return y0 + h * t;
  };
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const top = corners.map(([x, z]) => [x, hAt(x, z), z]);
  const uvs = (a, b, cc) => [a, b, cc].map((v) => [v[0] * s, v[2] * s]);
  tri(arr, top[0], top[3], top[2], c, uvs(top[0], top[3], top[2]));
  tri(arr, top[0], top[2], top[1], c, uvs(top[0], top[2], top[1]));
  const bot = corners.map(([x, z]) => [x, y0, z]);
  const sc = mul(c, 0.8);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (Math.abs(top[i][1] - y0) < 0.001 && Math.abs(top[j][1] - y0) < 0.001) continue;
    const suv = (v) => [(v[0] + v[2]) * s, v[1] * s];
    tri(arr, bot[i], bot[j], top[j], sc, [suv(bot[i]), suv(bot[j]), suv(top[j])]);
    tri(arr, bot[i], top[j], top[i], sc, [suv(bot[i]), suv(top[j]), suv(top[i])]);
  }
}

function makeGeo(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
  g.setIndex(arr.idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const NO_TEX = new Set(['light', 'sign', 'glass']);
const SHINY = { metal: [0x3a3a3a, 40], metalfloor: [0x2a2a2a, 30], tile: [0x444444, 60], container: [0x222222, 24], paint: [0x222222, 30], panel: [0x2a2a2a, 30], ice: [0x666666, 80] };

function staticMaterial(key, quality) {
  if (key === 'glass') {
    if (quality === 'low') return new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, specular: 0xffffff, shininess: 120 });
  }
  if (key === 'emissive') return new THREE.MeshBasicMaterial({ vertexColors: true });
  const map = NO_TEX.has(key) ? null : tex(key);
  const sh = SHINY[key];
  if (sh && quality !== 'low') return new THREE.MeshPhongMaterial({ vertexColors: true, map, specular: sh[0], shininess: sh[1] });
  return new THREE.MeshLambertMaterial({ vertexColors: true, map });
}

// Spatial lookup of box tops so walls know whether they stand on something
function supportIndex(boxes) {
  const tops = new Map();
  for (const b of boxes) {
    if (b.vis === false && b.col === false) continue;
    if (b.glass || b.decor || b.m === 'light' || b.m === 'sign') continue;
    const k = Math.round(b.y1 * 20);
    if (!tops.has(k)) tops.set(k, []);
    tops.get(k).push(b);
  }
  return (b) => {
    if (b.y0 < 0.02) return true;
    const k = Math.round(b.y0 * 20);
    for (const kk of [k - 1, k, k + 1]) {
      const list = tops.get(kk);
      if (!list) continue;
      for (const o of list) if (o !== b && Math.abs(o.y1 - b.y0) < 0.04 && o.x0 < b.x1 && o.x1 > b.x0 && o.z0 < b.z1 && o.z1 > b.z0) return true;
    }
    return false;
  };
}

// Kinds that look the same from every angle get a random visual yaw.
const FREE_YAW = new Set(['tree', 'pine', 'snowpine', 'birch', 'bush', 'rock', 'bigrock', 'flowers', 'grasstuft', 'cactus', 'deadtree', 'palm', 'plant', 'stump', 'fern', 'mushroom', 'tumbleweed', 'snowpile', 'barrel', 'cone', 'snowman', 'tires', 'planter']);
const STRETCH = new Set(['tree', 'pine', 'snowpine', 'birch', 'palm', 'cactus', 'deadtree']);

export function buildWorld(map, { shadows = false, quality = 'medium' } = {}) {
  const root = new THREE.Group();
  root.name = 'world';
  const theme = map.theme;
  const groups = new Map(); // material key -> arrays
  const getArr = (key) => {
    if (!groups.has(key)) groups.set(key, { pos: [], nor: [], col: [], uv: [], idx: [] });
    return groups.get(key);
  };
  const supported = supportIndex(map.boxes);
  for (const b of map.boxes) {
    if (b.vis === false) continue;
    const key = b.glass ? 'glass' : b.emissive || b.m === 'light' || b.m === 'sign' ? 'emissive' : b.m;
    const h = b.y1 - b.y0;
    const ao = key !== 'glass' && key !== 'emissive' && h > 0.3 && supported(b);
    pushBox(getArr, key, b, TEX_SCALE[b.m] || 2, ao);
  }
  for (const p of map.prisms) pushRoof(getArr, p);
  for (const r of map.ramps) pushRamp(getArr(r.m), r, TEX_SCALE[r.m] || 2);

  const mats = new Map();
  for (const [key, arr] of groups) {
    if (!arr.pos.length) continue;
    const geo = makeGeo(arr);
    const mat = staticMaterial(key, quality);
    mats.set(key, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'static:' + key;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (shadows && key !== 'glass' && key !== 'emissive') { mesh.castShadow = true; mesh.receiveShadow = true; }
    if (key === 'glass') mesh.renderOrder = 2;
    root.add(mesh);
  }

  // cylinders (silos, pillars, tanks) with world-scaled UVs, caps and AO
  if (map.cylinders.length) {
    const byMat = new Map();
    for (const c of map.cylinders) {
      if (!byMat.has(c.m)) byMat.set(c.m, []);
      byMat.get(c.m).push(c);
    }
    for (const [key, list] of byMat) {
      const geos = [];
      const sc = 1 / (TEX_SCALE[key] || 2);
      for (const c of list) {
        const seg = c.seg || 14;
        const g = new THREE.CylinderGeometry(c.r, c.r, c.h, seg, Math.max(1, Math.ceil(c.h / AO_H))).toNonIndexed();
        const pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal;
        const col = new Float32Array(pos.count * 3);
        const base = lin(c.c);
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i) + c.h / 2;
          const side = Math.abs(nor.getY(i)) < 0.5;
          const k = side ? 1 - AO * (1 - Math.min(1, y / AO_H)) : 1;
          col[i * 3] = base[0] * k; col[i * 3 + 1] = base[1] * k; col[i * 3 + 2] = base[2] * k;
          if (side) uv.setXY(i, uv.getX(i) * Math.PI * 2 * c.r * sc, y * sc);
          else uv.setXY(i, pos.getX(i) * sc, pos.getZ(i) * sc);
        }
        g.translate(c.x, c.y0 + c.h / 2, c.z);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geos.push(g);
      }
      const merged = mergeList(geos);
      const mesh = new THREE.Mesh(merged, staticMaterial(key, quality));
      if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
  }

  // ground with large-scale color variation and soft contact shading
  if (!map.noGround) root.add(buildGround(map, quality, shadows));
  if (map.water) {
    const w = map.water;
    const wt = tex('water').clone(); wt.needsUpdate = true; wt.repeat.set(w.w / 7, w.d / 7);
    const wc = new THREE.Color(w.c ?? 0x2a7fbf);
    const mat = quality === 'low'
      ? new THREE.MeshLambertMaterial({ color: wc, map: wt, transparent: true, opacity: 0.9 })
      : new THREE.MeshPhongMaterial({ color: wc, map: wt, transparent: true, opacity: 0.9, specular: 0xbfd8ff, shininess: 70 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(w.x, w.y, w.z);
    water.name = 'water';
    water.receiveShadow = shadows;
    root.add(water);
    root.userData.water = water;
  }

  // instanced props
  const byKind = new Map();
  for (const p of map.props) {
    if (p.wallLamp) continue;
    if (!byKind.has(p.kind)) byKind.set(p.kind, []);
    byKind.get(p.kind).push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const vcLambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
  const blobs = [];
  for (const [kind, list] of byKind) {
    const tpl = propTemplate(kind);
    if (!tpl) continue;
    const xf = list.map((p) => {
      const hv = hash(p.x, p.z);
      const yaw = (p.yaw || 0) + (FREE_YAW.has(kind) ? hv * Math.PI * 2 : 0);
      const s = p.s || 1;
      const sy = STRETCH.has(kind) ? s * (0.9 + hash(p.z, p.x) * 0.25) : s;
      return { yaw, s, sy };
    });
    for (const layer of tpl) {
      const im = new THREE.InstancedMesh(layer.geo, layer.basic ? vcBasic : vcLambert, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, xf[i].yaw);
        v.set(p.x, p.y, p.z);
        sc.set(xf[i].s, xf[i].sy, xf[i].s);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (layer.tint) {
          const base = layer.colorKey && p[layer.colorKey] !== undefined ? p[layer.colorKey] : layer.base;
          _col.set(base);
          if (!layer.colorKey) _col.offsetHSL((hash(p.x, p.z) - 0.5) * 0.05, (hash(p.z + 3, p.x) - 0.5) * 0.1, (hash(p.z, p.x) - 0.5) * 0.12);
          im.setColorAt(i, _col);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (shadows && !layer.basic && layer.shadow !== false) { im.castShadow = true; im.receiveShadow = !layer.noReceive; }
      im.computeBoundingSphere();
      im.name = 'prop:' + kind;
      im.matrixAutoUpdate = false;
      root.add(im);
    }
    const br = propBlob(kind);
    if (br) list.forEach((p, i) => blobs.push([p.x, p.y, p.z, br * xf[i].s]));
  }
  // one instanced mesh of soft contact-shadow blobs under every grounded prop
  for (const c of map.containers) blobs.push([c.x, c.y, c.z, 0.85]);
  for (const r of map.resources) blobs.push([r.x, r.y, r.z, 1.1]);
  for (const b of map.benches) blobs.push([b.x, b.y, b.z, 1.2]);
  if (blobs.length) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: theme.shadowC ?? 0x10182a, map: blobTexture(), transparent: true, depthWrite: false,
      opacity: shadows ? 0.3 : 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const im = new THREE.InstancedMesh(geo, mat, blobs.length);
    blobs.forEach(([x, y, z, r], i) => { m4.makeScale(r * 2, 1, r * 2); m4.setPosition(x, y + 0.03, z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.renderOrder = 1;
    im.name = 'blobs';
    im.matrixAutoUpdate = false;
    root.add(im);
  }

  // map lights (fireplaces, lamps): merged glowing bulbs/flames, no real lights
  if (map.lights.length) root.add(lightModel(map.lights));

  // dynamic objects
  const doors = new Map();
  for (const d of map.doors) {
    const [hx, hz] = d.hinge, [tx, tz] = d.tip;
    const len = Math.hypot(tx - hx, tz - hz);
    const height = d.y1 - d.y0;
    const pivot = new THREE.Group();
    pivot.position.set(hx, d.y0, hz);
    const baseAngle = Math.atan2(-(tz - hz), tx - hx); // rotation so local +X points from hinge to tip
    const leaf = doorModel(len, height, d.color);
    if (shadows) leaf.castShadow = true;
    pivot.add(leaf);
    // open direction: rotate so the tip swings towards the inside vector
    const dirX = (tx - hx) / len, dirZ = (tz - hz) / len;
    const [ix, iz] = d.inside;
    // rotating the tip direction by +90deg (three.js y rotation): (x,z)->(z,-x)
    const plus = dirZ * ix + (-dirX) * iz;
    const openAngle = plus > 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.rotation.y = baseAngle;
    root.add(pivot);
    doors.set(d.id, { def: d, pivot, base: baseAngle, openAngle, open: !!d.open, cur: d.open ? 1 : 0, mesh: leaf });
  }

  const containers = new Map();
  for (const c of map.containers) {
    const dims = CONTAINER_DIMS[c.kind] || CONTAINER_DIMS.crate;
    const mdl = containerModel(c.kind, dims);
    mdl.position.set(c.x, c.y, c.z);
    mdl.rotation.y = (c.r || 0) * Math.PI / 2;
    if (shadows) mdl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(mdl);
    containers.set(c.id, { def: c, model: mdl, opened: false, anim: 0 });
  }

  const benches = new Map();
  for (const b of map.benches) {
    const mdl = benchModel();
    mdl.position.set(b.x, b.y, b.z);
    mdl.rotation.y = (b.r || 0) * Math.PI / 2;
    if (shadows) mdl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(mdl);
    benches.set(b.id, { def: b, model: mdl });
  }

  const resources = new Map();
  for (const r of map.resources) {
    const mdl = resourceModel(r.kind);
    mdl.position.set(r.x, r.y, r.z);
    mdl.rotation.y = hash(r.x, r.z) * Math.PI * 2;
    if (shadows) mdl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(mdl);
    resources.set(r.id, { def: r, model: mdl, left: 99 });
  }

  let table = null;
  if (map.grab && map.grab.table) {
    table = tableModel();
    table.position.set(map.grab.table.x, map.grab.table.y, map.grab.table.z);
    root.add(table);
  }

  return { root, doors, containers, benches, resources, table, materials: mats };
}

function mergeList(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}

function hash(a, b) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// smooth value noise in [0,1]
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

// ---------------------------------------------------------------------------
// Ground: one non-uniform grid (fine inside the play area, coarse outside)
// with baked color variation and darkening around buildings.
// ---------------------------------------------------------------------------
function buildGround(map, quality, shadows) {
  const th = map.theme, S = map.size;
  const gm = th.ground.m;
  const ts = 1 / (TEX_SCALE[gm] || 6);
  const cell = quality === 'low' ? 2 : 1;
  const axis = (a0, a1) => {
    const out = [];
    for (const d of [-130, -70, -36, -16]) out.push(a0 + d);
    for (let a = a0 - 6; a < a1 + 6; a += cell) out.push(a);
    out.push(a1 + 6);
    for (const d of [16, 36, 70, 130]) out.push(a1 + d);
    return out;
  };
  const xs = axis(S.minX, S.maxX), zs = axis(S.minZ, S.maxZ);
  // coverage grid (1 m) of visible boxes standing on the ground
  const gx0 = Math.floor(S.minX) - 8, gz0 = Math.floor(S.minZ) - 8;
  const GW = Math.ceil(S.maxX - S.minX) + 16, GD = Math.ceil(S.maxZ - S.minZ) + 16;
  let cov = new Float32Array(GW * GD);
  for (const b of map.boxes) {
    if (b.vis === false || b.glass || b.y0 > 0.25 || b.y1 - b.y0 < 0.6) continue;
    const ix0 = Math.max(0, Math.floor(b.x0 - gx0)), ix1 = Math.min(GW - 1, Math.ceil(b.x1 - gx0) - 1);
    const iz0 = Math.max(0, Math.floor(b.z0 - gz0)), iz1 = Math.min(GD - 1, Math.ceil(b.z1 - gz0) - 1);
    for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) cov[z * GW + x] = 1;
  }
  for (const c of map.cylinders) {
    if (c.y0 > 0.25) continue;
    for (let z = Math.floor(c.z - c.r - gz0); z <= Math.ceil(c.z + c.r - gz0); z++) for (let x = Math.floor(c.x - c.r - gx0); x <= Math.ceil(c.x + c.r - gx0); x++) if (x >= 0 && z >= 0 && x < GW && z < GD) cov[z * GW + x] = 1;
  }
  // separable box blur, radius 2 cells, twice
  const blur = (src) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const R = 2;
    for (let z = 0; z < GD; z++) for (let x = 0; x < GW; x++) { let s = 0; for (let k = -R; k <= R; k++) s += src[z * GW + Math.min(GW - 1, Math.max(0, x + k))]; tmp[z * GW + x] = s / (2 * R + 1); }
    for (let z = 0; z < GD; z++) for (let x = 0; x < GW; x++) { let s = 0; for (let k = -R; k <= R; k++) s += tmp[Math.min(GD - 1, Math.max(0, z + k)) * GW + x]; out[z * GW + x] = s / (2 * R + 1); }
    return out;
  };
  cov = blur(blur(cov));
  const covAt = (x, z) => {
    const fx = x - gx0 - 0.5, fz = z - gz0 - 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= GW - 1 || iz >= GD - 1) return 0;
    const tx = fx - ix, tz = fz - iz;
    const a = cov[iz * GW + ix], b = cov[iz * GW + ix + 1], c = cov[(iz + 1) * GW + ix], d = cov[(iz + 1) * GW + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  const base = new THREE.Color(th.ground.c);
  const cLight = base.clone().offsetHSL(th.ground.hueVar ?? -0.025, 0.04, 0.07);
  const cDark = base.clone().offsetHSL(-(th.ground.hueVar ?? -0.025), 0.02, -0.08);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), nor = new Float32Array(nx * nz * 3);
  const tmpC = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j], k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z;
    nor[k * 3 + 1] = 1;
    uv[k * 2] = x * ts; uv[k * 2 + 1] = -z * ts;
    const n = vnoise(x / 11, z / 11) * 0.65 + vnoise(x / 4.3 + 17, z / 4.3) * 0.35;
    tmpC.copy(cDark).lerp(cLight, Math.min(1, Math.max(0, (n - 0.2) / 0.6)));
    tmpC.convertSRGBToLinear();
    const ao = 1 - 0.5 * Math.min(1, covAt(x, z) * 1.3);
    col[k * 3] = tmpC.r * ao; col[k * 3 + 1] = tmpC.g * ao; col[k * 3 + 2] = tmpC.b * ao;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: tex(gm) }));
  ground.receiveShadow = shadows;
  ground.matrixAutoUpdate = false;
  ground.name = 'ground';
  return ground;
}

// ---------------------------------------------------------------------------
// Environment: sky dome (gradient + sun), faceted clouds, distant hills, fog,
// hemisphere/ambient fill and the sun light.
// ---------------------------------------------------------------------------
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uTop, uMid, uHorizon, uBelow, uSunDir, uSunCol;
uniform float uDisc;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uTop, smoothstep(0.08, 0.85, h));
  col = mix(col, uBelow, 1.0 - smoothstep(-0.25, 0.0, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 12.0) * 0.22 + pow(s, 180.0) * 0.45);
  col = mix(col, uSunCol * 1.6 + vec3(0.25), smoothstep(uDisc, uDisc + 0.0006, s));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Sky group (follows the camera). size = radius for clouds and hills.
export function buildSky(theme, size = 130) {
  const grp = new THREE.Group();
  grp.name = 'sky';
  const sunDir = new THREE.Vector3(...(theme.sun?.dir || [0.5, 1, 0.3])).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(theme.skyTop) },
      uMid: { value: new THREE.Color(theme.skyBottom) },
      uHorizon: { value: new THREE.Color(theme.horizon ?? theme.fog) },
      uBelow: { value: new THREE.Color(theme.fog) },
      uSunDir: { value: sunDir },
      uSunCol: { value: new THREE.Color(theme.sunDisc ?? theme.sun?.color ?? 0xffffff) },
      uDisc: { value: theme.sunDisc === false ? 2 : 0.9988 },
    },
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.name = 'skydome';
  grp.add(sky);
  if (theme.hills !== false && !theme.noHills) grp.add(buildHills(theme, size));
  if (theme.clouds !== false) {
    const clouds = buildClouds(theme, size, sunDir);
    grp.add(clouds);
  }
  return grp;
}

function buildClouds(theme, R, sunDir) {
  const lit = new THREE.Color(theme.cloud ?? 0xffffff);
  const shade = new THREE.Color(theme.cloudShade ?? new THREE.Color(theme.skyTop).lerp(new THREE.Color(theme.fog), 0.5).getHex());
  const geos = [];
  const n = theme.cloudCount ?? 16;
  const sd = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(i, 3) * 0.6;
    const dist = R * (0.62 + hash(i, 7) * 0.3);
    const elev = 0.1 + hash(i, 11) * 0.22;
    const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, cy = dist * Math.tan(elev);
    const sz = R * (0.05 + hash(i, 13) * 0.04);
    const puffs = 4 + Math.floor(hash(i, 17) * 4);
    const ang = a + Math.PI / 2;
    for (let k = 0; k < puffs; k++) {
      const t = (k / (puffs - 1) - 0.5) * 2;
      const r = sz * (1 - Math.abs(t) * 0.45) * (0.8 + hash(i, k + 20) * 0.4);
      const gg = new THREE.IcosahedronGeometry(r, 1);
      gg.scale(1, 0.62, 0.9);
      gg.translate(Math.cos(ang) * t * sz * 1.5, (1 - Math.abs(t)) * sz * 0.35 + hash(k, i) * sz * 0.2, Math.sin(ang) * t * sz * 1.5 + (hash(k + 5, i) - 0.5) * sz * 0.5);
      gg.translate(cx, cy, cz);
      geos.push(gg);
    }
  }
  // flatten bottoms a little and bake faceted shading into vertex colors
  const merged = mergePlain(geos);
  const pos = merged.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    va.fromBufferAttribute(pos, i); vb.fromBufferAttribute(pos, i + 1); vc.fromBufferAttribute(pos, i + 2);
    nrm.subVectors(vc, vb).cross(vb.clone().sub(va)).normalize().negate();
    const up = nrm.y * 0.5 + 0.5;
    const sun = Math.max(0, nrm.x * sd.x + nrm.z * sd.z) * 0.25;
    const k = Math.min(1, Math.pow(up, 0.8) * 0.85 + sun + 0.05);
    c.copy(shade).lerp(lit, k);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.deleteAttribute('normal');
  const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  // slow drift
  const t0 = performance.now();
  mesh.onBeforeRender = (r, s, cam) => {
    mesh.rotation.y = (performance.now() - t0) * 2e-6;
    mesh.position.y = cam.position.y - (mesh.parent ? mesh.parent.position.y : 0);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

// Rings of distant silhouettes blended into the haze (theme.hills: style/colors)
function buildHills(theme, R) {
  const hc = theme.hills || {};
  const style = hc.style || 'hills';
  const fog = new THREE.Color(theme.fog);
  const layers = [
    { r: R * 1.0, base: hc.far ?? hc.c ?? 0x6f9a6a, fogK: 0.55, amp: (hc.h ?? 1) * R * 0.11, seed: 1 },
    { r: R * 0.9, base: hc.c ?? 0x5b8a55, fogK: 0.32, amp: (hc.h ?? 1) * R * 0.07, seed: 2 },
  ];
  const pos = [], col = [];
  const N = 160;
  const top = new THREE.Color(), bot = new THREE.Color(), cap = new THREE.Color(hc.cap ?? 0xffffff);
  for (const L of layers) {
    top.set(L.base).lerp(fog, L.fogK);
    bot.copy(fog);
    const hAt = (t) => {
      const a = t * Math.PI * 2;
      let y = 0.55 + 0.25 * Math.sin(a * 3 + L.seed * 2.1) + 0.2 * Math.sin(a * 7 + L.seed * 5.3) + 0.1 * Math.sin(a * 17 + L.seed);
      if (style === 'mesas') y = y > 0.62 ? 0.95 : y > 0.4 ? 0.5 : 0.18;
      if (style === 'peaks') y = Math.pow(Math.abs(Math.sin(a * 5 + L.seed) * 0.7 + Math.sin(a * 11 + L.seed * 3) * 0.3), 1.6) * 1.25 + 0.15;
      if (style === 'forest') y += (hash(Math.floor(t * N * 2), L.seed) - 0.5) * 0.12;
      return Math.max(0.05, y) * L.amp;
    };
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
      const h0 = hAt(t0), h1 = hAt(t1);
      const p = (a, y) => [Math.cos(a) * L.r, y, Math.sin(a) * L.r];
      const yb = -R * 0.05;
      const quadC = (pa, pb, pc, pd, ca, cb, cc, cd) => { pos.push(...pa, ...pb, ...pc, ...pa, ...pc, ...pd); col.push(...ca, ...cb, ...cc, ...ca, ...cc, ...cd); };
      const tc = (h) => {
        const c = top.clone();
        if (style === 'peaks' && h > L.amp * 0.62) c.lerp(cap.clone().lerp(fog, L.fogK * 0.6), 0.85);
        return [c.r, c.g, c.b];
      };
      const mid = (h) => { const c = top.clone().lerp(bot, 0.55); return [c.r, c.g, c.b]; };
      const bc = [bot.r, bot.g, bot.b];
      // lower band fades into the fog, upper band carries the color
      quadC(p(a0, yb), p(a1, yb), p(a1, h1 * 0.45), p(a0, h0 * 0.45), bc, bc, mid(h1), mid(h0));
      quadC(p(a0, h0 * 0.45), p(a1, h1 * 0.45), p(a1, h1), p(a0, h0), mid(h0), mid(h1), tc(h1), tc(h0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mesh.name = 'hills';
  mesh.frustumCulled = false;
  mesh.renderOrder = -8;
  return mesh;
}

function mergePlain(geos) {
  let total = 0;
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.computeBoundingSphere();
  return m;
}

// Theme lighting with defaults, shared by the game and the preview renderer.
export function themeLighting(map) {
  const th = map.theme;
  return {
    hemiSky: th.hemi?.sky ?? 0xcfe9ff, hemiGround: th.hemi?.ground ?? 0x6d6d6d, hemiI: (th.hemi?.intensity ?? 1.1) * 0.8,
    ambientC: th.ambientC ?? 0xffffff, ambientI: th.ambient ?? (map.indoor ? 0.75 : 0.5),
    sunC: th.sun?.color ?? 0xffffff, sunI: th.sun?.intensity ?? 2, sunDir: new THREE.Vector3(...(th.sun?.dir || [0.5, 1, 0.3])).normalize(),
  };
}

// Sets up renderer shadows, background, fog, sky and lights for a map.
// Returns { sky, sun, sunDir, hemi, ambient, far } (far = fog far distance).
export function setupEnvironment(scene, map, { quality = 'medium', renderer = null, far: farOverride, fogScale = 1 } = {}) {
  const th = map.theme;
  const q = quality;
  if (renderer) {
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    setTextureQuality(q, renderer);
  }
  const far = farOverride ?? (q === 'low' ? Math.min(th.fogFar, 110) : th.fogFar);
  scene.background = new THREE.Color(th.horizon ?? th.fog);
  scene.fog = new THREE.Fog(th.fog, th.fogNear * (q === 'low' ? 0.8 : 1) * fogScale, far * fogScale);
  const sky = buildSky(th, far * fogScale + 18);
  scene.add(sky);
  const L = themeLighting(map);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI);
  scene.add(hemi);
  // flat fill so ceilings and shaded interiors never go pitch black
  const ambient = new THREE.AmbientLight(L.ambientC, L.ambientI);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(L.sunC, L.sunI);
  sun.position.copy(L.sunDir).multiplyScalar(60);
  if (renderer && renderer.shadowMap.enabled) {
    sun.castShadow = true;
    const size = q === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    const ext = q === 'high' ? 45 : 32;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 160 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);
  return { sky, sun, sunDir: L.sunDir, hemi, ambient, far };
}
