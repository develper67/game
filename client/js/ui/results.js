import { h } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { modeArt } from './art.js';

const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const CONFETTI = ['#ff4d6d', '#ffd23f', '#4cc9f0', '#3ddc97', '#c77dff', '#ff9f1c'];

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
    const place = me.placement || 0;
    const medal = place >= 1 && place <= 3 ? ' p' + place : ' px';
    this.total = h('span', { text: '+0' });
    this.el = h('div', { class: 'results-wrap', style: { '--mc': MODES[mode]?.color || '#ff4d6d' } },
      won ? h('div', { class: 'confetti' }, Array.from({ length: 36 }, (_, i) => h('i', { style: {
        left: (i * 2.8 + Math.random() * 2) + '%', background: CONFETTI[i % CONFETTI.length],
        animationDuration: (3 + Math.random() * 3).toFixed(2) + 's', animationDelay: (-Math.random() * 5).toFixed(2) + 's',
        transform: `rotate(${Math.round(Math.random() * 360)}deg)`,
      } }))) : null,
      h('div', { class: 'results-hero' },
        won ? h('div', { class: 'rays' }) : null,
        h('h1', { class: 'results-title ' + (won ? 'win' : 'lose'), text: won ? 'VICTORY!' : 'DEFEAT' }),
        h('div', { class: 'placement' },
          place ? h('span', { class: 'place-medal' + medal, text: '#' + place }) : null,
          h('span', { text: place ? `${ORD(place)} place` : 'Match over' }),
          MODES[mode] ? h('span', { class: 'mode-badge', style: { '--mc': MODES[mode].color } }, modeArt(mode), MODES[mode].name + (d.practice ? ' · practice' : '')) : null)),
      d.reason ? h('div', { class: 'results-reason', text: d.reason }) : null,
      h('div', { class: 'results-cols' },
        h('div', { class: 'card' },
          h('h3', { text: 'Scoreboard' }),
          h('table', { class: 'results-table' },
            h('tr', null, h('th', { text: '#' }), h('th', { text: 'Player' }), statCols.map(([n]) => h('th', { text: n })), h('th', { text: 'Coins' })),
            d.results.map((r) => h('tr', { class: (r.num === d.you ? 'me ' : '') + (r.won ? 'win' : '') },
              h('td', null, h('span', { class: 'rank' + (r.placement <= 3 ? ' p' + r.placement : ''), text: String(r.placement) })),
              h('td', null, r.name, r.bot ? h('span', { class: 'bot-tag', text: 'BOT' }) : null, r.left ? ' (left)' : ''),
              statCols.map(([, f]) => h('td', { text: String(f(r.stats) ?? 0) })),
              h('td', { text: r.bot ? '—' : `+${r.coins}` }))))),
        h('div', { class: 'card rewards' },
          h('h3', { text: 'Your rewards' }),
          me.rewards.length ? me.rewards.map((rw, i) => h('div', { class: 'rw', style: { animationDelay: (0.45 + i * 0.12) + 's' } }, h('span', { text: rw.label }), h('span', { class: 'amt', text: rw.coins ? `+${rw.coins}` : '' }))) : h('div', { class: 'hint', text: 'No rewards — you left the match.' }),
          h('div', { class: 'total' }, h('span', { text: 'Total' }), h('span', { class: 'amt' }, h('span', { class: 'coin-ico' }), this.total)),
          d.profile ? h('div', { class: 'saved', text: `Saved to your profile. Balance: ${d.profile.coins} coins · ${d.profile.wins} wins · ${d.profile.matches} matches.` }) : null)),
      h('div', { class: 'results-actions' },
        h('button', { class: 'btn big green', id: 'btn-play-again', text: d.practice ? '↻ Practice again' : '↻ Play again', onClick: async () => { const ok = await this.app.play(mode, d.practice); if (ok) this.app.showMenu('play'); } }),
        h('button', { class: 'btn big gray', id: 'btn-to-lobby', text: 'Back to lobby', onClick: () => this.app.showMenu('play') })));
    this.countUp(me.coins || 0);
  }

  // coin total ticks up after the reward rows appear
  countUp(target) {
    const start = performance.now() + 700, dur = 900;
    const step = (now) => {
      if (!this.total.isConnected && now > start + 3000) return;
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      this.total.textContent = '+' + Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy() { cancelAnimationFrame(this.raf); }
}
