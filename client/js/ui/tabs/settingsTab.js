import { h } from '../../util/dom.js';
import { settingsPanel } from '../settings.js';

export class SettingsTab {
  constructor(app) {
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Settings' }),
      h('p', { class: 'pane-sub', text: 'Saved on this device. Graphics changes apply when the next match loads.' }),
      settingsPanel(app));
  }
}
