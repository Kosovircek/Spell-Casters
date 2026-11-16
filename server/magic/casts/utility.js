// Utility spells: mirror, echo (handled in Magic.cast), light, invisibility, drain, portals, clone and revive.

export const UTILITY = {
  mirror: {
    cast(m, c) { c.pl.setStatus('mirror', 5000 * c.power); m.room.emit({ t: 'buff', x: c.pl.x, y: c.pl.y, s: 'mirror' }); },
  },
  echo: { cast() {} }, // Magic.cast runs the last effect spell instead
  light: {
    cast(m, c) { c.pl.setStatus('lit', 25000 * c.power); m.room.emit({ t: 'buff', x: c.pl.x, y: c.pl.y, s: 'lit' }); },
  },
  invis: {
    cast(m, c) { c.pl.setStatus('invis', 5000); m.room.emit({ t: 'vanish', x: c.pl.x, y: c.pl.y }); },
  },
  drain: {
    cast: (m, c) => m.orb(c),
    land(m, c, x, y, foe) {
      if (!foe) return;
      const pl = c.pl;
      if (m.duel) { m.hurt(foe, 0, Math.round(8 * c.power), pl, 'drain'); const got = pl.heal(8 * c.power); m.room.emit({ t: 'drain', x: foe.x, y: foe.y, x2: pl.x, y2: pl.y, n: got }); return; }
      const before = foe.lock ? foe.lock.progress : 0, word = foe.lock?.word;
      m.hurt(foe, 2, 0, pl, 'drain');
      const taken = foe.removed ? 2 : Math.max(0, (foe.lock?.word === word ? foe.lock.progress - before : 2));
      const got = pl.heal(3 * Math.max(1, taken));
      m.room.emit({ t: 'drain', x: foe.x, y: foe.y, x2: pl.x, y2: pl.y, n: got });
    },
  },
  portal: {
    cast(m, c) {
      const { pl, dx, dy } = c, dg = m.room.dungeon;
      let b = null;
      for (let d = 8; d >= 2; d -= 0.5) { // the farthest spot in sight you could stand on
        const x = pl.x + dx * d, y = pl.y + dy * d;
        if (!dg.blocked(x, y, 0.3) && dg.los(pl.x, pl.y, x, y) && !dg.stairsAt(x, y)) { b = { x, y }; break; }
      }
      if (!b) return pl.tell('There is no room for a second portal that way.');
      for (const p of m.portals.filter(p => p.owner === pl)) p.until = 0; // one pair each
      m.portals.push({ a: { x: pl.x, y: pl.y }, b, owner: pl, until: Date.now() + 12000 });
      pl.portalAt = Date.now() + 900; // do not fall straight into the portal under your own feet
      m.room.emit({ t: 'portalopen', x: pl.x, y: pl.y, x2: b.x, y2: b.y, c: pl.color });
    },
  },
  phase: {
    /**
     * Walk a ray the way you aim: once it has passed through something you cannot stand on (a wall, lava, a chasm),
     * the first spot on the far side where a caster fits is where you appear.
     */
    cast(m, c) {
      const { pl, dx, dy } = c, dg = m.room.dungeon, R = pl.radius || 0.3;
      const reach = 8 * c.power;
      let crossed = false, to = null;
      for (let d = 0.25; d <= reach; d += 0.125) {
        const x = pl.x + dx * d, y = pl.y + dy * d;
        if (dg.solid(x, y)) { crossed = true; continue; }
        if (!crossed || dg.blocked(x, y, R) || dg.stairsAt(x, y)) continue;
        to = { x, y };
        for (let e = 0.125; e <= 0.5; e += 0.125) { // step a little further in, clear of the wall's edge
          const nx = x + dx * e, ny = y + dy * e;
          if (dg.blocked(nx, ny, R)) break;
          to = { x: nx, y: ny };
        }
        break;
      }
      if (!crossed) return pl.tell('PERMEO needs a wall (or a gap) in front of you to pass through.');
      if (!to) return pl.tell('There is no floor on the other side within reach.');
      m.room.emit({ t: 'phase', x: pl.x, y: pl.y, x2: to.x, y2: to.y, id: pl.id, c: pl.color });
      pl.x = to.x; pl.y = to.y;
      if (pl.vel) pl.vel = { x: 0, y: 0 };
      pl.safe = { x: to.x, y: to.y };
    },
  },
  clone: {
    cast(m, c) {
      const g = c.pl.magic; g.clone = 3; g.cloneUntil = Date.now() + 12000;
      m.room.emit({ t: 'buff', x: c.pl.x, y: c.pl.y, s: 'clone' });
    },
  },
  revive: {
    cast(m, c) {
      const pl = c.pl;
      if (m.duel) { const got = pl.heal(12); m.room.emit({ t: 'regen', x: pl.x, y: pl.y, n: got }); return; }
      const down = [...m.room.players.values()].filter(p => p.dead && p.distanceTo(pl) <= 6);
      if (down.length) {
        for (const p of down) {
          p.dead = false; p.hp = Math.max(1, Math.round(p.maxHp * 0.4));
          m.room.emit({ t: 'revive', x: p.x, y: p.y });
          p.tell(`${pl.name} calls you back with ANIMA!`);
        }
        m.room.say(`${pl.name} revives ${down.map(p => p.name).join(' and ')}!`, 2);
        return;
      }
      for (const p of m.allies(pl)) {
        if (p.distanceTo(pl) > 4) continue;
        const got = p.heal(p.maxHp * 0.25);
        if (got) m.room.emit({ t: 'regen', x: p.x, y: p.y, n: got });
      }
    },
  },
};
