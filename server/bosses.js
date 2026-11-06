// The five bosses that join the Bellwraith deeper down. Like it, each has a name of several words (phases)
// and a trick you have to get past before (or while) you spell it.
//
//   Boss ── Gravekeeper   raises skeletons; it cannot be touched until they are all gone
//     ├──── Hydra         three heads with words of their own; the body's name opens once all heads are cut
//     ├──── HourglassGolem a long name that has to be finished before its sand runs out, or it is whole again
//     ├──── EchoQueen     surrounded by echoes that look just like her; only the real queen throws letters
//     └──── SilentKing    its name is hidden; every one of its letters you block in mid-air reveals one more
import { DT } from './config.js';
import { Enemy, Boss, Creature, WordLock } from './entities.js';
import { pick } from './util.js';

const secs = (t) => Math.max(0, Math.ceil(t));

/**
 * The Gravekeeper raises a ring of skeletons and hides behind them: while any of them stands, spells
 * bounce off it. Once they are gone it is exposed for a few seconds, then it raises the next batch.
 */
export class Gravekeeper extends Boss {
  constructor(x, y, words) { super(x, y, words); this.openT = 0; this.guards = 0; }
  get type() { return 'gravekeeper'; }
  get guarded() { return this.openT <= 0; }
  get walkSpeed() { return this.openT > 0 ? 0.3 : 0.55; }
  wants(letter) { return this.openT > 0 && this.lock.next === letter; }
  nextFireDelay(floor) { return Math.max(2, 4 - this.phase * 0.4 - floor * 0.05); }
  get hint() {
    return this.openT > 0 ? `Exposed for ${secs(this.openT)}s: spell its name!` : `Its raised dead guard it: defeat the ${this.guards} skeleton${this.guards === 1 ? '' : 's'} first`;
  }
  wake(room) { this.raise(room); }
  raise(room) {
    this.openT = 0;
    const n = Math.min(2 + this.phase + Math.floor(room.floor / 6), 6);
    this.summon(room, n, (x, y) => { const e = new Creature('skeleton', x, y, pick(room.pool)); e.master = this; return e; });
    room.emit({ t: 'graves', x: this.x, y: this.y });
    room.say('The Gravekeeper raises the dead!', 2);
  }
  think(room) {
    this.guards = room.enemies.filter(e => e.master === this && !e.removed).length;
    if (!this.awake) return;
    if (this.openT > 0) { this.openT -= DT; if (this.openT <= 0) this.raise(room); return; }
    if (!this.guards) { this.openT = Math.max(6, 10 - room.floor * 0.15); room.emit({ t: 'gopen', x: this.x, y: this.y }); }
  }
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    this.fan(room, Math.atan2(uy, ux), 3 + this.phase, 0.3, Math.min(1.5 + room.floor * 0.12, 2.6));
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
  hitBy(room, spell) {
    if (this.openT <= 0) { this.lock.wrong = 0.4; room.emit({ t: 'gblock', x: this.x, y: this.y }); return 'blocked'; }
    const result = this.lock.apply(spell.letters);
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    this.raise(room);
    return 'phase';
  }
  label() { return { ward: this.openT <= 0 ? '#b0bec5' : null, open: secs(this.openT) }; }
}

/**
 * The Lettered Hydra has three heads, each with a short word of its own. Its body's name can only be
 * spelled once all three heads are cut; a cut head grows back (with a new word) after a while.
 * Finish a body name and every head grows back at once, with longer words.
 */
