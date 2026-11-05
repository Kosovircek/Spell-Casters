import { MAP_W, MAP_H, HITBOX } from './config.js';
import { rint } from './util.js';

/**
 * Tile codes (sent to the client as one base-36 character per tile). The dungeon only uses WALL and FLOOR;
 * the surface town adds grass, paths, trees and buildings. Doors are walkable: stepping in opens the shop or your house, or takes you into the duel arena.
 */
export const TILE = { WALL: 0, FLOOR: 1, GRASS: 2, PATH: 3, TREE: 4, HOUSE: 5, SHOP: 6, HOME_DOOR: 7, SHOP_DOOR: 8, ARENA: 9, ARENA_DOOR: 10 };
/** Tiles travel as one character each: 0-9, then a, b... (base 36), so old all-digit saves still load. */
const encodeTiles = (tiles) => Array.from(tiles, t => t.toString(36)).join('');

export const WALKABLE = new Set([TILE.FLOOR, TILE.GRASS, TILE.PATH, TILE.HOME_DOOR, TILE.SHOP_DOOR, TILE.ARENA_DOOR]);

/** One generated floor: tile grid, rooms, start room, stairs down and up, plus collision and path helpers. */
export class Dungeon {
  /** Pass `saved` (from toSave) to restore a floor instead of generating a new one. Subclasses may pick another size. */
  constructor(saved = null, size = { w: MAP_W, h: MAP_H }) {
    this.w = size.w;
    this.h = size.h;
    this.tiles = new Uint8Array(this.w * this.h); // 0 = wall, 1 = floor
    this.rooms = [];
    if (saved) this.restore(saved); else this.generate();
  }

  // ---- saving
  toSave() { return { tiles: encodeTiles(this.tiles), rooms: this.rooms, stairs: this.stairs, up: this.up }; }
  restore(saved) {
    this.tiles = Uint8Array.from(saved.tiles, c => parseInt(c, 36));
    this.rooms = saved.rooms;
    this.start = this.rooms[0];
    this.stairs = saved.stairs;
    this.up = saved.up || this.upStairsIn(this.start); // floors saved before stairs up existed get them now
  }

  // ---- generation: random rooms chained by 2-wide L-shaped corridors
  generate() {
    const rooms = [];
    for (let tries = 0; tries < 400 && rooms.length < 9; tries++) {
      const w = rint(5, 9), h = rint(5, 9);
      const x = rint(2, this.w - w - 3), y = rint(2, this.h - h - 3);
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
    this.up = this.upStairsIn(this.start);
  }
  /** Stairs up sit in the start room's top-left corner, away from its middle where the party arrives. */
  upStairsIn(r) { return { x: r.x + 1, y: r.y + 1 }; }
  carve(x, y) { if (x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1) this.tiles[y * this.w + x] = 1; }
  corridor(a, b) {
    const ax = Math.floor(a.cx), ay = Math.floor(a.cy), bx = Math.floor(b.cx), by = Math.floor(b.cy);
    const hline = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { this.carve(x, y); this.carve(x, y + 1); } };
    const vline = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { this.carve(x, y); this.carve(x + 1, y); } };
    if (Math.random() < 0.5) { hline(ay, ax, bx); vline(bx, ay, by); } else { vline(ax, ay, by); hline(by, ax, bx); }
  }

  // ---- queries
  solid(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return true;
    return !WALKABLE.has(this.tiles[j * this.w + i]);
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
  /** 'down', 'up' or null for the tile under (x, y). */
  stairsAt(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    if (this.stairs && i === this.stairs.x && j === this.stairs.y) return 'down';
    if (this.up && i === this.up.x && j === this.up.y) return 'up';
    return null;
  }
  /** A free spot next to (not on) the stairs down or up, where a party arriving by them appears. */
  beside(which) {
    const st = which === 'up' ? this.up : this.stairs;
    if (!st) return { x: this.start.cx, y: this.start.cy };
    for (const [ox, oy] of [[0, 1.5], [1.5, 0], [-1.5, 0], [0, -1.5], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) {
      const x = st.x + 0.5 + ox, y = st.y + 0.5 + oy;
      if (!this.blocked(x, y, 0.35) && !this.stairsAt(x, y)) return { x, y };
    }
    return { x: this.start.cx, y: this.start.cy };
  }

  /** Breadth-first search over floor tiles (8-way, no corner cutting). Returns tile-centre waypoints, or undefined. */
  findPath(ax, ay, bx, by, maxLen) {
    const sx = Math.floor(ax), sy = Math.floor(ay), gx = Math.floor(bx), gy = Math.floor(by);
    const start = sy * this.w + sx, goal = gy * this.w + gx;
    if (start === goal) return [];
    const prev = new Int32Array(this.w * this.h).fill(-1), depth = new Uint8Array(this.w * this.h);
    prev[start] = start; const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]; if (c === goal) break;
      if (depth[c] >= maxLen) continue;
      const cx = c % this.w, cy = (c / this.w) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const n = ny * this.w + nx;
        if (prev[n] !== -1 || !WALKABLE.has(this.tiles[n])) continue;
        if (ox && oy && (!WALKABLE.has(this.tiles[cy * this.w + nx]) || !WALKABLE.has(this.tiles[ny * this.w + cx]))) continue;
        prev[n] = c; depth[n] = depth[c] + 1; q.push(n);
      }
    }
    if (prev[goal] === -1) return undefined;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push({ x: c % this.w + 0.5, y: ((c / this.w) | 0) + 0.5 });
    return out.reverse();
  }

  /** What the client needs to draw the floor. */
  toMessage(floor, pool) {
    return { t: 'map', w: this.w, h: this.h, tiles: encodeTiles(this.tiles), floor, stairs: this.stairs, up: this.up || null, pool, hit: HITBOX };
  }
}
