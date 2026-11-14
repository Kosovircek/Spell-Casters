// The ground of a biome: after a floor's rooms and corridors are dug (Dungeon.generate), decorate() floods the crypt,
// pours lava through the forge, freezes the halls, plants vines, bars the library with riddle doors, builds the
// clockwork and opens the void. It also puts a shrine or a challenge altar on some floors, whatever the biome.
//
// Everything that blocks the way for good (deep water, lava, the void, pillars) is placed one tile at a time and
// taken back if it would cut any floor off from the start: a floor is always walkable from end to end. Things you
// can open or break (ice walls, vines, riddle doors, pistons) are left out of that check.
//
// What the biome needs later (where the vents, braziers, wells and machines are) goes into dungeon.env, which is
// saved with the floor. Its shape:
//   vents   [[i, j, phase]]            forge vents (phase in seconds)
//   braziers [[x, y]]                  catacomb braziers
//   vines   [tile index]               where vines grow (they grow back there)
//   doors   [{ tiles: [[i,j]..], x, y, riddle }]   library riddle doors
//   pistons [{ tiles: [idx..], phase }]            clockwork pistons across corridors
//   rotors  [{ i, j, phase }]                      clockwork rotor bars (hub tile, arms of 2)
//   blades  [[i, j, phase]]                        clockwork blade plates
//   wells   [[x, y]]                   void gravity wells
//   portals [{ a: {x, y}, b: {x, y} }] void portals linking rooms
//   shrine  { x, y, kind }             a shrine ('blood' or 'swap') on any floor, sometimes
//   altar   { x, y, kind }             a challenge altar ('timed' or 'nohit') on any floor, sometimes
import { TILE, WALKABLE } from '../Dungeon.js';
import { rint, pick } from '../util.js';
import { RIDDLES } from './riddles.js';

