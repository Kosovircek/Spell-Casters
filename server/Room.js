// One co-op game: a party of up to 4 players sharing a dungeon. Runs the simulation each tick.
//
// Floors are persistent, like in Angband: the surface town is floor 0, and every floor below keeps its
// layout, its chests (opened or not) and whatever lies on the ground when the party leaves. Only the enemies
// come back: a floor gets new ones, as tough as its depth, every time the party arrives. Once a floor has
// been cleared (its Bellwraith too) its stairs down stay open and its Bellwraith stays gone.
// The whole party is always on the same floor: stairs, recall and descent scrolls take everyone.
import { TICK_MS, PLAYER, SPELL, EFFECTS, HITBOX, DEPTH } from './config.js';
import { rnd, pick } from './util.js';
import { letterPool, wordsFor } from './words.js';
import { Dungeon } from './Dungeon.js';
import { Town } from './Town.js';
import { Player, Enemy, Slime, Mage, Boss, Chest, PlayerSpell, FloorItem } from './entities.js';
import { xpFor, goldFor, chestGold } from './progression.js';
import { ItemCommands } from './ItemCommands.js';
import { Shop } from './Shop.js';
import { townCritters } from './Critters.js';
import * as Items from './items.js';

const SHOP_COMMANDS = ['enter', 'buy', 'sell', 'stash', 'take'];

const AUTOSAVE_MS = 30000;

export class Room {
  /** store is a SaveStore: if it has a save for this code, the lobby carries on from it. */
  constructor(code, onEmpty, store) {
    this.code = code;
    this.onEmpty = onEmpty;   // called when the last player leaves
    this.store = store;
    this.players = new Map(); // id -> Player
    this.savedPlayers = {};   // lowercase name -> saved progress of players who are not here right now
    this.floor = 0;           // the floor the party is on: 0 is the surface town
    this.maxDepth = 0;        // deepest floor reached (a Scroll of Recall read on the surface goes there)
    this.levels = {};         // floor number -> saved layout, chests, items and cleared flag of floors left behind
    this.travel = null;       // { at, to } a Scroll of Recall or descent scroll about to carry the party away
    this.dungeon = null;
    this.foundMythics = new Set(); // mythic items drop at most once per game (like Angband artifacts)
    this.bestiary = {};       // enemy type -> how many the party has defeated; each kind met moves into the zoo
    this.zooNew = [];         // zoo pens that opened since the party was last on the surface
    this.zooFed = 0;          // treats the zoo animals have had
    this.critters = [];       // zoo animals, practice dummies and the wishing fountain (surface only)
    this.events = [];         // effects for clients (hits, blocks...), flushed every tick
    this.banner = null;       // { text, until } big centred message
    this.itemCommands = new ItemCommands(this);
    this.shop = new Shop(this);
    const saved = store && store.load(code);
    if (saved) this.restore(saved); else this.enterFloor(0, 'start');
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.autosave = setInterval(() => this.save(), AUTOSAVE_MS);
  }

