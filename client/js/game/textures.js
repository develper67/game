// Procedural canvas textures (grayscale detail maps tinted by vertex colors).
import * as THREE from 'three';

const cache = new Map();
let SIZE = 256;
export function setTextureSize(s) { SIZE = s; cache.clear(); }

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function noise(ctx, s, amount, seed, base = 200, alpha = 1) {
  const img = ctx.getImageData(0, 0, s, s);
  const r = rng(seed);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    d[i + 3] = 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function fill(ctx, s, v) {
  ctx.fillStyle = typeof v === 'number' ? `rgb(${v},${v},${v})` : v;
  ctx.fillRect(0, 0, s, s);
}

function blotches(ctx, s, n, seed, rMin, rMax, light, dark) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? light : dark;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.12})`;
    ctx.beginPath();
    ctx.arc(r() * s, r() * s, rMin + r() * (rMax - rMin), 0, Math.PI * 2);
    ctx.fill();
  }
}

const GEN = {
  plaster(ctx, s) { fill(ctx, s, 238); blotches(ctx, s, 40, 3, 10, 40, 255, 200); noise(ctx, s, 18, 1); },
  concrete(ctx, s) {
    fill(ctx, s, 215); blotches(ctx, s, 60, 5, 6, 30, 240, 170); noise(ctx, s, 26, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);
  },
  brick(ctx, s) {
    fill(ctx, s, 200);
    const rows = 8, h = s / rows, w = s / 4;
    const r = rng(9);
    for (let y = 0; y < rows; y++) {
      for (let x = -1; x < 5; x++) {
        const ox = (y % 2) * w / 2;
        const v = 175 + Math.floor(r() * 70);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x * w + ox + 2, y * h + 2, w - 4, h - 4);
      }
    }
    noise(ctx, s, 22, 4);
  },
  planks(ctx, s) {
    fill(ctx, s, 210);
    const n = 6, h = s / n;
    const r = rng(11);
    for (let i = 0; i < n; i++) {
      const v = 185 + Math.floor(r() * 60);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, i * h, s, h - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); const yy = i * h + r() * h; ctx.moveTo(0, yy); ctx.bezierCurveTo(s * 0.3, yy + 3, s * 0.6, yy - 3, s, yy); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, i * h + h - 2, s, 2);
      ctx.fillRect(Math.floor(r() * s), i * h, 2, h);
    }
    noise(ctx, s, 14, 12);
  },
  wood(ctx, s) {
    fill(ctx, s, 205);
    const r = rng(21);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 30; i++) { ctx.beginPath(); const y = r() * s; ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + 6 * r(), s * 0.7, y - 6 * r(), s, y); ctx.stroke(); }
    noise(ctx, s, 12, 22);
  },
  logs(ctx, s) {
    fill(ctx, s, 190);
    const n = 5, h = s / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(0, i * h, 0, i * h + h);
      g.addColorStop(0, 'rgb(150,150,150)'); g.addColorStop(0.3, 'rgb(225,225,225)'); g.addColorStop(0.8, 'rgb(200,200,200)'); g.addColorStop(1, 'rgb(110,110,110)');
      ctx.fillStyle = g; ctx.fillRect(0, i * h, s, h);
    }
    noise(ctx, s, 16, 31);
  },
  metal(ctx, s) {
    fill(ctx, s, 215);
    const r = rng(41);
    for (let y = 0; y < s; y++) { const v = 200 + r() * 40; ctx.fillStyle = `rgba(${v},${v},${v},0.5)`; ctx.fillRect(0, y, s, 1); }
    noise(ctx, s, 10, 42);
  },
  metalfloor(ctx, s) {
    fill(ctx, s, 190);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const n = 8, g = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.save(); ctx.translate(x * g + g / 2, y * g + g / 2); ctx.rotate((x + y) % 2 ? 0.7 : -0.7);
      ctx.fillRect(-g * 0.3, -g * 0.07, g * 0.6, g * 0.14); ctx.restore();
    }
    noise(ctx, s, 14, 43);
  },
  corrugated(ctx, s) {
    const n = 16, w = s / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * w, 0, i * w + w, 0);
      g.addColorStop(0, 'rgb(150,150,150)'); g.addColorStop(0.5, 'rgb(240,240,240)'); g.addColorStop(1, 'rgb(150,150,150)');
      ctx.fillStyle = g; ctx.fillRect(i * w, 0, w, s);
    }
    blotches(ctx, s, 25, 44, 5, 25, 120, 120);
    noise(ctx, s, 10, 45);
  },
  container(ctx, s) {
    const n = 12, w = s / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? 'rgb(200,200,200)' : 'rgb(240,240,240)';
      ctx.fillRect(i * w, 0, w, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(i * w, 0, 2, s);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, s, 6); ctx.fillRect(0, s - 6, s, 6);
    blotches(ctx, s, 20, 46, 4, 20, 140, 140);
    noise(ctx, s, 12, 47);
  },
  roof(ctx, s) {
    fill(ctx, s, 200);
    const rows = 8, h = s / rows, w = s / 6;
    const r = rng(51);
    for (let y = 0; y < rows; y++) for (let x = -1; x < 7; x++) {
      const v = 170 + Math.floor(r() * 70);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const ox = (y % 2) * w / 2;
      ctx.beginPath(); ctx.roundRect(x * w + ox + 1, y * h, w - 2, h + 4, [0, 0, 8, 8]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x * w + ox, y * h + h - 1, w, 2);
    }
    noise(ctx, s, 14, 52);
  },
  roofflat(ctx, s) { fill(ctx, s, 200); noise(ctx, s, 60, 53); },
  tile(ctx, s) {
    fill(ctx, s, 120);
    const n = 4, g = s / n;
    const r = rng(61);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 220 + Math.floor(r() * 30); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x * g + 2, y * g + 2, g - 4, g - 4); }
    noise(ctx, s, 8, 62);
  },
  cobble(ctx, s) {
    fill(ctx, s, 110);
    const r = rng(71);
    for (let i = 0; i < 70; i++) {
      const v = 170 + Math.floor(r() * 70);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.ellipse(r() * s, r() * s, 10 + r() * 14, 8 + r() * 10, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, s, 16, 72);
  },
  stone(ctx, s) {
    fill(ctx, s, 120);
    const r = rng(81);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) {
      const v = 160 + Math.floor(r() * 80);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.roundRect(x * (s / 5) + (y % 2) * 20 - 10 + 2, y * (s / 6) + 2, s / 5 - 4 + r() * 6, s / 6 - 4, 8); ctx.fill();
    }
    noise(ctx, s, 18, 82);
  },
  panel(ctx, s) {
    fill(ctx, s, 232);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, s, 3); ctx.fillRect(0, 0, 3, s); ctx.fillRect(s / 2, 0, 2, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [x, y] of [[10, 10], [s - 14, 10], [10, s - 14], [s - 14, s - 14]]) ctx.fillRect(x, y, 4, 4);
    noise(ctx, s, 8, 91);
  },
  adobe(ctx, s) { fill(ctx, s, 225); blotches(ctx, s, 80, 101, 5, 30, 245, 190); noise(ctx, s, 22, 102); },
  asphalt(ctx, s) { fill(ctx, s, 200); noise(ctx, s, 70, 111); blotches(ctx, s, 20, 112, 10, 40, 160, 160); },
  paint(ctx, s) { fill(ctx, s, 245); noise(ctx, s, 20, 121); },
  fence(ctx, s) {
    fill(ctx, s, 200);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(i * s / 8, 0, 3, s); }
    noise(ctx, s, 14, 131);
  },
  door(ctx, s) {
    fill(ctx, s, 215);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 6;
    ctx.strokeRect(s * 0.15, s * 0.08, s * 0.7, s * 0.38);
    ctx.strokeRect(s * 0.15, s * 0.54, s * 0.7, s * 0.38);
    noise(ctx, s, 12, 141);
  },
  // ground textures (full color)
  grass(ctx, s) {
    fill(ctx, s, 'rgb(205,235,190)');
    const r = rng(151);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + r() * 100;
      ctx.fillStyle = `rgba(${v * 0.7},${v},${v * 0.6},0.6)`;
      ctx.fillRect(r() * s, r() * s, 1 + r() * 2, 2 + r() * 5);
    }
    blotches(ctx, s, 30, 152, 10, 40, 255, 150);
  },
  sand(ctx, s) { fill(ctx, s, 'rgb(240,225,200)'); noise(ctx, s, 40, 161); blotches(ctx, s, 40, 162, 10, 40, 255, 190); },
  snow(ctx, s) { fill(ctx, s, 'rgb(250,252,255)'); noise(ctx, s, 14, 171); blotches(ctx, s, 40, 172, 10, 50, 255, 220); },
  dirt(ctx, s) { fill(ctx, s, 'rgb(215,200,180)'); noise(ctx, s, 50, 181); blotches(ctx, s, 40, 182, 5, 30, 240, 150); },
  ice(ctx, s) {
    fill(ctx, s, 'rgb(225,240,255)');
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; const r = rng(191);
    for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(r() * s, r() * s); ctx.lineTo(r() * s, r() * s); ctx.stroke(); }
    noise(ctx, s, 10, 192);
  },
  water(ctx, s) { fill(ctx, s, 'rgb(200,230,255)'); noise(ctx, s, 20, 201); },
};

export function tex(name, repeat = true) {
  const key = name;
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[name];
  if (!gen) return null;
  const c = canvas();
  const ctx = c.getContext('2d', { willReadFrequently: true });
  gen(ctx, c.width);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// meters covered by one texture repeat
export const TEX_SCALE = {
  plaster: 3, concrete: 4, brick: 2.4, planks: 2.4, wood: 2, logs: 1.8, metal: 2, metalfloor: 2, corrugated: 3,
  container: 2.4, roof: 2.5, roofflat: 3, tile: 2, cobble: 3, stone: 2.5, panel: 2.5, adobe: 3, asphalt: 6, paint: 2,
  fence: 2.4, door: 1, grass: 6, sand: 6, snow: 6, dirt: 5, ice: 6, water: 8,
};

// small canvas textures used for faces / labels
export function faceTexture(kind) {
  const key = 'face:' + kind;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(64);
  const x = c.getContext('2d');
  x.fillStyle = kind === 'bot' ? '#1b2a3a' : '#ffd5b0';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1a1a1a';
  x.strokeStyle = '#1a1a1a';
  x.lineWidth = 4;
  x.lineCap = 'round';
  const eye = (cx, cy, r = 5) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  switch (kind) {
    case 'bot':
      x.fillStyle = '#4cc9f0';
      x.fillRect(14, 22, 12, 8); x.fillRect(38, 22, 12, 8);
      x.fillRect(20, 42, 24, 4);
      break;
    case 'cool':
      x.fillRect(10, 20, 44, 10); x.fillRect(30, 18, 4, 6);
      x.beginPath(); x.arc(32, 40, 10, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
      break;
    case 'angry':
      eye(20, 28); eye(44, 28);
      x.beginPath(); x.moveTo(12, 18); x.lineTo(26, 23); x.moveTo(52, 18); x.lineTo(38, 23); x.stroke();
      x.beginPath(); x.arc(32, 50, 9, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke();
      break;
    case 'derp':
      eye(20, 26, 7); eye(46, 30, 4);
      x.beginPath(); x.moveTo(22, 46); x.quadraticCurveTo(32, 54, 44, 44); x.stroke();
      x.fillStyle = '#ff6b8b'; x.fillRect(34, 47, 7, 7);
      break;
    case 'wink':
      eye(20, 28);
      x.beginPath(); x.moveTo(38, 28); x.lineTo(50, 28); x.stroke();
      x.beginPath(); x.arc(32, 40, 10, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      break;
    default:
      eye(20, 28); eye(44, 28);
      x.beginPath(); x.arc(32, 38, 12, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      x.fillStyle = 'rgba(255,120,140,0.5)'; eye(12, 40, 5); eye(52, 40, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  cache.set(key, t);
  return t;
}

// Name tag / text sprite texture
export function labelTexture(text, opts = {}) {
  const c = document.createElement('canvas');
  const scale = 2;
  const font = `700 ${28 * scale}px Fredoka, Trebuchet MS, sans-serif`;
  const x = c.getContext('2d');
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + 30 * scale;
  c.width = w; c.height = 46 * scale;
  x.font = font;
  x.fillStyle = opts.bg || 'rgba(15,6,40,0.72)';
  x.beginPath(); x.roundRect(0, 0, w, c.height, 18 * scale); x.fill();
  x.fillStyle = opts.color || '#ffffff';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: w / c.height };
}

// Skin pattern textures for weapons
export function patternTexture(theme) {
  const key = 'pat:' + theme.name;
  if (cache.has(key)) return cache.get(key);
  const s = 128;
  const c = canvas(s);
  const x = c.getContext('2d');
  const col = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const pc = theme.pc || [theme.base, theme.accent];
  const r = rng(theme.name.length * 97 + 13);
  x.fillStyle = col(theme.base); x.fillRect(0, 0, s, s);
  switch (theme.pattern) {
    case 'camo':
      for (let i = 0; i < 40; i++) {
        x.fillStyle = col(pc[1 + (i % (pc.length - 1))]);
        x.beginPath(); x.ellipse(r() * s, r() * s, 8 + r() * 18, 5 + r() * 12, r() * 3, 0, Math.PI * 2); x.fill();
      }
      break;
    case 'tiger':
      x.fillStyle = col(pc[1]);
      for (let i = 0; i < 9; i++) { x.beginPath(); const y = i * 15 + r() * 6; x.moveTo(0, y); x.quadraticCurveTo(s * 0.5, y + 14 * (r() - 0.5) * 2, s * 0.7, y + 3); x.lineTo(s * 0.6, y + 6); x.quadraticCurveTo(s * 0.3, y + 8, 0, y + 7); x.fill(); }
      break;
    case 'checker':
      x.fillStyle = col(pc[1]);
      for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) if ((xx + yy) % 2) x.fillRect(xx * 16, yy * 16, 16, 16);
      break;
    case 'dots':
      x.fillStyle = col(pc[1]);
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) { x.beginPath(); x.arc(xx * 22 + (yy % 2) * 11 + 6, yy * 22 + 8, 6, 0, Math.PI * 2); x.fill(); }
      break;
    case 'stripes':
      x.fillStyle = col(pc[1]);
      x.fillRect(0, s * 0.38, s, s * 0.1); x.fillRect(0, s * 0.54, s, s * 0.1);
      break;
    case 'circuit':
      x.strokeStyle = col(pc[1]); x.lineWidth = 2;
      for (let i = 0; i < 18; i++) { x.beginPath(); let px = r() * s, py = r() * s; x.moveTo(px, py); for (let k = 0; k < 3; k++) { if (r() < 0.5) px += (r() - 0.5) * 60; else py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); x.fillStyle = col(pc[1]); x.fillRect(px - 3, py - 3, 6, 6); }
      break;
    case 'cracks':
      x.strokeStyle = col(pc[1]); x.lineWidth = 3;
      for (let i = 0; i < 14; i++) { x.beginPath(); let px = r() * s, py = r() * s; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
      break;
    case 'drips':
      x.fillStyle = col(pc[1]);
      for (let i = 0; i < 12; i++) { const px = r() * s, len = 20 + r() * 60; x.fillRect(px, 0, 6, len); x.beginPath(); x.arc(px + 3, len, 5, 0, Math.PI * 2); x.fill(); }
      break;
    case 'stars': {
      const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, col(pc[0])); g.addColorStop(1, col(pc[1]));
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) { const sz = r() < 0.9 ? 1 : 2.5; x.fillRect(r() * s, r() * s, sz, sz); }
      break;
    }
    case 'facets':
      for (let i = 0; i < 30; i++) { x.fillStyle = col(pc[i % pc.length]); x.globalAlpha = 0.6; x.beginPath(); x.moveTo(r() * s, r() * s); x.lineTo(r() * s, r() * s); x.lineTo(r() * s, r() * s); x.fill(); }
      x.globalAlpha = 1;
      break;
    case 'rainbow': {
      const g = x.createLinearGradient(0, 0, s, 0);
      ['#ff0080', '#ff8c00', '#ffe100', '#2ee66b', '#00c2ff', '#8a2be2', '#ff0080'].forEach((cc, i) => g.addColorStop(i / 6, cc));
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      break;
    }
    case 'scales':
      for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
        x.fillStyle = col(pc[(xx + yy) % 2]); x.beginPath(); x.arc(xx * 16 + (yy % 2) * 8, yy * 14, 10, 0, Math.PI); x.fill();
        x.strokeStyle = col(pc[2]); x.lineWidth = 1; x.stroke();
      }
      break;
    default:
      noise(x, s, 10, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}
