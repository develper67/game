// Sticker-style artwork (SVG files in /assets/ui) and short presentational copy.
import { h } from '../util/dom.js';

const BASE = '/assets/ui/';

export const MODE_TAGLINE = {
  tag: "Don't be IT when the clock hits zero!",
  hotpotato: 'Pass it on before it pops!',
  grab: 'Snatch the chicken. Bring it home.',
  guns: 'Loot fast. Last one standing.',
  craft: 'Scavenge, craft, survive.',
};

// the yoink! wordmark (always lowercase)
export function logo(cls = '') {
  return h('div', { class: 'logo ' + cls }, 'yoink', h('span', { class: 'bang', text: '!' }));
}

export function modeArt(id, cls = '') {
  return h('img', { class: 'art ' + cls, src: `${BASE}mode-${id}.svg`, alt: '', draggable: 'false' });
}

export function navIcon(id, cls = '') {
  return h('img', { class: 'art ' + cls, src: `${BASE}nav-${id}.svg`, alt: '', draggable: 'false' });
}

export function uiIcon(id, cls = '') {
  return h('img', { class: 'art ' + cls, src: `${BASE}ic-${id}.svg`, alt: '', draggable: 'false' });
}

// "2:30" style mode length
export function modeLength(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}
