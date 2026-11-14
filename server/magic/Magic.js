// The effect-spell engine of one room: a dungeon floor (Level) or the duel arena (DuelRoom).
//
// It casts effect spells (✦ + word + direction), and runs everything they leave behind:
//   zones    patches of floor or air: fire, ice, acid, poison, lava, storm, fog, thorns, void, gravity
//   minions  summons (Minion.js)
//   marks    something about to happen at a spot, shown first so it can be dodged (meteor, beam, web...)
//   walls    rune stones from MURUS and CAVEA (solid for walking and spells, see Dungeon.magicWalls)
//   portals  IANUA's linked pairs
// and the buffs and statuses on casters and enemies (Actor.status).
//
// Who is a foe depends on the room: in the dungeon a caster's foes are the enemies and "damage" takes letters off
// their names (enemies have no HP); in a duel the foe is the other caster and damage is HP. Each effect gives both
// numbers (see hurt), so one spell works in both places.
import { RUNE, SPELL_BY_WORD, SPELL_BY_ID } from './spellbook.js';
import { CASTS } from './casts/index.js';
import { RuneOrb } from './RuneOrb.js';
import { SPELL } from '../config.js';

let lastZone = 0;

export class Magic {
  /**
   * room provides: dungeon, spells, players, emit(), say(), and either enemies + chip() (a dungeon floor) or
   * opponentOf() + damage() + phase (the duel arena, isDuel). makeSpell() builds that room's kind of letter spell.
   */
  constructor(room) {
    this.room = room;
    this.duel = !!room.isDuel;
    this.reset();
  }
  /** Everything gone (a new duel round, a party wipe). */
  reset() {
    if (this.walls) for (const w of this.walls) for (const t of w.tiles) this.room.dungeon.magicWalls.delete(t);
    this.zones = []; this.minions = []; this.marks = []; this.walls = []; this.portals = [];
  }

  // ------------------------------------------------------------------ who is who
  /** The things this caster's effects hit. */
  foes(pl) {
    if (this.duel) { const o = this.room.opponentOf(pl); return o && !o.dead && this.room.phase === 'fight' ? [o] : []; }
    return this.room.enemies.filter(e => !e.removed && !e.intangible);
  }
  /** This caster and the teammates their healing reaches. */
  allies(pl) { return this.duel ? (pl.dead ? [] : [pl]) : [...this.room.players.values()].filter(p => !p.dead); }
  /** Spells flying at this caster: enemy letters in the dungeon, the foe's spells in a duel. */
  foeSpells(pl) { return this.room.spells.filter(s => !s.removed && (this.duel ? s.owner && s.owner !== pl : !s.fromPlayer)); }
  isFoeSpell(s, pl) { return !s.removed && (this.duel ? s.owner && s.owner !== pl : !s.fromPlayer); }
  makeSpell(owner, letters, dx, dy, target, from) { return this.room.makeSpell(owner, letters, dx, dy, target, from); }

  /**
   * Damage from an effect. letters: how many letters it takes off an enemy's name; hp: how much it hurts a caster
   * in a duel. Corroded targets (ROBIGO) take more. by = the caster; src = where it came from (for effects).
   */
  hurt(t, letters, hp, by, why = 'magic', src = null) {
    if (!t || t.removed || t.dead) return;
    const corroded = t.is && t.is('corrode');
    if (this.duel) {
      const dmg = Math.max(1, Math.round(hp * (corroded ? 1.5 : 1)));
      this.room.damage(t, dmg, by, Date.now(), why);
    } else {
      const n = letters + (corroded && letters > 0 ? 1 : 0);
      for (let k = 0; k < n && !t.removed; k++) this.room.chip(t, by, why);
    }
  }
  /** Put a status on a foe (bosses shrug off the movement ones faster). */
  status(t, name, ms, by) {
    if (!t || t.removed || t.dead) return;
    if (t.isBoss && ['root', 'stun', 'fear', 'confuse'].includes(name)) ms *= 0.5;
    t.setStatus(name, ms);
    this.room.emit({ t: 'status', x: t.x, y: t.y, s: name });
  }
  /** Shove a foe (or anything) toward (vx, vy) tiles per second for secs. Bosses barely move. */
  shove(t, vx, vy, secs) { const k = t.isBoss ? 0.25 : 1; t.shove(vx * k, vy * k, secs); }

