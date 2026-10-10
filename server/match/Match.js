// A single match: voting -> loading -> countdown -> playing -> ended.
// The server is authoritative for everything except the moment-to-moment
// position of human players, which is validated (speed, walls, solids).
import crypto from 'node:crypto';
import { getMap, MAP_IDS, mapMeta } from '../../shared/maps/index.js';
import { CollisionWorld, stepBody, lookDir, lineOfSight, rayAABB } from '../../shared/physics.js';
import { MODES, MATCH, PHYS, HP_MAX, NET } from '../../shared/constants.js';
import { WEAPONS, FISTS, HEALS, RECIPE_MAP, RESOURCE_NODES, CONTAINER_SEARCH_TIME, rollTable, itemLabel } from '../../shared/items.js';
import { CONTAINER_DIMS } from '../../shared/mapbuilder.js';
import { shuffle } from '../../shared/rng.js';
import { getNav } from './nav.js';
import { newInventory, heldWeapon, giveItem, dropAll, canAfford, pay, serializeInv, bestHeal } from './inventory.js';
import { createMode } from './modes/index.js';
import { BotBrain, BOT_NAMES } from './bots.js';

const TICK_MS = 1000 / NET.SERVER_TICK_HZ;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

let seq = 1;

export class Match {
  constructor({ mode, practice, humans, services, hub, io, fillBots = true, onFinished }) {
    this.id = 'm' + (seq++) + crypto.randomBytes(3).toString('hex');
    this.modeId = mode;
    this.modeDef = MODES[mode];
    // tests may shorten timings via server config; production uses the defaults
    const cfg = (services && services.config) || {};
    this.cfg = cfg;
    this.duration = (cfg.durations && cfg.durations[mode]) || this.modeDef.duration;
    this.practice = !!practice;
    this.services = services;
    this.hub = hub;
    this.io = io;
    this.onFinished = onFinished;
    this.room = 'match:' + this.id;
    this.players = new Map();
    this.byNum = [];
    this.state = 'voting';
    this.votes = new Map();
    this.createdAt = Date.now();
    this.loot = new Map();
    this.lootSeq = 1;
    this.containers = new Map();
    this.resources = new Map();
    this.doorState = new Map();
    this.timer = null;
    this.ended = false;
    this.killfeed = [];
    this.botNames = shuffle([...BOT_NAMES]);
    for (const h of humans) this.addHuman(h);
    if (fillBots) this.fillBots();
  }

  // ------------------------------------------------------------------ players
  makePlayer(info) {
    const num = this.byNum.length;
    const p = {
      num,
      pid: info.isBot ? 'b' + num : 'u' + info.userId,
      userId: info.userId || null,
      name: info.name,
      isBot: !!info.isBot,
      avatar: info.avatar || { color: '#cccccc', hat: 'none', face: 'happy' },
      skins: info.skins || {},
      partyId: info.partyId || null,
      client: info.client || null,
      connected: !info.isBot,
      ready: !!info.isBot,
      left: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, yaw: 0, pitch: 0, flags: 0,
      alive: true, hp: HP_MAX, armor: 0, lives: 0, eliminatedAt: 0, placement: 0,
      inv: newInventory(),
      stats: { elims: 0, tags: 0, passes: 0, steals: 0, deliveries: 0, crafted: 0, damage: 0, searched: 0, roundsSurvived: 0, punches: 0, itTime: 0, pops: 0, heldTime: 0 },
      cd: { punch: 0, shoot: 0, use: 0, tag: 0 },
      hist: [], tpSeq: 0, lastSt: 0, kbUntil: 0, rtt: 80,
      reloadUntil: 0, reloadSlot: -1, healUntil: 0, healType: null, search: null,
      speedMul: 1, frozen: false, disconnectedAt: 0, actBudget: 40, actRefill: Date.now(),
      lastShotSeq: 0,
    };
    this.byNum.push(p);
    this.players.set(p.pid, p);
    return p;
  }

  addHuman(h) {
    const p = this.makePlayer({ userId: h.userId, name: h.username, avatar: h.avatar, skins: h.skins, partyId: h.partyId, client: h.client });
    if (h.client) this.attachClient(p, h.client);
    return p;
  }

  fillBots() {
    const want = Math.max(MATCH.MIN_PARTICIPANTS, this.modeDef.minPlayers);
    let humans = this.humans().length;
    let total = this.byNum.length;
    while (total < want && total < MATCH.MAX_PLAYERS) {
      this.addBot();
      total++;
    }
    return humans;
  }

  addBot() {
    const name = this.botNames.pop() || ('Bot' + this.byNum.length);
    const colors = ['#ff5d73', '#ff9f1c', '#ffd23f', '#3ddc97', '#4cc9f0', '#7b6cff', '#c77dff', '#f1f1f1'];
    const hats = ['none', 'cap', 'beanie', 'cowboy', 'tophat', 'party'];
    const p = this.makePlayer({
      isBot: true,
      name: 'BOT ' + name,
      avatar: { color: colors[this.byNum.length % colors.length], hat: hats[Math.floor(Math.random() * hats.length)], face: 'bot' },
    });
    p.brain = new BotBrain(this, p);
    return p;
  }

  humans() { return this.byNum.filter((p) => !p.isBot && !p.left); }
  alivePlayers() { return this.byNum.filter((p) => p.alive && !p.left); }
  participants() { return this.byNum.filter((p) => !p.left); }

  attachClient(p, client) {
    p.client = client;
    p.connected = true;
    p.disconnectedAt = 0;
    client.matchId = this.id;
    const s = client.socket;
    s.join(this.room);
    const h = {
      vote: (mapId) => this.onVote(p, mapId),
      ready: () => this.onReady(p),
      st: (d) => this.onState(p, d),
      act: (d) => this.onAct(p, d),
      leave: () => this.leave(p, 'left'),
    };
    p.handlers = h;
    s.on('match:vote', h.vote);
    s.on('match:ready', h.ready);
    s.on('st', h.st);
    s.on('act', h.act);
    s.on('match:leave', h.leave);
  }

