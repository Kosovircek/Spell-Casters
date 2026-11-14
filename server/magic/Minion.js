// Summoned helpers. Every summon belongs to the caster who called it, lasts a while and fights that caster's foes
// (the enemies in the dungeon, the other caster in a duel).
//
// In the dungeon enemies have no HP, so a summon's bite takes a letter, like a spell. Enemy letters can hit the
// summons that stand in the way (wolf, golem, decoy: `soak` letters before they break).
// In a duel most summons carry a short name of their own: the other caster can spell it to break the summon.
import { Actor } from '../entities.js';
import { WordLock } from '../entities.js';
import { DT } from '../config.js';
import { rnd, pick } from '../util.js';

const EASY = 'ETANIMSOURDK';
const duelWord = (n) => Array.from({ length: n }, () => pick(EASY)).join('');

export class Minion extends Actor {
  /** magic = the room's Magic, owner = the caster, kind = which summon, secs = how long it lasts. */
  constructor(magic, owner, kind, x, y, secs, opts = {}) {
    super(x, y, opts.radius ?? 0.25);
    this.magic = magic;
    this.owner = owner;
    this.kind = kind;
    this.until = Date.now() + secs * 1000;
    this.speed = opts.speed ?? 3;
    this.flying = !!opts.flying;      // flies over walls
    this.lure = !!opts.lure;          // enemies would rather shoot at it than at a caster
    this.soak = opts.soak ?? 0;       // enemy letters it can take before it breaks (0: they fly through)
    this.lock = magic.duel && opts.word ? new WordLock(duelWord(opts.word)) : null; // its name in a duel
    this.nextAt = Date.now() + (opts.first ?? 600);
  }
  get dead() { return this.removed; }
  /** Enemies looking for something to shoot at can always see a summon close enough. */
  visibleFrom(d) { return d < 10; }
  expire() { this.removed = true; this.magic.room.emit({ t: 'unsummon', x: this.x, y: this.y, k: this.kind }); }

  update(now) {
    if (now >= this.until || (this.owner.dead && this.kind !== 'decoy') || !this.magic.room.players.has(this.owner.id)) return this.expire();
    this.lock?.tick();
    this.applyKnock(this.magic.room.dungeon, now);
    this.think(now);
  }
  think(now) {}

  /** Walk (or fly) toward a point, at most `speed` tiles a second; stops `stop` tiles short. */
  walkTo(x, y, stop = 0, speed = this.speed) {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d <= stop || d < 0.01) return d;
    const step = Math.min(d - stop, speed * DT);
    if (this.flying) { this.x += dx / d * step; this.y += dy / d * step; }
    else this.moveBy(this.magic.room.dungeon, dx / d * step, dy / d * step);
    return d;
  }
  /** Stay near my caster. */
  heel(dist = 1.4, speed = this.speed) {
    const o = this.owner, a = (this.id % 6) * Math.PI / 3;
    return this.walkTo(o.x + Math.cos(a) * dist, o.y + Math.sin(a) * dist, 0.3, speed);
  }
  nearestFoe(range, needSight = !this.flying) {
    const dg = this.magic.room.dungeon;
    let best = null, bd = range;
    for (const f of this.magic.foes(this.owner)) {
      const d = this.distanceTo(f);
      if (d < bd && (!needSight || dg.los(this.x, this.y, f.x, f.y))) { bd = d; best = f; }
    }
    return best;
  }
  /** An enemy letter (or, in a duel, a foe's spell) hit me. Returns true if it is used up. */
  soaked(spell) {
    if (!this.soak) return false;
    this.soak -= this.magic.duel ? spell.letters.length : 1;
    this.magic.room.emit({ t: 'soak', x: this.x, y: this.y, l: spell.letters });
    if (this.soak <= 0) this.expire();
    return true;
  }
  snapshot(now) {
    return {
      id: this.id, x: +this.x.toFixed(3), y: +this.y.toFixed(3), k: this.kind, c: this.owner.color, pid: this.owner.id,
      t: Math.max(0, Math.ceil((this.until - now) / 1000)),
      ...(this.lock ? { word: this.lock.word, p: this.lock.progress, flash: this.lock.flash > 0 } : {}),
    };
  }
}

