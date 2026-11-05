// The duel room: two casters face each other on a long, narrow platform floating among the stars.
//
// - Any letter A to Z can be cast. A spell homes (gently) on the other caster.
// - Blocking works like in the dungeon: when two spells meet, matching first letters cancel each
//   other, letter by letter. Cast T at an incoming TEA and only EA keeps flying; cast TEA and both vanish.
// - Spells only bend a little toward the other caster; they do not track you. Blocking spells steer harder.
// - Words are what hurt: damage grows with the square of the length, so a single easy letter barely
//   scratches and a long word is deadly. Blocking part of a word leaves only the weaker rest.
// - Rounds start with a countdown. First to DUEL.winsNeeded round wins takes the duel, then a new one starts.
// - Levels and gear from the dungeon do not count here: both casters have the same HP, so it is all
//   about Morse speed, aim and blocking. Duels are never saved.
import { TICK_MS, DT, PLAYER, SPELL, DUEL, HITBOX } from './config.js';
import { Dungeon } from './Dungeon.js';
import { Player, PlayerSpell } from './entities.js';
import { LETTER_VALUE } from './progression.js';
import { letterPool } from './words.js';

const ALL_LETTERS = letterPool(99); // every letter, easiest first

// ------------------------------------------------------------------ arena

/** The platform: one long, narrow strip of floor. Everything around it is open sky (solid for walking). */
export class Arena extends Dungeon {
  constructor() { super(null, { w: DUEL.mapW, h: DUEL.mapH }); }
  generate() {
    const L = DUEL.platformLength, W = DUEL.platformWidth;
    const x = Math.floor((this.w - L) / 2), y = Math.floor((this.h - W) / 2);
    this.platform = { x, y, w: L, h: W };
    for (let j = y; j < y + W; j++) for (let i = x; i < x + L; i++) this.tiles[j * this.w + i] = 1;
    const r = { x, y, w: L, h: W, cx: x + L / 2, cy: y + W / 2 };
    this.rooms = [r]; this.start = r;
    this.stairs = { x: -1, y: -1 }; // no stairs in a duel
  }
  /** Each caster starts on their own end of the platform: side 0 on the left, side 1 on the right. */
  startFor(side) {
    const p = this.platform;
    return { x: side ? p.x + p.w - 2.5 : p.x + 2.5, y: p.y + p.h / 2 };
  }
  toMessage() { return { ...super.toMessage(0, ALL_LETTERS), duel: true, platform: this.platform }; }
}

// ------------------------------------------------------------------ duellist and duel spell

/** A caster in a duel: fixed HP, no regeneration, never revives on their own (rounds do that). */
export class DuelPlayer extends Player {
  constructor(ws, name, side) {
    super(ws, name, PLAYER.colors[side]);
    this.side = side;
    this.wins = 0;
  }
  refreshStats() {
    super.refreshStats();
    this.maxHp = DUEL.hp;
    if (this.hp !== undefined) this.hp = Math.min(this.hp, this.maxHp);
  }
  regenerate() {}
  /** Back to my end of the platform at full HP. */
  resetFor(arena) {
    const p = arena.startFor(this.side);
    this.x = p.x; this.y = p.y;
    this.dead = false; this.respawnAt = Infinity;
    this.hp = this.maxHp; this.hurt = 0;
  }
  snapshot(now) { return { ...super.snapshot(now), side: this.side, wins: this.wins }; }
}

/** Slower than a dungeon spell and turns gently, so the other caster can read it, block it or dodge it. */
export class DuelSpell extends PlayerSpell {
  constructor(owner, letters, dx, dy, target) {
    super(owner, letters, dx, dy, target);
    this.spd = DUEL.spellSpeed;
    this.vx = dx * this.spd; this.vy = dy * this.spd;
    this.ttl = DUEL.spellLifetime;
    this.bent = 0; // radians curved toward the other caster so far
  }
  get turnRate() { return DUEL.blockTurnRate; }
  snapsTo(target) { return target.kind === 'proj'; } // locks on to a spell it blocks
  /** Only a spell steering to meet another spell slides along the platform's edge; the rest fizzle there. */
  onWall(room, px, py) {
    if (this.target && this.target.kind === 'proj') return super.onWall(room, px, py);
    room.emit({ t: 'fizzle', x: this.x, y: this.y });
    return false;
  }
  /** Toward a caster: a small, limited bend while still far away, then straight on. */
  steer(room, t) {
    if (this.target.kind !== 'player') return super.steer(room, t);
    const left = DUEL.maxBend - this.bent;
    if (left <= 0 || Math.hypot(t.x - this.x, t.y - this.y) < DUEL.bendStop) return;
    const want = Math.atan2(t.y - this.y, t.x - this.x), cur = Math.atan2(this.vy, this.vx);
    let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const step = Math.min(DUEL.bendRate * DT, left);
    const turn = Math.max(-step, Math.min(step, diff));
    this.bent += Math.abs(turn);
    const a = cur + turn;
    this.vx = Math.cos(a) * this.spd; this.vy = Math.sin(a) * this.spd;
  }
  /**
   * Damage when it reaches the other caster: the letters' Morse difficulty (1 to 4 each) times half the
   * length. E = 1, TEA = 5, MOON = 12, GHOST = 28, SHADOW = 39 (of 50 HP).
   */
  get damage() {
    const sum = [...this.letters].reduce((a, c) => a + (LETTER_VALUE[c] || 1), 0);
    return Math.max(1, Math.round(sum * this.letters.length / 2));
  }
}

