// Element spells: fire, ice, lightning, earth, stars, acid, light, thorns, poison, storms, lava, hail and the void.
// Each entry: cast(m, c) when it is cast; land(m, c, x, y, foe) where its orb comes down; zone(m, z, now) every tick
// while a zone of that kind is on the floor. m = the room's Magic, c = { pl, sp, dx, dy, power }.
// m.hurt(target, letters, hp, ...) takes letters in the dungeon and HP in a duel.

/** Foes standing in a zone: inside its circle, or on one of its tiles (lava). */
export function foesIn(m, z, pad = 0) {
  return m.foes(z.owner).filter(f => z.tiles
    ? z.tiles.includes(Math.floor(f.y) * m.room.dungeon.w + Math.floor(f.x))
    : Math.hypot(f.x - z.x, f.y - z.y) <= z.r + pad);
}
/** A zone that hurts whoever stands in it every so often. */
function burnZone(m, z, now, letters, hp, every) {
  if (now < z.nextAt) return;
  z.nextAt = now + (z.every || (m.duel ? every[1] : every[0]));
  for (const f of foesIn(m, z)) m.hurt(f, z.letters ?? letters, z.hp ?? hp, z.owner, z.kind);
}
const rot = (dx, dy, a) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];

const FOREVER = 24 * 3600; // seconds: 'permanent' (SPINA's traps in the dungeon)

