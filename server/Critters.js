// Friendly things on the surface that you cast spells at for fun and practice. They never hurt anyone.
//
//   Critter ── ZooAnimal   lives in a zoo pen and wanders about. Spell the letter (or word) it holds to feed it.
//      ├────── Dummy       a straw dummy in the practice yard. Spell its word cleanly to keep your streak going.
//      └────── Fountain    the wishing fountain. Spell its wish word to toss in a coin for a ward.
import { DT } from './config.js';
import { Actor, WordLock } from './entities.js';
import { rnd, pick } from './util.js';
import { letterPool, wordsFor } from './words.js';

const WISH_WORDS = ['WISH', 'LUCK', 'COIN', 'HOPE', 'STAR'];
export const WISH = { cost: 10, maxWard: 3, healRange: 2.6, healEvery: 1000, healShare: 0.1 };

export class Critter extends Actor {
  constructor(kind, x, y, word, area = null) {
    super(x, y, 0.3);
    this.kind = kind;
    this.lock = new WordLock(word);
    this.area = area;          // { x, y, w, h } tiles it may wander in, or null if it stays put
    this.goal = null;          // where it is walking to
    this.restUntil = Date.now() + rnd(500, 3000);
    this.happyUntil = 0;       // fed or knocked over: a little animation, then a new word
    this.renew = false;        // pick a new word once the animation is over
    this.walkTime = 0;         // seconds spent walking to the current goal (gives up when stuck)
  }
  get type() { return 'critter'; }
  get hitRadius() { return 0.55; }
  get walkSpeed() { return 0.8; }
  /** The next word this critter holds. */
  nextWord(room) { return pick(room.pool); }
  /** Can a spell starting with this letter reach me? (used for soft aim) */
  wants(letter) { return !this.renew && this.lock.next === letter; }

  update(room, now) {
    this.lock.tick();
    if (this.renew && now >= this.happyUntil) { this.lock = new WordLock(this.nextWord(room)); this.renew = false; }
    if (!this.area || now < this.happyUntil) return;
    if (!this.goal) {
      if (now < this.restUntil) return;
      const a = this.area, m = 0.6;
      this.goal = { x: rnd(a.x + m, a.x + a.w - m), y: rnd(a.y + m, a.y + a.h - m) };
      this.walkTime = 0;
    }
    const dx = this.goal.x - this.x, dy = this.goal.y - this.y, d = Math.hypot(dx, dy);
    this.walkTime += DT;
    if (d < 0.1 || this.walkTime > 6) { this.goal = null; this.restUntil = now + rnd(1500, 5000); return; }
    const step = Math.min(d, this.walkSpeed * DT);
    this.moveBy(room.dungeon, dx / d * step, dy / d * step);
  }

  /** A player spell reached me. Returns what happened, like WordLock.apply. */
  hitBy(room, spell, now) {
    if (this.renew) return 'busy';
    const result = this.lock.apply(spell.letters);
    if (result === 'done') { this.renew = true; this.happyUntil = now + 1400; this.goal = null; this.spelled(room, spell.owner, now); }
    else this.missed(room, spell.owner, result);
    return result;
  }
  /** The whole word was spelled. */
  spelled(room, pl, now) {}
  /** A spell hit but did not finish the word: 'hit' (some letters right) or 'wrong'. */
  missed(room, pl, result) { room.emit({ t: result, x: this.x, y: this.y }); }

  snapshot() { return { ...super.snapshot(), kind: this.kind, ...this.lock.snapshot(), happy: this.happyUntil > Date.now() }; }
}

/**
 * A zoo animal. The three surface animals each eat their own kind of Morse letter: the Dashhound only
 * dashes (T M O), the Dotted Owl only dots (E I S H), the Hopper a mix of both. The dungeon creatures
 * eat what they would throw at you down below, and the Bellwraith's word is written only in Morse.
 */
const DIET = { dashhound: 'TMO', owl: 'EISH', hopper: 'ANRKDUWG' };
const SPEED = { dashhound: 1.6, owl: 0.5, hopper: 1.2, slime: 0.6, mage: 0.5, boss: 0.4 };

export class ZooAnimal extends Critter {
  get walkSpeed() { return SPEED[this.kind] || 0.8; }
  get hitRadius() { return this.kind === 'boss' ? 0.7 : 0.55; }
  nextWord(room) {
    if (DIET[this.kind]) return pick(DIET[this.kind]);
    const words = wordsFor(letterPool(Math.max(1, room.maxDepth)));
    if (this.kind === 'mage') return pick(words.filter(w => w.length === 2));
    if (this.kind === 'boss') return pick(words.filter(w => w.length === 3));
    return pick(room.pool);
  }
  spelled(room, pl) {
    room.zooFed++;
    room.emit({ t: 'feed', x: this.x, y: this.y, kind: this.kind });
    if (room.zooFed % 25 === 0) { // the keeper is pleased with the party now and then
      room.say(`The zoo keeper thanks ${pl.name}: ${room.zooFed} treats so far!`, 3);
      room.giveGold(pl, 5);
    }
  }
}

