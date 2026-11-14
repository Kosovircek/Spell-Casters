// The bosses of the ten biomes. Each guards the stairs on the last floor of its biome's run (floors 3, 6, 9 ... 30,
// and again below). Like every boss, its name has several words (phases); each one has a trick tied to its biome.
//
//   BiomeBoss ── DrownedAbbot      sinks under the water (untouchable, name hidden) and surfaces throwing
//      ├──────── Forgemaster       molten: spells melt on it, except while it cools after slamming its anvil
//      │                           (GELU or GRANDO cool it at once)
//      ├──────── FrostMatron       an ice shell with a word of its own guards every name; fire melts the shell
//      ├──────── LightlessOne      its name is hidden outside the light, and it snuffs the braziers
//      ├──────── Thornmother       grows a ring of thorns around herself: cut through to reach her
//      ├──────── Archivist         every name is the answer to a riddle
//      ├──────── ClockworkColossus its armour opens only for a moment every few seconds (TARDUS holds it open longer)
//      ├──────── GlassSovereign    name back to front; a wrong letter flies straight back at you; it calls Reflections
//      ├──────── Tempest           calls lightning down on everyone near it and blows them back
//      └──────── RiftMaw           breathes in (pulls you close, swallows letters) and out (open to spells);
//                                  CHAOS or PONDUS near it stops the breathing in
import { DT } from '../config.js';
import { Boss, EnemySpell, WordLock } from '../entities.js';
import { letterDamage } from '../progression.js';
import { rnd, pick } from '../util.js';
import { RIDDLES } from './riddles.js';
import { Drowned, SeedSpitter, Reflection } from './natives.js';

const secs = (t) => Math.max(0, Math.ceil(t));

class BiomeBoss extends Boss {
  /** Return a result ('blocked') to stop a spell before it reaches the name, or null to let it through. */
  guardHit(room, spell) { return null; }
  block(room, why) { this.lock.wrong = 0.4; room.emit({ t: 'bblock2', x: this.x, y: this.y, why }); return 'blocked'; }
  hitBy(room, spell) {
    const g = this.guardHit(room, spell);
    if (g) return g;
    const result = this.lock.apply(spell.letters);
    if (result === 'wrong') this.onWrong(room, spell);
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    this.onPhase(room);
    return 'phase';
  }
  onWrong(room, spell) {}
  onPhase(room) {}
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    const base = Math.atan2(uy, ux), speed = Math.min(1.7 + room.floor * 0.08, 3);
    this.volleys++;
    if (this.volleys % 3 === 0) this.ring(room, 6 + this.phase * 2, speed * 0.85, base);
    else this.fan(room, base, 3 + this.phase, 0.3, speed);
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
}

/** Flooded Crypt. Sinks under the water now and then: no spell touches it there, and its name is hidden. */
export class DrownedAbbot extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.under = false; this.turnAt = 0; }
  get type() { return 'abbot'; }
  get intangible() { return this.under; }
  get guarded() { return this.under; }
  get walkSpeed() { return this.under ? 0.9 : 0.45; }
  moveBy(dg, dx, dy) { Drowned.prototype.moveBy.call(this, dg, dx, dy); }
  swims(dg, x, y) { return Drowned.prototype.swims.call(this, dg, x, y); }
  get hint() { return this.under ? `Under the water: it surfaces in ${secs((this.turnAt - Date.now()) / 1000)}s` : `Surfaced for ${secs((this.turnAt - Date.now()) / 1000)}s: spell its name!`; }
  think(room, now) {
    if (!this.awake) return;
    if (!this.turnAt) this.turnAt = now + 5000;
    if (now < this.turnAt) return;
    this.under = !this.under;
    this.turnAt = now + (this.under ? 3500 : Math.max(4000, 6000 - room.floor * 40));
    room.emit({ t: this.under ? 'dive' : 'surface', x: this.x, y: this.y });
    if (!this.under) this.ring(room, 8, 2, Math.random());
  }
  attack(room, ux, uy) { if (!this.under) super.attack(room, ux, uy); }
  onPhase(room) { this.summon(room, 2, (x, y) => new Drowned(x, y, pick(room.pool))); room.say('The Abbot calls the drowned!', 2); }
  label(now) { return this.under ? { sub: true, show: '~'.repeat(this.lock.word.length) } : {}; }
}