// ------------------------------------------------------------------ room

export class DuelRoom {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.maxPlayers = 2;
    this.players = new Map(); // id -> DuelPlayer
    this.dungeon = new Arena();
    this.spells = [];
    this.events = [];
    this.banner = null;
    this.phase = 'waiting';   // waiting (for a second caster), countdown, fight, roundover, over
    this.phaseUntil = 0;
    this.round = 0;
    this.lastWinner = null;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  // ------------------------------------------------------------------ helpers
  emit(event) { this.events.push(event); }
  say(text, secs = 3) { this.banner = { text, until: Date.now() + secs * 1000 }; }
  broadcast(obj) { const s = JSON.stringify(obj); for (const pl of this.players.values()) pl.send(s); }
  opponentOf(pl) { for (const o of this.players.values()) if (o !== pl) return o; return null; }
  stop() { clearInterval(this.timer); }
  save() { return false; }
  saveNow(pl) { pl.tell('Duels are not saved.'); }
  command(pl) { pl.tell('No items in a duel: just you, your wand and the alphabet.'); }

  // ------------------------------------------------------------------ players
  addPlayer(ws, name) {
    const taken = new Set([...this.players.values()].map(p => p.side));
    const pl = new DuelPlayer(ws, name, taken.has(0) ? 1 : 0);
    pl.resetFor(this.dungeon);
    this.players.set(pl.id, pl);
    pl.send({ t: 'welcome', id: pl.id, room: this.code, duel: true });
    pl.send(this.dungeon.toMessage());
    if (this.players.size === 2) this.newMatch(`${pl.name} accepts the duel!`);
    else { this.phase = 'waiting'; this.say('Waiting for an opponent. Share the page link!', 4); }
    return pl;
  }
  removePlayer(pl) {
    this.players.delete(pl.id);
    if (this.players.size === 0) { this.stop(); this.onEmpty(this); return; }
    this.phase = 'waiting';
    this.spells = [];
    for (const p of this.players.values()) { p.wins = 0; p.resetFor(this.dungeon); }
    this.say(`${pl.name} left the duel. Waiting for an opponent...`, 4);
  }

  // ------------------------------------------------------------------ rounds
  newMatch(text) {
    this.round = 0;
    for (const p of this.players.values()) p.wins = 0;
    this.startRound(text);
  }
  startRound(text) {
    this.round++;
    this.spells = [];
    for (const p of this.players.values()) p.resetFor(this.dungeon);
    this.phase = 'countdown';
    this.phaseUntil = Date.now() + DUEL.countdown * 1000;
    this.say(text || `Round ${this.round}`, 2);
  }
  /** Move on when the current phase runs out. */
  advancePhase(now) {
    if (this.phase === 'waiting' || this.phase === 'fight' || now < this.phaseUntil) return;
    if (this.phase === 'countdown') {
      this.phase = 'fight';
      this.say('Duel!', 1);
      this.emit({ t: 'duelgo' });
    } else if (this.phase === 'roundover') this.startRound();
    else if (this.phase === 'over') this.newMatch('A new duel begins');
  }
  /** One caster is down: score the round, maybe the whole duel. */
  endRound(winner, loser, now) {
    loser.dead = true; loser.hp = 0;
    winner.wins++;
    this.lastWinner = winner.id;
    this.spells = [];
    this.emit({ t: 'down', x: loser.x, y: loser.y, id: loser.id });
    if (winner.wins >= DUEL.winsNeeded) {
      this.phase = 'over';
      this.phaseUntil = now + DUEL.matchPause * 1000;
      this.emit({ t: 'duelwin', x: winner.x, y: winner.y, id: winner.id, c: winner.color });
      this.say(`${winner.name} wins the duel ${winner.wins} - ${loser.wins}!`, DUEL.matchPause);
    } else {
      this.phase = 'roundover';
      this.phaseUntil = now + DUEL.roundPause * 1000;
      this.say(`${winner.name} wins round ${this.round}`, DUEL.roundPause);
    }
  }

