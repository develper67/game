// Client chat store: per-channel history, safe rendering, user context menu.
import { h, fmtClock, toast, modal } from './util/dom.js';
import { audio } from './audio.js';

const CHANNEL_LABEL = { lobby: 'LOBBY', party: 'PARTY', game: 'ALL', gameparty: 'PARTY' };

export class ChatStore {
  constructor(app) {
    this.app = app;
    this.channels = { lobby: [], party: [], game: [], gameparty: [] };
    this.listeners = new Set();
    this.muted = new Set();
    this.blocked = new Set();
    this.unread = { lobby: 0, party: 0 };
  }

  bind(net) {
    net.on('chat:msg', (m) => this.add(m));
    net.on('chat:history', (d) => {
      if (!d || !this.channels[d.channel]) return;
      this.channels[d.channel] = (d.messages || []).filter((m) => !this.hidden(m));
      this.emit(d.channel, null);
    });
    net.on('chat:clear', (d) => { if (d && this.channels[d.channel]) { this.channels[d.channel] = []; this.emit(d.channel, null); } });
    net.on('social:lists', (d) => {
      if (d.muted) this.muted = new Set(d.muted);
      if (d.blocked) this.blocked = new Set(d.blocked);
    });
  }

  hidden(m) { return !m.system && (this.muted.has(m.fromId) || this.blocked.has(m.fromId)); }

  add(m) {
    const ch = m.channel;
    if (!this.channels[ch]) return;
    if (this.hidden(m)) return;
    this.channels[ch].push(m);
    if (this.channels[ch].length > 120) this.channels[ch].splice(0, this.channels[ch].length - 120);
    if ((ch === 'lobby' || ch === 'party') && !m.system && m.fromId !== this.app.user?.id) audio.play('chat');
    this.emit(ch, m);
  }

  history(ch) { return this.channels[ch] || []; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ch, m) { for (const fn of this.listeners) fn(ch, m); }

  async send(channel, text) {
    const r = await this.app.net.request('chat:send', { channel, text });
    if (r && r.error) { toast(r.error, 'error'); audio.play('error'); return false; }
    return true;
  }

  renderLine(m, opts = {}) {
    const line = h('div', { class: 'chat-line' + (m.system ? ' sys ' + (m.kind || 'info') : '') });
    if (!opts.compact) line.appendChild(h('span', { class: 't', text: fmtClock(m.at) }));
    if (m.channel === 'gameparty' || (opts.showChannel && m.channel)) line.appendChild(h('span', { class: 'ch', text: CHANNEL_LABEL[m.channel] || m.channel }));
    if (m.system) {
      line.appendChild(document.createTextNode(m.text));
    } else {
      const u = h('span', { class: 'u', text: m.from + ':', style: { color: m.color || '#ffd23f' } });
      u.addEventListener('click', (e) => { e.stopPropagation(); this.userMenu(e.clientX, e.clientY, { id: m.fromId, username: m.from }, m); });
      line.appendChild(u);
      line.appendChild(document.createTextNode(' ' + m.text));
    }
    return line;
  }

  // Context menu for a user (profile, mute, block, report)
  userMenu(x, y, user, message) {
    document.querySelectorAll('.ctx-menu').forEach((el) => el.remove());
    if (!user || user.id === this.app.user?.id) return;
    const close = () => { menu.remove(); document.removeEventListener('mousedown', outside); };
    const outside = (e) => { if (!menu.contains(e.target)) close(); };
    const item = (label, fn) => h('button', { text: label, onClick: () => { close(); fn(); } });
    const muted = this.muted.has(user.id), blocked = this.blocked.has(user.id);
    const menu = h('div', { class: 'ctx-menu', style: { left: Math.min(x, window.innerWidth - 190) + 'px', top: Math.min(y, window.innerHeight - 220) + 'px' } },
      h('div', { class: 'ctx-title', text: user.username }),
      item('👤 View profile', () => this.app.showProfile(user.username)),
      item(muted ? '🔊 Unmute' : '🔇 Mute', () => this.setMute(user, !muted)),
      item(blocked ? '✅ Unblock' : '⛔ Block', () => this.setBlock(user, !blocked)),
      item('🚩 Report', () => this.report(user, message)));
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }

  async setMute(user, on) {
    const r = await this.app.net.request('user:mute', { userId: user.id, on });
    if (r.error) return toast(r.error, 'error');
    if (on) this.muted.add(user.id); else this.muted.delete(user.id);
    if (on) for (const ch of Object.keys(this.channels)) this.channels[ch] = this.channels[ch].filter((m) => m.fromId !== user.id);
    this.emit(null, null);
    toast(on ? `${user.username} is muted. Their messages are hidden.` : `${user.username} is unmuted.`, 'good');
  }

  async setBlock(user, on) {
    const r = await this.app.net.request('user:block', { userId: user.id, on });
    if (r.error) return toast(r.error, 'error');
    if (on) this.blocked.add(user.id); else this.blocked.delete(user.id);
    if (on) for (const ch of Object.keys(this.channels)) this.channels[ch] = this.channels[ch].filter((m) => m.fromId !== user.id);
    this.emit(null, null);
    toast(on ? `${user.username} is blocked: no messages, friend requests or invites from them.` : `${user.username} is unblocked.`, 'good');
    this.app.refreshFriends?.();
  }

  report(user, message) {
    const reasons = ['Spam', 'Harassment or hate', 'Cheating', 'Inappropriate name', 'Other'];
    let reason = reasons[0];
    const sel = h('select', { class: 'input' }, reasons.map((r) => h('option', { value: r, text: r })));
    sel.addEventListener('change', () => { reason = sel.value; });
    const details = h('textarea', { class: 'input', rows: '3', maxlength: '300', placeholder: 'Optional details' });
    modal(`Report ${user.username}`, h('div', null,
      message ? h('div', { class: 'hint', style: { marginBottom: '10px' } }, 'Message: “', message.text, '”') : null,
      h('div', { class: 'field' }, h('label', { text: 'Reason' }), sel),
      h('div', { class: 'field' }, h('label', { text: 'Details' }), details)), [
      { label: 'Cancel', class: 'gray' },
      { label: 'Send report', class: 'red', onClick: async () => {
        const r = await this.app.net.request('user:report', { userId: user.id, reason, details: details.value, message: message ? message.text : '', channel: message ? message.channel : '' });
        if (r.error) toast(r.error, 'error'); else toast('Report sent. Thanks for keeping yoink! friendly.', 'good');
      } },
    ]);
  }
}