/** Volcanic Forge. Molten armour melts spells, except for a few seconds after each slam of its anvil. */
export class Forgemaster extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.coolT = 0; this.slamAt = 0; }
  get type() { return 'forgemaster'; }
  get hitRadius() { return 0.9; }
  get cool() { return this.coolT > 0 || this.is('chill') || this.is('slow'); }
  get guarded() { return !this.cool; }
  get walkSpeed() { return this.cool ? 0.25 : 0.5; }
  wants(letter) { return this.cool && this.lock.next === letter; }
  get hint() { return this.cool ? `Cooling for ${secs(this.coolT)}s: spell its name!` : `Molten: spells melt on it. It cools after its anvil slam (${secs((this.slamAt - Date.now()) / 1000)}s), or freeze it with GELU or GRANDO`; }
  think(room, now) {
    if (this.coolT > 0) this.coolT -= DT;
    if (!this.awake) return;
    if (!this.slamAt) this.slamAt = now + 7000;
    if (now < this.slamAt) return;
    this.slamAt = now + Math.max(8000, 11000 - room.floor * 50);
    this.coolT = 5;
    room.emit({ t: 'slam', x: this.x, y: this.y });
    for (const p of room.alivePlayers) if (this.distanceTo(p) < 2.6) room.env?.hurtCaster(p, letterDamage(this.type, room.floor), now, 'slam');
    this.ring(room, 10, 2.2, Math.random());
  }
  guardHit(room) { return this.cool ? null : this.block(room, 'MOLTEN'); }
  label() { return { ward: this.cool ? null : '#ff7043', open: secs(this.coolT) }; }
}

/** Frozen Halls. An ice shell with a word of its own guards each name; fire melts the shell at once. */
export class FrostMatron extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.shell = null; }
  get type() { return 'matron'; }
  get guarded() { return !!this.shell; }
  grow(room) {
    const len = Math.min(2 + this.phase, 4);
    this.shell = new WordLock(Array.from({ length: len }, () => pick(room.pool)).join(''));
  }
  wants(letter) { return this.shell ? this.shell.next === letter : this.lock.next === letter; }
  get hint() { return this.shell ? 'An ice shell guards her: spell its word (or burn it with fire)' : 'The shell is broken: spell her name!'; }
  wake(room) { this.grow(room); }
  think(room) {
    this.shell?.tick();
    if (this.shell && room.magic.zones.some(z => (z.kind === 'fire' || z.kind === 'lava') && Math.hypot(z.x - this.x, z.y - this.y) <= (z.r || 1.3) + 0.8)) this.melt(room);
  }
  melt(room) { this.shell = null; room.emit({ t: 'shatter2', x: this.x, y: this.y }); room.say('The ice shell breaks!', 2); }
  guardHit(room, spell) {
    if (!this.shell) return null;
    const r = this.shell.apply(spell.letters);
    if (r === 'done') { this.melt(room); return 'hit'; }
    return r;
  }
  onPhase(room) { this.grow(room); }
  onLetterHit(room, pl, now) { pl.frozenUntil = now + 900; room.emit({ t: 'freeze', x: pl.x, y: pl.y }); }
  label() { return this.shell ? { extra: [{ ...this.shell.snapshot(), color: '#b3e5fc' }] } : {}; }
}

/** Dark Catacombs. Its name shows only in the light, and it snuffs the braziers around it. */
export class LightlessOne extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.lit = false; this.snuffAt = 0; }
  get type() { return 'lightless'; }
  get hint() { return this.lit ? 'In the light: spell its name!' : 'It hides in the dark: light the braziers (spell their letters) or cast LUX'; }
  snuffNearest(room) {
    const b = room.critters.filter(c => c.kind === 'brazier' && c.lit).sort((a, c) => this.distanceTo(a) - this.distanceTo(c))[0];
    if (b) { b.snuff(room); room.say('The Lightless One snuffs a brazier!', 2); }
  }
  think(room, now) {
    this.lit = room.env ? room.env.isLit(this.x, this.y, 2) : true;
    if (!this.awake) return;
    if (!this.snuffAt) this.snuffAt = now + 12000;
    if (now >= this.snuffAt) { this.snuffAt = now + Math.max(9000, 15000 - room.floor * 60); this.snuffNearest(room); }
  }
  onPhase(room) { for (const b of room.critters) if (b.kind === 'brazier' && b.lit && b.distanceTo(this) < 8) b.snuff(room); room.say('Darkness swallows the room!', 2); }
  label() { return this.lit ? {} : { show: '?'.repeat(this.lock.word.length), dark: true }; }
}