  // ------------------------------------------------------------------ casting
  /** Casting works while you wait for an opponent (practice) and during a fight, not between rounds. */
  cast(pl, word, dx, dy) {
    if (pl.dead || (this.phase !== 'fight' && this.phase !== 'waiting')) return;
    if (typeof word !== 'string' || !new RegExp(`^[A-Z]{1,${pl.maxLetters}}$`).test(word)) return;
    const len = Math.hypot(dx, dy); if (!len || !isFinite(len)) return;
    dx /= len; dy /= len;
    pl.casts++;
    this.spells.push(new DuelSpell(pl, word, dx, dy, this.chooseTarget(pl, word[0], dx, dy)));
    this.emit({ t: 'cast', x: pl.x, y: pl.y, c: pl.color });
  }

  /**
   * Soft aim, like in the dungeon: an incoming spell that starts with my first letter is the best
   * target (that is a block), otherwise the other caster, as long as they are inside the aim cone.
   */
  chooseTarget(pl, letter, dx, dy, from = pl) {
    let best = null, bestScore = Infinity;
    const consider = (kind, o, weight) => {
      const vx = o.x - from.x, vy = o.y - from.y, d = Math.hypot(vx, vy);
      if (d < 0.01) return;
      const cos = (vx * dx + vy * dy) / d;
      if (cos < SPELL.homingCone) return;
      const score = d * (2 - Math.max(cos, 0)) * weight;
      if (score < bestScore) { bestScore = score; best = { kind, id: o.id }; }
    };
    for (const s of this.spells) if (!s.removed && s.owner !== pl && s.letters[0] === letter) consider('proj', s, 0.7);
    const foe = this.opponentOf(pl);
    if (foe && !foe.dead) consider('player', foe, 1);
    return best;
  }
  findTarget({ kind, id }) {
    if (kind === 'proj') return this.spells.find(s => s.id === id);
    const p = this.players.get(id);
    return p && !p.dead ? p : null;
  }

  // ------------------------------------------------------------------ simulation
  tick() {
    const now = Date.now();
    this.advancePhase(now);
    const alive = [...this.players.values()].filter(p => !p.dead);
    if (this.phase !== 'countdown') for (const pl of this.players.values()) pl.update(this, now, alive);
    for (const s of this.spells) s.update(this, now);
    this.resolveCollisions(now);
    this.spells = this.spells.filter(s => !s.removed);
    this.broadcastState(now);
  }

  resolveCollisions(now) {
    const live = () => this.spells.filter(s => !s.removed);
    // Spell vs spell: matching first letters cancel each other, letter by letter.
    for (const a of live()) {
      for (const b of live()) {
        if (a.removed || b.removed || a.owner === b.owner || a.id > b.id) continue;
        if (a.distanceTo(b) >= HITBOX.block || a.letters[0] !== b.letters[0]) continue;
        let k = 0;
        while (k < a.letters.length && k < b.letters.length && a.letters[k] === b.letters[k]) k++;
        const cancelled = a.letters.slice(0, k);
        this.emit({ t: 'block', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, l: cancelled });
        // the block counts for whoever aimed at the other spell (both, if both did)
        for (const [s, o] of [[a, b], [b, a]]) if (s.target && s.target.kind === 'proj' && s.target.id === o.id) s.owner.blocks += k;
        for (const s of [a, b]) {
          s.letters = s.letters.slice(k);
          if (!s.letters) { s.removed = true; continue; }
          // what is left flies on at the other caster
          const d = Math.hypot(s.vx, s.vy) || 1;
          s.target = this.chooseTarget(s.owner, s.letters[0], s.vx / d, s.vy / d, s);
          s.path = null;
        }
      }
    }
    // Spell vs caster.
    for (const s of live()) {
      if (this.phase !== 'fight') break;
      const foe = this.opponentOf(s.owner);
      if (!foe || foe.dead || s.distanceTo(foe) > HITBOX.caster) continue;
      s.removed = true;
      const dmg = s.damage;
      foe.hp = Math.max(0, foe.hp - dmg);
      foe.hurt = 0.4;
      foe.lastHitAt = now;
      this.emit({ t: 'hurt', x: foe.x, y: foe.y, id: foe.id, n: dmg });
      if (foe.hp <= 0) this.endRound(s.owner, foe, now);
    }
  }

  broadcastState(now) {
    const base = JSON.stringify({
      t: 'state', ts: now, floor: 0, stairsOpen: false, slow: 0,
      msg: this.banner && this.banner.until > now ? this.banner.text : null,
      duel: {
        phase: this.phase, round: this.round, need: DUEL.winsNeeded, winner: this.lastWinner,
        count: this.phase === 'countdown' ? Math.max(1, Math.ceil((this.phaseUntil - now) / 1000)) : 0,
      },
      players: [...this.players.values()].map(p => ({ ...p.snapshot(now), still: this.phase === 'countdown' })), // nobody walks during the countdown
      enemies: [], chests: [], items: [],
      projs: this.spells.map(s => s.snapshot()),
    });
    for (const pl of this.players.values()) pl.sendState(base, this.events);
    this.events = [];
  }
}
