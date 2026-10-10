// Procedural sound effects + light menu music using WebAudio (no audio files).
import { settings, onSettings } from './settings.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.musicOn = false;
    this.lastPlay = new Map();
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.sfxGain = c.createGain(); this.sfxGain.connect(this.master);
    this.musicGain = c.createGain(); this.musicGain.connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    onSettings(() => this.applyVolumes());
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.sfxGain.gain.value = settings.sfx;
    this.musicGain.gain.value = settings.music * 0.5;
  }

  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  // --- building blocks -----------------------------------------------------
  out(vol, pan) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    if (pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfxGain);
    } else g.connect(this.sfxGain);
    return g;
  }

  osc(dest, type, f0, f1, t0, dur, vol = 1, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  noiseBurst(dest, t0, dur, vol, filterType = 'lowpass', f0 = 2000, f1 = null, q = 0.8) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter();
    f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  spatial(pos, maxDist = 60) {
    if (!pos) return { vol: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dz = pos.z - L.z, dy = (pos.y || 0) - L.y;
    const dist = Math.hypot(dx, dy, dz);
    const att = Math.max(0, 1 - dist / maxDist);
    // listener right vector for yaw (yaw 0 faces -Z): right = (cos yaw, -sin yaw)
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = dist > 0.5 ? (dx * rx + dz * rz) / dist : 0;
    return { vol: att * att, pan: pan * 0.8 };
  }

  // --- public ----------------------------------------------------------------
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    // throttle identical sounds firing within 25ms
    const now = performance.now();
    const key = name + (opts.pos ? Math.round(opts.pos.x) + ',' + Math.round(opts.pos.z) : '');
    if (now - (this.lastPlay.get(key) || 0) < 25) return;
    this.lastPlay.set(key, now);
    const sp = this.spatial(opts.pos, opts.maxDist || 70);
    const vol = (opts.vol ?? 1) * sp.vol;
    if (vol < 0.01) return;
    const dest = this.out(vol, sp.pan);
    try { fn(this, dest, this.ctx.currentTime + 0.005, opts); } catch (e) { /* ignore audio glitches */ }
  }

  // --- menu music: gentle chord loop -----------------------------------------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [65, 69, 72, 76], [67, 71, 74, 77]];
    const beat = 0.5;
    let step = 0;
    let next = this.ctx.currentTime + 0.1;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const tick = () => {
      if (!this.musicOn) return;
      const c = this.ctx;
      while (next < c.currentTime + 0.3) {
        const chord = chords[Math.floor(step / 8) % chords.length];
        const t = next;
        if (step % 8 === 0) {
          for (const n of chord) {
            const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
            const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 8);
            o.connect(g).connect(this.musicGain); o.start(t); o.stop(t + beat * 8 + 0.1);
          }
          this.osc(this.musicGain, 'sine', midi(chord[0] - 24), null, t, beat * 3.5, 0.18, 0.02);
        }
        if (step % 8 === 4) this.osc(this.musicGain, 'sine', midi(chord[0] - 24 + 7), null, t, beat * 3.5, 0.12, 0.02);
        // sparkle arpeggio
        if (step % 2 === 1) this.osc(this.musicGain, 'sine', midi(chord[(step >> 1) % 4] + 12), null, t, 0.35, 0.03, 0.01);
        next += beat;
        step++;
      }
      this.musicTimer = setTimeout(tick, 100);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }
}

const GUN = {
  pistol: { dur: 0.16, f: 3200, thump: 150, vol: 0.55 },
  revolver: { dur: 0.28, f: 2400, thump: 110, vol: 0.75 },
  smg: { dur: 0.09, f: 3800, thump: 170, vol: 0.4 },
  shotgun: { dur: 0.38, f: 1700, thump: 90, vol: 0.9 },
  rifle: { dur: 0.13, f: 2600, thump: 130, vol: 0.55 },
  sniper: { dur: 0.6, f: 2200, thump: 80, vol: 0.95 },
};