  // ------------------------------------------------------------------ aiming
  /** The foe this caster most likely means: inside the aim cone, in sight, nearest. Returns { kind, id } or null. */
  aim(pl, dx, dy, range = SPELL.homingRange) {
    const f = this.pickFoe(pl, dx, dy, range);
    if (!f) return null;
    return this.duel ? { kind: 'player', id: f.id } : { kind: 'enemy', id: f.id };
  }
  pickFoe(pl, dx, dy, range = 9, cone = SPELL.homingCone) {
    let best = null, bestScore = Infinity;
    for (const f of this.foes(pl)) {
      if (f.concealed) continue;
      const vx = f.x - pl.x, vy = f.y - pl.y, d = Math.hypot(vx, vy);
      if (d > range || d < 0.01) continue;
      const cos = (vx * dx + vy * dy) / d;
      if (cos < cone || !this.room.dungeon.los(pl.x, pl.y, f.x, f.y)) continue;
      const score = d * (2 - cos);
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }
  /** The farthest open spot along a direction (stops before walls), at most `range` tiles away. */
  reach(x, y, dx, dy, range) {
    const dg = this.room.dungeon;
    let px = x, py = y;
    for (let d = 0.25; d <= range; d += 0.25) {
      const nx = x + dx * d, ny = y + dy * d;
      if (dg.airSolid(nx, ny)) break;
      px = nx; py = ny;
    }
    return { x: px, y: py };
  }
  /** Where a spell aimed this way comes down: on the foe in the cone, or as far as it gets. */
  spot(pl, dx, dy, range) {
    const f = this.pickFoe(pl, dx, dy, range);
    return f ? { x: f.x, y: f.y, foe: f } : this.reach(pl.x, pl.y, dx, dy, range);
  }

  // ------------------------------------------------------------------ casting
  /** Can this caster throw a letter spell? (Silence stops it; casting ends invisibility.) */
  letterCast(pl) {
    if (pl.silenced) { pl.tell('You are silenced: no spells for a moment.'); return false; }
    if (pl.is('invis')) { pl.clearStatus('invis'); this.room.emit({ t: 'unveil', x: pl.x, y: pl.y }); }
    return true;
  }
  /** GEMINI: is this spell cast twice? Uses one of the clone charges. */
  useClone(pl) {
    const g = pl.magic;
    if (!g.clone || g.cloneUntil < Date.now()) { g.clone = 0; return false; }
    g.clone--;
    return true;
  }

  /** ✦ + word + direction. word is what came after the rune. */
  cast(pl, word, dx, dy) {
    if (pl.dead) return;
    const len = Math.hypot(dx, dy); if (!len || !isFinite(len)) return;
    dx /= len; dy /= len;
    const sp = SPELL_BY_WORD[word], g = pl.magic, now = Date.now();
    const fizzle = (text) => { pl.tell(text); this.room.emit({ t: 'rfizzle', x: pl.x, y: pl.y, id: pl.id }); };
    if (!sp) return fizzle(word ? `${word} is not a spell you have ever heard of. The rune fizzles.` : 'A rune on its own does nothing: spell a word after it.');
    if (!g.knows(sp.id)) return fizzle(`You do not know ${sp.word}. Find its spellbook (a Spellbook of ${sp.book}) and study it.`);
    if (!this.duel && pl.level < sp.level) return fizzle(`${sp.word} needs level ${sp.level}. You know the words, but not yet the strength.`);
    if (!this.letterCast(pl)) return;
    let cost = sp.mana, again = null;
    const tide = !!this.room.runeTide; // a Rune Tide floor: effect spells are free and cool down twice as fast
    if (sp.id === 'echo') { // ITERUM: the last effect spell again, cooldown or not
      again = g.last && SPELL_BY_ID[g.last];
      if (!again) return fizzle('ITERUM echoes nothing: cast another effect spell first.');
      cost = 10 + Math.ceil(again.mana / 2);
    }
    const left = g.cooldownLeft(sp.id, now);
    if (left > 0) return fizzle(`${sp.word} is not ready yet (${Math.ceil(left / 1000)} s).`);
    if (tide) cost = 0;
    if (g.mana < cost) return fizzle(`Not enough mana for ${sp.word}: it needs ${cost}, you have ${Math.floor(g.mana)}.`);
    g.mana -= cost;
    g.cooldowns[sp.id] = now + sp.cd * 1000 * (tide ? 0.5 : 1);
    const run = again || sp;
    if (!again) g.last = sp.id;
    const twin = this.useClone(pl);
    this.room.emit({ t: 'rcast', x: pl.x, y: pl.y, c: pl.color, w: run.word, s: run.school, id: pl.id });
    this.run(pl, run, dx, dy);
    if (twin) { // GEMINI's twin, a little to the side
      const a = 0.3;
      this.run(pl, run, dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a));
    }
  }
  run(pl, sp, dx, dy) {
    const fx = CASTS[sp.id];
    if (!fx) return pl.tell(`${sp.word} has no effect yet.`);
    fx.cast(this, { pl, sp, dx, dy, now: Date.now(), power: this.room.spellPower ? this.room.spellPower(sp.id) : 1 }); // biomes weaken or strengthen some spells
  }

