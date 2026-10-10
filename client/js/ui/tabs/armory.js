import { h } from '../../util/dom.js';

// Temporary placeholder replaced later in this build.
export class ArmoryTab {
  constructor() {
    this.el = h('div', null, h('h1', { class: 'pane-title', text: 'armory' }), h('p', { class: 'pane-sub', text: 'Loading…' }));
  }
}