/** Overgrown Ruins. Grows a ring of thorns around herself (and again with every name); seed spitters sprout. */
export class Thornmother extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.growAt = 0; }
  get type() { return 'thornmother'; }
  get walkSpeed() { return 0.2; }
  get hint() { return 'Cut through her thorns (a letter spell cuts a vine, fire burns them), then spell her name'; }
  thorns(room) {
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      room.env?.plantVine(this.x + Math.cos(a) * 2.3, this.y + Math.sin(a) * 2.3);
    }
  }
  wake(room) { this.thorns(room); this.growAt = Date.now() + 20000; }
  think(room, now) { if (this.awake && now >= this.growAt) { this.growAt = now + 20000; this.thorns(room); } }
  onPhase(room) {
    this.thorns(room);
    this.summon(room, 2, (x, y) => new SeedSpitter(x, y, pick(room.pool)));
  }
}

/** Library of Echoes. Every name is the answer to a riddle, shown above it. */
export class Archivist extends BiomeBoss {
  constructor(x, y, words, riddles = null) {
    super(x, y, words);
    this.riddles = riddles || words.map(w => RIDDLES.findIndex(r => r.a === w));
    this.misses = 0; this.hintAt = 0;
  }
  static makeNames(room, phases) {
    const picks = [];
    while (picks.length < phases) { const r = pick(RIDDLES); if (!picks.includes(r)) picks.push(r); }
    return picks.sort((a, b) => a.a.length - b.a.length).map(r => r.a);
  }
  get type() { return 'archivist'; }
  get riddle() { return RIDDLES[this.riddles[this.phase]] || null; }
  get hint() { return 'Spell the answer to its riddle'; }
  onWrong(room, spell) {
    if (++this.misses % 3 === 0) { this.hintAt = this.lock.progress + 1; spell.owner?.tell?.(`A page flutters open: the next letter is ${this.lock.next}.`); }
  }
  onPhase() { this.misses = 0; this.hintAt = 0; }
  label() {
    const w = this.lock.word;
    return { show: [...w].map((c, i) => (i < this.hintAt ? c : '?')).join(''), q: this.riddle?.q || null };
  }
}

/** Clockwork Vault. Its armour opens only for a moment on every turn of its clock; TARDUS holds it open longer. */
export class ClockworkColossus extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.clock = 0; }
  get type() { return 'colossus'; }
  get hitRadius() { return 0.9; }
  get slowed() { return this.is('slow'); }
  get period() { return this.slowed ? 9 : 6; }
  get window() { return this.slowed ? 4.5 : 2.2; }
  get open() { return this.clock % this.period >= this.period - this.window; }
  get guarded() { return !this.open; }
  wants(letter) { return this.lock.next === letter; } // you may aim at it any time and hope the timing works
  get hint() { return this.open ? 'Its armour is open: spell its name!' : `Armour shut: it opens in ${secs(this.period - this.window - this.clock % this.period)}s (TARDUS slows its clock)`; }
  think(room) {
    if (!this.awake) return;
    const was = this.open;
    this.clock += DT;
    if (this.open && !was) { room.emit({ t: 'gears', x: this.x, y: this.y }); this.ring(room, 8, 2.1, Math.random()); }
  }
  guardHit(room) { return this.open ? null : this.block(room, 'ARMOUR'); }
  label() { return this.open ? { tag: 'OPEN', tagColor: '#ffd54f' } : { ward: '#b0bec5', tag: `opens in ${secs(this.period - this.window - this.clock % this.period)}`, tagColor: '#ffca28' }; }
}

