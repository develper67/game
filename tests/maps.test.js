// Every map must build, and every spawn / loot spot / container / bench /
// objective must be reachable on the bot navigation graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_IDS } from '../shared/maps/index.js';
import { validateMap } from '../tools/validate-maps.mjs';

test('there are seven maps', () => assert.equal(MAP_IDS.length, 7));
for (const id of MAP_IDS) {
  test(`map ${id} is valid and fully reachable`, () => {
    const r = validateMap(id);
    assert.deepEqual(r.problems, []);
  });
}
