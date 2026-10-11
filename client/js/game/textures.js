// Procedural canvas textures. World textures are light grayscale detail maps
// (mean ~240) that get multiplied by per-vertex colors, so one texture serves
// every tint and colors stay true instead of going muddy. All patterns tile.
import * as THREE from 'three';

const cache = new Map();
let SIZE = 256; // texture resolution in pixels
let ANISO = 4;
const D = 256; // design units: generators draw in a 256x256 space

// Kept for older callers: the resolution now follows setTextureQuality().
export function setTextureSize() {}

// Resolution + anisotropic filtering per graphics quality
export function setTextureQuality(q, renderer) {
  const max = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  ANISO = Math.min(max, q === 'high' ? 8 : q === 'medium' ? 4 : 2);
  const size = q === 'high' ? 512 : 256;
  if (size !== SIZE) { SIZE = size; cache.clear(); }
  for (const t of cache.values()) if (t.isTexture && t.wrapS === THREE.RepeatWrapping && t.anisotropy !== ANISO) { t.anisotropy = ANISO; t.needsUpdate = true; }
}

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

// per-pixel monochrome noise over the whole canvas (s = pixel size)
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
const grain = (ctx, amount, seed) => noise(ctx, ctx.canvas.width, amount, seed);

const g = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

function fill(ctx, s, v) {
  ctx.fillStyle = typeof v === 'number' ? g(v) : v;
  ctx.fillRect(0, 0, s, s);
}

// run fn at (x,y) and at the wrapped copies that overlap the tile
function wrap(x, y, r, fn) {
  for (const dx of [-D, 0, D]) for (const dy of [-D, 0, D]) {
    const px = x + dx, py = y + dy;
    if (px > -r && px < D + r && py > -r && py < D + r) fn(px, py);
  }
}

// soft round stains
function blotches(ctx, n, r, rMin, rMax, light, dark, aMin = 0.05, aMax = 0.12) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? light : dark, a = aMin + r() * (aMax - aMin);
    const rad = rMin + r() * (rMax - rMin);
    wrap(r() * D, r() * D, rad, (x, y) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, g(v, a)); gr.addColorStop(1, g(v, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
  }
}

// tiny dots
function specks(ctx, n, r, rMin, rMax, v, a, v2 = v) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = g(r() < 0.5 ? v : v2, a);
    const rad = rMin + r() * (rMax - rMin);
    wrap(r() * D, r() * D, rad, (x, y) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); });
  }
}

// chunky bevelled block: lit top/left edge, shaded bottom/right edge
function bevel(ctx, x, y, w, h, v, hi = 16, lo = 30, e = 2.5, rad = 0) {
  ctx.fillStyle = g(v);
  if (rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill(); } else ctx.fillRect(x, y, w, h);
  ctx.fillStyle = g(Math.min(255, v + hi), 0.9);
  ctx.fillRect(x + rad * 0.5, y, w - rad, e);
  ctx.fillStyle = g(Math.min(255, v + hi * 0.5), 0.6);
  ctx.fillRect(x, y + rad * 0.5, e, h - rad);
  ctx.fillStyle = g(Math.max(0, v - lo), 0.9);
  ctx.fillRect(x + rad * 0.5, y + h - e, w - rad, e);
  ctx.fillStyle = g(Math.max(0, v - lo * 0.6), 0.6);
  ctx.fillRect(x + w - e, y + rad * 0.5, e, h - rad);
}

function hline(ctx, y, v, a, w = 1.5) { ctx.fillStyle = g(v, a); ctx.fillRect(0, y, D, w); }
function vline(ctx, x, v, a, w = 1.5) { ctx.fillStyle = g(v, a); ctx.fillRect(x, 0, w, D); }

// wavy grain lines across the tile
function grainLines(ctx, r, n, y0, y1, v, aMax, amp = 3) {
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const y = y0 + r() * (y1 - y0);
    ctx.strokeStyle = g(v, 0.03 + r() * aMax);
    ctx.beginPath(); ctx.moveTo(-4, y);
    ctx.bezierCurveTo(D * 0.33, y + (r() - 0.5) * amp * 2, D * 0.66, y + (r() - 0.5) * amp * 2, D + 4, y);
    ctx.stroke();
  }
}

