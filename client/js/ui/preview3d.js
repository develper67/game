// Small spinning 3D weapon preview for the Armory and crate reveals.
import * as THREE from 'three';
import { weaponModel } from '../game/weapons.js';
import { patternTexture } from '../game/textures.js';
import { SKINS, THEMES } from '/shared/skins.js';

export class WeaponPreview {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 2, 0.1, 50);
    this.camera.position.set(0, 0.25, 2.2);
    this.camera.lookAt(0, 0.05, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x553388, 2.0));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(2, 3, 2);
    this.scene.add(d);
    const rim = new THREE.DirectionalLight(0xc77dff, 1.5);
    rim.position.set(-2, 1, -2);
    this.scene.add(rim);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.model = null;
    this.t = 0;
    this.running = true;
    this.resize = () => {
      const w = container.clientWidth || 400, h = container.clientHeight || 260;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    this.resize();
    window.addEventListener('resize', this.resize);
    let last = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      this.t += dt;
      // slow rock around a side-on view so the whole gun stays readable
      this.holder.rotation.y = Math.sin(this.t * 0.55) * 0.75 - 0.25;
      this.holder.rotation.x = Math.sin(this.t * 0.7) * 0.08 + 0.1;
      if (this.model && this.model.userData.mats && this.model.userData.mats.animated) {
        const m = this.model.userData.mats.base;
        if (m.map) m.map.offset.x = (this.t * 0.2) % 1;
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setWeapon(type, skinId) {
    if (this.model) this.holder.remove(this.model);
    this.model = weaponModel(type, skinId);
    // center + scale to fit
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1.25 / Math.max(size.x, size.y, size.z);
    this.model.scale.setScalar(s);
    this.model.position.set(-center.x * s, -center.y * s, -center.z * s);
    this.model.rotation.y = 0;
    const g = new THREE.Group();
    g.add(this.model);
    g.rotation.y = Math.PI / 2;
    this.holder.clear();
    this.holder.add(g);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}

// CSS background for a skin swatch (uses the same procedural pattern as in-game)
const swatchCache = new Map();
export function skinSwatch(skinId) {
  if (!skinId) return 'linear-gradient(135deg, #3a3f4a, #5b3a29)';
  if (swatchCache.has(skinId)) return swatchCache.get(skinId);
  const th = THEMES[SKINS[skinId].theme];
  let css;
  if (!th.pattern || th.pattern === 'solid') {
    const c = (n) => '#' + n.toString(16).padStart(6, '0');
    css = `linear-gradient(135deg, ${c(th.base)} 0%, ${c(th.base)} 60%, ${c(th.accent)} 61%, ${c(th.grip)} 100%)`;
  } else {
    const t = patternTexture(th);
    css = `url(${t.image.toDataURL()})`;
  }
  swatchCache.set(skinId, css);
  return css;
}
