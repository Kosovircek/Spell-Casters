// Client-side prediction for my own caster.
//
// Without it, a key press goes to the server, waits for the next tick, and only moves the caster once the
// state comes back: on the machine running the server that round trip is free, but from any other device
// (even on the same Wi-Fi) it adds a noticeable delay to every step. So my caster walks locally at once,
// with the same speed and wall collision as the server, and the server's position only nudges it back
// when the two disagree. Big disagreements (respawn, new floor, a new duel round) snap straight to the server.
const RADIUS = 0.3;        // PLAYER.radius on the server
const SNAP = 2;            // tiles: further apart than this, jump to the server position
const DEADZONE_MOVING = 0.15, DEADZONE_STILL = 0.01; // tiles of disagreement that are left alone
const HISTORY_MS = 1500;

export class Prediction {
  constructor(game) {
    this.game = game;
    this.pos = null;       // predicted { x, y } of my caster, or null when following the server
    this.history = [];     // [{ t, x, y }] my predicted positions, newest last
    this.fix = { x: 0, y: 0 }; // correction toward the server still to be blended in
  }

  reset() { this.pos = null; this.history = []; this.fix = { x: 0, y: 0 }; }

  /** Is the circle of my caster at (x, y) inside a wall? Same test as Dungeon.blocked on the server. */
  blocked(x, y) {
    const w = this.game.world, solid = (px, py) => !w.walkable(Math.floor(px), Math.floor(py));
    return solid(x - RADIUS, y - RADIUS) || solid(x + RADIUS, y - RADIUS) || solid(x - RADIUS, y + RADIUS) || solid(x + RADIUS, y + RADIUS);
  }

  /** Every frame, before the world updates: walk my caster and hand it the position to draw. */
  update(dt, now) {
    const me = this.game.world.player(this.game.myId);
    if (!me) return this.reset();
    const d = me.data;
    if (d.dead || d.still || !d.spd) { this.reset(); me.local = null; return; } // follow the server as usual
    if (!this.pos) this.pos = { x: d.x, y: d.y };
    const p = this.pos;

    // blend in part of the pending correction (and shift the history with it, so it is not counted twice)
    const k = Math.min(1, dt * 10), cx = this.fix.x * k, cy = this.fix.y * k;
    if (cx || cy) {
      p.x += cx; p.y += cy; this.fix.x -= cx; this.fix.y -= cy;
      for (const h of this.history) { h.x += cx; h.y += cy; }
    }

    // walk: x and y separately so you slide along walls, exactly like Actor.moveBy
    const dir = this.game.input.dir, step = d.spd * dt;
    if (dir.x || dir.y) {
      const dx = dir.x * step, dy = dir.y * step;
      if (!this.blocked(p.x + dx, p.y)) p.x += dx;
      if (!this.blocked(p.x, p.y + dy)) p.y += dy;
    }
    this.history.push({ t: now, x: p.x, y: p.y });
    while (this.history.length && now - this.history[0].t > HISTORY_MS) this.history.shift();
    me.local = p;
  }

  /** A server state arrived: compare it with where I predicted I was when the server worked it out. */
  onServer(now) {
    const me = this.game.world.player(this.game.myId);
    if (!me || !this.pos) return;
    const d = me.data;
    // the server's position is about one round trip old, plus up to one tick waiting for my input
    const past = this.at(now - this.game.network.rtt - 25);
    if (!past) return;
    const ex = d.x - past.x, ey = d.y - past.y, err = Math.hypot(ex, ey);
    if (err > SNAP) { this.reset(); this.pos = { x: d.x, y: d.y }; return; }
    const moving = this.game.input.dir.x || this.game.input.dir.y;
    this.fix = err > (moving ? DEADZONE_MOVING : DEADZONE_STILL) ? { x: ex, y: ey } : { x: 0, y: 0 };
  }

  /** My predicted position at time t (interpolated from the history). */
  at(t) {
    const h = this.history;
    if (!h.length) return null;
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1];
        if (!b) return a;
        const f = (t - a.t) / (b.t - a.t || 1);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    return h[0];
  }
}
