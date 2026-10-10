// DOM heads-up display for a match.
import { h, mount, clear, fmtTime } from '../util/dom.js';
import { MODES } from '/shared/constants.js';
import { WEAPONS, AMMO, MATERIALS, MATERIAL_IDS, HEALS, RECIPES, itemLabel } from '/shared/items.js';
import { keyName, settings } from '../settings.js';

const WEAPON_ICON = { pistol: '🔫', revolver: '🔫', smg: '🔫', shotgun: '💥', rifle: '🎯', sniper: '🔭', blaster: '⚡' };

export class Hud {
  constructor(root, game) {
    this.game = game;
    this.root = h('div', { class: 'hud' });
    root.appendChild(this.root);
    this.vignette = h('div', { class: 'vignette' });
    this.crosshair = h('div', { class: 'crosshair' });
    this.hitmarkerEl = h('div', { class: 'hitmarker' });
    this.top = h('div', { class: 'hud-top' });
    this.banner = h('div', { class: 'mode-banner' });
    this.bannerName = h('span');
    this.timer = h('span', { class: 'timer' });
    this.banner.append(this.bannerName, this.timer);
    this.status = h('div', { class: 'mode-status hidden' });
    this.fuse = h('div', { class: 'fuse hidden' }, h('div'));
    this.top.append(this.banner, this.status, this.fuse);
    this.killfeed = h('div', { class: 'killfeed' });
    this.vitals = h('div', { class: 'vitals hidden' });
    this.hpBar = h('div', { class: 'bar hp' }, h('div'), h('span'));
    this.armorBar = h('div', { class: 'bar armor' }, h('div'), h('span'));
    this.vitals.append(this.hpBar, this.armorBar);
    this.livesEl = h('div', { class: 'vitals hidden' });
    this.heals = h('div', { class: 'heals hidden' });
    this.hotbar = h('div', { class: 'hotbar hidden' });
    this.ammoEl = h('div', { class: 'ammo hidden' });
    this.matsEl = h('div', { class: 'mats hidden' });
    this.promptEl = h('div', { class: 'prompt hidden' });
    this.progressEl = h('div', { class: 'progress hidden' }, h('div', { class: 'pl' }), h('div', { class: 'bar' }, h('div')));
    this.countdownEl = h('div', { class: 'countdown hidden' });
    this.centerEl = h('div', { class: 'center-msg hidden' });
    this.spectateEl = h('div', { class: 'spectate hidden' });
    this.markers = h('div');
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.netEl = h('div', { class: 'netwarn hidden', text: 'Connection lost — reconnecting…' });
    this.scoreEl = h('div', { class: 'scoreboard hidden' });
    this.pickupFeed = h('div', { style: { position: 'absolute', right: '20px', bottom: '300px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } });
    this.root.append(this.vignette, this.markers, this.crosshair, this.hitmarkerEl, this.top, this.killfeed, this.vitals, this.livesEl, this.heals, this.hotbar,
      this.ammoEl, this.matsEl, this.promptEl, this.progressEl, this.countdownEl, this.centerEl, this.spectateEl, this.fpsEl, this.netEl, this.scoreEl, this.pickupFeed);
    this.markerEls = new Map();
    this.progress = null;
    this.centerUntil = 0;
    this.last = {};
    this.mode = game.modeId;
    this.bannerName.textContent = `${MODES[this.mode].icon} ${MODES[this.mode].name}`;
    if (game.combat) { this.vitals.classList.remove('hidden'); this.hotbar.classList.remove('hidden'); this.heals.classList.remove('hidden'); }
    if (this.mode === 'craft') this.matsEl.classList.remove('hidden');
  }

  dispose() { this.root.remove(); }

  // --------------------------------------------------------------- feedback
  hitmarker(head, kill) {
    const el = this.hitmarkerEl;
    el.className = 'hitmarker';
    void el.offsetWidth;
    el.className = 'hitmarker show' + (kill ? ' kill' : head ? ' head' : '');
  }

  hurt() {
    this.vignette.classList.add('hurt');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => this.vignette.classList.remove('hurt'), 120);
  }

  feed(node, ms = 6000) {
    const el = h('div', { class: 'kf' }, node);
    this.killfeed.appendChild(el);
    while (this.killfeed.children.length > 6) this.killfeed.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity 0.5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, ms);
  }

  pickup(text, color = '#ffd23f') {
    const el = h('div', { class: 'kf', style: { color } }, text);
    this.pickupFeed.appendChild(el);
    while (this.pickupFeed.children.length > 6) this.pickupFeed.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity 0.5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 2600);
  }

