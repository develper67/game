import { h } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { getMapMeta, mapPreviewStyle } from './maps.js';
import { modeArt, logo } from './art.js';

const TIPS = [
  'Press E to open doors, search containers, pick things up and pass the hot potato.',
  'Hold Shift to sprint. Space to jump. Hold Tab for the scoreboard.',
  'In Grab the Item, punch the carrier to make them drop the chicken — then grab it!',
  'Searching a container takes a second. Stay close or you will cancel it.',
  'Better weapons need rarer materials. Electronics and Rare Alloy hide in warehouses, labs and safes.',
  'Bots are marked with 🤖 and a BOT tag.',
  'Right mouse button aims down sights for better accuracy.',
  'Skins are purely cosmetic: they never change damage or accuracy.',
  'Press Enter or T to chat in-game. Toggle ALL / PARTY with the button next to the text box.',
];

export class LoadingScreen {
  constructor(app, d) {
    const meta = getMapMeta(d.mapId);
    const mode = MODES[d.mode];
    this.bar = h('div');
    this.label = h('div', { class: 'loading-label', text: 'Loading…' });
    this.el = h('div', { class: 'loading-wrap', style: { '--mc': mode.color } },
      h('div', { class: 'loading-bg', style: mapPreviewStyle(d.mapId) }),
      logo('medium'),
      h('div', { class: 'mode-art' }, modeArt(d.mode)),
      h('div', { class: 'loading-mode', text: mode.name }),
      h('h1', { class: 'loading-map', text: meta ? meta.name : d.mapId }),
      meta && meta.desc ? h('p', { class: 'loading-desc', text: meta.desc }) : null,
      d.rejoin ? h('div', { class: 'chip', text: 'Rejoining your match…' }) : null,
      h('div', { class: 'loading-bar' }, this.bar),
      this.label,
      h('div', { class: 'tip' }, h('span', { class: 'tip-k', text: 'TIP' }), h('span', { text: TIPS[Math.floor(Math.random() * TIPS.length)] })));
  }
  progress(p, label) {
    this.bar.style.width = Math.round(p * 100) + '%';
    if (label) this.label.textContent = label;
  }
}