export class Hydra extends Boss {
  constructor(x, y, words) { super(x, y, words); this.heads = []; }
  get type() { return 'hydra'; }
  get hitRadius() { return 0.95; }
  get walkSpeed() { return 0.35; }
  get up() { return this.heads.filter(h => !h.downUntil); }
  get guarded() { return this.up.length > 0; }
  regrowMs(room) { return Math.max(8000, 13000 - room.floor * 150); }
  headWord(room) {
    const len = Math.min(1 + this.phase + Math.floor(room.floor / 10), 4);
    if (len === 1) return pick(room.pool);
    return Array.from({ length: len }, () => pick(room.pool)).join('');
  }
  growHeads(room) { this.heads = [0, 1, 2].map(() => ({ lock: new WordLock(this.headWord(room)), downUntil: 0 })); }
  wants(letter) {
    const up = this.up;
    return up.length ? up.some(h => h.lock.next === letter) : this.lock.next === letter;
  }
  get hint() {
    const up = this.up.length;
    if (up) return `Cut its heads first: ${up} of 3 still bite`;
    const back = Math.min(...this.heads.map(h => h.downUntil)) - Date.now();
    return `All heads cut! Spell the body's name (heads grow back in ${secs(back / 1000)}s)`;
  }
  think(room, now) {
    if (!this.heads.length) this.growHeads(room);
    for (const h of this.heads) {
      h.lock.tick();
      if (h.downUntil && now >= h.downUntil) { h.downUntil = 0; h.lock = new WordLock(this.headWord(room)); room.emit({ t: 'hgrow', x: this.x, y: this.y }); }
    }
  }
  /** Every head still up spits a letter; with no heads it can only lash out with a ring now and then. */
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    const base = Math.atan2(uy, ux), speed = Math.min(1.6 + room.floor * 0.12, 2.8);
    const up = this.heads.map((h, i) => (h.downUntil ? null : i)).filter(i => i !== null);
    if (up.length) for (const i of up) this.fan(room, base + (i - 1) * 0.25, 1 + Math.floor(this.phase / 2), 0.2, speed);
    else if (Math.random() < 0.5) this.ring(room, 8, speed * 0.8, base);
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
  hitBy(room, spell) {
    const up = this.up, now = Date.now();
    if (up.length) {
      const h = up.find(h => h.lock.next === spell.letters[0]);
      if (!h) { this.lock.wrong = 0.4; for (const o of up) o.lock.wrong = 0.4; return 'wrong'; }
      if (h.lock.apply(spell.letters) !== 'done') return 'hit';
      h.downUntil = now + this.regrowMs(room);
      room.emit({ t: 'hcut', x: this.x, y: this.y });
      if (!this.up.length) room.say('Every head is cut: spell the Hydra\'s name!', 2);
      return 'hit';
    }
    const result = this.lock.apply(spell.letters);
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    this.growHeads(room);
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    room.say(`The Hydra grows new heads! ${this.words.length - this.phase} name${this.words.length - this.phase > 1 ? 's' : ''} left`, 3);
    return 'phase';
  }
  label() {
    return { heads: this.heads.map(h => ({ w: h.lock.word, p: h.lock.progress, up: !h.downUntil, wrong: h.lock.wrong > 0, flash: h.lock.flash > 0 })) };
  }
}

/**
 * The Hourglass Golem has long names, and sand runs while you spell. If the sand runs out before a name
 * is finished, every letter of it comes back and the golem slams the floor (a ring of letters).
 */
export class HourglassGolem extends Boss {
  constructor(x, y, words) { super(x, y, words); this.sand = 0; this.sandMax = 1; }
  get type() { return 'hourglass'; }
  get hitRadius() { return 0.9; }
  get walkSpeed() { return 0.3; }
  sandFor(room) { this.sandMax = Math.max(14, 12 + this.lock.word.length * 2.5 - room.floor * 0.1); return this.sandMax; }
  get hint() { return `Spell the whole name before the sand runs out: ${secs(this.sand)}s`; }
  nextFireDelay(floor) { return Math.max(2.4, 4 - this.phase * 0.4 - floor * 0.05); }
  wake(room) { this.sand = this.sandFor(room); }
  think(room) {
    if (!this.awake) return;
    this.sand -= DT;
    if (this.sand > 0) return;
    this.sand = this.sandFor(room);
    if (this.lock.progress) {
      this.lock.progress = 0; this.lock.wrong = 0.6;
      room.say('The sand ran out: the Golem\'s name is whole again!', 2);
    }
    this.ring(room, 10, Math.min(1.5 + room.floor * 0.1, 2.6), Math.random());
    room.emit({ t: 'slam', x: this.x, y: this.y });
  }
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    this.fan(room, Math.atan2(uy, ux), 2 + this.phase, 0.4, Math.min(1.4 + room.floor * 0.1, 2.4));
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
  hitBy(room, spell) {
    const result = this.lock.apply(spell.letters);
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    this.sand = this.sandFor(room);
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    return 'phase';
  }
  label() { return this.awake ? { sand: secs(this.sand), sandMax: Math.ceil(this.sandMax) } : {}; }
}

/**
 * The Echo Queen walks among echoes of herself: same look, same name. Only the real queen throws letters,
 * so watch who attacks. Hitting an echo shatters it into a ring of letters; hitting the queen makes her
 * and her echoes swap places.
 */
