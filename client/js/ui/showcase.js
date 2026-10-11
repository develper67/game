// 3D lobby stage: your character (and your party) on glowing podiums.
// Small, self-contained renderer: ~40 fps cap, pauses when hidden, disposed on destroy.
import * as THREE from 'three';
import { Avatar } from '../game/avatar.js';
import { resolvedQuality } from '../settings.js';

const PODIUM_TOP = 0.2;
const SPACING = 1.45;
const CONFETTI = [0xff4d6d, 0xffd23f, 0x4cc9f0, 0x3ddc97, 0xc77dff, 0xff9f1c];

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Showcase {
  constructor(container, { accent = '#ff4d6d', onPoke = null } = {}) {
    this.container = container;
    this.onPoke = onPoke;
    const low = resolvedQuality() === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(low ? 1 : 1.75, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'stage-canvas';
    this.labels = document.createElement('div');
    this.labels.className = 'stage-labels';
    container.append(this.canvas, this.labels);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 80);
    this.accent = new THREE.Color(accent);
    this.accentTarget = this.accent.clone();
    this.scene.add(new THREE.HemisphereLight(0xfff2ff, 0x50308f, 1.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(2.5, 4.5, 6);
    this.rim = new THREE.DirectionalLight(this.accent, 3.2);
    this.rim.position.set(-3.5, 3, -4);
    const rim2 = new THREE.DirectionalLight(0x8fd8ff, 1.3);
    rim2.position.set(4, 2.5, -3);
    this.scene.add(key, this.rim, rim2);

    // shared podium parts
    this.geo = {
      base: new THREE.CylinderGeometry(0.74, 0.82, 0.26, 40),
      cap: new THREE.CylinderGeometry(0.68, 0.74, 0.07, 40),
      ring: new THREE.TorusGeometry(0.76, 0.028, 6, 48),
      glow: new THREE.PlaneGeometry(3.4, 3.4),
      shadow: new THREE.PlaneGeometry(1.2, 1.2),
      bit: new THREE.OctahedronGeometry(0.06, 0),
    };
    this.geo.base.translate(0, 0.07, 0);
    this.geo.cap.translate(0, 0.2 - 0.035, 0);
    this.tex = { glow: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), shadow: radialTexture('rgba(10,0,30,0.55)', 'rgba(10,0,30,0)') };
    this.mat = {
      base: new THREE.MeshLambertMaterial({ color: 0x2a1863 }),
      cap: new THREE.MeshLambertMaterial({ color: 0x4b31a6 }),
      ring: new THREE.MeshBasicMaterial({ color: this.accent }),
      glow: new THREE.MeshBasicMaterial({ map: this.tex.glow, color: this.accent, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
      shadow: new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, depthWrite: false }),
      bit: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    };

    // floating confetti bits (one instanced draw call)
    this.bits = new THREE.InstancedMesh(this.geo.bit, this.mat.bit, 18);
    this.bitData = [];
    const col = new THREE.Color();
    for (let i = 0; i < 18; i++) {
      this.bitData.push({ x: (Math.random() - 0.5) * 7, y: Math.random() * 3.2, z: -1.2 - Math.random() * 2.2, s: 0.6 + Math.random() * 0.9, v: 0.12 + Math.random() * 0.2, r: Math.random() * 6, w: 0.5 + Math.random() });
      this.bits.setColorAt(i, col.setHex(CONFETTI[i % CONFETTI.length]));
    }
    this.scene.add(this.bits);
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), pos: new THREE.Vector3(), scl: new THREE.Vector3() };

    this.cast = [];
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.spin = 0;
    this.spinVel = 0;
    this.drag = null;
    this.t = 0;
    this.visible = true;
    this.running = true;
    this.size = { w: 0, h: 0 };

    this.onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width) return;
      this.pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      this.pointer.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        this.drag.moved = this.drag.moved || Math.abs(dx) > 4;
        this.spinVel = dx * 0.012;
        this.spin += dx * 0.012;
        this.drag.x = e.clientX;
      }
    };
    this.onDown = (e) => { this.drag = { x: e.clientX, moved: false }; };
    this.onUp = () => {
      if (this.drag && !this.drag.moved) this.poke();
      this.drag = null;
    };
    this.onLeave = () => { this.pointer.tx = 0; this.pointer.ty = 0; };
    window.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    document.addEventListener('mouseleave', this.onLeave);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver((en) => { this.visible = en.some((x) => x.isIntersecting); });
    this.io.observe(container);
    this.resize();

    let last = performance.now(), acc = 0;
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / 40 || document.hidden || !this.visible) return;
      this.frame(acc);
      acc = 0;
    };
    this.raf = requestAnimationFrame(loop);
  }

  // entries: [{ key, name, avatar, bot, el }] — el is an optional HTML label shown under the podium.
  // meKey picks the character that reacts when the stage is clicked.
  setCast(entries, meKey) {
    this.meKey = meKey;
    const sig = (e) => `${e.key}|${e.avatar?.color}|${e.avatar?.hat}|${e.avatar?.face}|${e.bot ? 1 : 0}`;
    const keep = new Map(this.cast.map((c) => [c.sig, c]));
    const next = [];
    for (const e of entries.slice(0, 4)) {
      const s = sig(e);
      let c = keep.get(s);
      if (c) keep.delete(s);
      else c = this.makeSlot(e, s);
      if (c.el && c.el !== e.el) c.el.remove();
      c.el = e.el || null;
      if (c.el) this.labels.appendChild(c.el);
      next.push(c);
    }
    for (const c of keep.values()) this.removeSlot(c);
    this.cast = next;
    this.layout();
  }

  makeSlot(e, sig) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(this.geo.base, this.mat.base);
    const cap = new THREE.Mesh(this.geo.cap, this.mat.cap);
    const ring = new THREE.Mesh(this.geo.ring, this.mat.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    const glow = new THREE.Mesh(this.geo.glow, this.mat.glow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    const shadow = new THREE.Mesh(this.geo.shadow, this.mat.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = PODIUM_TOP + 0.006;
    group.add(glow, base, cap, ring, shadow);
    this.scene.add(group);
    let avatar = null;
    try {
      avatar = new Avatar({ name: e.name || '', avatar: e.avatar || {}, bot: !!e.bot });
      // name tags / status icons are drawn as HTML labels instead
      avatar.root.traverse((o) => { if (o.isSprite) o.visible = false; });
      this.scene.add(avatar.root);
    } catch {
      avatar = null;
    }
    return { sig, key: e.key, group, avatar, x: 0, hop: -1, nextHop: 2 + Math.random() * 5, phase: Math.random() * 6, el: null };
  }

  removeSlot(c) {
    this.scene.remove(c.group);
    if (c.avatar) {
      this.scene.remove(c.avatar.root);
      c.avatar.root.traverse((o) => { if (o.isMesh && o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      try { c.avatar.dispose(); } catch { /* ignore */ }
    }
    if (c.el) c.el.remove();
  }

  // Sets slot positions and frames the camera around everyone.
  layout() {
    const n = Math.max(1, this.cast.length);
    this.cast.forEach((c, i) => {
      c.x = (i - (n - 1) / 2) * SPACING;
      c.group.position.x = c.x;
    });
    const { w, h } = this.size;
    if (!w || !h) return;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needH = 2.9, needW = (n - 1) * SPACING + 2.2;
    const d = Math.max(needH / 2 / tanV, needW / 2 / (tanV * aspect));
    this.camera.position.set(0, 1.55 + d * 0.06, d);
    this.camera.lookAt(0, 1.08, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // pin HTML labels under each podium
    const v = new THREE.Vector3();
    for (const c of this.cast) {
      if (!c.el) continue;
      v.set(c.x, 0, 0.8).project(this.camera);
      c.el.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      c.el.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }
  }

  setAccent(color) { this.accentTarget.set(color); }

  poke() {
    const me = this.cast.find((c) => c.key === this.meKey) || this.cast[0];
    if (!me) return;
    if (me.hop < 0) me.hop = 0;
    try { me.avatar?.punch?.(); } catch { /* ignore */ }
    if (this.onPoke) this.onPoke();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || (w === this.size.w && h === this.size.h)) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.layout();
    this.frame(0);
  }

  frame(dt) {
    this.t += dt;
    const t = this.t;
    const p = this.pointer;
    const k = Math.min(1, dt * 5);
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    if (!this.drag) { this.spin *= Math.pow(0.04, dt); this.spinVel = 0; }
    this.accent.lerp(this.accentTarget, Math.min(1, dt * 4));
    this.rim.color.copy(this.accent);
    this.mat.ring.color.copy(this.accent);
    this.mat.glow.color.copy(this.accent);
    for (const c of this.cast) {
      let y = PODIUM_TOP, grounded = true;
      c.nextHop -= dt;
      if (c.nextHop <= 0 && c.hop < 0) { c.hop = 0; c.nextHop = 5 + Math.random() * 6; }
      if (c.hop >= 0) {
        c.hop += dt / 0.5;
        if (c.hop >= 1) c.hop = -1;
        else { y += Math.sin(c.hop * Math.PI) * 0.42; grounded = c.hop > 0.92; }
      }
      const yaw = Math.PI + p.x * 0.55 + this.spin + Math.sin(t * 0.6 + c.phase) * 0.1;
      if (c.avatar) {
        try {
          c.avatar.update({ x: c.x, y, z: 0, yaw, pitch: -p.y * 0.45 + 0.05, speed: 0, grounded, sprint: false }, dt, t);
        } catch { /* ignore */ }
      }
    }
    const { m, q, e, pos, scl } = this.tmp;
    for (let i = 0; i < this.bitData.length; i++) {
      const b = this.bitData[i];
      b.y += b.v * dt;
      if (b.y > 3.6) { b.y = -0.2; b.x = (Math.random() - 0.5) * 7; }
      b.r += b.w * dt;
      q.setFromEuler(e.set(b.r, b.r * 0.7, 0));
      m.compose(pos.set(b.x + Math.sin(t * 0.5 + i) * 0.2, b.y, b.z), q, scl.setScalar(b.s));
      this.bits.setMatrixAt(i, m);
    }
    this.bits.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('mouseleave', this.onLeave);
    this.ro.disconnect();
    this.io.disconnect();
    for (const c of this.cast) this.removeSlot(c);
    this.cast = [];
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    for (const t of Object.values(this.tex)) t.dispose();
    this.bits.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove();
    this.labels.remove();
  }
}