  // ------------------------------------------------------------------ the pieces effects are made of
  /** Throw a rune orb (see RuneOrb). Its spell's land() runs where it ends up. */
  orb(c, opts = {}) {
    const o = new RuneOrb(this, c, opts);
    this.room.spells.push(o);
    return o;
  }
  /** An orb came down: at a foe it touched, or where it stopped. */
  landed(o, x, y, foe) {
    const fx = CASTS[o.rune], c = { ...o.cast, power: o.power * (o.cast.power || 1) };
    this.room.emit({ t: 'rland', x, y, s: o.cast.sp.school, k: o.rune });
    if (o.onLand) o.onLand(x, y, foe, c);
    else if (fx?.land) fx.land(this, c, x, y, foe);
    this.room.env?.onLand(o.rune, x, y); // GRANDO cools lava, TARDUS slows machinery
  }
  /**
   * A zone on the floor. kind picks its behaviour in tickZone; r = radius in tiles, secs = how long.
   * opts: every (ms between ticks), letters / hp (what each tick does), tiles (lava), and anything else it needs.
   */
  zone(kind, x, y, r, secs, owner, opts = {}) {
    const now = Date.now();
    const z = { id: 'z' + ++lastZone, kind, x, y, r, owner, until: now + secs * 1000, nextAt: now + (opts.delay ?? 0), ...opts };
    this.zones.push(z);
    this.room.env?.onZone(kind, x, y, r); // GELU freezes water and cools lava, fire burns vines and melts ice
    return z;
  }
  /** Something about to happen: shown at once, fires after secs. */
  mark(kind, x, y, secs, extra, fire) {
    const now = Date.now();
    this.marks.push({ kind, x, y, at: now + secs * 1000, start: now, fire, ...extra });
  }
  /** Rune stones on these tiles for secs (tiles with someone standing on them are skipped). */
  raise(tiles, secs) {
    const dg = this.room.dungeon, w = dg.w, out = [];
    const bodies = [...this.room.players.values(), ...(this.room.enemies || []), ...this.minions];
    for (const [i, j] of tiles) {
      if (!dg.open(i, j)) continue;
      if (bodies.some(b => !b.removed && !b.dead && Math.abs(b.x - (i + 0.5)) < 0.5 + (b.radius || 0.3) && Math.abs(b.y - (j + 0.5)) < 0.5 + (b.radius || 0.3))) continue;
      const t = j * w + i;
      if (out.includes(t)) continue;
      out.push(t); dg.magicWalls.add(t);
    }
    if (out.length) this.walls.push({ tiles: out, until: Date.now() + secs * 1000 });
    return out.length;
  }
  summon(m) { this.minions.push(m); this.room.emit({ t: 'summon', x: m.x, y: m.y, k: m.kind, c: m.owner.color }); return m; }

