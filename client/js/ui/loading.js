import { h } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { getMapMeta } from './maps.js';

const TIPS = [
  'Press E to open doors, search containers, pick things up and pass the Boob-tato.',
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
    this.bar = h('div');
    this.label = h('div', { class: 'hint', text: 'Loading…' });
    this.el = h('div', { class: 'loading-wrap' },
      h('div', { class: 'logo small' }, 'yoink', h('span', { class: 'bang', text: '!' })),
      h('h1', { style: { margin: '10px 0 0' }, text: `${MODES[d.mode].icon} ${MODES[d.mode].name}` }),
      h('h2', { style: { margin: 0, color: '#ffd23f' }, text: meta ? meta.name : d.mapId }),
      d.rejoin ? h('div', { class: 'chip', text: 'Rejoining your match…' }) : null,
      h('div', { class: 'loading-bar' }, this.bar),
      this.label,
      h('p', { class: 'tip', text: '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)] }));
  }
  progress(p, label) {
    this.bar.style.width = Math.round(p * 100) + '%';
    if (label) this.label.textContent = label;
  }
}
