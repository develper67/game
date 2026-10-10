import { h, mount, clear, fmtTime } from '../../util/dom.js';
import { MODES, MODE_IDS } from '/shared/constants.js';
import { audio } from '../../audio.js';

export class PlayTab {
  constructor(app) {
    this.app = app;
    this.mode = app.lastMode || 'tag';
    this.cards = h('div', { class: 'modes' });
    this.actions = h('div', { class: 'play-actions' });
    this.queueBox = h('div');
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Pick a game mode' }),
      h('p', { class: 'pane-sub', text: 'Find a match with other players, or practice against bots. Every match starts with a map vote.' }),
      this.cards, this.actions, this.queueBox);
    this.render();
    this.timer = setInterval(() => this.renderQueue(), 500);
  }

  render() {
    clear(this.cards);
    for (const id of MODE_IDS) {
      const m = MODES[id];
      this.cards.appendChild(h('div', { class: 'mode-card' + (this.mode === id ? ' sel' : ''), style: { '--mc': m.color }, dataset: { mode: id }, onClick: () => { this.mode = id; this.app.lastMode = id; audio.play('click'); this.render(); } },
        h('div', { class: 'mmeta', text: `${Math.floor(m.duration / 60)} min · up to ${m.maxPlayers}` }),
        h('div', { class: 'mico', text: m.icon }),
        h('h3', { text: m.name }),
        h('p', { text: m.desc })));
    }
    const s = this.app.social;
    const party = s.party;
    const isLeader = !party || party.leader === this.app.user.id;
    const queued = !!this.app.queue;
    mount(this.actions,
      h('button', { class: 'btn big', id: 'btn-find', disabled: queued || !isLeader, text: party ? '🔎 FIND MATCH (PARTY)' : '🔎 FIND MATCH', onClick: () => this.app.play(this.mode, false).then(() => this.render()) }),
      h('button', { class: 'btn big cyan', id: 'btn-practice', disabled: queued || !isLeader, text: party ? '🤖 PRACTICE (PARTY)' : '🤖 PRACTICE VS BOTS', onClick: () => this.app.play(this.mode, true) }),
      party && !isLeader ? h('div', { class: 'hint', text: 'Only your party leader can start matches. Mark yourself READY in the Party tab.' }) : null,
      party && isLeader ? h('div', { class: 'hint', text: 'Your whole party joins together. Everyone must be READY.' }) : null);
    this.renderQueue();
  }

  renderQueue() {
    const q = this.app.queue;
    if (!q) { if (this.lastQ) { clear(this.queueBox); this.lastQ = null; this.render(); } return; }
    this.lastQ = q;
    const now = this.app.net.serverNow();
    const isAlone = q.players.length === 1 || q.players.every((p) => p.partyId && p.partyId === (this.app.social.party && this.app.social.party.id));
    let status;
    if (q.countdownEndsAt) status = `Match starts in ${Math.max(0, Math.ceil((q.countdownEndsAt - now) / 1000))}s`;
    else if (q.soloEndsAt) status = `Waiting for players… bots will fill in ${fmtTime((q.soloEndsAt - now) / 1000)}`;
    else status = 'Waiting for players…';
    mount(this.queueBox, h('div', { class: 'queue-box', id: 'queue-box' },
      h('div', { class: 'row' },
        h('span', { class: 'spinner' }),
        h('div', { class: 'grow' },
          h('div', { style: { fontWeight: 700, fontSize: '18px' }, text: `${MODES[q.mode].icon} Searching: ${MODES[q.mode].name}` }),
          h('div', { class: 'hint', text: status })),
        h('div', { class: 'big-num', text: `${q.players.length}/${q.max}` })),
      h('div', { class: 'pill-list' }, q.players.map((p) => h('span', { class: 'pill', text: p.username }))),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        isAlone ? h('button', { class: 'btn green', id: 'btn-start-now', text: '▶ Start now with bots', onClick: async () => { const r = await this.app.net.request('queue:startNow'); if (r.error) { (await import('../../util/dom.js')).toast(r.error, 'error'); } } }) : null,
        h('button', { class: 'btn gray', id: 'btn-cancel-queue', text: 'Cancel', onClick: async () => { await this.app.net.request('queue:leave'); this.app.queue = null; this.app.changed('queue'); } }))));
  }

  onChange(what) { if (what === 'queue' || what === 'party' || what === 'user') this.render(); }
  destroy() { clearInterval(this.timer); }
}