  // ------------------------------------------------------------------ saving
  /** Everything needed to carry on later. Flying spells and timed potions are not kept. */
  toSave() {
    const players = { ...this.savedPlayers };
    for (const pl of this.players.values()) players[pl.name.toLowerCase()] = pl.toSave();
    return {
      version: 3, room: this.code, savedAt: Date.now(), floor: this.floor, maxDepth: this.maxDepth,
      foundMythics: [...this.foundMythics], bestiary: this.bestiary, zooFed: this.zooFed,
      levels: { ...this.levels, [this.floor]: this.levelSave() },
      enemies: this.enemies.map(e => e.toSave()), // the fight on the current floor carries on where it was
      shop: this.shop.toSave(),
      players,
    };
  }
  /** One floor's persistent part. The town's layout is fixed, so only its items are kept. */
  levelSave() {
    return {
      dungeon: this.floor > 0 ? this.dungeon.toSave() : null, cleared: this.cleared,
      chests: this.chests.map(c => c.toSave()), items: this.items.map(f => f.toSave()),
    };
  }
  save() {
    if (!this.store) return false;
    try { this.store.save(this.code, this.toSave()); return true; }
    catch (err) { console.error(`Could not save room ${this.code}:`, err.message); return false; }
  }
  restore(s) {
    this.floor = Math.max(0, s.floor | 0);
    this.maxDepth = Math.max(this.floor, s.maxDepth | 0);
    this.foundMythics = new Set(s.foundMythics || []);
    this.bestiary = s.bestiary && typeof s.bestiary === 'object' ? s.bestiary : {};
    this.zooFed = s.zooFed | 0;
    this.levels = s.levels || {};
    // Saves from before persistent floors (version 2) only had the current floor.
    if (!s.levels) this.levels[this.floor] = { dungeon: s.dungeon, chests: s.chests, items: s.items, cleared: !!s.stairsOpen };
    this.shop.restore(s.shop);
    this.savedPlayers = s.players || {};
    this.loadLevel(this.levels[this.floor]);
    this.enemies = (s.enemies || []).map(e => Enemy.fromSave(e));
    this.stairsOpen = this.cleared;
    this.say(this.floor ? `Welcome back to floor ${this.floor}` : 'Welcome back to the surface', 3);
  }

  // ------------------------------------------------------------------ helpers
  emit(event) { this.events.push(event); }
  say(text, secs = 3) { this.banner = { text, until: Date.now() + secs * 1000 }; }
  broadcast(obj) { const s = JSON.stringify(obj); for (const pl of this.players.values()) pl.send(s); }
  get alivePlayers() { return [...this.players.values()].filter(p => !p.dead); }
  get pool() { return letterPool(Math.max(1, this.floor)); } // the town uses the floor-1 letters for practice
  get town() { return this.floor === 0; }

  // ------------------------------------------------------------------ floors
  /** Build the current floor from its saved part, or generate it when the party has never been here. */
  loadLevel(lv) {
    this.dungeon = this.town ? new Town() : new Dungeon(lv?.dungeon || null);
    this.chests = (lv?.chests || []).map(c => Chest.fromSave(c));
    this.items = (lv?.items || []).map(f => FloorItem.fromSave(f)).filter(Boolean);
    this.cleared = this.town || !!lv?.cleared;
    this.enemies = [];
    this.spells = [];
    this.wipeAt = 0;
    this.slowUntil = 0;
    this.travel = null;
    if (this.town) this.dungeon.bestiary = this.bestiary; // the zoo's signs count what the party has defeated
    this.critters = this.town ? townCritters(this, this.dungeon) : [];
    if (!this.town && !lv) this.spawnChests(wordsFor(this.pool));
  }

  /**
   * Move the party to floor `depth`. how = 'down' or 'up' (stairs: you arrive beside the stairs leading back),
   * 'travel' (recall or a descent scroll), 'wipe' (the party fell and tries the floor again) or 'start'.
   */
  enterFloor(depth, how) {
    if (this.dungeon) this.levels[this.floor] = this.levelSave(); // the floor we leave stays as it is
    this.floor = depth;
    this.maxDepth = Math.max(this.maxDepth, depth);
    this.loadLevel(this.levels[depth]);
    if (!this.town) { // new enemies every visit; the Bellwraith only until the floor has been cleared
      const words = wordsFor(this.pool);
      this.spawnEnemies(words);
      if (!this.cleared) this.spawnBoss(words);
    }
    this.stairsOpen = this.cleared;
    const dg = this.dungeon;
    const at = how === 'down' ? dg.beside('up') : how === 'up' ? dg.beside('down')
      : this.town ? { x: dg.start.cx, y: dg.start.cy } : dg.beside('up');
    for (const pl of this.players.values()) pl.placeAt(this, at);
    for (const s of Object.values(this.savedPlayers)) { delete s.x; delete s.y; } // old map positions
    this.broadcast(this.dungeon.toMessage(this.floor, this.pool));
    this.say(this.town ? 'The surface' : `Floor ${this.floor}` + (this.cleared && how !== 'wipe' ? ' (cleared before: new enemies roam it)' : ''), 3);
    if (this.town && this.zooNew.length) {
      this.say(`New in the zoo: ${this.zooNew.join(', ')}!`, 4);
      this.zooNew = [];
    }
    if (this.players.size) this.save();
  }

