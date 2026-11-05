// The surface: a small village above the dungeon with your house, a shop, the duel arena and the stairs down to floor 1.
// It is always the same, so it is built here instead of being saved (only the items dropped in it are kept).
import { Dungeon, TILE } from './Dungeon.js';

const W = 40, H = 26;

/** Deterministic 0..1 noise, so every visit (and every server) grows the same trees. */
const noise = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };

export class Town extends Dungeon {
  constructor() { super(null, { w: W, h: H }); }

  generate() {
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t; };
    const rect = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t); };

    rect(0, 0, W, H, TILE.TREE);              // a forest all around...
    rect(2, 2, W - 4, H - 4, TILE.GRASS);     // ...and a clearing in the middle

    // Buildings: the bottom row is the wall you see, with the door in the middle of it.
    this.home = { x: 6, y: 4, w: 7, h: 5 };
    this.shop = { x: 25, y: 4, w: 9, h: 5 };
    rect(this.home.x, this.home.y, this.home.w, this.home.h, TILE.HOUSE);
    rect(this.shop.x, this.shop.y, this.shop.w, this.shop.h, TILE.SHOP);
    // The duel arena, down to the right of the square: walk through its gate to duel a caster from your party.
    this.arena = { x: 30, y: 15, w: 7, h: 5 };
    rect(this.arena.x, this.arena.y, this.arena.w, this.arena.h, TILE.ARENA);
    const homeDoor = { x: this.home.x + 3, y: this.home.y + this.home.h - 1 };
    const shopDoor = { x: this.shop.x + 4, y: this.shop.y + this.shop.h - 1 };
    const arenaDoor = { x: this.arena.x + 3, y: this.arena.y + this.arena.h - 1 };
    set(homeDoor.x, homeDoor.y, TILE.HOME_DOOR);
    set(shopDoor.x, shopDoor.y, TILE.SHOP_DOOR);
    set(arenaDoor.x, arenaDoor.y, TILE.ARENA_DOOR);
    this.doors = [
      { kind: 'home', name: 'Home', ...homeDoor },
      { kind: 'shop', name: 'Dot & Dash Goods', ...shopDoor },
      { kind: 'arena', name: 'Duel Arena', ...arenaDoor },
    ];

    // Dirt paths from both doors to the village square, and a stone square around the stairs down.
    rect(homeDoor.x, homeDoor.y + 1, 2, 5, TILE.PATH);
    rect(shopDoor.x - 1, shopDoor.y + 1, 2, 5, TILE.PATH);
    rect(homeDoor.x, 13, shopDoor.x - homeDoor.x + 1, 2, TILE.PATH);
    rect(19, 13, 2, 3, TILE.PATH);
    rect(24, arenaDoor.y + 1, arenaDoor.x - 24 + 1, 2, TILE.PATH); // from the square's east side to the arena gate
    const square = { x: 16, y: 16, w: 8, h: 5 };
    rect(square.x, square.y, square.w, square.h, TILE.FLOOR);
    this.stairs = { x: 19, y: 18 };
    this.up = null; // nothing above the surface

    // A few trees dotted about the grass, never on a path or next to a building.
    for (let j = 3; j < H - 3; j++) for (let i = 3; i < W - 3; i++) {
      if (this.tiles[j * this.w + i] !== TILE.GRASS || noise(i, j) < 0.93) continue;
      const nearBuilt = [this.home, this.shop, this.arena, square].some(b => i >= b.x - 2 && i < b.x + b.w + 2 && j >= b.y - 2 && j < b.y + b.h + 2);
      const nearPath = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => this.tiles[(j + b) * this.w + i + a] === TILE.PATH);
      if (!nearBuilt && !nearPath) set(i, j, TILE.TREE);
    }

    // "Rooms" are where Teleportation may send you, and the start is where recall lands: the village square.
    const plaza = { x: 8, y: 12, w: 24, h: 3, cx: 20, cy: 13.5 };
    this.rooms = [plaza];
    this.start = plaza;
  }

  toMessage(floor, pool) { return { ...super.toMessage(floor, pool), town: true, doors: this.doors }; }
  /** Where you come back out of the arena: on the path, a few steps in front of its gate (far enough not to walk straight back in). */
  get arenaExit() { const d = this.doors.find(d => d.kind === 'arena'); return { x: d.x + 0.5, y: d.y + 2.3 }; }
  /** The door you are standing in, if any (a little forgiving: the server sees you a moment late). */
  doorNear(x, y, kind, range = 2.2) {
    return this.doors.find(d => d.kind === kind && Math.hypot(d.x + 0.5 - x, d.y + 0.5 - y) <= range) || null;
  }
}