/** DAEMON: an imp that hunts the nearest foe and bites (three bites, then it is gone). */
export class Imp extends Minion {
  constructor(m, o, x, y) { super(m, o, 'imp', x, y, 15, { speed: 3.2, word: 1 }); this.bites = 2; }
  think(now) {
    const f = this.nearestFoe(10, false);
    if (!f) return this.heel();
    const d = this.walkTo(f.x, f.y, 0.4);
    if (d < 0.75 && now >= this.nextAt) {
      this.nextAt = now + 1200;
      this.magic.hurt(f, 1, 4, this.owner, 'bite', this);
      if (--this.bites <= 0) this.expire();
    }
  }
}

/** LUPUS: a wolf that keeps by you and bites foes that come within 5 tiles. Takes six enemy letters. */
export class Wolf extends Minion {
  constructor(m, o, x, y) { super(m, o, 'wolf', x, y, 25, { speed: 3.4, soak: 6, word: 3, radius: 0.3 }); }
  think(now) {
    const f = this.nearestFoe(5);
    if (!f || this.owner.distanceTo(f) > 7) return this.heel(1.2);
    const d = this.walkTo(f.x, f.y, 0.5);
    if (d < 0.85 && now >= this.nextAt) { this.nextAt = now + 1600; this.magic.hurt(f, 1, 5, this.owner, 'bite', this); }
  }
}

/** VESPER: one of four bats circling you; it snaps up a foe's spell that flies close, and is gone. */
export class Bat extends Minion {
  constructor(m, o, x, y, k) { super(m, o, 'bat', x, y, 14, { speed: 6, flying: true, word: 1 }); this.angle = k * Math.PI / 2; }
  think(now) {
    this.angle += 3 * DT;
    this.walkTo(this.owner.x + Math.cos(this.angle) * 1.2, this.owner.y + Math.sin(this.angle) * 1.0 - 0.2, 0, 8);
    for (const s of this.magic.foeSpells(this.owner)) {
      if (Math.hypot(s.x - this.x, s.y - this.y) > 1.6) continue;
      s.removed = true;
      this.magic.room.emit({ t: 'eat', x: s.x, y: s.y, l: s.letters });
      this.expire();
      return;
    }
  }
}

/** CALVA: a floating skull that spits letters at the nearest foe. In the dungeon it spits the very letter needed. */
export class Skull extends Minion {
  constructor(m, o, x, y) { super(m, o, 'skull', x, y, 15, { speed: 0, flying: true, word: 2 }); }
  think(now) {
    if (now < this.nextAt) return;
    const f = this.nearestFoe(8, true);
    if (!f) return;
    this.nextAt = now + 1400;
    const d = this.distanceTo(f) || 1, dx = (f.x - this.x) / d, dy = (f.y - this.y) / d;
    const letter = this.magic.duel ? pick('ETANIM') : f.lock?.next;
    if (!letter) return;
    this.magic.room.spells.push(this.magic.makeSpell(this.owner, letter, dx, dy, this.magic.duel ? { kind: 'player', id: f.id } : { kind: 'enemy', id: f.id }, this));
    this.magic.room.emit({ t: 'spit', x: this.x, y: this.y, c: this.owner.color });
  }
}

/** TALOS: a bronze golem that walks toward the foes; enemies shoot at it instead, and it swallows spells. */
export class Golem extends Minion {
  constructor(m, o, x, y) { super(m, o, 'golem', x, y, 20, { speed: 0.8, lure: true, soak: 12, word: 4, radius: 0.4 }); }
  think() {
    const f = this.nearestFoe(12, false);
    if (f) this.walkTo(f.x, f.y, this.magic.duel ? 3.5 : 2);
    else this.heel(1.5, 1.5);
  }
}

/** ARANEA: a spider that follows you and shoots webs; the foe it hits is stuck. */
export class Spider extends Minion {
  constructor(m, o, x, y) { super(m, o, 'spider', x, y, 20, { speed: 3, word: 2 }); }
  think(now) {
    this.heel(1.3);
    if (now < this.nextAt) return;
    const f = this.nearestFoe(6, true);
    if (!f) return;
    this.nextAt = now + 2500;
    const m = this.magic, tx = f.x, ty = f.y;
    m.room.emit({ t: 'web', x: this.x, y: this.y, x2: tx, y2: ty });
    m.mark('web', tx, ty, 0.35, { r: 0.9 }, () => {
      for (const g of m.foes(this.owner)) if (Math.hypot(g.x - tx, g.y - ty) < 0.9) m.status(g, 'root', m.duel ? 1200 : 2000, this.owner);
    });
  }
}