// random branching cracks
function cracks(ctx, r, n, v, a, w = 1.2, len = 5) {
  ctx.lineWidth = w; ctx.strokeStyle = g(v, a); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = r() * D, y = r() * D, ang = r() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      ang += (r() - 0.5) * 1.4; const l = 6 + r() * 16;
      x += Math.cos(ang) * l; y += Math.sin(ang) * l; ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const GEN = {
  plaster(c, r) { fill(c, D, 244); blotches(c, 26, r, 20, 70, 255, 214); specks(c, 220, r, 0.5, 1.2, 205, 0.25); grain(c, 7, 1); },
  stucco(c, r) { fill(c, D, 240); blotches(c, 20, r, 15, 50, 255, 210); specks(c, 1400, r, 0.4, 1.3, 205, 0.35, 255); grain(c, 16, 2); },
  concrete(c, r) {
    fill(c, D, 236); blotches(c, 34, r, 10, 46, 255, 196, 0.05, 0.14); specks(c, 260, r, 0.6, 1.6, 180, 0.3);
    grain(c, 12, 3);
    // formwork seams + tie holes
    hline(c, 0, 190, 0.7, 2); hline(c, 2, 255, 0.5, 1); vline(c, 0, 196, 0.6, 2);
    for (const [x, y] of [[32, 32], [160, 32], [32, 160], [160, 160]]) { c.fillStyle = g(170, 0.6); c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); }
  },
  brick(c, r) {
    fill(c, D, 178);
    const h = 32, w = 64;
    for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
      let v = 214 + r() * 34; if (r() < 0.1) v -= 26;
      bevel(c, x * w + (y % 2) * 32 + 2.5, y * h + 2.5, w - 5, h - 5, v, 18, 34, 2.5, 2);
    }
    specks(c, 300, r, 0.6, 1.4, 160, 0.3);
    grain(c, 12, 4);
  },
  planks(c, r) {
    fill(c, D, 140);
    const n = 6, h = D / n;
    for (let i = 0; i < n; i++) {
      const v = 216 + r() * 30;
      c.fillStyle = g(v); c.fillRect(0, i * h + 1.5, D, h - 3);
      grainLines(c, r, 7, i * h + 3, i * h + h - 3, 120, 0.09, 2);
      hline(c, i * h + 1.5, 255, 0.35, 1.5);
      for (let k = 0; k < 2; k++) { const x = r() * D; c.fillStyle = g(130, 0.85); c.fillRect(x, i * h, 2.5, h); c.fillStyle = g(255, 0.3); c.fillRect(x + 2.5, i * h, 1, h); }
    }
    grain(c, 9, 5);
  },
  siding(c, r) {
    const n = 8, h = D / n;
    for (let i = 0; i < n; i++) {
      const v = 236 + r() * 14;
      const gr = c.createLinearGradient(0, i * h, 0, i * h + h);
      gr.addColorStop(0, g(v - 52)); gr.addColorStop(0.16, g(v - 14)); gr.addColorStop(0.5, g(v)); gr.addColorStop(1, g(v + 6));
      c.fillStyle = gr; c.fillRect(0, i * h, D, h);
      hline(c, i * h + h - 1.5, 150, 0.7, 1.5);
      grainLines(c, r, 3, i * h + 6, i * h + h - 3, 150, 0.05, 1);
    }
    grain(c, 7, 6);
  },
  wood(c, r) {
    fill(c, D, 228);
    grainLines(c, r, 46, 0, D, 110, 0.1, 5);
    for (let i = 0; i < 3; i++) {
      const x = r() * D, y = r() * D;
      wrap(x, y, 12, (px, py) => { c.strokeStyle = g(120, 0.25); c.lineWidth = 1.2; for (let k = 1; k < 4; k++) { c.beginPath(); c.ellipse(px, py, k * 3.5, k * 1.6, 0, 0, 7); c.stroke(); } });
    }
    grain(c, 8, 7);
  },
  logs(c, r) {
    const n = 5, h = D / n;
    for (let i = 0; i < n; i++) {
      const gr = c.createLinearGradient(0, i * h, 0, i * h + h);
      gr.addColorStop(0, g(96)); gr.addColorStop(0.1, g(190)); gr.addColorStop(0.36, g(250)); gr.addColorStop(0.7, g(222)); gr.addColorStop(0.92, g(160)); gr.addColorStop(1, g(92));
      c.fillStyle = gr; c.fillRect(0, i * h, D, h);
      grainLines(c, r, 8, i * h + 5, i * h + h - 5, 110, 0.1, 2);
      for (let k = 0; k < 2; k++) { const x = r() * D, y = i * h + h * (0.3 + r() * 0.4); wrap(x, y, 6, (px, py) => { c.fillStyle = g(130, 0.35); c.beginPath(); c.ellipse(px, py, 5, 2.5, 0, 0, 7); c.fill(); }); }
    }
    grain(c, 9, 8);
  },
  metal(c, r) {
    fill(c, D, 228);
    for (let y = 0; y < D; y += 1) { c.fillStyle = g(r() < 0.5 ? 255 : 196, 0.05 + r() * 0.05); c.fillRect(0, y, D, 1); }
    blotches(c, 10, r, 20, 60, 255, 205, 0.04, 0.1);
    hline(c, 0, 150, 0.7, 2); hline(c, 2, 255, 0.5, 1.5); vline(c, 0, 165, 0.6, 2); vline(c, 2, 255, 0.4, 1);
    for (let x = 16; x < D; x += 32) { c.fillStyle = g(255, 0.8); c.beginPath(); c.arc(x - 0.6, 8.4, 2.2, 0, 7); c.fill(); c.fillStyle = g(150, 0.7); c.beginPath(); c.arc(x + 0.6, 9.6, 2.2, 0, 7); c.fill(); c.fillStyle = g(225); c.beginPath(); c.arc(x, 9, 1.8, 0, 7); c.fill(); }
    grain(c, 6, 9);
  },
  metalfloor(c, r) {
    fill(c, D, 206);
    const s = 32;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const cx = x * s + s / 2, cy = y * s + s / 2, a = (x + y) % 2 ? 0.75 : -0.75;
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.fillStyle = g(130, 0.55); c.beginPath(); c.roundRect(-9 + 1.2, -2.6 + 1.2, 18, 5.2, 2.6); c.fill();
      c.fillStyle = g(250, 0.9); c.beginPath(); c.roundRect(-9, -2.6, 18, 5.2, 2.6); c.fill();
      c.fillStyle = g(222); c.beginPath(); c.roundRect(-8, -1.4, 16.4, 3.4, 1.8); c.fill();
      c.restore();
    }
    blotches(c, 12, r, 20, 60, 255, 170, 0.04, 0.1);
    grain(c, 10, 10);
  },
  corrugated(c, r) {
    const n = 16, w = D / n;
    for (let i = 0; i < n; i++) {
      const gr = c.createLinearGradient(i * w, 0, i * w + w, 0);
      gr.addColorStop(0, g(170)); gr.addColorStop(0.28, g(238)); gr.addColorStop(0.5, g(254)); gr.addColorStop(0.78, g(216)); gr.addColorStop(1, g(170));
      c.fillStyle = gr; c.fillRect(i * w, 0, w, D);
    }
    // weathering streaks running down from the top
    for (let i = 0; i < 16; i++) {
      const x = r() * D, len = 40 + r() * 160, wd = 3 + r() * 8;
      const gr = c.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, g(120, 0.14)); gr.addColorStop(1, g(120, 0));
      c.fillStyle = gr; c.fillRect(x, 0, wd, len);
    }
    hline(c, D - 2, 140, 0.6, 2);
    grain(c, 7, 11);
  },
  container(c, r) {
    const n = 10, w = D / n;
    for (let i = 0; i < n; i++) {
      const x = i * w;
      c.fillStyle = g(244); c.fillRect(x, 0, w * 0.42, D);
      c.fillStyle = g(198); c.fillRect(x + w * 0.42, 0, w * 0.1, D);
      c.fillStyle = g(222); c.fillRect(x + w * 0.52, 0, w * 0.38, D);
      c.fillStyle = g(252); c.fillRect(x + w * 0.9, 0, w * 0.1, D);
    }
    blotches(c, 20, r, 8, 30, 120, 120, 0.04, 0.1);
    for (let i = 0; i < 10; i++) { const x = r() * D, len = 30 + r() * 120; const gr = c.createLinearGradient(0, D - len, 0, D); gr.addColorStop(0, g(110, 0)); gr.addColorStop(1, g(110, 0.16)); c.fillStyle = gr; c.fillRect(x, D - len, 4 + r() * 6, len); }
    grain(c, 8, 12);
  },
  roof(c, r) {
    // shingles: rows run along u, the exposed edge is at the bottom of each row
    fill(c, D, 120);
    const rows = 8, h = D / rows, w = 32;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) {
      const v = 212 + r() * 36, px = x * w + (y % 2) * 16 + (r() - 0.5) * 3, py = y * h;
      const gr = c.createLinearGradient(0, py, 0, py + h);
      gr.addColorStop(0, g(v - 34)); gr.addColorStop(0.35, g(v)); gr.addColorStop(1, g(v + 8));
      c.fillStyle = gr; c.beginPath(); c.roundRect(px + 1.2, py, w - 2.4, h - 2, [0, 0, 6, 6]); c.fill();
      c.fillStyle = g(255, 0.35); c.fillRect(px + 3, py + h - 5, w - 6, 1.5);
    }
    grain(c, 10, 13);
  },
  rooftile(c, r) {
    const cols = 8, rows = 4, w = D / cols, h = D / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = 214 + r() * 34, px = x * w, py = y * h;
      const gr = c.createLinearGradient(px, 0, px + w, 0);
      gr.addColorStop(0, g(v - 70)); gr.addColorStop(0.3, g(v)); gr.addColorStop(0.5, g(v + 14)); gr.addColorStop(0.8, g(v - 20)); gr.addColorStop(1, g(v - 70));
      c.fillStyle = gr; c.fillRect(px, py, w, h);
      const sh = c.createLinearGradient(0, py, 0, py + 12);
      sh.addColorStop(0, g(60, 0.55)); sh.addColorStop(1, g(60, 0));
      c.fillStyle = sh; c.fillRect(px, py, w, 12);
    }
    grain(c, 10, 14);
  },
  roofflat(c, r) {
    fill(c, D, 226); grain(c, 30, 15);
    specks(c, 700, r, 0.6, 1.6, 170, 0.35, 255);
    blotches(c, 8, r, 20, 60, 190, 190, 0.05, 0.12);
    for (const y of [0, 128]) { hline(c, y, 252, 0.8, 3); hline(c, y + 3, 170, 0.5, 1); }
  },
  tile(c, r) {
    fill(c, D, 172);
    const n = 4, s = D / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) bevel(c, x * s + 2, y * s + 2, s - 4, s - 4, 234 + r() * 16, 14, 20, 2.5, 3);
    const gr = c.createLinearGradient(0, 0, D, D);
    gr.addColorStop(0, g(255, 0)); gr.addColorStop(0.45, g(255, 0.12)); gr.addColorStop(0.55, g(255, 0)); gr.addColorStop(1, g(255, 0));
    c.fillStyle = gr; c.fillRect(0, 0, D, D);
    grain(c, 5, 16);
  },
  cobble(c, r) {
    fill(c, D, 128);
    const n = 6, s = D / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 196 + r() * 50;
      const w = s * (0.78 + r() * 0.14), h = s * (0.74 + r() * 0.14);
      const cx = x * s + s / 2 + (y % 2) * s / 2 + (r() - 0.5) * 4, cy = y * s + s / 2 + (r() - 0.5) * 4;
      wrap(cx, cy, s, (px, py) => {
        c.fillStyle = g(v - 40); c.beginPath(); c.roundRect(px - w / 2 + 1.5, py - h / 2 + 2, w, h, 12); c.fill();
        c.fillStyle = g(v); c.beginPath(); c.roundRect(px - w / 2, py - h / 2, w, h, 12); c.fill();
        c.fillStyle = g(255, 0.3); c.beginPath(); c.roundRect(px - w / 2 + 4, py - h / 2 + 3, w * 0.6, h * 0.25, 6); c.fill();
      });
    }
    grain(c, 12, 17);
  },
  stone(c, r) {
    fill(c, D, 150);
    const rows = 5, h = D / rows;
    for (let y = 0; y < rows; y++) {
      let x = (r() * 30) | 0; const x0 = x;
      while (x < x0 + D) {
        const w = Math.min(x0 + D - x, 40 + r() * 52);
        const v = 196 + r() * 46;
        for (const px of [x, x - D]) if (px + w > 0 && px < D) bevel(c, px + 2.5, y * h + 2.5, w - 5, h - 5, v, 22, 36, 3, 7);
        x += w;
      }
    }
    specks(c, 260, r, 0.6, 1.5, 150, 0.3);
    grain(c, 12, 18);
  },
  panel(c, r) {
    fill(c, D, 238);
    const s = D / 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = g(252, 0.6); c.fillRect(x * s + 10, y * s + 10, s - 20, 2);
      c.fillStyle = g(214, 0.6); c.fillRect(x * s + 10, y * s + s - 12, s - 20, 2);
      for (const [bx, by] of [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]]) {
        c.fillStyle = g(160, 0.8); c.beginPath(); c.arc(x * s + bx + 0.6, y * s + by + 0.6, 2.6, 0, 7); c.fill();
        c.fillStyle = g(250); c.beginPath(); c.arc(x * s + bx, y * s + by, 2.2, 0, 7); c.fill();
      }
    }
    for (const p of [0, s]) { hline(c, p, 150, 0.8, 2); hline(c, p + 2, 255, 0.7, 1); vline(c, p, 160, 0.8, 2); vline(c, p + 2, 255, 0.6, 1); }
    blotches(c, 10, r, 20, 60, 255, 215, 0.04, 0.08);
    grain(c, 5, 19);
  },
  adobe(c, r) {
    fill(c, D, 240); blotches(c, 40, r, 12, 56, 255, 200, 0.05, 0.13);
    cracks(c, r, 5, 150, 0.28, 1, 4);
    c.strokeStyle = g(190, 0.3); c.lineWidth = 1;
    for (let i = 0; i < 70; i++) { const x = r() * D, y = r() * D, a = r() * 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); c.stroke(); }
    grain(c, 14, 20);
  },
  asphalt(c, r) {
    fill(c, D, 214); grain(c, 44, 21);
    specks(c, 900, r, 0.5, 1.4, 250, 0.35, 120);
    blotches(c, 10, r, 20, 60, 190, 190, 0.06, 0.14);
    c.fillStyle = g(198, 0.7); c.beginPath(); c.roundRect(150, 60, 70, 48, 6); c.fill();
    c.strokeStyle = g(150, 0.5); c.lineWidth = 1.5; c.stroke();
    cracks(c, r, 4, 100, 0.55, 1.4, 6);
  },
  paint(c) { fill(c, D, 246); grain(c, 6, 22); },
  trim(c) { fill(c, D, 248); grain(c, 5, 23); },
  fence(c, r) {
    fill(c, D, 110);
    const n = 8, w = D / n;
    for (let i = 0; i < n; i++) {
      const v = 220 + r() * 28;
      c.fillStyle = g(v); c.fillRect(i * w + 2, 0, w - 4, D);
      c.fillStyle = g(255, 0.3); c.fillRect(i * w + 2, 0, 1.5, D);
      c.strokeStyle = g(120, 0.08); c.lineWidth = 1;
      for (let k = 0; k < 4; k++) { const x = i * w + 4 + r() * (w - 8); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 4, D); c.stroke(); }
      for (const y of [40, 216]) { c.fillStyle = g(120, 0.7); c.beginPath(); c.arc(i * w + w / 2, y, 1.8, 0, 7); c.fill(); }
    }
    grain(c, 8, 24);
  },
  door(c) {
    fill(c, D, 238);
    const panel = (x, y, w, h) => {
      c.fillStyle = g(205); c.fillRect(x, y, w, h);
      c.fillStyle = g(250); c.fillRect(x + 6, y + 6, w - 12, h - 12);
      c.fillStyle = g(255, 0.8); c.fillRect(x, y, w, 2); c.fillRect(x, y, 2, h);
      c.fillStyle = g(170, 0.8); c.fillRect(x, y + h - 2, w, 2); c.fillRect(x + w - 2, y, 2, h);
    };
    panel(D * 0.16, D * 0.08, D * 0.68, D * 0.38);
    panel(D * 0.16, D * 0.54, D * 0.68, D * 0.38);
    grain(c, 8, 25);
  },
  carpet(c, r) {
    fill(c, D, 236); grain(c, 26, 26);
    c.strokeStyle = g(200, 0.08); c.lineWidth = 2;
    for (let i = -D; i < D * 2; i += 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + D, D); c.stroke(); }
    blotches(c, 8, r, 20, 60, 255, 210, 0.04, 0.08);
  },
  ceiling(c, r) {
    fill(c, D, 246);
    specks(c, 900, r, 0.4, 1.0, 200, 0.4);
    for (let p = 0; p < D; p += 64) { hline(c, p, 200, 0.8, 2); vline(c, p, 200, 0.8, 2); }
    grain(c, 6, 27);
  },
  // ground textures (grayscale, tinted per vertex by the theme ground color)
  grass(c, r) {
    fill(c, D, 224);
    blotches(c, 34, r, 14, 50, 255, 172, 0.08, 0.18);
    c.lineWidth = 1.2; c.lineCap = 'round';
    for (let i = 0; i < 3600; i++) {
      const v = 150 + r() * 105, x = r() * D, y = r() * D, l = 2.5 + r() * 5, a = (r() - 0.5) * 0.8;
      c.strokeStyle = g(v, 0.5); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); c.stroke();
    }
    grain(c, 10, 28);
  },
  sand(c, r) {
    fill(c, D, 240);
    c.lineWidth = 2;
    for (let y = 0; y < D; y += 16) {
      const ph = r() * 6;
      for (const [dy, v, a] of [[0, 255, 0.4], [3, 196, 0.22]]) {
        c.strokeStyle = g(v, a); c.beginPath();
        for (let x = 0; x <= D; x += 8) { const yy = y + dy + Math.sin((x / D) * Math.PI * 4 + ph) * 3; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); }
        c.stroke();
      }
    }
    blotches(c, 18, r, 20, 60, 255, 205, 0.05, 0.1);
    specks(c, 120, r, 0.8, 1.8, 170, 0.4);
    grain(c, 12, 29);
  },
  snow(c, r) {
    fill(c, D, 250); blotches(c, 30, r, 16, 60, 255, 226, 0.08, 0.16);
    specks(c, 400, r, 0.5, 1.1, 255, 0.9);
    grain(c, 6, 30);
  },
  dirt(c, r) {
    fill(c, D, 230); grain(c, 22, 31);
    blotches(c, 28, r, 10, 40, 255, 190, 0.06, 0.14);
    for (let i = 0; i < 110; i++) {
      const x = r() * D, y = r() * D, rad = 1.5 + r() * 3.5, v = 190 + r() * 55;
      wrap(x, y, rad + 2, (px, py) => {
        c.fillStyle = g(120, 0.35); c.beginPath(); c.ellipse(px + 0.8, py + 1, rad, rad * 0.75, 0, 0, 7); c.fill();
        c.fillStyle = g(v); c.beginPath(); c.ellipse(px, py, rad, rad * 0.75, 0, 0, 7); c.fill();
      });
    }
  },
  ice(c, r) {
    fill(c, D, 242);
    for (let i = 0; i < 14; i++) { const x = r() * D; const gr = c.createLinearGradient(x, 0, x + 60, D); gr.addColorStop(0, g(255, 0)); gr.addColorStop(0.5, g(255, 0.35)); gr.addColorStop(1, g(255, 0)); c.fillStyle = gr; c.fillRect(0, 0, D, D); }
    cracks(c, r, 7, 190, 0.35, 1.2, 6);
    cracks(c, r, 7, 255, 0.9, 1.2, 6);
    grain(c, 6, 32);
  },
  water(c, r) {
    fill(c, D, 232);
    c.lineWidth = 1.6; c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = r() * D, y = r() * D, l = 6 + r() * 16;
      wrap(x, y, l, (px, py) => { c.strokeStyle = g(255, 0.55); c.beginPath(); c.arc(px, py, l, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.strokeStyle = g(196, 0.25); c.beginPath(); c.arc(px, py + 2.5, l, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); });
    }
    grain(c, 4, 33);
  },
};

export function tex(name, repeat = true) {
  if (cache.has(name)) return cache.get(name);
  const gen = GEN[name];
  if (!gen) return null;
  const c = canvas();
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.scale(c.width / D, c.height / D);
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  gen(ctx, rng(seed));
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  cache.set(name, t);
  return t;
}

// meters covered by one texture repeat
export const TEX_SCALE = {
  plaster: 3, stucco: 2.5, concrete: 4, brick: 2.4, planks: 2.4, siding: 2.4, wood: 2, logs: 1.8, metal: 2, metalfloor: 2, corrugated: 3,
  container: 2.4, roof: 2.5, rooftile: 2.4, roofflat: 3, tile: 2, cobble: 3, stone: 2.5, panel: 2.5, adobe: 3, asphalt: 6, paint: 2,
  trim: 2, fence: 2.4, door: 1, carpet: 2, ceiling: 2.4, grass: 5, sand: 6, snow: 6, dirt: 5, ice: 6, water: 8,
};

// soft round contact-shadow blob (alpha in the texture)
export function blobTexture() {
  if (cache.has('blob')) return cache.get('blob');
  const c = canvas(64);
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cache.set('blob', t);
  return t;
}

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
