// The 20 rare enemies. Each one has a trick that changes how you fight it or how you have to spell its name.
// Their speed, shots and worth come from bestiary.js like everyone else's; only the tricks live here.
//
//   Creature ── Mimic         looks like a chest until you come close (or cast at it)
//      ├─────── TwinSlime     splits into two slimes, each holding half of its name
//      ├─────── MorseMoth     its name is written only in Morse
//      ├─────── Pickpocket    never attacks: it steals gold and runs; spell it to get the gold back, doubled
//      ├─────── Mirrorling    its name is shown back to front
//      ├─────── JumbleSprite  the letters of its name shuffle every few seconds
//      ├─────── Mockingbird   a wrong letter teaches it that letter: its name grows
//      ├─────── FuseBeetle    a lit fuse: spell it before it reaches you and blows up
//      ├─────── Phantom       fades in and out; spells pass through it while it is faded
//      ├─────── Lurker        its name only shows when a caster is close
//      ├─────── Keyshell      every spell has to start with the key letter on its shell
//      ├─────── BlinkImp      blinks to a new spot every time a spell takes letters off
//      ├─────── Mossback      letters you removed grow back if you leave it alone
//      ├─────── Gremlin       comes in pairs with the same name: finish both before one gets back up
//      ├─────── Bloodleech    every letter of its that hurts you gives it a letter back
//      ├─────── BroodMother   lays spiderlings until you spell it
//      ├─────── HollowScribe  every other letter of its name is hidden: guess the word
//      ├─────── MirrorKnight  throws a wrong letter right back at you
//      ├─────── WarhornGoblin makes every enemy near it throw twice as fast
//      └─────── FrostWisp     its letters freeze you in place for a moment
import { Creature, Slime, EnemySpell, WordLock } from './entities.js';
import { letterDamage } from './progression.js';
import { rnd, pick } from './util.js';

const secsLeft = (at, now) => Math.max(0, Math.ceil((at - now) / 1000));

/** Looks like a chest, with a chest's word, until a caster comes close or a spell hits it. Then it bites. */
export class Mimic extends Creature {
  constructor(x, y, word) { super('mimic', x, y, word); this.disguised = true; }
  /** Chest-like words: it hides among them. */
  static makeWord(room, words) { const ok = words.filter(w => w.length >= 2 && w.length <= 3 + Math.floor(room.floor / 2)); return ok.length ? pick(ok) : pick(room.pool) + pick(room.pool); }
  reveal(room) {
    if (!this.disguised) return;
    this.disguised = false; this.awake = true; this.fireCd = 0.8;
    room.emit({ t: 'mimic', x: this.x, y: this.y });
    room.say('That chest has teeth: a Mimic!', 2);
  }
  update(room, now, alive, shots) {
    if (!this.disguised) return super.update(room, now, alive, shots);
    this.lock.tick();
    if (alive.some(p => this.distanceTo(p) < 1.8)) this.reveal(room);
  }
  hitBy(room, spell) { this.reveal(room); return super.hitBy(room, spell); }
  label() { return this.disguised ? { disguise: true } : {}; }
}

/** Spell it and it splits into two slimes: the first half of its name and the second half. */
export class TwinSlime extends Creature {
  constructor(x, y, word) { super('twinslime', x, y, word); }
  onDefeated(room) {
    const w = this.lock.word, cut = Math.ceil(w.length / 2);
    const halves = w.length > 1 ? [w.slice(0, cut), w.slice(cut)] : [w, w];
    halves.forEach((half, k) => {
      let x = this.x + (k ? 0.5 : -0.5), y = this.y;
      if (room.dungeon.blocked(x, y, 0.32)) x = this.x;
      const s = new Slime(x, y, half); s.awake = true; s.fireCd = rnd(2, 4);
      room.enemies.push(s);
    });
    room.emit({ t: 'split', x: this.x, y: this.y });
  }
}

/** A moth whose name is only ever shown in Morse code. */
export class MorseMoth extends Creature {
  constructor(x, y, word) { super('moth', x, y, word); }
  label() { return { morse: true }; }
}

/**
 * Never throws a letter. It runs at you, grabs some gold and runs away with it.
 * Whoever spells it gets the stolen gold back, doubled.
 */