const SOFT = new Set([TILE.ICEWALL, TILE.VINE, TILE.RUNEDOOR]); // in the way, but they open
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Builder {
  constructor(dg) {
    this.dg = dg; this.w = dg.w; this.h = dg.h;
    this.start = dg.rooms[0];
    this.end = dg.rooms[dg.rooms.length - 1];
    this.middle = dg.rooms.slice(1, -1);
    // keep the stairs and the spots beside them clear
    this.keep = new Set();
    for (const st of [dg.stairs, dg.up]) {
      if (!st) continue;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) this.keep.add((st.y + dj) * this.w + st.x + di);
    }
  }
  idx(i, j) { return j * this.w + i; }
  t(i, j) { return this.dg.tile(i, j); }
  roomAt(i, j) { return this.dg.rooms.find(r => i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.h) || null; }
  isFloor(i, j) { return this.t(i, j) === TILE.FLOOR; }
  /** Floor tiles in corridors (outside every room). */
  corridorTiles() {
    const out = [];
    for (let j = 1; j < this.h - 1; j++) for (let i = 1; i < this.w - 1; i++) if (this.isFloor(i, j) && !this.roomAt(i, j)) out.push([i, j]);
    return out;
  }
  free(i, j) { return this.isFloor(i, j) && !this.keep.has(this.idx(i, j)); }

  /** Is every walkable tile still reachable from the start (through things that open)? */
  connected() {
    const dg = this.dg, w = this.w, seen = new Uint8Array(w * this.h);
    const s = this.idx(Math.floor(this.start.cx), Math.floor(this.start.cy));
    const pass = (n) => WALKABLE.has(dg.tiles[n]) || SOFT.has(dg.tiles[n]);
    if (!pass(s)) return false;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], ci = c % w, cj = (c / w) | 0;
      for (const [a, b] of N4) {
        const n = (cj + b) * w + ci + a;
        if (!seen[n] && pass(n)) { seen[n] = 1; q.push(n); }
      }
    }
    for (let n = 0; n < dg.tiles.length; n++) if (pass(n) && !seen[n]) return false;
    return true;
  }
  /** Put tile t on these spots, unless that cuts the floor in two (then nothing changes). */
  block(spots, t) {
    const old = spots.map(([i, j]) => this.t(i, j));
    spots.forEach(([i, j]) => this.dg.setTile(i, j, t));
    if (this.connected()) return true;
    spots.forEach(([i, j], k) => this.dg.setTile(i, j, old[k]));
    return false;
  }
  /** Tiles of a blob (ellipse) in a room, by how far from its middle they are (0 middle, 1 edge). */
  blob(r, scale = 0.38, margin = 1) {
    const cx = r.x + r.w / 2 + (Math.random() - 0.5) * r.w * 0.2, cy = r.y + r.h / 2 + (Math.random() - 0.5) * r.h * 0.2;
    const rx = Math.max(1.2, r.w * scale), ry = Math.max(1.2, r.h * scale), out = [];
    for (let j = r.y + margin; j < r.y + r.h - margin; j++) for (let i = r.x + margin; i < r.x + r.w - margin; i++) {
      const d = Math.hypot((i + 0.5 - cx) / rx, (j + 0.5 - cy) / ry) + (Math.random() - 0.5) * 0.25;
      if (d < 1) out.push({ i, j, d });
    }
    return out;
  }
  /** Flood corridor tiles near a few seeds with tile t (walkable ground only: no check needed). */
  floodCorridors(t, seeds, reach) {
    const cor = this.corridorTiles();
    for (let k = 0; k < seeds && cor.length; k++) {
      const [si, sj] = pick(cor);
      for (const [i, j] of cor) if (Math.abs(i - si) + Math.abs(j - sj) <= reach && this.free(i, j)) this.dg.setTile(i, j, t);
    }
  }
  /**
   * Places across a 2-wide corridor where something can bar the way: two floor tiles side by side with a wall at
   * each end and open corridor on both other sides. Spread out, away from rooms and stairs.
   */
  crossings(max, gap = 7) {
    const found = [];
    for (const [i, j] of shuffle(this.corridorTiles())) {
      let pair = null;
      const f = (a, b) => this.isFloor(a, b) && !this.roomAt(a, b), wall = (a, b) => this.t(a, b) === TILE.WALL;
      if (f(i + 1, j) && wall(i - 1, j) && wall(i + 2, j) && f(i, j - 1) && f(i + 1, j - 1) && f(i, j + 1) && f(i + 1, j + 1)) pair = [[i, j], [i + 1, j]];
      else if (f(i, j + 1) && wall(i, j - 1) && wall(i, j + 2) && f(i - 1, j) && f(i - 1, j + 1) && f(i + 1, j) && f(i + 1, j + 1)) pair = [[i, j], [i, j + 1]];
      if (!pair || pair.some(([a, b]) => this.keep.has(this.idx(a, b)))) continue;
      if (found.some(p => Math.hypot(p[0][0] - i, p[0][1] - j) < gap)) continue;
      found.push(pair);
      if (found.length >= max) break;
    }
    return found;
  }
  /** A free floor tile in a room, at least `inset` tiles from its edge. */
  spotIn(r, inset = 1) {
    for (let k = 0; k < 30; k++) {
      const i = rint(r.x + inset, r.x + r.w - 1 - inset), j = rint(r.y + inset, r.y + r.h - 1 - inset);
      if (this.free(i, j) && !(i === Math.floor(r.cx) && j === Math.floor(r.cy))) return [i, j];
    }
    return null;
  }
}

// ------------------------------------------------------------------ one function per biome

