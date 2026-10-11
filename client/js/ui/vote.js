import { h, mount, clear } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { mapPreviewStyle } from './maps.js';
import { avatarImg } from './avatarIcon.js';
import { modeArt } from './art.js';
import { audio } from '../audio.js';
import { ChatPanel } from './chatPanel.js';

export class VoteScreen {
  constructor(app, d) {
    this.app = app;
    this.matchId = d.matchId;
    this.timerNum = h('span');
    this.timerEl = h('div', { class: 'vote-timer' }, this.timerNum);
    this.grid = h('div', { class: 'maps-grid' });
    this.players = h('div', { class: 'list' });
    this.playersHead = h('h3');
    this.chat = new ChatPanel(app, ['game', 'party']);
    const mode = MODES[d.mode];
    this.el = h('div', { class: 'vote-wrap' },
      h('div', { class: 'vote-main' },
        h('div', { class: 'vote-head' },
          this.timerEl,
          h('div', { class: 'vote-title grow' },
            h('div', { class: 'mode-badge', style: { '--mc': mode.color } }, modeArt(d.mode), `${mode.name}${d.practice ? ' · Practice vs bots' : ''}`),
            h('h1', { text: 'Vote for the map' }),
            h('div', { class: 'hint', text: 'Click a map to vote — you can change it until the timer ends. Ties are broken randomly.' })),
          h('button', { class: 'btn small gray', text: 'Leave', onClick: () => { this.app.net.emit('match:leave'); this.app.showMenu(); } })),
        this.grid),
      h('aside', { class: 'side-pane vote-side' },
        h('div', { class: 'vote-players' }, this.playersHead, this.players),
        this.chat.el));
    this.total = Math.max(1, (d.endsAt - app.net.serverNow()) / 1000);
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
      const mine = myVote === m.id;
      const card = h('div', { class: 'map-card' + (mine ? ' voted' : ''), dataset: { map: m.id }, onClick: () => { audio.play('click'); this.app.net.emit('match:vote', m.id); } },
        h('div', { class: 'prev', style: mapPreviewStyle(m.id) }),
        h('div', { class: 'shade' }),
        h('h4', { text: m.name }),
        h('div', { class: 'vbar' }, h('div', { style: { width: (n / total * 100) + '%' } })),
        h('div', { class: 'info' },
          h('div', { class: 'desc', text: m.desc }),
          h('div', { class: 'voters' }, voters.map((p) => avatarImg(p.avatar, 'sm')), voters.length ? null : h('span', { text: 'No votes yet' }))),
        h('div', { class: 'votes' + (n ? ' some' : ''), text: `${n} vote${n === 1 ? '' : 's'}` }),
        mine ? h('div', { class: 'yours', text: 'YOUR VOTE' }) : null);
      this.grid.appendChild(card);
    }
    const voted = d.players.filter((p) => p.vote).length;
    mount(this.playersHead, 'Players', h('span', { class: 'chip', text: `${voted}/${d.players.length} voted` }));
    mount(this.players, d.players.map((p) => h('div', { class: 'list-item' },
      avatarImg(p.avatar, 'sm'),
      h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name, p.bot ? h('span', { class: 'bot-tag', text: 'BOT' }) : null, p.num === d.you ? ' (you)' : ''),
        h('div', { class: 'sub', text: p.vote ? d.maps.find((m) => m.id === p.vote)?.name || '' : 'choosing…' })),
      p.vote ? h('span', { class: 'voted-chip', text: '✓' }) : h('span', { class: 'wait-chip', text: '…' }))));
    this.tick();
  }

  tick() {
    const secs = (this.d.endsAt - this.app.net.serverNow()) / 1000;
    const left = Math.max(0, Math.ceil(secs));
    this.timerEl.style.setProperty('--p', String(Math.max(0, Math.min(1, secs / this.total))));
    if (left !== this.lastLeft) {
      this.lastLeft = left;
      this.timerNum.textContent = String(left);
      this.timerEl.classList.toggle('low', left <= 3);
      if (left <= 3 && left > 0) audio.play('tick');
    }
  }

  destroy() { clearInterval(this.timer); this.chat.destroy(); }
}