export class Pickpocket extends Creature {
  constructor(x, y, word) { super('pickpocket', x, y, word); this.loot = 0; }
  moveVector(room, target, td, ux, uy, now) {
    if (!this.loot) return [ux, uy];
    if (td > 9) return [0, 0];
    const [vx, vy] = super.moveVector(room, target, td, ux, uy, now); // the usual wobble...
    return [-ux * 1.2 + vx * 0.3, -uy * 1.2 + vy * 0.3];             // ...while running away
  }
  think(room, now, alive) {
    if (this.loot || !this.awake) return;
    const pl = alive.find(p => this.distanceTo(p) < 0.65);
    if (!pl || pl.gold <= 0) return;
    const n = Math.min(pl.gold, Math.round(8 + room.floor * 4));
    pl.gold -= n; this.loot = n;
    room.emit({ t: 'gold', x: pl.x, y: pl.y, n: -n, id: pl.id });
    room.emit({ t: 'steal', x: this.x, y: this.y });
    pl.tell(`The Pickpocket snatches ${n} gold and runs! Spell it to get it back.`);
  }
  onDefeated(room, pl) {
    if (!this.loot) return;
    room.giveGold(pl, this.loot * 2);
    pl.tell(`You get the stolen ${this.loot} gold back, and as much again from the Pickpocket's purse.`);
  }
  get walkSpeed() { return this.loot ? super.walkSpeed * 0.8 : super.walkSpeed; }
  label() { return this.loot ? { tag: `${this.loot} gold`, tagColor: '#ffd54f' } : {}; }
  toSave() { return { ...super.toSave(), loot: this.loot }; }
}

/** Its name is shown back to front. Spell the real word: read it from right to left. */
export class Mirrorling extends Creature {
  constructor(x, y, word) { super('mirrorling', x, y, word); }
  label() { return { rev: true }; }
}

/** Random letters, not a word, and the letters still left swap places every few seconds. */
export class JumbleSprite extends Creature {
  constructor(x, y, word) { super('jumble', x, y, word); this.shuffleAt = 0; }
  static makeWord(room) { return Array.from({ length: 3 + Math.min(2, Math.floor(room.floor / 5)) }, () => pick(room.pool)).join(''); }
  think(room, now) {
    if (!this.awake) return;
    if (!this.shuffleAt) this.shuffleAt = now + 3500;
    if (now < this.shuffleAt) return;
    this.shuffleAt = now + 3500;
    const done = this.lock.word.slice(0, this.lock.progress), rest = [...this.lock.word.slice(this.lock.progress)];
    if (rest.length < 2 || new Set(rest).size < 2) return;
    const before = rest.join('');
    while (rest.join('') === before) for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    this.lock.word = done + rest.join('');
    room.emit({ t: 'jumble', x: this.x, y: this.y });
  }
  label(now) { return this.shuffleAt ? { tag: `shuffles in ${secsLeft(this.shuffleAt, now)}`, tagColor: '#f48fb1' } : {}; }
}

/** A wrong letter does not just miss: the bird learns it and adds it to the end of its name (up to 8 letters). */
export class Mockingbird extends Creature {
  constructor(x, y, word) { super('mockingbird', x, y, word); }
  hitBy(room, spell) {
    const result = super.hitBy(room, spell);
    if (result === 'wrong' && this.lock.word.length < 8) {
      this.lock.word += spell.letters[0];
      room.emit({ t: 'mock', x: this.x, y: this.y, l: spell.letters[0] });
    }
    return result;
  }
}

/** Once it sees you, its fuse burns down. Spell it in time, or be far away when it goes off. */
export class FuseBeetle extends Creature {
  constructor(x, y, word) { super('fusebeetle', x, y, word); this.boomAt = 0; }
  static BLAST = 2.6; // tiles
  wake(room, now) { this.boomAt = now + Math.max(9000, 14000 - room.floor * 200); }
  think(room, now, alive) {
    if (!this.boomAt || now < this.boomAt) return;
    this.removed = true;
    room.emit({ t: 'boom', x: this.x, y: this.y, r: FuseBeetle.BLAST });
    for (const pl of alive) {
      if (this.distanceTo(pl) > FuseBeetle.BLAST) continue;
      pl.takeHit(room, now, { letters: '', damage: letterDamage(this.type, room.floor), source: null });
    }
    room.say('A Fuse Beetle blew up!', 2);
  }
  label(now) { return this.boomAt ? { tag: `fuse ${secsLeft(this.boomAt, now)}`, tagColor: '#ff7043' } : {}; }
}

/** Solid for a moment, faded for a moment. Faded, spells fly right through it (and aim past it). */
export class Phantom extends Creature {
  constructor(x, y, word) { super('phantom', x, y, word); this.cycle = rnd(0, 5000); }
  get faded() { return (Date.now() + this.cycle) % 5200 > 2600; }
  get intangible() { return this.faded; }
  attack(room, ux, uy, shots) { if (!this.faded) super.attack(room, ux, uy, shots); }
  label() { return { faded: this.faded }; }
}

