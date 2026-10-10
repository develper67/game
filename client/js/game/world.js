// Builds Three.js meshes for a map: merged static geometry per material,
// instanced props, and individually animated doors/containers/benches.
import * as THREE from 'three';
import { tex, TEX_SCALE } from './textures.js';
import { propTemplate, containerModel, benchModel, resourceModel, tableModel } from './models.js';
import { CONTAINER_DIMS } from '/shared/mapbuilder.js';

const _col = new THREE.Color();

// Add the 6 faces of a box (skip faces flagged hidden) into arrays
function pushBox(arr, b, scale) {
  const { x0, y0, z0, x1, y1, z1 } = b;
  _col.set(b.c ?? 0xffffff).convertSRGBToLinear();
  const r = _col.r, g = _col.g, bl = _col.b;
  const s = 1 / scale;
  const face = (p0, p1, p2, p3, n, uv) => {
    const base = arr.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) { arr.pos.push(p[0], p[1], p[2]); arr.nor.push(n[0], n[1], n[2]); arr.col.push(r, g, bl); }
    for (const u of uv) arr.uv.push(u[0], u[1]);
    arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // +X
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s]]);
  // -X
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]]);
  // +Y
  face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s]]);
  // -Y (skip when resting on the ground)
  if (y0 > 0.01) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]]);
  // +Z
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]]);
  // -Z
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s]]);
}

function pushPrism(arr, p, scale) {
  const { x0, z0, x1, z1, y0, h, ridgeX } = p;
  _col.set(p.c ?? 0xffffff).convertSRGBToLinear();
  const s = 1 / scale;
  const tri = (a, b, c) => {
    const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
    const ac = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a));
    const n = ab.cross(ac).normalize();
    const base = arr.pos.length / 3;
    for (const v of [a, b, c]) { arr.pos.push(...v); arr.nor.push(n.x, n.y, n.z); arr.col.push(_col.r, _col.g, _col.b); arr.uv.push((v[0] + v[2]) * s, v[1] * s * 1.6); }
    arr.idx.push(base, base + 1, base + 2);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const yt = y0 + h;
  if (ridgeX) {
    const zm = (z0 + z1) / 2;
    quad([x0, y0, z0], [x0, yt, zm], [x1, yt, zm], [x1, y0, z0]);
    quad([x1, y0, z1], [x1, yt, zm], [x0, yt, zm], [x0, y0, z1]);
    tri([x0, y0, z1], [x0, yt, zm], [x0, y0, z0]);
    tri([x1, y0, z0], [x1, yt, zm], [x1, y0, z1]);
  } else {
    const xm = (x0 + x1) / 2;
    quad([x1, y0, z0], [xm, yt, z0], [xm, yt, z1], [x1, y0, z1]);
    quad([x0, y0, z1], [xm, yt, z1], [xm, yt, z0], [x0, y0, z0]);
    tri([x0, y0, z0], [xm, yt, z0], [x1, y0, z0]);
    tri([x1, y0, z1], [xm, yt, z1], [x0, y0, z1]);
  }
}

