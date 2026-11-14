// The orb an effect spell flies as: it carries the spell's word, so in a duel it can be read and blocked letter by
// letter like any spell (an orb that loses letters on the way lands weaker; one that loses them all is gone).
// It homes a little on the foe it was aimed at. Where it hits a foe, or stops at a wall or the end of its range,
// the spell's land() effect happens (see casts/*.js).
import { Spell } from '../entities.js';
import { DT, DUEL } from '../config.js';

export class RuneOrb extends Spell {
  /**
   * c = the cast (caster, spell, direction...). opts: speed (tiles/s), range (tiles), turn (rad/s homing),
   * letters (what it shows; the spell word by default), target ({ kind, id } or null).
   */
  constructor(magic, c, opts = {}) {
    const pl = c.pl, speed = opts.speed || (magic.duel ? 5 : 7), range = opts.range || (magic.duel ? 13 : 8);
    const sx = c.from ? c.from.x : pl.x, sy = c.from ? c.from.y : pl.y;
    super(sx + c.dx * 0.4, sy + c.dy * 0.4, opts.letters ?? c.sp.word, c.dx * speed, c.dy * speed, range / speed);
    this.magic = magic;
    this.cast = c;
    this.owner = pl;
    this.color = pl.color;
    this.rune = c.sp.id;          // which effect spell this is (the client draws it as a rune orb)
    this.full = this.letters.length;
    this.spd = speed;
    this.turn = opts.turn ?? (magic.duel ? 0.4 : 3);
    this.bent = 0;
    this.target = opts.target !== undefined ? opts.target : magic.aim(pl, c.dx, c.dy, range);
    this.onLand = opts.land;      // (x, y, foe) => effect; defaults to the spell's land()
  }
  get fromPlayer() { return true; }
  /** How much of the word got through: 1 when untouched. Blocked letters make the spell weaker. */
  get power() { return this.full ? Math.max(0.34, this.letters.length / this.full) : 1; }

  update(room, now) {
    if (this.target) {
      const t = room.findTarget(this.target);
      if (t && !t.removed && !t.dead) this.steer(t); else this.target = null;
    }
    const px = this.x, py = this.y;
    this.x += this.vx * DT * this.timeScale(room, now); this.y += this.vy * DT * this.timeScale(room, now);
    this.ttl -= DT;
    if (this.ttl <= 0) { this.land(px, py, null); return; }
    if (room.dungeon.airSolid(this.x, this.y)) this.land(px, py, null);
  }
  /** Curve toward the target: freely in the dungeon, only a little in a duel (so a sidestep still dodges it). */
  steer(t) {
    const want = Math.atan2(t.y - this.y, t.x - this.x), cur = Math.atan2(this.vy, this.vx);
    let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    let step = this.turn * DT;
    if (this.magic.duel) {
      if (Math.hypot(t.x - this.x, t.y - this.y) < DUEL.bendStop && this.target.kind === 'player') return;
      step = Math.min(step, Math.max(0, DUEL.maxBend - this.bent));
    }
    const turn = Math.max(-step, Math.min(step, diff));
    this.bent += Math.abs(turn);
    const a = cur + turn;
    this.vx = Math.cos(a) * this.spd; this.vy = Math.sin(a) * this.spd;
  }
  land(x, y, foe) {
    if (this.removed) return;
    this.removed = true;
    this.magic.landed(this, x, y, foe);
  }
  snapshot() { return { ...super.snapshot(), c: this.color, pid: this.owner.id, rn: this.rune }; }
}