/** Mirror Maze. Its name is written back to front, a wrong letter flies straight back, and it calls Reflections. */
export class GlassSovereign extends BiomeBoss {
  get type() { return 'sovereign'; }
  get hint() { return 'Read its name right to left. Wrong letters bounce back at you'; }
  onWrong(room, spell) {
    const pl = spell.owner;
    if (!pl || pl.dead) return;
    const d = Math.hypot(pl.x - this.x, pl.y - this.y) || 1, speed = 3.4;
    room.spells.push(new EnemySpell(this.x, this.y, spell.letters[0], (pl.x - this.x) / d * speed, (pl.y - this.y) / d * speed, letterDamage(this.type, room.floor), this));
    room.emit({ t: 'mreflect', x: this.x, y: this.y, l: spell.letters[0] });
  }
  onPhase(room) { this.summon(room, 2, (x, y) => new Reflection(x, y, pick(room.pool))); room.say('Reflections step out of the glass!', 2); }
  label() { return { rev: true }; }
}

/** Storm Spire. Calls lightning on everyone near it, and its gusts blow casters back. */
export class Tempest extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.boltAt = 0; this.gustAt = 0; }
  get type() { return 'tempest'; }
  get hint() { return 'Step out of the glowing circles; spell its name between the gusts'; }
  think(room, now, alive) {
    if (!this.awake || !room.env) return;
    if (now >= this.boltAt) {
      this.boltAt = now + Math.max(2200, 3200 - this.phase * 300);
      for (const p of alive) if (this.distanceTo(p) < 10) room.env.strike(p, 1.0, 1.2);
    }
    if (now >= this.gustAt) {
      this.gustAt = now + 7000;
      room.emit({ t: 'gust', x: this.x, y: this.y, dx: 0, dy: 0 });
      for (const p of alive) {
        const d = this.distanceTo(p);
        if (d > 5 || d < 0.01) continue;
        p.shove((p.x - this.x) / d * 6, (p.y - this.y) / d * 6, 0.35, now);
      }
    }
  }
}

/** Void Rift. Breathes in (pulls you close, swallows letter spells near it) and out (open to spells). */
export class RiftMaw extends BiomeBoss {
  constructor(x, y, words) { super(x, y, words); this.clock = 0; }
  get type() { return 'riftmaw'; }
  get hitRadius() { return 0.9; }
  get walkSpeed() { return 0.3; }
  /** CHAOS or PONDUS close to it chokes its breath. */
  choked(room) { return room.magic.zones.some(z => (z.kind === 'void' || z.kind === 'gravity') && Math.hypot(z.x - this.x, z.y - this.y) <= 4); }
  get inhaling() { return this.awake && this.clock % 8.5 < 4.5 && !this.chokedNow; }
  get guarded() { return this.inhaling; }
  get hint() { return this.inhaling ? 'Breathing in: it swallows letter spells and pulls you close (CHAOS or PONDUS chokes it)' : 'Breathing out: spell its name!'; }
  think(room, now, alive) {
    if (!this.awake) return;
    this.chokedNow = this.choked(room);
    const was = this.inhaling;
    this.clock += DT;
    if (was && !this.inhaling) this.ring(room, 10, 2.2, Math.random());
    if (!this.inhaling) return;
    for (const p of alive) {
      const d = this.distanceTo(p);
      if (d < 7 && d > 1.2) p.moveBy(room.dungeon, (this.x - p.x) / d * 1.5 * DT, (this.y - p.y) / d * 1.5 * DT);
    }
    for (const s of room.spells) {
      if (!s.fromPlayer || s.rune || s.removed || this.distanceTo(s) > 2.2) continue;
      s.removed = true;
      room.emit({ t: 'crush', x: s.x, y: s.y, l: s.letters });
    }
  }
  guardHit(room) { return this.inhaling ? this.block(room, 'SWALLOWED') : null; }
  label() { return this.inhaling ? { ward: '#7c4dff' } : {}; }
}

export const BIOME_BOSSES = {
  abbot: DrownedAbbot, forgemaster: Forgemaster, matron: FrostMatron, lightless: LightlessOne, thornmother: Thornmother,
  archivist: Archivist, colossus: ClockworkColossus, sovereign: GlassSovereign, tempest: Tempest, riftmaw: RiftMaw,
};
