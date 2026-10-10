// Third-person character used for other players and bots.
import * as THREE from 'three';
import { faceTexture, labelTexture } from './textures.js';
import { weaponModel, potatoModel, chickenModel } from './models.js';

const SKIN = 0xffcc99;
const geoCache = {};
const G = (k, fn) => geoCache[k] || (geoCache[k] = fn());

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}

export class Avatar {
  constructor({ name, avatar, bot, isMe }) {
    this.root = new THREE.Group();
    this.bot = bot;
    const color = new THREE.Color(avatar.color || '#cccccc');
    const shirt = new THREE.MeshLambertMaterial({ color });
    const pants = new THREE.MeshLambertMaterial({ color: bot ? 0x3a4a5a : shade(color, 0.45) });
    const skin = new THREE.MeshLambertMaterial({ color: bot ? 0xb0bec5 : SKIN });
    const shoe = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    this.mats = { shirt, pants, skin, shoe };
    this.baseShirt = color.clone();

    // body hierarchy: root(feet) -> hips -> torso, legs; torso -> shoulders/arms, head
    this.hips = new THREE.Group(); this.hips.position.y = 0.82; this.root.add(this.hips);
    const legGeo = G('leg', () => { const g = new THREE.BoxGeometry(0.22, 0.8, 0.24); g.translate(0, -0.4, 0); return g; });
    const shoeGeo = G('shoe', () => { const g = new THREE.BoxGeometry(0.24, 0.12, 0.32); g.translate(0, -0.76, -0.04); return g; });
    this.legL = new THREE.Group(); this.legL.position.x = -0.13;
    this.legR = new THREE.Group(); this.legR.position.x = 0.13;
    for (const l of [this.legL, this.legR]) { l.add(new THREE.Mesh(legGeo, pants)); l.add(new THREE.Mesh(shoeGeo, shoe)); this.hips.add(l); }

    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const torsoMesh = new THREE.Mesh(G('torso', () => { const g = new THREE.BoxGeometry(0.6, 0.62, 0.34); g.translate(0, 0.31, 0); return g; }), shirt);
    this.torso.add(torsoMesh);
    const armGeo = G('arm', () => { const g = new THREE.BoxGeometry(0.17, 0.58, 0.18); g.translate(0, -0.27, 0); return g; });
    const handGeo = G('hand', () => { const g = new THREE.BoxGeometry(0.15, 0.15, 0.15); g.translate(0, -0.6, 0); return g; });
    this.armL = new THREE.Group(); this.armL.position.set(-0.39, 0.56, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.39, 0.56, 0);
    for (const a of [this.armL, this.armR]) { a.add(new THREE.Mesh(armGeo, shirt)); a.add(new THREE.Mesh(handGeo, skin)); this.torso.add(a); }
    this.handR = new THREE.Group(); this.handR.position.set(0, -0.6, 0); this.armR.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(0, -0.6, 0); this.armL.add(this.handL);

    this.head = new THREE.Group(); this.head.position.y = 0.64; this.torso.add(this.head);
    const headMats = [skin, skin, skin, skin, skin, new THREE.MeshLambertMaterial({ map: faceTexture(bot ? 'bot' : avatar.face || 'happy') })];
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z ; our front is -Z
    const headMesh = new THREE.Mesh(G('head', () => { const g = new THREE.BoxGeometry(0.44, 0.44, 0.44); g.translate(0, 0.22, 0); return g; }), headMats);
    this.head.add(headMesh);
    if (bot) {
      const ant = new THREE.Mesh(G('ant', () => { const g = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 5); g.translate(0, 0.56, 0); return g; }), shoe);
      const ball = new THREE.Mesh(G('antball', () => { const g = new THREE.SphereGeometry(0.06, 8, 6); g.translate(0, 0.7, 0); return g; }), new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
      this.head.add(ant, ball);
    }
    this.addHat(avatar.hat, color);

    // name tag
    const label = labelTexture(bot ? `🤖 ${name}` : name, { color: bot ? '#7fdcff' : '#ffffff', bg: bot ? 'rgba(10,40,60,0.75)' : 'rgba(15,6,40,0.72)' });
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.tex, depthWrite: false, transparent: true }));
    this.tag.scale.set(0.42 * label.aspect, 0.42, 1);
    this.tag.position.y = 2.3;
    this.tag.renderOrder = 5;
    this.root.add(this.tag);
    if (isMe) this.tag.visible = false;

    // status icon (IT / potato) above name
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
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  addHat(hat, color) {
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    let g = null;
    switch (hat) {
      case 'cap': {
        g = new THREE.Group();
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 10), m(color.clone().offsetHSL(0.5, 0, 0)));
        crown.position.y = 0.5;
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.24), crown.material);
        brim.position.set(0, 0.45, -0.3);
        g.add(crown, brim);
        break;
      }
      case 'beanie': {
        g = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0xe63946));
        g.position.y = 0.42;
        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), m(0xffffff));
        pom.position.y = 0.25; g.add(pom);
        break;
      }
      case 'cowboy': {
        g = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), m(0x8b5a2b));
        brim.position.y = 0.46;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 10), m(0x8b5a2b));
        top.position.y = 0.58;
        g.add(brim, top);
        break;
      }
      case 'crown': {
        g = new THREE.Group();
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12, 1, true), new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 80, side: THREE.DoubleSide }));
        band.position.y = 0.5;
        g.add(band);
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), band.material);
          const a = (i / 5) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22);
          g.add(sp);
        }
        break;
      }
      case 'tophat': {
        g = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 14), m(0x111111));
        brim.position.y = 0.45;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12), m(0x111111));
        top.position.y = 0.64;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 12), m(0xc0392b));
        band.position.y = 0.5;
        g.add(brim, top, band);
        break;
      }
      case 'party': {
        g = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 10), m(0xff4d6d));
        g.position.y = 0.64;
        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), m(0xffd23f));
        pom.position.y = 0.22; g.add(pom);
        break;
      }
      default:
    }
    if (g) this.head.add(g);
  }

  setHeld(type, skin) {
    if (type === this.heldType && skin === this.heldSkin) return;
    if (this.held) { this.handR.remove(this.held); this.held = null; }
    this.heldType = type; this.heldSkin = skin;
    if (type) {
      this.held = weaponModel(type, skin);
      this.held.rotation.x = -Math.PI / 2; // hand points down the arm; gun forward when arm raised
      this.held.position.set(0, 0, 0);
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
    if (this.statusSprite) { this.root.remove(this.statusSprite); this.statusSprite = null; }
    if (this.ring) { this.root.remove(this.ring); this.ring = null; }
    this.mats.shirt.emissive?.setHex(0x000000);
    if (kind === 'it') {
      const l = labelTexture('IT!', { color: '#ffffff', bg: 'rgba(230,30,50,0.95)' });
      this.statusSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: l.tex, depthTest: false, transparent: true }));
      this.statusSprite.scale.set(0.55 * l.aspect, 0.55, 1);
      this.statusSprite.position.y = 2.85;
      this.statusSprite.renderOrder = 10;
      this.root.add(this.statusSprite);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06;
      this.root.add(this.ring);
      this.mats.shirt.emissive = new THREE.Color(0x550000);
    }
  }

  punch() { this.punchT = 0.25; this.punchSide = -this.punchSide; }
  shoot() { this.shootT = 0.12; }

  die() { if (this.deadT < 0) this.deadT = 0; this.alive = false; }
  revive() { this.deadT = -1; this.alive = true; this.root.visible = true; this.root.rotation.x = 0; this.root.rotation.z = 0; }

  // state: {x,y,z,yaw,pitch, speed, grounded, sprint, dt}
  update(st, dt, t) {
    const r = this.root;
    r.position.set(st.x, st.y, st.z);
    r.rotation.y = st.yaw;
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.5);
      this.hips.rotation.x = -k * Math.PI / 2;
      this.hips.position.y = 0.82 - k * 0.6;
      this.tag.visible = false;
      if (this.deadT > 2.5) r.visible = false;
      return;
    }
    this.hips.rotation.x = 0;
    this.hips.position.y = 0.82;
    const speed = st.speed;
    const moving = speed > 0.4;
    this.phase += dt * (moving ? 2.2 + speed * 1.1 : 0);
    const amp = moving ? Math.min(1, speed / 6) * (st.sprint ? 0.9 : 0.6) : 0;
    let legSwing = Math.sin(this.phase) * amp;
    if (!st.grounded) { this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.3; }
    else { this.legL.rotation.x = legSwing; this.legR.rotation.x = -legSwing; }
    this.hips.position.y = 0.82 + Math.abs(Math.sin(this.phase)) * amp * 0.06;
    this.torso.rotation.x = st.sprint && moving ? -0.12 : 0;
    // head pitch
    this.head.rotation.x = Math.max(-0.8, Math.min(0.8, st.pitch * 0.7));
    // arms
    let aL = -legSwing * 0.8, aR = legSwing * 0.8, zL = 0.08, zR = -0.08;
    if (this.heldType) {
      aR = Math.PI / 2 + st.pitch * 0.9; zR = 0.0;
      aL = Math.PI / 2.3 + st.pitch * 0.9; zL = 0.45;
      if (this.shootT > 0) aR += 0.18;
      if (this.reloading) { aR = 0.9; aL = 1.1; }
    }
    if (this.carry) { aL = 2.6; aR = 2.6; zL = 0.25; zR = -0.25; }
    if (this.healing) { aL = 1.3; aR = 1.3; zL = 0.4; zR = -0.4; }
    if (this.punchT > 0) {
      const k = Math.sin((1 - this.punchT / 0.25) * Math.PI);
      if (this.punchSide > 0) aR = (Math.PI / 2 + st.pitch) * k + aR * (1 - k); else aL = (Math.PI / 2 + st.pitch) * k + aL * (1 - k);
    }
    this.armL.rotation.x = aL; this.armL.rotation.z = zL;
    this.armR.rotation.x = aR; this.armR.rotation.z = zR;
    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    if (this.carryObj) {
      this.carryObj.position.set(0, 2.05 + Math.sin(t * 6) * 0.05, -0.1);
      this.carryObj.rotation.y = Math.sin(t * 3) * 0.3;
      if (this.carry === 'potato') this.carryObj.scale.setScalar(0.9 + Math.sin(t * 14) * 0.04);
    }
    if (this.statusSprite) this.statusSprite.position.y = 2.85 + Math.sin(t * 5) * 0.06;
    if (this.ring) this.ring.rotation.z += dt * 2;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isSprite && o.material.map) o.material.map.dispose();
    });
  }
}
