// Everything the client knows about the current floor: the tile map and the entities on it.
import { Player, Enemy, Boss, Chest, Spell, FloorItem } from './entities.js';

// Tile codes from the server (see server/Dungeon.js): 0 wall, 1 floor, 2 grass, 3 path, 4 tree, 5 house, 6 shop,
// 7 house door, 8 shop door, 9 duel arena, 10 (sent as 'a') arena gate. Doors can be walked into.
export const WALKABLE = new Set([1, 2, 3, 7, 8, 10]);

// Other casters, enemies and spells are drawn this far in the past (two server ticks), so there is nearly always
// a newer snapshot to slide toward even when Wi-Fi delivers them unevenly.
const INTERP_MS = 100;

export class World {
  constructor() {
    this.map = null;        // { w, h, tiles: Uint8Array, stairs, up, pool, floor, town, doors }
    this.state = null;      // latest raw state message (floor, party stats, banner...)
    this.entities = new Map();
    this.clock = null;      // performance.now() minus server time, for the fastest snapshot seen lately
  }

  setMap(msg) {
    this.map = { ...msg, tiles: Uint8Array.from(msg.tiles, c => parseInt(c, 36)) }; // one base-36 character per tile
    this.entities.clear();
    this.clock = null;
  }
  tileAt(i, j) { const m = this.map; return i < 0 || j < 0 || i >= m.w || j >= m.h ? 0 : m.tiles[j * m.w + i]; }
  walkable(i, j) { return WALKABLE.has(this.tileAt(i, j)); }
  /** The shop, house or arena door at this tile, if any. */
  doorAt(i, j) { return (this.map?.doors || []).find(d => d.x === i && d.y === j) || null; }
  get ready() { return !!(this.map && this.state); }

  /** Apply a state snapshot: create new entities, update known ones, drop the ones that are gone. */
  applyState(state) {
    this.state = state;
    const ts = state.ts;
    if (ts !== undefined) {
      // keep the offset of the quickest arrivals: drop at once to a faster one, drift up slowly otherwise
      const off = performance.now() - ts;
      this.clock = this.clock === null || off < this.clock ? off : this.clock + (off - this.clock) * 0.01;
    }
    const seen = new Set();
    const sync = (list, make) => {
      for (const data of list || []) {
        seen.add(data.id);
        let e = this.entities.get(data.id);
        if (!e) this.entities.set(data.id, e = make(data));
        e.sync(data, ts);
      }
    };
    sync(state.players, d => new Player(d));
    sync(state.enemies, d => Enemy.create(d));
    sync(state.chests, d => new Chest(d));
    sync(state.items, d => new FloorItem(d));
    sync(state.projs, d => new Spell(d));
    for (const id of this.entities.keys()) if (!seen.has(id)) this.entities.delete(id);
  }

  update(dt) {
    const nowT = this.clock === null ? undefined : performance.now() - this.clock; // the server's present, roughly
    const renderT = nowT === undefined ? undefined : nowT - INTERP_MS;
    for (const e of this.entities.values()) e.update(dt, renderT, nowT);
  }
  get players() { return [...this.entities.values()].filter(e => e instanceof Player); }
  get boss() { for (const e of this.entities.values()) if (e instanceof Boss) return e; return null; }
  player(id) { const e = this.entities.get(id); return e instanceof Player ? e : null; }
}
