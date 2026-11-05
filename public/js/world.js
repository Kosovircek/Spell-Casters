// Everything the client knows about the current floor: the tile map and the entities on it.
import { Player, Enemy, Boss, Chest, Spell, FloorItem } from './entities.js';

// Other casters, enemies and spells are drawn this far in the past (two server ticks), so there is nearly always
// a newer snapshot to slide toward even when Wi-Fi delivers them unevenly.
const INTERP_MS = 100;

export class World {
  constructor() {
    this.map = null;        // { w, h, tiles: Uint8Array, stairs, pool, floor }
    this.state = null;      // latest raw state message (floor, party stats, banner...)
    this.entities = new Map();
    this.clock = null;      // performance.now() minus server time, for the fastest snapshot seen lately
  }

  setMap(msg) {
    this.map = { ...msg, tiles: Uint8Array.from(msg.tiles, c => +c) };
    this.entities.clear();
    this.clock = null;
  }
  tileAt(i, j) { const m = this.map; return i < 0 || j < 0 || i >= m.w || j >= m.h ? 0 : m.tiles[j * m.w + i]; }
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
    const renderT = this.clock === null ? undefined : performance.now() - this.clock - INTERP_MS;
    for (const e of this.entities.values()) e.update(dt, renderT);
  }
  get players() { return [...this.entities.values()].filter(e => e instanceof Player); }
  get boss() { for (const e of this.entities.values()) if (e instanceof Boss) return e; return null; }
  player(id) { const e = this.entities.get(id); return e instanceof Player ? e : null; }
}