  // ------------------------------------------------------------------ recall and descent scrolls
  /** Why a travel scroll to this floor would do nothing right now, or null if it works. */
  travelProblem(to) {
    if (this.travel) return 'The air is already humming: the party is about to be carried away.';
    if (to === this.floor) return this.town ? 'You have not been down into the dungeon yet, so the scroll has nowhere to take you.' : `You are already on floor ${to}.`;
    return null;
  }
  startTravel(pl, to) {
    this.travel = { at: Date.now() + EFFECTS.travelSeconds * 1000, to };
    const where = to === 0 ? 'up to the surface' : `to floor ${to}`;
    this.say(`${pl.name} reads a scroll: the party will be carried ${where}...`, 3);
    for (const p of this.players.values()) p.tell(`The air starts to hum. In ${EFFECTS.travelSeconds} seconds the party is carried ${where}.`);
    this.emit({ t: 'travel', x: pl.x, y: pl.y });
  }

  spawnEnemies(words) {
    const count = Math.min(3 + this.floor * 2, DEPTH.maxEnemies);
    const all = this.dungeon.rooms;
    const rooms = all.length > 2 ? all.slice(1, -1) : all.slice(1); // never in the start room; the last room is the boss's
    for (let n = 0; n < count; n++) {
      const r = rooms[n % rooms.length];
      const x = rnd(r.x + 1, r.x + r.w - 1), y = rnd(r.y + 1, r.y + r.h - 1);
      const isMage = Math.random() < Math.min(0.25 + this.floor * 0.12, 0.75);
      let word = pick(this.pool);
      if (isMage) { // mages may carry a whole word
        const wordChance = this.floor === 1 ? 0.35 : Math.min(0.5 + this.floor * 0.1, 0.9);
        const ok = words.filter(w => w.length <= 2 + Math.floor(this.floor / 2));
        if (ok.length && Math.random() < wordChance) word = pick(ok);
      }
      this.enemies.push(isMage ? new Mage(x, y, word) : new Slime(x, y, word));
    }
  }

  /** The Bellwraith guards the stairs room. Its name has 2 words on floor 1, up to 4 deeper down. */
  spawnBoss(words) {
    const dg = this.dungeon, r = dg.rooms[dg.rooms.length - 1];
    const phases = Math.min(1 + Math.ceil(this.floor / 2), 4);
    const maxLen = Math.min(3 + this.floor, 6);
    let choices = words.filter(w => w.length >= 3 && w.length <= maxLen);
    if (choices.length < phases) choices = words.filter(w => w.length >= 2);
    const names = [];
    while (names.length < phases) {
      const left = choices.filter(w => !names.includes(w));
      names.push(left.length ? pick(left) : pick(this.pool) + pick(this.pool) + pick(this.pool));
    }
    names.sort((a, b) => a.length - b.length); // short name first, longest last
    let x = r.cx, y = r.cy - 1.5;
    if (dg.blocked(x, y, 0.45)) { x = r.cx; y = r.cy; }
    this.enemies.push(new Boss(x, y, names));
  }

