// Procedural sound effects + light menu music using WebAudio (no audio files).
import { settings, onSettings } from './settings.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.musicOn = false;
    this.lastPlay = new Map();
    this.env = { kind: 'outdoor', wet: 1 };
    this.intensity = 0;
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
    // shared reverb bus: gunshots, pops and far-away sounds ring out through it
    this.reverbIn = c.createGain();
    this.reverb = c.createConvolver();
    this.reverbOut = c.createGain();
    this.reverbOut.gain.value = 0.6;
    this.reverbIn.connect(this.reverb).connect(this.reverbOut).connect(this.sfxGain);
    this.setEnvironment(this.env.kind);
    this.applyVolumes();
    onSettings(() => this.applyVolumes());
  }

  // generated stereo impulse response (no audio files)
  impulse(seconds, decay) {
    const c = this.ctx, rate = c.sampleRate, len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // indoor maps (the mall) ring longer; open maps get a short outdoor slap
  setEnvironment(kind) {
    this.env.kind = kind;
    if (!this.ctx) return;
    const indoor = kind === 'indoor';
    this.reverb.buffer = this.impulse(indoor ? 2.4 : 1.4, indoor ? 2.4 : 3.4);
    this.env.wet = indoor ? 1.8 : 1;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.sfxGain.gain.value = settings.sfx;
    this.musicGain.gain.value = settings.music * 0.5;
  }

  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  // --- building blocks -----------------------------------------------------
  // per-sound output: volume, distance muffling, stereo pan and a reverb send
  out(vol, pan, o = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    let node = g;
    if (o.dist > 12) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(900, 16000 - o.dist * 240);
      node.connect(f); node = f;
    }
    if (pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p); node = p;
    }
    node.connect(this.sfxGain);
    const wet = ((o.wet || 0) + Math.min(0.3, (o.dist || 0) / 150)) * this.env.wet;
    if (wet > 0.01 && this.reverbIn) {
      const send = c.createGain();
      send.gain.value = Math.min(1, wet);
      g.connect(send).connect(this.reverbIn);
    }
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
    if (!pos) return { vol: 1, pan: 0, dist: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dz = pos.z - L.z, dy = (pos.y || 0) - L.y;
    const dist = Math.hypot(dx, dy, dz);
    const att = Math.max(0, 1 - dist / maxDist);
    // listener right vector for yaw (yaw 0 faces -Z): right = (cos yaw, -sin yaw)
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = dist > 0.5 ? (dx * rx + dz * rz) / dist : 0;
    return { vol: att * att, pan: pan * 0.8, dist };
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
    if (this.lastPlay.size > 300) for (const [k, t] of this.lastPlay) if (now - t > 1000) this.lastPlay.delete(k); // keys include positions
    const sp = this.spatial(opts.pos, opts.maxDist || 70);
    const vol = (opts.vol ?? 1) * sp.vol;
    if (vol < 0.01) return;
    const dest = this.out(vol, sp.pan, { dist: sp.dist, wet: WET[name] });
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
    this.stopMatchMusic();
  }

  // --- match music: a light procedural groove per mode -------------------------
  // intensity (0..1) brings in the hats, snare and lead when things get tense
  startMatchMusic(mode) {
    if (!this.ctx) return;
    this.stopMatchMusic();
    const st = MATCH_STYLE[mode] || MATCH_STYLE.tag;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const step = 60 / st.bpm / 4; // 16th notes
    let i = 0;
    let next = this.ctx.currentTime + 0.15;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.55;
    bus.connect(this.musicGain);
    this.matchBus = bus;
    const tick = () => {
      if (this.matchBus !== bus) return;
      const c = this.ctx;
      while (next < c.currentTime + 0.25) {
        const t = next, s16 = i % 16, bar = Math.floor(i / 16);
        const root = st.roots[bar % st.roots.length];
        const hot = this.intensity;
        if (st.kick.includes(s16)) { this.osc(bus, 'sine', 140, 42, t, 0.16, 0.55); }
        if (s16 === 4 || s16 === 12) { if (hot > 0.3 || st.snare) this.noiseBurst(bus, t, 0.12, 0.16 + hot * 0.12, 'bandpass', 1800, 900, 0.7); }
        if (s16 % 2 === 0 && (hot > 0.15 || st.hats)) this.noiseBurst(bus, t, 0.03, 0.06 + hot * 0.05, 'highpass', 7000);
        if (st.bass.includes(s16)) this.osc(bus, st.bassWave, midi(root - 24), null, t, step * 1.8, 0.16, 0.01);
        const n = st.lead[i % st.lead.length];
        if (n !== null && (hot > 0.5 || st.leadAlways) && s16 % 2 === 0) this.osc(bus, 'triangle', midi(root + n), null, t, step * 1.6, 0.035 + hot * 0.025, 0.01);
        if (st.tick && s16 % 4 === 0) this.osc(bus, 'square', 2200, null, t, 0.015, 0.03 + hot * 0.05);
        next += step;
        i++;
      }
      this.matchTimer = setTimeout(tick, 80);
    };
    tick();
  }

  stopMatchMusic() {
    clearTimeout(this.matchTimer);
    if (this.matchBus) {
      const b = this.matchBus;
      this.matchBus = null;
      try { b.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3); setTimeout(() => b.disconnect(), 1500); } catch { /* ignore */ }
    }
  }

  setIntensity(x) { this.intensity = Math.max(0, Math.min(1, x)); }
}

