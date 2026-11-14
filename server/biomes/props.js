// Things on a dungeon floor that you cast at but that never fight back, like the critters on the surface (they use
// the same targeting and the same collisions, see Level.chooseTarget):
//
//   Critter ── Brazier     catacombs: spell its letter to light it for good (a big light in the dark)
//      ├────── RiddleDoor  library: a riddle above a rune door; spell the answer and the door opens
//      ├────── Shrine      any floor, sometimes: blood shrine (HP for mana) or the shrine of exchange (swap a spell)
//      └────── Altar       any floor, sometimes: spell DARE to start a challenge for treasure
import { Critter } from '../Critters.js';
import { WordLock } from '../entities.js';
import { pick } from '../util.js';
import { RIDDLES } from './riddles.js';
import { SPELLS, SPELL_BY_ID } from '../magic/spellbook.js';

export class Prop extends Critter {
  constructor(kind, x, y, word) { super(kind, x, y, word); }
  get prop() { return true; }
  get walkSpeed() { return 0; }
}

/** A brazier in the catacombs. Its letter lights it; the Lightless One snuffs it again. */
export class Brazier extends Prop {
  constructor(x, y, room, lit = false) { super('brazier', x, y, pick(room.pool)); this.lit = lit; }
  get hitRadius() { return 0.5; }
  wants(letter) { return !this.lit && super.wants(letter); }
  hitBy(room, spell, now) {
    if (this.lit) return 'busy';
    return super.hitBy(room, spell, now);
  }
  spelled(room, pl) {
    this.lit = true;
    room.emit({ t: 'ignite', x: this.x, y: this.y });
  }
  snuff(room) {
    if (!this.lit) return;
    this.lit = false;
    this.renew = false;
    this.lock = new WordLock(pick(room.pool));
    room.emit({ t: 'snuff', x: this.x, y: this.y });
  }
  update(room, now) { this.lock.tick(); }
  snapshot() { return { ...super.snapshot(), lit: this.lit, happy: false }; }
}

/**
 * A rune door in the Library of Echoes. A riddle hangs over it; its answer is the word to spell. The answer's
 * letters stay hidden (spelled ones show), but after three wrong tries the next letter is shown as a hint.
 */
export class RiddleDoor extends Prop {
  constructor(door) {
    const r = RIDDLES[door.riddle] || RIDDLES[0];
    super('riddle', door.x, door.y, r.a);
    this.door = door;
    this.riddle = r;
    this.misses = 0;
    this.hintAt = 0; // progress up to which a letter has been given away
  }
  get hitRadius() { return 1.1; }
  wants(letter) { return !this.door.open && this.lock.next === letter; }
  hitBy(room, spell, now) {
    if (this.door.open) return 'busy';
    const result = this.lock.apply(spell.letters);
    if (result === 'done') {
      this.door.open = true;
      for (const [i, j] of this.door.tiles) room.setTile(i, j, 1);
      room.emit({ t: 'dooropen', x: this.x, y: this.y });
      room.say(`${spell.owner.name} answered the riddle: ${this.riddle.a}! The door opens.`, 3);
    } else if (result === 'wrong') {
      this.misses++;
      room.emit({ t: 'wrong', x: this.x, y: this.y });
      if (this.misses % 3 === 0) { this.hintAt = this.lock.progress + 1; spell.owner.tell(`The door whispers a hint: the next letter is ${this.lock.next}.`); }
    } else room.emit({ t: 'hit', x: this.x, y: this.y });
    return result;
  }
  update() { this.lock.tick(); }
  snapshot() {
    const w = this.lock.word, shown = [...w].map((c, i) => (i < this.hintAt ? c : '?')).join('');
    return { ...super.snapshot(), happy: false, open: !!this.door.open, show: shown, q: this.riddle.q };
  }
}

/**
 * A shrine. Each caster may use it once per visit.
 *   blood    spell MANA: give a third of your max HP, get all your mana back
 *   swap     spell SWAP: forget the effect spell you cast last and learn one you do not know
 */
const SHRINES = {
  blood: { word: 'MANA', name: 'Blood Shrine', hint: 'Spell MANA at it: a third of your HP for all your mana.' },
  swap: { word: 'SWAP', name: 'Shrine of Exchange', hint: 'Spell SWAP at it: forget the effect spell you cast last, learn one you do not know.' },
};
export class Shrine extends Prop {
  constructor(spec) { super('shrine', spec.x, spec.y, SHRINES[spec.kind].word); this.spec = spec; this.used = new Set(); this.told = new Set(); }
  get hitRadius() { return 0.7; }
  get info() { return SHRINES[this.spec.kind]; }
  nextWord() { return this.info.word; }
  update(room, now) {
    super.update(room, now);
    for (const pl of room.alivePlayers) { // tell people walking up what it does
      if (this.distanceTo(pl) > 2.5 || this.told.has(pl.id)) continue;
      this.told.add(pl.id);
      pl.tell(`A ${this.info.name}. ${this.info.hint}${this.used.has(pl.id) ? ' (You have used it already.)' : ''}`);
    }
  }
  spelled(room, pl) {
    if (this.used.has(pl.id)) return pl.tell(`The ${this.info.name} is silent: it answers each caster once.`);
    if (this.spec.kind === 'blood') {
      const cost = Math.ceil(pl.maxHp / 3);
      if (pl.hp <= cost) return pl.tell('You are too weak to give that much blood.');
      pl.hp -= cost;
      pl.magic.fill();
      room.emit({ t: 'hurt', x: pl.x, y: pl.y, id: pl.id, n: cost });
      room.emit({ t: 'shrine', x: this.x, y: this.y, k: 'blood' });
      pl.tell(`The shrine drinks ${cost} HP. Your mana is full.`);
    } else {
      const g = pl.magic, last = g.last && g.knows(g.last) ? g.last : null;
      if (!last) return pl.tell('Cast an effect spell first: the shrine takes the one you cast last.');
      const fresh = SPELLS.filter(s => !g.knows(s.id) && s.level <= pl.level + 4);
      if (!fresh.length) return pl.tell('There is nothing left the shrine could teach you.');
      const got = pick(fresh), gone = SPELL_BY_ID[last];
      g.known.delete(last); g.last = null; g.learn(got.id);
      room.emit({ t: 'shrine', x: this.x, y: this.y, k: 'swap' });
      pl.tell(`You forget ${gone.word}... and the shrine teaches you ${got.word}! (See the grimoire, G.)`);
    }
    this.used.add(pl.id);
  }
  snapshot() { return { ...super.snapshot(), sk: this.spec.kind, happy: false }; }
}

/** A challenge altar: spell DARE at it and guardians appear in its room. The challenge itself runs in Environment. */
export class Altar extends Prop {
  constructor(spec) { super('altar', spec.x, spec.y, 'DARE'); this.spec = spec; this.state = 'idle'; }
  get hitRadius() { return 0.7; }
  nextWord() { return 'DARE'; }
  wants(letter) { return this.state === 'idle' && super.wants(letter); }
  hitBy(room, spell, now) { if (this.state !== 'idle') return 'busy'; return super.hitBy(room, spell, now); }
  spelled(room, pl) { room.env?.startChallenge(this, pl); }
  snapshot() { return { ...super.snapshot(), ak: this.spec.kind, state: this.state, happy: false }; }
}
