// HOT POTATO: one player holds the ridiculous Boob-tato. Pass it with E
// (or a punch) to a nearby player. When it pops, the holder loses a life.
// Out of lives = eliminated. Last player standing wins.
import { lineOfSight } from '../../../shared/physics.js';

const LIVES = 2;

export class HotPotatoMode {
  constructor(m) {
    this.m = m;
    this.id = 'hotpotato';
    this.combat = false;
    this.holder = null;
    this.popAt = 0;
    this.round = 0;
    this.intermissionUntil = 0;
    this.lastGiver = null;
    this.noPassBackUntil = 0;
    this.endsAt = 0;
  }

  onStart() {
    for (const p of this.m.alivePlayers()) p.lives = LIVES;
    this.endsAt = Date.now() + this.m.duration * 1000;
    this.newRound();
  }

  newRound(exclude) {
    const alive = this.m.alivePlayers();
    if (alive.length < 2) return;
    this.round++;
    const pool = alive.length > 2 && exclude ? alive.filter((p) => p !== exclude) : alive;
    const holder = pool[Math.floor(Math.random() * pool.length)];
    const fuse = Math.max(11, 24 - this.round * 1.5) + Math.random() * 7;
    this.popAt = Date.now() + fuse * 1000;
    this.intermissionUntil = 0;
    this.lastGiver = null;
    this.setHolder(holder, null);
    this.m.announce(`🔥 Round ${this.round}: ${holder.name} has the Boob-tato!`, 'event');
  }

  setHolder(p, from) {
    const now = Date.now();
    if (this.holder) this.holder.speedMul = 1;
    this.holder = p;
    if (p) {
      p.speedMul = 1.08;
      p.cd.tag = now + 600; // can't instantly pass again
    }
    this.lastGiver = from;
    this.noPassBackUntil = now + 1500;
    this.m.broadcastMode();
    this.m.ev({ k: 'pass', from: from ? from.num : -1, to: p ? p.num : -1 });
  }

  tryPass(a, t) {
    const now = Date.now();
    if (a !== this.holder || !t || !t.alive || t.left || t === a) return false;
    if (now < a.cd.tag) return false;
    if (t === this.lastGiver && now < this.noPassBackUntil) {
      this.m.emitTo(a, 'ev', { k: 'toast', text: 'No pass-backs yet!' });
      return false;
    }
    a.stats.passes++;
    this.setHolder(t, a);
    return true;
  }

  onUse(p, d) {
    if (d.k !== 'player') return false;
    if (typeof d.id !== 'number') return true;
    const t = this.m.byNum[d.id | 0];
    if (!t || !t.alive || t.left || t === p) return true;
    if (Math.hypot(t.x - p.x, t.z - p.z) > 3.0 || Math.abs(t.y - p.y) > 2) return true;
    const e = this.m.eye(p);
    if (!lineOfSight(this.m.world, e.x, e.y, e.z, t.x, t.y + 1.1, t.z)) return true; // no passing through walls
    this.tryPass(p, t);
    return true;
  }

  onPunch(a, t) {
    if (a === this.holder) { this.tryPass(a, t); return true; }
    this.m.knockback(t, a, 5, 2.8); // shove
    return true;
  }

  tick(dt, now) {
    const alive = this.m.alivePlayers();
    if (alive.length <= 1) {
      this.m.finish({ winners: alive, reason: alive.length ? `${alive[0].name} survived the Boob-tato!` : '' });
      return;
    }
    if (this.holder) this.holder.stats.heldTime += dt;
    if (this.intermissionUntil) {
      if (now >= this.intermissionUntil) this.newRound(this.lastPopped);
      return;
    }
    if (!this.holder || !this.holder.alive) { this.newRound(); return; }
    if (now >= this.popAt) this.pop();
    if (now >= this.endsAt) {
      // Safety valve: most lives remaining wins
      const best = Math.max(...alive.map((p) => p.lives));
      this.m.finish({ winners: alive.filter((p) => p.lives === best), reason: 'Time ran out — most lives left wins.' });
    }
  }

  pop() {
    const p = this.holder;
    p.lives--;
    p.stats.pops++;
    this.lastPopped = p;
    this.m.ev({ k: 'pop', n: p.num, x: p.x, y: p.y + 1.6, z: p.z, lives: p.lives });
    for (const q of this.m.alivePlayers()) if (q !== p) q.stats.roundsSurvived++;
    this.holder = null;
    p.speedMul = 1;
    if (p.lives <= 0) {
      this.m.eliminate(p, null, 'pop', false);
    } else {
      this.m.announce(`💥 The Boob-tato popped on ${p.name}! ${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left.`, 'elim');
    }
    this.intermissionUntil = Date.now() + 3500;
    this.m.broadcastMode();
  }

  onElim() { /* handled in tick */ }

  onLeave(p) {
    if (p === this.holder) {
      this.holder = null;
      this.intermissionUntil = Date.now() + 2000;
      this.m.broadcastMode();
    }
  }

  onFell(p) {
    const s = this.m.randomSpawn([]);
    this.m.placePlayer(p, s.x, s.y, s.z, s.yaw);
  }

  state() {
    const lives = {};
    for (const p of this.m.byNum) lives[p.num] = p.lives;
    return {
      mode: 'hotpotato', holder: this.holder ? this.holder.num : -1, popAt: this.popAt, round: this.round, lives,
      intermissionUntil: this.intermissionUntil, passReadyAt: this.holder ? this.holder.cd.tag : 0,
      noPassBack: this.lastGiver ? this.lastGiver.num : -1, noPassBackUntil: this.noPassBackUntil, maxLives: LIVES,
    };
  }

  score(p) { return p.lives * 1000 + p.stats.roundsSurvived; }

  rewards(p) {
    const out = [];
    if (p.stats.roundsSurvived) out.push({ label: `Rounds survived x${p.stats.roundsSurvived}`, coins: Math.min(50, p.stats.roundsSurvived * 10) });
    if (p.stats.passes) out.push({ label: `Passes x${p.stats.passes}`, coins: Math.min(25, p.stats.passes * 3) });
    return out;
  }
}
