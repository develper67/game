// Tiny DOM helpers. User-provided text is always inserted with textContent.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') throw new Error('raw html not allowed');
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); append(el, children); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(text, kind = '') {
  const root = document.getElementById('toast-root');
  const t = h('div', { class: 'toast ' + kind, text });
  root.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; }, 2800);
  setTimeout(() => t.remove(), 3300);
}

export function modal(title, body, actions = [], opts = {}) {
  const root = document.getElementById('modal-root');
  const close = () => { bd.remove(); opts.onClose && opts.onClose(); };
  const card = h('div', { class: 'card modal' },
    title ? h('h2', { text: title }) : null,
    body,
    actions.length ? h('div', { class: 'actions' }, actions.map((a) => h('button', {
      class: 'btn ' + (a.class || ''),
      text: a.label,
      onClick: () => { const r = a.onClick ? a.onClick(close) : undefined; if (r !== false && !a.keepOpen) close(); },
    }))) : null);
  const bd = h('div', { class: 'backdrop', onMousedown: (e) => { if (e.target === bd && !opts.sticky) close(); } }, card);
  root.appendChild(bd);
  return { close, card };
}

export function confirmBox(title, text, okLabel = 'OK', kind = '') {
  return new Promise((resolve) => {
    let done = false;
    modal(title, h('p', { text }), [
      { label: 'Cancel', class: 'gray', onClick: () => { done = true; resolve(false); } },
      { label: okLabel, class: kind, onClick: () => { done = true; resolve(true); } },
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function uid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
