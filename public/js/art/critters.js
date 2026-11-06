// Sprites for the surface's critters: the zoo animals, the practice dummy, plus the fence and lamp post tiles.
import { TS, WALL_H, makeCanvas, sprite } from './canvas.js';

/** The Dashhound: a long, low dog. It only eats dashes. Faces right. */
const DASHHOUND = [
  '............KK....',
  '...........KbbK...',
  '..........KBBBBKK.',
  'K.........KBBEBBnK',
  'bK.KKKKKKKBBBBBBK.',
  '.bKBBBBBBBBBBBBK..',
  '..KBBBBBBBBBBBBK..',
  '..KBBBBBBBBBBBBK..',
  '..KKbKKKKKKKKbKK..',
  '...Kb.......Kb....',
];
/** The Dotted Owl: round, with pale dots on its chest. It only eats dots. */
const OWL = [
  '.KK....KK.',
  '.KoKKKKoK.',
  'KooooooooK',
  'KoWWooWWoK',
  'KoWKooKWoK',
  'KooooyoooK',
  'KoddooddoK',
  'KooddddooK',
  'KoddooddoK',
  '.KooooooK.',
  '..KyKKyK..',
];
/** The Hopper: a long-eared rabbit that eats a bit of everything. */
const HOPPER = [
  '.KK..KK...',
  '.KwK.KwK..',
  '.KpK.KpK..',
  '.KwK.KwK..',
  '.KwwKwwK..',
  'KwwwwwwwK.',
  'KwEwwwEwK.',
  'KwwwpwwwK.',
  '.KwwwwwK..',
  'KwwwwwwwKK',
  'KwwwwwwwwK',
  '.KKKKKKKK.',
];
/** A straw practice dummy on a post, with a target on its chest. */
const DUMMY = [
  '....KKKK....',
  '...KyyyyK...',
  '...KyKKyK...',
  '...KyyyyK...',
  '....KKKK....',
  'KKKKKbbKKKKK',
  'KyyyyyyyyyyK',
  'KKKKyyyyKKKK',
  '...KyrryK...',
  '...KrwwrK...',
  '...KyrryK...',
  '...KyyyyK...',
  '....KbbK....',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '...KKbbKK...',
  '..KbbbbbbK..',
];

const PAL = {
  dashhound: { K: '#1a1020', B: '#a0612f', b: '#6b3a1a', E: '#0b0910', n: '#0b0910' },
  owl: { K: '#1a1020', o: '#8d6e63', W: '#fff8e1', y: '#ffb300', d: '#efe1c6' },
  hopper: { K: '#1a1020', w: '#e8e2f4', p: '#f48fb1', E: '#311b92' },
  dummy: { K: '#3e2a1a', y: '#e0b95a', b: '#7a5230', r: '#c62828', w: '#fff8e1' },
};
const ROWS = { dashhound: DASHHOUND, owl: OWL, hopper: HOPPER, dummy: DUMMY };

const cache = {};
/** The sprite for a surface critter (a white flash while a spell hits it). */
export function critterSprite(kind, flash) {
  const key = kind + (flash ? '!' : '');
  if (!cache[key]) {
    const pal = flash ? Object.fromEntries(Object.entries(PAL[kind]).map(([k, v]) => [k, k === 'K' ? v : '#ffffff'])) : PAL[kind];
    cache[key] = sprite(ROWS[kind], pal);
  }
  return cache[key];
}

// ------------------------------------------------------------------ tiles

/**
 * A low wooden fence, drawn on a raised-block canvas (TS x TS + WALL_H). mask: which neighbours are fences
 * too (1 north, 2 east, 4 south, 8 west), so rails run toward them.
 */
const fenceCache = {};
export function fenceTile(mask) {
  if (fenceCache[mask]) return fenceCache[mask];
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  const base = WALL_H + 9;              // where the post meets the ground (the middle of the tile)
  const dark = '#3e2a1a', rail = '#a47148', lit = '#c99a6b', post = '#7a5230';
  const hrail = (x0, x1) => {
    for (const y of [base - 8, base - 4]) { g.fillStyle = dark; g.fillRect(x0, y - 1, x1 - x0, 4); g.fillStyle = lit; g.fillRect(x0, y, x1 - x0, 1); g.fillStyle = rail; g.fillRect(x0, y + 1, x1 - x0, 1); }
  };
  const vrail = (y0, y1) => { g.fillStyle = dark; g.fillRect(6, y0, 4, y1 - y0); g.fillStyle = rail; g.fillRect(7, y0, 2, y1 - y0); g.fillStyle = lit; g.fillRect(7, y0, 1, y1 - y0); };
  if (mask & 1) vrail(base - 10 - TS + 4, base - 6);
  if (mask & 4) vrail(base - 8, Math.min(TS + WALL_H, base - 8 + TS));
  if (mask & 8) hrail(0, 8);
  if (mask & 2) hrail(8, TS);
  // the post, with a little shadow on the ground
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(5, base, 7, 2);
  g.fillStyle = dark; g.fillRect(6, base - 11, 4, 12);
  g.fillStyle = post; g.fillRect(7, base - 10, 2, 10);
  g.fillStyle = lit; g.fillRect(7, base - 10, 2, 1);
  return (fenceCache[mask] = c);
}

/** A lamp post with a glowing lantern. */
export function lampTile() {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  const base = WALL_H + 10;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(5, base, 7, 2);
  g.fillStyle = '#1a1020'; g.fillRect(7, 6, 3, base - 5); g.fillRect(5, base - 1, 7, 2);
  g.fillStyle = '#4a4560'; g.fillRect(8, 7, 1, base - 7);
  // the lantern
  g.fillStyle = '#1a1020'; g.fillRect(4, 0, 9, 8);
  g.fillStyle = '#ffd54f'; g.fillRect(5, 2, 7, 5);
  g.fillStyle = '#fff59d'; g.fillRect(7, 3, 3, 3);
  g.fillStyle = '#4a4560'; g.fillRect(5, 1, 7, 1);
  return c;
}
