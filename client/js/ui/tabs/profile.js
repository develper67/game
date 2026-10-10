import { h, mount, toast, timeAgo } from '../../util/dom.js';
import { AVATAR_COLORS, AVATAR_HATS, AVATAR_FACES, MODES, MODE_IDS } from '/shared/constants.js';
import { SKINS, RARITIES } from '/shared/skins.js';
import { WEAPONS } from '/shared/items.js';
import { avatarImg } from '../avatarIcon.js';
import { getMapMeta } from '../maps.js';

export class ProfileTab {
  constructor(app) {
    this.app = app;
    this.body = h('div', null, h('p', { class: 'hint', text: 'Loading profile…' }));
    this.el = h('div', null, h('h1', { class: 'pane-title', text: 'Your profile' }), h('p', { class: 'pane-sub', text: 'Customize your look and track your progress. Stats are saved on the server.' }), this.body);
    this.load();
  }

  async load() {
    const r = await this.app.net.request('profile:get', {});
    if (r.error) { mount(this.body, h('p', { class: 'err', text: r.error })); return; }
    this.profile = r.profile;
    this.draft = { ...r.profile.avatar };
    this.render();
  }

  render() {
    const p = this.profile;
    const d = this.draft;
    const preview = h('div', { style: { display: 'flex', gap: '18px', alignItems: 'center' } }, avatarImg(d, 'lg'),
      h('div', null, h('div', { style: { fontSize: '30px', fontWeight: 700 }, text: p.username }), h('div', { class: 'hint', text: `Joined ${new Date(p.createdAt).toLocaleDateString()}` })));
    const changed = d.color !== p.avatar.color || d.hat !== p.avatar.hat || d.face !== p.avatar.face;
    const saveBtn = h('button', { class: 'btn green', id: 'btn-save-avatar', disabled: !changed, text: 'Save look', onClick: async () => {
      const r = await this.app.net.request('profile:avatar', d);
      if (r.error) return toast(r.error, 'error');
      p.avatar = { ...r.avatar };
      this.app.setUser({ avatar: r.avatar });
      toast('Look saved! Other players will see it in your next match.', 'good');
      this.render();
    } });
    const winRate = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
    const owned = new Set(p.skins);
    mount(this.body,
      h('div', { class: 'card', style: { marginBottom: '16px' } },
        preview,
        h('div', { class: 'section-title', text: 'Color' }),
        h('div', { class: 'swatches' }, AVATAR_COLORS.map((c) => h('div', { class: 'swatch' + (d.color === c ? ' sel' : ''), style: { background: c }, onClick: () => { d.color = c; this.render(); } }))),
        h('div', { class: 'section-title', text: 'Hat' }),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, AVATAR_HATS.map((x) => h('button', { class: 'opt-btn' + (d.hat === x ? ' sel' : ''), text: x, onClick: () => { d.hat = x; this.render(); } }))),
        h('div', { class: 'section-title', text: 'Face' }),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, AVATAR_FACES.map((x) => h('button', { class: 'opt-btn' + (d.face === x ? ' sel' : ''), text: x, onClick: () => { d.face = x; this.render(); } }))),
        h('div', { style: { marginTop: '16px' } }, saveBtn)),
      h('div', { class: 'stats-grid' },
        stat(p.wins, 'Wins'), stat(p.matches, 'Matches played'), stat(p.elims, 'Eliminations'), stat(p.coins, 'Coins'),
        stat(winRate + '%', 'Win rate'), stat(p.skinCount, 'Skins unlocked'), stat(Object.keys(p.equipped).length, 'Skins equipped'), stat(p.history.length ? timeAgo(p.history[0].at) : '—', 'Last match')),
      h('div', { class: 'section-title', text: 'Mode stats' }),
      h('div', { class: 'stats-grid', style: { gridTemplateColumns: 'repeat(5, 1fr)' } }, MODE_IDS.map((m) => h('div', { class: 'stat' }, h('div', { style: { fontSize: '26px' }, text: MODES[m].icon }), h('div', { class: 'l', text: MODES[m].name }), h('div', { text: `${p.modeStats[m].wins} W / ${p.modeStats[m].matches} played` })))),
      h('div', { class: 'section-title', text: 'Equipped cosmetics' }),
      Object.keys(p.equipped).length ? h('div', { class: 'pill-list' }, Object.entries(p.equipped).map(([w, s]) => h('span', { class: 'pill' }, `${WEAPONS[w].name}: `, h('span', { class: 'r-' + SKINS[s].rarity, text: SKINS[s].short })))) : h('div', { class: 'hint', text: 'No skins equipped yet. Open crates in the Crates tab, then equip skins in the Armory.' }),
      h('div', { class: 'section-title', text: `Unlocked skins (${owned.size})` }),
      owned.size ? h('div', { class: 'pill-list' }, [...owned].map((id) => h('span', { class: 'pill r-' + SKINS[id].rarity, text: SKINS[id].name }))) : h('div', { class: 'hint', text: 'None yet.' }),
      h('div', { class: 'section-title', text: 'Recent matches' }),
      p.history.length ? p.history.map((m) => h('div', { class: 'history-row' },
        h('span', { text: `${MODES[m.mode]?.icon || ''} ${MODES[m.mode]?.name || m.mode}${m.practice ? ' (practice)' : ''}` }),
        h('span', { text: getMapMeta(m.map)?.name || m.map }),
        h('span', { text: m.won ? '🏆 Won' : `#${m.placement}` }),
        h('span', { text: `+${m.coins} 🪙` }),
        h('span', { class: 'hint', text: timeAgo(m.at) }))) : h('div', { class: 'hint', text: 'Play a match to see it here.' }),
      h('div', { class: 'hint', style: { marginTop: '10px' }, text: `Rarities: ${Object.values(RARITIES).map((r) => r.name).join(' · ')}` }));
  }
}

function stat(v, l) { return h('div', { class: 'stat' }, h('div', { class: 'v', text: String(v) }), h('div', { class: 'l', text: l })); }
