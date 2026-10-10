import { h, mount, clear } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { mapPreviewStyle } from './maps.js';
import { avatarImg } from './avatarIcon.js';
import { audio } from '../audio.js';
import { ChatPanel } from './chatPanel.js';

export class VoteScreen {
  constructor(app, d) {
    this.app = app;
    this.matchId = d.matchId;
    this.timerEl = h('div', { class: 'vote-timer' });
    this.grid = h('div', { class: 'maps-grid' });
    this.players = h('div', { class: 'list' });
    this.chat = new ChatPanel(app, ['game', 'party']);
    this.el = h('div', { class: 'vote-wrap' },
      h('div', { class: 'vote-main' },
        h('div', { class: 'vote-head' },
          this.timerEl,
          h('div', null,
            h('h1', { style: { margin: 0 }, text: 'Vote for the map' }),
            h('div', { class: 'hint', text: `${MODES[d.mode].icon} ${MODES[d.mode].name}${d.practice ? ' · Practice vs bots' : ''} — click a map to vote. You can change your vote until the timer ends. Ties are broken randomly.` })),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn small gray', text: 'Leave', onClick: () => { this.app.net.emit('match:leave'); this.app.showMenu(); } })),
        this.grid),
      h('div', { class: 'side-pane' },
        h('div', { style: { padding: '16px 16px 8px' } }, h('h3', { style: { margin: '0 0 8px' }, text: 'Players' }), this.players),
        this.chat.el));
    this.update(d);
    this.timer = setInterval(() => this.tick(), 200);
  }

  update(d) {
    this.d = d;
    const me = d.players.find((p) => p.num === d.you);
    const myVote = me ? me.vote : null;
    const total = Math.max(1, d.players.length);
    clear(this.grid);
    for (const m of d.maps) {
      const n = d.counts[m.id] || 0;
      const voters = d.players.filter((p) => p.vote === m.id);
      const card = h('div', { class: 'map-card' + (myVote === m.id ? ' voted' : ''), dataset: { map: m.id }, onClick: () => { audio.play('click'); this.app.net.emit('match:vote', m.id); } },
        h('div', { class: 'prev', style: mapPreviewStyle(m.id) }),
        h('div', { class: 'vbar' }, h('div', { style: { width: (n / total * 100) + '%' } })),
        h('div', { class: 'info' },
          h('h4', { text: m.name }),
          h('div', { class: 'desc', text: m.desc }),
          h('div', { class: 'voters' }, voters.map((p) => h('span', { text: p.name })))),
        h('div', { class: 'votes', text: `${n} vote${n === 1 ? '' : 's'}` }));
      this.grid.appendChild(card);
    }
    mount(this.players, d.players.map((p) => h('div', { class: 'list-item' },
      avatarImg(p.avatar, 'sm'),
      h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name, p.bot ? h('span', { class: 'bot-tag', text: 'BOT' }) : null, p.num === d.you ? ' (you)' : ''),
        h('div', { class: 'sub', text: p.vote ? `voted ${d.maps.find((m) => m.id === p.vote)?.name}` : 'choosing…' })))));
    this.tick();
  }

  tick() {
    const left = Math.max(0, Math.ceil((this.d.endsAt - this.app.net.serverNow()) / 1000));
    if (left !== this.lastLeft) {
      this.lastLeft = left;
      this.timerEl.textContent = String(left);
      if (left <= 3 && left > 0) audio.play('tick');
    }
  }

  destroy() { clearInterval(this.timer); this.chat.destroy(); }
}
