// Third-person character used for other players, bots and the menu showcase.
// Chunky cartoon proportions with toon shading. Static parts of each body
// segment are merged into one vertex-coloured mesh so a whole character costs
// about a dozen draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { labelTexture } from './textures.js';
import { MB } from './models.js';
import { weaponModel } from './weapons.js';
import { potatoModel, chickenModel } from './models.js';

const SKIN = 0xffd7b5;
const BOT_SKIN = 0xb8c6d0;
const HELD_SCALE = 1.35; // guns read better a bit oversized on chunky characters

// soft 4-step toon ramp shared by every character
let _ramp = null;
function toonRamp() {
  if (_ramp) return _ramp;
  const data = new Uint8Array([125, 175, 225, 255]);
  _ramp = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}
const toon = (opts = {}) => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...opts });

function shadeHex(hex, f) { return new THREE.Color(hex).multiplyScalar(f).getHex(); }
function rb(w, h, d, r, seg = 2) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); }

// ---------------------------------------------------------------------------
// Faces: drawn on a transparent canvas and shown on a plane in front of the head
const faceCache = new Map();
function faceTex(kind) {
  if (faceCache.has(kind)) return faceCache.get(kind);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const ink = '#2a1a22';
  // big glossy cartoon eye
  const eye = (cx, cy, r = 13, look = 0) => {
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = ink; x.beginPath(); x.ellipse(cx + look, cy + 2, r * 0.55, r * 0.66, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx + look - r * 0.2, cy - r * 0.25, r * 0.22, 0, Math.PI * 2); x.fill();
  };
  const mouth = (y, w, curve, open = false) => {
    x.strokeStyle = ink; x.lineWidth = 6; x.beginPath();
    x.moveTo(64 - w, y); x.quadraticCurveTo(64, y + curve, 64 + w, y);
    if (open) { x.closePath(); x.fillStyle = '#7a2638'; x.fill(); }
    x.stroke();
  };
  const blush = () => { x.fillStyle = 'rgba(255,105,130,0.45)'; for (const bx of [26, 102]) { x.beginPath(); x.ellipse(bx, 84, 11, 7, 0, 0, Math.PI * 2); x.fill(); } };
  const brow = (x0, y0, x1, y1) => { x.strokeStyle = ink; x.lineWidth = 6; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
  switch (kind) {
    case 'bot': {
      // glossy visor with glowing LED eyes
      x.fillStyle = '#132235'; x.beginPath(); x.roundRect(12, 34, 104, 54, 22); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.roundRect(20, 38, 60, 10, 5); x.fill();
      x.fillStyle = '#4cf0ff'; x.shadowColor = '#4cf0ff'; x.shadowBlur = 10;
      x.beginPath(); x.roundRect(34, 52, 18, 18, 6); x.fill();
      x.beginPath(); x.roundRect(76, 52, 18, 18, 6); x.fill();
      x.shadowBlur = 0;
      break;
    }
    case 'cool':
      x.fillStyle = '#111'; x.beginPath(); x.roundRect(16, 40, 42, 24, 9); x.fill(); x.beginPath(); x.roundRect(70, 40, 42, 24, 9); x.fill();
      x.fillRect(52, 46, 24, 6);
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(22, 44, 12, 5); x.fillRect(76, 44, 12, 5);
      mouth(92, 20, 10);
      break;
    case 'angry':
      eye(40, 58, 12, 2); eye(88, 58, 12, -2);
      brow(22, 36, 54, 46); brow(106, 36, 74, 46);
      mouth(100, 18, -12);
      break;
    case 'derp':
      eye(38, 54, 16, 4); eye(92, 60, 9, -3);
      x.strokeStyle = ink; x.lineWidth = 6; x.beginPath(); x.moveTo(42, 92); x.quadraticCurveTo(64, 106, 88, 88); x.stroke();
      x.fillStyle = '#ff6b8b'; x.beginPath(); x.ellipse(72, 101, 9, 7, 0.3, 0, Math.PI * 2); x.fill();
      break;
    case 'wink':
      eye(40, 56, 13);
      x.strokeStyle = ink; x.lineWidth = 7; x.beginPath(); x.moveTo(76, 58); x.quadraticCurveTo(88, 48, 100, 58); x.stroke();
      blush(); mouth(88, 18, 16, true);
      break;
    default: // happy
      eye(40, 56, 13); eye(88, 56, 13);
      blush(); mouth(86, 20, 20, true);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  faceCache.set(kind, t);
  return t;
}
let _faceGeo = null;

// ---------------------------------------------------------------------------
// Hats: one merged, vertex-coloured mesh each (position: on top of the head)
function hatGeometry(hat, color) {
  const mb = new MB();
  const c = new THREE.Color(color);
  switch (hat) {
    case 'cap': {
      const cc = c.clone().offsetHSL(0.5, 0, 0).getHex();
      mb.add(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cc, 0, 0.42, 0, 0, 0, 0, 1, 0.75, 1.02);
      mb.add(rb(0.34, 0.03, 0.22, 0.012), cc, 0, 0.43, -0.25);
      mb.add(new THREE.SphereGeometry(0.03, 8, 6), 0xffffff, 0, 0.61, 0);
      break;
    }
    case 'beanie': {
      mb.add(new THREE.SphereGeometry(0.255, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe63946, 0, 0.4, 0, 0, 0, 0, 1, 0.95, 1);
      mb.add(new THREE.CylinderGeometry(0.262, 0.262, 0.08, 16), 0xc62f3b, 0, 0.42, 0);
      mb.add(new THREE.IcosahedronGeometry(0.075, 1), 0xffffff, 0, 0.67, 0);
      break;
    }
    case 'cowboy': {
      mb.add(new THREE.CylinderGeometry(0.44, 0.42, 0.035, 20), 0x8b5a2b, 0, 0.45, 0);
      mb.add(new THREE.TorusGeometry(0.41, 0.025, 6, 22), 0x7a4e24, 0, 0.47, 0, Math.PI / 2, 0, 0);
      mb.add(new THREE.CylinderGeometry(0.19, 0.24, 0.24, 14), 0x8b5a2b, 0, 0.58, 0);
      mb.add(new THREE.CylinderGeometry(0.242, 0.242, 0.05, 14), 0x3a2414, 0, 0.5, 0);
      break;
    }
    case 'crown': {
      mb.add(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 16, 1, true), 0xffd23f, 0, 0.49, 0);
      mb.add(new THREE.CylinderGeometry(0.23, 0.23, 0.11, 16, 1, true), 0xe0a800, 0, 0.49, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        mb.add(new THREE.ConeGeometry(0.055, 0.15, 6), 0xffd23f, Math.cos(a) * 0.235, 0.61, Math.sin(a) * 0.235);
        mb.add(new THREE.SphereGeometry(0.028, 8, 6), [0xff4d6d, 0x4cc9f0, 0x3ddc97][i % 3], Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25);
      }
      break;
    }
    case 'tophat': {
      mb.add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18), 0x161616, 0, 0.45, 0);
      mb.add(new THREE.CylinderGeometry(0.2, 0.21, 0.36, 16), 0x1d1d1d, 0, 0.64, 0);
      mb.add(new THREE.CylinderGeometry(0.212, 0.212, 0.06, 16), 0xc0392b, 0, 0.5, 0);
      break;
    }
    case 'party': {
      mb.add(new THREE.ConeGeometry(0.16, 0.42, 16), 0xff4d6d, 0, 0.62, 0, 0, 0, -0.12);
      for (let i = 0; i < 3; i++) mb.add(new THREE.TorusGeometry(0.11 - i * 0.035, 0.012, 5, 14), 0xffd23f, -0.01 - i * 0.012, 0.52 + i * 0.1, 0, Math.PI / 2, 0, 0);
      mb.add(new THREE.IcosahedronGeometry(0.055, 1), 0x4cc9f0, -0.05, 0.84, 0);
      break;
    }
    case 'botnone': break; // bots have an antenna instead of hair
    default: // no hat: a little hair tuft
      mb.add(rb(0.44, 0.1, 0.38, 0.05), 0x4a2f22, 0, 0.42, 0.02);
      mb.add(rb(0.16, 0.08, 0.14, 0.04), 0x4a2f22, 0.06, 0.48, -0.08, 0, 0.3, 0.3);
  }
  return mb.build();
}