export class EchoQueen extends Boss {
  constructor(x, y, words) { super(x, y, words); this.echoAt = 0; }
  get type() { return 'echoqueen'; }
  get walkSpeed() { return 0.6 + this.phase * 0.1; }
  get hint() { return 'Echoes copy her. Only the real Echo Queen throws letters: watch who attacks'; }
  nextFireDelay(floor) { return Math.max(1.8, 3.4 - this.phase * 0.4 - floor * 0.05); }
  echoes(room) { return room.enemies.filter(e => e.queen === this && !e.removed); }
  wake(room, now) { this.makeEchoes(room, now); }
  makeEchoes(room) {
    const want = Math.min(3 + Math.floor(room.floor / 15), 5) - this.echoes(room).length;
    this.summon(room, want, (x, y) => new EchoImage(this, x, y));
    room.emit({ t: 'echo', x: this.x, y: this.y });
  }
  think(room, now) {
    if (!this.awake) return;
    if (this.echoAt && now >= this.echoAt) { this.echoAt = 0; this.makeEchoes(room); }
  }
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    this.fan(room, Math.atan2(uy, ux), 2 + this.phase, 0.3, Math.min(1.7 + room.floor * 0.12, 2.8));
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
  /** An echo was struck: it shatters and she answers with a ring of letters. */
  shattered(room, echo) {
    room.emit({ t: 'eshatter', x: echo.x, y: echo.y });
    const speed = Math.min(1.5 + room.floor * 0.1, 2.5);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      room.spells.push(this.makeLetter(room, echo.x + Math.cos(a) * 0.5, echo.y + Math.sin(a) * 0.5, Math.cos(a) * speed, Math.sin(a) * speed));
    }
    if (!this.echoAt) this.echoAt = Date.now() + 9000;
  }
  /** She and her echoes trade places. */
  shuffle(room) {
    const all = [this, ...this.echoes(room)];
    if (all.length < 2) return;
    const spots = all.map(e => ({ x: e.x, y: e.y }));
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    all.forEach((e, i) => { e.x = spots[i].x; e.y = spots[i].y; });
    room.emit({ t: 'eshuffle', x: this.x, y: this.y });
  }
  hitBy(room, spell) {
    const result = this.lock.apply(spell.letters);
    if (result === 'wrong') return result;
    this.shuffle(room);
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    this.makeEchoes(room);
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    return 'phase';
  }
  onDefeated(room) { for (const e of this.echoes(room)) { e.removed = true; room.emit({ t: 'eshatter', x: e.x, y: e.y }); } }
}

/** One of the Echo Queen's copies. It shows her name and walks like her, but never throws a letter. */
export class EchoImage extends Enemy {
  constructor(queen, x, y) { super(x, y, queen.lock.word); this.queen = queen; this.radius = 0.45; this.awake = true; }
  get type() { return 'echoimage'; }
  get hitRadius() { return this.queen.hitRadius; }
  get walkSpeed() { return this.queen.walkSpeed; }
  get preferredDistance() { return this.queen.preferredDistance; }
  get guarded() { return true; } // item effects cannot chip an echo
  wants(letter) { return this.queen.wants(letter); }
  attack() {}
  update(room, now, alive, shots) {
    if (this.queen.removed) { this.removed = true; return; }
    super.update(room, now, alive, shots);
  }
  hitBy(room) { this.removed = true; this.queen.shattered(room, this); return 'echo'; }
  /** Drawn exactly like the queen: her look, her name, her progress. */
  snapshot() { return { ...super.snapshot(), ...this.queen.lock.snapshot(), type: 'echoqueen', phase: this.queen.phase }; }
  toSave() { return null; } // echoes are made again when the queen wakes up
}

/**
 * The Silent King's name is never said: you only see question marks. Block one of its letters in mid-air
 * and one more letter of its name shows. Guessing works too, if you dare.
 */
export class SilentKing extends Boss {
  constructor(x, y, words) { super(x, y, words); this.known = 1; }
  get type() { return 'silentking'; }
  get walkSpeed() { return 0.5 + this.phase * 0.1; }
  get hint() { return 'Its name is unspoken: every one of its letters you block reveals one more'; }
  nextFireDelay(floor) { return Math.max(1.5, 2.8 - this.phase * 0.3 - floor * 0.04); }
  onBlocked(room) {
    if (this.lock.progress + this.known >= this.lock.word.length) return;
    this.known++;
    room.emit({ t: 'reveal', x: this.x, y: this.y, l: this.lock.word[this.lock.progress + this.known - 1] });
  }
  attack(room, ux, uy) {
    if (this.crowded(room)) return;
    const speed = Math.min(1.6 + room.floor * 0.1, 2.7);
    this.volleys++;
    if (this.volleys % 4 === 0) this.ring(room, 8, speed * 0.85, Math.atan2(uy, ux));
    else this.fan(room, Math.atan2(uy, ux), 2 + this.phase, 0.35, speed);
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }
  hitBy(room, spell) {
    const before = this.lock.progress;
    const result = this.lock.apply(spell.letters);
    if (result === 'hit') this.known = Math.max(1, this.known - (this.lock.progress - before));
    if (result !== 'done') return result;
    if (this.nextName()) return 'done';
    this.known = 1;
    this.summon(room, 2, (x, y) => new Creature('cultist', x, y, pick(room.pool)));
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    room.say(`The Silent King rises in anger. ${this.words.length - this.phase} name${this.words.length - this.phase > 1 ? 's' : ''} left`, 3);
    return 'phase';
  }
  label() {
    const w = this.lock.word, shown = this.lock.progress + this.known;
    return { show: [...w].map((c, i) => (i < shown ? c : '?')).join('') };
  }
  toSave() { return { ...super.toSave(), known: this.known }; }
  restore(s) { super.restore(s); this.known = Math.max(1, s.known | 0); }
}

export const BOSS_CLASSES = { gravekeeper: Gravekeeper, hydra: Hydra, hourglass: HourglassGolem, echoqueen: EchoQueen, silentking: SilentKing };
