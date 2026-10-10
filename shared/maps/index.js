// Map registry. Maps are generated deterministically from code so the server
// and every client produce byte-identical geometry and object ids.
import * as forest from './forest.js';

const MODULES = [forest];

export const MAPS = {};
for (const m of MODULES) MAPS[m.meta.id] = m;

export const MAP_IDS = MODULES.map((m) => m.meta.id);

export function mapMeta(id) {
  const m = MAPS[id];
  if (!m) return null;
  const { name, desc, theme } = m.meta;
  return { id, name, desc, color: '#' + theme.ground.c.toString(16).padStart(6, '0') };
}

const cache = new Map();
export function getMap(id) {
  if (!MAPS[id]) throw new Error('Unknown map ' + id);
  if (!cache.has(id)) cache.set(id, MAPS[id].build());
  return cache.get(id);
}
