// The surface: a small village above the dungeon with your house, a shop, the duel arena, the zoo, the practice
// yard, the wishing fountain and the stairs down to floor 1.
// It is always the same, so it is built here instead of being saved (only the items dropped in it are kept).
import { Dungeon, TILE } from './Dungeon.js';

const W = 60, H = 36;

/** Deterministic 0..1 noise, so every visit (and every server) grows the same trees. */
const noise = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };

/**
 * The zoo's six pens: three above the aisle, three below. The first three animals always live here; the
 * dungeon creatures move in once the party has defeated one of their kind (see Room.bestiary).
 */
const PENS = [
  { kind: 'dashhound', name: 'Dashhound', ground: TILE.GRASS },
  { kind: 'owl', name: 'Dotted Owl', ground: TILE.GRASS },
  { kind: 'hopper', name: 'Hopper', ground: TILE.GRASS },
  { kind: 'slime', name: 'Slime', ground: TILE.FLOOR, unlock: 'slime' },
  { kind: 'mage', name: 'Skeleton Mage', ground: TILE.FLOOR, unlock: 'mage' },
  { kind: 'boss', name: 'Bellwraith', ground: TILE.FLOOR, unlock: 'boss' },
];

export class Town extends Dungeon {
  constructor() { super(null, { w: W, h: H }); this.bestiary = {}; }

  generate() {
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t; };
    const rect = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t); };
    /** A fence around the edge of a rectangle (its inside is left alone). */
    const fence = (x, y, w, h) => { rect(x, y, w, 1, TILE.FENCE); rect(x, y + h - 1, w, 1, TILE.FENCE); rect(x, y, 1, h, TILE.FENCE); rect(x + w - 1, y, 1, h, TILE.FENCE); };

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

    // ---- the zoo, east of the shop: a fenced park with six pens on either side of a path
    this.zoo = { x: 42, y: 3, w: 16, h: 19 };
    const zoo = this.zoo, aisleY = zoo.y + 9;   // the path through the zoo: rows 12 and 13
    rect(zoo.x, zoo.y, zoo.w, zoo.h, TILE.GRASS);
    fence(zoo.x, zoo.y, zoo.w, zoo.h);
    rect(zoo.x + 1, aisleY, zoo.w - 2, 2, TILE.PATH);
    rect(shopDoor.x + 1, 13, zoo.x - shopDoor.x, 2, TILE.PATH); // the village path carries on east to the zoo gate
    set(zoo.x, aisleY, TILE.PATH); set(zoo.x, aisleY + 1, TILE.PATH); // the gate: a gap in the fence
    this.pens = PENS.map((p, n) => {
      const col = n % 3, top = n < 3;
      // each pen is 4 x 6 tiles inside, with a fence between neighbours and along the path
      const x = zoo.x + 1 + col * 5, y = top ? zoo.y + 1 : aisleY + 3, w = 4, h = top ? 7 : 6;
      rect(x, y, w, h, p.ground);
      if (col < 2) rect(x + w, y, 1, h, TILE.FENCE);
      rect(x, top ? aisleY - 1 : aisleY + 2, col < 2 ? w + 1 : w, 1, TILE.FENCE); // along the path, up to the next pen's fence
      return { ...p, area: { x, y, w, h }, sign: { x: x + w / 2, y: top ? aisleY - 1.15 : aisleY + 1.85 } };
    });

    // ---- the practice yard, south of the house: straw dummies to practise your Morse on
    this.yard = { x: 3, y: 24, w: 15, h: 10 };
    const yard = this.yard;
    rect(yard.x, yard.y, yard.w, yard.h, TILE.PATH);
    fence(yard.x, yard.y, yard.w, yard.h);
    rect(homeDoor.x, 15, 2, yard.y - 15, TILE.PATH);       // a path down from the village path...
    set(homeDoor.x, yard.y, TILE.PATH); set(homeDoor.x + 1, yard.y, TILE.PATH); // ...through a gap in the fence
    this.dummies = [0, 1, 2, 3].map(k => ({ tier: k + 1, x: yard.x + 2.5 + k * 3.3, y: yard.y + yard.h - 2.5 }));

    // ---- the wishing fountain, on a little stone plaza south of the square
    const plaza = { x: 18, y: 23, w: 13, h: 7 };
    rect(19, square.y + square.h, 2, plaza.y - square.y - square.h, TILE.PATH);
    rect(plaza.x, plaza.y, plaza.w, plaza.h, TILE.FLOOR);
    rect(23, 25, 3, 3, TILE.FOUNTAIN);
    this.fountain = { x: 24.5, y: 26.5 };

    // ---- lamp posts along the paths, so the surface is lit at dusk
    this.lamps = [[15, 15], [24, 15], [40, 11], [40, 15], [8, 22], [11, 22], [18, 23], [30, 23], [18, 29], [30, 29], [27, 12]];
    for (const [x, y] of this.lamps) set(x, y, TILE.LAMP);

    // A few trees dotted about the grass, never on a path or next to a building.
    const keepClear = [this.home, this.shop, this.arena, square, zoo, yard, plaza];
    for (let j = 3; j < H - 3; j++) for (let i = 3; i < W - 3; i++) {
      if (this.tiles[j * this.w + i] !== TILE.GRASS || noise(i, j) < 0.93) continue;
      const nearBuilt = keepClear.some(b => i >= b.x - 2 && i < b.x + b.w + 2 && j >= b.y - 2 && j < b.y + b.h + 2);
      const nearPath = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => [TILE.PATH, TILE.LAMP].includes(this.tiles[(j + b) * this.w + i + a]));
      if (!nearBuilt && !nearPath) set(i, j, TILE.TREE);
    }

    // "Rooms" are where Teleportation may send you, and the start is where recall lands: the village square.
    const start = { x: 8, y: 12, w: 24, h: 3, cx: 20, cy: 13.5 };
    this.rooms = [start];
    this.start = start;
  }

  /** Signs over the zoo's pens (with how many of each the party has defeated), the zoo gate and the yard. */
  get signs() {
    const zoo = this.zoo, yard = this.yard;
    return [
      { x: zoo.x + 0.5, y: zoo.y + 7.9, text: 'Zoo', color: '#ffd54f' },
      { x: yard.x + yard.w / 2, y: yard.y - 0.3, text: 'Practice Yard', color: '#ffd54f' },
      { x: this.fountain.x, y: this.fountain.y + 2.3, text: 'Wishing Fountain', color: '#80deea' },
      ...this.pens.map(p => {
        const n = p.unlock ? this.bestiary[p.unlock] | 0 : null;
        return { x: p.sign.x, y: p.sign.y, text: n === 0 ? '? ? ?' : p.name + (n ? ` (${n})` : ''), color: n === 0 ? '#9a8fb0' : '#fff59d' };
      }),
    ];
  }

  toMessage(floor, pool) { return { ...super.toMessage(floor, pool), town: true, doors: this.doors, signs: this.signs, lamps: this.lamps }; }
  /** Where you come back out of the arena: on the path, a few steps in front of its gate (far enough not to walk straight back in). */
  get arenaExit() { const d = this.doors.find(d => d.kind === 'arena'); return { x: d.x + 0.5, y: d.y + 2.3 }; }
  /** The door you are standing in, if any (a little forgiving: the server sees you a moment late). */
  doorNear(x, y, kind, range = 2.2) {
    return this.doors.find(d => d.kind === kind && Math.hypot(d.x + 0.5 - x, d.y + 0.5 - y) <= range) || null;
  }
}