  // ------------------------------------------------------------------ hooks for the room
  /** Enemies choose what to shoot at from the casters plus the summons that lure them (golems, decoys). */
  targetsFor(enemy, alive, now) {
    const lures = this.minions.filter(m => m.lure && !m.removed && m.distanceTo(enemy) < 8);
    return lures.length ? alive.concat(lures) : alive;
  }
  /**
   * A foe's spell is about to hit this caster. AEGIS throws it back: an enemy letter takes a letter off whoever
   * threw it; a duel spell turns around and flies at its caster. Returns true if it was reflected.
   */
  reflect(pl, s) {
    if (!pl.is('mirror')) return false;
    pl.clearStatus('mirror');
    this.room.emit({ t: 'mirror', x: pl.x, y: pl.y, l: s.letters });
    if (!this.duel) {
      s.removed = true;
      if (s.source && !s.source.removed) this.hurt(s.source, 1, 0, pl, 'mirror');
      return true;
    }
    const foe = s.owner;
    s.owner = pl; s.color = pl.color;
    s.vx = -s.vx; s.vy = -s.vy;
    s.target = foe && !foe.dead ? { kind: 'player', id: foe.id } : null;
    if (s.bent !== undefined) s.bent = 0;
    if (s.rune) { s.cast = { ...s.cast, pl, dx: -s.cast.dx, dy: -s.cast.dy }; }
    return true;
  }
  /** Duel soft aim: summons with a name count as targets, decoys draw every spell. */
  extraTargets(pl, letter) {
    return this.minions.filter(m => !m.removed && m.owner !== pl && ((m.lock && m.lock.next === letter) || m.kind === 'decoy'));
  }
  findMinion(id) { return this.minions.find(m => m.id === id && !m.removed); }

  // ------------------------------------------------------------------ every tick
  tick(now) {
    const room = this.room, dg = room.dungeon;
    // walls crumble
    for (const w of this.walls) if (now >= w.until) { for (const t of w.tiles) dg.magicWalls.delete(t); w.done = true; room.emit({ t: 'crumble', tiles: w.tiles }); }
    this.walls = this.walls.filter(w => !w.done);
    // marks go off
    for (const mk of this.marks) if (now >= mk.at) { mk.done = true; mk.fire(); }
    this.marks = this.marks.filter(m => !m.done);
    // summons
    for (const m of this.minions) if (!m.removed) m.update(now);
    this.hitSummons();
    this.minions = this.minions.filter(m => !m.removed);
    // zones
    for (const p of room.players.values()) { p.fogged = false; p.revealed = false; }
    for (const z of this.zones) {
      if (now >= z.until) { z.done = true; CASTS[z.kind]?.zoneEnd?.(this, z, now); continue; }
      const fx = CASTS[z.kind];
      if (fx?.zone) fx.zone(this, z, now);
    }
    this.zones = this.zones.filter(z => !z.done);
    this.lightUp(now);
    this.orbHits();
    this.portalsTick(now);
  }

