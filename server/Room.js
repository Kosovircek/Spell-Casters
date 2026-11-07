// One co-op game: a party of up to 4 casters sharing a dungeon.
//
// Floors are persistent, like in Angband: the surface town is floor 0, and every floor below keeps its
// layout, its chests (opened or not) and whatever lies on the ground. Only the enemies come back: a floor
// gets new ones, as tough as its depth, whenever someone arrives on it while nobody else is there. Once a
// floor has been cleared (its boss too) its stairs down stay open and its boss stays gone.
//
// Each caster explores on their own: stairs and scrolls only move the caster who takes them. Every floor
// with someone on it runs as its own Level (see Level.js); casters on the same floor play it together.
import { TICK_MS, PLAYER } from './config.js';
import { Player } from './entities.js';
import { Level } from './Level.js';
import { Shop } from './Shop.js';

const SHOP_COMMANDS = ['enter', 'buy', 'sell', 'stash', 'take'];
const PEN_NAMES = { slime: 'a Slime', mage: 'a Skeleton Mage', boss: 'the Bellwraith' };

const AUTOSAVE_MS = 30000;

export class Room {
  /** store is a SaveStore: if it has a save for this code, the lobby carries on from it. */
  constructor(code, onEmpty, store) {
    this.code = code;
    this.onEmpty = onEmpty;   // called when the last player leaves
    this.store = store;
    this.players = new Map(); // id -> Player, on any floor
    this.savedPlayers = {};   // lowercase name -> saved progress of players who are not here right now
    this.live = new Map();    // floor number -> Level, for every floor someone is standing on
    this.levels = {};         // floor number -> saved layout, chests, items and cleared flag of floors nobody is on
    this.maxDepth = 0;        // deepest floor anyone has reached (a Scroll of Recall read on the surface goes there)
    this.foundMythics = new Set(); // mythic items drop at most once per game (like Angband artifacts)
    this.bestiary = {};       // enemy type -> how many the party has defeated; each kind met moves into the zoo
    this.zooNew = [];         // zoo pens that opened while nobody was on the surface
    this.zooFed = 0;          // treats the zoo animals have had
    this.shop = new Shop(this);
    const saved = store && store.load(code);
    if (saved) this.restore(saved);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.autosave = setInterval(() => this.save(), AUTOSAVE_MS);
  }

  // ------------------------------------------------------------------ saving
  /** Everything needed to carry on later. Flying spells and timed potions are not kept. */
  toSave() {
    const players = { ...this.savedPlayers };
    for (const pl of this.players.values()) players[pl.name.toLowerCase()] = pl.toSave();
    const levels = { ...this.levels };
    for (const [floor, lv] of this.live) levels[floor] = lv.levelSave(true); // fights on busy floors carry on where they were
    return {
      version: 4, room: this.code, savedAt: Date.now(), maxDepth: this.maxDepth,
      foundMythics: [...this.foundMythics], bestiary: this.bestiary, zooFed: this.zooFed, zooNew: this.zooNew,
      levels, shop: this.shop.toSave(), players,
    };
  }
  save() {
    if (!this.store) return false;
    try { this.store.save(this.code, this.toSave()); return true; }
    catch (err) { console.error(`Could not save room ${this.code}:`, err.message); return false; }
  }
  restore(s) {
    this.maxDepth = Math.max(0, s.maxDepth | 0, s.floor | 0);
    this.foundMythics = new Set(s.foundMythics || []);
    this.bestiary = s.bestiary && typeof s.bestiary === 'object' ? s.bestiary : {};
    this.zooFed = s.zooFed | 0;
    this.zooNew = Array.isArray(s.zooNew) ? s.zooNew : [];
    this.levels = s.levels || {};
    this.shop.restore(s.shop);
    this.savedPlayers = s.players || {};
    if ((s.version | 0) < 4) { // older saves had one floor for the whole party, and its enemies apart
      const floor = Math.max(0, s.floor | 0);
      // Saves from before persistent floors (version 2) only had the current floor.
      if (!s.levels) this.levels[floor] = { dungeon: s.dungeon, chests: s.chests, items: s.items, cleared: !!s.stairsOpen };
      if (floor > 0 && this.levels[floor]) this.levels[floor].enemies = s.enemies || [];
      for (const p of Object.values(this.savedPlayers)) if (!Number.isFinite(p.floor)) p.floor = floor;
    }
  }

  // ------------------------------------------------------------------ helpers
  /** A message on every floor's banner (someone joined, left...). */
  say(text, secs = 3) { for (const lv of this.live.values()) lv.say(text, secs); }
  levelOf(pl) { return this.live.get(pl.floor); }
  /** Where the teammates who are not on this floor are, for the party panel. */
  elsewhere(floor) {
    return [...this.players.values()].filter(p => p.floor !== floor)
      .map(p => ({ id: p.id, name: p.name, color: p.color, lv: p.level, floor: p.floor, dead: p.dead }));
  }
  /** The bestiary counts every kill; a kind the zoo has a pen for moves in. */
  countKill(type) {
    const first = !this.bestiary[type];
    this.bestiary[type] = (this.bestiary[type] | 0) + 1;
    if (!first || !PEN_NAMES[type]) return;
    const town = this.live.get(0);
    if (town) { town.openPen(type); town.say(`New in the zoo: ${PEN_NAMES[type]}!`, 4); }
    else this.zooNew.push(PEN_NAMES[type]);
  }

