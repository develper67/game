import { h, mount, toast } from '../util/dom.js';
import { settings, saveSettings, DEFAULT_KEYS, KEY_LABELS, keyName, resolvedQuality } from '../settings.js';
import { audio } from '../audio.js';

function slider(label, key, min, max, step, fmt = (v) => Math.round(v * 100) + '%', onChange) {
  const val = h('span', { text: fmt(settings[key]) });
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(settings[key]) });
  input.addEventListener('input', () => {
    settings[key] = parseFloat(input.value);
    val.textContent = fmt(settings[key]);
    saveSettings();
    onChange && onChange();
  });
  return h('div', { class: 'setting' }, h('label', null, h('span', { text: label }), val), input);
}

function choice(label, key, options, note) {
  const wrap = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } });
  const render = () => mount(wrap, options.map(([v, n]) => h('button', { class: 'opt-btn' + (settings[key] === v ? ' sel' : ''), text: n, onClick: () => { settings[key] = v; saveSettings(); render(); } })));
  render();
  return h('div', { class: 'setting' }, h('label', null, h('span', { text: label })), wrap, note ? h('div', { class: 'hint', style: { marginTop: '6px' }, text: note }) : null);
}

function toggle(label, key) {
  const cb = h('input', { type: 'checkbox' });
  cb.checked = !!settings[key];
  cb.addEventListener('change', () => { settings[key] = cb.checked; saveSettings(); });
  return h('div', { class: 'setting' }, h('label', { class: 'check', style: { margin: 0 } }, cb, label));
}

export function settingsPanel(app, { compact = false } = {}) {
  const grid = h('div', { class: 'settings-grid', style: compact ? { gridTemplateColumns: '1fr' } : {} },
    slider('Master volume', 'master', 0, 1, 0.01, undefined, () => audio.play('click')),
    slider('Sound effects', 'sfx', 0, 1, 0.01, undefined, () => audio.play('click')),
    slider('Menu music', 'music', 0, 1, 0.01),
    slider('Mouse sensitivity', 'sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2) + 'x'),
    slider('Field of view', 'fov', 60, 100, 1, (v) => Math.round(v) + '°'),
    choice('Graphics quality', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], `Low = no shadows, lower resolution (best for laptops without a graphics card). Currently: ${resolvedQuality()}. Applies from the next match.`),
    toggle('Invert mouse Y', 'invertY'),
    toggle('Show FPS / ping counter', 'showFps'));
  if (compact) return grid;
  return h('div', null, grid, h('h3', { class: 'section-title', text: 'Controls' }), controlsPanel(true));
}

let armedRebind = null;

export function controlsPanel(editable = false) {
  const wrap = h('div');
  const render = () => {
    const rows = [];
    for (const [action, label] of Object.entries(KEY_LABELS)) {
      const btn = h('button', { class: 'opt-btn', style: { minWidth: '90px' }, text: keyName(settings.keys[action]) });
      if (editable) {
        btn.addEventListener('click', () => {
          if (armedRebind) armedRebind(); // only one key can be waiting for input
          btn.textContent = 'Press a key…';
          const disarm = () => { window.removeEventListener('keydown', onKey, true); if (armedRebind === disarm) armedRebind = null; };
          const onKey = (e) => {
            // the settings panel was closed meanwhile: forget the pending rebind, keep the key
            if (!wrap.isConnected) { disarm(); return; }
            e.preventDefault();
            disarm();
            if (e.code === 'Escape') { render(); return; }
            for (const [a, c] of Object.entries(settings.keys)) if (c === e.code && a !== action) settings.keys[a] = settings.keys[action];
            settings.keys[action] = e.code;
            saveSettings();
            render();
          };
          window.addEventListener('keydown', onKey, true);
          armedRebind = disarm;
        });
      } else btn.disabled = true;
      rows.push(h('div', { text: label }), btn);
    }
    rows.push(h('div', { text: 'Punch / shoot / tag' }), h('span', { class: 'kbd', text: 'Left mouse' }));
    rows.push(h('div', { text: 'Aim down sights' }), h('span', { class: 'kbd', text: 'Right mouse' }));
    rows.push(h('div', { text: 'Switch weapon' }), h('span', { class: 'kbd', text: 'Mouse wheel' }));
    rows.push(h('div', { text: 'Release mouse / pause' }), h('span', { class: 'kbd', text: 'Esc' }));
    mount(wrap, h('div', { class: 'keys' }, rows),
      editable ? h('div', { class: 'row', style: { marginTop: '12px' } },
        h('span', { class: 'hint', text: 'Click a key to rebind it. Esc cancels.' }),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn small gray', text: 'Reset to defaults', onClick: () => { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); render(); toast('Controls reset.', 'good'); } })) : null);
  };
  render();
  return wrap;
}