function pushRamp(arr, r, scale) {
  // wedge rising along (dx,dz) from y0 to y0+h over the rectangle
  const { x0, z0, x1, z1, y0, h, dx, dz } = r;
  _col.set(r.c ?? 0xffffff).convertSRGBToLinear();
  const s = 1 / scale;
  const hAt = (x, z) => {
    let t;
    if (dx > 0) t = (x - x0) / (x1 - x0); else if (dx < 0) t = (x1 - x) / (x1 - x0);
    else if (dz > 0) t = (z - z0) / (z1 - z0); else t = (z1 - z) / (z1 - z0);
    return y0 + h * t;
  };
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const top = corners.map(([x, z]) => [x, hAt(x, z), z]);
  const tri = (a, b, c) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    const base = arr.pos.length / 3;
    for (const v of [a, b, c]) { arr.pos.push(...v); arr.nor.push(n.x, n.y, n.z); arr.col.push(_col.r, _col.g, _col.b); arr.uv.push(v[0] * s, v[2] * s); }
    arr.idx.push(base, base + 1, base + 2);
  };
  // top surface (two triangles, wound upward)
  tri(top[0], top[3], top[2]); tri(top[0], top[2], top[1]);
  // sides down to y0
  const bot = corners.map(([x, z]) => [x, y0, z]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (Math.abs(top[i][1] - y0) < 0.001 && Math.abs(top[j][1] - y0) < 0.001) continue;
    tri(bot[i], bot[j], top[j]); tri(bot[i], top[j], top[i]);
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

const NO_TEX = new Set(['light', 'sign', 'glass', 'paint']);

export function buildWorld(map, { shadows = false, quality = 'medium' } = {}) {
  const root = new THREE.Group();
  root.name = 'world';
  const theme = map.theme;
  const groups = new Map(); // material key -> arrays
  const getArr = (key) => {
    if (!groups.has(key)) groups.set(key, { pos: [], nor: [], col: [], uv: [], idx: [] });
    return groups.get(key);
  };
  for (const b of map.boxes) {
    if (b.vis === false) continue;
    const key = b.glass ? 'glass' : b.emissive || b.m === 'light' || b.m === 'sign' ? 'emissive' : b.m;
    pushBox(getArr(key), b, TEX_SCALE[b.m] || 2);
  }
  for (const p of map.prisms) pushPrism(getArr(p.m), p, TEX_SCALE[p.m] || 2.5);
  for (const r of map.ramps) pushRamp(getArr(r.m), r, TEX_SCALE[r.m] || 2);

  const mats = new Map();
  for (const [key, arr] of groups) {
    if (!arr.pos.length) continue;
    const geo = makeGeo(arr);
    let mat;
    if (key === 'glass') mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    else if (key === 'emissive') mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    else {
      const t = NO_TEX.has(key) ? null : tex(key);
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: t || null });
    }
    mats.set(key, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'static:' + key;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (shadows && key !== 'glass' && key !== 'emissive') { mesh.castShadow = true; mesh.receiveShadow = true; }
    if (key === 'glass') mesh.renderOrder = 2;
    root.add(mesh);
  }

  // cylinders (silos, pillars, tanks)
  if (map.cylinders.length) {
    const byMat = new Map();
    for (const c of map.cylinders) {
      const key = c.m;
      if (!byMat.has(key)) byMat.set(key, []);
      byMat.get(key).push(c);
    }
    for (const [key, list] of byMat) {
      const geos = [];
      for (const c of list) {
        const g = new THREE.CylinderGeometry(c.r, c.r, c.h, c.seg || 14).toNonIndexed();
        g.translate(c.x, c.y0 + c.h / 2, c.z);
        _col.set(c.c).convertSRGBToLinear();
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geos.push(g);
      }
      const merged = mergeList(geos);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, map: tex(key) || null }));
      if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
  }

  // ground plane
  const s = map.size;
  if (!map.noGround) {
    const gw = (s.maxX - s.minX) + 260, gd = (s.maxZ - s.minZ) + 260;
    const gt = tex(theme.ground.m).clone();
    gt.needsUpdate = true;
    gt.repeat.set(gw / (TEX_SCALE[theme.ground.m] || 6), gd / (TEX_SCALE[theme.ground.m] || 6));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: theme.ground.c, map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((s.minX + s.maxX) / 2, 0, (s.minZ + s.maxZ) / 2);
    ground.receiveShadow = shadows;
    ground.name = 'ground';
    root.add(ground);
  }
  if (map.water) {
    const w = map.water;
    const wt = tex('water').clone(); wt.needsUpdate = true; wt.repeat.set(40, 40);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), new THREE.MeshLambertMaterial({ color: w.c ?? 0x2a7fbf, map: wt, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(w.x, w.y, w.z);
    water.name = 'water';
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
  for (const [kind, list] of byKind) {
    const tpl = propTemplate(kind);
    if (!tpl) continue;
    for (const layer of tpl) {
      const im = new THREE.InstancedMesh(layer.geo, layer.basic ? vcBasic : vcLambert, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw || 0);
        v.set(p.x, p.y, p.z);
        sc.setScalar(p.s || 1);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (layer.tint) {
          const base = layer.colorKey && p[layer.colorKey] !== undefined ? p[layer.colorKey] : layer.base;
          _col.set(base);
          if (!layer.colorKey) _col.offsetHSL((hash(p.x, p.z) - 0.5) * 0.04, 0, (hash(p.z, p.x) - 0.5) * 0.12);
          im.setColorAt(i, _col);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (shadows && !layer.basic && (kind === 'pine' || kind === 'tree' || kind === 'palm' || kind === 'car' || kind === 'rock' || kind === 'bigrock' || kind === 'rack' || kind === 'watertower' || kind === 'tank')) im.castShadow = true;
      im.computeBoundingSphere();
      im.name = 'prop:' + kind;
      root.add(im);
    }
  }

  // emissive light bulbs for map lights (fireplaces, lamps) — no real lights for performance
  for (const l of map.lights) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: l.color }));
    bulb.position.set(l.x, l.y, l.z);
    root.add(bulb);
  }

  // dynamic objects
  const doors = new Map();
  const doorMat = new THREE.MeshLambertMaterial({ map: tex('door'), vertexColors: false });
  for (const d of map.doors) {
    const [hx, hz] = d.hinge, [tx, tz] = d.tip;
    const len = Math.hypot(tx - hx, tz - hz);
    const height = d.y1 - d.y0;
    const pivot = new THREE.Group();
    pivot.position.set(hx, d.y0, hz);
    const baseAngle = Math.atan2(-(tz - hz), tx - hx); // rotation so local +X points from hinge to tip
    const mat = doorMat.clone();
    mat.color.set(d.color);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.07), mat);
    leaf.position.set(len / 2, height / 2, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
    knob.position.set(len - 0.15, height * 0.45, 0.07);
    const knob2 = knob.clone(); knob2.position.z = -0.07;
    pivot.add(leaf, knob, knob2);
    // open direction: rotate so the tip swings towards the inside vector
    const dirX = (tx - hx) / len, dirZ = (tz - hz) / len;
    const [ix, iz] = d.inside;
    // rotating the tip direction by +90deg (three.js y rotation): (x,z)->(z,-x)
    const plus = dirZ * ix + (-dirX) * iz;
    const openAngle = plus > 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.rotation.y = baseAngle;
    if (shadows) leaf.castShadow = true;
    root.add(pivot);
    doors.set(d.id, { def: d, pivot, base: baseAngle, openAngle, open: !!d.open, cur: d.open ? 1 : 0, mesh: leaf });
  }

  const containers = new Map();
  for (const c of map.containers) {
    const dims = CONTAINER_DIMS[c.kind] || CONTAINER_DIMS.crate;
    const mdl = containerModel(c.kind, dims);
    mdl.position.set(c.x, c.y, c.z);
    mdl.rotation.y = (c.r || 0) * Math.PI / 2;
    if (shadows) mdl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(mdl);
    containers.set(c.id, { def: c, model: mdl, opened: false, anim: 0 });
  }

  const benches = new Map();
  for (const b of map.benches) {
    const mdl = benchModel();
    mdl.position.set(b.x, b.y, b.z);
    mdl.rotation.y = (b.r || 0) * Math.PI / 2;
    root.add(mdl);
    benches.set(b.id, { def: b, model: mdl });
  }

  const resources = new Map();
  for (const r of map.resources) {
    const mdl = resourceModel(r.kind);
    mdl.position.set(r.x, r.y, r.z);
    mdl.rotation.y = hash(r.x, r.z) * Math.PI * 2;
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

// Sky dome with vertical gradient + a few clouds
export function buildSky(theme, size = 420) {
  const g = new THREE.SphereGeometry(size, 24, 16);
  const top = new THREE.Color(theme.skyTop), bot = new THREE.Color(theme.skyBottom);
  const col = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) / size + 0.1) / 0.8));
    const c = bot.clone().lerp(top, Math.pow(t, 0.7));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  const grp = new THREE.Group();
  grp.add(sky);
  if (theme.clouds !== false) {
    const cloudMat = new THREE.MeshLambertMaterial({ color: theme.cloud ?? 0xffffff, fog: false, emissive: 0x666666 });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(8 + (k % 2) * 4, 1), cloudMat);
        m.position.set(k * 9 - n * 4, (k % 2) * 3, (k % 3) * 4);
        m.scale.y = 0.55;
        cloud.add(m);
      }
      const a = (i / 14) * Math.PI * 2 + hash(i, 3);
      const r = 180 + hash(i, 7) * 120;
      cloud.position.set(Math.cos(a) * r, 90 + hash(i, 11) * 50, Math.sin(a) * r);
      grp.add(cloud);
    }
  }
  return grp;
}