/**
 * A straw dummy in the practice yard. Dummy 1 holds single letters, dummy 2 two-letter words, dummy 3 three
 * letters and dummy 4 the longest words you know (letters from the deepest floor the party has reached).
 * Spell words without a wrong letter to build up a streak; your best streak is kept with your save.
 */
export class Dummy extends Critter {
  constructor(tier, x, y, room) { super('dummy', x, y, 'E'); this.tier = tier; this.lock = new WordLock(this.nextWord(room)); }
  get hitRadius() { return 0.6; }
  nextWord(room) {
    const pool = letterPool(Math.max(1, room.maxDepth)), words = wordsFor(pool);
    if (this.tier === 1) return pick(pool);
    const fit = this.tier === 4 ? words.filter(w => w.length >= 4) : words.filter(w => w.length === this.tier);
    return fit.length ? pick(fit) : Array.from({ length: this.tier }, () => pick(pool)).join('');
  }
  spelled(room, pl) {
    pl.practiceStreak++;
    const best = pl.practiceStreak > pl.practiceBest;
    if (best) pl.practiceBest = pl.practiceStreak;
    room.emit({ t: 'dummy', x: this.x, y: this.y, n: pl.practiceStreak, best, id: pl.id });
  }
  missed(room, pl, result) {
    super.missed(room, pl, result);
    if (result !== 'wrong') return;
    if (pl.practiceStreak >= 3) pl.tell(`Your practice streak ends at ${pl.practiceStreak} (best ${pl.practiceBest}).`);
    pl.practiceStreak = 0;
  }
  snapshot() { return { ...super.snapshot(), tier: this.tier }; }
}

/**
 * The wishing fountain. Spell its word to toss in a coin: for WISH.cost gold the water wraps you in a ward
 * that stops one hit (up to WISH.maxWard). Standing by the fountain also heals you.
 */
export class Fountain extends Critter {
  constructor(x, y) { super('fountain', x, y, pick(WISH_WORDS)); this.healAt = new Map(); }
  get hitRadius() { return 1.3; }
  nextWord() { return pick(WISH_WORDS.filter(w => w !== this.lock.word)); }
  spelled(room, pl) {
    if (pl.ward >= WISH.maxWard) return pl.tell('Your wish shimmers around you already. The fountain keeps your coin.');
    if (pl.gold < WISH.cost) return pl.tell(`A wish costs ${WISH.cost} gold, and your purse is too light.`);
    pl.gold -= WISH.cost; pl.ward++;
    room.emit({ t: 'gold', x: pl.x, y: pl.y, n: -WISH.cost, id: pl.id });
    room.emit({ t: 'wish', x: this.x, y: this.y });
    room.emit({ t: 'ward', x: pl.x, y: pl.y });
    pl.tell(`You toss ${WISH.cost} gold into the fountain. A ward will stop the next hit (${pl.ward} of ${WISH.maxWard}).`);
  }
  /** Casters resting by the fountain get their HP back. */
  update(room, now) {
    super.update(room, now);
    for (const pl of room.alivePlayers) {
      if (pl.hp >= pl.maxHp || this.distanceTo(pl) > WISH.healRange || now < (this.healAt.get(pl.id) || 0)) continue;
      this.healAt.set(pl.id, now + WISH.healEvery);
      const got = pl.heal(Math.max(1, pl.maxHp * WISH.healShare));
      if (got) room.emit({ t: 'regen', x: pl.x, y: pl.y, n: got });
    }
  }
}

/** Everything that lives on the surface: the zoo animals the party has unlocked, the dummies and the fountain. */
export function townCritters(room, town) {
  const list = [];
  for (const pen of town.pens) {
    if (pen.unlock && !(room.bestiary[pen.unlock] > 0)) continue; // not met in the dungeon yet
    const a = pen.area, count = pen.kind === 'boss' ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const animal = new ZooAnimal(pen.kind, a.x + a.w * (k + 1) / (count + 1), a.y + a.h / 2, 'E', a);
      animal.lock = new WordLock(animal.nextWord(room));
      list.push(animal);
    }
  }
  for (const d of town.dummies) list.push(new Dummy(d.tier, d.x, d.y, room));
  list.push(new Fountain(town.fountain.x, town.fountain.y));
  return list;
}
