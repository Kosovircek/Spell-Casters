// One native enemy per biome. They only live in their own biome (any depth) and each one plays with its biome's
// rules. Their numbers (speed, shots, worth) are in bestiary.js like everyone else's.
//
//   Creature ── Drowned      crypt: swims through deep water; under water it cannot be hit and its name is hidden
//      ├─────── Cinderling   forge: fire does not hurt it
//      ├─────── IceYeti      frozen halls: its letters chill you (half speed for a moment)
//      ├─────── GloomStalker catacombs: its name shows only in the light
//      ├─────── SeedSpitter  ruins: a plant whose letters plant vines where they fall
//      ├─────── InkWraith    library: its letters are blots of ink until they come close
//      ├─────── CogSoldier   clockwork: every Cog Soldier fires on the same tick of the vault's clock
//      ├─────── Reflection   mirror maze: looks like a caster and mirrors their steps; its name is back to front
//      ├─────── StormHawk    storm spire: dives at you every few seconds
//      └─────── VoidEye      void rift: blinks next to a caster now and then
import { DT } from '../config.js';
import { Creature, EnemySpell } from '../entities.js';
import { TILE } from '../Dungeon.js';
import { letterDamage } from '../progression.js';
import { rnd, pick } from '../util.js';

const secsLeft = (at, now) => Math.max(0, Math.ceil((at - now) / 1000));

/** Swims: deep water is open water to it. Under water (on any water tile, now and then) it cannot be hit or read. */
export class Drowned extends Creature {
  constructor(x, y, word, type = 'drowned') { super(type, x, y, word); this.diveAt = 0; this.under = false; }
  swims(dg, x, y) { const t = dg.tileUnder(x, y); return t === TILE.DEEP || t === TILE.SHALLOW; }
  moveBy(dg, dx, dy) {
    const ok = (x, y) => { const r = this.radius; return [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]].every(([a, b]) => !dg.solid(a, b) || this.swims(dg, a, b)); };
    if (ok(this.x + dx, this.y)) this.x += dx;
    if (ok(this.x, this.y + dy)) this.y += dy;
  }
  get intangible() { return this.under; }
  think(room, now) {
    const wet = this.swims(room.dungeon, this.x, this.y);
    if (!wet) { if (this.under) { this.under = false; room.emit({ t: 'surface', x: this.x, y: this.y }); } return; }
    if (now < this.diveAt) return;
    this.under = !this.under;
    this.diveAt = now + (this.under ? rnd(2500, 4000) : rnd(2500, 3500));
    room.emit({ t: this.under ? 'dive' : 'surface', x: this.x, y: this.y });
    if (!this.under) this.fireCd = Math.min(this.fireCd, 0.4); // it comes up throwing
  }
  /** Under water it heads for the deep part of the pool; up top it fights like anyone. */
  attack(room, ux, uy, shots) { if (!this.under) super.attack(room, ux, uy, shots); }
  label(now) { return this.under ? { sub: true, show: '~'.repeat(this.lock.word.length) } : {}; }
}

/** Born in the forge: fire does not hurt it. */
export class Cinderling extends Creature {
  constructor(x, y, word) { super('cinder', x, y, word); }
  resists(why) { return ['fire', 'lava', 'meteor', 'drake', 'burn'].includes(why); }
}

/** Its letters chill you: half speed for a moment. */
export class IceYeti extends Creature {
  constructor(x, y, word) { super('yeti', x, y, word); }
  get hitRadius() { return 0.65; }
  onLetterHit(room, pl, now) { pl.setStatus('chill', 1800, now); room.emit({ t: 'status', x: pl.x, y: pl.y, s: 'chill' }); }
}

/** Its name only shows in the light: near a lit brazier, a LUX caster, or right next to a caster. */
export class GloomStalker extends Creature {
  constructor(x, y, word) { super('stalker', x, y, word); this.lit = false; }
  think(room) { this.lit = room.env ? room.env.isLit(this.x, this.y, 2.2) : true; }
  label() { return this.lit ? {} : { show: '?'.repeat(this.lock.word.length), dark: true }; }
}

