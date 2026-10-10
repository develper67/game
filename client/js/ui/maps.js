// Map metadata for menus (no geometry is generated here).
import { MAPS, MAP_IDS } from '/shared/maps/index.js';

export function getMapMeta(id) {
  const m = MAPS[id];
  if (!m) return null;
  return { id, name: m.meta.name, desc: m.meta.desc, theme: m.meta.theme };
}

export function mapPreviewStyle(id) {
  const m = MAPS[id];
  const th = m ? m.meta.theme : null;
  const hx = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const fallback = th ? `linear-gradient(180deg, ${hx(th.skyTop)} 0%, ${hx(th.skyBottom)} 55%, ${hx(th.ground.c)} 56%, ${hx(th.ground.c)} 100%)` : '#333';
  return { backgroundImage: `url(/assets/previews/${id}.jpg), ${fallback}` };
}

export { MAP_IDS };
