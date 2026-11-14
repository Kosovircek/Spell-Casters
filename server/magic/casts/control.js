// Control spells: walls, pulls and pushes, roots, fog, slow, silence, swaps, cages, gravity and confusion.
import { foesIn, swallow } from './elements.js';

const shuffle = (s) => { const a = [...s]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.join(''); };

export const CONTROL = {
  wall: {
    cast(m, c) {
      const { pl, dx, dy } = c, px = -dy, py = dx;
      const mid = m.reach(pl.x, pl.y, dx, dy, 2.5), tiles = [];
      for (let k = -2.5; k <= 2.5; k += 0.5) tiles.push([Math.floor(mid.x + px * k), Math.floor(mid.y + py * k)]);
      if (!m.raise(tiles, 6)) return pl.tell('There is no room for a wall there.');
      m.room.emit({ t: 'raise', x: mid.x, y: mid.y });
    },
  },
  pull: {
    cast: (m, c) => m.orb(c, { speed: m.duel ? 7 : 10 }),
    land(m, c, x, y, foe) {
      if (!foe) return;
      const pl = c.pl;
      if (foe.isBoss) return foe.stun(Date.now(), 600, m.room, 'stun');
      const d = Math.hypot(foe.x - pl.x, foe.y - pl.y) || 1, ux = (foe.x - pl.x) / d, uy = (foe.y - pl.y) / d;
      const tx = pl.x + ux * 1.2, ty = pl.y + uy * 1.2;
      foe.shove((tx - foe.x) / 0.3, (ty - foe.y) / 0.3, 0.3);
      m.room.emit({ t: 'yank', x: foe.x, y: foe.y, x2: pl.x, y2: pl.y, c: pl.color });
    },
  },
  push: {
    cast(m, c) {
      const { pl, dx, dy } = c;
      m.room.emit({ t: 'gust', x: pl.x, y: pl.y, dx, dy });
      const inCone = (x, y) => { const vx = x - pl.x, vy = y - pl.y, d = Math.hypot(vx, vy); return d <= 3.5 && d > 0.01 && (vx * dx + vy * dy) / d >= Math.cos(1.05); };
      for (const f of m.foes(pl)) if (inCone(f.x, f.y)) { const d = f.distanceTo(pl) || 1; m.shove(f, (f.x - pl.x) / d * 9, (f.y - pl.y) / d * 9, 0.35); }
      for (const s of m.foeSpells(pl)) if (inCone(s.x, s.y)) { // their letters turn around
        const sp = Math.hypot(s.vx, s.vy) || 1, d = Math.hypot(s.x - pl.x, s.y - pl.y) || 1;
        s.vx = (s.x - pl.x) / d * sp; s.vy = (s.y - pl.y) / d * sp; s.target = null;
        if (s.bent !== undefined) s.bent = 99;
      }
    },
  },
  root: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y, foe) => { if (foe) m.status(foe, 'root', (m.duel ? 1800 : 3000) * c.power, c.pl); },
  },
  fog: {
    cast: (m, c) => m.zone('fog', c.pl.x, c.pl.y, 2.5, 10, c.pl),
    zone(m, z) { for (const p of m.room.players.values()) if (Math.hypot(p.x - z.x, p.y - z.y) <= z.r) p.fogged = true; },
  },
  slow: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y, foe) => { if (foe) m.status(foe, 'slow', (m.duel ? 4000 : 5000) * c.power, c.pl); },
  },
  silence: {
    cast: (m, c) => m.orb(c),
    land: (m, c, x, y, foe) => { if (foe) { m.status(foe, 'silence', (m.duel ? 2500 : 5000) * c.power, c.pl); if (m.duel) foe.send({ t: 'drop' }); } },
  },
  swap: {
    cast: (m, c) => m.orb(c, { speed: m.duel ? 7 : 10 }),
    land(m, c, x, y, foe) {
      if (!foe) return;
      const pl = c.pl, ax = pl.x, ay = pl.y;
      m.room.emit({ t: 'swap', x: ax, y: ay, x2: foe.x, y2: foe.y });
      pl.x = foe.x; pl.y = foe.y; foe.x = ax; foe.y = ay;
      if (foe.path !== undefined) foe.path = null;
    },
  },
  cage: {
    cast: (m, c) => m.orb(c),
    land(m, c, x, y, foe) {
      const cx = Math.floor(foe ? foe.x : x), cy = Math.floor(foe ? foe.y : y), tiles = [];
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.max(Math.abs(i), Math.abs(j)) === 2) tiles.push([cx + i, cy + j]);
      if (m.raise(tiles, 4 * Math.max(0.5, c.power))) m.room.emit({ t: 'raise', x: cx + 0.5, y: cy + 0.5 });
    },
  },
  gravity: {
    cast: (m, c) => m.orb(c, { range: m.duel ? 7 : 6 }),
    land: (m, c, x, y) => m.zone('gravity', x, y, 4, 6 * c.power, c.pl),
    zone: (m, z) => swallow(m, z, 14),
  },
  scramble: {
    cast: (m, c) => m.orb(c),
    land(m, c, x, y, foe) {
      if (!foe) return;
      if (m.duel) { foe.send({ t: 'scramble' }); m.status(foe, 'confuse', 1500 * c.power, c.pl); return; }
      m.status(foe, 'confuse', 4000 * c.power, c.pl);
    },
  },
};
export { foesIn, shuffle };
