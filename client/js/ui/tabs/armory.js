import { h, mount, toast } from '../../util/dom.js';
import { WEAPONS, WEAPON_IDS } from '/shared/items.js';
import { SKINS, SKIN_IDS, RARITIES } from '/shared/skins.js';
import { WeaponPreview, skinSwatch } from '../preview3d.js';
import { audio } from '../../audio.js';

export class ArmoryTab {
  constructor(app) {
    this.app = app;
    this.weapon = app.armoryWeapon || 'pistol';
    this.previewSkin = undefined;
    this.econ = null;
    this.tabs = h('div', { class: 'weapon-tabs' });
    this.previewBox = h('div', { class: 'preview3d' });
    this.previewLabel = h('div', { class: 'pl' });
    this.previewBox.appendChild(this.previewLabel);
    this.grid = h('div', { class: 'skin-grid' });
    this.summary = h('div', { class: 'hint' });
    this.el = h('div', null,
      h('h1', { class: 'pane-title', text: 'Armory' }),
      h('p', { class: 'pane-sub', text: 'Your skin collection. Equip a skin per weapon — it shows in your hands and to other players. Skins are cosmetic only.' }),
      this.summary, this.tabs, this.previewBox, this.grid);
    this.load();
  }

  mountedPreview() {
    if (!this.preview) this.preview = new WeaponPreview(this.previewBox);
  }

  async load() {
    const r = await this.app.net.request('econ:state', {});
    if (r.error) { mount(this.grid, h('p', { class: 'err', text: r.error })); return; }
    this.econ = r;
    this.app.setUser({ coins: r.coins });
    setTimeout(() => { this.mountedPreview(); this.render(); }, 0);
  }

  render() {
    if (!this.econ) return;
    const owned = new Map(this.econ.owned.map((o) => [o.id, o.count]));
    const eq = this.econ.equipped;
    this.summary.textContent = `Collection: ${owned.size} / ${SKIN_IDS.length} skins unlocked.`;
    mount(this.tabs, WEAPON_IDS.map((w) => {
      const n = SKIN_IDS.filter((id) => SKINS[id].weapon === w && owned.has(id)).length;
      return h('button', { class: 'opt-btn' + (this.weapon === w ? ' sel' : ''), text: `${WEAPONS[w].name} (${n}/6)`, onClick: () => { this.weapon = w; this.app.armoryWeapon = w; this.previewSkin = undefined; this.render(); } });
    }));
    const skins = SKIN_IDS.filter((id) => SKINS[id].weapon === this.weapon).sort((a, b) => RARITIES[SKINS[a].rarity].order - RARITIES[SKINS[b].rarity].order);
    const showSkin = this.previewSkin !== undefined ? this.previewSkin : (eq[this.weapon] || null);
    if (this.preview) this.preview.setWeapon(this.weapon, showSkin);
    this.previewLabel.textContent = showSkin ? SKINS[showSkin].name : `${WEAPONS[this.weapon].name} | Default`;
    const card = (id) => {
      const s = id ? SKINS[id] : null;
      const isOwned = !id || owned.has(id);
      const isEq = id ? eq[this.weapon] === id : !eq[this.weapon];
      return h('div', { class: 'skin-card' + (isOwned ? ' owned' : ' locked') + (isEq ? ' equipped' : ''), dataset: { skin: id || 'default' } },
        id && owned.get(id) > 1 ? h('span', { class: 'cnt', text: `x${owned.get(id)}` }) : null,
        h('div', { class: 'sw', style: { background: skinSwatch(id), backgroundSize: 'cover' } }),
        h('div', { class: 'sn', text: s ? s.short : 'Default' }),
        h('div', { class: 'sr ' + (s ? 'r-' + s.rarity : ''), text: s ? RARITIES[s.rarity].name : 'Standard issue' }),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '8px', gap: '6px' } },
          h('button', { class: 'btn small gray', text: 'Preview', onClick: () => { this.previewSkin = id; this.render(); } }),
          isOwned ? (isEq ? h('span', { class: 'chip', text: 'Equipped' }) : h('button', { class: 'btn small green', text: 'Equip', dataset: { equip: id || 'default' }, onClick: () => this.equip(id) })) : h('span', { class: 'chip', text: '🔒 Locked' })));
    };
    mount(this.grid, card(null), skins.map(card));
  }

  async equip(id) {
    const r = await this.app.net.request('skin:equip', { weapon: this.weapon, skin: id });
    if (r.error) { toast(r.error, 'error'); return; }
    this.econ.equipped = r.equipped;
    this.previewSkin = undefined;
    audio.play('pickup');
    toast(id ? `Equipped ${SKINS[id].name}` : `${WEAPONS[this.weapon].name} skin reset to default`, 'good');
    this.render();
  }

  destroy() { if (this.preview) this.preview.destroy(); }
}
