import { h, mount, clear } from '../../util/dom.js';
import { avatarImg } from '../avatarIcon.js';
import { STATUS_TEXT } from '../../social.js';

export class FriendsTab {
  constructor(app) {
    this.app = app;
    this.s = app.social;
    this.searchInput = h('input', { class: 'input', id: 'friend-search', placeholder: 'Search by username…', maxlength: '16' });
    this.results = h('div', { class: 'list' });
    this.body = h('div');
    let t = null;
    this.searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.search(), 250); });
    this.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); this.search(); } });
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Friends' }),
      h('p', { class: 'pane-sub', text: 'Add friends to form parties, invite them to play and see when they are online.' }),
      h('div', { class: 'card', style: { padding: '16px' } },
        h('div', { class: 'row' }, this.searchInput, h('button', { class: 'btn cyan', text: 'Search', onClick: () => this.search() })),
        h('div', { style: { marginTop: '10px' } }, this.results)),
      this.body);
    this.render();
  }

  async search() {
    const q = this.searchInput.value.trim();
    if (!q) { clear(this.results); return; }
    const r = await this.app.net.request('friends:search', { q });
    if (r.error) { mount(this.results, h('div', { class: 'err', text: r.error })); return; }
    if (!r.results.length) { mount(this.results, h('div', { class: 'empty', text: `No players found starting with “${q}”.` })); return; }
    mount(this.results, r.results.map((u) => {
      let action;
      if (u.relation === 'friends') action = h('span', { class: 'chip', text: 'Friends ✓' });
      else if (u.relation === 'pending_out') action = h('span', { class: 'chip', text: 'Request sent' });
      else if (u.relation === 'pending_in') action = h('button', { class: 'btn small green', text: 'Accept request', onClick: async () => { await this.s.accept(u.id); this.search(); } });
      else if (u.relation === 'blocked') action = h('button', { class: 'btn small gray', text: 'Unblock', onClick: async () => { await this.s.unblock(u); this.search(); } });
      else action = h('button', { class: 'btn small green', text: '+ Add friend', dataset: { add: u.username }, onClick: async () => { await this.s.sendRequest(u.username); this.search(); } });
      return h('div', { class: 'list-item' }, avatarImg(u.avatar, 'sm'),
        h('div', { class: 'grow' }, h('div', { class: 'name', text: u.username }), h('div', { class: 'sub' }, h('span', { class: 'status-dot ' + u.status }), STATUS_TEXT[u.status])),
        h('button', { class: 'btn small gray', text: 'Profile', onClick: () => this.app.showProfile(u.username) }),
        action);
    }));
  }

  render() {
    const s = this.s;
    const party = s.party;
    const partyFull = party && party.members.length >= party.max;
    const inParty = (id) => party && party.members.some((m) => m.id === id);
    const invited = (id) => party && party.invites.some((i) => i.to.id === id);
    mount(this.body,
      s.incoming.length ? [h('div', { class: 'section-title', text: `Friend requests (${s.incoming.length})` }),
        h('div', { class: 'list' }, s.incoming.map((u) => h('div', { class: 'list-item' }, avatarImg(u.avatar, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: u.username }), h('div', { class: 'sub', text: 'wants to be your friend' })),
          h('button', { class: 'btn small green', text: 'Accept', dataset: { accept: u.username }, onClick: () => s.accept(u.id) }),
          h('button', { class: 'btn small red', text: 'Decline', onClick: () => s.decline(u.id) }))))] : null,
      h('div', { class: 'section-title', text: `Your friends (${s.friends.length})` }),
      s.friends.length ? h('div', { class: 'list', id: 'friends-list' }, s.friends.map((f) => {
        const online = f.status !== 'offline';
        let inviteBtn = null;
        if (inParty(f.id)) inviteBtn = h('span', { class: 'chip', text: 'In your party' });
        else if (invited(f.id)) inviteBtn = h('span', { class: 'chip', text: 'Invited…' });
        else if (online) inviteBtn = h('button', { class: 'btn small green', text: 'Invite to party', disabled: partyFull || f.status === 'in_match', dataset: { invite: f.username }, onClick: () => s.invite(f) });
        return h('div', { class: 'list-item', dataset: { friend: f.username } }, avatarImg(f.avatar, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: f.username }), h('div', { class: 'sub' }, h('span', { class: 'status-dot ' + f.status }), STATUS_TEXT[f.status] || f.status)),
          inviteBtn,
          h('button', { class: 'btn small gray', text: 'Profile', onClick: () => this.app.showProfile(f.username) }),
          h('button', { class: 'btn small gray', text: 'Remove', onClick: () => s.removeFriend(f) }),
          h('button', { class: 'btn small red', text: 'Block', onClick: () => s.block(f) }));
      })) : h('div', { class: 'empty', text: 'No friends yet — search for a username above and send a request.' }),
      s.outgoing.length ? [h('div', { class: 'section-title', text: 'Sent requests' }),
        h('div', { class: 'list' }, s.outgoing.map((u) => h('div', { class: 'list-item' }, avatarImg(u.avatar, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: u.username }), h('div', { class: 'sub', text: 'waiting for them to accept' })),
          h('button', { class: 'btn small gray', text: 'Cancel', onClick: () => s.cancel(u.id) }))))] : null,
      s.blockedUsers.length ? [h('div', { class: 'section-title', text: 'Blocked players' }),
        h('div', { class: 'list' }, s.blockedUsers.map((u) => h('div', { class: 'list-item' },
          h('div', { class: 'grow' }, h('div', { class: 'name', text: u.username })),
          h('button', { class: 'btn small gray', text: 'Unblock', onClick: () => s.unblock(u) }))))] : null);
  }

  onChange(what) { if (what === 'friends' || what === 'party') this.render(); }
}
