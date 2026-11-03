import { MAP_W, MAP_H } from './config.js';
import { rint } from './util.js';

/** One generated floor: tile grid, rooms, start room and stairs, plus collision and path helpers. */
export class Dungeon {
  /** Pass `saved` (from toSave) to restore a floor instead of generating a new one. */
  constructor(saved = null) {
    this.w = MAP_W;
    this.h = MAP_H;
    this.tiles = new Uint8Array(MAP_W * MAP_H); // 0 = wall, 1 = floor
    this.rooms = [];
    if (saved) this.restore(saved); else this.generate();
  }

  // ---- saving
  toSave() { return { tiles: Array.from(this.tiles).join(''), rooms: this.rooms, stairs: this.stairs }; }
  restore(saved) {
    this.tiles = Uint8Array.from(saved.tiles, c => +c);
    this.rooms = saved.rooms;
    this.start = this.rooms[0];
    this.stairs = saved.stairs;
  }

  // ---- generation: random rooms chained by 2-wide L-shaped corridors
  generate() {
    const rooms = [];
    for (let tries = 0; tries < 400 && rooms.length < 9; tries++) {
      const w = rint(5, 9), h = rint(5, 9);
      const x = rint(2, MAP_W - w - 3), y = rint(2, MAP_H - h - 3);
      if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
    }
    for (const r of rooms) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) this.carve(i, j);

    // Chain rooms in nearest-neighbour order so corridors don't criss-cross too much.
    const order = [rooms[0]], left = rooms.slice(1);
    while (left.length) {
      const last = order[order.length - 1];
      left.sort((a, b) => Math.hypot(a.cx - last.cx, a.cy - last.cy) - Math.hypot(b.cx - last.cx, b.cy - last.cy));
      order.push(left.shift());
    }
    for (let k = 1; k < order.length; k++) this.corridor(order[k - 1], order[k]);

    this.rooms = order;
    this.start = order[0];
    const end = order[order.length - 1];
    this.stairs = { x: Math.floor(end.cx), y: Math.floor(end.cy) };
  }
  carve(x, y) { if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) this.tiles[y * MAP_W + x] = 1; }
  corridor(a, b) {
    const ax = Math.floor(a.cx), ay = Math.floor(a.cy), bx = Math.floor(b.cx), by = Math.floor(b.cy);
    const hline = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { this.carve(x, y); this.carve(x, y + 1); } };
    const vline = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { this.carve(x, y); this.carve(x + 1, y); } };
    if (Math.random() < 0.5) { hline(ay, ax, bx); vline(bx, ay, by); } else { vline(ax, ay, by); hline(by, ax, bx); }
  }

  // ---- queries
  solid(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H) return true;
    return this.tiles[j * MAP_W + i] === 0;
  }
  /** Would a circle of radius r at (x, y) overlap a wall? */
  blocked(x, y, r) { return this.solid(x - r, y - r) || this.solid(x + r, y - r) || this.solid(x - r, y + r) || this.solid(x + r, y + r); }
  /** Clear line of sight between two points? */
  los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d / 0.25);
    for (let s = 1; s < steps; s++) { const t = s / steps; if (this.solid(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  isStairs(x, y) { return Math.floor(x) === this.stairs.x && Math.floor(y) === this.stairs.y; }

  /** Breadth-first search over floor tiles (8-way, no corner cutting). Returns tile-centre waypoints, or undefined. */
  findPath(ax, ay, bx, by, maxLen) {
    const sx = Math.floor(ax), sy = Math.floor(ay), gx = Math.floor(bx), gy = Math.floor(by);
    const start = sy * MAP_W + sx, goal = gy * MAP_W + gx;
    if (start === goal) return [];
    const prev = new Int32Array(MAP_W * MAP_H).fill(-1), depth = new Uint8Array(MAP_W * MAP_H);
    prev[start] = start; const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]; if (c === goal) break;
      if (depth[c] >= maxLen) continue;
      const cx = c % MAP_W, cy = (c / MAP_W) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const n = ny * MAP_W + nx;
        if (prev[n] !== -1 || !this.tiles[n]) continue;
        if (ox && oy && (!this.tiles[cy * MAP_W + nx] || !this.tiles[ny * MAP_W + cx])) continue;
        prev[n] = c; depth[n] = depth[c] + 1; q.push(n);
      }
    }
    if (prev[goal] === -1) return undefined;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push({ x: c % MAP_W + 0.5, y: ((c / MAP_W) | 0) + 0.5 });
    return out.reverse();
  }

  /** What the client needs to draw the floor. */
  toMessage(floor, pool) {
    return { t: 'map', w: this.w, h: this.h, tiles: Array.from(this.tiles).join(''), floor, stairs: this.stairs, pool };
  }
}