  center(text, sub = '', ms = 2200) {
    mount(this.centerEl, h('div', { text }), sub ? h('div', { class: 'sub', text: sub }) : null);
    this.centerEl.classList.remove('hidden');
    this.centerUntil = performance.now() + ms;
  }

  prompt(text, key = 'E') {
    if (this.last.prompt === text) return;
    this.last.prompt = text;
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    mount(this.promptEl, h('span', { class: 'key', text: key }), text);
    this.promptEl.classList.remove('hidden');
  }

  startProgress(label, ms) {
    this.progress = { label, start: performance.now(), ms };
    this.progressEl.firstChild.textContent = label;
    this.progressEl.classList.remove('hidden');
  }
  stopProgress() { this.progress = null; this.progressEl.classList.add('hidden'); }

  showCountdown(n) {
    if (n === this.last.cd) return;
    this.last.cd = n;
    if (n === null) { this.countdownEl.classList.add('hidden'); return; }
    this.countdownEl.textContent = n === 0 ? 'GO!' : String(n);
    this.countdownEl.className = 'countdown' + (n === 0 ? ' go' : '');
  }

  setSpectate(name) {
    if (!name) { this.spectateEl.classList.add('hidden'); return; }
    mount(this.spectateEl, h('div', { text: `👀 Spectating ${name}` }), h('div', { class: 'sub', text: 'Left / right click to switch player' }));
    this.spectateEl.classList.remove('hidden');
  }

  // --------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game;
    const now = g.net.serverNow();
    const ms = g.modeState || {};
    // timer
    let endsAt = ms.endsAt;
    if (g.mode === 'hotpotato') endsAt = ms.intermissionUntil ? ms.intermissionUntil : ms.popAt;
    if (g.state === 'countdown') endsAt = g.countdownEndsAt;
    const left = endsAt ? (endsAt - now) / 1000 : 0;
    const tStr = endsAt ? fmtTime(left) : '--:--';
    if (tStr !== this.last.timer) { this.timer.textContent = tStr; this.last.timer = tStr; }
    const low = left < 10 && g.state === 'playing';
    if (low !== this.last.low) { this.timer.classList.toggle('low', low); this.last.low = low; }

    // countdown
    if (g.state === 'countdown') this.showCountdown(Math.max(1, Math.ceil((g.countdownEndsAt - now) / 1000)));
    else if (g.goAt && performance.now() - g.goAt < 900) this.showCountdown(0);
    else this.showCountdown(null);

    if (this.centerUntil && performance.now() > this.centerUntil) { this.centerEl.classList.add('hidden'); this.centerUntil = 0; }

    this.updateStatus(now);
    if (g.combat) this.updateCombat();
    if (this.mode === 'craft') this.updateMats();