/** Its name stays hidden (?) unless a caster is within a few tiles of it. */
export class Lurker extends Creature {
  constructor(x, y, word) { super('lurker', x, y, word); this.seen = false; }
  think(room, now, alive) { this.seen = alive.some(p => this.distanceTo(p) < 4.5); }
  label() { return this.seen ? {} : { show: '?'.repeat(this.lock.word.length) }; }
}

/**
 * A shell with a key letter written on it. A spell only gets through if it starts with that letter;
 * the rest of the spell goes into its name. The key changes every time it is used.
 */
export class Keyshell extends Creature {
  constructor(x, y, word) { super('keyshell', x, y, word); this.key = null; }
  get guarded() { return true; }
  wants(letter) { return letter === this.key; }
  think(room) { if (!this.key) this.key = pick(room.pool); }
  hitBy(room, spell) {
    if (spell.letters[0] !== this.key) { this.lock.wrong = 0.4; room.emit({ t: 'kblock', x: this.x, y: this.y, l: this.key }); return 'blocked'; }
    let k; do k = pick(room.pool); while (k === this.key && room.pool.length > 1);
    this.key = k;
    room.emit({ t: 'unlock', x: this.x, y: this.y });
    const rest = spell.letters.slice(1);
    return rest ? this.lock.apply(rest) : 'key';
  }
  label() { return { tag: `key ${this.key || '?'}`, tagColor: '#ffca28', key: this.key }; }
}

/** Every time a spell takes letters off it (without finishing it), it blinks to another spot nearby. */
export class BlinkImp extends Creature {
  constructor(x, y, word) { super('blinker', x, y, word); }
  hitBy(room, spell) {
    const result = super.hitBy(room, spell);
    if (result !== 'hit') return result;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = rnd(2.5, 4.5);
      const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r;
      if (room.dungeon.blocked(x, y, this.radius) || !room.dungeon.los(this.x, this.y, x, y)) continue;
      room.emit({ t: 'tele', x: this.x, y: this.y });
      this.x = x; this.y = y;
      room.emit({ t: 'tele', x, y });
      break;
    }
    return result;
  }
}

/** Leave it alone for a few seconds and the letters you removed grow back, one by one. */
export class Mossback extends Creature {
  constructor(x, y, word) { super('mossback', x, y, word); this.hitAt = 0; this.growAt = 0; }
  hitBy(room, spell) { const r = super.hitBy(room, spell); if (r === 'hit') { this.hitAt = Date.now(); this.growAt = 0; } return r; }
  think(room, now) {
    if (!this.lock.progress || now - this.hitAt < 4000) return;
    if (!this.growAt) this.growAt = now + 1500;
    if (now < this.growAt) return;
    this.growAt = now + 1500;
    this.lock.progress--;
    room.emit({ t: 'regrow', x: this.x, y: this.y, l: this.lock.next });
  }
  label(now) {
    if (!this.lock.progress) return {};
    const left = this.growAt ? this.growAt - now : 4000 - (now - this.hitAt) + 1500;
    return { tag: `regrows in ${Math.max(0, Math.ceil(left / 1000))}`, tagColor: '#9ccc65' };
  }
}

/**
 * Gremlins come in pairs and share a name. Finish one and it only falls over: if its twin is not
 * finished within a few seconds, it gets back up with its whole name. Finish both to be rid of them.
 */
export class Gremlin extends Creature {
  constructor(x, y, word) { super('gremlin', x, y, word); this.partner = null; this.downUntil = 0; }
  static REVIVE = 6000;
  get downed() { return this.downUntil > 0; }
  get intangible() { return this.downed; }
  hitBy(room, spell) {
    const result = super.hitBy(room, spell);
    const twin = this.partner && !this.partner.removed ? this.partner : null;
    if (result !== 'done' || !twin || twin.downed) return result;
    this.downUntil = Date.now() + Gremlin.REVIVE;
    room.emit({ t: 'gdown', x: this.x, y: this.y });
    spell.owner?.tell?.('The gremlin falls over... spell its twin before it gets back up!');
    return 'downed';
  }
  update(room, now, alive, shots) {
    if (!this.downed) return super.update(room, now, alive, shots);
    this.lock.tick();
    if (now < this.downUntil) return;
    this.downUntil = 0;
    this.lock = new WordLock(this.lock.word);
    room.emit({ t: 'grevive', x: this.x, y: this.y });
  }
  /** Finished while my twin lies on the floor: both are gone for good. */
  onDefeated(room, pl) {
    const twin = this.partner;
    if (twin && !twin.removed && twin.downed) room.defeatAlso(twin, pl);
  }
  label(now) { return this.downed ? { downed: true, tag: `up in ${secsLeft(this.downUntil, now)}`, tagColor: '#c6ff00' } : { tag: 'twin', tagColor: '#b39ddb' }; }
}

