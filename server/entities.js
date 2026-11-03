// Game objects on the server. Every object in the dungeon is an Entity; things that walk are Actors.
//
//   Entity ── Actor ── Player
//      │         └──── Enemy ── Slime
//      │                   ├─── Mage
//      │                   └─── Boss (the Bellwraith, one per floor)
//      ├── Chest
//      ├── Spell ── PlayerSpell
//      │      └──── EnemySpell
//      └── FloorItem
import { DT, PLAYER, SPELL, EFFECTS } from './config.js';
import { rnd, pick } from './util.js';
import * as Items from './items.js';

let lastId = 0;
export const newId = () => ++lastId;
const round3 = (v) => +v.toFixed(3);

// ------------------------------------------------------------------ base classes

export class Entity {
  constructor(x, y) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.removed = false; // set to true to delete the entity at the end of the tick
  }
  distanceTo(o) { return Math.hypot(o.x - this.x, o.y - this.y); }
  /** Called once per server tick. */
  update(room, now) {}
  /** Plain data sent to clients. */
  snapshot() { return { id: this.id, x: round3(this.x), y: round3(this.y) }; }
}

/** An entity that walks around and collides with walls. */
export class Actor extends Entity {
  constructor(x, y, radius) {
    super(x, y);
    this.radius = radius;
  }
  moveBy(dungeon, dx, dy) {
    if (!dungeon.blocked(this.x + dx, this.y, this.radius)) this.x += dx;
    if (!dungeon.blocked(this.x, this.y + dy, this.radius)) this.y += dy;
  }
}

/**
 * A word that has to be spelled with spells (enemy names, chest locks).
 * A spell removes letters up to its first mistake: RAD on RAT leaves "__T".
 */
export class WordLock {
  constructor(word) {
    this.word = word;
    this.progress = 0; // letters already removed
    this.flash = 0;    // seconds of "got hit" flash left
    this.wrong = 0;    // seconds of "wrong letter" shake left
  }
  get next() { return this.word[this.progress]; }
  get done() { return this.progress >= this.word.length; }
  /** Apply a spell's letters. Returns 'done', 'hit' or 'wrong'. */
  toSave() { return { word: this.word, progress: this.progress }; }
  static fromSave(s) { const l = new WordLock(s.word); l.progress = s.progress | 0; return l; }
  apply(letters) {
    let k = 0;
    while (k < letters.length && this.progress + k < this.word.length && letters[k] === this.word[this.progress + k]) k++;
    if (k === 0) { this.wrong = 0.4; return 'wrong'; }
    this.progress += k; this.flash = 0.2;
    return this.done ? 'done' : 'hit';
  }
  tick() { if (this.flash > 0) this.flash -= DT; if (this.wrong > 0) this.wrong -= DT; }
  snapshot() { return { word: this.word, p: this.progress, flash: this.flash > 0, wrong: this.wrong > 0 }; }
}

// ------------------------------------------------------------------ player

export class Player extends Actor {
  constructor(ws, name, color) {
    super(0, 0, PLAYER.radius);
    this.ws = ws;
    this.name = (name || 'Caster').slice(0, 12);
    this.color = color;
    this.mx = 0; this.my = 0;           // movement input, -1..1
    this.hp = PLAYER.hp; this.maxHp = PLAYER.hp;
    this.dead = false; this.respawnAt = 0;
    this.kills = 0; this.blocks = 0;
    this.hurt = 0;                      // seconds of hurt flash left
    this.swiftUntil = 0;                // Potion of Speed
    this.ward = 0;                      // hits a Potion of Warding still absorbs
    this.casts = 0;                     // for Staff of Forking
    this.regenAt = 0;                   // Amulet of Regeneration timer
    this.pack = [];                     // inventory a) .. l)
    this.equip = Object.fromEntries(Items.SLOTS.map(k => [k, null]));
  }

  // ---- networking
  send(obj) { if (this.ws.readyState === 1) this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }
  /** Angband-style message for this player only. */
  tell(text) { this.send({ t: 'msg', text }); }
  setMoveInput(x, y) { this.mx = Math.max(-1, Math.min(1, +x || 0)); this.my = Math.max(-1, Math.min(1, +y || 0)); }

