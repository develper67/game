// Client-side social state: friends, presence, party, invitations, profiles.
import { h, mount, modal, toast, timeAgo, confirmBox } from './util/dom.js';
import { avatarImg } from './ui/avatarIcon.js';
import { audio } from './audio.js';
import { MODES, MODE_IDS } from '/shared/constants.js';
import { SKINS } from '/shared/skins.js';
import { WEAPONS } from '/shared/items.js';

export const STATUS_TEXT = { online: 'Online', in_match: 'In a match', in_queue: 'Searching for a match', in_party: 'In a party', offline: 'Offline' };

export class Social {
  constructor(app) {
    this.app = app;
    this.reset();
  }

  reset() {
    this.friends = [];
    this.incoming = [];
    this.outgoing = [];
    this.blockedUsers = [];
    this.party = null;
    this.invites = new Map();
    const root = document.getElementById('invite-root');
    if (root) while (root.firstChild) root.firstChild.remove();
  }

  bind(net) {
    net.on('friends:state', (d) => { this.friends = d.friends || []; this.incoming = d.incoming || []; this.outgoing = d.outgoing || []; this.app.changed('friends'); });
    net.on('friends:presence', (d) => {
      const f = this.friends.find((x) => x.id === d.id);
      if (f) {
        const wasOff = f.status === 'offline';
        f.status = d.status;
        if (wasOff && d.status !== 'offline') toast(`🟢 ${f.username} is online`);
        this.app.changed('friends');
      }
      if (this.party) for (const m of this.party.members) if (m.id === d.id) { m.status = d.status; m.online = d.status !== 'offline'; }
    });
    net.on('friends:incoming', (d) => { toast(`👋 ${d.from.username} sent you a friend request!`, 'good'); audio.play('invite'); });
    net.on('friends:accepted', (d) => { toast(`🤝 ${d.by.username} accepted your friend request!`, 'good'); audio.play('pickup'); });
    net.on('social:lists', (d) => { this.blockedUsers = d.blockedUsers || []; this.app.changed('friends'); });
    net.on('party:state', (p) => {
      const had = !!this.party;
      this.party = p;
      if (!p && had) this.app.chat.channels.party = [];
      this.app.changed('party');
    });
    net.on('party:invite', (inv) => this.showInvite(inv));
    net.on('party:inviteExpired', (d) => this.removeInvite(d.id, 'This invitation expired.'));
    net.on('party:inviteRevoked', (d) => this.removeInvite(d.id, 'This invitation was cancelled.'));
    net.on('party:inviteResult', (d) => {
      const msg = { accepted: `✅ ${d.to} joined your party!`, declined: `${d.to} declined your invite.`, expired: `Your invite to ${d.to} expired.`, full: `${d.to} couldn't join — the party is full.` }[d.result];
      if (msg) toast(msg, d.result === 'accepted' ? 'good' : '');
    });
    net.on('party:kicked', (d) => toast(`You were removed from the party by ${d.by}.`, 'error'));
  }

  incomingCount() { return this.incoming.length; }

  // -------------------------------------------------------------- requests
  async req(ev, data, okMsg) {
    const r = await this.app.net.request(ev, data);
    if (r.error) { toast(r.error, 'error'); audio.play('error'); return null; }
    if (r.message || okMsg) toast(r.message || okMsg, 'good');
    return r;
  }

  sendRequest(username) { return this.req('friends:request', { username }); }
  accept(id) { return this.req('friends:accept', { userId: id }); }
  decline(id) { return this.req('friends:decline', { userId: id }); }
  cancel(id) { return this.req('friends:cancel', { userId: id }); }
  async removeFriend(f) {
    if (!(await confirmBox('Remove friend?', `Remove ${f.username} from your friends?`, 'Remove', 'red'))) return;
    return this.req('friends:remove', { userId: f.id }, `${f.username} removed.`);
  }
  async block(u) {
    if (!(await confirmBox('Block player?', `${u.username} won't be able to message you, friend you or invite you. This also removes them as a friend.`, 'Block', 'red'))) return;
    const r = await this.req('user:block', { userId: u.id, on: true }, `${u.username} blocked.`);
    if (r) this.app.chat.blocked.add(u.id);
  }
  async unblock(u) {
    const r = await this.req('user:block', { userId: u.id, on: false }, `${u.username} unblocked.`);
    if (r) this.app.chat.blocked.delete(u.id);
  }

  invite(f) { return this.req('party:invite', { userId: f.id }); }
  createParty() { return this.req('party:create', {}, 'Party created! Invite your friends.'); }
  leaveParty() { return this.req('party:leave', {}); }
  ready(on) { return this.req('party:ready', { ready: on }); }
  kick(id) { return this.req('party:kick', { userId: id }); }
  promote(id) { return this.req('party:promote', { userId: id }); }
  setMode(mode) { return this.req('party:mode', { mode }); }
  async startParty(practice) {
    const r = await this.req('party:start', { mode: this.party.mode, practice });
    return r;
  }