const SOUNDS = {
  click: (a, d, t) => a.osc(d, 'sine', 900, 600, t, 0.06, 0.25),
  hover: (a, d, t) => a.osc(d, 'sine', 1400, null, t, 0.025, 0.06),
  step: (a, d, t, o) => a.noiseBurst(d, t, 0.07, 0.22 * (o.soft ? 0.6 : 1), 'lowpass', o.surface === 'snow' ? 700 : o.surface === 'metal' ? 2600 : 1200),
  jump: (a, d, t) => { a.noiseBurst(d, t, 0.08, 0.15, 'lowpass', 900); a.osc(d, 'sine', 260, 420, t, 0.1, 0.08); },
  land: (a, d, t, o) => a.noiseBurst(d, t, 0.12, 0.35 * Math.min(1, (o.impact || 8) / 12), 'lowpass', 500),
  whoosh: (a, d, t) => a.noiseBurst(d, t, 0.16, 0.35, 'bandpass', 500, 1800, 1.5),
  punch: (a, d, t) => { a.osc(d, 'sine', 180, 55, t, 0.16, 0.9); a.noiseBurst(d, t, 0.06, 0.5, 'lowpass', 2500); },
  boing: (a, d, t) => {
    const o = a.osc(d, 'sine', 220, null, t, 0.45, 0.6);
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.12); o.frequency.exponentialRampToValueAtTime(330, t + 0.4);
  },
  tagged: (a, d, t) => { a.osc(d, 'square', 520, 260, t, 0.25, 0.25); a.osc(d, 'square', 390, 195, t + 0.12, 0.3, 0.25); },
  pass: (a, d, t) => { a.osc(d, 'sine', 700, 220, t, 0.12, 0.6); a.noiseBurst(d, t, 0.05, 0.3, 'highpass', 2000); },
  pop: (a, d, t) => {
    a.noiseBurst(d, t, 0.6, 1.0, 'lowpass', 3000, 200);
    a.osc(d, 'sine', 90, 30, t, 0.6, 1.0);
    a.osc(d, 'square', 1200, 2400, t + 0.05, 0.18, 0.15);
    a.osc(d, 'sine', 1800, 900, t + 0.2, 0.25, 0.2);
  },
  fuse: (a, d, t) => a.osc(d, 'square', 1600, null, t, 0.02, 0.12),
  pickup: (a, d, t) => { a.osc(d, 'triangle', 660, null, t, 0.09, 0.4); a.osc(d, 'triangle', 990, null, t + 0.07, 0.14, 0.4); },
  squeak: (a, d, t) => {
    const o = a.osc(d, 'square', 900, null, t, 0.35, 0.18);
    o.frequency.setValueAtTime(900, t); o.frequency.linearRampToValueAtTime(1500, t + 0.1); o.frequency.linearRampToValueAtTime(700, t + 0.33);
  },
  door: (a, d, t) => { a.osc(d, 'sawtooth', 140, 90, t, 0.35, 0.12, 0.03); a.noiseBurst(d, t + 0.25, 0.1, 0.3, 'lowpass', 600); },
  rustle: (a, d, t) => { for (let i = 0; i < 4; i++) a.noiseBurst(d, t + i * 0.13, 0.1, 0.18, 'bandpass', 2500, 1500, 1); },
  open: (a, d, t) => { a.noiseBurst(d, t, 0.15, 0.4, 'lowpass', 900); a.osc(d, 'triangle', 520, 780, t + 0.05, 0.15, 0.3); },
  craft: (a, d, t) => { for (let i = 0; i < 3; i++) { a.noiseBurst(d, t + i * 0.12, 0.08, 0.5, 'bandpass', 3200, null, 4); a.osc(d, 'triangle', 820 + i * 60, null, t + i * 0.12, 0.12, 0.2); } a.osc(d, 'triangle', 1320, null, t + 0.4, 0.3, 0.3); },
  harvest: (a, d, t) => { a.noiseBurst(d, t, 0.1, 0.4, 'lowpass', 1200); a.osc(d, 'sine', 300, 200, t, 0.1, 0.3); },
  shot: (a, d, t, o) => {
    if (o.w === 'blaster') {
      a.osc(d, 'sawtooth', 1400, 180, t, 0.18, 0.45);
      a.osc(d, 'square', 900, 120, t, 0.15, 0.2);
      return;
    }
    const g = GUN[o.w] || GUN.pistol;
    a.noiseBurst(d, t, g.dur, g.vol, 'lowpass', g.f, 300);
    a.noiseBurst(d, t, 0.03, g.vol * 0.8, 'highpass', 3000);
    a.osc(d, 'sine', g.thump, 35, t, g.dur * 0.9, g.vol);
  },
  reload: (a, d, t, o) => {
    const ms = (o.ms || 1500) / 1000;
    a.noiseBurst(d, t + 0.05, 0.05, 0.4, 'bandpass', 4000, null, 3);
    a.noiseBurst(d, t + ms * 0.45, 0.06, 0.4, 'bandpass', 2500, null, 3);
    a.noiseBurst(d, t + ms * 0.85, 0.07, 0.5, 'bandpass', 3500, null, 3);
  },
  dry: (a, d, t) => a.noiseBurst(d, t, 0.03, 0.4, 'bandpass', 5000, null, 4),
  hit: (a, d, t) => a.osc(d, 'triangle', 2200, null, t, 0.05, 0.35),
  head: (a, d, t) => { a.osc(d, 'sine', 1900, null, t, 0.25, 0.45); a.osc(d, 'sine', 2850, null, t, 0.2, 0.2); },
  kill: (a, d, t) => { a.osc(d, 'triangle', 880, null, t, 0.1, 0.4); a.osc(d, 'triangle', 1320, null, t + 0.08, 0.2, 0.4); },
  hurt: (a, d, t) => { a.osc(d, 'sine', 240, 120, t, 0.18, 0.5); a.noiseBurst(d, t, 0.08, 0.3, 'lowpass', 900); },
  elim: (a, d, t) => a.osc(d, 'triangle', 600, 150, t, 0.4, 0.4),
  heal: (a, d, t) => { a.osc(d, 'sine', 500, 1000, t, 0.4, 0.3); a.osc(d, 'sine', 750, 1500, t + 0.1, 0.4, 0.2); },
  beep: (a, d, t) => a.osc(d, 'square', 660, null, t, 0.12, 0.25),
  go: (a, d, t) => { a.osc(d, 'square', 990, null, t, 0.35, 0.3); a.osc(d, 'square', 1320, null, t, 0.35, 0.15); },
  win: (a, d, t) => { [523, 659, 784, 1047].forEach((f, i) => a.osc(d, 'triangle', f, null, t + i * 0.12, 0.5, 0.45)); a.osc(d, 'triangle', 1568, null, t + 0.5, 0.8, 0.3); },
  lose: (a, d, t) => {
    [392, 370, 349, 330].forEach((f, i) => {
      const o = a.osc(d, 'sawtooth', f, null, t + i * 0.35, i === 3 ? 0.9 : 0.33, 0.18, 0.03);
      if (i === 3) { const lfo = a.ctx.createOscillator(); lfo.frequency.value = 6; const lg = a.ctx.createGain(); lg.gain.value = 8; lfo.connect(lg).connect(o.frequency); lfo.start(t + i * 0.35); lfo.stop(t + 2); }
    });
  },
  tick: (a, d, t) => a.osc(d, 'square', 1200, null, t, 0.02, 0.15),
  reveal: (a, d, t, o) => {
    const base = { common: 440, rare: 523, epic: 587, legendary: 659 }[o.rarity] || 440;
    [1, 1.25, 1.5, 2].forEach((m, i) => a.osc(d, 'triangle', base * m, null, t + i * 0.08, 0.6, 0.35));
    if (o.rarity === 'legendary' || o.rarity === 'epic') for (let i = 0; i < 6; i++) a.osc(d, 'sine', 2000 + Math.random() * 2000, null, t + 0.3 + i * 0.06, 0.15, 0.12);
  },
  chat: (a, d, t) => a.osc(d, 'sine', 1100, 1300, t, 0.07, 0.12),
  invite: (a, d, t) => { a.osc(d, 'triangle', 784, null, t, 0.15, 0.4); a.osc(d, 'triangle', 1047, null, t + 0.15, 0.3, 0.4); },
  error: (a, d, t) => a.osc(d, 'square', 200, 150, t, 0.15, 0.2),
};

export const audio = new AudioEngine();