const DECOR = {
  crypt(b, env) {
    for (const r of b.middle) {
      if (Math.random() > 0.7) continue;
      for (const { i, j, d } of b.blob(r, 0.4)) {
        if (!b.free(i, j)) continue;
        if (d < 0.55) b.block([[i, j]], TILE.DEEP); else b.dg.setTile(i, j, TILE.SHALLOW);
      }
    }
    for (const { i, j } of b.blob(b.end, 0.45)) if (b.free(i, j)) b.dg.setTile(i, j, TILE.SHALLOW); // the Abbot's pool
    b.floodCorridors(TILE.SHALLOW, 5, 4);
  },

  forge(b, env) {
    // one or two lava rivers wandering across the map; where they would cut the floor in two, a bridge stays
    for (let n = rint(1, 2); n > 0; n--) {
      const across = Math.random() < 0.5;
      let x = across ? 1 : rint(8, b.w - 9), y = across ? rint(8, b.h - 9) : 1;
      for (let step = 0; step < 90 && x > 0 && y > 0 && x < b.w - 1 && y < b.h - 1; step++) {
        for (const [i, j] of [[x, y], across ? [x, y + 1] : [x + 1, y]]) if (b.free(i, j) && b.roomAt(i, j) !== b.start) b.block([[i, j]], TILE.LAVA);
        if (across) { x++; if (Math.random() < 0.35) y += Math.random() < 0.5 ? 1 : -1; } else { y++; if (Math.random() < 0.35) x += Math.random() < 0.5 ? 1 : -1; }
      }
    }
    for (const r of b.middle) {
      if (Math.random() > 0.4) continue;
      for (const { i, j, d } of b.blob(r, 0.25)) if (d < 0.8 && b.free(i, j)) b.block([[i, j]], TILE.LAVA);
    }
    env.vents = [];
    for (const r of [...b.middle, b.end]) {
      for (let k = rint(1, 2); k > 0; k--) {
        const at = b.spotIn(r, 1);
        if (!at) continue;
        b.dg.setTile(at[0], at[1], TILE.VENT);
        env.vents.push([at[0], at[1], Math.round(Math.random() * 40) / 10]);
      }
    }
  },

  frozen(b, env) {
    for (const r of [...b.middle, b.end]) {
      if (r !== b.end && Math.random() > 0.75) continue;
      for (const { i, j } of b.blob(r, r === b.end ? 0.5 : 0.4)) if (b.free(i, j)) b.dg.setTile(i, j, TILE.ICE);
    }
    b.floodCorridors(TILE.ICE, 4, 5);
    for (const pair of b.crossings(rint(2, 3))) for (const [i, j] of pair) b.dg.setTile(i, j, TILE.ICEWALL);
  },

  catacombs(b, env) {
    env.braziers = [];
    for (const r of b.dg.rooms) {
      if (r === b.end) { // four braziers round the boss
        for (const [i, j] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) if (b.free(i, j)) env.braziers.push([i + 0.5, j + 0.5]);
        continue;
      }
      const at = b.spotIn(r, 1);
      if (at) env.braziers.push([at[0] + 0.5, at[1] + 0.5]);
    }
  },

  ruins(b, env) {
    const vines = [];
    for (const pair of b.crossings(rint(3, 5), 6)) for (const [i, j] of pair) { b.dg.setTile(i, j, TILE.VINE); vines.push(b.idx(i, j)); }
    for (const r of b.middle) {
      if (Math.random() > 0.5) continue;
      for (const { i, j, d } of b.blob(r, 0.3)) if (d < 0.85 && b.free(i, j)) { b.dg.setTile(i, j, TILE.VINE); vines.push(b.idx(i, j)); }
    }
    env.vines = vines;
  },

  library(b, env) {
    env.doors = [];
    const used = new Set();
    for (const pair of b.crossings(rint(1, 2), 10)) {
      let riddle; do riddle = rint(0, RIDDLES.length - 1); while (used.has(riddle) && used.size < RIDDLES.length);
      used.add(riddle);
      for (const [i, j] of pair) b.dg.setTile(i, j, TILE.RUNEDOOR);
      const x = (pair[0][0] + pair[1][0]) / 2 + 0.5, y = (pair[0][1] + pair[1][1]) / 2 + 0.5;
      env.doors.push({ tiles: pair, x, y, riddle });
    }
    for (const r of b.middle) { // rows of bookshelves
      if (r.w < 7 || r.h < 6 || Math.random() > 0.7) continue;
      for (const row of [r.y + 2, r.y + r.h - 3]) {
        const spots = [];
        for (let i = r.x + 2; i <= r.x + r.w - 3; i++) if (i !== Math.floor(r.cx) && b.free(i, row)) spots.push([i, row]);
        if (spots.length >= 2) b.block(spots, TILE.WALL);
      }
    }
  },

  clockwork(b, env) {
    env.pistons = [];
    for (const pair of b.crossings(rint(2, 3), 8)) {
      for (const [i, j] of pair) b.dg.setTile(i, j, TILE.SLOT);
      env.pistons.push({ tiles: pair.map(([i, j]) => b.idx(i, j)), phase: Math.round(Math.random() * 50) / 10 });
    }
    env.rotors = [];
    for (const r of shuffle(b.middle.slice())) {
      if (env.rotors.length >= 2 || r.w < 7 || r.h < 7) continue;
      const i = Math.floor(r.cx), j = Math.floor(r.cy);
      const arms = [];
      for (let d = -2; d <= 2; d++) for (const [a, c] of [[d, 0], [0, d], [d, d], [d, -d]]) if (d) arms.push([i + a, j + c]);
      if (!arms.every(([a, c]) => b.free(a, c))) continue;
      if (!b.block([[i, j]], TILE.WALL)) continue; // the hub is a solid post
      for (const [a, c] of arms) b.dg.setTile(a, c, TILE.SLOT);
      env.rotors.push({ i, j, phase: rint(0, 3) });
    }
    env.blades = [];
    const spots = [...b.corridorTiles(), ...b.middle.flatMap(r => { const s = []; for (let k = 0; k < 3; k++) { const at = b.spotIn(r, 1); if (at) s.push(at); } return s; })];
    for (const [i, j] of shuffle(spots).slice(0, rint(8, 12))) {
      if (!b.free(i, j)) continue;
      b.dg.setTile(i, j, TILE.BLADES);
      env.blades.push([i, j, Math.round(Math.random() * 30) / 10]);
    }
  },

  mirror(b, env) {
    for (const r of b.middle) for (let k = rint(2, 4); k > 0; k--) { // glass pillars: more walls to bounce off
      const at = b.spotIn(r, 2);
      if (at) b.block([at], TILE.WALL);
    }
  },

  storm(b, env) {
    for (const r of b.middle) { // holes in the floor where the spire is broken: open sky
      if (Math.random() > 0.45) continue;
      for (const { i, j, d } of b.blob(r, 0.22)) if (d < 0.8 && b.free(i, j)) b.block([[i, j]], TILE.CHASM);
    }
  },

  void(b, env) {
    // the corridors are bridges over the void
    const cor = b.corridorTiles();
    for (const [i, j] of cor) if (!b.keep.has(b.idx(i, j))) b.dg.setTile(i, j, TILE.BRIDGE);
    for (const [i, j] of cor) for (const [a, c] of N8) {
      const x = i + a, y = j + c;
      if (b.t(x, y) !== TILE.WALL || x <= 0 || y <= 0 || x >= b.w - 1 || y >= b.h - 1) continue;
      if (N8.some(([p, q]) => { const n = b.t(x + p, y + q); return n !== TILE.WALL && n !== TILE.BRIDGE && n !== TILE.CHASM; })) continue; // a room's wall stays
      b.dg.setTile(x, y, TILE.CHASM);
    }
    for (const r of b.middle) {
      if (Math.random() > 0.5) continue;
      for (const { i, j, d } of b.blob(r, 0.25)) if (d < 0.8 && b.free(i, j)) b.block([[i, j]], TILE.CHASM);
    }
    env.wells = [];
    for (const r of shuffle(b.middle.slice()).slice(0, rint(1, 2))) {
      const i = Math.floor(r.cx), j = Math.floor(r.cy);
      if (b.free(i, j)) env.wells.push([i + 0.5, j + 0.5]);
    }
    env.portals = [];
    const rooms = shuffle(b.dg.rooms.slice(0, -1));
    for (let k = 0; k + 1 < rooms.length && env.portals.length < 2; k += 2) {
      const a = b.spotIn(rooms[k], 1), c = b.spotIn(rooms[k + 1], 1);
      if (a && c && Math.hypot(a[0] - c[0], a[1] - c[1]) > 12) env.portals.push({ a: { x: a[0] + 0.5, y: a[1] + 0.5 }, b: { x: c[0] + 0.5, y: c[1] + 0.5 } });
    }
  },
};

/** Decorate a freshly dug floor for its biome. */
export function decorate(dg, biome) {
  if (!biome || !dg.rooms.length) return;
  const b = new Builder(dg), env = {};
  DECOR[biome.id]?.(b, env);
  // on any floor, sometimes: a shrine, a challenge altar
  const extras = shuffle(b.middle.slice());
  if (extras.length && Math.random() < 0.4) {
    const at = b.spotIn(extras[0], 1);
    if (at) env.shrine = { x: at[0] + 0.5, y: at[1] + 0.5, kind: Math.random() < 0.5 ? 'blood' : 'swap' };
  }
  if (extras.length > 1 && Math.random() < 0.35) {
    const r = extras[1], i = Math.floor(r.cx), j = Math.floor(r.cy);
    if (b.free(i, j)) env.altar = { x: i + 0.5, y: j + 0.5, kind: Math.random() < 0.5 ? 'timed' : 'nohit', room: { x: r.x, y: r.y, w: r.w, h: r.h } };
  }
  dg.env = env;
}