  // ------------------------------------------------------------------ floors
  /** The running Level for this floor, built from its saved part (or freshly generated) if nobody is on it yet. */
  levelFor(floor) {
    let lv = this.live.get(floor);
    if (lv) return lv;
    lv = new Level(this, floor, this.levels[floor]);
    if (this.levels[floor]) delete this.levels[floor].enemies; // saved enemies only come back once, when a lobby is loaded
    this.live.set(floor, lv);
    this.maxDepth = Math.max(this.maxDepth, floor);
    return lv;
  }
  /** Nobody is on this floor any more: keep its persistent part and stop running it. */
  putAway(lv) {
    if (lv.players.size || this.live.get(lv.floor) !== lv) return;
    this.levels[lv.floor] = lv.levelSave();
    this.live.delete(lv.floor);
  }

  /**
   * Move one caster to floor `depth`. how = 'down' or 'up' (stairs: you arrive beside the stairs leading back)
   * or 'travel' (recall or a descent scroll). Teammates stay where they are.
   */
  movePlayer(pl, depth, how) {
    const from = this.levelOf(pl);
    if (from && from.floor === depth) return;
    if (from) { from.leave(pl); this.putAway(from); }
    const fresh = !this.live.has(depth);
    const lv = this.levelFor(depth);
    lv.enter(pl, lv.arrival(how));
    if (fresh) lv.say(lv.town ? 'The surface' : `Floor ${depth}` + (lv.cleared ? ' (cleared before: new enemies roam it)' : ''), 3);
    else lv.say(`${pl.name} arrived`, 2);
    if (lv.town && this.zooNew.length) {
      lv.say(`New in the zoo: ${this.zooNew.join(', ')}!`, 4);
      this.zooNew = [];
    }
    this.save();
  }

  // ------------------------------------------------------------------ players
  /**
   * A caster joins. A returning caster comes back on the floor they left from; a new one starts next to a
   * teammate (or on the surface). opts.fromArena: coming back out of the duel arena, in front of its gate.
   */
  addPlayer(ws, name, opts = {}) {
    const used = new Set([...this.players.values()].map(p => p.color));
    const pl = new Player(ws, name, PLAYER.colors.find(c => !used.has(c)) || PLAYER.colors[0]);
    const saved = this.savedPlayers[pl.name.toLowerCase()];
    const buddy = [...this.players.values()].find(p => !p.dead);
    const floor = opts.fromArena ? 0 : saved && Number.isFinite(saved.floor) ? Math.max(0, saved.floor | 0) : buddy ? buddy.floor : 0;
    const lv = this.levelFor(floor);
    pl.send({ t: 'welcome', id: pl.id, room: this.code });
    lv.enter(pl, !saved && buddy && buddy.floor === floor ? { x: buddy.x, y: buddy.y } : null);
    if (saved) { // a returning player gets their level, gear, HP and position back
      pl.restore(saved);
      if (!Number.isFinite(saved.x) || lv.dungeon.blocked(pl.x, pl.y, pl.radius)) { pl.placeAt(lv); pl.restore({ ...saved, x: pl.x, y: pl.y }); }
      delete this.savedPlayers[pl.name.toLowerCase()];
    }
    if (opts.fromArena) { pl.x = lv.dungeon.arenaExit.x; pl.y = lv.dungeon.arenaExit.y; }
    pl.onStairs = lv.dungeon.stairsAt(pl.x, pl.y);
    this.players.set(pl.id, pl);
    if (opts.fromArena) { lv.say(`${pl.name} is back from the arena`, 2); return pl; }
    this.say(saved ? `${pl.name} is back` + (lv.town ? '' : ` (on floor ${floor})`) : `${pl.name} joined`, 2);
    if (saved) pl.tell('Welcome back! Your gear was saved.');
    return pl;
  }
  removePlayer(pl) {
    this.players.delete(pl.id);
    const lv = this.levelOf(pl);
    if (lv) { lv.leave(pl); this.putAway(lv); }
    this.savedPlayers[pl.name.toLowerCase()] = pl.toSave();
    this.save();
    if (this.players.size === 0) { this.stop(); this.onEmpty(this); }
  }
  stop() { clearInterval(this.timer); clearInterval(this.autosave); }
  /** Ctrl+S from a player. */
  saveNow(pl) {
    const ok = this.save();
    for (const p of this.players.values()) p.tell(ok ? `${pl.name} saved the game.` : 'The game could not be saved.');
  }
  command(pl, m) {
    if (SHOP_COMMANDS.includes(m.c)) this.shop.run(pl, m);
    else this.levelOf(pl)?.itemCommands.run(pl, m);
  }
  cast(pl, word, dx, dy) { this.levelOf(pl)?.cast(pl, word, dx, dy); }

  // ------------------------------------------------------------------ simulation
  tick() {
    const now = Date.now();
    for (const lv of [...this.live.values()]) if (this.live.get(lv.floor) === lv) lv.tick(now);
  }
}