// ---------------------------------------------------------------------------
export class Avatar {
  constructor({ name, avatar, bot, isMe }) {
    this.root = new THREE.Group();
    this.bot = bot;
    avatar = avatar || {};
    const shirtC = new THREE.Color(avatar.color || '#cccccc').getHex();
    const pantsC = bot ? 0x3a4a5a : shadeHex(shirtC, 0.42);
    const skinC = bot ? BOT_SKIN : SKIN;
    const trimC = bot ? 0x4cc9f0 : 0xffffff;
    this.baseShirt = new THREE.Color(shirtC);
    // one material for the body (IT glow tints it) and one for the limbs
    this.bodyMat = toon();
    this.limbMat = toon();
    this.mats = { shirt: this.bodyMat };
    const own = [];
    const mesh = (geo, mat = this.limbMat) => { own.push(geo); const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

    // hierarchy: root(feet) -> hips -> legs, torso -> arms (shoulder -> elbow -> hand), head
    this.hips = new THREE.Group(); this.hips.position.y = 0.82; this.root.add(this.hips);
    const legGeo = (() => {
      const mb = new MB();
      mb.add(rb(0.21, 0.5, 0.23, 0.08), pantsC, 0, -0.24, 0);                 // thigh + knee
      mb.add(rb(0.18, 0.28, 0.2, 0.07), shadeHex(pantsC, 0.85), 0, -0.56, 0); // shin
      mb.add(rb(0.23, 0.11, 0.33, 0.05), bot ? 0x22303d : 0x2b2b38, 0, -0.73, -0.05); // sneaker
      mb.add(rb(0.24, 0.045, 0.34, 0.02), 0xf2f2f2, 0, -0.79, -0.05);          // sole
      mb.add(rb(0.12, 0.02, 0.06, 0.008), trimC, 0, -0.68, -0.19);             // lace patch
      return mb.build();
    })();
    this.legL = new THREE.Group(); this.legL.position.x = -0.13;
    this.legR = new THREE.Group(); this.legR.position.x = 0.13;
    for (const l of [this.legL, this.legR]) { l.add(mesh(legGeo)); this.hips.add(l); }

    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const torsoGeo = (() => {
      const mb = new MB();
      mb.add(rb(0.5, 0.2, 0.32, 0.08), pantsC, 0, 0.02, 0);                    // shorts / hips
      mb.add(rb(0.52, 0.05, 0.33, 0.02), bot ? 0x22303d : 0x3a2a20, 0, 0.12, 0); // belt
      mb.add(rb(0.09, 0.06, 0.02, 0.01), 0xffd23f, 0, 0.12, -0.17);            // buckle
      mb.add(rb(0.58, 0.5, 0.36, 0.13), shirtC, 0, 0.38, 0);                   // chest
      mb.add(new THREE.TorusGeometry(0.12, 0.035, 6, 14), shadeHex(shirtC, 0.75), 0, 0.62, 0, Math.PI / 2, 0, 0); // collar
      mb.add(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 10), skinC, 0, 0.66, 0);  // neck
      // chest emblem: a little star badge
      mb.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 5), trimC, 0.12, 0.47, -0.18, Math.PI / 2, 0, 0);
      if (bot) mb.add(rb(0.22, 0.12, 0.03, 0.02), 0x22303d, -0.08, 0.32, -0.18);    // bot panel
      return mb.build();
    })();
    this.torso.add(mesh(torsoGeo, this.bodyMat));

    // arms: shoulder group -> upper arm, elbow group -> forearm + hand
    const upperGeo = (() => { const mb = new MB(); mb.add(rb(0.17, 0.3, 0.18, 0.07), shirtC, 0, -0.13, 0); return mb.build(); })();
    const foreGeo = (() => {
      const mb = new MB();
      mb.add(rb(0.14, 0.24, 0.15, 0.06), skinC, 0, -0.12, 0);                 // forearm
      mb.add(rb(0.16, 0.15, 0.15, 0.065), skinC, 0, -0.29, 0);                // mitten hand
      mb.add(rb(0.05, 0.08, 0.05, 0.022), skinC, 0.0, -0.27, -0.08, -0.4, 0, 0); // thumb
      mb.add(new THREE.TorusGeometry(0.075, 0.022, 6, 12), shadeHex(shirtC, 0.8), 0, -0.01, 0, Math.PI / 2, 0, 0); // cuff
      return mb.build();
    })();
    const mkArm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.37 * side, 0.55, 0);
      sh.add(mesh(upperGeo));
      const el = new THREE.Group(); el.position.y = -0.27; sh.add(el);
      el.add(mesh(foreGeo));
      const hand = new THREE.Group(); hand.position.set(0, -0.29, 0); el.add(hand);
      this.torso.add(sh);
      return { sh, el, hand };
    };
    const L = mkArm(-1), R = mkArm(1);
    this.armL = L.sh; this.elbowL = L.el; this.handL = L.hand;
    this.armR = R.sh; this.elbowR = R.el; this.handR = R.hand;

    // head: rounded block + face plane + hat
    this.head = new THREE.Group(); this.head.position.y = 0.69; this.torso.add(this.head);
    const headGeo = (() => {
      const mb = new MB();
      mb.add(rb(0.5, 0.47, 0.45, 0.15, 3), skinC, 0, 0.23, 0);
      mb.add(new THREE.SphereGeometry(0.058, 8, 6), skinC, -0.255, 0.22, 0, 0, 0, 0, 0.5, 1, 1); // ears
      mb.add(new THREE.SphereGeometry(0.058, 8, 6), skinC, 0.255, 0.22, 0, 0, 0, 0, 0.5, 1, 1);
      if (bot) {
        mb.add(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), 0x2b2b38, 0, 0.53, 0);
        mb.add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), 0x2b2b38, -0.245, 0.22, 0, 0, 0, Math.PI / 2);
        mb.add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), 0x2b2b38, 0.245, 0.22, 0, 0, 0, Math.PI / 2);
      }
      return mb.build();
    })();
    this.head.add(mesh(headGeo, this.bodyMat));
    if (!_faceGeo) _faceGeo = new THREE.PlaneGeometry(0.44, 0.44).rotateY(Math.PI).translate(0, 0.22, -0.227);
    const face = new THREE.Mesh(_faceGeo, new THREE.MeshBasicMaterial({ map: faceTex(bot ? 'bot' : avatar.face || 'happy'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    face.renderOrder = 2;
    this.head.add(face);
    if (bot) {
      // glowing antenna tip marks bots clearly, even from far away
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4cf0ff }));
      tip.position.y = 0.66;
      this.head.add(tip);
      this.antenna = tip;
    }
    const hatGeo = hatGeometry(bot && (avatar.hat || 'none') === 'none' ? 'botnone' : avatar.hat || 'none', shirtC);
    if (hatGeo && hatGeo.attributes.position) { const hm = mesh(hatGeo, this.limbMat); hm.position.y = 0.025; hm.scale.setScalar(1.07); this.head.add(hm); }
    this.ownGeos = own;

    // name tag
    const label = labelTexture(bot ? `🤖 ${name}` : name, { color: bot ? '#7fdcff' : '#ffffff', bg: bot ? 'rgba(10,40,60,0.75)' : 'rgba(15,6,40,0.72)' });
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.tex, depthWrite: false, transparent: true }));
    this.tag.scale.set(0.42 * label.aspect, 0.42, 1);
    this.tag.position.y = 2.35;
    this.tag.renderOrder = 5;
    this.root.add(this.tag);
    this.hiddenTag = !!isMe;
    if (isMe) this.tag.visible = false;

    this.statusSprite = null;
    this.ring = null;
    this.held = null; this.heldType = null; this.heldSkin = null;
    this.carry = null; // 'potato' | 'chicken' | null
    this.phase = 0;
    this.punchT = 0; this.punchSide = 1;
    this.shootT = 0;
    this.reloading = false;
    this.healing = false;
    this.deadT = -1;
    this.alive = true;
    this.airT = 0;
    this.seed = Math.random() * 10;
  }

  // kept for callers that add hats later (menu showcase)
  addHat(hat, color) {
    const geo = hatGeometry(hat, new THREE.Color(color).getHex());
    if (geo && geo.attributes.position) this.head.add(new THREE.Mesh(geo, this.limbMat));
  }

  setHeld(type, skin) {
    if (type === this.heldType && skin === this.heldSkin) return;
    if (this.held) { this.handR.remove(this.held); this.held = null; }
    this.heldType = type; this.heldSkin = skin;
    if (type) {
      this.held = weaponModel(type, skin);
      this.held.scale.setScalar(HELD_SCALE);
      this.held.rotation.x = -Math.PI / 2; // hand points down the arm; gun forward when the arm is raised
      this.held.position.set(0, 0, -0.02);
      this.held.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.handR.add(this.held);
    }
  }

  setCarry(kind) {
    if (kind === this.carry) return;
    if (this.carryObj) { this.root.remove(this.carryObj); this.carryObj = null; }
    this.carry = kind;
    if (kind === 'potato') { this.carryObj = potatoModel(); this.carryObj.scale.setScalar(0.9); }
    else if (kind === 'chicken') { this.carryObj = chickenModel(); this.carryObj.scale.setScalar(0.9); }
    if (this.carryObj) this.root.add(this.carryObj);
  }

  setStatus(kind) {
    if (this.statusKind === kind) return;
    this.statusKind = kind;
    if (this.statusSprite) { this.root.remove(this.statusSprite); this.statusSprite.material.map?.dispose(); this.statusSprite = null; }
    if (this.ring) { this.root.remove(this.ring); this.ring.geometry.dispose(); this.ring = null; }
    this.bodyMat.emissive.setHex(0x000000);
    if (kind === 'it') {
      const l = labelTexture('IT!', { color: '#ffffff', bg: 'rgba(230,30,50,0.95)' });
      this.statusSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: l.tex, depthTest: false, transparent: true }));
      this.statusSprite.scale.set(0.55 * l.aspect, 0.55, 1);
      this.statusSprite.position.y = 2.9;
      this.statusSprite.renderOrder = 10;
      this.root.add(this.statusSprite);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06;
      this.root.add(this.ring);
      this.bodyMat.emissive.setHex(0x661010);
    }
  }

  punch() { this.punchT = 0.25; this.punchSide = -this.punchSide; }
  shoot() { this.shootT = 0.12; }

  die() { if (this.deadT < 0) this.deadT = 0; this.alive = false; }
  revive() {
    this.deadT = -1; this.alive = true; this.root.visible = true;
    this.root.rotation.x = 0; this.root.rotation.z = 0; this.root.scale.setScalar(1);
    this.hips.rotation.set(0, 0, 0); this.tag.visible = !this.hiddenTag;
  }

  // state: {x,y,z,yaw,pitch, speed, grounded, sprint}
  update(st, dt, t) {
    const r = this.root;
    r.position.set(st.x, st.y, st.z);
    r.rotation.y = st.yaw;
    if (this.deadT >= 0) {
      // knocked over backwards, a little bounce, then a cartoon "poof"
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.45);
      const ease = 1 - Math.pow(1 - k, 3);
      this.hips.rotation.x = ease * Math.PI / 2;
      this.hips.position.y = 0.82 - ease * 0.62 + Math.sin(Math.min(1, this.deadT / 0.7) * Math.PI) * 0.12;
      this.armL.rotation.set(-2.6 * ease, 0, 0.5 * ease);
      this.armR.rotation.set(-2.6 * ease, 0, -0.5 * ease);
      this.legL.rotation.x = -0.4 * ease; this.legR.rotation.x = -0.1 * ease;
      this.tag.visible = false;
      if (this.deadT > 2.1) r.scale.setScalar(Math.max(0.01, 1 - (this.deadT - 2.1) / 0.35));
      if (this.deadT > 2.45) r.visible = false;
      return;
    }
    const speed = st.speed || 0;
    const moving = speed > 0.4 && st.grounded !== false;
    this.airT = st.grounded === false ? this.airT + dt : 0;
    this.phase += dt * (moving ? 3 + speed * 1.15 : 0);
    const amp = moving ? Math.min(1, speed / 6) * (st.sprint ? 1 : 0.7) : 0;
    const swing = Math.sin(this.phase) * amp;
    const bob = Math.abs(Math.sin(this.phase)) * amp;
    const breathe = Math.sin(t * 2.2 + this.seed) * 0.012;

    // legs: swing when running, tuck in the air
    if (this.airT > 0.08) { this.legL.rotation.x = -0.75; this.legR.rotation.x = 0.35; }
    else { this.legL.rotation.x = swing * 0.95; this.legR.rotation.x = -swing * 0.95; }
    this.hips.position.y = 0.82 + bob * 0.07;
    this.hips.rotation.set(0, Math.sin(this.phase) * amp * 0.12, 0);
    this.torso.rotation.set((st.sprint && moving ? -0.18 : -0.03 * amp) + breathe, -Math.sin(this.phase) * amp * 0.18, 0);
    this.torso.scale.y = 1 + breathe * 0.6;
    this.head.rotation.set(Math.max(-0.75, Math.min(0.75, st.pitch * 0.7)), Math.sin(this.phase) * amp * 0.1, Math.sin(t * 1.3 + this.seed) * 0.03 * (1 - amp));

    // arms (rotation.x: positive raises the arm forward)
    let aL = -swing * 0.9, aR = swing * 0.9, zL = 0.12, zR = -0.12, eL = -0.25 - amp * 0.35, eR = -0.25 - amp * 0.35;
    if (this.airT > 0.08) { aL = 2.2; aR = 2.2; zL = 0.5; zR = -0.5; eL = -0.2; eR = -0.2; }
    if (this.heldType) {
      const p = st.pitch * 0.9;
      aR = Math.PI / 2 + p; zR = 0.08; eR = 0;
      aL = Math.PI / 2.15 + p; zL = 0.62; eL = -0.55;
      if (this.shootT > 0) { aR += 0.22; eR -= 0.15; }
      if (this.reloading) { aR = 1.0; aL = 1.2 + Math.sin(t * 9) * 0.15; eL = -1.2; }
    }
    if (this.carry) { aL = 2.7; aR = 2.7; zL = 0.32; zR = -0.32; eL = -0.5; eR = -0.5; }
    if (this.healing) { aL = 1.4; aR = 1.4; zL = 0.45; zR = -0.45; eL = -1.0; eR = -1.0; }
    if (this.punchT > 0) {
      const k = Math.sin((1 - this.punchT / 0.25) * Math.PI);
      const hit = Math.PI / 2 + st.pitch;
      if (this.punchSide > 0) { aR = hit * k + aR * (1 - k); eR *= 1 - k; } else { aL = hit * k + aL * (1 - k); eL *= 1 - k; }
      this.torso.rotation.y += this.punchSide * k * 0.35;
    }
    this.armL.rotation.set(aL, 0, zL); this.elbowL.rotation.x = eL;
    this.armR.rotation.set(aR, 0, zR); this.elbowR.rotation.x = eR;
    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);

    if (this.carryObj) {
      this.carryObj.position.set(0, 2.12 + Math.sin(t * 6) * 0.05, -0.1);
      this.carryObj.rotation.y = Math.sin(t * 3) * 0.3;
      if (this.carry === 'potato') this.carryObj.scale.setScalar(0.9 + Math.sin(t * 14) * 0.04);
    }
    if (this.antenna) this.antenna.material.color.setHSL(0.52, 1, 0.55 + Math.sin(t * 4 + this.seed) * 0.15);
    if (this.statusSprite) this.statusSprite.position.y = 2.9 + Math.sin(t * 5) * 0.06;
    if (this.ring) this.ring.rotation.z += dt * 2;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isSprite && o.material.map) o.material.map.dispose();
    });
    for (const g of this.ownGeos || []) g.dispose();
    this.bodyMat.dispose();
    this.limbMat.dispose();
  }
}
