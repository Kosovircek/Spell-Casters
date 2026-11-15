// The rules of a biome while casters are on one of its floors: everything the ground does on its own (vents,
// machinery, crumbling bridges, wind, lightning, blizzards, vines growing back), what effect spells do to the
// ground (GELU freezes water and cools lava, fire burns vines and melts ice, TARDUS slows machinery), what walls do
// to spells (mirrors bounce them, vines get cut, ice gets chipped), and the extras any floor may have (a shrine,
// a challenge altar). Every dungeon Level has one; the surface and the duel arena do not.
//
// The client gets the fixed part with the map (mapExtra) and the moving part with every state (snapshot).
import { DT } from '../config.js';
import { TILE } from '../Dungeon.js';
import { rnd, pick } from '../util.js';
import { biomeFor, isBiomeBossFloor, BIOME_BY_ID } from './biomes.js';
import { Brazier, RiddleDoor, Shrine, Altar } from './props.js';
import { MODS } from './modifiers.js';
import { letterDamage } from '../progression.js';

const SHALLOW_SPEED = 0.72;     // walking speed in shallow water
const ICE_GRIP = 2.4;           // how fast you can change speed on ice (higher = less slippery)
const VENT = { period: 4, warn: 1.1, burst: 0.6 };
const PISTON = { period: 5, closed: 2.2, warn: 0.8 };
const ROTOR_STEP = 3;           // seconds per quarter turn
const BLADES = { period: 3, up: 0.7, warn: 0.6 };
const BLIZZARD = { every: 34, lasts: 11, near: 3.5 };
const STORM = { gust: 9, push: 1.4, strikeMin: 2.2, strikeMax: 3.6, strikeWarn: 1.2 };
const BRIDGE = { hold: 0.9, gone: 6 };
const VINE_REGROW = { cut: 25000, burnt: 45000 };
const WELL = { r: 3.5, pull: 1.3 };

/** A walking body that something must not close on. */
const bodies = (lv) => [...lv.players.values()].filter(p => !p.dead).concat(lv.enemies.filter(e => !e.removed), lv.magic.minions);

export class Environment {
  constructor(level) {
    this.lv = level;
    this.dg = level.dungeon;
    this.biome = biomeFor(level.floor);
    this.id = this.biome?.id || null;
    this.env = this.dg.env || {};
    this.clocks = new Map();     // machine -> its own clock (seconds), so TARDUS can slow just that machine
    this.slowUntil = new Map();  // machine -> time it runs normally again
    this.hit = new Map();        // 'vent:3' -> eruption number that already hurt each caster (no double hits)
    this.regrow = new Map();     // vine tile index -> when it grows back
    this.chips = new Map();      // ice wall tile index -> letter spells it has taken
    this.crumble = new Map();    // bridge tile index -> when it gives way
    this.holes = new Map();      // crumbled bridge tile index -> when it comes back
    this.wind = { x: 1, y: 0, a: 0, next: 0 };
    this.strikeAt = 0;
    this.challenge = null;
    this.props = [];
    this.makeProps();
  }

  // ------------------------------------------------------------------ setup
  makeProps() {
    const lv = this.lv, e = this.env;
    for (const [x, y] of e.braziers || []) {
      const start = lv.dungeon.rooms[0], inStart = x >= start.x && x < start.x + start.w && y >= start.y && y < start.y + start.h;
      this.props.push(new Brazier(x, y, lv, inStart)); // the room you arrive in is lit
    }
    for (const d of e.doors || []) if (!d.open) this.props.push(new RiddleDoor(d));
    if (e.shrine) this.props.push(new Shrine(e.shrine));
    if (e.altar) this.props.push(this.altar = new Altar(e.altar));
    lv.critters.push(...this.props);
  }
  /** How strong an effect spell is in this biome (1 = normal). */
  power(spellId) { return this.biome?.power?.[spellId] || 1; }
  get bossFloor() { return isBiomeBossFloor(this.lv.floor); }