  // ---- equipment
  wears(kind) { return Items.SLOTS.some(k => this.equip[k] && this.equip[k].kind === kind); }
  refreshMaxHp() { this.maxHp = PLAYER.hp + (this.wears('robe_vit') ? 2 : 0); this.hp = Math.min(this.hp, this.maxHp); }
  get moveSpeed() { return PLAYER.speed * (this.swiftUntil > Date.now() ? 1.5 : 1) * (this.wears('boots_speed') ? 1.25 : 1); }
  get spellSpeed() { return SPELL.speed * (this.wears('staff_haste') ? 1.4 : 1); }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  revive(x, y) { this.dead = false; this.hp = this.maxHp; this.x = x; this.y = y; }
  /** Full heal and place at the start of a fresh floor. */
  placeAt(room) {
    const s = room.dungeon.start;
    this.x = s.cx + rnd(-1, 1); this.y = s.cy + rnd(-1, 1);
    this.refreshMaxHp(); this.hp = this.maxHp; this.dead = false;
  }

  update(room, now, alive) {
    if (this.dead) {
      if (now >= this.respawnAt && alive.length) {
        const buddy = pick(alive);
        this.revive(buddy.x, buddy.y);
        room.emit({ t: 'revive', x: this.x, y: this.y });
      }
      return;
    }
    let mx = this.mx, my = this.my; const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const spd = this.moveSpeed;
    if (this.wears('amulet_regen') && this.hp < this.maxHp) {
      if (!this.regenAt) this.regenAt = now + EFFECTS.regenSeconds * 1000;
      else if (now >= this.regenAt) { this.hp++; this.regenAt = 0; room.emit({ t: 'regen', x: this.x, y: this.y }); }
    } else this.regenAt = 0;
    this.moveBy(room.dungeon, mx * spd * DT, my * spd * DT);
    if (this.hurt > 0) this.hurt -= DT;
  }

  /** An enemy letter struck this player. Wards and the Ring of Reflection may stop it. */
  takeHit(room, now) {
    if (this.ward > 0) { this.ward--; room.emit({ t: 'ward', x: this.x, y: this.y }); return; }
    if (this.wears('ring_reflect') && Math.random() < 0.25) { room.emit({ t: 'reflect', x: this.x, y: this.y }); return; }
    this.hp--; this.hurt = 0.4;
    room.emit({ t: 'hurt', x: this.x, y: this.y, id: this.id });
    if (this.hp <= 0) {
      this.dead = true; this.respawnAt = now + PLAYER.respawnSeconds * 1000;
      room.emit({ t: 'down', x: this.x, y: this.y, id: this.id });
      room.say(`${this.name} is down!`, 2);
    }
  }

  // ---- saving: what a player keeps when the lobby is saved and resumed
  toSave() {
    return { name: this.name, x: this.x, y: this.y, hp: this.hp, dead: this.dead, kills: this.kills, blocks: this.blocks, ward: this.ward, pack: this.pack, equip: this.equip };
  }
  /** Take back saved progress (matched by name when someone rejoins). */
  restore(s) {
    this.pack = (s.pack || []).map(Items.restoreItem).filter(Boolean);
    for (const k of Items.SLOTS) this.equip[k] = Items.restoreItem(s.equip?.[k]);
    this.kills = s.kills | 0; this.blocks = s.blocks | 0; this.ward = s.ward | 0;
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) { this.x = s.x; this.y = s.y; }
    this.refreshMaxHp();
    this.hp = s.dead ? this.maxHp : Math.max(1, Math.min(this.maxHp, s.hp | 0));
  }

  snapshot(now) {
    return {
      ...super.snapshot(), name: this.name, color: this.color, hp: this.hp, maxHp: this.maxHp, dead: this.dead,
      hurt: this.hurt > 0, respawn: this.dead ? Math.max(0, Math.ceil((this.respawnAt - now) / 1000)) : 0,
      kills: this.kills, blocks: this.blocks,
      swift: this.swiftUntil > now ? Math.ceil((this.swiftUntil - now) / 1000) : 0, ward: this.ward,
      pack: this.pack.map(Items.toClient),
      equip: Object.fromEntries(Items.SLOTS.map(k => [k, Items.toClient(this.equip[k])])),
    };
  }
}

// ------------------------------------------------------------------ enemies

/** Base enemy: walks toward the nearest visible player, keeps its distance and throws letters. */
export class Enemy extends Actor {
  constructor(x, y, word) {
    super(x, y, 0.32);
    this.lock = new WordLock(word);
    this.awake = false;
    this.fireCd = rnd(2, 5);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }
  // Overridden by subclasses
  get type() { return 'enemy'; }
  get walkSpeed() { return 0.8; }
  get preferredDistance() { return 4; }
  get hitRadius() { return 0.55; }
  get isBoss() { return false; }
  nextFireDelay(floor) { return rnd(4, 7); }
  /** Can a spell starting with this letter hurt me right now? (used for soft aim) */
  wants(letter) { return this.lock.next === letter; }
  /** A player spell hit me. Returns 'done', 'hit' or 'wrong' (bosses have a few more). */
  hitBy(room, spell) { return this.lock.apply(spell.letters); }
  /** Throw one letter at the target, if the room's shot budget allows. */
  attack(room, ux, uy, shots) {
    if (shots.left <= 0) return;
    shots.left--;
    const speed = Math.min(1.8 + room.floor * 0.2, 3.5);
    room.spells.push(new EnemySpell(this.x + ux * 0.4, this.y + uy * 0.4, pick(room.pool), ux * speed, uy * speed));
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }

  /** shots = { left } shared budget so the screen never fills with enemy letters. */
  update(room, now, alive, shots) {
    this.lock.tick();
    let target = null, td = Infinity;
    for (const pl of alive) {
      const d = this.distanceTo(pl);
      if (d < td && d < 10 && room.dungeon.los(this.x, this.y, pl.x, pl.y)) { td = d; target = pl; }
    }
    if (!target) return;
    if (!this.awake) { this.awake = true; this.fireCd = rnd(1.5, 3); }

    const ux = (target.x - this.x) / td, uy = (target.y - this.y) / td;
    let vx = 0, vy = 0;
    const want = this.preferredDistance;
    if (td > want + 0.5) { vx = ux; vy = uy; }
    else if (td < want - 1.5) { vx = -ux; vy = -uy; }
    else { vx = -uy * this.strafe * 0.6; vy = ux * this.strafe * 0.6; if (Math.random() < 0.01) this.strafe *= -1; }
    for (const o of room.enemies) { // keep a little space from other enemies
      if (o === this) continue;
      const d = this.distanceTo(o);
      if (d < 1 && d > 0.001) { vx -= (o.x - this.x) / d; vy -= (o.y - this.y) / d; }
    }
    this.moveBy(room.dungeon, vx * this.walkSpeed * DT, vy * this.walkSpeed * DT);

    this.fireCd -= DT;
    if (this.fireCd <= 0) {
      this.fireCd = this.nextFireDelay(room.floor);
      this.attack(room, ux, uy, shots);
    }
  }
  snapshot() { return { ...super.snapshot(), type: this.type, ...this.lock.snapshot(), awake: this.awake }; }
  toSave() { return { type: this.type, x: this.x, y: this.y, lock: this.lock.toSave() }; }
  static fromSave(s) {
    if (s.type === 'boss') return Boss.fromSave(s);
    const e = s.type === 'mage' ? new Mage(s.x, s.y, s.lock.word) : new Slime(s.x, s.y, s.lock.word);
    e.lock = WordLock.fromSave(s.lock);
    return e;
  }
}

/** Slow, close-range, single letter, rarely shoots. */
export class Slime extends Enemy {
  get type() { return 'slime'; }
  get walkSpeed() { return 0.9; }
  get preferredDistance() { return 3.5; }
  nextFireDelay() { return rnd(6, 9); }
}

/** Skeleton mage: keeps its distance, shoots more often, may carry a whole word. */
export class Mage extends Enemy {
  get type() { return 'mage'; }
  get walkSpeed() { return 0.7; }
  get preferredDistance() { return 5; }
  nextFireDelay(floor) { return rnd(3.5, 6) - Math.min(floor * 0.3, 2); }
}

/**
 * The Bellwraith, guardian of the stairs. One per floor.
 *  - Its name is never written in letters: above it you only see the Morse code, so you have to read it.
 *  - A bell shield blocks every spell. The wraith rings one letter on its bell in Morse, over and over.
 *    Listen (or watch the bell flash), then cast that letter at it to shatter the shield.
 *    Extra letters in the same spell carry on into its name (cast "T"+"EA" to shatter and hit at once).
 *  - While the shield is down it is stunned for a few seconds, then the shield comes back with a new letter.
 *  - Its name has several words (phases). Finish one and it summons slimes and gets angrier.
 */
export class Boss extends Enemy {
  constructor(x, y, words) {
    super(x, y, words[0]);
    this.radius = 0.45;
    this.words = words;
    this.phase = 0;
    this.shield = true;
    this.chant = null;   // letter rung on the bell while shielded
    this.openT = 0;      // seconds left with the shield broken
    this.volleys = 0;
    this.fireCd = 3;
  }
  get type() { return 'boss'; }
  get isBoss() { return true; }
  get hitRadius() { return 0.8; }
  get walkSpeed() { return this.openT > 0 ? 0.15 : 0.45 + this.phase * 0.15; }
  get preferredDistance() { return 4.5; }
  nextFireDelay(floor) { return Math.max(1.6, 3.6 - this.phase * 0.5 - floor * 0.1); }
  wants(letter) { return this.shield ? letter === this.chant : this.lock.next === letter; }