  // -------------------------------------------------------------- invitations
  showInvite(inv) {
    if (this.invites.has(inv.id)) return;
    const root = document.getElementById('invite-root');
    const bar = h('div', { style: { width: '100%' } });
    const status = h('div', { class: 'hint' });
    const accept = h('button', { class: 'btn green', text: 'ACCEPT', dataset: { invite: inv.id }, onClick: async () => {
      accept.disabled = decline.disabled = true;
      const r = await this.app.net.request('party:respond', { inviteId: inv.id, accept: true });
      if (r.error) { status.textContent = r.error; toast(r.error, 'error'); setTimeout(() => this.removeInvite(inv.id), 2500); return; }
      toast(`🎉 You joined ${inv.from.username}'s party!`, 'good');
      this.removeInvite(inv.id);
      if (!this.app.game) this.app.showMenu('party');
    } });
    const decline = h('button', { class: 'btn red', text: 'DECLINE', onClick: async () => {
      accept.disabled = decline.disabled = true;
      await this.app.net.request('party:respond', { inviteId: inv.id, accept: false });
      this.removeInvite(inv.id);
    } });
    const el = h('div', { class: 'invite' },
      h('div', { class: 'row' }, avatarImg(inv.from.avatar, 'md'),
        h('div', null, h('div', { class: 'who', text: inv.from.username }), h('div', { class: 'hint', text: `invited you to their party (${inv.size}/${inv.max})` }))),
      h('div', { class: 'timer-bar' }, bar),
      status,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, decline, accept));
    root.appendChild(el);
    audio.play('invite');
    const total = inv.expiresAt - this.app.net.serverNow();
    const timer = setInterval(() => {
      const left = inv.expiresAt - this.app.net.serverNow();
      bar.style.width = Math.max(0, (left / Math.max(1, total)) * 100) + '%';
      if (left <= 0) this.removeInvite(inv.id, 'This invitation expired.');
    }, 250);
    this.invites.set(inv.id, { el, timer, accept, decline, status });
  }

  removeInvite(id, note) {
    const inv = this.invites.get(id);
    if (!inv) return;
    clearInterval(inv.timer);
    this.invites.delete(id);
    if (note) {
      inv.status.textContent = note;
      inv.accept.disabled = inv.decline.disabled = true;
      setTimeout(() => inv.el.remove(), 2200);
    } else inv.el.remove();
  }

  // -------------------------------------------------------------- profile modal
  async showProfile(username) {
    const r = await this.app.net.request('profile:get', { username });
    if (r.error) return toast(r.error, 'error');
    const p = r.profile;
    const statusText = STATUS_TEXT[p.status] || p.status;
    const actions = h('div', { class: 'row', style: { flexWrap: 'wrap', marginTop: '14px' } });
    const m = modal(null, h('div', null,
      h('div', { class: 'row', style: { gap: '16px', marginBottom: '14px' } }, avatarImg(p.avatar, 'lg'),
        h('div', null, h('h2', { style: { margin: 0 }, text: p.username }),
          h('div', { class: 'hint' }, h('span', { class: 'status-dot ' + p.status }), statusText),
          h('div', { class: 'hint', text: `Joined ${new Date(p.createdAt).toLocaleDateString()}${p.status === 'offline' && p.lastSeen ? ' · last seen ' + timeAgo(p.lastSeen) : ''}` }))),
      h('div', { class: 'stats-grid' },
        stat(p.wins, 'Wins'), stat(p.matches, 'Matches'), stat(p.elims, 'Eliminations'), stat(p.skinCount, 'Skins')),
      h('div', { class: 'section-title', text: 'Mode wins / played' }),
      h('div', { class: 'pill-list' }, MODE_IDS.map((md) => h('span', { class: 'pill', text: `${MODES[md].icon} ${p.modeStats[md].wins}/${p.modeStats[md].matches}` }))),
      h('div', { class: 'section-title', text: 'Equipped skins' }),
      Object.keys(p.equipped).length ? h('div', { class: 'pill-list' }, Object.entries(p.equipped).map(([w, s]) => h('span', { class: 'pill r-' + SKINS[s].rarity, text: `${WEAPONS[w].name}: ${SKINS[s].short}` }))) : h('div', { class: 'hint', text: 'None' }),
      actions),
    [{ label: 'Close', class: 'gray' }]);
    if (!p.self) {
      const rel = p.friendship;
      const btn = (label, cls, fn) => h('button', { class: 'btn small ' + cls, text: label, onClick: async () => { await fn(); m.close(); } });
      const u = { id: p.id, username: p.username };
      if (rel === 'friends') {
        if (p.status !== 'offline') actions.appendChild(btn('Invite to party', 'green', () => this.invite(u)));
        actions.appendChild(btn('Remove friend', 'gray', () => this.removeFriend(u)));
      } else if (rel === 'pending_in') actions.appendChild(btn('Accept friend request', 'green', () => this.accept(p.id)));
      else if (rel === 'pending_out') actions.appendChild(h('span', { class: 'hint', text: 'Friend request pending…' }));
      else if (rel !== 'blocked') actions.appendChild(btn('Add friend', 'green', () => this.sendRequest(p.username)));
      if (rel === 'blocked') actions.appendChild(btn('Unblock', 'gray', () => this.unblock(u)));
      else actions.appendChild(btn('Block', 'red', () => this.block(u)));
      actions.appendChild(btn('Report', 'gray', () => this.app.chat.report(u, null)));
    }
  }
}

function stat(v, l) { return h('div', { class: 'stat' }, h('div', { class: 'v', text: String(v) }), h('div', { class: 'l', text: l })); }

export { mount };
