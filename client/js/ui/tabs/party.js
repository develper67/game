import { h } from '../../util/dom.js';

// Temporary placeholder replaced later in this build.
export class PartyTab {
  constructor() {
    this.el = h('div', null, h('h1', { class: 'pane-title', text: 'party' }), h('p', { class: 'pane-sub', text: 'Loading…' }));
  }
}
