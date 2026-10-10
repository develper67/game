// Main menu / lobby hub.
import { h, mount, clear } from '../util/dom.js';
import { avatarImg } from './avatarIcon.js';
import { ChatPanel } from './chatPanel.js';
import { PlayTab } from './tabs/play.js';
import { SettingsTab } from './tabs/settingsTab.js';
import { ProfileTab } from './tabs/profile.js';
import { FriendsTab } from './tabs/friends.js';
import { PartyTab } from './tabs/party.js';
import { ArmoryTab } from './tabs/armory.js';
import { CratesTab } from './tabs/crates.js';

const TABS = [
  { id: 'play', label: 'Play', ico: '🎮', C: PlayTab },
  { id: 'friends', label: 'Friends', ico: '👥', C: FriendsTab },
  { id: 'party', label: 'Party', ico: '🎉', C: PartyTab },
  { id: 'armory', label: 'Armory', ico: '🔫', C: ArmoryTab },
  { id: 'crates', label: 'Crates', ico: '🎁', C: CratesTab },
  { id: 'profile', label: 'Profile', ico: '👤', C: ProfileTab },
  { id: 'settings', label: 'Settings', ico: '⚙️', C: SettingsTab },
];

export class MenuScreen {
  constructor(app, tab = 'play') {
    this.app = app;
    this.coinsEl = h('span');
    this.meName = h('span');
    this.meAvatar = h('span');
    this.nav = h('div', { class: 'sidenav' });
    this.pane = h('div', { class: 'main-pane' });
    this.chat = new ChatPanel(app, ['lobby', 'party']);
    this.connEl = h('span', { class: 'chip hidden', style: { background: '#c9184a' }, text: 'Reconnecting…' });
    this.el = h('div', { class: 'menu' },
      h('div', { class: 'topbar' },
        h('div', { class: 'logo small' }, 'yoink', h('span', { class: 'bang', text: '!' })),
        h('div', { class: 'spacer' }),
        this.connEl,
        h('div', { class: 'coins', title: 'Coins — earn them by playing', id: 'coin-balance' }, h('span', { class: 'coin-ico' }), this.coinsEl),
        h('div', { class: 'me-chip', onClick: () => this.setTab('profile') }, this.meAvatar, this.meName),
        h('button', { class: 'btn small gray', id: 'btn-logout', text: 'Log out', onClick: () => this.app.logout() })),
      this.nav,
      this.pane,
      h('div', { class: 'side-pane' }, this.chat.el));
    this.unsub = app.on((what) => this.onChange(what));
    this.renderTop();
    this.setTab(tab || 'play');
  }

  onChange(what) {
    if (what === 'user') this.renderTop();
    if (what === 'net') this.connEl.classList.toggle('hidden', !!(this.app.net && this.app.net.connected));
    this.renderNav();
    if (this.current && this.current.onChange) this.current.onChange(what);
  }

  renderTop() {
    const u = this.app.user;
    if (!u) return;
    this.coinsEl.textContent = String(u.coins ?? 0);
    this.meName.textContent = u.username;
    mount(this.meAvatar, avatarImg(u.avatar, 'sm'));
  }

  renderNav() {
    clear(this.nav);
    const s = this.app.social;
    for (const t of TABS) {
      let badge = null;
      if (t.id === 'friends' && s.incomingCount()) badge = h('span', { class: 'badge', text: String(s.incomingCount()) });
      if (t.id === 'party' && s.party) badge = h('span', { class: 'badge', text: String(s.party.members.length) });
      this.nav.appendChild(h('button', { class: 'navbtn' + (this.tab === t.id ? ' active' : ''), id: 'nav-' + t.id, onClick: () => this.setTab(t.id) },
        h('span', { class: 'ico', text: t.ico }), t.label, badge));
    }
  }

  setTab(id) {
    const t = TABS.find((x) => x.id === id) || TABS[0];
    if (this.current && this.current.destroy) this.current.destroy();
    this.tab = t.id;
    this.current = new t.C(this.app, this);
    mount(this.pane, this.current.el);
    this.renderNav();
  }

  destroy() {
    this.unsub();
    this.chat.destroy();
    if (this.current && this.current.destroy) this.current.destroy();
  }
}