  /** One chest near the start so new players find one early, the rest in random rooms. */
  spawnChests(words) {
    const dg = this.dungeon;
    const count = Math.min(2 + Math.floor(this.floor / 2), 4);
    const chestWords = words.filter(w => w.length >= 2 && w.length <= 3 + Math.floor(this.floor / 2));
    for (let n = 0; n < count; n++) {
      const r = n === 0 ? dg.rooms[0] : pick(dg.rooms.slice(1));
      const word = chestWords.length ? pick(chestWords) : pick(this.pool) + pick(this.pool);
      let x, y, tries = 0;
      do { x = Math.floor(rnd(r.x, r.x + r.w)) + 0.5; y = Math.floor(rnd(r.y, r.y + r.h)) + 0.5; }
      while (tries++ < 20 && ((n === 0 && Math.hypot(x - r.cx, y - r.cy) < 1.5) || dg.stairsAt(x, y)));
      this.chests.push(new Chest(x, y, word));
    }
  }

  // ------------------------------------------------------------------ players
  /** opts.fromArena: coming back out of the duel arena, so stand in front of its gate. */
  addPlayer(ws, name, opts = {}) {
    const used = new Set([...this.players.values()].map(p => p.color));
    const pl = new Player(ws, name, PLAYER.colors.find(c => !used.has(c)) || PLAYER.colors[0]);
    const buddy = this.alivePlayers[0];
    pl.placeAt(this);
    if (buddy) { pl.x = buddy.x; pl.y = buddy.y; }
    const saved = this.savedPlayers[pl.name.toLowerCase()];
    if (saved) { // a returning player gets their level, gear, HP and position back
      pl.restore(saved);
      if (!Number.isFinite(saved.x) || this.dungeon.blocked(pl.x, pl.y, pl.radius)) { pl.placeAt(this); pl.restore({ ...saved, x: pl.x, y: pl.y }); }
      delete this.savedPlayers[pl.name.toLowerCase()];
    }
    if (opts.fromArena && this.town) { pl.x = this.dungeon.arenaExit.x; pl.y = this.dungeon.arenaExit.y; }
    pl.onStairs = this.dungeon.stairsAt(pl.x, pl.y);
    this.players.set(pl.id, pl);
    pl.send({ t: 'welcome', id: pl.id, room: this.code });
    pl.send(this.dungeon.toMessage(this.floor, this.pool));
    if (opts.fromArena) {
      this.say(`${pl.name} is back from the arena`, 2);
      if (!this.town) pl.tell(`Your party went down to floor ${this.floor} while you were duelling: you join them there.`);
      return pl;
    }
    this.say(saved ? `${pl.name} is back` : `${pl.name} joined`, 2);
    if (saved) pl.tell('Welcome back! Your gear was saved.');
    return pl;
  }
  removePlayer(pl) {
    this.players.delete(pl.id);
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
    else this.itemCommands.run(pl, m);
  }

