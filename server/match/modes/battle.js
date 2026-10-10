// HIDDEN GUNS and SCAVENGE & CRAFT share last-survivor rules.
import { GUN_LOOT, CRAFT_LOOT, RESOURCE_NODES, WEAPONS } from '../../../shared/items.js';

class BattleBase {
  constructor(m) {
    this.m = m;
    this.combat = true;
    this.endsAt = 0;
  }

  onStart() {
    this.endsAt = Date.now() + this.m.modeDef.duration * 1000;
    this.m.broadcastMode();
  }

  tick(dt, now) {
    const alive = this.m.alivePlayers();
    if (alive.length <= 1) {
      this.m.finish({ winners: alive, reason: alive.length ? `${alive[0].name} is the last survivor!` : 'Nobody survived.' });
      return;
    }
    if (now >= this.endsAt) {
      const sorted = alive.slice().sort((a, b) => (b.stats.elims - a.stats.elims) || (b.hp + b.armor - a.hp - a.armor));
      const top = sorted[0];
      this.m.finish({ winners: [top], reason: `Time! ${top.name} had the most eliminations among survivors.` });
    }
  }

  onElim() {
    this.m.broadcastMode();
  }

  onLeave() { this.m.broadcastMode(); }

  state() {
    return { mode: this.id, endsAt: this.endsAt, alive: this.m.alivePlayers().length, total: this.m.participants().length };
  }

  score(p) { return p.alive ? 1e6 + p.hp : 0; }

  rewards(p) {
    const out = [];
    if (p.stats.elims) out.push({ label: `Eliminations x${p.stats.elims}`, coins: Math.min(75, p.stats.elims * 15) });
    const survived = ((p.alive ? Date.now() : p.eliminatedAt) - (this.m.startedAt || Date.now())) / 1000;
    if (survived > 20) out.push({ label: 'Survival time', coins: Math.min(30, Math.round(survived / 10)) });
    if (p.placement === 2) out.push({ label: 'Runner-up', coins: 25 });
    if (p.placement === 3) out.push({ label: 'Third place', coins: 12 });
    return out;
  }
}

export class GunsMode extends BattleBase {
  constructor(m) { super(m); this.id = 'guns'; }

  setupWorld() {
    this.m.populateLoot(GUN_LOOT, { fill: 0.9, ammoWithGuns: false });
    // Guarantee enough guns for everybody: convert spare loot into pistols/SMGs.
    const players = this.m.participants().length;
    let guns = [...this.m.loot.values()].filter((l) => l.kind === 'weapon').length;
    for (const c of this.m.containers.values()) guns += c.items.filter((i) => i.kind === 'weapon').length;
    const want = Math.ceil(players * 2.2);
    for (const l of this.m.loot.values()) {
      if (guns >= want) break;
      if (l.kind === 'heal' || (l.kind === 'ammo' && Math.random() < 0.5)) {
        l.kind = 'weapon'; l.t = Math.random() < 0.6 ? 'pistol' : 'smg'; l.n = 1; l.mag = WEAPONS[l.t].mag;
        guns++;
      }
    }
  }

  rewards(p, won) {
    return super.rewards(p, won);
  }
}

export class CraftMode extends BattleBase {
  constructor(m) { super(m); this.id = 'craft'; this.crafting = true; }

  setupWorld() {
    this.m.populateLoot(CRAFT_LOOT, { fill: 0.95 });
    for (const r of this.m.map.resources) this.m.resources.set(r.id, { left: RESOURCE_NODES[r.kind]?.uses ?? 3 });
  }

  rewards(p, won) {
    const out = super.rewards(p, won);
    if (p.stats.crafted) out.push({ label: `Items crafted x${p.stats.crafted}`, coins: Math.min(30, p.stats.crafted * 3) });
    return out;
  }
}
