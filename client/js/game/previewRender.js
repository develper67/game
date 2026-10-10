// Renders a single map from its preview camera (used by tools/render-previews.mjs).
import * as THREE from 'three';
import { getMap } from '/shared/maps/index.js';
import { buildWorld, buildSky } from './world.js';

export function renderPreview(mapId, w = 960, h = 540) {
  const map = getMap(mapId);
  const th = map.theme;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.style.margin = '0';
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(th.skyBottom);
  scene.fog = new THREE.Fog(th.fog, th.fogNear * 2.2, th.fogFar * 2.2);
  scene.add(buildSky(th));
  scene.add(new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity * 0.8));
  scene.add(new THREE.AmbientLight(0xffffff, th.ambient ?? (map.indoor ? 0.75 : 0.5)));
  const sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
  const sd = new THREE.Vector3(...th.sun.dir).normalize();
  sun.position.copy(sd).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const ext = 75;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 300 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
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
