// Validates every map: build, nav graph, reachability of spawns/loot/containers/benches/objectives.
import { MAP_IDS, getMap } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/physics.js';
import { getNav } from '../server/match/nav.js';

export function validateMap(id, verbose = false) {
  const t0 = performance.now();
  const m = getMap(id);
  const buildMs = performance.now() - t0;
  const world = new CollisionWorld(m.boxes.filter((b) => b.col !== false));
  const t1 = performance.now();
  const nav = getNav(m);
  const navMs = performance.now() - t1;
  const problems = [];
  const reach = (label, list, dy = 0) => {
    for (const s of list) {
      const n = nav.nearest(s.x, s.y + dy, s.z, 8);
      if (n < 0) { problems.push(`${label} ${s.id || ''} at (${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}) has no nav node`); continue; }
      const np = nav.nodePos(n);
      if (nav.comp[n] !== nav.mainComp) problems.push(`${label} ${s.id || ''} at (${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}) unreachable (component ${nav.compSize[nav.comp[n]]} nodes)`);
      else if (Math.hypot(np.x - s.x, np.z - s.z) > 2.6 || Math.abs(np.y - s.y) > 2) problems.push(`${label} ${s.id || ''} at (${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}) nearest walkable node is far (${np.x.toFixed(1)},${np.y.toFixed(1)},${np.z.toFixed(1)})`);
    }
  };
  for (const s of m.spawns) if (world.overlaps(s.x - 0.34, s.y + 0.05, s.z - 0.34, s.x + 0.34, s.y + 1.8, s.z + 0.34)) problems.push(`spawn inside geometry at (${s.x},${s.y},${s.z})`);
  for (const s of m.lootSpots) if (world.overlaps(s.x - 0.15, s.y + 0.08, s.z - 0.15, s.x + 0.15, s.y + 0.5, s.z + 0.15)) problems.push(`loot ${s.id} inside geometry at (${s.x.toFixed(1)},${s.y},${s.z.toFixed(1)})`);
  reach('spawn', m.spawns);
  reach('loot', m.lootSpots);
  reach('container', m.containers);
  reach('bench', m.benches);
  reach('resource', m.resources);
  reach('itemSpawn', m.grab.itemSpawns);
  if (m.grab.table) reach('table', [m.grab.table]); else problems.push('no winning table');
  if (m.spawns.length < 10) problems.push(`only ${m.spawns.length} spawns`);
  if (m.benches.length < 2) problems.push(`only ${m.benches.length} crafting benches`);
  if (m.containers.length < 10) problems.push(`only ${m.containers.length} containers`);
  if (m.lootSpots.length < 20) problems.push(`only ${m.lootSpots.length} loot spots`);
  if (m.grab.itemSpawns.length < 4) problems.push(`only ${m.grab.itemSpawns.length} item spawns`);
  const res = { id, name: m.name, buildMs: Math.round(buildMs), navMs: Math.round(navMs), boxes: m.boxes.length, props: m.props.length, doors: m.doors.length, loot: m.lootSpots.length, containers: m.containers.length, benches: m.benches.length, resources: m.resources.length, spawns: m.spawns.length, items: m.grab.itemSpawns.length, nodes: nav.count, comps: nav.compSize.length, main: nav.compSize[nav.mainComp], problems };
  if (verbose) console.log(JSON.stringify({ ...res, problems: undefined }), '\n  ' + (problems.length ? problems.join('\n  ') : 'OK'));
  return res;
}

if (process.argv[1] && process.argv[1].endsWith('validate-maps.mjs')) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : MAP_IDS;
  let bad = 0;
  for (const id of ids) { const r = validateMap(id, true); bad += r.problems.length; }
  process.exit(bad ? 1 : 0);
}
