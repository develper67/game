import { h, mount, modal, toast, uid } from '../../util/dom.js';
import { CRATES, CRATE_IDS, RARITIES, RARITY_IDS, SKINS, SKIN_IDS, skinsByRarity } from '/shared/skins.js';
import { WeaponPreview, skinSwatch } from '../preview3d.js';
import { audio } from '../../audio.js';

export class CratesTab {
  constructor(app) {
    this.app = app;
    this.grid = h('div', { class: 'crates' });
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Crates' }),
      h('p', { class: 'pane-sub', text: 'Spend coins you earn by playing to unlock random weapon skins. Duplicates are refunded with coins. No real money involved.' }),
      this.grid,
      h('div', { class: 'hint', style: { marginTop: '16px' }, text: 'Odds are exact: the server rolls each crate with these probabilities, then picks a skin of that rarity uniformly at random.' }));
    this.render();
  }

  render() {
    const coins = this.app.user.coins;
    mount(this.grid, CRATE_IDS.map((id) => {
      const c = CRATES[id];
      return h('div', { class: 'crate-card', style: { '--cc': c.color }, dataset: { crate: id } },
        h('div', { class: 'crate-art' }, h('div', { class: 'box' }), h('div', { class: 'lid' }), h('div', { class: 'q', text: '?' })),
        h('h3', { style: { margin: '0 0 4px' }, text: c.name }),
        h('div', { class: 'hint', text: c.desc }),
        h('div', { class: 'odds' }, RARITY_IDS.map((r) => [h('span', { class: 'r-' + r, text: RARITIES[r].name }), h('span', { text: ((c.odds[r] || 0) * 100).toFixed(1).replace('.0', '') + '%' })])),
        h('button', { class: 'btn big yellow', style: { width: '100%' }, disabled: coins < c.price, dataset: { open: id }, onClick: () => this.open(id) },
          h('span', { class: 'coin-ico', style: { marginRight: '8px', verticalAlign: '-3px' } }), `${c.price} — OPEN`),
        coins < c.price ? h('div', { class: 'hint', style: { marginTop: '6px' }, text: `You need ${c.price - coins} more coins.` }) : null);
    }));
  }

  async open(crateId) {
    const crate = CRATES[crateId];
    if (this.busy) return;
    this.busy = true;
    const requestId = uid();
    // retry with the same request id on transient failures: the server applies it at most once
    let r = await this.app.net.request('crate:open', { crate: crateId, requestId });
    if (r.error === 'The server did not respond.') r = await this.app.net.request('crate:open', { crate: crateId, requestId });
    this.busy = false;
    if (r.error) { toast(r.error, 'error'); audio.play('error'); return; }
    this.app.setUser({ coins: r.coins });
    this.render();
    this.showOpening(crate, r);
  }

  showOpening(crate, r) {
    // build a reel of random skins weighted by the crate odds; the winner sits at index WIN
    const WIN = 42, N = 50;
    const pick = () => {
      let x = Math.random(), acc = 0, rar = 'common';
      for (const k of RARITY_IDS) { acc += crate.odds[k] || 0; if (x < acc) { rar = k; break; } }
      if (!crate.odds[rar]) rar = RARITY_IDS.find((k) => crate.odds[k] > 0);
      const pool = skinsByRarity(rar);
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const items = [];
    for (let i = 0; i < N; i++) items.push(i === WIN ? r.skin : pick());
    const reel = h('div', { class: 'reel' }, items.map((id) => h('div', { class: 'reel-item', style: { borderBottomColor: RARITIES[SKINS[id].rarity].color } },
      h('div', { class: 'sw', style: { background: skinSwatch(id), backgroundSize: 'cover' } }),
      h('div', { text: SKINS[id].name }))));
    const wrap = h('div', { class: 'reel-wrap' }, h('div', { class: 'reel-pointer' }), reel);
    const result = h('div');
    const body = h('div', null, h('div', { class: 'hint', text: `Opening ${crate.name}…` }), wrap, result);
    const m = modal(crate.name, body, [], { sticky: true });
    const itemW = 140; // 130 + 10 gap
    requestAnimationFrame(() => {
      const wrapW = wrap.clientWidth;
      const target = WIN * itemW + 65 - wrapW / 2 + (Math.random() - 0.5) * 80;
      const dur = 5200;
      const start = performance.now();
      let lastIdx = -1;
      const ease = (t) => 1 - Math.pow(1 - t, 4);
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const x = target * ease(t);
        reel.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + wrapW / 2) / itemW);
        if (idx !== lastIdx) { lastIdx = idx; audio.play('tick'); }
        if (t < 1) requestAnimationFrame(step);
        else this.reveal(result, r, m);
      };
      requestAnimationFrame(step);
    });
  }

  reveal(el, r, m) {
    const s = SKINS[r.skin];
    const rar = RARITIES[r.rarity];
    audio.play('reveal', { rarity: r.rarity });
    const prevBox = h('div', { class: 'preview3d', style: { height: '200px', background: `radial-gradient(circle at 50% 40%, ${rar.color}55, #170a36)` } });
    const equipBtn = h('button', { class: 'btn green', text: 'Equip now', onClick: async () => {
      const e = await this.app.net.request('skin:equip', { weapon: s.weapon, skin: s.id });
      if (e.error) toast(e.error, 'error'); else { toast(`Equipped ${s.name}`, 'good'); equipBtn.disabled = true; equipBtn.textContent = 'Equipped'; }
    } });
    mount(el, h('div', { class: 'reveal' },
      prevBox,
      h('div', { class: 'sr r-' + r.rarity, style: { fontSize: '16px', fontWeight: 700, textTransform: 'uppercase' }, text: rar.name }),
      h('h2', { style: { margin: '4px 0' }, text: s.name }),
      r.duplicate ? h('div', { class: 'hint', text: `Duplicate! You already own this skin — refunded +${r.refund} coins.` }) : h('div', { class: 'hint', text: 'New skin added to your collection!' }),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } },
        equipBtn,
        h('button', { class: 'btn yellow', text: 'Open another', disabled: this.app.user.coins < CRATES[r.crate].price, onClick: () => { cleanup(); m.close(); this.open(r.crate); } }),
        h('button', { class: 'btn gray', text: 'View in Armory', onClick: () => { cleanup(); m.close(); this.app.armoryWeapon = s.weapon; this.app.screen.setTab('armory'); } }),
        h('button', { class: 'btn gray', text: 'Close', onClick: () => { cleanup(); m.close(); } }))));
    let preview = null;
    requestAnimationFrame(() => { preview = new WeaponPreview(prevBox); preview.setWeapon(s.weapon, s.id); });
    const cleanup = () => { if (preview) preview.destroy(); };
  }

  onChange(what) { if (what === 'user') this.render(); }
}

export { SKIN_IDS };
