import { h, mount } from '../../util/dom.js';
import { avatarImg } from '../avatarIcon.js';
import { MODES, MODE_IDS } from '/shared/constants.js';
import { STATUS_TEXT } from '../../social.js';

export class PartyTab {
  constructor(app) {
    this.app = app;
    this.s = app.social;
    this.body = h('div');
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Party' }),
      h('p', { class: 'pane-sub', text: 'Team up with up to 3 friends. Your party always matchmakes together. Party chat is in the panel on the right.' }),
      this.body);
    this.render();
    this.timer = setInterval(() => this.tickInvites(), 500);
  }

  render() {
    const s = this.s;
    const me = this.app.user.id;
    const p = s.party;
    const onlineFriends = s.friends.filter((f) => f.status !== 'offline');
    if (!p) {
      const canCreate = s.friends.length > 0;
      mount(this.body,
        h('div', { class: 'card' },
          h('h3', { style: { marginTop: 0 }, text: 'You are not in a party' }),
          h('p', { class: 'hint', text: canCreate ? 'Create a party, then invite online friends. They will get an invitation they can accept or decline.' : 'You need at least one accepted friend before you can create a party. Add friends in the Friends tab.' }),
          h('div', { class: 'row' },
            h('button', { class: 'btn big', id: 'btn-create-party', disabled: !canCreate, text: '🎉 Create party', onClick: () => s.createParty() }),
            !canCreate ? h('button', { class: 'btn cyan', text: 'Find friends', onClick: () => this.app.screen.setTab('friends') }) : null)),
        canCreate ? this.inviteList(onlineFriends, null) : null);
      return;
    }
    const isLeader = p.leader === me;
    const myMember = p.members.find((m) => m.id === me);
    const slots = [];
    for (let i = 0; i < p.max; i++) {
      const m = p.members[i];
      if (!m) { slots.push(h('div', { class: 'slot' }, h('div', { class: 'empty-slot', text: 'Empty slot' }))); continue; }
      slots.push(h('div', { class: 'slot filled' + (m.ready || m.leader ? ' ready' : ''), dataset: { member: m.username } },
        m.leader ? h('div', { class: 'crown', text: '👑' }) : null,
        avatarImg(m.avatar, 'md'),
        h('div', { class: 'name', style: { fontWeight: 700 }, text: m.username + (m.id === me ? ' (you)' : '') }),
        h('div', { class: 'hint' }, h('span', { class: 'status-dot ' + (m.online ? m.status : 'offline') }), m.online ? (m.leader ? 'Leader' : STATUS_TEXT[m.status]) : 'Disconnected…'),
        m.leader ? h('span', { class: 'ready-tag on', text: 'LEADER' }) : h('span', { class: 'ready-tag' + (m.ready ? ' on' : ''), text: m.ready ? 'READY' : 'NOT READY' }),
        isLeader && m.id !== me ? h('div', { class: 'row', style: { gap: '4px' } },
          h('button', { class: 'btn small gray', text: 'Make leader', onClick: () => s.promote(m.id) }),
          h('button', { class: 'btn small red', text: 'Kick', onClick: () => s.kick(m.id) })) : null));
    }
    const modeSel = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, MODE_IDS.map((id) => h('button', {
      class: 'opt-btn' + (p.mode === id ? ' sel' : ''), text: `${MODES[id].icon} ${MODES[id].name}`, disabled: !isLeader,
      onClick: () => s.setMode(id),
    })));
    mount(this.body,
      h('div', { class: 'party-slots', id: 'party-slots' }, slots),
      h('div', { class: 'section-title', text: isLeader ? 'Game mode (you pick)' : 'Game mode (leader picks)' }),
      modeSel,
      h('div', { class: 'play-actions' },
        isLeader
          ? [h('button', { class: 'btn big', id: 'btn-party-start', disabled: !p.allReady || !!this.app.queue, text: '▶ START MATCH', onClick: () => s.startParty(false) }),
            h('button', { class: 'btn cyan', id: 'btn-party-practice', disabled: !p.allReady || !!this.app.queue, text: '🤖 Practice vs bots', onClick: () => s.startParty(true) }),
            !p.allReady ? h('span', { class: 'hint', text: 'Waiting for everyone to be READY…' }) : null]
          : h('button', { class: 'btn big ' + (myMember && myMember.ready ? 'gray' : 'green'), id: 'btn-ready', text: myMember && myMember.ready ? 'NOT READY' : "I'M READY", onClick: () => s.ready(!(myMember && myMember.ready)) }),
        h('button', { class: 'btn red', id: 'btn-leave-party', text: 'Leave party', onClick: () => s.leaveParty() })),
      this.app.queue ? h('div', { class: 'hint', style: { marginTop: '8px' }, text: 'Your party is searching for a match — see the Play tab.' }) : null,
      this.inviteList(onlineFriends, p));
  }

  inviteList(onlineFriends, p) {
    const s = this.s;
    const inParty = (id) => p && p.members.some((m) => m.id === id);
    const invites = p ? p.invites : [];
    const avail = onlineFriends.filter((f) => !inParty(f.id));
    const full = p && p.members.length >= p.max;
    this.inviteRows = [];
    return h('div', null,
      h('div', { class: 'section-title', text: 'Invite friends' }),
      full ? h('div', { class: 'hint', text: 'Your party is full.' }) : null,
      avail.length ? h('div', { class: 'list', id: 'invite-list' }, avail.map((f) => {
        const pending = invites.find((i) => i.to.id === f.id);
        const right = pending ? h('span', { class: 'chip', dataset: { expires: pending.expiresAt }, text: 'Invited…' }) : h('button', { class: 'btn small green', text: 'Invite', dataset: { invite: f.username }, disabled: !!full || f.status === 'in_match', onClick: () => s.invite(f) });
        if (pending) this.inviteRows.push(right);
        return h('div', { class: 'list-item' }, avatarImg(f.avatar, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: f.username }), h('div', { class: 'sub' }, h('span', { class: 'status-dot ' + f.status }), STATUS_TEXT[f.status])),
          right);
      })) : h('div', { class: 'empty', text: 'None of your friends are online right now. Invites can only go to online friends.' }));
  }

  tickInvites() {
    const now = this.app.net.serverNow();
    for (const el of this.inviteRows || []) {
      const left = Math.max(0, Math.ceil((+el.dataset.expires - now) / 1000));
      el.textContent = `Invited… ${left}s`;
    }
  }

  onChange(what) { if (what === 'party' || what === 'friends' || what === 'queue') this.render(); }
  destroy() { clearInterval(this.timer); }
}