  /** Rune orbs that touch a foe come down on it. */
  orbHits() {
    for (const o of this.room.spells) {
      if (!o.rune || o.removed) continue;
      for (const f of this.foes(o.owner)) {
        const r = this.duel ? 0.6 : (f.hitRadius || 0.55);
        if (Math.hypot(f.x - o.x, f.y - o.y) > r) continue;
        if (this.duel && this.reflect(f, o)) break; // AEGIS sends it back
        o.land(o.x, o.y, f);
        break;
      }
    }
  }
  /** Enemy letters (and a duel foe's spells) that run into summons. */
  hitSummons() {
    for (const m of this.minions) {
      if (m.removed || (!m.soak && !m.lock)) continue;
      for (const s of this.room.spells) {
        if (!this.isFoeSpell(s, m.owner) || Math.hypot(s.x - m.x, s.y - m.y) > (m.radius + 0.35)) continue;
        if (this.duel && s.rune) continue; // effect orbs fly past summons
        if (m.lock && this.duel) { // spell its name to break it
          s.removed = true;
          const r = m.lock.apply(s.letters);
          this.room.emit({ t: r === 'wrong' ? 'wrong' : 'hit', x: m.x, y: m.y });
          if (r === 'done') m.expire();
          else if (m.soak) m.soaked(s);
          break;
        }
        if (m.soaked(s)) { s.removed = true; break; }
      }
    }
  }
  /** LUX: a lit caster shows hidden foes near them. */
  lightUp(now) {
    const lit = [...this.room.players.values()].filter(p => !p.dead && p.is('lit', now));
    if (!lit.length) return;
    for (const p of this.room.players.values()) if (lit.some(l => l !== p && l.distanceTo(p) < 6)) p.revealed = true;
  }
  /** IANUA: casters, enemies, summons and spells that step into one portal come out of the other. */
  portalsTick(now) {
    this.portals = this.portals.filter(p => now < p.until);
    if (!this.portals.length) return;
    const room = this.room;
    const movers = [...room.players.values(), ...(room.enemies || []), ...this.minions, ...room.spells];
    for (const pt of this.portals) {
      for (const e of movers) {
        if (e.removed || e.dead || (e.portalAt || 0) > now) continue;
        for (const [a, b] of [[pt.a, pt.b], [pt.b, pt.a]]) {
          if (Math.hypot(e.x - a.x, e.y - a.y) > 0.45) continue;
          const sp = Math.hypot(e.vx || 0, e.vy || 0);
          e.x = b.x + (sp ? e.vx / sp * 0.5 : 0); e.y = b.y + (sp ? e.vy / sp * 0.5 : 0);
          e.portalAt = now + 900;
          if (e.path !== undefined) e.path = null;
          room.emit({ t: 'portal', x: a.x, y: a.y, x2: b.x, y2: b.y });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ for the clients
  snapshot(now) {
    if (!this.zones.length && !this.marks.length && !this.walls.length && !this.portals.length) return null;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      z: this.zones.map(z => ({
        id: z.id, k: z.kind, x: r2(z.x), y: r2(z.y), r: z.r, c: z.owner.color, pid: z.owner.id,
        t: Math.max(0, (z.until - now) / 1000).toFixed(1), ...(z.tiles ? { tiles: z.tiles } : {}),
      })),
      mk: this.marks.map(m => ({ k: m.kind, x: r2(m.x), y: r2(m.y), x2: m.x2 !== undefined ? r2(m.x2) : undefined, y2: m.y2 !== undefined ? r2(m.y2) : undefined, r: m.r, f: Math.min(1, (now - m.start) / (m.at - m.start)).toFixed(2) })),
      w: this.walls.flatMap(w => w.tiles),
      pt: this.portals.map(p => ({ x: r2(p.a.x), y: r2(p.a.y), x2: r2(p.b.x), y2: r2(p.b.y), c: p.owner.color, t: Math.ceil((p.until - now) / 1000) })),
    };
  }
  minionSnapshot(now) { return this.minions.map(m => m.snapshot(now)); }
}

export { RUNE };