  raiseShield(room) {
    this.shield = true;
    this.openT = 0;
    let c; do c = pick(room.pool); while (c === this.chant && room.pool.length > 1);
    this.chant = c;
  }

  update(room, now, alive, shots) {
    if (!this.chant) this.chant = pick(room.pool);
    if (this.openT > 0) {
      this.openT -= DT;
      if (this.openT <= 0) { this.raiseShield(room); room.emit({ t: 'bshield', x: this.x, y: this.y }); }
    }
    super.update(room, now, alive, shots);
  }

  /** Fans of letters, and every third volley a ring. Stunned (no attacks) while the shield is broken. */
  attack(room, ux, uy) {
    if (!this.shield) return;
    const inFlight = room.spells.filter(s => !s.fromPlayer).length;
    if (inFlight > 8 + room.players.size * 2) return;
    const speed = Math.min(1.7 + room.floor * 0.15, 3);
    this.volleys++;
    const shoot = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      room.spells.push(new EnemySpell(this.x + dx * 0.6, this.y + dy * 0.6, pick(room.pool), dx * speed, dy * speed));
    };
    const base = Math.atan2(uy, ux);
    if (this.phase > 0 && this.volleys % 3 === 0) {
      const n = 6 + this.phase * 2;
      for (let k = 0; k < n; k++) shoot(base + k * 2 * Math.PI / n);
    } else {
      const n = 3 + this.phase;
      for (let k = 0; k < n; k++) shoot(base + (k - (n - 1) / 2) * 0.32);
    }
    room.emit({ t: 'ecast', x: this.x, y: this.y });
  }

  hitBy(room, spell) {
    let letters = spell.letters;
    if (this.shield) {
      if (letters[0] !== this.chant) { this.lock.wrong = 0.4; room.emit({ t: 'bblock', x: this.x, y: this.y }); return 'blocked'; }
      this.shield = false;
      this.openT = Math.max(5, 9 - room.floor * 0.5);
      room.emit({ t: 'bshatter', x: this.x, y: this.y, l: letters[0] });
      room.say(`${spell.owner.name} shattered the bell shield!`, 2);
      letters = letters.slice(1);
      if (!letters) return 'shatter';
    }
    const result = this.lock.apply(letters);
    if (result !== 'done') return result;
    this.phase++;
    if (this.phase >= this.words.length) return 'done';
    // next word: the wraith shrieks, summons help and puts its shield back up
    this.lock = new WordLock(this.words[this.phase]);
    this.raiseShield(room);
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = this.x + Math.cos(a) * 1.5, y = this.y + Math.sin(a) * 1.5;
      if (!room.dungeon.blocked(x, y, 0.32)) room.enemies.push(new Slime(x, y, pick(room.pool)));
    }
    room.emit({ t: 'bphase', x: this.x, y: this.y });
    room.say(`The Bellwraith shrieks! ${this.words.length - this.phase} name${this.words.length - this.phase > 1 ? 's' : ''} left`, 3);
    return 'phase';
  }

  snapshot() {
    return { ...super.snapshot(), phase: this.phase, phases: this.words.length, shield: this.shield, chant: this.chant, open: Math.max(0, Math.ceil(this.openT)) };
  }
  toSave() { return { ...super.toSave(), words: this.words, phase: this.phase }; }
  static fromSave(s) {
    const b = new Boss(s.x, s.y, s.words);
    b.phase = Math.min(s.phase | 0, s.words.length - 1);
    b.lock = WordLock.fromSave(s.lock);
    return b;
  }
}

// ------------------------------------------------------------------ chest

export class Chest extends Entity {
  constructor(x, y, word) {
    super(x, y);
    this.lock = new WordLock(word);
    this.open = false;
  }
  update() { this.lock.tick(); }
  snapshot() { return { ...super.snapshot(), ...this.lock.snapshot(), open: this.open }; }
  toSave() { return { x: this.x, y: this.y, open: this.open, lock: this.lock.toSave() }; }
  static fromSave(s) { const c = new Chest(s.x, s.y, s.lock.word); c.lock = WordLock.fromSave(s.lock); c.open = !!s.open; return c; }
}

// ------------------------------------------------------------------ spells

/** A flying letter (or word, for player spells). */
export class Spell extends Entity {
  constructor(x, y, letters, vx, vy, lifetime) {
    super(x, y);
    this.letters = letters;
    this.vx = vx; this.vy = vy;
    this.ttl = lifetime;
  }
  get fromPlayer() { return false; }
  /** Speed multiplier this tick (enemy spells slow down under Slow Time). */
  timeScale(room, now) { return 1; }
  /** Hit a wall. Return true if the spell survives. */
  onWall(room, prevX, prevY) { room.emit({ t: 'fizzle', x: this.x, y: this.y }); return false; }