/** Every one of its letters that gets through to you gives it back one letter of its name. */
export class Bloodleech extends Creature {
  constructor(x, y, word) { super('leech', x, y, word); }
  onLetterHit(room) {
    if (!this.lock.progress) return;
    this.lock.progress--;
    room.emit({ t: 'regrow', x: this.x, y: this.y, l: this.lock.next, why: 'sip' });
  }
}

/** Lays a spiderling every few seconds (up to four at a time) until it is spelled. */
export class BroodMother extends Creature {
  constructor(x, y, word) { super('broodmother', x, y, word); this.layAt = 0; }
  get hitRadius() { return 0.65; }
  think(room, now) {
    if (!this.awake) return;
    if (!this.layAt) this.layAt = now + 3000;
    if (now < this.layAt) return;
    this.layAt = now + 7000;
    if (room.enemies.filter(e => e.mother === this && !e.removed).length >= 4) return;
    const a = Math.random() * Math.PI * 2, x = this.x + Math.cos(a) * 0.8, y = this.y + Math.sin(a) * 0.8;
    if (room.dungeon.blocked(x, y, 0.3)) return;
    const s = new Creature('spiderling', x, y, pick(room.pool));
    s.mother = this; s.awake = true;
    room.enemies.push(s);
    room.emit({ t: 'hatch', x, y });
  }
}

/** Every other letter of its name is hidden: work out the word from the letters you can see. */
export class HollowScribe extends Creature {
  constructor(x, y, word) { super('scribe', x, y, word); }
  label() { return { show: [...this.lock.word].map((c, i) => i % 2 ? '?' : c).join('') }; }
}

/** A wrong letter bounces off its mirror shield and flies straight back at whoever cast it. */
export class MirrorKnight extends Creature {
  constructor(x, y, word) { super('mirrorknight', x, y, word); }
  hitBy(room, spell) {
    const result = super.hitBy(room, spell);
    const pl = spell.owner;
    if (result === 'wrong' && pl && !pl.dead) {
      const d = Math.hypot(pl.x - this.x, pl.y - this.y) || 1, speed = 3.2;
      room.spells.push(new EnemySpell(this.x, this.y, spell.letters[0], (pl.x - this.x) / d * speed, (pl.y - this.y) / d * speed, letterDamage(this.type, room.floor), this));
      room.emit({ t: 'mreflect', x: this.x, y: this.y, l: spell.letters[0] });
    }
    return result;
  }
}

/** Blows its horn: every enemy within 5 tiles of it throws letters twice as fast. Stays at the back. */
export class WarhornGoblin extends Creature {
  constructor(x, y, word) { super('warhorn', x, y, word); this.blowAt = 0; }
  get horn() { return this.awake; }
  think(room, now) {
    if (!this.awake || now < this.blowAt) return;
    this.blowAt = now + 5000;
    room.emit({ t: 'horn', x: this.x, y: this.y });
  }
  label() { return this.awake ? { aura: '#ffb74d' } : {}; }
}

/** Its letters freeze you in place for a moment when they get through. */
export class FrostWisp extends Creature {
  constructor(x, y, word) { super('frostwisp', x, y, word); }
  onLetterHit(room, pl, now) {
    pl.frozenUntil = now + 1200;
    room.emit({ t: 'freeze', x: pl.x, y: pl.y });
  }
}

/** type -> class, for the spawner and for loading saves. */
export const SPECIALS = {
  mimic: Mimic, twinslime: TwinSlime, moth: MorseMoth, pickpocket: Pickpocket, mirrorling: Mirrorling, jumble: JumbleSprite,
  mockingbird: Mockingbird, fusebeetle: FuseBeetle, phantom: Phantom, lurker: Lurker, keyshell: Keyshell, blinker: BlinkImp,
  mossback: Mossback, gremlin: Gremlin, leech: Bloodleech, broodmother: BroodMother, scribe: HollowScribe,
  mirrorknight: MirrorKnight, warhorn: WarhornGoblin, frostwisp: FrostWisp,
};
