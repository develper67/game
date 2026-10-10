// Client-side social state: friends, presence, party, invitations, profiles.
import { h, modal, toast, timeAgo } from './util/dom.js';
import { avatarImg } from './ui/avatarIcon.js';
import { MODES, MODE_IDS } from '/shared/constants.js';
import { SKINS } from '/shared/skins.js';
import { WEAPONS } from '/shared/items.js';

export class Social {
  constructor(app) {
    this.app = app;
    this.reset();
  }

  reset() {
    this.friends = [];
    this.incoming = [];
    this.outgoing = [];
    this.party = null;
    this.invites = [];
  }

  bind(net) {
    net.on('friends:state', (d) => { this.friends = d.friends || []; this.incoming = d.incoming || []; this.outgoing = d.outgoing || []; this.app.changed('friends'); });
    net.on('party:state', (p) => { this.party = p; this.app.changed('party'); });
  }

  incomingCount() { return this.incoming.length; }

  async showProfile(username) {
    const r = await this.app.net.request('profile:get', { username });
    if (r.error) return toast(r.error, 'error');
    const p = r.profile;
    const statusText = { online: '🟢 Online', in_match: '🟠 In a match', in_queue: '🔵 Searching for a match', in_party: '🔵 In a party', offline: '⚫ Offline' }[p.status] || p.status;
    modal(null, h('div', null,
      h('div', { class: 'row', style: { gap: '16px', marginBottom: '14px' } }, avatarImg(p.avatar, 'lg'),
        h('div', null, h('h2', { style: { margin: 0 }, text: p.username }), h('div', { class: 'hint', text: statusText }), h('div', { class: 'hint', text: `Joined ${new Date(p.createdAt).toLocaleDateString()}` }))),
      h('div', { class: 'stats-grid' },
        h('div', { class: 'stat' }, h('div', { class: 'v', text: String(p.wins) }), h('div', { class: 'l', text: 'Wins' })),
        h('div', { class: 'stat' }, h('div', { class: 'v', text: String(p.matches) }), h('div', { class: 'l', text: 'Matches' })),
        h('div', { class: 'stat' }, h('div', { class: 'v', text: String(p.elims) }), h('div', { class: 'l', text: 'Eliminations' })),
        h('div', { class: 'stat' }, h('div', { class: 'v', text: String(p.skinCount) }), h('div', { class: 'l', text: 'Skins' }))),
      h('div', { class: 'section-title', text: 'Mode wins' }),
      h('div', { class: 'pill-list' }, MODE_IDS.map((m) => h('span', { class: 'pill', text: `${MODES[m].icon} ${p.modeStats[m].wins}/${p.modeStats[m].matches}` }))),
      h('div', { class: 'section-title', text: 'Equipped skins' }),
      Object.keys(p.equipped).length ? h('div', { class: 'pill-list' }, Object.entries(p.equipped).map(([w, s]) => h('span', { class: 'pill r-' + SKINS[s].rarity, text: `${WEAPONS[w].name}: ${SKINS[s].short}` }))) : h('div', { class: 'hint', text: 'None' }),
      p.history.length ? h('div', { class: 'hint', style: { marginTop: '12px' }, text: `Last match ${timeAgo(p.history[0].at)}` }) : null),
    [{ label: 'Close', class: 'gray' }]);
  }
}