/** LARVA: a ghost that glides through walls to the nearest foe and frightens it. */
export class Ghost extends Minion {
  constructor(m, o, x, y) { super(m, o, 'ghost', x, y, 12, { speed: 2.6, flying: true, word: 2 }); }
  think(now) {
    const f = this.nearestFoe(14, false);
    if (!f) return this.heel();
    if (this.walkTo(f.x, f.y, 0) < 0.6) {
      const m = this.magic;
      if (m.duel) { f.send({ t: 'drop' }); m.status(f, 'silence', 1000, this.owner); }
      else m.status(f, 'fear', 4000, this.owner);
      m.room.emit({ t: 'boo', x: f.x, y: f.y });
      this.removed = true;
    }
  }
}

/** IDOLUM: a totem that heals its caster and their teammates nearby. */
export class Totem extends Minion {
  constructor(m, o, x, y) { super(m, o, 'totem', x, y, 12, { speed: 0, word: 3, radius: 0.3 }); }
  think(now) {
    if (now < this.nextAt) return;
    this.nextAt = now + 800;
    for (const a of this.magic.allies(this.owner)) {
      if (a.distanceTo(this) > 3) continue;
      const got = a.heal(1);
      if (got) this.magic.room.emit({ t: 'regen', x: a.x, y: a.y, n: got });
    }
  }
}

/** IMAGO: a copy of you that walks off the way you aimed. Enemies (and a duel foe's spells) go for it. */
export class Decoy extends Minion {
  constructor(m, o, x, y, dx, dy) { super(m, o, 'decoy', x, y, 8, { speed: 1.4, lure: true, soak: 3, radius: 0.3 }); this.dx = dx; this.dy = dy; }
  think() {
    const bx = this.x, by = this.y;
    this.moveBy(this.magic.room.dungeon, this.dx * this.speed * DT, this.dy * this.speed * DT);
    if (Math.hypot(this.x - bx, this.y - by) < this.speed * DT * 0.3) { const a = Math.random() * Math.PI * 2; this.dx = Math.cos(a); this.dy = Math.sin(a); } // bumped a wall: turn
  }
  snapshot(now) {
    const o = this.owner, t = o.typing;
    return { ...super.snapshot(now), name: o.name, ...((t.s || t.b || t.k) ? { ty: t } : {}) }; // it even "types" what you type
  }
}

/** EXAMEN: one of seven tiny spirits that dart at a foe, take a letter and fade. */
export class Wisp extends Minion {
  constructor(m, o, x, y, foe) { super(m, o, 'wisp', x, y, 6, { speed: 5, flying: true }); this.foe = foe; this.wob = rnd(0, 6); }
  think(now) {
    if (!this.foe || this.foe.removed || this.foe.dead) this.foe = this.nearestFoe(12, false);
    if (!this.foe) return this.heel(1, 4);
    this.wob += DT * 9;
    const d = this.walkTo(this.foe.x + Math.cos(this.wob) * 0.3, this.foe.y + Math.sin(this.wob) * 0.3, 0);
    if (d < 0.5) { this.magic.hurt(this.foe, 1, 2, this.owner, 'sting', this); this.removed = true; }
  }
}

/** DRACO: a small drake that flies with you over walls and breathes fire at foes. */
export class Drake extends Minion {
  constructor(m, o, x, y) { super(m, o, 'drake', x, y, 20, { speed: 4, flying: true, word: 4, first: 1200 }); }
  think(now) {
    this.walkTo(this.owner.x - 0.9, this.owner.y - 1.1, 0.2, 5);
    if (now < this.nextAt) return;
    const f = this.nearestFoe(6, false);
    if (!f) return;
    this.nextAt = now + 2600;
    const m = this.magic, sx = this.x, sy = this.y, d = Math.hypot(f.x - sx, f.y - sy) || 1, ux = (f.x - sx) / d, uy = (f.y - sy) / d;
    m.mark('breath', sx, sy, 0.45, { x2: sx + ux * 3.5, y2: sy + uy * 3.5 }, () => {
      m.room.emit({ t: 'breath', x: sx, y: sy, x2: sx + ux * 3.5, y2: sy + uy * 3.5 });
      for (const g of m.foes(this.owner)) {
        const gx = g.x - sx, gy = g.y - sy, gd = Math.hypot(gx, gy);
        if (gd > 4 || gd < 0.01 || (gx * ux + gy * uy) / gd < Math.cos(0.55)) continue;
        m.hurt(g, 1, 8, this.owner, 'burn', this);
        m.zone('fire', g.x, g.y, 1, 2, this.owner, { every: m.duel ? 500 : 1000, hp: 3 });
      }
    });
  }
}
