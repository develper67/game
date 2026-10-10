// Chat widget with channel tabs (lobby / party / match).
import { h, clear } from '../util/dom.js';

const NAMES = { lobby: 'Lobby', party: 'Party', game: 'Match', gameparty: 'Party' };

export class ChatPanel {
  constructor(app, channels = ['lobby', 'party']) {
    this.app = app;
    this.channels = channels;
    this.active = channels[0];
    this.tabs = h('div', { class: 'chat-tabs' });
    this.log = h('div', { class: 'chat-log' });
    this.note = h('div', { class: 'chat-note' });
    this.input = h('input', { class: 'input', maxlength: '200', placeholder: 'Type a message…', id: 'chat-input' });
    this.form = h('form', { class: 'chat-form', onSubmit: (e) => { e.preventDefault(); this.send(); } }, this.input, h('button', { class: 'btn cyan small', type: 'submit', text: 'Send', id: 'chat-send' }));
    this.el = h('div', { class: 'chat' }, this.tabs, this.log, this.note, this.form);
    this.unread = {};
    this.unsub = app.chat.on((ch, m) => {
      if (ch === null) { this.renderLog(); return; }
      if (this.mapChannel(ch) === this.active) {
        if (m) this.appendLine(m); else this.renderLog();
      } else if (this.channels.includes(this.mapChannel(ch)) && m && !m.system) {
        this.unread[this.mapChannel(ch)] = true;
        this.renderTabs();
      }
    });
    this.unsubApp = app.on((what) => { if (what === 'party') { this.renderTabs(); this.renderNote(); } });
    this.renderTabs();
    this.renderLog();
    this.renderNote();
  }

  // the "party" tab shows party messages; in a match lobby we use 'game' for everyone
  mapChannel(ch) { return ch; }

  renderTabs() {
    clear(this.tabs);
    for (const ch of this.channels) {
      const b = h('button', { class: 'chat-tab' + (ch === this.active ? ' active' : ''), type: 'button', text: NAMES[ch] || ch, onClick: () => { this.active = ch; this.unread[ch] = false; this.renderTabs(); this.renderLog(); this.renderNote(); } });
      if (this.unread[ch]) b.appendChild(h('span', { class: 'dot' }));
      this.tabs.appendChild(b);
    }
  }

  renderNote() {
    const inParty = !!(this.app.social.party);
    let note = '';
    if (this.active === 'party' && !inParty) note = 'Join or create a party to use party chat.';
    else if (this.active === 'party') note = 'Only your party members can see these messages.';
    else if (this.active === 'lobby') note = 'Everyone in the lobby can see these messages.';
    else if (this.active === 'game') note = 'Everyone in this match can see these messages.';
    this.note.textContent = note;
    this.input.disabled = this.active === 'party' && !inParty;
  }

  renderLog() {
    clear(this.log);
    for (const m of this.app.chat.history(this.active)) this.log.appendChild(this.app.chat.renderLine(m));
    this.log.scrollTop = this.log.scrollHeight;
  }

  appendLine(m) {
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.appendChild(this.app.chat.renderLine(m));
    while (this.log.children.length > 150) this.log.firstChild.remove();
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
  }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    const ok = await this.app.chat.send(this.active, text);
    if (ok) this.input.value = '';
  }

  destroy() { this.unsub(); this.unsubApp(); }
}