  detachClient(p) {
    const c = p.client;
    if (!c) return;
    const s = c.socket;
    if (p.handlers) {
      s.off('match:vote', p.handlers.vote);
      s.off('match:ready', p.handlers.ready);
      s.off('st', p.handlers.st);
      s.off('act', p.handlers.act);
      s.off('match:leave', p.handlers.leave);
    }
    s.leave(this.room);
    if (c.matchId === this.id) c.matchId = null;
    p.handlers = null;
    p.client = null;
  }

  modeState() {
    const st = this.mode ? this.mode.state() : {};
    const sp = {};
    for (const p of this.byNum) if (p.speedMul !== 1) sp[p.num] = p.speedMul;
    st.sp = sp;
    return st;
  }

  broadcastMode() { this.broadcast('mode', this.modeState()); }

  emitTo(p, ev, data) { if (p.client && p.connected) p.client.socket.emit(ev, data); }
  broadcast(ev, data) { this.io.to(this.room).emit(ev, data); }
  ev(data) { this.broadcast('ev', data); }

  announce(text, kind = 'info') {
    this.services.chat?.matchAnnounce(this, text, kind);
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    const secs = this.cfg.voteSeconds ?? (this.practice ? MATCH.PRACTICE_VOTE_SECONDS : MATCH.VOTE_SECONDS);
    this.voteEndsAt = Date.now() + secs * 1000;
    // Only humans vote; bots go wherever the players choose (no votes at all = random map).
    this.sendVoteState();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  voteState() {
    const counts = Object.fromEntries(MAP_IDS.map((id) => [id, 0]));
    for (const v of this.votes.values()) counts[v]++;
    return {
      matchId: this.id,
      mode: this.modeId,
      practice: this.practice,
      endsAt: this.voteEndsAt,
      maps: MAP_IDS.map((id) => mapMeta(id)),
      counts,
      players: this.byNum.filter((p) => !p.left).map((p) => ({ num: p.num, name: p.name, bot: p.isBot, vote: this.votes.get(p.pid) || null, avatar: p.avatar, partyId: p.partyId })),
    };
  }

  sendVoteState() {
    for (const p of this.humans()) this.emitTo(p, 'match:vote', { ...this.voteState(), you: p.num });
  }

  onVote(p, mapId) {
    if (this.state !== 'voting') return;
    if (typeof mapId !== 'string' || !MAP_IDS.includes(mapId)) return;
    this.votes.set(p.pid, mapId);
    this.sendVoteState();
  }

  finishVote() {
    const counts = new Map();
    for (const v of this.votes.values()) counts.set(v, (counts.get(v) || 0) + 1);
    let best = [];
    let bestN = -1;
    for (const id of MAP_IDS) {
      const n = counts.get(id) || 0;
      if (n > bestN) { bestN = n; best = [id]; } else if (n === bestN) best.push(id);
    }
    const mapId = best[Math.floor(Math.random() * best.length)];
    this.loadMap(mapId, best.length > 1 && bestN > 0);
  }

  loadMap(mapId, tieBroken = false) {
    this.mapId = mapId;
    this.map = getMap(mapId);
    this.world = new CollisionWorld(this.map.boxes.filter((b) => b.col !== false));
    for (const d of this.map.doors) {
      this.doorState.set(d.id, !!d.open);
      this.world.setDisabled(d.id, !!d.open);
    }
    this.nav = getNav(this.map);
    this.mode = createMode(this.modeId, this);
    this.state = 'loading';
    this.loadStartedAt = Date.now();
    const roster = this.roster();
    for (const p of this.humans()) {
      p.ready = false;
      this.emitTo(p, 'match:load', { matchId: this.id, mode: this.modeId, mapId, you: p.num, roster, practice: this.practice, tieBroken });
    }
    this.announce(`Map vote finished: ${this.map.name}${tieBroken ? ' (tie broken randomly)' : ''}.`);
  }

  roster() {
    return this.byNum.map((p) => ({ num: p.num, name: p.name, bot: p.isBot, avatar: p.avatar, skins: p.skins, partyId: p.partyId, left: p.left, userId: p.userId }));
  }

  onReady(p) {
    if (this.state === 'loading') {
      p.ready = true;
      if (this.humans().every((h) => h.ready || !h.connected)) this.beginCountdown();
    } else if (this.state === 'countdown' || this.state === 'playing') {
      // rejoining player finished loading
      p.ready = true;
      this.emitTo(p, 'match:init', this.initPayload(p));
    }
  }

  beginCountdown() {
    if (this.state !== 'loading') return;
    this.state = 'countdown';
    this.mode.setupWorld?.();
    this.spawnAll();
    this.countdownEndsAt = Date.now() + (this.cfg.countdownSeconds ?? MATCH.COUNTDOWN_SECONDS) * 1000;
    for (const p of this.byNum) p.frozen = true;
    for (const p of this.humans()) this.emitTo(p, 'match:init', this.initPayload(p));
  }

  spawnAll() {
    const spawns = shuffle([...this.map.spawns]);
    let i = 0;
    for (const p of this.byNum) {
      if (p.left) continue;
      const s = spawns[i % spawns.length];
      const off = Math.floor(i / spawns.length);
      this.placePlayer(p, s.x + off * 0.8, s.y, s.z + off * 0.8, s.yaw);
      i++;
    }
  }

  placePlayer(p, x, y, z, yaw) {
    p.x = x; p.y = y + 0.02; p.z = z; p.vx = p.vy = p.vz = 0; p.yaw = yaw ?? p.yaw; p.pitch = 0;
    p.tpSeq++;
    p.lastSt = Date.now();
    p.hist.length = 0;
    this.emitTo(p, 'tp', { x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r3(p.yaw), seq: p.tpSeq });
  }

  randomSpawn(avoid = []) {
    let best = null, bestD = -1;
    for (const s of shuffle([...this.map.spawns]).slice(0, 8)) {
      let d = 1e9;
      for (const a of avoid) d = Math.min(d, Math.hypot(a.x - s.x, a.z - s.z));
      if (d > bestD) { bestD = d; best = s; }
    }
    return best || this.map.spawns[0];
  }

  initPayload(p) {
    return {
      matchId: this.id,
      mode: this.modeId,
      mapId: this.mapId,
      you: p.num,
      state: this.state,
      countdownEndsAt: this.countdownEndsAt,
      serverTime: Date.now(),
      roster: this.roster(),
      players: this.byNum.map((q) => this.playerFull(q)),
      doors: [...this.doorState.entries()].filter(([, o]) => o).map(([id]) => id),
      doorsClosed: [...this.doorState.entries()].filter(([, o]) => !o).map(([id]) => id),
      loot: [...this.loot.values()].map(lootView),
      containers: [...this.containers.entries()].filter(([, c]) => c.opened).map(([id]) => id),
      resources: [...this.resources.entries()].map(([id, r]) => [id, r.left]),
      modeState: this.modeState(),
      inv: serializeInv(p),
      killfeed: this.killfeed.slice(-6),
      practice: this.practice,
    };
  }

  playerFull(q) {
    const w = heldWeapon(q);
    return {
      num: q.num, x: r2(q.x), y: r2(q.y), z: r2(q.z), yaw: r3(q.yaw), alive: q.alive, left: q.left,
      held: w ? w.t : null, hp: Math.round(q.hp), lives: q.lives, connected: q.connected || q.isBot,
    };
  }

  startPlaying() {
    this.state = 'playing';
    this.startedAt = Date.now();
    for (const p of this.byNum) p.frozen = false;
    this.mode.onStart();
    this.broadcast('match:go', { startedAt: this.startedAt, modeState: this.modeState() });
    this.announce(`Round started: ${this.modeDef.name} on ${this.map.name}. Good luck!`, 'event');
  }

  // Ends the match. results: { winners: [players], reason }
  finish(result) {
    if (this.ended) return;
    this.ended = true;
    this.state = 'ended';
    this.endedAt = Date.now();
    const winners = new Set((result.winners || []).map((p) => p.num));
    // Placement: winners first, then alive, then by elimination time (later = better)
    const order = this.byNum.slice().sort((a, b) => {
      const wa = winners.has(a.num) ? 1 : 0, wb = winners.has(b.num) ? 1 : 0;
      if (wa !== wb) return wb - wa;
      const sa = this.mode.score ? this.mode.score(a) : 0, sb = this.mode.score ? this.mode.score(b) : 0;
      if (sa !== sb) return sb - sa;
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return (b.eliminatedAt || 0) - (a.eliminatedAt || 0);
    });
    order.forEach((p, i) => { p.placement = i + 1; });
    const results = order.map((p) => {
      const won = winners.has(p.num);
      const rewards = p.isBot ? [] : this.computeRewards(p, won, result);
      return {
        num: p.num, name: p.name, bot: p.isBot, won, placement: p.placement, left: p.left,
        stats: p.stats, rewards, coins: rewards.reduce((s, r) => s + r.coins, 0), userId: p.userId,
      };
    });
    // persist for humans
    const persisted = this.services.economy ? this.services.economy.applyMatchResults(this, results) : {};
    const winnerNames = order.filter((p) => winners.has(p.num)).map((p) => p.name);
    if (winnerNames.length) this.announce(`🏆 Victory: ${winnerNames.join(', ')}! ${result.reason || ''}`.trim(), 'victory');
    else this.announce(`Match over. ${result.reason || 'No winner this time.'}`, 'event');
    for (const p of this.humans()) {
      this.emitTo(p, 'match:end', {
        matchId: this.id,
        reason: result.reason || '',
        winners: [...winners],
        you: p.num,
        results: results.map((r) => ({ ...r, userId: undefined })),
        profile: persisted[p.userId] || null,
        practice: this.practice,
      });
    }
    // release humans back to lobby (results screen is client-side)
    setTimeout(() => this.dispose(), 1500);
  }

  computeRewards(p, won, result) {
    const list = [];
    if (p.left) return list;
    list.push({ label: 'Participation', coins: 15 });
    if (won) list.push({ label: 'Victory', coins: 100 });
    const extra = this.mode.rewards ? this.mode.rewards(p, won, result) : [];
    for (const e of extra) if (e.coins > 0) list.push(e);
    if (this.practice) {
      for (const e of list) e.coins = Math.max(1, Math.round(e.coins / 2));
      list.push({ label: 'Practice (50% coins)', coins: 0 });
    }
    return list;
  }

  dispose() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const p of this.byNum) {
      if (!p.isBot && p.client) {
        const c = p.client;
        this.detachClient(p);
        this.hub.presenceChanged(c.userId);
      }
    }
    this.state = 'disposed';
    this.services.chat?.matchEnded?.(this.id);
    this.onFinished?.(this);
  }

  // Player leaves for good (left button, kicked, or grace period expired)
  leave(p, reason = 'left') {
    if (p.left) return;
    const client = p.client;
    p.left = true;
    p.connected = false;
    if (client) {
      this.detachClient(p);
      this.hub.presenceChanged(client.userId);
    }
    if (this.state === 'voting') {
      this.votes.delete(p.pid);
      this.sendVoteState();
    } else {
      if (p.alive && (this.state === 'playing' || this.state === 'countdown')) {
        if (this.mode.combat) this.dropInventory(p);
        p.alive = false;
        p.eliminatedAt = Date.now();
      }
      this.ev({ k: 'left', n: p.num });
      this.announce(`${p.name} left the match.`);
      if (this.state === 'playing') this.mode.onLeave?.(p);
    }
    if (this.humans().length === 0 && !this.ended) {
      this.ended = true;
      this.dispose();
    }
  }

  // Socket dropped: keep the slot for a grace period so the player can rejoin
  onDisconnect(p) {
    if (p.left) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (p.client) {
      const s = p.client.socket;
      if (p.handlers) {
        s.off('match:vote', p.handlers.vote); s.off('match:ready', p.handlers.ready); s.off('st', p.handlers.st);
        s.off('act', p.handlers.act); s.off('match:leave', p.handlers.leave);
      }
      p.handlers = null;
      p.client = null;
    }
    if (this.state === 'voting' || this.state === 'ended') { this.leave(p, 'disconnect'); return; }
    this.ev({ k: 'conn', n: p.num, on: false });
    if (this.state === 'loading' && this.humans().every((h) => h.ready || !h.connected)) this.beginCountdown();
    if (this.humans().every((h) => !h.connected)) {
      // nobody left watching: end quietly after the grace window via tick
    }
  }

  rejoin(p, client) {
    this.attachClient(p, client);
    p.ready = false;
    this.ev({ k: 'conn', n: p.num, on: true });
    this.emitTo(p, 'match:load', { matchId: this.id, mode: this.modeId, mapId: this.mapId, you: p.num, roster: this.roster(), practice: this.practice, rejoin: true });
  }

  // ------------------------------------------------------------------ tick
  tick() {
    const now = Date.now();
    try {
      if (this.state === 'voting') {
        if (now >= this.voteEndsAt) this.finishVote();
        return;
      }
      if (this.state === 'loading') {
        if (now - this.loadStartedAt > 15000) this.beginCountdown();
        return;
      }
      // expire disconnected players
      for (const p of this.byNum) {
        if (!p.isBot && !p.left && !p.connected && p.disconnectedAt && now - p.disconnectedAt > MATCH.REJOIN_GRACE_MS) this.leave(p, 'timeout');
      }
      if (this.state === 'disposed') return;
      if (this.state === 'countdown' && now >= this.countdownEndsAt) this.startPlaying();
      const dt = TICK_MS / 1000;
      if (this.state === 'playing' || this.state === 'countdown') {
        for (const p of this.byNum) {
          if (p.left) continue;
          if (p.isBot) {
            if (p.alive) p.brain.update(dt, now);
          }
          if (p.alive) this.playerTimers(p, now);
          if (p.alive && p.y < (this.map.killY ?? -20)) this.onFell(p);
          p.hist.push(now, p.x, p.y, p.z);
          if (p.hist.length > 4 * 24) p.hist.splice(0, 4);
        }
        if (this.state === 'playing') this.mode.tick(dt, now);
        if (!this.lastScores || now - this.lastScores >= 1000) { this.lastScores = now; this.sendScores(); }
      }
      if (this.state === 'playing' || this.state === 'countdown' || this.state === 'ended') this.sendSnapshot(now);
    } catch (e) {
      console.error('match tick error', e);
    }
  }

  sendSnapshot(now) {
    const arr = [];
    for (const p of this.byNum) {
      if (p.left) continue;
      let f = p.flags & 0x17; // moving, sprint, grounded, crouch
      if (p.alive) f |= 8;
      if (p.connected || p.isBot) f |= 32;
      if (p.reloadUntil > now) f |= 64;
      if (p.healUntil > now) f |= 128;
      arr.push(p.num, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), r3(p.pitch), f);
    }
    this.io.to(this.room).volatile.emit('s', { t: now, p: arr });
  }

  sendScores() {
    const sc = {};
    for (const p of this.byNum) {
      const s = p.stats;
      sc[p.num] = { elims: s.elims, tags: s.tags, passes: s.passes, held: Math.round(s.heldTime), steals: s.steals, itTime: Math.round(s.itTime), damage: Math.round(s.damage), crafted: s.crafted, rounds: s.roundsSurvived };
    }
    this.broadcast('sc', sc);
  }

  onFell(p) {
    if (this.mode.onFell) { this.mode.onFell(p); return; }
    if (this.mode.combat) {
      this.damage(p, 40, null, 'fall', false);
      if (!p.alive) return;
    }
    const s = this.randomSpawn(this.alivePlayers().filter((q) => q !== p));
    this.placePlayer(p, s.x, s.y, s.z, s.yaw);
    this.ev({ k: 'fell', n: p.num });
  }

  playerTimers(p, now) {
    // reload completion
    if (p.reloadUntil && now >= p.reloadUntil) {
      p.reloadUntil = 0;
      const w = p.inv.slots[p.reloadSlot];
      if (w && p.inv.held - 1 === p.reloadSlot) {
        const def = WEAPONS[w.t];
        const need = def.mag - w.mag;
        const got = Math.min(need, p.inv.ammo[def.ammo] || 0);
        w.mag += got;
        p.inv.ammo[def.ammo] -= got;
        this.sendInv(p);
      }
    }
    if (p.healUntil && now >= p.healUntil) {
      p.healUntil = 0;
      const h = HEALS[p.healType];
      if (h && p.inv.heals[p.healType] > 0) {
        p.inv.heals[p.healType]--;
        p.hp = Math.min(h.max, p.hp + h.heal);
        this.sendInv(p);
        this.ev({ k: 'healed', n: p.num, hp: Math.round(p.hp) });
      }
    }
    if (p.search) {
      const s = p.search;
      const dist = Math.hypot(p.x - s.x, p.z - s.z);
      if (dist > 3.2 || Math.abs(p.y - s.y) > 2.5) {
        p.search = null;
        this.emitTo(p, 'ev', { k: 'search', cancel: true });
      } else if (now >= s.until) {
        p.search = null;
        if (s.kind === 'container') this.completeContainer(p, s.id);
        else if (s.kind === 'res') this.completeResource(p, s.id);
      }
    }
  }

  // ------------------------------------------------------------------ input
  onState(p, d) {
    if (!Array.isArray(d) || d.length < 8) return;
    const now = Date.now();
    const x = +d[1], y = +d[2], z = +d[3], yaw = +d[4], pitch = +d[5], flags = d[6] | 0, tpSeq = d[7] | 0;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    if (d[8] !== undefined && Number.isFinite(+d[8])) p.rtt = Math.max(0, Math.min(1000, +d[8]));
    p.yaw = yaw;
    p.pitch = Math.max(-1.55, Math.min(1.55, pitch));
    if (tpSeq !== p.tpSeq) return; // packet from before a teleport
    if (!p.alive || p.left) return;
    if (p.frozen || this.state === 'countdown' || this.state === 'ended') {
      if (Math.hypot(x - p.x, z - p.z) > 0.6) this.correct(p);
      return;
    }
    const dt = Math.min(1.0, Math.max(0.016, (now - (p.lastSt || now)) / 1000));
    const dx = x - p.x, dz = z - p.z, dy = y - p.y;
    const horiz = Math.hypot(dx, dz);
    let maxH = PHYS.SPRINT_SPEED * Math.max(1, p.speedMul) * dt * 1.45 + 0.8;
    if (now < p.kbUntil) maxH += 16 * dt + 2;
    const maxUp = 1.4 + 10 * dt + (now < p.kbUntil ? 3 : 0);
    if (horiz > maxH || dy > maxUp) return this.correct(p);
    // inside a solid?
    if (this.world.overlaps(x - 0.2, y + 0.2, z - 0.2, x + 0.2, y + 1.55, z + 0.2, (b) => !b.noPlayer)) return this.correct(p);
    // passed through a wall?
    if (horiz > 0.05) {
      const ny = Math.max(y, p.y) + 1.0;
      const hit = this.world.raycast(p.x, ny, p.z, dx / horiz, 0, dz / horiz, horiz, (b) => !b.noPlayer);
      if (hit && hit.t < horiz - 0.05) return this.correct(p);
    }
    p.x = x; p.y = y; p.z = z;
    p.flags = flags;
    p.lastSt = now;
  }

  correct(p) {
    p.tpSeq++;
    p.vx = p.vy = p.vz = 0;
    this.emitTo(p, 'tp', { x: r2(p.x), y: r2(p.y), z: r2(p.z), seq: p.tpSeq, keepLook: true });
  }

  onAct(p, d) {
    if (!d || typeof d !== 'object' || typeof d.a !== 'string') return;
    // simple token bucket against action spam
    const now = Date.now();
    p.actBudget = Math.min(40, p.actBudget + (now - p.actRefill) * 0.03);
    p.actRefill = now;
    if (p.actBudget < 1) return;
    p.actBudget--;
    if (this.state !== 'playing' || !p.alive || p.left) return;
    if (Number.isFinite(d.yaw)) p.yaw = d.yaw;
    if (Number.isFinite(d.pitch)) p.pitch = Math.max(-1.55, Math.min(1.55, d.pitch));
    switch (d.a) {
      case 'punch': return this.punch(p);
      case 'shoot': return this.shoot(p, d);
      case 'reload': return this.reload(p);
      case 'slot': return this.selectSlot(p, d.s | 0);
      case 'use': return this.use(p, d);
      case 'heal': return this.heal(p);
      case 'craft': return this.craft(p, d.r);
      case 'drop': return this.dropHeld(p);
      default:
    }
  }

  eye(p) { return { x: p.x, y: p.y + PHYS.EYE_HEIGHT, z: p.z }; }

  // ------------------------------------------------------------------ melee
  findPunchTarget(p, range = FISTS.range) {
    const e = this.eye(p);
    const dir = lookDir(p.yaw, p.pitch);
    let best = null, bestD = Infinity;
    for (const q of this.byNum) {
      if (q === p || !q.alive || q.left) continue;
      const cx = q.x, cy = q.y + 1.1, cz = q.z;
      const dx = cx - e.x, dy = cy - e.y, dz = cz - e.z;
      const dist = Math.hypot(dx, dy, dz);
      const hd = Math.hypot(q.x - p.x, q.z - p.z);
      if (hd > range + 0.35 || Math.abs(q.y - p.y) > 1.8) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
      // horizontal facing check is more forgiving than full 3D aim
      const hdot = ((q.x - p.x) * dir.x + (q.z - p.z) * dir.z) / ((hd || 1) * (Math.hypot(dir.x, dir.z) || 1));
      if (hd > 1.0 && dot < 0.72 && hdot < 0.8) continue;
      if (!lineOfSight(this.world, e.x, e.y, e.z, cx, cy, cz)) continue;
      if (dist < bestD) { bestD = dist; best = q; }
    }
    return best;
  }

  punch(p) {
    const now = Date.now();
    if (heldWeapon(p) && this.mode.combat) return; // guns are fired with 'shoot'
    if (now < p.cd.punch) return;
    p.cd.punch = now + FISTS.interval * 1000 * 0.9;
    p.stats.punches++;
    const target = this.findPunchTarget(p);
    this.ev({ k: 'punch', n: p.num, hit: target ? target.num : -1 });
    if (!target) return;
    if (this.mode.onPunch && this.mode.onPunch(p, target) === true) return;
    // default: knockback + (combat modes) damage
    this.knockback(target, p, 5.5, 3.2);
    if (this.mode.combat) this.damage(target, FISTS.dmg, p, 'fists', false);
  }

  knockback(target, from, power = 6, up = 3.5) {
    const dx = target.x - from.x, dz = target.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const vx = (dx / d) * power, vz = (dz / d) * power;
    target.kbUntil = Date.now() + 900;
    if (target.isBot) {
      target.vx += vx; target.vz += vz; target.vy = Math.max(target.vy, up); target.onGround = false;
      if (target.brain) target.brain.stunUntil = Date.now() + 350;
    } else {
      this.emitTo(target, 'kb', { vx: r2(vx), vy: r2(up), vz: r2(vz) });
    }
  }

  // ------------------------------------------------------------------ guns
  shoot(p, d) {
    const now = Date.now();
    const w = heldWeapon(p);
    if (!w || !this.mode.combat) return;
    const def = WEAPONS[w.t];
    if (now - p.cd.shoot < def.interval * 1000 * 0.82) return;
    if (p.reloadUntil > now) return;
    if (w.mag <= 0) { this.emitTo(p, 'ev', { k: 'dry' }); return; }
    p.cd.shoot = now;
    p.healUntil = 0;
    w.mag--;
    // direction: client's aim (validated against server-known look) or from yaw/pitch
    let dir = lookDir(p.yaw, p.pitch);
    if (Array.isArray(d.d) && d.d.length === 3 && d.d.every(Number.isFinite)) {
      const L = Math.hypot(d.d[0], d.d[1], d.d[2]);
      if (L > 0.5) {
        const cd = { x: d.d[0] / L, y: d.d[1] / L, z: d.d[2] / L };
        if (cd.x * dir.x + cd.y * dir.y + cd.z * dir.z > 0.85) dir = cd;
      }
    }
    const e = this.eye(p);
    const rewindT = p.isBot ? now : now - Math.min(300, p.rtt / 2 + NET.INTERP_DELAY_MS);
    const hits = [];
    const dmgBy = new Map();
    const bloom = (p.flags & 1 ? 1.35 : 1) * (p.onGround === false ? 1.2 : 1) * (d.ads ? 0.55 : 1);
    for (let k = 0; k < def.pellets; k++) {
      const s = def.spread * bloom * (p.isBot ? 1 : 1);
      const dx = dir.x + (Math.random() - 0.5) * 2 * s;
      const dy = dir.y + (Math.random() - 0.5) * 2 * s;
      const dz = dir.z + (Math.random() - 0.5) * 2 * s;
      const L = Math.hypot(dx, dy, dz);
      const res = this.hitscan(p, e, dx / L, dy / L, dz / L, def.range, rewindT);
      hits.push([r2(res.x), r2(res.y), r2(res.z), res.target ? (res.head ? 2 : 1) : 0]);
      if (res.target) {
        let dmg = def.dmg * (res.head ? (def.pellets > 1 ? 1.25 : 1.6) : 1);
        if (def.pellets > 1) dmg *= Math.max(0.35, 1 - Math.max(0, res.dist - 8) / 26);
        const cur = dmgBy.get(res.target) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head = cur.head || res.head;
        dmgBy.set(res.target, cur);
      }
    }
    this.ev({ k: 'shot', n: p.num, w: w.t, o: [r2(e.x), r2(e.y), r2(e.z)], h: hits });
    for (const [target, info] of dmgBy) {
      const killed = this.damage(target, info.dmg, p, w.t, info.head);
      this.emitTo(p, 'ev', { k: 'hm', head: info.head, kill: killed, dmg: Math.round(info.dmg) });
    }
    if (w.mag === 0 && (p.inv.ammo[def.ammo] || 0) > 0 && p.isBot) this.reload(p);
    this.sendInvLight(p);
  }

  hitscan(shooter, e, dx, dy, dz, range, rewindT) {
    const wall = this.world.raycast(e.x, e.y, e.z, dx, dy, dz, range, (b) => !b.glass);
    let maxT = wall ? wall.t : range;
    let target = null, head = false;
    for (const q of this.byNum) {
      if (q === shooter || !q.alive || q.left) continue;
      const pos = this.positionAt(q, rewindT);
      // head
      const th = rayAABB(e.x, e.y, e.z, dx, dy, dz, pos.x - 0.24, pos.y + 1.42, pos.z - 0.24, pos.x + 0.24, pos.y + 1.88, pos.z + 0.24, maxT);
      const tb = rayAABB(e.x, e.y, e.z, dx, dy, dz, pos.x - 0.36, pos.y, pos.z - 0.36, pos.x + 0.36, pos.y + 1.42, pos.z + 0.36, maxT);
      let t = -1, isHead = false;
      if (th >= 0 && (tb < 0 || th <= tb)) { t = th; isHead = true; } else if (tb >= 0) t = tb;
      if (t >= 0 && t < maxT) { maxT = t; target = q; head = isHead; }
    }
    return { x: e.x + dx * maxT, y: e.y + dy * maxT, z: e.z + dz * maxT, target, head, dist: maxT };
  }

  positionAt(q, t) {
    const h = q.hist;
    if (q.isBot || h.length < 8 || t >= h[h.length - 4]) return q;
    for (let i = h.length - 8; i >= 0; i -= 4) {
      if (h[i] <= t) {
        const t0 = h[i], t1 = h[i + 4];
        const a = Math.max(0, Math.min(1, (t - t0) / ((t1 - t0) || 1)));
        return { x: h[i + 1] + (h[i + 5] - h[i + 1]) * a, y: h[i + 2] + (h[i + 6] - h[i + 2]) * a, z: h[i + 3] + (h[i + 7] - h[i + 3]) * a };
      }
    }
    return { x: h[1], y: h[2], z: h[3] };
  }

  damage(target, amount, attacker, weapon, head) {
    if (!target.alive || this.state !== 'playing') return false;
    if (this.mode.canDamage && !this.mode.canDamage(target, attacker)) return false;
    let dmg = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, dmg * 0.66);
      target.armor -= absorbed;
      dmg -= absorbed;
    }
    target.hp -= dmg;
    target.healUntil = 0;
    if (attacker) attacker.stats.damage += amount;
    this.emitTo(target, 'ev', { k: 'hurt', from: attacker ? attacker.num : -1, dmg: Math.round(amount), hp: Math.max(0, Math.round(target.hp)), armor: Math.round(target.armor) });
    if (target.brain) target.brain.onHurt(attacker);
    if (target.hp <= 0) {
      target.hp = 0;
      this.eliminate(target, attacker, weapon, head);
      return true;
    }
    this.sendInvLight(target);
    return false;
  }

  eliminate(p, killer, weapon, head) {
    if (!p.alive) return;
    p.alive = false;
    p.eliminatedAt = Date.now();
    p.search = null; p.reloadUntil = 0; p.healUntil = 0;
    if (killer && killer !== p) killer.stats.elims++;
    if (this.mode.combat) this.dropInventory(p);
    const entry = { k: 'elim', victim: p.num, killer: killer && killer !== p ? killer.num : -1, w: weapon || '', head: !!head };
    this.killfeed.push(entry);
    this.ev(entry);
    const how = weapon === 'fall' ? 'fell to their doom' : weapon === 'pop' ? 'got popped by the Boob-tato' : null;
    if (how) this.announce(`💀 ${p.name} ${how}.`, 'elim');
    else if (killer && killer !== p) this.announce(`💀 ${killer.name} eliminated ${p.name}${weapon && weapon !== 'fists' ? ' with the ' + (WEAPONS[weapon]?.name || weapon) : weapon === 'fists' ? ' with bare fists' : ''}.`, 'elim');
    else this.announce(`💀 ${p.name} was eliminated.`, 'elim');
    this.sendInv(p);
    this.mode.onElim?.(p, killer);
  }

  dropInventory(p) {
    const items = dropAll(p);
    p.inv = newInventory();
    let i = 0;
    for (const it of items) {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2;
      const r = items.length > 1 ? 0.7 : 0;
      this.spawnLoot(it, p.x + Math.cos(a) * r, p.y + 0.05, p.z + Math.sin(a) * r);
      i++;
    }
  }

  reload(p) {
    const w = heldWeapon(p);
    if (!w) return;
    const def = WEAPONS[w.t];
    const now = Date.now();
    if (p.reloadUntil > now || w.mag >= def.mag || (p.inv.ammo[def.ammo] || 0) <= 0) return;
    p.reloadUntil = now + def.reload * 1000;
    p.reloadSlot = p.inv.held - 1;
    p.healUntil = 0;
    this.ev({ k: 'reload', n: p.num, w: w.t, ms: def.reload * 1000 });
  }

  selectSlot(p, s) {
    if (s < 0 || s > 3) return;
    if (s > 0 && !p.inv.slots[s - 1]) return;
    if (p.inv.held === s) return;
    p.inv.held = s;
    p.reloadUntil = 0;
    p.healUntil = 0;
    const w = heldWeapon(p);
    this.ev({ k: 'held', n: p.num, w: w ? w.t : null });
    this.sendInv(p);
  }

  dropHeld(p) {
    if (!this.mode.combat) return;
    const s = p.inv.held;
    if (s === 0 || !p.inv.slots[s - 1]) return;
    const w = p.inv.slots[s - 1];
    p.inv.slots[s - 1] = null;
    p.inv.held = 0;
    p.reloadUntil = 0;
    const d = lookDir(p.yaw, 0);
    this.spawnLoot({ kind: 'weapon', t: w.t, mag: w.mag }, p.x + d.x * 1.0, p.y + 0.05, p.z + d.z * 1.0);
    this.ev({ k: 'held', n: p.num, w: null });
    this.sendInv(p);
  }

  heal(p) {
    if (!this.mode.combat) return;
    const now = Date.now();
    if (p.healUntil > now) return;
    const t = bestHeal(p);
    if (!t) { this.emitTo(p, 'ev', { k: 'toast', text: p.hp >= 100 ? 'Already at full health.' : 'No healing items.' }); return; }
    p.healType = t;
    p.healUntil = now + HEALS[t].time * 1000;
    p.reloadUntil = 0;
    this.emitTo(p, 'ev', { k: 'healing', t, ms: HEALS[t].time * 1000 });
  }

  craft(p, recipeId) {
    if (!this.mode.crafting) return;
    const r = RECIPE_MAP[recipeId];
    if (!r) return;
    const bench = this.map.benches.find((b) => Math.hypot(b.x - p.x, b.z - p.z) < 3.4 && Math.abs(b.y - p.y) < 2);
    if (!bench) { this.emitTo(p, 'ev', { k: 'toast', text: 'You need to be at a crafting bench.' }); return; }
    if (!canAfford(p.inv, r.cost)) { this.emitTo(p, 'ev', { k: 'toast', text: 'Not enough materials.' }); return; }
    pay(p.inv, r.cost);
    let item;
    if (r.out.weapon) item = { kind: 'weapon', t: r.out.weapon, mag: WEAPONS[r.out.weapon].mag };
    else if (r.out.ammo) item = { kind: 'ammo', t: r.out.ammo, n: r.out.n };
    else if (r.out.heal) item = { kind: 'heal', t: r.out.heal, n: r.out.n };
    else if (r.out.armor) item = { kind: 'armor', t: r.out.armor };
    const left = giveItem(p, item);
    if (left) this.spawnLoot(left, p.x, p.y + 0.05, p.z);
    p.stats.crafted++;
    this.sendInv(p);
    if (item.kind === 'weapon') this.ev({ k: 'held', n: p.num, w: heldWeapon(p)?.t || null });
    this.ev({ k: 'crafted', n: p.num, r: r.id, bench: bench.id });
    if (r.cat === 'weapon' && WEAPONS[r.out.weapon].rarity >= 2) this.announce(`🛠️ ${p.name} crafted a ${r.name}!`, 'event');
  }

  // ------------------------------------------------------------------ world interaction
  use(p, d) {
    const now = Date.now();
    if (now < p.cd.use) return;
    p.cd.use = now + 150;
    const kind = d.k, id = d.id;
    if (typeof kind !== 'string') return;
    if (this.mode.onUse && this.mode.onUse(p, d) === true) return;
    switch (kind) {
      case 'door': return this.toggleDoor(p, String(id));
      case 'loot': return this.pickupLoot(p, +id);
      case 'container': return this.startSearch(p, String(id));
      case 'res': return this.startHarvest(p, String(id));
      default:
    }
  }

  toggleDoor(p, id) {
    const door = this.map.doors.find((d) => d.id === id);
    if (!door) return;
    const cx = (door.x0 + door.x1) / 2, cz = (door.z0 + door.z1) / 2;
    if (Math.hypot(cx - p.x, cz - p.z) > 3.0 || Math.abs(door.y0 - p.y) > 2.5) return;
    const open = !this.doorState.get(id);
    if (!open) {
      // don't close a door on somebody
      for (const q of this.byNum) {
        if (!q.alive || q.left) continue;
        if (q.x + 0.34 > door.x0 && q.x - 0.34 < door.x1 && q.z + 0.34 > door.z0 && q.z - 0.34 < door.z1 && q.y < door.y1 && q.y + 1.8 > door.y0) return;
      }
    }
    this.doorState.set(id, open);
    this.world.setDisabled(id, open);
    this.ev({ k: 'door', id, open });
  }

  spawnLoot(it, x, y, z) {
    const id = this.lootSeq++;
    const l = { id, kind: it.kind, t: it.t, n: it.n ?? (it.kind === 'ammo' ? undefined : 1), mag: it.mag, x, y, z };
    if (it.kind === 'ammo' && !l.n) l.n = 20;
    this.loot.set(id, l);
    if (this.state === 'playing' || this.state === 'countdown') this.ev({ k: 'loot+', l: lootView(l) });
    return l;
  }

  pickupLoot(p, id) {
    const l = this.loot.get(id);
    if (!l) return;
    if (Math.hypot(l.x - p.x, l.z - p.z) > 2.6 || Math.abs(l.y - p.y) > 2.2) return;
    this.loot.delete(id);
    this.ev({ k: 'loot-', id, n: p.num });
    const left = giveItem(p, l);
    if (left) this.spawnLoot(left, p.x + (Math.random() - 0.5) * 0.4, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.4);
    if (l.kind === 'weapon') this.ev({ k: 'held', n: p.num, w: heldWeapon(p)?.t || null });
    this.emitTo(p, 'ev', { k: 'got', items: [{ kind: l.kind, t: l.t, n: l.n }] });
    this.sendInv(p);
  }

  startSearch(p, id) {
    const c = this.containers.get(id);
    const def = this.map.containers.find((x) => x.id === id);
    if (!c || !def || c.opened) return;
    if (Math.hypot(def.x - p.x, def.z - p.z) > 2.8 || Math.abs(def.y - p.y) > 2.2) return;
    if (c.searchBy && c.searchBy !== p.num) {
      const other = this.byNum[c.searchBy];
      if (other && other.search && other.search.id === id) { this.emitTo(p, 'ev', { k: 'toast', text: 'Someone is already searching that.' }); return; }
    }
    c.searchBy = p.num;
    const ms = CONTAINER_SEARCH_TIME * 1000;
    p.search = { kind: 'container', id, x: def.x, y: def.y, z: def.z, until: Date.now() + ms };
    this.emitTo(p, 'ev', { k: 'search', id, ms, label: 'Searching ' + (CONTAINER_DIMS[def.kind]?.name || 'container') });
  }

  completeContainer(p, id) {
    const c = this.containers.get(id);
    if (!c || c.opened) return;
    c.opened = true;
    p.stats.searched++;
    const got = [];
    for (const it of c.items) {
      const left = giveItem(p, it);
      got.push({ kind: it.kind, t: it.t, n: it.n });
      if (left) this.spawnLoot(left, p.x, p.y + 0.05, p.z);
      if (it.kind === 'weapon') this.ev({ k: 'held', n: p.num, w: heldWeapon(p)?.t || null });
    }
    this.ev({ k: 'cont', id, n: p.num });
    this.emitTo(p, 'ev', { k: 'got', items: got, empty: got.length === 0 });
    this.sendInv(p);
  }

  startHarvest(p, id) {
    if (!this.mode.crafting) return;
    const r = this.resources.get(id);
    const def = this.map.resources.find((x) => x.id === id);
    if (!r || !def || r.left <= 0) return;
    if (Math.hypot(def.x - p.x, def.z - p.z) > 3.0 || Math.abs(def.y - p.y) > 2.2) return;
    const info = RESOURCE_NODES[def.kind];
    const ms = info.time * 1000;
    p.search = { kind: 'res', id, x: def.x, y: def.y, z: def.z, until: Date.now() + ms };
    this.emitTo(p, 'ev', { k: 'search', id, ms, label: 'Harvesting ' + info.name });
  }

  completeResource(p, id) {
    const r = this.resources.get(id);
    const def = this.map.resources.find((x) => x.id === id);
    if (!r || !def || r.left <= 0) return;
    r.left--;
    const info = RESOURCE_NODES[def.kind];
    const got = [];
    for (const [t, n] of info.gives) { giveItem(p, { kind: 'mat', t, n }); got.push({ kind: 'mat', t, n }); }
    for (const [t, n, chance] of info.bonus) if (Math.random() < chance) { giveItem(p, { kind: 'mat', t, n }); got.push({ kind: 'mat', t, n }); }
    p.stats.searched++;
    this.ev({ k: 'res', id, left: r.left });
    this.emitTo(p, 'ev', { k: 'got', items: got });
    this.sendInv(p);
  }

  sendInv(p) { if (!p.isBot) this.emitTo(p, 'inv', serializeInv(p)); }
  sendInvLight(p) { if (!p.isBot) this.emitTo(p, 'inv', serializeInv(p)); }

  // Populate loot spots + containers with items from a loot table
  populateLoot(table, opts = {}) {
    const rnd = Math.random;
    for (const spot of this.map.lootSpots) {
      if (rnd() > (opts.fill ?? 0.85)) continue;
      const tier = Math.min(2, spot.tier + (rnd() < 0.15 ? 1 : 0));
      const it = rollTable(table[tier], rnd);
      if (it.kind === 'ammo') it.n = it.n || this.ammoAmount(it.t);
      if (it.kind === 'weapon') it.mag = WEAPONS[it.t].mag;
      this.spawnLoot(it, spot.x, spot.y, spot.z);
      if (opts.ammoWithGuns && it.kind === 'weapon') {
        const a = WEAPONS[it.t].ammo;
        this.spawnLoot({ kind: 'ammo', t: a, n: this.ammoAmount(a) }, spot.x + 0.6, spot.y, spot.z + 0.3);
      }
    }
    for (const c of this.map.containers) {
      const n = c.kind === 'safe' || c.kind === 'ammobox' ? 3 : 2 + (rnd() < 0.4 ? 1 : 0);
      const items = [];
      for (let i = 0; i < n; i++) {
        const it = rollTable(table[Math.min(2, c.tier + (i === 0 && (c.kind === 'safe' || c.kind === 'ammobox') ? 1 : 0))], rnd);
        if (it.kind === 'ammo') it.n = it.n || this.ammoAmount(it.t);
        if (it.kind === 'weapon') it.mag = WEAPONS[it.t].mag;
        items.push(it);
        if (opts.ammoWithGuns && it.kind === 'weapon') items.push({ kind: 'ammo', t: WEAPONS[it.t].ammo, n: this.ammoAmount(WEAPONS[it.t].ammo) });
      }
      this.containers.set(c.id, { opened: false, items, searchBy: null });
    }
  }

  ammoAmount(t) {
    return { light: 24, shells: 10, rifle: 30, heavy: 10, cells: 20 }[t] || 20;
  }
}

export function lootView(l) {
  return { id: l.id, kind: l.kind, t: l.t, n: l.n, x: r2(l.x), y: r2(l.y), z: r2(l.z) };
}

export { itemLabel, lineOfSight, stepBody };
