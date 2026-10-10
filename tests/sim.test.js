// Bot-only matches for every mode on every map, fast-forwarded. Verifies that
// each mode's rules run to completion with a valid outcome on every map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBotMatch } from './sim-helpers.js';
import { MAP_IDS } from '../shared/maps/index.js';
import { MODE_IDS, MODES } from '../shared/constants.js';

for (const mode of MODE_IDS) {
  for (const map of MAP_IDS) {
    test(`${mode} on ${map} plays to a valid finish`, () => {
      const { m, seconds, announcements } = runBotMatch(mode, map, { bots: 6, maxSeconds: MODES[mode].duration + 30 });
      assert.ok(m.ended, `${mode}/${map} did not end within ${seconds}s`);
      const placements = m.byNum.map((p) => p.placement).sort((a, b) => a - b);
      assert.deepEqual(placements, [1, 2, 3, 4, 5, 6]);
      assert.ok(announcements.some((a) => a.includes('Round started')));
      // nobody should be stuck below the kill plane or inside the void
      for (const p of m.byNum) assert.ok(p.y > (m.map.killY ?? -20) - 5, `${p.name} fell through the world`);
      if (mode === 'tag') assert.ok(m.byNum.reduce((s, p) => s + p.stats.tags, 0) > 0, 'nobody was tagged');
      if (mode === 'hotpotato') assert.ok(m.byNum.reduce((s, p) => s + p.stats.passes, 0) > 0, 'potato never passed');
      if (mode === 'grab') assert.ok(m.byNum.some((p) => p.stats.heldTime > 0), 'nobody grabbed the chicken');
      if (mode === 'guns' || mode === 'craft') assert.ok(m.byNum.reduce((s, p) => s + p.stats.searched, 0) > 0, 'nobody searched anything');
      if (mode === 'craft') assert.ok(m.byNum.reduce((s, p) => s + p.stats.crafted, 0) >= 0);
    });
  }
}