export const ELEMENTS = {
  fire: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y) => m.zone('fire', x, y, 1.3, 5 * c.power, c.pl),
    zone: (m, z, now) => burnZone(m, z, now, 1, 3, [1000, 500]),
  },
  ice: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y) => m.zone('ice', x, y, 1.6, 6 * c.power, c.pl),
    zone(m, z) {
      for (const f of foesIn(m, z)) f.setStatus('chill', 300);
      for (const s of m.foeSpells(z.owner)) if (Math.hypot(s.x - z.x, s.y - z.y) <= z.r) s.chilled = true;
    },
  },
  bolt: {
    cast: (m, c) => m.orb(c, { speed: m.duel ? 9 : 14, turn: m.duel ? 0.4 : 6 }),
    land(m, c, x, y, foe) {
      if (!foe) return;
      const env = m.room.env, wet = !m.duel && env && env.inWater(foe);
      m.hurt(foe, wet ? 2 : 1, Math.round(8 * c.power), c.pl, 'bolt');
      if (m.duel) return m.status(foe, 'stun', 300, c.pl);
      if (wet) { // the Flooded Crypt: the bolt runs through the water to everyone standing in it, twice as hard
        m.room.emit({ t: 'shock', x: foe.x, y: foe.y });
        for (const e of m.foes(c.pl)) {
          if (e === foe || !env.inWater(e) || e.distanceTo(foe) > 8) continue;
          m.room.emit({ t: 'chain', x: foe.x, y: foe.y, x2: e.x, y2: e.y });
          m.hurt(e, 2, 0, c.pl, 'bolt');
        }
        return;
      }
      let from = foe; const hit = new Set([foe]);
      for (let k = 0; k < 2; k++) { // jumps to two more enemies nearby
        const next = m.foes(c.pl).filter(e => !hit.has(e) && e.distanceTo(from) <= 5 && m.room.dungeon.los(from.x, from.y, e.x, e.y))
          .sort((a, b) => a.distanceTo(from) - b.distanceTo(from))[0];
        if (!next) break;
        m.room.emit({ t: 'chain', x: from.x, y: from.y, x2: next.x, y2: next.y });
        m.hurt(next, 1, 0, c.pl, 'bolt'); hit.add(next); from = next;
      }
    },
  },
  quake: {
    cast(m, c) {
      const { pl, dx, dy } = c;
      m.room.emit({ t: 'quake', x: pl.x, y: pl.y, dx, dy });
      for (const f of m.foes(pl)) {
        const vx = f.x - pl.x, vy = f.y - pl.y, d = Math.hypot(vx, vy);
        if (d > 4.5 || d < 0.01 || (vx * dx + vy * dy) / d < Math.cos(0.95) || !m.room.dungeon.los(pl.x, pl.y, f.x, f.y)) continue;
        m.hurt(f, 1, 6, pl, 'quake');
        if (m.duel) m.status(f, 'stun', 1000, pl);
        else f.stun(Date.now(), f.isBoss ? 1000 : 2000, m.room, 'stun');
      }
    },
  },
  meteor: {
    cast(m, c) {
      const at = m.spot(c.pl, c.dx, c.dy, 9);
      const x = at.x, y = at.y;
      m.mark('meteor', x, y, 1.6, { r: 2 }, () => {
        m.room.emit({ t: 'meteor', x, y });
        for (const f of m.foes(c.pl)) if (Math.hypot(f.x - x, f.y - y) <= 2) m.hurt(f, 3, 20, c.pl, 'meteor');
        m.zone('fire', x, y, 1.3, 3, c.pl);
      });
    },
  },
  acid: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y) => m.zone('acid', x, y, 1.5, 7 * c.power, c.pl),
    zone(m, z) { for (const f of foesIn(m, z)) f.setStatus('corrode', 5000); },
  },
  nova: {
    cast(m, c) {
      const { pl } = c;
      m.room.emit({ t: 'nova', x: pl.x, y: pl.y, c: pl.color });
      for (const f of m.foes(pl)) {
        const vx = f.x - pl.x, vy = f.y - pl.y, d = Math.hypot(vx, vy);
        if (d > 3) continue;
        m.hurt(f, 1, 6, pl, 'nova');
        m.shove(f, vx / (d || 1) * 7, vy / (d || 1) * 7, 0.35);
      }
      for (const s of m.foeSpells(pl)) if (Math.hypot(s.x - pl.x, s.y - pl.y) <= 3) { s.removed = true; m.room.emit({ t: 'fizzle', x: s.x, y: s.y }); }
    },
  },
  beam: {
    cast(m, c) {
      const { pl, dx, dy } = c, end = m.reach(pl.x, pl.y, dx, dy, 14);
      const x = pl.x, y = pl.y;
      m.mark('beam', x, y, 0.45, { x2: end.x, y2: end.y }, () => {
        m.room.emit({ t: 'beam', x, y, x2: end.x, y2: end.y, c: pl.color });
        const lx = end.x - x, ly = end.y - y, L2 = lx * lx + ly * ly || 1;
        for (const f of m.foes(pl)) {
          const t = Math.max(0, Math.min(1, ((f.x - x) * lx + (f.y - y) * ly) / L2));
          if (Math.hypot(f.x - (x + lx * t), f.y - (y + ly * t)) <= 0.6) m.hurt(f, 2, 14, pl, 'beam');
        }
      });
    },
  },
  thorn: {
    cast: (m, c) => m.orb(c, { range: m.duel ? 9 : 6 }),
    land(m, c, x, y, foe) {
      const mine = m.zones.filter(z => z.kind === 'thorn' && z.owner === c.pl);
      if (mine.length >= 3) mine[0].until = 0; // only three traps at a time: the oldest goes
      if (foe) { x = foe.x; y = foe.y; }
      m.zone('thorn', x, y, 0.7, m.duel ? 30 : FOREVER, c.pl, { delay: foe ? 0 : 400, fixed: true }); // in the dungeon a trap waits until something steps on it
    },
    zone(m, z, now) {
      if (now < z.nextAt) return;
      const f = foesIn(m, z)[0];
      if (!f) return;
      z.done = true; z.until = 0;
      m.room.emit({ t: 'spike', x: z.x, y: z.y });
      m.hurt(f, 1, 6, z.owner, 'thorn');
      m.status(f, 'root', m.duel ? 1500 : 2500, z.owner);
    },
  },
  poison: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y) => m.zone('poison', x, y, 2.2, 8 * c.power, c.pl, { delay: 600 }),
    zone: (m, z, now) => burnZone(m, z, now, 1, 2, [2000, 500]),
  },
  storm: {
    cast(m, c) {
      const at = m.spot(c.pl, c.dx, c.dy, 8);
      m.zone('storm', at.x, at.y, 3.5, 6, c.pl, { delay: 500 });
    },
    zone(m, z, now) {
      if (now < z.nextAt) return;
      z.nextAt = now + (m.duel ? 650 : 700);
      const inside = foesIn(m, z);
      if (m.duel) { // each strike flashes on the ground first: step away
        const f = inside[0];
        const x = f ? f.x + (Math.random() - 0.5) * 0.6 : z.x + (Math.random() - 0.5) * z.r * 1.6;
        const y = f ? f.y + (Math.random() - 0.5) * 0.6 : z.y + (Math.random() - 0.5) * z.r * 1.6;
        m.mark('strike', x, y, 0.4, { r: 0.8 }, () => {
          m.room.emit({ t: 'zap', x, y });
          for (const g of m.foes(z.owner)) if (Math.hypot(g.x - x, g.y - y) <= 0.8) m.hurt(g, 1, 6, z.owner, 'storm');
        });
        return;
      }
      const f = inside[Math.floor(Math.random() * inside.length)];
      if (!f) { const a = Math.random() * Math.PI * 2, r = Math.random() * z.r; m.room.emit({ t: 'zap', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r }); return; }
      m.room.emit({ t: 'zap', x: f.x, y: f.y });
      m.hurt(f, 1, 6, z.owner, 'storm');
      f.stun?.(now, 400, m.room, 'stun');
    },
  },
  lava: {
    cast(m, c) {
      const { pl, dx, dy } = c, dg = m.room.dungeon, tiles = new Set();
      const px = -dy, py = dx;
      for (let d = 1; d <= 7.5; d += 0.5) {
        const cx = pl.x + dx * d, cy = pl.y + dy * d;
        if (dg.airSolid(cx, cy)) break;
        for (const o of [-0.5, 0.5]) {
          const i = Math.floor(cx + px * o), j = Math.floor(cy + py * o);
          if (dg.open(i, j)) tiles.add(j * dg.w + i);
        }
      }
      if (!tiles.size) return pl.tell('There is no floor in front of you for the lava to flow on.');
      m.zone('lava', pl.x + dx * 4, pl.y + dy * 4, 4, 8, pl, { tiles: [...tiles] });
    },
    zone: (m, z, now) => burnZone(m, z, now, 1, 4, [800, 500]),
  },
  shard: {
    cast(m, c) {
      for (const a of [-0.44, -0.22, 0, 0.22, 0.44]) {
        const [dx, dy] = rot(c.dx, c.dy, a);
        m.orb({ ...c, dx, dy }, { letters: '*', speed: m.duel ? 7 : 10, range: 7, turn: 0, target: null,
          land: (x, y, foe) => { if (foe) { m.hurt(foe, 1, 4, c.pl, 'shard'); m.status(foe, 'slow', 2000, c.pl); } } });
      }
    },
  },
  void: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y) => m.zone('void', x, y, 3.5, 3, c.pl, { power: c.power, fixed: true }),
    zone(m, z) {
      for (const f of m.foes(z.owner)) { // drag foes in
        const vx = z.x - f.x, vy = z.y - f.y, d = Math.hypot(vx, vy);
        if (d > z.r || d < 0.3) continue;
        m.shove(f, vx / d * 2.6, vy / d * 2.6, 0.1);
      }
      swallow(m, z, 9);
    },
    zoneEnd(m, z) {
      m.room.emit({ t: 'collapse', x: z.x, y: z.y });
      for (const f of m.foes(z.owner)) if (Math.hypot(f.x - z.x, f.y - z.y) <= 1.6) m.hurt(f, 2, Math.round(14 * (z.power || 1)), z.owner, 'void');
    },
  },
};

/** Bend foe spells near a zone's middle toward it, and crush the ones that reach it (CHAOS, PONDUS). */
export function swallow(m, z, pull) {
  for (const s of m.foeSpells(z.owner)) {
    const vx = z.x - s.x, vy = z.y - s.y, d = Math.hypot(vx, vy);
    if (d > z.r) continue;
    if (d < 0.5) { s.removed = true; m.room.emit({ t: 'crush', x: s.x, y: s.y, l: s.letters }); continue; }
    const sp = Math.hypot(s.vx, s.vy) || 1;
    s.vx += vx / d * pull * 0.05; s.vy += vy / d * pull * 0.05;
    const n = Math.hypot(s.vx, s.vy) || 1;
    s.vx = s.vx / n * sp; s.vy = s.vy / n * sp;
    if (s.target) s.target = null; // it no longer homes on anything
    if (s.bent !== undefined) s.bent = 99;
  }
}