// per-mode groove: tempo, kick pattern (16ths), bass hits, root notes per bar, lead motif
const MATCH_STYLE = {
  tag: { bpm: 128, kick: [0, 6, 8, 14], bass: [0, 3, 8, 11], roots: [60, 60, 65, 67], lead: [12, null, 7, null, 9, null, 7, 4], bassWave: 'triangle', hats: true },
  hotpotato: { bpm: 118, kick: [0, 8], bass: [0, 6, 8], roots: [57, 57, 53, 55], lead: [12, 11, 12, null, 7, null, 8, null], bassWave: 'square', tick: true },
  grab: { bpm: 124, kick: [0, 4, 8, 12], bass: [0, 7, 10], roots: [62, 62, 67, 69], lead: [7, 9, 12, null, 14, 12, 9, null], bassWave: 'triangle', hats: true },
  guns: { bpm: 96, kick: [0, 10], bass: [0, 3], roots: [57, 57, 55, 53], lead: [12, null, null, 15, null, null, 14, null], bassWave: 'sawtooth' },
  craft: { bpm: 92, kick: [0, 10], bass: [0, 7], roots: [55, 55, 58, 53], lead: [12, null, 10, null, 7, null, 10, null], bassWave: 'sawtooth' },
};

// how much of each sound goes to the reverb (echo)
const WET = { shot: 0.35, pop: 0.6, boing: 0.15, punch: 0.1, door: 0.25, elim: 0.2, win: 0.3, tagged: 0.15, squeak: 0.15, heartbeat: 0 };

// layered gunshots: crack (transient) + body + low punch + tail, and the action
// sound (pump, bolt, hammer) for your own gun
const GUN = {
  pistol: { crack: 4200, body: 1500, dur: 0.12, thump: 160, vol: 0.6 },
  revolver: { crack: 3600, body: 1100, dur: 0.22, thump: 110, vol: 0.8, mech: 'hammer' },
  smg: { crack: 5200, body: 1900, dur: 0.07, thump: 190, vol: 0.42 },
  shotgun: { crack: 2600, body: 750, dur: 0.32, thump: 85, vol: 0.95, mech: 'pump' },
  rifle: { crack: 3900, body: 1300, dur: 0.11, thump: 135, vol: 0.62 },
  sniper: { crack: 3000, body: 900, dur: 0.42, thump: 70, vol: 1.0, mech: 'bolt' },
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
      a.osc(d, 'sawtooth', 1600, 160, t, 0.2, 0.45);
      a.osc(d, 'square', 900, 120, t, 0.15, 0.2);
      a.osc(d, 'sine', 220, 60, t, 0.22, 0.5);
      a.noiseBurst(d, t, 0.12, 0.2, 'highpass', 6000);
      return;
    }
    const g = GUN[o.w] || GUN.pistol;
    a.noiseBurst(d, t, 0.025, g.vol, 'highpass', g.crack);
    a.noiseBurst(d, t, g.dur, g.vol * 0.9, 'bandpass', g.body * 1.6, g.body * 0.45, 0.9);
    a.osc(d, 'sine', g.thump * 1.8, g.thump * 0.4, t, g.dur + 0.06, g.vol);
    a.noiseBurst(d, t + 0.015, g.dur * 2.4, g.vol * 0.3, 'lowpass', 900, 140);
    if (!o.pos) {
      const click = (dt, f, v = 0.3) => a.noiseBurst(d, t + dt, 0.045, v, 'bandpass', f, null, 3);
      if (g.mech === 'pump') { click(0.32, 1500, 0.35); click(0.46, 1000, 0.4); }
      if (g.mech === 'bolt') { click(0.55, 2200); click(0.7, 1400, 0.35); click(0.86, 2600, 0.25); }
      if (g.mech === 'hammer') click(0.24, 3200, 0.2);
    }
  },
  heartbeat: (a, d, t, o) => {
    const v = o.v ?? 0.6;
    a.osc(d, 'sine', 70, 45, t, 0.14, v);
    a.osc(d, 'sine', 64, 40, t + 0.2, 0.16, v * 0.75);
  },
  warn: (a, d, t) => { a.osc(d, 'square', 880, null, t, 0.06, 0.12); a.osc(d, 'square', 880, null, t + 0.12, 0.06, 0.12); },
  streak: (a, d, t, o) => { const n = Math.min(5, o.n || 2); for (let i = 0; i < n; i++) a.osc(d, 'triangle', 660 * Math.pow(1.122, i * 2), null, t + i * 0.07, 0.18, 0.3); },
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