  update(room, now) {
    const px = this.x, py = this.y, k = this.timeScale(room, now);
    this.x += this.vx * DT * k; this.y += this.vy * DT * k; this.ttl -= DT * k;
    if (this.ttl <= 0) { this.removed = true; return; }
    if (room.dungeon.solid(this.x, this.y) && !this.onWall(room, px, py)) this.removed = true;
  }
  snapshot() { return { ...super.snapshot(), o: this.fromPlayer ? 'p' : 'e', l: this.letters }; }
}

/** Thrown by enemies: one letter, flies straight. */
export class EnemySpell extends Spell {
  constructor(x, y, letter, vx, vy) {
    super(x, y, letter, vx, vy, 8);
    this.countered = false; // a cloak already fired at it
  }
  timeScale(room, now) { return room.slowUntil > now ? 0.4 : 1; }
}

/** Cast by a player: homes on a target and finds its way around walls. */
export class PlayerSpell extends Spell {
  constructor(owner, letters, dx, dy, target) {
    const spd = owner.spellSpeed;
    super(owner.x + dx * 0.4, owner.y + dy * 0.4, letters, dx * spd, dy * spd, SPELL.lifetime);
    this.owner = owner;
    this.spd = spd;
    this.color = owner.color;
    this.target = target;   // { kind: 'proj' | 'enemy' | 'chest', id } or null
    this.path = null;       // waypoints around walls
    this.repath = 0;
    this.aim = null;        // point it is steering toward right now
  }
  get fromPlayer() { return true; }

  update(room, now) {
    if (this.target) {
      const t = room.findTarget(this.target);
      if (t && !t.removed && !t.open) this.steer(room, t);
      else this.target = null;
    }
    super.update(room, now);
  }

  /** A guided spell slides along the wall instead of breaking. */
  onWall(room, px, py) {
    if (!this.target) return super.onWall(room);
    this.x = px; this.y = py;
    const d = this.aim ? Math.hypot(this.aim.x - this.x, this.aim.y - this.y) : 0;
    if (d > 0.01) { this.vx = (this.aim.x - this.x) / d * this.spd; this.vy = (this.aim.y - this.y) / d * this.spd; }
    return true;
  }

  /** Curve toward the target, following a path around walls when there is no clear line. */
  steer(room, t) {
    const dg = room.dungeon;
    let aim = t;
    if (!dg.los(this.x, this.y, t.x, t.y)) {
      this.repath -= DT;
      if (!this.path || this.repath <= 0) { this.path = dg.findPath(this.x, this.y, t.x, t.y, SPELL.homingPath) || null; this.repath = 0.25; }
      if (this.path) {
        while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].y - this.y) < 0.6) this.path.shift();
        // aim at the farthest of the next few waypoints we can see, so the curve is smooth
        aim = this.path[0] || t;
        for (let k = Math.min(this.path.length - 1, 4); k > 0; k--) if (dg.los(this.x, this.y, this.path[k].x, this.path[k].y)) { aim = this.path[k]; break; }
      }
    } else this.path = null;
    this.aim = aim;
    const want = Math.atan2(aim.y - this.y, aim.x - this.x), cur = Math.atan2(this.vy, this.vx);
    let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const close = Math.hypot(t.x - this.x, t.y - this.y) < 1.5;
    const turn = close ? diff : Math.max(-SPELL.turnRate * DT, Math.min(SPELL.turnRate * DT, diff));
    const a = cur + turn;
    this.vx = Math.cos(a) * this.spd; this.vy = Math.sin(a) * this.spd;
  }
  snapshot() { return { ...super.snapshot(), c: this.color }; }
}

// ------------------------------------------------------------------ floor item

/** An item lying on the floor, waiting for someone to press g. */
export class FloorItem extends Entity {
  constructor(item, x, y) {
    super(x, y);
    this.id = item.id; // items keep their own id so they stay the same object across pack and floor
    this.item = item;
  }
  toSave() { return { x: this.x, y: this.y, item: this.item }; }
  static fromSave(s) { const it = Items.restoreItem(s.item); return it ? new FloorItem(it, s.x, s.y) : null; }
  snapshot() {
    const d = Items.DEFS[this.item.kind];
    return { id: this.id, x: this.x, y: this.y, kind: this.item.kind, type: d.type, slot: d.slot || null, name: Items.displayName(this.item) };
  }
}
