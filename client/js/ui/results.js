import { h } from '../util/dom.js';
import { MODES } from '/shared/constants.js';

const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

export class ResultsScreen {
  constructor(app, d) {
    this.app = app;
    const me = d.results.find((r) => r.num === d.you) || { rewards: [], coins: 0, placement: 0 };
    const won = me.won;
    const mode = app.lastMode;
    const statCols = {
      tag: [['Tags', (s) => s.tags], ['IT time', (s) => `${Math.round(s.itTime)}s`]],
      hotpotato: [['Passes', (s) => s.passes], ['Rounds survived', (s) => s.roundsSurvived]],
      grab: [['Held', (s) => `${Math.round(s.heldTime)}s`], ['Steals', (s) => s.steals], ['Delivered', (s) => s.deliveries]],
      guns: [['Elims', (s) => s.elims], ['Damage', (s) => Math.round(s.damage)]],
      craft: [['Elims', (s) => s.elims], ['Crafted', (s) => s.crafted], ['Damage', (s) => Math.round(s.damage)]],
    }[mode] || [['Elims', (s) => s.elims]];
    this.el = h('div', { class: 'results-wrap' },
      h('h1', { class: 'results-title ' + (won ? 'win' : 'lose'), text: won ? 'VICTORY!' : 'DEFEAT' }),
      h('div', { class: 'placement', text: `${ORD(me.placement)} place · ${MODES[mode]?.name || ''}${d.practice ? ' (practice)' : ''}` }),
      h('div', { class: 'hint', text: d.reason }),
      h('div', { class: 'results-cols' },
        h('div', { class: 'card' },
          h('h3', { style: { marginTop: 0 }, text: 'Scoreboard' }),
          h('table', { class: 'results-table' },
            h('tr', null, h('th', { text: '#' }), h('th', { text: 'Player' }), statCols.map(([n]) => h('th', { text: n })), h('th', { text: 'Coins' })),
            d.results.map((r) => h('tr', { class: (r.num === d.you ? 'me ' : '') + (r.won ? 'win' : '') },
              h('td', { text: String(r.placement) }),
              h('td', null, r.name, r.bot ? h('span', { class: 'bot-tag', text: 'BOT' }) : null, r.left ? ' (left)' : ''),
              statCols.map(([, f]) => h('td', { text: String(f(r.stats) ?? 0) })),
              h('td', { text: r.bot ? '—' : `+${r.coins}` }))))),
        h('div', { class: 'card rewards' },
          h('h3', { style: { marginTop: 0 }, text: 'Your rewards' }),
          me.rewards.length ? me.rewards.map((rw) => h('div', { class: 'rw' }, h('span', { text: rw.label }), h('span', { text: rw.coins ? `+${rw.coins}` : '' }))) : h('div', { class: 'hint', text: 'No rewards — you left the match.' }),
          h('div', { class: 'total' }, h('span', { text: 'Total' }), h('span', null, h('span', { class: 'coin-ico' }), ` +${me.coins}`)),
          d.profile ? h('div', { class: 'hint', style: { marginTop: '8px' }, text: `Saved to your profile. Balance: ${d.profile.coins} coins · ${d.profile.wins} wins · ${d.profile.matches} matches.` }) : null)),
      h('div', { class: 'row', style: { gap: '16px', marginTop: '10px' } },
        h('button', { class: 'btn big green', id: 'btn-play-again', text: d.practice ? 'PRACTICE AGAIN' : 'PLAY AGAIN', onClick: async () => { const ok = await this.app.play(mode, d.practice); if (ok) this.app.showMenu('play'); } }),
        h('button', { class: 'btn big gray', id: 'btn-to-lobby', text: 'BACK TO LOBBY', onClick: () => this.app.showMenu('play') })));
  }
}
