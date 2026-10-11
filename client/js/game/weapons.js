// Weapon models (guns + blaster), built from rounded primitives.
// Every gun points toward -Z with the grip (hand position) at the origin.
// Parts go into material slots so armory skins can restyle them:
//   b = body/base (skin pattern), a = accent, g = grip/stock, m = gunmetal details,
//   l = lenses (red dot, scope glass) — slots m and l keep their look on most skins.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SKINS, THEMES } from '/shared/skins.js';
import { patternTexture } from './textures.js';

const PI = Math.PI;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

class SlotBuilder {
  constructor() { this.geos = []; }
  push(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s));
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    this.geos.push(g);
  }
  // chamfered box: the rounded edges catch light and read as "modelled", not "box"
  rbox(w, h, d, x, y, z, rx, ry, rz, r) {
    const rad = r ?? Math.min(w, h, d) * 0.22;
    this.push(new RoundedBoxGeometry(w, h, d, 1, rad), x, y, z, rx, ry, rz);
  }
  box(w, h, d, x, y, z, rx, ry, rz) { this.push(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  // cylinder along Z (barrels, tubes, scopes)
  tube(r1, r2, len, seg, x, y, z) { this.push(new THREE.CylinderGeometry(r1, r2, len, seg), x, y, z, PI / 2, 0, 0); }
  // cylinder along Y
  post(r, len, seg, x, y, z, rx = 0, ry = 0, rz = 0) { this.push(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, rx, ry, rz); }
  // cylinder along X
  axle(r, len, seg, x, y, z) { this.push(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, 0, 0, PI / 2); }
  ring(r, t, x, y, z, rx = 0, ry = 0, rz = 0) { this.push(new THREE.TorusGeometry(r, t, 6, 16), x, y, z, rx, ry, rz); }
  ball(r, x, y, z) { this.push(new THREE.SphereGeometry(r, 8, 6), x, y, z); }
  build() { return this.geos.length ? mergeGeometries(this.geos, false) : null; }
}

// trigger + guard, shared by every gun
function triggerGroup(m, z, y = 0.004) {
  m.ring(0.026, 0.0045, 0, y - 0.006, z, 0, PI / 2, 0);
  m.box(0.008, 0.028, 0.01, 0, y - 0.012, z + 0.004, 0.35);
}

const WEAPON_PARTS = {
  pistol: ({ b, a, g, m }) => {
    b.rbox(0.058, 0.062, 0.3, 0, 0.068, -0.115);                       // slide
    for (let i = 0; i < 5; i++) m.box(0.061, 0.044, 0.005, 0, 0.07, 0.0 + i * 0.008); // rear serrations
    m.box(0.03, 0.004, 0.17, 0, 0.1, -0.16);                            // ejection-port flat
    m.box(0.008, 0.013, 0.012, 0, 0.105, -0.25);                        // front sight
    m.box(0.042, 0.012, 0.012, 0, 0.105, 0.022);                        // rear sight
    m.tube(0.011, 0.011, 0.03, 10, 0, 0.07, -0.268);                     // barrel tip
    a.rbox(0.052, 0.036, 0.22, 0, 0.022, -0.085);                       // frame
    for (let i = 0; i < 3; i++) m.box(0.054, 0.005, 0.012, 0, 0.004, -0.15 - i * 0.02); // accessory rail
    triggerGroup(m, -0.045);
    g.rbox(0.054, 0.15, 0.072, 0, -0.06, 0.024, -0.25);                 // grip
    m.box(0.058, 0.012, 0.078, 0, -0.135, 0.044, -0.25);                // mag base plate
  },
  revolver: ({ b, a, g, m }) => {
    m.tube(0.016, 0.016, 0.2, 12, 0, 0.08, -0.19);                       // barrel
    b.rbox(0.03, 0.032, 0.17, 0, 0.058, -0.18);                         // underlug
    m.tube(0.005, 0.005, 0.11, 6, 0, 0.042, -0.13);                      // ejector rod
    m.box(0.008, 0.016, 0.02, 0, 0.1, -0.28);                           // front blade
    b.rbox(0.046, 0.08, 0.13, 0, 0.062, -0.01);                         // frame
    b.box(0.028, 0.016, 0.11, 0, 0.104, -0.02);                         // top strap
    a.tube(0.039, 0.039, 0.076, 14, 0, 0.062, -0.025);                   // cylinder
    for (let i = 0; i < 6; i++) {                                       // flutes
      const ang = (i / 6) * PI * 2;
      m.tube(0.007, 0.007, 0.078, 6, Math.cos(ang) * 0.036, 0.062 + Math.sin(ang) * 0.036, -0.025);
    }
    m.box(0.012, 0.03, 0.026, 0, 0.1, 0.045, -0.6);                     // hammer
    triggerGroup(m, -0.0);
    g.rbox(0.05, 0.13, 0.066, 0, -0.035, 0.062, -0.45);                 // wooden grip
    m.post(0.004, 0.052, 6, 0, -0.03, 0.062, 0, 0, PI / 2);             // grip screw
  },
  smg: ({ b, a, g, m }) => {
    b.rbox(0.062, 0.085, 0.32, 0, 0.06, -0.085);                        // receiver
    m.tube(0.024, 0.024, 0.11, 12, 0, 0.068, -0.3);                      // barrel shroud
    for (let i = 0; i < 3; i++) m.ring(0.0245, 0.004, 0, 0.068, -0.265 - i * 0.03);
    m.tube(0.013, 0.015, 0.05, 10, 0, 0.068, -0.375);                    // muzzle
    m.box(0.03, 0.012, 0.22, 0, 0.108, -0.09);                          // top rail
    for (let i = 0; i < 8; i++) m.box(0.034, 0.008, 0.01, 0, 0.116, -0.18 + i * 0.026);
    m.box(0.008, 0.02, 0.012, 0, 0.12, -0.2);                           // front sight
    m.box(0.03, 0.02, 0.014, 0, 0.12, 0.02);                            // rear sight
    m.box(0.008, 0.012, 0.04, 0.034, 0.075, -0.02);                     // charging handle
    a.rbox(0.045, 0.04, 0.066, 0, 0.002, -0.135);                       // mag well
    a.rbox(0.034, 0.19, 0.054, 0, -0.085, -0.15, 0.14);                 // magazine
    triggerGroup(m, -0.03);
    g.rbox(0.046, 0.13, 0.06, 0, -0.045, 0.02, -0.3);                   // pistol grip
    g.rbox(0.034, 0.08, 0.036, 0, -0.02, -0.25, 0.1);                   // fore grip
    m.box(0.008, 0.008, 0.2, 0.022, 0.05, 0.16);                        // wire stock
    m.box(0.008, 0.008, 0.2, -0.022, 0.05, 0.16);
    g.rbox(0.056, 0.09, 0.02, 0, 0.035, 0.265);                         // butt plate
  },
  shotgun: ({ b, a, g, m }) => {
    b.rbox(0.064, 0.09, 0.24, 0, 0.066, -0.02);                         // receiver
    m.box(0.066, 0.03, 0.08, 0, 0.075, -0.03);                          // ejection port
    m.tube(0.019, 0.019, 0.56, 14, 0, 0.09, -0.41);                      // barrel
    m.tube(0.022, 0.022, 0.03, 14, 0, 0.09, -0.675);                     // muzzle band
    m.tube(0.016, 0.016, 0.46, 12, 0, 0.052, -0.35);                     // magazine tube
    m.ball(0.007, 0, 0.113, -0.66);                                     // bead sight
    m.box(0.01, 0.016, 0.42, 0, 0.11, -0.36);                           // vent rib
    a.rbox(0.054, 0.052, 0.17, 0, 0.05, -0.36);                         // pump
    for (let i = 0; i < 6; i++) m.box(0.057, 0.054, 0.007, 0, 0.05, -0.42 + i * 0.024); // pump grooves
    triggerGroup(m, 0.02);
    g.rbox(0.05, 0.1, 0.06, 0, -0.02, 0.07, -0.55);                     // grip
    g.rbox(0.056, 0.11, 0.3, 0, 0.03, 0.25, 0.12);                      // stock
    m.rbox(0.06, 0.125, 0.025, 0, 0.012, 0.405, 0.12);                  // recoil pad
  },
  rifle: ({ b, a, g, m, l }) => {
    b.rbox(0.062, 0.07, 0.32, 0, 0.082, -0.06);                         // upper receiver
    b.rbox(0.056, 0.05, 0.2, 0, 0.032, -0.04);                          // lower receiver
    m.box(0.064, 0.026, 0.06, 0, 0.084, -0.03);                         // ejection port
    a.rbox(0.07, 0.072, 0.26, 0, 0.078, -0.35);                         // handguard
    for (let i = 0; i < 5; i++) m.box(0.072, 0.018, 0.022, 0, 0.078, -0.44 + i * 0.045); // vents
    m.tube(0.011, 0.011, 0.2, 10, 0, 0.082, -0.57);                      // barrel
    m.box(0.02, 0.05, 0.022, 0, 0.1, -0.5);                             // gas block / front post
    m.tube(0.018, 0.018, 0.065, 10, 0, 0.082, -0.69);                    // muzzle brake
    for (let i = 0; i < 3; i++) m.box(0.038, 0.006, 0.008, 0, 0.082, -0.67 - i * 0.016);
    m.box(0.032, 0.014, 0.52, 0, 0.124, -0.16);                         // top rail
    for (let i = 0; i < 14; i++) m.box(0.036, 0.008, 0.01, 0, 0.133, -0.4 + i * 0.034);
    m.rbox(0.04, 0.045, 0.075, 0, 0.158, -0.02);                        // red dot body
    m.rbox(0.044, 0.008, 0.08, 0, 0.183, -0.02);                        // red dot hood
    l.box(0.03, 0.026, 0.004, 0, 0.16, -0.058);                         // red dot lens
    a.rbox(0.036, 0.11, 0.064, 0, -0.03, -0.14, 0.12);                  // magazine (curves forward)
    a.rbox(0.034, 0.1, 0.06, 0, -0.118, -0.172, 0.42);
    triggerGroup(m, 0.0, 0.01);
    g.rbox(0.045, 0.12, 0.058, 0, -0.04, 0.045, -0.3);                  // pistol grip
    m.tube(0.017, 0.017, 0.12, 10, 0, 0.078, 0.15);                      // buffer tube
    g.rbox(0.055, 0.1, 0.17, 0, 0.058, 0.27);                           // stock
    g.rbox(0.04, 0.03, 0.12, 0, 0.115, 0.25);                           // cheek riser
    m.rbox(0.058, 0.115, 0.02, 0, 0.058, 0.36);                         // butt pad
  },
  sniper: ({ b, a, g, m, l }) => {
    b.rbox(0.058, 0.078, 0.34, 0, 0.078, -0.1);                         // receiver
    m.tube(0.015, 0.012, 0.52, 12, 0, 0.088, -0.52);                     // barrel (tapered)
    m.rbox(0.04, 0.036, 0.075, 0, 0.088, -0.81);                        // muzzle brake
    for (let i = 0; i < 3; i++) m.box(0.044, 0.008, 0.01, 0, 0.088, -0.79 - i * 0.02);
    g.rbox(0.062, 0.066, 0.4, 0, 0.044, -0.4);                          // forend
    m.post(0.004, 0.11, 6, 0.02, -0.02, -0.5, 0.3, 0, 0);               // bipod legs (folded)
    m.post(0.004, 0.11, 6, -0.02, -0.02, -0.5, 0.3, 0, 0);
    g.rbox(0.056, 0.125, 0.3, 0, 0.03, 0.22, 0.08);                     // stock
    g.rbox(0.048, 0.03, 0.15, 0, 0.11, 0.2);                            // cheek rest
    m.rbox(0.06, 0.13, 0.022, 0, 0.022, 0.37, 0.08);                    // butt pad
    g.rbox(0.046, 0.11, 0.058, 0, -0.035, 0.055, -0.35);                // grip
    a.rbox(0.042, 0.05, 0.08, 0, 0.018, -0.07);                         // magazine
    triggerGroup(m, 0.0);
    m.axle(0.006, 0.06, 6, 0.04, 0.08, 0.04);                           // bolt handle
    m.ball(0.013, 0.072, 0.072, 0.04);
    m.box(0.024, 0.044, 0.024, 0, 0.13, -0.17);                         // scope mounts
    m.box(0.024, 0.044, 0.024, 0, 0.13, 0.02);
    b.tube(0.022, 0.022, 0.3, 14, 0, 0.165, -0.08);                      // scope tube
    b.tube(0.035, 0.022, 0.08, 14, 0, 0.165, -0.27);                     // objective bell
    b.tube(0.03, 0.03, 0.06, 14, 0, 0.165, 0.1);                         // ocular
    a.ring(0.035, 0.005, 0, 0.165, -0.31);
    a.ring(0.03, 0.005, 0, 0.165, 0.13);
    m.post(0.012, 0.03, 10, 0, 0.195, -0.08);                           // turrets
    m.axle(0.012, 0.03, 10, 0.03, 0.165, -0.08);
    l.tube(0.031, 0.031, 0.004, 14, 0, 0.165, -0.312);                   // lenses
    l.tube(0.026, 0.026, 0.004, 14, 0, 0.165, 0.132);
  },
  blaster: ({ b, a, g, m }) => {
    b.rbox(0.09, 0.11, 0.36, 0, 0.07, -0.12, 0, 0, 0, 0.03);           // body
    b.rbox(0.02, 0.05, 0.22, 0, 0.135, -0.1, 0, 0, 0, 0.008);          // top fin
    b.rbox(0.018, 0.07, 0.12, 0.054, 0.06, -0.25, 0, 0, 0.2, 0.007);   // side fins
    b.rbox(0.018, 0.07, 0.12, -0.054, 0.06, -0.25, 0, 0, -0.2, 0.007);
    a.tube(0.017, 0.017, 0.13, 10, 0.052, 0.085, 0.0);                   // energy cells
    a.tube(0.017, 0.017, 0.13, 10, -0.052, 0.085, 0.0);
    a.box(0.02, 0.006, 0.3, 0, 0.127, -0.12);                           // glow stripe
    a.ring(0.04, 0.009, 0, 0.07, -0.32);                                // emitter rings
    a.ring(0.03, 0.007, 0, 0.07, -0.38);
    m.tube(0.034, 0.028, 0.1, 14, 0, 0.07, -0.35);                       // barrel
    m.tube(0.02, 0.024, 0.06, 12, 0, 0.07, -0.42);                       // nozzle
    m.tube(0.02, 0.02, 0.028, 10, 0.052, 0.085, 0.08);                   // cell caps
    m.tube(0.02, 0.02, 0.028, 10, -0.052, 0.085, 0.08);
    triggerGroup(m, 0.0);
    g.rbox(0.05, 0.13, 0.064, 0, -0.04, 0.045, -0.25);                  // grip
    g.rbox(0.07, 0.07, 0.1, 0, 0.065, 0.1);                             // rear block
  },
};

const SLOTS = ['b', 'a', 'g', 'm', 'l'];
const weaponGeoCache = new Map();
function weaponGeos(type) {
  if (!weaponGeoCache.has(type)) {
    const s = Object.fromEntries(SLOTS.map((k) => [k, new SlotBuilder()]));
    (WEAPON_PARTS[type] || WEAPON_PARTS.pistol)(s);
    const geos = SLOTS.map((k) => s[k].build());
    for (const geo of geos) if (geo) { geo.computeBoundingSphere(); geo.userData.shared = true; }
    weaponGeoCache.set(type, geos);
  }
  return weaponGeoCache.get(type);
}

const DEFAULT_SKIN = { base: 0x3b4150, accent: 0x5d6675, grip: 0x5b3a29, pattern: 'solid' };
const DEFAULT_BY_TYPE = {
  pistol: { base: 0x3a404c, accent: 0x59616f, grip: 0x2c2f36 },
  revolver: { base: 0x8d96a3, accent: 0xb7c0cc, grip: 0x7a4a2a },
  smg: { base: 0x34393f, accent: 0x262a30, grip: 0x2b2f35 },
  shotgun: { base: 0x3a3f47, accent: 0x8a5a33, grip: 0x7a4a2a },
  rifle: { base: 0x3d4148, accent: 0x6b6f5a, grip: 0x2b2e33 },
  sniper: { base: 0x2f3b33, accent: 0x262a30, grip: 0x55603f },
};
const BLASTER_DEFAULT = { base: 0xeef2ff, accent: 0x7b6cff, grip: 0x2b2d42, pattern: 'solid', glow: 0x3020a0 };
const LENS = { rifle: 0xff3355, sniper: 0x2f7fa8 };

const skinMatCache = new Map();
export function skinMaterials(skinId, weaponType) {
  const key = (skinId || 'default') + ':' + weaponType;
  if (skinMatCache.has(key)) return skinMatCache.get(key);
  const skin = skinId ? SKINS[skinId] : null;
  const th = skin ? THEMES[skin.theme] : weaponType === 'blaster' ? BLASTER_DEFAULT : { ...DEFAULT_SKIN, ...(DEFAULT_BY_TYPE[weaponType] || {}) };
  const patterned = th.pattern && th.pattern !== 'solid';
  const shiny = th.metal ? 110 : 34;
  const map = patterned ? patternTexture(th) : null;
  const base = new THREE.MeshPhongMaterial({
    color: patterned ? 0xffffff : th.base, map,
    shininess: shiny, specular: th.metal ? 0xffffff : 0x3a3a3a, emissive: th.glow ? new THREE.Color(th.glow) : 0x000000,
  });
  // glowing patterned skins (neon circuits, lava cracks, toxic drips): only the bright pattern glows
  if (th.glow && map) { base.emissiveMap = map; base.emissiveIntensity = 0.9; }
  const accent = new THREE.MeshPhongMaterial({
    color: th.accent, shininess: shiny, specular: 0x444444,
    emissive: th.glow ? new THREE.Color(th.glow).multiplyScalar(weaponType === 'blaster' || skin ? 1.4 : 0.6) : 0x000000,
  });
  const grip = new THREE.MeshLambertMaterial({ color: th.grip });
  // gunmetal details: tinted on precious-metal skins, plain gunmetal otherwise
  const metal = th.metal
    ? new THREE.MeshPhongMaterial({ color: new THREE.Color(th.base).multiplyScalar(0.7), shininess: 120, specular: 0xffffff })
    : new THREE.MeshPhongMaterial({ color: 0x24272d, shininess: 70, specular: 0x5a5f69 });
  const lens = new THREE.MeshBasicMaterial({ color: LENS[weaponType] || 0x66d9ff, transparent: true, opacity: weaponType === 'sniper' ? 0.55 : 0.9 });
  const mats = { base, accent, grip, metal, lens, animated: !!th.animated };
  skinMatCache.set(key, mats);
  return mats;
}

export function weaponModel(type, skinId) {
  const geos = weaponGeos(type);
  const mats = skinMaterials(skinId, type);
  const order = [mats.base, mats.accent, mats.grip, mats.metal, mats.lens];
  const grp = new THREE.Group();
  geos.forEach((geo, i) => { if (geo) grp.add(new THREE.Mesh(geo, order[i])); });
  grp.userData.weapon = type;
  grp.userData.mats = mats;
  return grp;
}

// muzzle position (local, along -Z and height) for flashes and tracers
export const MUZZLE = { pistol: -0.285, revolver: -0.3, smg: -0.4, shotgun: -0.69, rifle: -0.72, sniper: -0.85, blaster: -0.45 };
export const MUZZLE_Y = { pistol: 0.07, revolver: 0.08, smg: 0.068, shotgun: 0.09, rifle: 0.082, sniper: 0.088, blaster: 0.07 };