  /** What the client needs once per floor, with the map. */
  mapExtra() {
    const e = this.env;
    return {
      biome: this.id,
      biomeName: this.biome?.name || null,
      mods: this.lv.mods.map(m => ({ id: m, name: MODS[m].name, kind: MODS[m].kind, desc: MODS[m].desc })),
      envFixed: {
        ...(e.wells ? { wells: e.wells } : {}), ...(e.portals ? { portals: e.portals } : {}),
        ...(e.vents ? { vents: e.vents.map(([i, j]) => j * this.dg.w + i) } : {}),
        ...(e.blades ? { blades: e.blades.map(([i, j]) => j * this.dg.w + i) } : {}),
        ...(e.pistons ? { pistons: e.pistons.flatMap(p => p.tiles) } : {}),
        ...(e.rotors ? { rotors: e.rotors.map(r => [r.i, r.j]) } : {}),
      },
    };
  }

  // ------------------------------------------------------------------ the ground under someone
  tileUnder(a) { return this.dg.tileUnder(a.x, a.y); }
  /** Walking speed factor for a caster standing here. */
  moveFactor(a) { return this.tileUnder(a) === TILE.SHALLOW ? SHALLOW_SPEED : 1; }
  onIce(a) { return this.tileUnder(a) === TILE.ICE; }
  inWater(a) { const t = this.tileUnder(a); return t === TILE.SHALLOW || t === TILE.DEEP; }
  /** How quickly a caster on ice gets to the speed they want (per second). */
  get iceGrip() { return ICE_GRIP; }
  /** Is this spot in light? (catacombs: near a lit brazier, a LUX caster, or right next to any caster) */
  isLit(x, y, near = 2) {
    for (const p of this.props) if (p.kind === 'brazier' && p.lit && Math.hypot(p.x - x, p.y - y) < 4.5) return true;
    for (const p of this.lv.players.values()) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < near || (p.is('lit') && d < 6)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ changing tiles
  set(n, t) { this.lv.setTile(n % this.dg.w, (n / this.dg.w) | 0, t); }
  occupied(n, pad = 0.5) {
    const i = n % this.dg.w, j = (n / this.dg.w) | 0;
    return bodies(this.lv).some(b => Math.abs(b.x - (i + 0.5)) < pad + (b.radius || 0.3) && Math.abs(b.y - (j + 0.5)) < pad + (b.radius || 0.3));
  }
  /** Tiles whose middle lies within r of (x, y). */
  tilesNear(x, y, r) {
    const out = [], w = this.dg.w;
    for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++) for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      if (i <= 0 || j <= 0 || i >= w - 1 || j >= this.dg.h - 1) continue;
      if (Math.hypot(i + 0.5 - x, j + 0.5 - y) <= r) out.push(j * w + i);
    }
    return out;
  }
  /** An effect spell left a zone here (Magic.zone): ice freezes water and cools lava; fire burns vines and melts ice. */
  onZone(kind, x, y, r) {
    if (kind === 'ice') this.freeze(x, y, r + 0.3);
    if (kind === 'fire' || kind === 'lava') this.burn(x, y, r + 0.5);
  }
  /** An effect spell's orb came down here (Magic.landed). */
  onLand(rune, x, y) {
    if (rune === 'shard') this.freeze(x, y, 0.9, true);
    if (rune === 'slow') this.slowMachines(x, y, 4);
  }
  freeze(x, y, r, lavaOnly = false) {
    let n = 0;
    for (const t of this.tilesNear(x, y, r)) {
      const k = this.dg.tiles[t];
      if (k === TILE.LAVA) { this.set(t, TILE.ROCK); n++; }
      else if (!lavaOnly && k === TILE.DEEP) { this.set(t, TILE.ICE); n++; }
    }
    if (n) this.lv.emit({ t: 'freeze2', x, y, r });
  }
  burn(x, y, r) {
    let n = 0;
    for (const t of this.tilesNear(x, y, r)) {
      const k = this.dg.tiles[t];
      if (k === TILE.VINE) { this.set(t, TILE.ASH); this.regrow.set(t, Date.now() + VINE_REGROW.burnt); n++; }
      else if (k === TILE.ICEWALL) { this.set(t, TILE.FLOOR); n++; }
    }
    if (n) this.lv.emit({ t: 'burn', x, y, r });
  }
  /** A Seed Spitter's letter fell here: a vine sprouts, if there is room. */
  plantVine(x, y) {
    const i = Math.floor(x), j = Math.floor(y), n = j * this.dg.w + i;
    if (!this.dg.open(i, j) || this.occupied(n, 0.4) || this.dg.stairsAt(x, y)) return;
    const vines = this.env.vines || (this.env.vines = []);
    if (vines.length > 120) return;
    this.set(n, TILE.VINE);
    if (!vines.includes(n)) vines.push(n);
    this.lv.emit({ t: 'sprout', x: i + 0.5, y: j + 0.5 });
  }

  /**
   * A spell flew into a wall tile. Mirrors bounce free spells; a letter spell cuts a vine or chips an ice wall.
   * Returns 'bounce' (the spell flies on), 'eaten' (it is used up, quietly) or null (it fizzles as usual).
   */
  wallHit(s, px, py) {
    const dg = this.dg, i = Math.floor(s.x), j = Math.floor(s.y), n = j * dg.w + i, t = dg.tile(i, j);
    if (s.fromPlayer && !s.rune && t === TILE.VINE) {
      this.set(n, TILE.ASH); this.regrow.set(n, Date.now() + VINE_REGROW.cut);
      this.lv.emit({ t: 'cut', x: i + 0.5, y: j + 0.5 });
      return 'eaten';
    }
    if (s.fromPlayer && !s.rune && t === TILE.ICEWALL) {
      const k = (this.chips.get(n) || 0) + 1;
      this.chips.set(n, k);
      if (k >= 3) { this.set(n, TILE.FLOOR); this.chips.delete(n); this.lv.emit({ t: 'shatter2', x: i + 0.5, y: j + 0.5 }); }
      else this.lv.emit({ t: 'chip2', x: i + 0.5, y: j + 0.5 });
      return 'eaten';
    }
    if (this.id === 'mirror' && t === TILE.WALL && !dg.magicWalls.has(n) && (s.bounces || 0) < 4) {
      const hx = dg.airSolid(s.x, py), hy = dg.airSolid(px, s.y);
      if (hx || !hy) s.vx = -s.vx;
      if (hy || !hx) s.vy = -s.vy;
      s.x = px; s.y = py; s.bounces = (s.bounces || 0) + 1;
      this.lv.emit({ t: 'bounce', x: px, y: py });
      return 'bounce';
    }
    return null;
  }

  // ------------------------------------------------------------------ every tick
  tick(now) {
    const lv = this.lv, alive = lv.alivePlayers;
    const secs = now / 1000;
    if (this.id === 'forge') this.forgeTick(secs, alive);
    if (this.id === 'frozen') this.frozenTick(now, alive);
    if (this.id === 'clockwork') this.clockTick(now, alive);
    if (this.id === 'storm') this.stormTick(now, alive);
    if (this.id === 'void') this.voidTick(now, alive);
    if (this.regrow.size) this.vinesTick(now);
    this.challengeTick(now);
    for (const p of alive) { // where to put a caster back if the ground gives way under them
      const t = this.tileUnder(p);
      if (t !== TILE.BRIDGE && !this.dg.envHoles.has(Math.floor(p.y) * this.dg.w + Math.floor(p.x))) p.safe = { x: p.x, y: p.y };
    }
  }

  /** Has a beat-driven thing (period, phase) hit its "on" part? Returns 'on', 'warn' or null, and which beat it is. */
  beat(t, period, onFor, warn) {
    const f = ((t % period) + period) % period, n = Math.floor(t / period);
    if (f >= period - onFor) return ['on', n];
    if (f >= period - onFor - warn) return ['warn', n];
    return [null, n];
  }
  /** Hurt a caster with something the floor does (vents, blades, lightning, a fall). Wards and gear still help. */
  hurtCaster(pl, dmg, now, why) {
    const hit = pl.takeHit(this.lv, now, { letters: '', damage: dmg, source: null });
    if (hit) this.lv.emit({ t: 'envhit', x: pl.x, y: pl.y, why });
    if (hit) this.onCasterHurt(pl);
    return hit;
  }
  floorDamage(k = 1) { return Math.round((4 + this.lv.floor * 0.6) * k); }

  // ---- forge
  forgeTick(secs, alive) {
    this.hot = []; this.warm = [];
    for (const [i, j, phase] of this.env.vents || []) {
      const [st, n] = this.beat(secs + phase, VENT.period, VENT.burst, VENT.warn), idx = j * this.dg.w + i;
      if (st === 'warn') this.warm.push(idx);
      if (st !== 'on') continue;
      this.hot.push(idx);
      if (!this.hit.has('v' + idx + ':' + n)) { this.hit.set('v' + idx + ':' + n, true); this.lv.emit({ t: 'erupt', x: i + 0.5, y: j + 0.5 }); }
      for (const p of alive) {
        const key = 'v' + idx + ':' + n + ':' + p.id;
        if (Math.hypot(p.x - (i + 0.5), p.y - (j + 0.5)) > 0.85 || this.hit.has(key)) continue;
        this.hit.set(key, true);
        this.hurtCaster(p, this.floorDamage(1.2), Date.now(), 'vent');
      }
    }
    if (this.hit.size > 400) this.hit.clear();
    for (const p of alive) { // the heat: mana slowly trickles away (a little faster than it comes back)
      const g = p.magic;
      g.mana = Math.max(0, g.mana - (g.regenRate * this.lv.manaMult + 0.4) * DT);
    }
  }

  // ---- frozen halls
  frozenTick(now, alive) {
    const t = now / 1000, f = t % BLIZZARD.every;
    this.blizzard = f < BLIZZARD.lasts ? Math.ceil(BLIZZARD.lasts - f) : 0;
    if (this.blizzard && !this.blizzWas) this.lv.say('A blizzard howls through the halls!', 2);
    this.blizzWas = !!this.blizzard;
    if (now < (this.meltAt || 0)) return;
    this.meltAt = now + 500;
    for (const p of alive) if (p.is('lit', now)) { // LUX melts the ice around you
      for (const n of this.tilesNear(p.x, p.y, 1.7)) if (this.dg.tiles[n] === TILE.ICEWALL) { this.set(n, TILE.FLOOR); this.lv.emit({ t: 'melt', x: n % this.dg.w + 0.5, y: ((n / this.dg.w) | 0) + 0.5 }); }
    }
  }

  // ---- ruins
  vinesTick(now) {
    for (const [n, at] of this.regrow) {
      if (now < at) continue;
      if (this.dg.tiles[n] !== TILE.ASH) { this.regrow.delete(n); continue; }
      if (this.occupied(n, 0.4)) { this.regrow.set(n, now + 2000); continue; }
      this.regrow.delete(n);
      this.set(n, TILE.VINE);
      this.lv.emit({ t: 'sprout', x: n % this.dg.w + 0.5, y: ((n / this.dg.w) | 0) + 0.5 });
    }
  }

  // ---- clockwork
  /** Each machine keeps its own clock: TARDUS near it makes it run at a third of the speed for a while. */
  clockOf(m, now, start = 0) {
    const slow = (this.slowUntil.get(m) || 0) > now;
    const c = (this.clocks.get(m) ?? start) + DT * (slow ? 0.35 : 1);
    this.clocks.set(m, c);
    return c;
  }
  slowMachines(x, y, r) {
    const now = Date.now(), until = now + 10000 * this.power('slow');
    const w = this.dg.w, near = (i, j) => Math.hypot(i + 0.5 - x, j + 0.5 - y) <= r;
    let n = 0;
    for (const p of this.env.pistons || []) if (p.tiles.some(t => near(t % w, (t / w) | 0))) { this.slowUntil.set(p, until); n++; }
    for (const r2 of this.env.rotors || []) if (near(r2.i, r2.j)) { this.slowUntil.set(r2, until); n++; }
    for (const b of this.env.blades || []) if (near(b[0], b[1])) { this.slowUntil.set(b, until); n++; }
    if (n) { this.lv.emit({ t: 'gears', x, y }); this.lv.say('TARDUS: the machinery grinds down', 2); }
  }
  clockTick(now, alive) {
    const dg = this.dg, w = dg.w, walls = new Set(), warn = [], slowed = [];
    for (const p of this.env.pistons || []) {
      const c = this.clockOf(p, now, p.phase), [st] = this.beat(c, PISTON.period, PISTON.closed, PISTON.warn);
      if ((this.slowUntil.get(p) || 0) > now) slowed.push(...p.tiles);
      if (st === 'warn') warn.push(...p.tiles);
      if (st !== 'on') continue;
      // close, except on someone standing in the way (they are not crushed: that tile stays open this time)
      for (const t of p.tiles) if (dg.envWalls.has(t) || !this.occupied(t, 0.45)) walls.add(t);
    }
    for (const r of this.env.rotors || []) {
      const c = this.clockOf(r, now, r.phase * ROTOR_STEP), k = ((Math.floor(c / ROTOR_STEP) % 4) + 4) % 4, next = (k + 1) % 4;
      const soon = (c % ROTOR_STEP) > ROTOR_STEP - 0.7;
      if ((this.slowUntil.get(r) || 0) > now) slowed.push(r.j * w + r.i);
      for (const [i, j] of rotorArm(r, k)) { const t = j * w + i; if (dg.envWalls.has(t) || !this.occupied(t, 0.45)) walls.add(t); }
      if (soon) for (const [i, j] of rotorArm(r, next)) warn.push(j * w + i);
    }
    dg.envWalls = walls;
    this.warn = warn; this.slowed = slowed;
    this.bladesUp = [];
    for (const b of this.env.blades || []) {
      const [i, j] = b, idx = j * w + i, c = this.clockOf(b, now, b[2]), [st, n] = this.beat(c, BLADES.period, BLADES.up, BLADES.warn);
      if (st === 'warn') this.warn.push(idx);
      if (st !== 'on') continue;
      this.bladesUp.push(idx);
      for (const p of alive) {
        const key = 'b' + idx + ':' + n + ':' + p.id;
        if (Math.abs(p.x - (i + 0.5)) > 0.75 || Math.abs(p.y - (j + 0.5)) > 0.75 || this.hit.has(key)) continue;
        this.hit.set(key, true);
        this.hurtCaster(p, this.floorDamage(1), now, 'blades');
      }
    }
    if (this.hit.size > 400) this.hit.clear();
  }

  // ---- storm
  stormTick(now, alive) {
    const wd = this.wind;
    if (now >= wd.next) { // the wind turns
      wd.next = now + STORM.gust * 1000;
      wd.target = Math.random() * Math.PI * 2;
      this.lv.emit({ t: 'gust2' });
    }
    if (wd.target !== undefined) {
      let d = wd.target - wd.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      wd.a += Math.max(-1.5 * DT, Math.min(1.5 * DT, d));
    }
    wd.x = Math.cos(wd.a); wd.y = Math.sin(wd.a);
    for (const s of this.lv.spells) { // letters drift with the wind (homing spells steer back on course)
      if (s.removed || s.rune) continue;
      const sp = Math.hypot(s.vx, s.vy); if (!sp) continue;
      const push = STORM.push * (s.fromPlayer ? 1 : 0.8);
      s.vx += wd.x * push * DT; s.vy += wd.y * push * DT;
      const n = Math.hypot(s.vx, s.vy) || 1; s.vx = s.vx / n * sp; s.vy = s.vy / n * sp;
    }
    if (!alive.length || now < this.strikeAt) return;
    this.strikeAt = now + rnd(STORM.strikeMin, STORM.strikeMax) * 1000 / Math.max(1, Math.sqrt(alive.length));
    this.strike(pick(alive), STORM.strikeWarn);
  }
  /** Lightning: a circle glows around (near) the caster, then the bolt comes down on whoever is still in it. */
  strike(pl, warn, r = 1.1) {
    const dg = this.dg;
    let x = pl.x + rnd(-1.2, 1.2), y = pl.y + rnd(-1.2, 1.2);
    if (dg.airSolid(x, y)) { x = pl.x; y = pl.y; }
    this.lv.magic.mark('strike', x, y, warn, { r }, () => {
      const now = Date.now();
      this.lv.emit({ t: 'zap', x, y });
      for (const p of this.lv.alivePlayers) if (Math.hypot(p.x - x, p.y - y) <= r) this.hurtCaster(p, this.floorDamage(1.3), now, 'lightning');
      for (const e of this.lv.enemies) if (!e.removed && !e.isBoss && Math.hypot(e.x - x, e.y - y) <= r) e.stun(now, 1200, this.lv, 'stun');
    });
  }

  // ---- void
  voidTick(now, alive) {
    const dg = this.dg, w = dg.w;
    for (const p of alive) { // a bridge gives way a moment after someone steps on it
      const i = Math.floor(p.x), j = Math.floor(p.y), n = j * w + i;
      if (dg.tiles[n] === TILE.BRIDGE && !dg.envHoles.has(n) && !this.crumble.has(n)) { this.crumble.set(n, now + BRIDGE.hold * 1000); this.lv.emit({ t: 'creak', x: i + 0.5, y: j + 0.5 }); }
    }
    for (const [n, at] of this.crumble) {
      if (now < at) continue;
      this.crumble.delete(n);
      dg.envHoles.add(n); this.holes.set(n, now + BRIDGE.gone * 1000);
      this.lv.emit({ t: 'fallaway', x: n % w + 0.5, y: ((n / w) | 0) + 0.5 });
    }
    for (const [n, at] of this.holes) if (now >= at && !this.occupied(n, 0.2)) { this.holes.delete(n); dg.envHoles.delete(n); }
    for (const p of alive) { // standing over the void: fall, and climb back out where you last stood firm
      const n = Math.floor(p.y) * w + Math.floor(p.x);
      if (!dg.envHoles.has(n)) continue;
      const back = p.safe || dg.beside('up');
      this.lv.emit({ t: 'fall', x: p.x, y: p.y, id: p.id });
      p.x = back.x; p.y = back.y; p.knock = null;
      if (!p.immortal) { p.hp = Math.max(1, p.hp - Math.ceil(p.maxHp * 0.12)); p.hurt = 0.4; }
      this.lv.emit({ t: 'hurt', x: p.x, y: p.y, id: p.id, n: Math.ceil(p.maxHp * 0.12) });
      p.tell('You fall into the void... and claw your way back up.');
      this.onCasterHurt(p);
    }
    // gravity wells pull letters (and slowly, casters and enemies); enemy letters that reach the middle are crushed
    for (const [x, y] of this.env.wells || []) {
      for (const s of this.lv.spells) {
        if (s.removed || s.rune) continue;
        const vx = x - s.x, vy = y - s.y, d = Math.hypot(vx, vy);
        if (d > WELL.r) continue;
        if (d < 0.45 && !s.fromPlayer) { s.removed = true; this.lv.emit({ t: 'crush', x: s.x, y: s.y, l: s.letters }); continue; }
        if (s.fromPlayer && s.target) continue; // a spell with a target holds its course
        const sp = Math.hypot(s.vx, s.vy) || 1;
        s.vx += vx / d * 2.4 * DT * sp; s.vy += vy / d * 2.4 * DT * sp;
        const k = Math.hypot(s.vx, s.vy) || 1; s.vx = s.vx / k * sp; s.vy = s.vy / k * sp;
      }
      for (const a of [...alive, ...this.lv.enemies]) {
        const vx = x - a.x, vy = y - a.y, d = Math.hypot(vx, vy);
        if (d > WELL.r || d < 0.6 || a.isBoss) continue;
        a.moveBy(dg, vx / d * WELL.pull * DT, vy / d * WELL.pull * DT);
      }
    }
    // portals linking far rooms
    for (const pt of this.env.portals || []) {
      for (const e of [...alive, ...this.lv.enemies, ...this.lv.spells]) {
        if (e.removed || (e.portalAt || 0) > now) continue;
        for (const [a, b] of [[pt.a, pt.b], [pt.b, pt.a]]) {
          if (Math.hypot(e.x - a.x, e.y - a.y) > 0.45) continue;
          const sp = Math.hypot(e.vx || 0, e.vy || 0);
          e.x = b.x + (sp ? e.vx / sp * 0.6 : 0); e.y = b.y + (sp ? e.vy / sp * 0.6 : 0.6);
          e.portalAt = now + 1200;
          if (e.path !== undefined) e.path = null;
          this.lv.emit({ t: 'portal', x: a.x, y: a.y, x2: b.x, y2: b.y });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ challenge altars
  startChallenge(altar, pl) {
    const lv = this.lv, spec = altar.spec, r = spec.room, now = Date.now();
    const n = Math.min(3 + Math.floor(lv.floor / 4), 7), foes = [];
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = rnd(r.x + 1, r.x + r.w - 1), y = rnd(r.y + 1, r.y + r.h - 1);
        if (lv.dungeon.blocked(x, y, 0.32) || Math.hypot(x - altar.x, y - altar.y) < 1.5) continue;
        const e = lv.spawnGuard(x, y);
        if (e) { e.awake = true; e.fireCd = rnd(1.5, 3); foes.push(e); }
        break;
      }
    }
    altar.state = 'active';
    this.challenge = { altar, kind: spec.kind, by: pl, foes, until: spec.kind === 'timed' ? now + (25 + n * 5) * 1000 : 0 };
    lv.emit({ t: 'trial', x: altar.x, y: altar.y });
    lv.say(spec.kind === 'timed' ? `Challenge! Defeat the ${foes.length} guardians in ${25 + n * 5} seconds` : `Challenge! Defeat the ${foes.length} guardians without anyone in the room getting hit`, 4);
  }
  inChallengeRoom(a) {
    const r = this.challenge?.altar.spec.room;
    return r && a.x >= r.x - 0.5 && a.x <= r.x + r.w + 0.5 && a.y >= r.y - 0.5 && a.y <= r.y + r.h + 0.5;
  }
  /** A caster got hurt: a no-hit challenge in their room is lost. */
  onCasterHurt(pl) {
    const ch = this.challenge;
    if (ch && ch.kind === 'nohit' && this.inChallengeRoom(pl)) this.endChallenge(false, `${pl.name} was hit: the challenge is lost.`);
  }
  challengeTick(now) {
    const ch = this.challenge;
    if (!ch) return;
    if (ch.foes.every(e => e.removed)) return this.endChallenge(true);
    if (ch.until && now > ch.until) this.endChallenge(false, 'Time is up: the challenge is lost.');
  }
  endChallenge(won, why = '') {
    const ch = this.challenge, lv = this.lv, a = ch.altar;
    this.challenge = null;
    a.state = won ? 'won' : 'lost';
    if (!won) { lv.say(why + ' The guardians stay.', 3); lv.emit({ t: 'trialfail', x: a.x, y: a.y }); return; }
    const pl = lv.players.has(ch.by.id) ? ch.by : [...lv.players.values()][0];
    lv.emit({ t: 'trialwin', x: a.x, y: a.y });
    lv.say('Challenge won! The altar opens its treasure.', 3);
    if (!pl) return;
    for (let k = 0; k < 3; k++) lv.dropItem(lv.rollLoot(pl), a.x + (k - 1) * 0.7, a.y + 0.6);
    if (Math.random() < 0.5) lv.dropBook(a.x, a.y - 0.7, 3);
    lv.giveGold(pl, 15 * lv.floor);
  }

  // ------------------------------------------------------------------ what clients see
  /** An enemy as the casters on this floor see it: a blizzard hides names that are not close. */
  enemyView(e, snap) {
    if (this.lv.silent && !e.awake && !e.heard) snap.zz = true; // asleep on a silent floor
    if (this.blizzard && !e.isBoss && !snap.show) {
      const near = [...this.lv.players.values()].some(p => !p.dead && Math.hypot(p.x - e.x, p.y - e.y) < (p.is('lit') ? 7 : BLIZZARD.near));
      if (!near) snap.show = '?'.repeat(e.lock.word.length);
    }
    return snap;
  }
  /** A flying letter as casters see it: Ink Wraith letters are blots until one of them comes close. */
  spellView(s, snap) {
    if (s.ink && ![...this.lv.players.values()].some(p => Math.hypot(p.x - s.x, p.y - s.y) < 2.6)) snap.l = '?';
    return snap;
  }
  /** The moving parts of the floor, with every state (left out when there is nothing). */
  snapshot(now) {
    const dg = this.dg, out = {};
    if (dg.envWalls.size) out.w = [...dg.envWalls];
    if (dg.envHoles.size) out.h = [...dg.envHoles];
    if (this.crumble.size) out.cr = [...this.crumble.keys()];
    if (this.hot?.length) out.hot = this.hot;
    if (this.warm?.length) out.warm = this.warm;
    if (this.bladesUp?.length) out.up = this.bladesUp;
    if (this.warn?.length) out.warn = this.warn;
    if (this.slowed?.length) out.slow = this.slowed;
    if (this.id === 'storm') out.wind = [+this.wind.x.toFixed(2), +this.wind.y.toFixed(2)];
    if (this.blizzard) out.bliz = this.blizzard;
    const ch = this.challenge;
    if (ch) out.ch = { k: ch.kind, left: ch.foes.filter(e => !e.removed).length, t: ch.until ? Math.max(0, Math.ceil((ch.until - now) / 1000)) : 0 };
    return Object.keys(out).length ? out : null;
  }
}

/** The tiles a rotor's bar covers in orientation k (0 across, 1 one diagonal, 2 up and down, 3 the other diagonal). */
export function rotorArm(r, k) {
  const out = [];
  for (const d of [-2, -1, 1, 2]) {
    const [a, b] = [[d, 0], [d, d], [0, d], [d, -d]][k];
    out.push([r.i + a, r.j + b]);
  }
  return out;
}

export { BIOME_BY_ID };
