// First-person arms and held items, rendered in their own scene on top of the world.
import * as THREE from 'three';
import { weaponModel, potatoModel, chickenModel, itemModel, MUZZLE } from './models.js';

const SKIN = 0xffcc99;
const VM_SCALE = 0.62; // first-person weapon scale

export class ViewModel {
  constructor(sleeveColor) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666688, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    const sleeve = new THREE.MeshLambertMaterial({ color: sleeveColor || '#4cc9f0' });
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    this.sleeveMat = sleeve;
    // An arm is a group whose origin is the fist; the forearm/sleeve runs back
    // along +Z and is tilted (via the group's rotation) down out of the screen.
    const mkArm = () => {
      const g = new THREE.Group();
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.066, 0.08), skin);
      const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.026), new THREE.MeshLambertMaterial({ color: 0xf0b98a }));
      knuckles.position.set(0, 0.018, -0.04);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.05), skin);
      thumb.position.set(-0.03, -0.012, -0.02);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.42), sleeve);
      arm.position.set(0, 0, 0.27);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.092, 0.04), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      cuff.position.set(0, 0, 0.065);
      g.add(hand, knuckles, thumb, arm, cuff);
      return g;
    };
    this.armR = mkArm();
    this.armL = mkArm();
    this.root.add(this.armR, this.armL);
    this.itemAnchor = new THREE.Group();
    this.root.add(this.itemAnchor);
    this.item = null;
    this.state = 'fists';
    this.weaponType = null;
    this.skin = null;

    // muzzle flash
    const flashTex = makeFlashTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd27a, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    this.flash.scale.set(0.25, 0.25, 1);
    this.flash.visible = false;
    this.itemAnchor.add(this.flash);

    this.t = 0;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
    this.recoil = 0;
    this.punchT = 0; this.punchSide = 1;
    this.switchT = 0;
    this.reloadT = 0; this.reloadDur = 1;
    this.useT = 0;
    this.landT = 0;
    this.ads = 0;
    this.healT = 0;
    this.visible = true;
  }

  setSleeve(color) { this.sleeveMat.color.set(color); }

  setResolution(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // kind: 'fists' | 'weapon' | 'potato' | 'chicken'
  setHeld(kind, weaponType = null, skin = null) {
    if (kind === this.state && weaponType === this.weaponType && skin === this.skin) return;
    if (this.item) { this.itemAnchor.remove(this.item); this.item = null; }
    this.state = kind; this.weaponType = weaponType; this.skin = skin;
    if (kind === 'weapon' && weaponType) {
      this.item = weaponModel(weaponType, skin);
      this.item.scale.setScalar(VM_SCALE);
      this.flash.position.set(0, 0.07 * VM_SCALE, (MUZZLE[weaponType] || -0.4) * VM_SCALE);
    } else if (kind === 'potato') {
      this.item = potatoModel();
      this.item.scale.setScalar(0.3);
      this.item.rotation.y = Math.PI; // googly eyes look back at you
    } else if (kind === 'chicken') {
      this.item = chickenModel();
      this.item.scale.setScalar(0.42);
      this.item.rotation.y = Math.PI * 0.6;
    }
    if (this.item) this.itemAnchor.add(this.item);
    this.switchT = 0.3;
    this.reloadT = 0;
  }

  showHealItem(type) {
    if (this.healItem) { this.root.remove(this.healItem); this.healItem = null; }
    if (type) {
      this.healItem = itemModel('heal', type);
      this.healItem.scale.setScalar(0.5);
      this.root.add(this.healItem);
    }
  }

  punch() { this.punchT = 0.28; this.punchSide = -this.punchSide; }
  use() { this.useT = 0.25; }
  shoot(kick = 0.03) {
    this.recoil = Math.min(0.2, this.recoil + kick * 2.2);
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flashT = 0.05;
  }
  reload(ms) { this.reloadT = ms / 1000; this.reloadDur = ms / 1000; }
  cancelReload() { this.reloadT = 0; }
  land(impact) { this.landT = Math.min(0.25, impact * 0.012); }
  mouse(dx, dy) { this.swayX += dx * 0.00025; this.swayY += dy * 0.00025; }

  update(dt, { speed = 0, grounded = true, sprint = false, ads = false }) {
    this.t += dt;
    const moving = speed > 0.5 && grounded;
    this.bobPhase += dt * (moving ? (sprint ? 12 : 8.5) : 1.4);
    const bobAmp = moving ? (sprint ? 0.028 : 0.016) : 0.004;
    const bx = Math.sin(this.bobPhase) * bobAmp;
    const by = -Math.abs(Math.cos(this.bobPhase)) * bobAmp;
    this.swayX *= Math.pow(0.0015, dt); this.swayY *= Math.pow(0.0015, dt);
    this.swayX = Math.max(-0.06, Math.min(0.06, this.swayX));
    this.swayY = Math.max(-0.06, Math.min(0.06, this.swayY));
    this.recoil *= Math.pow(0.0004, dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    this.useT = Math.max(0, this.useT - dt);
    this.landT = Math.max(0, this.landT - dt * 0.8);
    if (this.reloadT > 0) this.reloadT = Math.max(0, this.reloadT - dt);
    if (this.flashT !== undefined) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    const adsTarget = ads && this.state === 'weapon' && this.reloadT <= 0 ? 1 : 0;
    this.ads += (adsTarget - this.ads) * Math.min(1, dt * 14);

    const sw = this.switchT > 0 ? Math.sin((this.switchT / 0.3) * Math.PI) * 0.25 : 0;
    const baseX = -this.swayX - bx * (1 - this.ads * 0.85);
    const baseY = this.swayY + by * (1 - this.ads * 0.85) - sw - this.landT;
    this.root.position.set(0, 0, 0);

    if (this.state === 'weapon') {
      const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI) : 0;
      const hipX = 0.15, hipY = -0.15, hipZ = -0.34;
      const adsX = 0, adsY = -0.078, adsZ = -0.26;
      const px = hipX + (adsX - hipX) * this.ads + baseX;
      const py = hipY + (adsY - hipY) * this.ads + baseY - rl * 0.12 + (sprint && moving ? -0.05 : 0);
      const pz = hipZ + (adsZ - hipZ) * this.ads + this.recoil * 0.6;
      this.itemAnchor.position.set(px, py, pz);
      this.itemAnchor.rotation.set(this.recoil * 1.6 + rl * 0.6, (sprint && moving ? 0.5 : 0) * (1 - this.ads), rl * 0.5 + (sprint && moving ? 0.3 : 0));
      // right hand on the grip
      this.armR.position.set(px + 0.0, py - 0.045, pz + 0.03);
      this.armR.rotation.set(0.75, 0.3, 0);
      // left hand on the front of the gun
      const long = ['rifle', 'shotgun', 'sniper', 'smg', 'blaster'].includes(this.weaponType);
      const lz = long ? -0.15 : -0.01;
      this.armL.position.set(px - 0.02 + (rl * -0.1), py - 0.03 - rl * 0.1, pz + lz + rl * 0.15);
      this.armL.rotation.set(0.55, -0.7, 0);
      this.armL.visible = true;
    } else if (this.state === 'potato' || this.state === 'chicken') {
      const wob = this.state === 'potato' ? Math.sin(this.t * 18) * 0.01 : 0;
      const pass = this.useT > 0 ? Math.sin((this.useT / 0.25) * Math.PI) * 0.25 : 0;
      this.itemAnchor.position.set(0.12 + baseX, -0.27 + baseY + wob, -0.5 - pass);
      this.itemAnchor.rotation.set(0.15, Math.sin(this.t * 1.5) * 0.12, 0);
      this.armR.position.set(0.24 + baseX, -0.25 + baseY, -0.48 - pass);
      this.armR.rotation.set(0.4, 0.35, -0.2);
      this.armL.position.set(0.0 + baseX, -0.25 + baseY, -0.5 - pass);
      this.armL.rotation.set(0.4, -0.35, 0.2);
      this.armL.visible = true;
    } else {
      // fists
      const pk = this.punchT > 0 ? Math.sin((1 - this.punchT / 0.28) * Math.PI) : 0;
      const uk = this.useT > 0 ? Math.sin((1 - this.useT / 0.25) * Math.PI) : 0;
      const breathe = Math.sin(this.t * 2) * 0.006;
      const rPunch = this.punchSide > 0 ? pk : 0, lPunch = this.punchSide < 0 ? pk : 0;
      this.armR.position.set(0.2 - rPunch * 0.14 + baseX, -0.2 + breathe + baseY + rPunch * 0.09 + uk * 0.05, -0.45 - rPunch * 0.3 - uk * 0.18);
      this.armR.rotation.set(0.38 - rPunch * 0.25, 0.32 - rPunch * 0.25, -0.12);
      this.armL.position.set(-0.2 + lPunch * 0.14 + baseX, -0.2 - breathe + baseY + lPunch * 0.09, -0.45 - lPunch * 0.3);
      this.armL.rotation.set(0.38 - lPunch * 0.25, -0.32 + lPunch * 0.25, 0.12);
      this.armL.scale.x = -1;
      this.armL.visible = true;
      this.itemAnchor.position.set(0, -10, 0);
    }
    if (this.healItem) {
      this.healT += dt;
      this.healItem.position.set(-0.12 + baseX, -0.22 + baseY + Math.sin(this.healT * 8) * 0.01, -0.42);
      this.healItem.rotation.set(0.4, this.healT, 0);
      this.armL.position.set(-0.12 + baseX, -0.27 + baseY, -0.42);
    }
    if (this.item && this.state === 'potato' && this.item.userData.spark) {
      const s = this.item.userData.spark;
      s.scale.setScalar(0.7 + Math.random() * 0.8);
    }
    this.root.visible = this.visible;
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,200,80,0.9)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 14 : 32;
    x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