/** A seed letter: wherever it falls (into a wall, or at the end of its flight), a vine sprouts. */
class SeedLetter extends EnemySpell {
  update(room, now) {
    const px = this.x, py = this.y;
    super.update(room, now);
    if (this.removed && !this.landed) { this.landed = true; room.env?.plantVine(this.ttl <= 0 ? this.x : px, this.ttl <= 0 ? this.y : py); }
  }
  snapshot() { return { ...super.snapshot(), seed: 1 }; }
}
/** A plant that never moves. Its letters are seeds: when they fall, vines grow there. */
export class SeedSpitter extends Creature {
  constructor(x, y, word) { super('spitter', x, y, word); }
  makeLetter(room, x, y, vx, vy) {
    const s = new SeedLetter(x, y, pick(room.pool), vx, vy, letterDamage(this.type, room.floor), this);
    s.ttl = rnd(2.5, 4); // seeds do not fly far
    return s;
  }
}

/** Its letters are ink blots: you only see which letter until it comes close (see Environment.spellView). */
export class InkWraith extends Creature {
  constructor(x, y, word) { super('inkwraith', x, y, word); }
  makeLetter(room, x, y, vx, vy) { const s = super.makeLetter(room, x, y, vx, vy); s.ink = true; return s; }
}

/** Every Cog Soldier on the floor fires on the same beat of the vault's clock (every 2.5 s), all at once. */
export class CogSoldier extends Creature {
  constructor(x, y, word) { super('cogsoldier', x, y, word); this.beat = 0; }
  update(room, now, alive, shots) {
    const beat = Math.floor(now / 2500);
    if (beat !== this.beat) { this.beat = beat; this.fireCd = 0; } else this.fireCd = 99;
    super.update(room, now, alive, shots);
    this.fireCd = 99;
  }
  label(now) { return this.awake ? { tag: `fires in ${secsLeft((this.beat + 1) * 2500, now)}`, tagColor: '#ffca28' } : {}; }
}

/** Looks like the caster it watches (in their colour) and mirrors their steps, left for right. Name back to front. */
export class Reflection extends Creature {
  constructor(x, y, word) { super('reflection', x, y, word); this.copies = null; }
  moveVector(room, target, td, ux, uy, now) {
    this.copies = target;
    if (target.mx === undefined) return super.moveVector(room, target, td, ux, uy, now);
    const [vx, vy] = super.moveVector(room, target, td, ux, uy, now);
    return [-target.mx * 0.9 + vx * 0.3, target.my * 0.9 + vy * 0.3]; // left is right in a mirror
  }
  label() { return { rev: true, mimic: this.copies?.color || '#e1f5fe' }; }
}

/** Dives at its target every few seconds: a quick swoop that you can sidestep. */
export class StormHawk extends Creature {
  constructor(x, y, word) { super('stormhawk', x, y, word); this.diveAt = 0; }
  think(room, now, alive) {
    if (!this.awake) return;
    if (!this.diveAt) this.diveAt = now + rnd(3000, 5000);
    if (now < this.diveAt) return;
    this.diveAt = now + rnd(4000, 6000);
    const t = alive.filter(p => this.distanceTo(p) < 7).sort((a, b) => this.distanceTo(a) - this.distanceTo(b))[0];
    if (!t) return;
    const d = this.distanceTo(t) || 1;
    this.shove((t.x - this.x) / d * 7, (t.y - this.y) / d * 7, Math.min(0.45, d / 7));
    room.emit({ t: 'swoop', x: this.x, y: this.y });
  }
}

/** Sits and stares. Every few seconds it blinks to a spot near a caster it can see. */
export class VoidEye extends Creature {
  constructor(x, y, word) { super('voideye', x, y, word); this.blinkAt = 0; }
  think(room, now, alive) {
    if (!this.awake) return;
    if (!this.blinkAt) this.blinkAt = now + rnd(4000, 6000);
    if (now < this.blinkAt) return;
    this.blinkAt = now + rnd(5000, 7000);
    const t = pick(alive);
    if (!t) return;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = rnd(2.5, 4);
      const x = t.x + Math.cos(a) * r, y = t.y + Math.sin(a) * r;
      if (room.dungeon.blocked(x, y, this.radius) || !room.dungeon.los(t.x, t.y, x, y)) continue;
      room.emit({ t: 'tele', x: this.x, y: this.y });
      this.x = x; this.y = y;
      room.emit({ t: 'tele', x, y });
      break;
    }
  }
  label(now) { return this.awake && this.blinkAt ? { tag: `blinks in ${secsLeft(this.blinkAt, now)}`, tagColor: '#b388ff' } : {}; }
}

export const NATIVES = {
  drowned: Drowned, cinder: Cinderling, yeti: IceYeti, stalker: GloomStalker, spitter: SeedSpitter,
  inkwraith: InkWraith, cogsoldier: CogSoldier, reflection: Reflection, stormhawk: StormHawk, voideye: VoidEye,
};
