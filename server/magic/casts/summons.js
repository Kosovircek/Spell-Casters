// Summon spells: each calls one or more helpers (see ../Minion.js) next to the caster or where it is aimed.
import { Imp, Wolf, Bat, Skull, Golem, Spider, Ghost, Totem, Decoy, Wisp, Drake } from '../Minion.js';

/** A free spot near (x, y) for something that walks. */
function near(m, x, y, r = 0.9) {
  const dg = m.room.dungeon;
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2, d = k ? r : 0;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (!dg.blocked(px, py, 0.3)) return { x: px, y: py };
  }
  return { x, y };
}

export const SUMMONS = {
  imp: {
    cast(m, c) { for (let k = 0; k < 2; k++) { const p = near(m, c.pl.x + c.dx, c.pl.y + c.dy); m.summon(new Imp(m, c.pl, p.x, p.y)); } },
  },
  wolf: {
    cast(m, c) {
      for (const w of m.minions.filter(x => x.kind === 'wolf' && x.owner === c.pl)) w.expire(); // one wolf at a time
      const p = near(m, c.pl.x + c.dx, c.pl.y + c.dy); m.summon(new Wolf(m, c.pl, p.x, p.y));
    },
  },
  bat: {
    cast(m, c) { for (let k = 0; k < 4; k++) m.summon(new Bat(m, c.pl, c.pl.x, c.pl.y - 0.3, k)); },
  },
  skull: {
    cast(m, c) { const at = m.reach(c.pl.x, c.pl.y, c.dx, c.dy, 1.2); m.summon(new Skull(m, c.pl, at.x, at.y)); },
  },
  golem: {
    cast(m, c) {
      for (const g of m.minions.filter(x => x.kind === 'golem' && x.owner === c.pl)) g.expire();
      const at = m.reach(c.pl.x, c.pl.y, c.dx, c.dy, 1.6), p = near(m, at.x, at.y, 0.5);
      m.summon(new Golem(m, c.pl, p.x, p.y));
    },
  },
  spider: {
    cast(m, c) { const p = near(m, c.pl.x + c.dx * 0.8, c.pl.y + c.dy * 0.8); m.summon(new Spider(m, c.pl, p.x, p.y)); },
  },
  ghost: {
    cast(m, c) { m.summon(new Ghost(m, c.pl, c.pl.x + c.dx * 0.6, c.pl.y + c.dy * 0.6)); },
  },
  totem: {
    cast(m, c) { const p = near(m, c.pl.x + c.dx * 0.7, c.pl.y + c.dy * 0.7, 0.4); m.summon(new Totem(m, c.pl, p.x, p.y)); },
  },
  decoy: {
    cast(m, c) { m.summon(new Decoy(m, c.pl, c.pl.x, c.pl.y, c.dx, c.dy)); },
  },
  swarm: {
    cast(m, c) {
      const foes = m.foes(c.pl).filter(f => f.distanceTo(c.pl) < 12).sort((a, b) => a.distanceTo(c.pl) - b.distanceTo(c.pl));
      for (let k = 0; k < 7; k++) {
        const a = Math.atan2(c.dy, c.dx) + (k - 3) * 0.25;
        m.summon(new Wisp(m, c.pl, c.pl.x + Math.cos(a) * 0.5, c.pl.y + Math.sin(a) * 0.5, foes.length ? foes[k % Math.min(3, foes.length)] : null));
      }
    },
  },
  drake: {
    cast(m, c) {
      for (const d of m.minions.filter(x => x.kind === 'drake' && x.owner === c.pl)) d.expire();
      m.summon(new Drake(m, c.pl, c.pl.x - 0.9, c.pl.y - 1.1));
    },
  },
};
