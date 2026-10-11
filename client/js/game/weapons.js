// Weapon models (guns + blaster): built from primitives, 3 material slots
// (base/accent/grip) so armory skins can restyle them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKINS, THEMES } from '/shared/skins.js';
import { patternTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Weapons: 3 material slots (base/accent/grip) so skins can restyle them.
// Built pointing towards -Z, grip at origin.
// ---------------------------------------------------------------------------
const WEAPON_PARTS = {
  pistol: (b, a, g) => {
    b.box(0.07, 0.09, 0.32, 0, 0.06, -0.12);
    a.box(0.03, 0.03, 0.06, 0, 0.06, -0.31, 0, 0, 0);
    g.box(0.065, 0.16, 0.08, 0, -0.04, 0.0, -0.25, 0, 0);
    a.box(0.02, 0.06, 0.06, 0, -0.005, -0.08);
  },
  revolver: (b, a, g) => {
    b.box(0.06, 0.06, 0.36, 0, 0.07, -0.18);
    a.cyl(0.055, 0.055, 0.1, 8, 0, 0.05, -0.02, Math.PI / 2, 0, 0);
    b.box(0.07, 0.07, 0.12, 0, 0.05, 0.03);
    g.box(0.06, 0.15, 0.08, 0, -0.05, 0.08, -0.4, 0, 0);
  },
  smg: (b, a, g) => {
    b.box(0.08, 0.11, 0.42, 0, 0.06, -0.1);
    a.box(0.04, 0.04, 0.12, 0, 0.07, -0.37);
    g.box(0.06, 0.15, 0.07, 0, -0.05, 0.02, -0.2, 0, 0);
    a.box(0.05, 0.2, 0.06, 0, -0.06, -0.16);
    g.box(0.05, 0.05, 0.22, 0, 0.06, 0.2);
  },
  shotgun: (b, a, g) => {
    b.box(0.08, 0.1, 0.55, 0, 0.06, -0.2);
    a.cyl(0.03, 0.03, 0.5, 8, 0, 0.1, -0.45, Math.PI / 2, 0, 0);
    a.box(0.09, 0.07, 0.2, 0, 0.0, -0.35);
    g.box(0.07, 0.13, 0.32, 0, 0.0, 0.2, 0.2, 0, 0);
  },
  rifle: (b, a, g) => {
    b.box(0.08, 0.12, 0.6, 0, 0.06, -0.18);
    a.box(0.035, 0.035, 0.22, 0, 0.08, -0.58);
    a.box(0.06, 0.22, 0.08, 0, -0.09, -0.15, 0.25, 0, 0);
    g.box(0.06, 0.14, 0.07, 0, -0.05, 0.05, -0.2, 0, 0);
    g.box(0.07, 0.14, 0.3, 0, 0.03, 0.27);
    a.box(0.04, 0.05, 0.18, 0, 0.15, -0.1);
  },
  sniper: (b, a, g) => {
    b.box(0.07, 0.1, 0.75, 0, 0.06, -0.25);
    a.cyl(0.022, 0.022, 0.45, 8, 0, 0.08, -0.82, Math.PI / 2, 0, 0);
    a.cyl(0.045, 0.045, 0.32, 10, 0, 0.17, -0.15, Math.PI / 2, 0, 0);
    g.box(0.06, 0.14, 0.07, 0, -0.05, 0.05, -0.2, 0, 0);
    g.box(0.07, 0.16, 0.35, 0, 0.02, 0.3);
  },
  blaster: (b, a, g) => {
    b.box(0.1, 0.14, 0.5, 0, 0.07, -0.15);
    a.cyl(0.05, 0.035, 0.22, 10, 0, 0.07, -0.5, Math.PI / 2, 0, 0);
    a.torus(0.06, 0.015, 0, 0.07, -0.36, 0, 0, 0);
    a.box(0.12, 0.04, 0.3, 0, 0.16, -0.12);
    g.box(0.07, 0.15, 0.08, 0, -0.06, 0.04, -0.2, 0, 0);
  },
};

class SlotBuilder {
  constructor() { this.geos = []; }
  push(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    this.geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(w, h, d, x, y, z, rx, ry, rz) { this.push(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  cyl(r1, r2, h, s, x, y, z, rx, ry, rz) { this.push(new THREE.CylinderGeometry(r1, r2, h, s), x, y, z, rx, ry, rz); }
  torus(r, t, x, y, z, rx, ry, rz) { this.push(new THREE.TorusGeometry(r, t, 6, 12), x, y, z, rx, ry, rz); }
  build() { return this.geos.length ? mergeGeometries(this.geos, false) : null; }
}

const weaponGeoCache = new Map();
function weaponGeos(type) {
  if (!weaponGeoCache.has(type)) {
    const b = new SlotBuilder(), a = new SlotBuilder(), g = new SlotBuilder();
    (WEAPON_PARTS[type] || WEAPON_PARTS.pistol)(b, a, g);
    weaponGeoCache.set(type, [b.build(), a.build(), g.build()]);
  }
  return weaponGeoCache.get(type);
}

const DEFAULT_SKIN = { base: 0x3a3f4a, accent: 0x9aa5b1, grip: 0x5b3a29, pattern: 'solid' };
const BLASTER_DEFAULT = { base: 0xeef2ff, accent: 0x7b6cff, grip: 0x2b2d42, pattern: 'solid', glow: 0x3020a0 };
const skinMatCache = new Map();
export function skinMaterials(skinId, weaponType) {
  const key = (skinId || 'default') + ':' + (skinId ? '' : weaponType);
  if (skinMatCache.has(key)) return skinMatCache.get(key);
  const skin = skinId ? SKINS[skinId] : null;
  const th = skin ? THEMES[skin.theme] : (weaponType === 'blaster' ? BLASTER_DEFAULT : DEFAULT_SKIN);
  const mk = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
  let base;
  if (th.pattern && th.pattern !== 'solid') base = mk(0xffffff, { map: patternTexture(th) });
  else base = mk(th.base);
  if (th.glow) base.emissive = new THREE.Color(th.glow);
  if (th.metal) { base = new THREE.MeshPhongMaterial({ color: th.pattern === 'solid' ? th.base : 0xffffff, map: th.pattern !== 'solid' ? patternTexture(th) : null, shininess: 90, specular: 0xffffff, emissive: th.glow || 0 }); }
  const accent = mk(th.accent, th.glow ? { emissive: new THREE.Color(th.glow).multiplyScalar(0.6) } : {});
  const grip = mk(th.grip);
  const mats = { base, accent, grip, animated: !!th.animated };
  skinMatCache.set(key, mats);
  return mats;
}

export function weaponModel(type, skinId) {
  const [gb, ga, gg] = weaponGeos(type);
  const mats = skinMaterials(skinId, type);
  const grp = new THREE.Group();
  if (gb) grp.add(new THREE.Mesh(gb, mats.base));
  if (ga) grp.add(new THREE.Mesh(ga, mats.accent));
  if (gg) grp.add(new THREE.Mesh(gg, mats.grip));
  grp.userData.weapon = type;
  grp.userData.mats = mats;
  return grp;
}

// muzzle offset (local) for effects
export const MUZZLE = { pistol: -0.34, revolver: -0.38, smg: -0.44, shotgun: -0.7, rifle: -0.7, sniper: -1.05, blaster: -0.62 };
