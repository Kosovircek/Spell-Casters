// One floor that casters are standing on right now, and its simulation: the surface town or a dungeon floor.
//
// Every caster explores on their own: the Room (the party) keeps one Level running for each floor that has at
// least one caster on it. Casters on the same floor see each other, fight together and share its enemies,
// chests and loot; a floor nobody stands on is put away (its layout, chests and items are kept) until
// someone comes back, and then it gets new enemies, like in Angband.
//
// Monsters, items and spells get this object as their `room`, so everything they need lives here: the map,
// enemies, flying spells, chests, items and the casters on this floor (`players`).
import { SPELL, EFFECTS, HITBOX, DEPTH } from './config.js';
import { rnd, pick } from './util.js';
import { letterPool, wordsFor } from './words.js';
import { Dungeon } from './Dungeon.js';
import { Town } from './Town.js';
import { Chest, PlayerSpell, FloorItem } from './entities.js';
import { spawnEnemies, spawnBoss, enemyFromSave } from './spawner.js';
import { xpFor, goldFor, chestGold } from './progression.js';
import { ItemCommands } from './ItemCommands.js';
import { townCritters, penAnimals } from './Critters.js';
import * as Items from './items.js';

export class Level {
  /**
   * party = the Room. saved = this floor's persistent part from an earlier visit (or undefined the first time).
   * Saved enemies are only there when a lobby is loaded from disk: then the fight carries on where it was.
   */
  constructor(party, floor, saved) {
    this.party = party;
    this.floor = floor;
    this.players = new Map();  // id -> Player standing on this floor
    this.events = [];          // effects for clients (hits, blocks...), flushed every tick
    this.banner = null;        // { text, until } big centred message
    this.itemCommands = new ItemCommands(this);
    this.dungeon = this.town ? new Town() : new Dungeon(saved?.dungeon || null);
    this.chests = (saved?.chests || []).map(c => Chest.fromSave(c));
    this.items = (saved?.items || []).map(f => FloorItem.fromSave(f)).filter(Boolean);
    this.cleared = this.town || !!saved?.cleared;
    this.enemies = [];
    this.spells = [];
    this.wipeAt = 0;
    this.slowUntil = 0;
    if (this.town) this.dungeon.bestiary = party.bestiary; // the zoo's signs count what the party has defeated
    this.critters = this.town ? townCritters(this, this.dungeon) : [];
    if (!this.town && !saved) this.spawnChests(wordsFor(this.pool));
    if (saved?.enemies) this.enemies = saved.enemies.map(e => enemyFromSave(e)).filter(Boolean);
    else this.spawnFoes();
    this.stairsOpen = this.cleared;
  }

  /** New enemies, as tough as the depth; the boss only until the floor has been cleared. */
  spawnFoes() {
    this.enemies = [];
    if (this.town) return;
    const words = wordsFor(this.pool);
    spawnEnemies(this, words);
    if (!this.cleared) spawnBoss(this, words);
  }

  // ------------------------------------------------------------------ the party's shared progress
  get code() { return this.party.code; }
  get maxDepth() { return this.party.maxDepth; }
  get bestiary() { return this.party.bestiary; }
  get zooFed() { return this.party.zooFed; }
  set zooFed(n) { this.party.zooFed = n; }

  // ------------------------------------------------------------------ helpers
  emit(event) { this.events.push(event); }
  say(text, secs = 3) { this.banner = { text, until: Date.now() + secs * 1000 }; }
  broadcast(obj) { const s = JSON.stringify(obj); for (const pl of this.players.values()) pl.send(s); }
  get alivePlayers() { return [...this.players.values()].filter(p => !p.dead); }
  get pool() { return letterPool(Math.max(1, this.floor)); } // the town uses the floor-1 letters for practice
  get town() { return this.floor === 0; }
  get name() { return this.town ? 'the surface' : `floor ${this.floor}`; }
  mapMessage() { return this.dungeon.toMessage(this.floor, this.pool); }

  /** One floor's persistent part. The town's layout is fixed, so only its items are kept. */
  levelSave(withEnemies = false) {
    const s = {
      dungeon: this.floor > 0 ? this.dungeon.toSave() : null, cleared: this.cleared,
      chests: this.chests.map(c => c.toSave()), items: this.items.map(f => f.toSave()),
    };
    if (withEnemies && !this.town) s.enemies = this.enemies.map(e => e.toSave()).filter(Boolean);
    return s;
  }

