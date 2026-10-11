// Renders a single map from its preview camera (used by tools/render-previews.mjs).
import * as THREE from 'three';
import { getMap } from '/shared/maps/index.js';
import { buildWorld, setupEnvironment } from './world.js';

export function renderPreview(mapId, w = 960, h = 540) {
  const map = getMap(mapId);
  const th = map.theme;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.style.margin = '0';
  // on top of whatever the page styles put in the body
  Object.assign(renderer.domElement.style, { position: 'fixed', left: '0', top: '0', zIndex: '9999' });
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const env = setupEnvironment(scene, map, { quality: 'high', renderer, far: 600, fogScale: 2.2 });
  // the overview camera sees the whole map: a wider, sharper shadow map
  const sun = env.sun;
  sun.position.copy(env.sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const ext = 75;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 300 });
  sun.shadow.bias = -0.0006;
  const built = buildWorld(map, { shadows: true, quality: 'high' });
  scene.add(built.root);
  if (built.table) built.table.visible = true;
  const cam = new THREE.PerspectiveCamera(55, w / h, 0.1, 600);
  const pv = map.preview || { pos: [50, 40, 50], look: [0, 0, 0] };
  cam.position.set(...pv.pos);
  cam.lookAt(...pv.look);
  renderer.render(scene, cam);
  return renderer.domElement;
}
