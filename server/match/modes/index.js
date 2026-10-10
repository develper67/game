import { TagMode } from './tag.js';
import { HotPotatoMode } from './hotpotato.js';
import { GrabMode } from './grab.js';
import { GunsMode, CraftMode } from './battle.js';

const MODES = { tag: TagMode, hotpotato: HotPotatoMode, grab: GrabMode, guns: GunsMode, craft: CraftMode };

export function createMode(id, match) {
  const M = MODES[id];
  if (!M) throw new Error('Unknown mode ' + id);
  return new M(match);
}
