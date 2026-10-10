// Particles, tracers, impact marks, weather and floating text.
import * as THREE from 'three';
import { labelTexture } from './textures.js';

const MAX_P = 1600;

const pVert = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const pFrag = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.1, r));
}`;

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    const max = quality === 'low' ? 700 : MAX_P;
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.count = 0;
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, max);
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: pVert, fragmentShader: pFrag, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    // tracers: thin stretched boxes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1);
    tg.translate(0, 0, -0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tracerIdx = 0;

    // bullet holes
    this.decals = [];
    const dg = new THREE.CircleGeometry(0.06, 8);
    const dm = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(dg, dm);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }
    this.decalIdx = 0;

    this.floaters = [];
    this.weather = null;
    this.flashes = [];
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = -9, drag = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = typeof color === 'number' ? new THREE.Color(color) : color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size; this.baseSize[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  burst(x, y, z, n, colors, speed = 4, size = 0.15, life = 0.6, grav = -9, up = 1) {
    if (this.quality === 'low') n = Math.ceil(n * 0.5);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const c = Array.isArray(colors) ? colors[k % colors.length] : colors;
      this.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp * up + 1, Math.sin(a) * Math.cos(e) * sp, c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav, 1.5);
    }
  }

  impact(x, y, z, nx, ny, nz, player) {
    if (player) {
      this.burst(x, y, z, 10, [0xffffff, 0xffd23f, 0xff8fa3], 3, 0.12, 0.35, -6);
      return;
    }
    for (let k = 0; k < 8; k++) {
      this.emit(x, y, z, nx * 2 + (Math.random() - 0.5) * 3, ny * 2 + Math.random() * 2, nz * 2 + (Math.random() - 0.5) * 3, k % 2 ? 0xffe9a8 : 0x8a8a8a, 0.09, 0.35, -9);
    }
    // decal
    if (nx !== undefined && (nx || ny || nz)) {
      const d = this.decals[this.decalIdx];
      this.decalIdx = (this.decalIdx + 1) % this.decals.length;
      d.position.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
      d.lookAt(x + nx, y + ny, z + nz);
      d.visible = true;
    }
  }

  tracer(ax, ay, az, bx, by, bz, color = 0xfff2a0) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    t.mesh.position.set(bx, by, bz);
    t.mesh.lookAt(ax, ay, az);
    t.mesh.rotateY(Math.PI);
    t.mesh.scale.set(0.025, 0.025, len);
    t.mesh.position.set(ax, ay, az);
    t.mesh.lookAt(bx, by, bz);
    t.mesh.rotateY(Math.PI);
    t.mesh.material.color.set(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  dust(x, y, z, n = 6, color = 0xd8cbb0) {
    for (let k = 0; k < n; k++) this.emit(x + (Math.random() - 0.5) * 0.5, y + 0.05, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2, color, 0.3, 0.5, -1, 2);
  }

  confetti(x, y, z, n = 60) {
    const cols = [0xff4d6d, 0xffd23f, 0x3ddc97, 0x4cc9f0, 0xc77dff, 0xff9f1c];
    this.burst(x, y, z, n, cols, 7, 0.16, 1.6, -6, 1.4);
  }

  pop(x, y, z) {
    this.burst(x, y, z, 50, [0xffb3c7, 0xff5d8f, 0xffffff, 0xffd23f], 9, 0.25, 1.0, -8, 1.2);
    this.burst(x, y, z, 20, [0xeeeeee, 0xcccccc], 3, 0.6, 0.8, 1, 0.5);
    this.text(x, y + 0.6, z, 'POP!', '#ff4d6d', 1.2);
  }

  text(x, y, z, str, color = '#ffffff', scale = 0.6, life = 1.2) {
    const l = labelTexture(str, { color, bg: 'rgba(0,0,0,0)' });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: l.tex, transparent: true, depthTest: false }));
    sp.scale.set(scale * l.aspect, scale, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 20;
    this.scene.add(sp);
    this.floaters.push({ sp, life, max: life, vy: 1.2 });
  }

  setWeather(kind) {
    if (this.weather) { this.scene.remove(this.weather.points); this.weather = null; }
    if (!kind) return;
    const n = this.quality === 'low' ? 500 : this.quality === 'medium' ? 1100 : 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = kind === 'snow' ? 0xffffff : kind === 'dust' ? 0xe0c49a : kind === 'rain' ? 0x9fb8d0 : 0xffffff;
    const mat = new THREE.PointsMaterial({ color, size: kind === 'snow' ? 0.13 : 0.08, transparent: true, opacity: kind === 'dust' ? 0.5 : 0.85, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.weather = { points: pts, kind, n, pos };
  }

  update(dt, camPos) {
    const p = this.pos, v = this.vel;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 2);
      const d = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= d; v[i * 3 + 2] *= d;
      v[i * 3 + 1] = v[i * 3 + 1] * d + this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 0; v[i * 3 + 1] *= -0.3; }
    }
    if (alive || this._wasAlive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
    }
    this._wasAlive = alive > 0;
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.sp.position.y += f.vy * dt;
      f.sp.material.opacity = Math.min(1, f.life / f.max * 2);
      if (f.life <= 0) { this.scene.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); this.floaters.splice(i, 1); }
    }
    if (this.weather && camPos) {
      const w = this.weather;
      const pos = w.pos;
      const fall = w.kind === 'snow' ? 1.6 : w.kind === 'rain' ? 14 : 0.4;
      const drift = w.kind === 'dust' ? 3 : 0.5;
      const t = performance.now() / 1000;
      for (let i = 0; i < w.n; i++) {
        pos[i * 3 + 1] -= fall * dt;
        pos[i * 3] += Math.sin(t + i) * drift * dt * 0.5 + (w.kind === 'dust' ? drift * dt : 0);
        if (pos[i * 3 + 1] < camPos.y - 8) pos[i * 3 + 1] += 30;
        // wrap around camera
        let dx = pos[i * 3] - camPos.x, dz = pos[i * 3 + 2] - camPos.z;
        if (dx > 30) pos[i * 3] -= 60; else if (dx < -30) pos[i * 3] += 60;
        if (dz > 30) pos[i * 3 + 2] -= 60; else if (dz < -30) pos[i * 3 + 2] += 60;
        if (pos[i * 3 + 1] > camPos.y + 22) pos[i * 3 + 1] -= 30;
      }
      w.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.points);
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const d of this.decals) this.scene.remove(d);
    for (const f of this.floaters) this.scene.remove(f.sp);
    if (this.weather) this.scene.remove(this.weather.points);
  }
}
