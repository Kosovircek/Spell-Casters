// Low-level canvas helpers shared by all art modules.
export const TS = 16;      // tile size in pixels
export const WALL_H = 12;  // height of a wall's front face

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Deterministic 0..1 noise for a grid position (used to vary tiles). */
export function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }

/** Darken or lighten a #rrggbb colour by factor f. */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round((n >> 16 & 255) * f)), g = Math.min(255, Math.round((n >> 8 & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Build a sprite canvas from rows of palette characters ('.' = transparent). */
export function sprite(rows, pal) {
  const h = rows.length, w = rows[0].length; const c = makeCanvas(w, h); const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = pal[rows[y][x]]; if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } }
  return c;
}
