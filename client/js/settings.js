// Local, per-device preferences (not security relevant).
const KEY = 'yoink_settings_v1';

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
  interact: 'KeyE', reload: 'KeyR', heal: 'KeyH', inventory: 'KeyI', scoreboard: 'Tab', chat: 'Enter', drop: 'KeyG',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
};

export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', sprint: 'Sprint',
  interact: 'Interact / pick up / pass / craft', reload: 'Reload', heal: 'Use healing item', inventory: 'Inventory & crafting',
  scoreboard: 'Scoreboard (hold)', chat: 'Open chat', drop: 'Drop held weapon',
  slot1: 'Hands', slot2: 'Weapon slot 1', slot3: 'Weapon slot 2', slot4: 'Weapon slot 3',
};

const DEFAULTS = {
  master: 0.8,
  sfx: 0.9,
  music: 0.35,
  sensitivity: 1.0,
  invertY: false,
  fov: 78,
  quality: 'auto',
  showFps: false,
  keys: { ...DEFAULT_KEYS },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...s, keys: { ...DEFAULT_KEYS, ...(s.keys || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

const listeners = new Set();
export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const fn of listeners) fn(settings);
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function resolvedQuality() {
  if (settings.quality !== 'auto') return settings.quality;
  // conservative default for integrated GPUs
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'medium' : 'low';
}

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', AltLeft: 'L-Alt' };
  return map[code] || code;
}