  // ------------------------------------------------------------------ casting
  cast(pl, word, dx, dy) {
    if (pl.dead || typeof word !== 'string' || !new RegExp(`^[A-Z]{1,${pl.maxLetters}}$`).test(word)) return;
    const len = Math.hypot(dx, dy); if (!len || !isFinite(len)) return;
    dx /= len; dy /= len;
    pl.casts++;
    const taken = new Set();
    if (pl.has('fork') && pl.casts % 3 === 0) { // Trident of Poseidon: three spells, 35 degrees apart
      for (const a of [0, -0.61, 0.61]) this.launch(pl, word, dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a), taken);
    } else this.launch(pl, word, dx, dy, taken);
    if (pl.has('sweep')) { // Green Dragon Crescent Blade: up to two more enemies whose words start the same way
      for (let k = 0; k < 2; k++) {
        const t = this.chooseTarget(pl, word[0], dx, dy, taken, { any: true, kinds: ['enemy'] });
        if (!t) break;
        const o = this.findTarget(t), d = Math.hypot(o.x - pl.x, o.y - pl.y) || 1;
        this.launch(pl, word, (o.x - pl.x) / d, (o.y - pl.y) / d, taken, t);
      }
    }
    this.emit({ t: 'cast', x: pl.x, y: pl.y, c: pl.color });
  }

  /** Fire one spell. `taken` holds target ids already claimed by sibling spells. `forced` skips target search. */
  launch(pl, word, dx, dy, taken, forced = null) {
    const target = forced || this.chooseTarget(pl, word[0], dx, dy, taken);
    if (target) taken.add(target.id);
    this.spells.push(new PlayerSpell(pl, word, dx, dy, target));
  }

  /**
   * Soft aim: pick the best thing this letter can hit inside a cone around the chosen direction,
   * as long as there is a way to fly there around walls. Enemy letters first, chests last.
   */
  chooseTarget(pl, letter, dx, dy, taken, opts = {}) {
    const dg = this.dungeon, from = opts.from || pl;
    const range = SPELL.homingRange * pl.reach, maxPath = Math.round(SPELL.homingPath * pl.reach);
    const cone = opts.any || pl.has('anyAim') ? -1.01 : SPELL.homingCone; // Bow of Artemis: any direction
    const kinds = opts.kinds || ['proj', 'enemy', 'chest', 'critter'];
    let best = null, bestScore = Infinity;
    const consider = (kind, o) => {
      if (!kinds.includes(kind) || o === opts.skip) return;
      const vx = o.x - from.x, vy = o.y - from.y, d = Math.hypot(vx, vy);
      if (d > range || d < 0.01 || taken.has(o.id)) return;
      const cos = (vx * dx + vy * dy) / d;
      if (cos < cone) return;
      const path = dg.los(from.x, from.y, o.x, o.y) ? null : dg.findPath(from.x, from.y, o.x, o.y, maxPath);
      if (path === undefined) return; // no way around the walls
      const travel = path ? path.length : d;
      const score = travel * (2 - Math.max(cos, 0)) * (kind === 'proj' ? 0.7 : kind === 'chest' || kind === 'critter' ? 1.3 : 1);
      if (score < bestScore) { bestScore = score; best = { kind, id: o.id }; }
    };
    for (const s of this.spells) if (!s.fromPlayer && s.letters === letter) consider('proj', s);
    for (const e of this.enemies) if (e.wants(letter)) consider('enemy', e);
    for (const c of this.chests) if (!c.open && c.lock.next === letter) consider('chest', c);
    for (const c of this.critters) if (c.wants(letter)) consider('critter', c);
    return best;
  }

  findTarget({ kind, id }) {
    const list = kind === 'proj' ? this.spells : kind === 'chest' ? this.chests : kind === 'critter' ? this.critters : this.enemies;
    return list.find(o => o.id === id);
  }

  // ------------------------------------------------------------------ loot
  /** A chest spills its loot on the floor, Angband-style, for anyone to pick up with g. */
  openChest(chest, pl) {
    chest.open = true;
    const count = Math.random() < 0.15 + this.floor * 0.05 + pl.luck * 0.02 ? 2 : 1;
    for (let k = 0; k < count; k++) this.dropItem(this.rollLoot(pl), chest.x + (k ? 0.6 : 0), chest.y + 0.6);
    pl.gainXp(this, xpFor(chest.lock.word, 'chest'));
    this.giveGold(pl, chestGold(this.floor));
    this.emit({ t: 'chest', x: chest.x, y: chest.y, by: pl.id });
    this.say(`${pl.name} opened a chest!`, 2);
  }
  /** The Bellwraith drops three items. */
  bossDefeated(boss, pl) {
    for (let k = 0; k < 3; k++) this.dropItem(this.rollLoot(pl), boss.x + (k - 1) * 0.7, boss.y + 0.4);
    this.emit({ t: 'bossdown', x: boss.x, y: boss.y });
    this.say(`${pl.name} silenced the Bellwraith!`, 3);
  }
  /** One random item for this floor; the finder's Luck helps. */
  rollLoot(pl) {
    const it = Items.rollItem(this.floor, this.pool, pl ? pl.luck : 0, this.foundMythics);
    if (Items.MYTHIC[it.kind]) this.foundMythics.add(it.kind);
    return it;
  }
  /** Gold goes straight into the purse of whoever earned it. */
  giveGold(pl, n) {
    if (n <= 0) return;
    pl.gold += n;
    this.emit({ t: 'gold', x: pl.x, y: pl.y, n, id: pl.id });
  }
  dropItem(item, x, y) {
    const dg = this.dungeon;
    if (dg.solid(x, y)) { x = Math.floor(x) + 0.5; y = Math.floor(y) + 0.5; }
    if (dg.solid(x, y)) { x = dg.start.cx; y = dg.start.cy; }
    this.items.push(new FloorItem(item, x, y));
  }

  // ------------------------------------------------------------------ simulation
  tick() {
    const now = Date.now();
    const alive = this.alivePlayers;

    for (const pl of this.players.values()) pl.update(this, now, alive);

    const shots = { left: Math.max(1, alive.length) + Math.min(Math.floor(this.floor / 2), DEPTH.maxExtraShots) - this.spells.filter(s => !s.fromPlayer).length };
    for (const e of this.enemies) e.update(this, now, alive, shots);

    this.fireCloaks(alive);
    for (const s of this.spells) s.update(this, now);
    this.resolveCollisions(alive, now);
    for (const c of this.chests) c.update(this, now);
    for (const c of this.critters) c.update(this, now);

    this.spells = this.spells.filter(s => !s.removed);
    this.enemies = this.enemies.filter(e => !e.removed);

    if (this.checkProgress(now)) return; // a new floor was loaded
    this.broadcastState(now);
  }

  /** Mantle of the Norns (X): automatically counter incoming X letters heading toward the wearer. */
  fireCloaks(alive) {
    for (const pl of alive) {
      const cloak = pl.equip.cloak;
      if (!cloak || !pl.has('counter') || !cloak.letter) continue;
      for (const s of this.spells) {
        if (s.fromPlayer || s.countered || s.letters !== cloak.letter) continue;
        const dx = pl.x - s.x, dy = pl.y - s.y, d = Math.hypot(dx, dy);
        if (d > EFFECTS.cloakRange || (s.vx * dx + s.vy * dy) <= 0) continue; // only spells heading our way
        s.countered = true;
        this.launch(pl, s.letters, -dx / d, -dy / d, new Set(), { kind: 'proj', id: s.id });
        this.emit({ t: 'cloak', x: pl.x, y: pl.y, l: s.letters, c: pl.color });
      }
    }
  }

  resolveCollisions(alive, now) {
    const live = (s) => !s.removed;
    const playerSpells = () => this.spells.filter(s => s.fromPlayer && live(s));
    const enemySpells = () => this.spells.filter(s => !s.fromPlayer && live(s));

    // Player spell vs enemy letter: the spell's first letter cancels a matching letter, the rest keeps flying.
    // Kusanagi cuts through every enemy letter without spending any of its own.
    for (const a of playerSpells()) {
      for (const b of enemySpells()) {
        if (a.distanceTo(b) >= HITBOX.block) continue;
        if (a.owner.has('cut') && b.letters !== a.letters[0]) {
          b.removed = true; a.owner.blocks++;
          this.emit({ t: 'block', x: b.x, y: b.y, l: b.letters, cut: true });
          continue;
        }
        if (b.letters !== a.letters[0]) continue;
        b.removed = true;
        a.letters = a.letters.slice(1); a.target = null;
        if (!a.letters) a.removed = true;
        a.owner.blocks++;
        this.emit({ t: 'block', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, l: b.letters });
        break;
      }
    }
    // Player spell vs enemy, then vs chest: same spelling rules for both.
    for (const s of playerSpells()) {
      const e = this.enemies.find(e => !e.removed && s.distanceTo(e) <= e.hitRadius);
      if (!e) continue;
      s.removed = true;
      const word = e.lock.word;
      const result = e.hitBy(this, s);
      this.afterEnemyHit(e, result, s.owner, word, now, s);
    }
    for (const s of playerSpells()) {
      const c = this.chests.find(c => !c.open && s.distanceTo(c) <= HITBOX.chest);
      if (!c) continue;
      s.removed = true;
      const result = c.lock.apply(s.letters);
      if (result === 'done') this.openChest(c, s.owner);
      else this.emit({ t: result, x: c.x, y: c.y });
    }
    // Player spell vs the surface's critters: feeding zoo animals, practice dummies and the fountain.
    for (const s of playerSpells()) {
      // a spell aimed at one critter flies past the others; a spell that found no target (a wrong letter) hits what it meets
      const c = this.critters.find(c => s.distanceTo(c) <= c.hitRadius && (s.target ? s.target.kind === 'critter' && s.target.id === c.id : !c.renew));
      if (!c) continue;
      s.removed = true;
      c.hitBy(this, s, now);
    }
    // Enemy letter vs player.
    for (const s of enemySpells()) {
      if (!s.slowed && alive.some(p => p.trail.some(t => Math.hypot(t.x - s.x, t.y - s.y) < 0.7))) s.slowed = true; // Sleipnir
      const pl = alive.find(p => !p.dead && s.distanceTo(p) <= HITBOX.caster);
      if (!pl) continue;
      s.removed = true;
      pl.takeHit(this, now, s);
    }
  }

  /**
   * What happens after a spell (or a chip from an item effect) hits an enemy.
   * word = the enemy's word before the hit (the Bellwraith moves on to a new name when one is finished).
   * spell = the player spell, or null for chips (chips never trigger other effects, so nothing loops).
   */
  afterEnemyHit(e, result, pl, word, now, spell = null) {
    const correct = result === 'hit' || result === 'done' || result === 'phase';
    if (result === 'hit' || result === 'wrong') this.emit({ t: result, x: e.x, y: e.y });
    if (!correct) return;
    if (spell) {
      if (pl.stats.stagger && result === 'hit') e.stun(now, pl.stats.stagger * 1000, this, 'stagger');
      if (result === 'hit' && pl.has('burn') && !e.burnAt) { e.burnAt = now + 2000; e.burnBy = pl; }
      if (result === 'hit' && pl.stats.echo && Math.random() < pl.stats.echo) this.chip(e, pl, 'echo');
    }
    if (result === 'hit' || e.removed) return;
    // A whole word was spelled: XP for whoever finished it, and word effects.
    pl.gainXp(this, xpFor(word, e.type));
    if (pl.stats.wordHeal) { const got = pl.heal(pl.stats.wordHeal); if (got) this.emit({ t: 'regen', x: pl.x, y: pl.y, n: got }); }
    if (spell) {
      if (pl.has('thunderclap')) {
        this.emit({ t: 'thunder', x: e.x, y: e.y });
        for (const o of this.enemies) if (o !== e && !o.removed && o.distanceTo(e) <= 3) o.stun(now, 2000, this, 'thunder');
      }
      if (pl.has('chain')) {
        const near = this.enemies.filter(o => o !== e && !o.removed && o.distanceTo(e) <= 6 && this.dungeon.los(e.x, e.y, o.x, o.y))
          .sort((a, b) => a.distanceTo(e) - b.distanceTo(e))[0];
        if (near) { this.emit({ t: 'chain', x: e.x, y: e.y, x2: near.x, y2: near.y }); this.chip(near, pl, 'chain'); }
      }
      const left = !e.isBoss ? spell.letters.slice(e.lock.used) : '';
      if (left && pl.has('pierce')) { // Gungnir: the rest of the spell flies on
        const t = this.chooseTarget(pl, left[0], 1, 0, new Set([e.id]), { any: true, from: e, kinds: ['enemy', 'chest'], skip: e });
        if (t) {
          const o = this.findTarget(t), d = Math.hypot(o.x - e.x, o.y - e.y) || 1;
          this.spells.push(new PlayerSpell(pl, left, (o.x - e.x) / d, (o.y - e.y) / d, t, e));
        }
      }
    }
    if (result !== 'done') return;
    e.removed = true; pl.kills++;
    if (!this.bestiary[e.type]) this.zooNew.push({ slime: 'a Slime', mage: 'a Skeleton Mage', boss: 'the Bellwraith' }[e.type] || e.type);
    this.bestiary[e.type] = (this.bestiary[e.type] | 0) + 1;
    this.emit({ t: 'kill', x: e.x, y: e.y, type: e.type });
    this.giveGold(pl, goldFor(e.type, this.floor));
    if (e.isBoss) this.bossDefeated(e, pl);
    if (pl.has('draupnir') && ++pl.draupnir % 9 === 0) {
      this.dropItem(Items.makeItem('pot_heal'), e.x, e.y);
      pl.tell('Draupnir drips a Potion of Healing.');
    }
  }

  /** An item effect removes the next letter of an enemy's word (Laevateinn, Zeus, blades). */
  chip(e, pl, why) {
    if (!e || e.removed || !pl || (e.isBoss && e.shield)) return;
    const word = e.lock.word;
    this.emit({ t: 'chip', x: e.x, y: e.y, l: e.lock.next, why });
    const result = e.hitBy(this, { letters: e.lock.next, owner: pl });
    this.afterEnemyHit(e, result, pl, word, Date.now(), null);
  }

  /**
   * Open the stairs, take the stairs up or down, travel by scroll, or retry after a wipe.
   * Returns true if the party moved to another floor.
   */
  checkProgress(now) {
    if (!this.stairsOpen && !this.town && this.enemies.length === 0) {
      this.stairsOpen = true;
      this.cleared = true; // stays open on later visits
      this.say('The stairs down are open!', 3);
      this.emit({ t: 'stairs' });
    }
    if (this.travel && now >= this.travel.at) { this.enterFloor(this.travel.to, 'travel'); return true; }
    const all = [...this.players.values()];
    // Stairs work when you step onto them, so arriving next to (or on) them never sends you straight back.
    for (const p of all) {
      const on = p.dead ? null : this.dungeon.stairsAt(p.x, p.y), was = p.onStairs;
      if (on === 'down' && !this.stairsOpen) { // sealed: say so once, and go down as soon as they open
        if (was !== 'sealed') p.tell('The stairs down are sealed until every enemy on this floor, the Bellwraith too, is gone.');
        p.onStairs = 'sealed';
        continue;
      }
      p.onStairs = on;
      if (!on || on === was) continue;
      if (on === 'up') { this.say(`${p.name} leads the party up`, 2); this.enterFloor(this.floor - 1, 'up'); return true; }
      this.enterFloor(this.floor + 1, 'down'); return true;
    }
    if (all.length && all.every(p => p.dead)) {
      if (!this.wipeAt) { this.wipeAt = now + 3000; this.say('Party wiped... back to the stairs', 3); }
      else if (now >= this.wipeAt) { this.enterFloor(this.floor, 'wipe'); return true; }
    }
    return false;
  }

  broadcastState(now) {
    const base = JSON.stringify({
      t: 'state', ts: now, floor: this.floor, stairsOpen: this.stairsOpen, maxDepth: this.maxDepth,
      travel: this.travel ? { to: this.travel.to, secs: Math.max(0, Math.ceil((this.travel.at - now) / 1000)) } : null,
      msg: this.banner && this.banner.until > now ? this.banner.text : null,
      slow: this.slowUntil > now ? Math.ceil((this.slowUntil - now) / 1000) : 0,
      players: [...this.players.values()].map(p => p.snapshot(now)),
      enemies: this.enemies.map(e => e.snapshot()),
      chests: this.chests.map(c => c.snapshot()),
      items: this.items.map(f => f.snapshot()),
      critters: this.critters.map(c => c.snapshot()),
      projs: this.spells.map(s => s.snapshot()),
    });
    for (const pl of this.players.values()) pl.sendState(base, this.events);
    this.events = [];
  }
}
