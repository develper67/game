// TAG: one random player is IT. Punch someone to pass IT on.
// When the timer runs out, whoever is IT loses and everybody else wins.
export class TagMode {
  constructor(m) {
    this.m = m;
    this.id = 'tag';
    this.combat = false;
    this.it = null;
    this.lastTagger = null;
    this.noTagBackUntil = 0;
    this.endsAt = 0;
  }

  onStart() {
    const alive = this.m.alivePlayers();
    this.endsAt = Date.now() + this.m.modeDef.duration * 1000;
    this.setIt(alive[Math.floor(Math.random() * alive.length)], null);
  }

  setIt(p, from) {
    const now = Date.now();
    if (this.it) this.it.speedMul = 1;
    this.it = p;
    this.lastTagger = from;
    p.speedMul = 1.1;
    p.cd.tag = now + 2000; // freshly tagged player must wait before tagging
    this.noTagBackUntil = now + 4000;
    this.m.broadcastMode();
    if (from) {
      this.m.ev({ k: 'tag', from: from.num, to: p.num });
      this.m.announce(`🏃 ${from.name} tagged ${p.name}! ${p.name} is IT.`, 'event');
    } else {
      this.m.ev({ k: 'tag', from: -1, to: p.num });
      this.m.announce(`🏃 ${p.name} starts as IT! Run!`, 'event');
    }
  }

  onPunch(a, t) {
    const now = Date.now();
    if (a !== this.it) {
      this.m.knockback(t, a, 4.5, 2.5);
      return true;
    }
    if (now < a.cd.tag) return true;
    if (t === this.lastTagger && now < this.noTagBackUntil) {
      this.m.emitTo(a, 'ev', { k: 'toast', text: 'No tag-backs yet!' });
      return true;
    }
    a.stats.tags++;
    this.m.knockback(t, a, 3, 2);
    this.setIt(t, a);
    return true;
  }

  tick(dt, now) {
    if (this.it) this.it.stats.itTime += dt;
    const active = this.m.alivePlayers();
    if (active.length < 2) {
      this.m.finish({ winners: active, reason: 'Everyone else left.' });
      return;
    }
    if (now >= this.endsAt) {
      const loser = this.it;
      const winners = active.filter((p) => p !== loser);
      this.m.ev({ k: 'tagend', loser: loser ? loser.num : -1 });
      this.m.finish({ winners, reason: loser ? `${loser.name} was IT when time ran out.` : 'Time is up.' });
    }
  }

  onLeave(p) {
    if (p === this.it) {
      const alive = this.m.alivePlayers();
      if (alive.length) this.setIt(alive[Math.floor(Math.random() * alive.length)], null);
    }
  }

  onFell(p) {
    const s = this.m.randomSpawn([]);
    this.m.placePlayer(p, s.x, s.y, s.z, s.yaw);
  }

  state() {
    return { mode: 'tag', it: this.it ? this.it.num : -1, endsAt: this.endsAt, tagReadyAt: this.it ? this.it.cd.tag : 0, noTagBack: this.lastTagger ? this.lastTagger.num : -1, noTagBackUntil: this.noTagBackUntil };
  }

  score(p) { return -Math.round(p.stats.itTime * 10); }

  rewards(p) {
    const out = [];
    if (p.stats.tags) out.push({ label: `Tags x${p.stats.tags}`, coins: Math.min(40, p.stats.tags * 8) });
    if (p.stats.itTime < 0.5) out.push({ label: 'Untouchable (never IT)', coins: 25 });
    return out;
  }
}