    // progress
    if (this.progress) {
      const k = Math.min(1, (performance.now() - this.progress.start) / this.progress.ms);
      this.progressEl.lastChild.firstChild.style.width = (k * 100).toFixed(1) + '%';
      if (k >= 1) this.stopProgress();
    }
    this.updateMarkers();
    if (settings.showFps) {
      this.fpsEl.classList.remove('hidden');
      this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
      if (this._fpsAcc > 0.5) { this.fpsEl.textContent = `${Math.round(this._fpsN / this._fpsAcc)} FPS · ${Math.round(g.net.rtt)} ms`; this._fpsAcc = 0; this._fpsN = 0; }
    } else this.fpsEl.classList.add('hidden');
    this.netEl.classList.toggle('hidden', g.net.connected);
    if (!this.scoreEl.classList.contains('hidden')) this.renderScoreboard();
  }

  updateStatus(now) {
    const g = this.game;
    const ms = g.modeState || {};
    let text = '', cls = 'mode-status', fuse = null;
    const me = g.me;
    const name = (n) => g.players.get(n)?.name || '?';
    if (g.state === 'countdown') {
      text = MODES[g.mode].desc;
    } else if (g.mode === 'tag') {
      if (ms.it === me) {
        const cd = (ms.tagReadyAt - now) / 1000;
        text = cd > 0 ? `YOU ARE IT! Tag ready in ${cd.toFixed(1)}s` : 'YOU ARE IT! Punch someone to tag them!';
        cls += ' it';
      } else if (ms.it >= 0) text = `🏃 ${name(ms.it)} is IT — run!`;
    } else if (g.mode === 'hotpotato') {
      const lives = ms.lives ? ms.lives[me] : 0;
      if (ms.intermissionUntil) text = `Next round in ${Math.max(0, Math.ceil((ms.intermissionUntil - now) / 1000))}…`;
      else if (ms.holder === me) { text = 'YOU HAVE THE BOOB-TATO! Press E or click near someone to pass it!'; cls += ' potato'; }
      else if (ms.holder >= 0) text = `🔥 ${name(ms.holder)} has the Boob-tato — keep away!`;
      if (!ms.intermissionUntil && ms.popAt) {
        const total = Math.max(1, ms.popAt - (ms.roundStart || ms.popAt - 30000));
        fuse = Math.max(0, Math.min(1, (ms.popAt - now) / total));
      }
      const hearts = '❤️'.repeat(Math.max(0, lives || 0)) + '🖤'.repeat(Math.max(0, (ms.maxLives || 2) - (lives || 0)));
      if (hearts !== this.last.hearts) {
        this.last.hearts = hearts;
        mount(this.livesEl, h('div', { class: 'mode-status', text: `Lives ${hearts}` }));
        this.livesEl.classList.remove('hidden');
      }
    } else if (g.mode === 'grab') {
      const it = ms.item || {};
      if (it.carrier === me) {
        if (ms.deliverStart) { const k = Math.min(1, (now - ms.deliverStart) / (ms.deliverTime * 1000)); text = `DELIVERING… ${Math.round(k * 100)}% — stay at the table!`; cls += ' good'; }
        else { text = '🐔 You have the chicken! Run to the glowing table!'; cls += ' good'; }
      } else if (it.carrier >= 0) {
        text = ms.deliverStart ? `⚠️ ${name(it.carrier)} is DELIVERING — punch them!` : `🐔 ${name(it.carrier)} has the chicken — punch them!`;
      } else text = '🐔 The Golden Rubber Chicken is up for grabs!';
    } else if (g.mode === 'guns' || g.mode === 'craft') {
      text = `👥 ${ms.alive ?? '?'} / ${ms.total ?? '?'} alive`;
      if (!g.alive) text += ' — you were eliminated';
    }
    if (text !== this.last.status || cls !== this.last.statusCls) {
      this.status.textContent = text;
      this.status.className = cls;
      this.status.classList.toggle('hidden', !text);
      this.last.status = text; this.last.statusCls = cls;
    }
    if (fuse === null) this.fuse.classList.add('hidden');
    else { this.fuse.classList.remove('hidden'); this.fuse.firstChild.style.width = (fuse * 100).toFixed(1) + '%'; }
  }

  updateCombat() {
    const g = this.game;
    const inv = g.inv;
    if (!inv) return;
    const key = JSON.stringify([inv.slots, inv.held, inv.ammo, inv.hp, inv.armor, inv.heals]);
    if (key === this.last.inv) return;
    this.last.inv = key;
    const hp = Math.max(0, inv.hp), ar = Math.max(0, inv.armor);
    this.hpBar.firstChild.style.width = hp + '%';
    this.hpBar.lastChild.textContent = `❤ ${hp}`;
    this.hpBar.classList.toggle('low', hp <= 30);
    this.vignette.classList.toggle('low', hp > 0 && hp <= 25);
    this.armorBar.firstChild.style.width = ar + '%';
    this.armorBar.lastChild.textContent = `🛡 ${ar}`;
    this.armorBar.style.display = ar > 0 ? '' : 'none';
    // hotbar
    clear(this.hotbar);
    const slotEl = (i, content, active) => h('div', { class: 'hslot' + (active ? ' active' : '') }, h('span', { class: 'k', text: keyName(settings.keys['slot' + (i + 1)]) }), content);
    this.hotbar.appendChild(slotEl(0, [h('div', { class: 'gico', text: '👊' }), h('div', { class: 'wn', text: 'Hands' })], inv.held === 0));
    for (let i = 0; i < 3; i++) {
      const s = inv.slots[i];
      const c = s ? [h('div', { class: 'gico', text: WEAPON_ICON[s.t] || '🔫' }), h('div', { class: 'wn', text: WEAPONS[s.t].name }), h('div', { class: 'am', text: `${s.mag}/${inv.ammo[WEAPONS[s.t].ammo] || 0}` })] : [h('div', { class: 'wn', style: { color: '#776' }, text: 'empty' })];
      this.hotbar.appendChild(slotEl(i + 1, c, inv.held === i + 1));
    }
    // ammo
    const w = inv.held > 0 ? inv.slots[inv.held - 1] : null;
    if (w) {
      const def = WEAPONS[w.t];
      mount(this.ammoEl, h('div', { class: 'wname', text: def.name }), h('div', { class: 'mag', text: String(w.mag) }), h('div', { class: 'res', text: `/ ${inv.ammo[def.ammo] || 0} ${AMMO[def.ammo].name}` }));
      this.ammoEl.classList.remove('hidden');
    } else this.ammoEl.classList.add('hidden');
    mount(this.heals,
      h('span', { text: `🩹 ${inv.heals.bandage || 0}` }), h('span', { text: `💊 ${inv.heals.medkit || 0}` }),
      h('span', { text: `${keyName(settings.keys.heal)} to heal · ${keyName(settings.keys.inventory)} inventory` }));
  }

  updateMats() {
    const inv = this.game.inv;
    if (!inv) return;
    const key = JSON.stringify(inv.mats);
    if (key === this.last.mats) return;
    this.last.mats = key;
    clear(this.matsEl);
    for (const m of MATERIAL_IDS) {
      this.matsEl.append(h('div', { class: 'mi' }, h('span', { class: 'sw', style: { background: MATERIALS[m].color } }), MATERIALS[m].name), h('div', { text: String(inv.mats[m] || 0) }));
    }
  }

  // world-space objective markers projected to the screen
  updateMarkers() {
    const g = this.game;
    const list = g.markerList();
    const used = new Set();
    const w = window.innerWidth, hh = window.innerHeight;
    for (const m of list) {
      used.add(m.key);
      let el = this.markerEls.get(m.key);
      if (!el) {
        el = h('div', { class: 'marker' }, h('span', { class: 'ic' }), h('span', { class: 'd' }));
        this.markers.appendChild(el);
        this.markerEls.set(m.key, el);
      }
      const p = g.project(m.x, m.y, m.z);
      let x = p.x, y = p.y;
      const off = p.behind || x < 30 || x > w - 30 || y < 40 || y > hh - 30;
      if (off) {
        // clamp to screen edge in the direction of the target
        let dx = x - w / 2, dy = y - hh / 2;
        if (p.behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = 1; }
        const s = Math.min((w / 2 - 40) / Math.abs(dx || 1), (hh / 2 - 50) / Math.abs(dy || 1));
        x = w / 2 + dx * s; y = hh / 2 + dy * s;
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.classList.toggle('edge', off);
      el.firstChild.textContent = m.icon;
      el.lastChild.textContent = m.label ? `${m.label} ${Math.round(m.dist)}m` : `${Math.round(m.dist)}m`;
      el.lastChild.style.color = m.color || '#fff';
    }
    for (const [k, el] of this.markerEls) if (!used.has(k)) { el.remove(); this.markerEls.delete(k); }
  }

  showScoreboard(on) {
    this.scoreEl.classList.toggle('hidden', !on);
    if (on) this.renderScoreboard(true);
  }

  renderScoreboard(force) {
    const now = performance.now();
    if (!force && now - (this._sbT || 0) < 500) return;
    this._sbT = now;
    const g = this.game;
    const mode = g.mode;
    const cols = {
      tag: [['Tags', (s) => s.tags], ['Time as IT', (s) => fmtTime(s.itTime)]],
      hotpotato: [['Lives', (s, p) => (g.modeState.lives || {})[p.num] ?? 0], ['Passes', (s) => s.passes], ['Rounds survived', (s) => s.rounds]],
      grab: [['Held', (s) => `${Math.round(s.held)}s`], ['Steals', (s) => s.steals]],
      guns: [['Elims', (s) => s.elims], ['Damage', (s) => s.damage]],
      craft: [['Elims', (s) => s.elims], ['Crafted', (s) => s.crafted], ['Damage', (s) => s.damage]],
    }[mode];
    const rows = [...g.players.values()].filter((p) => !p.left);
    rows.sort((a, b) => (b.alive - a.alive) || ((g.scores[b.num]?.elims || 0) - (g.scores[a.num]?.elims || 0)));
    mount(this.scoreEl,
      h('h3', { style: { margin: '0 0 8px' }, text: `${MODES[mode].icon} ${MODES[mode].name} — ${g.mapName}` }),
      h('table', null,
        h('tr', null, h('th', { text: 'Player' }), cols.map(([n]) => h('th', { text: n })), h('th', { text: 'Status' })),
        rows.map((p) => {
          const s = g.scores[p.num] || {};
          return h('tr', { class: (p.num === g.me ? 'me ' : '') + (p.alive ? '' : 'dead') },
            h('td', null, p.name, p.bot ? h('span', { class: 'bot-tag', text: 'BOT' }) : null, p.connected === false ? ' (disconnected)' : ''),
            cols.map(([, f]) => h('td', { text: String(f(s, p) ?? 0) })),
            h('td', { text: p.alive ? 'Alive' : 'Out' }));
        })),
      h('div', { class: 'hint', style: { marginTop: '8px' }, text: `${g.practice ? 'Practice match · ' : ''}Bots are marked BOT.` }));
  }
}

export { WEAPON_ICON, itemLabel, HEALS, RECIPES };