  // ------------------------------------------------------------------ casters coming and going
  /** Put a caster on this floor near `at` (default: the start). They get the map; nobody else is moved. */
  enter(pl, at = null) {
    this.players.set(pl.id, pl);
    pl.floor = this.floor;
    pl.placeAt(this, at);
    pl.send(this.mapMessage());
  }
  leave(pl) { this.players.delete(pl.id); }

  /** Where someone arriving by `how` stands: beside the stairs leading back, or at the start. */
  arrival(how) {
    const dg = this.dungeon;
    if (how === 'down') return dg.beside('up');
    if (how === 'up') return dg.beside('down');
    return this.town ? { x: dg.start.cx, y: dg.start.cy } : dg.beside('up');
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

  /** A zoo pen opened while someone was on the surface: its animals move in right away. */
  openPen(kind) {
    if (!this.town) return;
    const pen = this.dungeon.pens.find(p => p.unlock === kind);
    if (pen) this.critters.push(...penAnimals(this, pen));
    this.broadcast(this.mapMessage()); // the pen's sign shows it is open now
  }

  // ------------------------------------------------------------------ recall and descent scrolls
  /** Why a travel scroll to this floor would do nothing right now, or null if it works. Scrolls carry only the reader. */
  travelProblem(pl, to) {
    if (pl.travel) return 'The air is already humming around you: you are about to be carried away.';
    if (to === this.floor) return this.town ? 'You have not been down into the dungeon yet, so the scroll has nowhere to take you.' : `You are already on floor ${to}.`;
    return null;
  }
  startTravel(pl, to) {
    pl.travel = { at: Date.now() + EFFECTS.travelSeconds * 1000, to };
    const where = to === 0 ? 'up to the surface' : `to floor ${to}`;
    this.say(`${pl.name} reads a scroll and will be carried ${where}...`, 3);
    pl.tell(`The air starts to hum. In ${EFFECTS.travelSeconds} seconds you are carried ${where}.`);
    this.emit({ t: 'travel', x: pl.x, y: pl.y });
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
  /** A boss drops three items. */
  bossDefeated(boss, pl) {
    for (let k = 0; k < 3; k++) this.dropItem(this.rollLoot(pl), boss.x + (k - 1) * 0.7, boss.y + 0.4);
    this.emit({ t: 'bossdown', x: boss.x, y: boss.y });
    this.say(boss.type === 'boss' ? `${pl.name} silenced the Bellwraith!` : `${pl.name} defeated ${boss.name}!`, 3);
  }
  /** One random item for this floor; the finder's Luck helps. Mythic items drop once per game. */
  rollLoot(pl) {
    const it = Items.rollItem(this.floor, this.pool, pl ? pl.luck : 0, this.party.foundMythics);
    if (Items.MYTHIC[it.kind]) this.party.foundMythics.add(it.kind);
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
  tick(now) {
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

    this.checkProgress(now);
    if (this.players.size) this.broadcastState(now); // nobody left here: the floor has been put away
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
          b.source?.onBlocked(this, a.owner, now);
          continue;
        }
        if (b.letters !== a.letters[0]) continue;
        b.removed = true;
        a.letters = a.letters.slice(1); a.target = null;
        if (!a.letters) a.removed = true;
        a.owner.blocks++;
        this.emit({ t: 'block', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, l: b.letters });
        if (b.source && !b.source.removed) b.source.onBlocked(this, a.owner, now); // the Silent King shows a letter
        break;
      }
    }
    // Player spell vs enemy, then vs chest: same spelling rules for both.
    for (const s of playerSpells()) {
      const e = this.enemies.find(e => !e.removed && !e.intangible && s.distanceTo(e) <= e.hitRadius); // spells fly through a faded Phantom
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
      if (pl.takeHit(this, now, s) && s.source && !s.source.removed) s.source.onLetterHit(this, pl, now); // leeches, frost
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
    this.countKill(e);
    this.giveGold(pl, goldFor(e.type, this.floor));
    if (e.isBoss) this.bossDefeated(e, pl);
    e.onDefeated(this, pl, now);
    if (pl.has('draupnir') && ++pl.draupnir % 9 === 0) {
      this.dropItem(Items.makeItem('pot_heal'), e.x, e.y);
      pl.tell('Draupnir drips a Potion of Healing.');
    }
  }

  /** Into the party's bestiary (the zoo moves in the kinds it has pens for) and a burst on screen. */
  countKill(e) {
    this.party.countKill(e.type);
    this.emit({ t: 'kill', x: e.x, y: e.y, type: e.type });
  }
  /** Something else finished along with an enemy (a downed gremlin when its twin falls): gone, with gold and XP for its word. */
  defeatAlso(e, pl) {
    e.removed = true; pl.kills++;
    this.countKill(e);
    pl.gainXp(this, xpFor(e.lock.word, e.type));
    this.giveGold(pl, goldFor(e.type, this.floor));
  }

  /** An item effect removes the next letter of an enemy's word (Laevateinn, Zeus, blades). */
  chip(e, pl, why) {
    if (!e || e.removed || !pl || e.guarded || e.intangible) return;
    const word = e.lock.word;
    this.emit({ t: 'chip', x: e.x, y: e.y, l: e.lock.next, why });
    const result = e.hitBy(this, { letters: e.lock.next, owner: pl });
    this.afterEnemyHit(e, result, pl, word, Date.now(), null);
  }

  /** Open the stairs; take casters up or down the stairs or away by scroll; start this floor again after a wipe. */
  checkProgress(now) {
    if (!this.stairsOpen && !this.town && this.enemies.length === 0) {
      this.stairsOpen = true;
      this.cleared = true; // stays open on later visits
      this.say('The stairs down are open!', 3);
      this.emit({ t: 'stairs' });
    }
    const here = [...this.players.values()];
    for (const p of here) {
      if (p.travel && now >= p.travel.at) { const to = p.travel.to; p.travel = null; this.party.movePlayer(p, to, 'travel'); continue; }
      // Stairs work when you step onto them, so arriving next to (or on) them never sends you straight back.
      const on = p.dead ? null : this.dungeon.stairsAt(p.x, p.y), was = p.onStairs;
      if (on === 'down' && !this.stairsOpen) { // sealed: say so once, and go down as soon as they open
        if (was !== 'sealed') p.tell('The stairs down are sealed until every enemy on this floor, its boss too, is gone.');
        p.onStairs = 'sealed';
        continue;
      }
      p.onStairs = on;
      if (!on || on === was) continue;
      this.say(`${p.name} went ${on} the stairs`, 2);
      this.party.movePlayer(p, this.floor + (on === 'up' ? -1 : 1), on);
    }
    // Everyone on this floor is down: they all wake up at its stairs up, and it gets new enemies.
    if (this.players.size && this.alivePlayers.length === 0) {
      if (!this.wipeAt) { this.wipeAt = now + 3000; this.say(this.players.size > 1 ? 'Everyone here is down... back to the stairs' : 'You are down... back to the stairs', 3); }
      else if (now >= this.wipeAt) this.restart();
    } else this.wipeAt = 0;
  }

  /** After a wipe: fresh enemies (and the boss, if it still lives), everyone back at the stairs up at half HP. */
  restart() {
    this.wipeAt = 0;
    this.spells = [];
    this.slowUntil = 0;
    this.spawnFoes();
    const at = this.arrival('wipe');
    for (const pl of this.players.values()) { pl.travel = null; pl.placeAt(this, at); }
    this.broadcast(this.mapMessage());
    this.say(this.town ? 'The surface' : `Floor ${this.floor}`, 3);
    this.party.save();
  }

  broadcastState(now) {
    const here = [...this.players.values()];
    const base = JSON.stringify({
      t: 'state', ts: now, floor: this.floor, stairsOpen: this.stairsOpen, maxDepth: this.maxDepth,
      msg: this.banner && this.banner.until > now ? this.banner.text : null,
      slow: this.slowUntil > now ? Math.ceil((this.slowUntil - now) / 1000) : 0,
      players: here.map(p => p.snapshot(now)),
      elsewhere: this.party.elsewhere(this.floor), // teammates exploring other floors
      enemies: this.enemies.map(e => e.snapshot()),
      chests: this.chests.map(c => c.snapshot()),
      items: this.items.map(f => f.snapshot()),
      critters: this.critters.map(c => c.snapshot()),
      projs: this.spells.map(s => s.snapshot()),
    });
    for (const pl of here) {
      const travel = pl.travel ? { to: pl.travel.to, secs: Math.max(0, Math.ceil((pl.travel.at - now) / 1000)) } : null;
      pl.sendState(travel ? base.slice(0, -1) + ',"travel":' + JSON.stringify(travel) + '}' : base, this.events);
    }
    this.events = [];
  }
}
