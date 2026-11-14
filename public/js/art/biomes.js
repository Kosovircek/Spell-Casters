// Tiles for the ten biomes: every biome has its own floor and walls (a palette and a pattern), and the special
// ground of each one (water, lava, ice, vines, the void...). Built once, the first time a biome is drawn.
// Tile codes are the server's (server/Dungeon.js TILE).
import { TS, WALL_H, makeCanvas, hash, shade } from './canvas.js';

export const T = {
  WALL: 0, FLOOR: 1, SHALLOW: 14, DEEP: 15, LAVA: 16, ROCK: 17, VENT: 18, ICE: 19, ICEWALL: 20, VINE: 21, ASH: 22,
  RUNEDOOR: 23, SLOT: 24, CHASM: 25, BRIDGE: 26, BLADES: 27,
};

/**
 * floor: base colours [dark, mid, light, seam] and a pattern; wall: top [dark, speck], front [brick, mortar, light,
 * rim] and a pattern for the front face.
 */
const PAL = {
  crypt:     { floor: ['#1f2b2c', '#2b3a3b', '#3a4d4c', '#1a2324'], fp: 'wet',     wall: ['#1b2626', '#25393a', '#2f4546', '#162020', '#3e5a5a', '#6f9a94'], wp: 'moss' },
  forge:     { floor: ['#2a1d1a', '#3a2723', '#4a3229', '#211613'], fp: 'cracks',  wall: ['#1a1212', '#2a1a18', '#2d1f1d', '#171010', '#3e2a26', '#c25a2a'], wp: 'magma' },
  frozen:    { floor: ['#5c7488', '#6f8aa0', '#86a3b8', '#4d6375'], fp: 'frost',   wall: ['#c8dbe8', '#e8f4fb', '#7f9fb8', '#58758c', '#a9c4d6', '#ffffff'], wp: 'snow' },
  catacombs: { floor: ['#221d1a', '#2d2723', '#3a322c', '#1a1613'], fp: 'bones',   wall: ['#1c1714', '#28211c', '#3a302a', '#201a16', '#4a3e35', '#7a6a5a'], wp: 'skulls' },
  ruins:     { floor: ['#2e3524', '#3b452e', '#4c5838', '#252b1d'], fp: 'moss',    wall: ['#28301f', '#344027', '#4d5340', '#2f3328', '#61684f', '#8a9a6a'], wp: 'overgrown' },
  library:   { floor: ['#3e2a1c', '#4f3523', '#60422c', '#2e1f15'], fp: 'planks',  wall: ['#2b1c13', '#3a271a', '#4a2f1d', '#2a1a10', '#6b4628', '#a07850'], wp: 'shelves' },
  clockwork: { floor: ['#3c3324', '#4d4230', '#6b5a3a', '#2c2519'], fp: 'plates',  wall: ['#2a2622', '#3a342e', '#55493b', '#2b241d', '#7a6a50', '#d4b46a'], wp: 'gears' },
  mirror:    { floor: ['#1d2236', '#2a3150', '#3b4570', '#151a2a'], fp: 'checker', wall: ['#8fa3bf', '#c9d6e8', '#9eb2cc', '#6c7f9a', '#e4ecf7', '#ffffff'], wp: 'glass' },
  storm:     { floor: ['#2e343d', '#3a424d', '#4b5563', '#252a31'], fp: 'slate',   wall: ['#262b33', '#323944', '#454e5c', '#2a3038', '#5d6878', '#b0bec5'], wp: 'rods' },
  void:      { floor: ['#1a1328', '#241a38', '#33264f', '#140f20'], fp: 'stars',   wall: ['#150f22', '#21183a', '#2e2150', '#180f28', '#4a3a7a', '#b388ff'], wp: 'crystal' },
};

function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }

/** A floor tile of a biome (variant 0-3). */
function floorTile(pal, pattern, v) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d'), [dk, mid, lt, seam] = pal;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = hash(x + v * 50 + 7, y + v * 31 + 3);
    let col = n < 0.12 ? dk : n > 0.92 ? lt : mid;
    if (pattern === 'planks') { // long boards
      if (y % 4 === 3) col = seam; else if ((x + (Math.floor(y / 4) * 5 + v * 3)) % 16 === 0) col = seam; else if (n > 0.85) col = lt;
    } else if (pattern === 'plates') { // brass plates with rivets
      if (x % 8 === 0 || y % 8 === 0) col = seam;
      if ((x % 8 === 2 || x % 8 === 6) && (y % 8 === 2 || y % 8 === 6) && (x + y + v) % 3 === 0) col = lt;
    } else if (pattern === 'checker') { // polished glass squares
      col = ((x >> 3) + (y >> 3) + v) % 2 ? mid : dk;
      if (x % 8 === 0 || y % 8 === 0) col = seam;
      if ((x - y + 16) % 16 === 3 && n > 0.4) col = lt; // a glint
    } else { // stone slabs, two per tile, offset per variant
      const seamX = (x + (y < 8 ? v * 3 : v * 3 + 8)) % 16 === 0;
      if (y === 0 || y === 8 || seamX) col = seam;
    }
    px(g, x, y, col);
  }
  // decorations per pattern
  const r = (k) => hash(k * 13 + v * 7, k * 3 + v * 11);
  if (pattern === 'wet') for (let k = 0; k < 2; k++) { const x = Math.floor(r(k) * 12) + 2, y = Math.floor(r(k + 5) * 12) + 2; g.fillStyle = '#3d6168'; g.fillRect(x, y, 3, 1); g.fillStyle = '#6fa3a8'; g.fillRect(x + 1, y, 1, 1); }
  if (pattern === 'cracks') { g.fillStyle = '#7a2a12'; let x = Math.floor(r(1) * 10) + 3, y = 2; for (let k = 0; k < 9; k++) { g.fillRect(x, y, 1, 1); y++; x += r(k + 9) < 0.33 ? -1 : r(k + 9) > 0.66 ? 1 : 0; } if (v === 2) { g.fillStyle = '#d4521f'; g.fillRect(x, y - 3, 1, 2); } }
  if (pattern === 'frost') for (let k = 0; k < 4; k++) px(g, Math.floor(r(k) * 16), Math.floor(r(k + 3) * 16), '#dcecf6');
  if (pattern === 'bones' && v % 2 === 0) { const x = Math.floor(r(2) * 9) + 3, y = Math.floor(r(4) * 9) + 4; g.fillStyle = '#b8ad96'; g.fillRect(x, y, 4, 1); g.fillRect(x - 1, y - 1, 1, 3); g.fillRect(x + 4, y - 1, 1, 3); }
  if (pattern === 'bones' && v === 3) { g.fillStyle = '#c9bfa8'; g.fillRect(6, 6, 3, 3); g.fillStyle = '#1a1613'; px(g, 6, 7, '#1a1613'); px(g, 8, 7, '#1a1613'); }
  if (pattern === 'moss') for (let k = 0; k < 6; k++) { const x = Math.floor(r(k) * 15), y = Math.floor(r(k + 2) * 15); g.fillStyle = k % 2 ? '#5f7d33' : '#4a6629'; g.fillRect(x, y, 2, 1); }
  if (pattern === 'slate') for (let k = 0; k < 3; k++) px(g, Math.floor(r(k) * 16), Math.floor(r(k + 4) * 16), '#6a7a8c'); // rain glints
  if (pattern === 'stars') for (let k = 0; k < 3; k++) px(g, Math.floor(r(k) * 16), Math.floor(r(k + 6) * 16), k ? '#7e57c2' : '#e1bee7');
  return c;
}

/** A wall block of a biome: its top, and the front face in the biome's style. */
function wallTile(pal, pattern, v) {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  const [top, speck, brick, mortar, light, rim] = pal;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(g, x, y, hash(x + v * 13, y + 99) > 0.9 ? speck : top);
  for (let y = 0; y < WALL_H; y++) for (let x = 0; x < TS; x++) {
    const row = Math.floor(y / 4), bx = x + (row % 2) * 4;
    let col = brick;
    if (y % 4 === 3 || bx % 8 === 0) col = mortar; else if (y % 4 === 0) col = light;
    if (hash(x + v * 7, y) > 0.94) col = shade(col, 1.2);
    if (pattern === 'glass') { col = (x + y * 2 + v * 5) % 11 < 2 ? rim : y < 2 ? light : brick; if (x === 0 || x === TS - 1) col = mortar; }
    if (pattern === 'crystal') col = (x * 3 + y + v * 4) % 9 === 0 ? rim : y % 6 === 5 ? mortar : (x + y) % 5 === 0 ? light : brick;
    if (y === 0) col = rim;
    px(g, x, TS + y, col);
  }
  const y0 = TS;
  if (pattern === 'moss') { g.fillStyle = '#3f6b4a'; for (let x = 0; x < TS; x++) if (hash(x, v + 40) > 0.55) g.fillRect(x, y0 + 1, 1, 1 + Math.floor(hash(x, v) * 4)); g.fillStyle = '#5ea36a'; g.fillRect(3 + v * 3, y0 + 2, 1, 2); }
  if (pattern === 'magma') { g.fillStyle = '#ff6d00'; let x = 4 + v * 3; for (let y = 2; y < WALL_H - 1; y++) { g.fillRect(x, y0 + y, 1, 1); x += hash(y, v) > 0.5 ? 1 : -1; } }
  if (pattern === 'snow') { g.fillStyle = '#ffffff'; g.fillRect(0, y0, TS, 2); for (let x = 1; x < TS; x += 3) g.fillRect(x, y0 + 2, 1, 1 + Math.floor(hash(x, v) * 3)); }
  if (pattern === 'skulls' && v !== 1) { // a niche with a skull
    g.fillStyle = '#0d0a08'; g.fillRect(4, y0 + 3, 8, 7);
    g.fillStyle = '#d7ccb5'; g.fillRect(6, y0 + 5, 4, 3); g.fillRect(7, y0 + 8, 2, 1);
    g.fillStyle = '#0d0a08'; g.fillRect(6, y0 + 6, 1, 1); g.fillRect(9, y0 + 6, 1, 1);
  }
  if (pattern === 'overgrown') { g.fillStyle = '#4f7a2a'; for (let x = 0; x < TS; x += 2) { const h = Math.floor(hash(x, v + 3) * 9); g.fillRect(x, y0, 1, h); } g.fillStyle = '#e57373'; if (v === 2) g.fillRect(9, y0 + 5, 1, 1); }
  if (pattern === 'shelves') { // a bookshelf: two shelves of coloured spines
    g.fillStyle = '#2a1a10'; g.fillRect(0, y0, TS, WALL_H);
    const spines = ['#8e2d2d', '#2d5c8e', '#c9a227', '#3d7a3d', '#6a3d7a', '#b0703a'];
    for (const sy of [1, 6]) { let x = 1; while (x < TS - 1) { const w = 1 + Math.floor(hash(x + v * 9, sy) * 2), h = 4 - Math.floor(hash(x, sy + v) * 2); g.fillStyle = spines[Math.floor(hash(x * 3 + v, sy * 5) * spines.length)]; g.fillRect(x, y0 + sy + (4 - h), w, h); x += w + (hash(x, v) > 0.85 ? 1 : 0); } }
    g.fillStyle = '#6b4628'; g.fillRect(0, y0 + 5, TS, 1); g.fillRect(0, y0 + 10, TS, 2); g.fillRect(0, y0, 1, WALL_H); g.fillRect(TS - 1, y0, 1, WALL_H);
  }
  if (pattern === 'gears') { // a turning cog in the wall
    const cx = 8, cy = y0 + 6;
    g.fillStyle = '#7a6a50'; for (let a = 0; a < 8; a++) g.fillRect(Math.round(cx + Math.cos(a * Math.PI / 4) * 4) - 1, Math.round(cy + Math.sin(a * Math.PI / 4) * 4) - 1, 2, 2);
    g.fillStyle = '#d4b46a'; g.fillRect(cx - 2, cy - 2, 5, 5); g.fillStyle = '#2b241d'; g.fillRect(cx, cy, 1, 1);
  }
  if (pattern === 'rods' && v === 0) { g.fillStyle = '#b87333'; g.fillRect(7, 0, 2, TS + 3); g.fillStyle = '#ffcc80'; g.fillRect(7, 0, 1, 2); }
  return c;
}

// ---- special ground (some animate: 3 frames)
function waterTile(deep, f) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  const a = deep ? ['#0c2433', '#123447', '#1d4a60'] : ['#1f4e5a', '#2a6372', '#3b7f8d'];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = hash(x + 3, y + 5), wave = Math.sin((x + f * 5) * 0.8 + y * 0.6 + n);
    px(g, x, y, wave > 0.85 ? a[2] : n < 0.15 ? a[0] : a[1]);
  }
  g.fillStyle = deep ? '#4f89a3' : '#8fc7d0';
  for (let k = 0; k < 2; k++) { const x = (Math.floor(hash(k, 9) * 12) + f * 3) % 13, y = Math.floor(hash(k, 4) * 13) + 1; g.fillRect(x, y, 3, 1); }
  return c;
}
function lavaTile(f) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = hash(x + 11, y + 2), w = Math.sin((x + y) * 0.7 + f * 2.1 + n * 3);
    px(g, x, y, w > 0.7 ? '#ffca28' : w > 0.1 ? '#ff8f00' : n < 0.2 ? '#bf360c' : '#e65100');
  }
  g.fillStyle = '#3e1a0a'; for (let k = 0; k < 2; k++) g.fillRect(Math.floor(hash(k, f + 1) * 12) + 2, Math.floor(hash(f + 2, k) * 12) + 2, 2, 1); // crust
  return c;
}
function chasmTile(f) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  g.fillStyle = '#05030a'; g.fillRect(0, 0, TS, TS);
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(hash(k, 77) * 16), y = Math.floor(hash(77, k) * 16), on = (k + f) % 3 !== 0;
    px(g, x, y, on ? (k ? '#4a3a7a' : '#d1c4e9') : '#1a1030');
  }
  return c;
}
function iceTile(v) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = hash(x + v * 9, y + 41); px(g, x, y, n > 0.93 ? '#ffffff' : n < 0.1 ? '#8ecae6' : '#b3e5fc'); }
  g.fillStyle = '#e1f5fe'; for (let k = 0; k < 3; k++) { const x = Math.floor(hash(k, v) * 10), y = Math.floor(hash(v, k) * 14) + 1; g.fillRect(x, y, 5, 1); } // streaks
  return c;
}
function rockTile(v) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = hash(x + v * 5, y + 61); px(g, x, y, n > 0.9 ? '#4a3a36' : n < 0.12 ? '#1a1312' : '#2b2220'); }
  g.fillStyle = '#6d2a12'; g.fillRect(3 + v * 2, 7, 4, 1); g.fillRect(7 + v, 8, 1, 3);
  return c;
}
function ashTile(v) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = hash(x + v * 5, y + 71); px(g, x, y, n > 0.9 ? '#5a5650' : n < 0.15 ? '#24221f' : '#3a3733'); }
  g.fillStyle = '#5b4a2a'; g.fillRect(4, 5, 2, 1); g.fillRect(10, 11, 1, 2);
  return c;
}
function ventTile(floor) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  g.drawImage(floor, 0, 0);
  g.fillStyle = '#120c0a'; g.fillRect(3, 3, 10, 10);
  g.fillStyle = '#5a3a2a'; for (let k = 0; k < 4; k++) g.fillRect(4, 4 + k * 2 + (k > 1 ? 1 : 0), 8, 1);
  g.fillStyle = '#7a4a2a'; g.fillRect(3, 3, 10, 1);
  return c;
}
function slotTile(floor) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  g.drawImage(floor, 0, 0);
  g.fillStyle = '#1c1812'; g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#3a3226'; g.fillRect(2, 2, 12, 12);
  g.fillStyle = '#d4b46a'; for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.fillRect(x, y, 1, 1);
  g.fillStyle = '#58492f'; g.fillRect(2, 7, 12, 2);
  return c;
}
function bladesTile(floor, up) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  g.drawImage(floor, 0, 0);
  g.fillStyle = '#2b2620'; g.fillRect(2, 2, 12, 12);
  g.fillStyle = '#6a6a72'; g.fillRect(3, 3, 10, 10);
  g.fillStyle = '#1c1c22'; for (let k = 0; k < 3; k++) g.fillRect(4 + k * 3, 4, 1, 8);
  if (up) { g.fillStyle = '#e0e0e8'; for (let k = 0; k < 3; k++) { g.fillRect(4 + k * 3, 1, 1, 9); g.fillRect(3 + k * 3, 3, 3, 1); } g.fillStyle = '#ff5252'; g.fillRect(4, 1, 1, 1); }
  return c;
}
function bridgeTile(v, cracked) {
  const c = makeCanvas(TS, TS), g = c.getContext('2d');
  g.fillStyle = '#05030a'; g.fillRect(0, 0, TS, TS);
  for (let y = 0; y < TS; y++) for (let x = 1; x < TS - 1; x++) {
    let col = y % 5 === 4 ? '#1d1630' : hash(x + v, y) > 0.85 ? '#5a4a86' : '#3b2f5c';
    if (x === 1 || x === TS - 2) col = '#2a2145';
    px(g, x, y, col);
  }
  if (cracked) { g.fillStyle = '#05030a'; let x = 4 + v, y = 0; for (let k = 0; k < 16; k++) { g.fillRect(x, y++, 1, 1); x += hash(k, v) > 0.5 ? 1 : -1; x = Math.max(2, Math.min(13, x)); } g.fillRect(9, 6, 3, 1); }
  return c;
}

// ---- raised special blocks (TS + WALL_H tall, like walls)
function iceWallTile(v) {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  for (let y = 0; y < TS + WALL_H; y++) for (let x = 0; x < TS; x++) {
    const n = hash(x + v * 3, y + 17), front = y >= TS;
    let col = front ? (n > 0.85 ? '#e1f5fe' : '#81d4fa') : (n > 0.9 ? '#ffffff' : '#b3e5fc');
    if (front && (x + y * 2) % 13 === 0) col = '#ffffff';
    if (y === TS) col = '#ffffff';
    px(g, x, y, col);
  }
  g.fillStyle = '#4fc3f7'; g.fillRect(0, TS, 1, WALL_H); g.fillRect(TS - 1, TS, 1, WALL_H);
  return c;
}
function vineTile(v) {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  for (let y = 0; y < TS + WALL_H; y++) for (let x = 0; x < TS; x++) {
    const n = hash(x + v * 7, y + 23), d = Math.hypot(x - 7.5, (y - 12) * 0.75);
    if (d > 9 + n * 2) continue;
    let col = n > 0.8 ? '#7cb342' : n < 0.25 ? '#2e4a17' : '#4f7a2a';
    if (y > TS + 4 && n > 0.5) col = '#3a5a1c';
    px(g, x, y, col);
  }
  g.fillStyle = '#c62828'; for (let k = 0; k < 4; k++) g.fillRect(Math.floor(hash(k, v + 5) * 13) + 1, Math.floor(hash(v + 5, k) * 22) + 2, 1, 1); // thorns
  g.fillStyle = '#f8bbd0'; if (v === 1) g.fillRect(9, 6, 2, 2);
  return c;
}
function runeDoorTile(f) {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  g.globalAlpha = 0.55; g.fillStyle = '#4a148c'; g.fillRect(0, 2, TS, TS + WALL_H - 2); g.globalAlpha = 1;
  g.fillStyle = '#ce93d8'; g.fillRect(0, 2, TS, 1); g.fillRect(0, TS, TS, 1);
  const glyphs = [[3, 6], [8, 10], [12, 5], [5, 18], [10, 22]];
  g.fillStyle = f ? '#ea80fc' : '#e1bee7';
  for (const [x, y] of glyphs) { g.fillRect(x, y, 2, 1); g.fillRect(x + (f ? 1 : 0), y + 1, 1, 2); }
  return c;
}
/** A piston head or a rotor bar: heavy iron with a brass rim. */
function ironBlock(warn) {
  const c = makeCanvas(TS, TS + WALL_H), g = c.getContext('2d');
  for (let y = 0; y < TS + WALL_H; y++) for (let x = 0; x < TS; x++) px(g, x, y, y >= TS ? ((y - TS) % 4 === 3 ? '#2b2620' : '#4d4a52') : (hash(x, y) > 0.9 ? '#6d6a75' : '#57545e'));
  g.fillStyle = '#d4b46a'; g.fillRect(0, 0, TS, 1); g.fillRect(0, TS, TS, 1); g.fillRect(0, 0, 1, TS + WALL_H); g.fillRect(TS - 1, 0, 1, TS + WALL_H);
  if (warn) { g.fillStyle = '#ffca28'; for (let x = 0; x < TS; x += 4) g.fillRect(x, TS + 4, 2, 4); }
  return c;
}

const sets = {};
/** All tiles of a biome (built the first time it is asked for). */
export function biomeTiles(id) {
  if (sets[id]) return sets[id];
  const p = PAL[id];
  if (!p) return null;
  const floor = [0, 1, 2, 3].map(v => floorTile(p.floor, p.fp, v));
  const stairs = floorTile(p.floor, p.fp, 0), sg = stairs.getContext('2d');
  for (let k = 0; k < 4; k++) { sg.fillStyle = k % 2 ? '#1c1626' : '#0a070f'; sg.fillRect(2 + k, 2 + k * 3, 12 - k * 2, 3); sg.fillStyle = p.floor[2]; sg.fillRect(2 + k, 2 + k * 3, 12 - k * 2, 1); }
  const up = floorTile(p.floor, p.fp, 1), ug = up.getContext('2d');
  for (let k = 0; k < 4; k++) { const y = 12 - k * 3, w = 12 - k * 2; ug.fillStyle = '#0b0910'; ug.fillRect(2 + k, y, w, 3); ug.fillStyle = k % 2 ? '#b9aed0' : '#9a8fb0'; ug.fillRect(2 + k, y, w, 2); ug.fillStyle = '#e8e2f4'; ug.fillRect(2 + k, y, w, 1); }
  return (sets[id] = {
    floor, stairs, upStairs: up,
    wall: [0, 1, 2].map(v => wallTile(p.wall, p.wp, v)),
    wallRim: p.wall[5],
  });
}

let special = null;
/** The special ground and blocks, shared by all biomes. */
export function specialTiles() {
  if (special) return special;
  const base = floorTile(PAL.forge.floor, 'cracks', 1), brass = floorTile(PAL.clockwork.floor, 'plates', 0);
  return (special = {
    shallow: [0, 1, 2].map(f => waterTile(false, f)),
    deep: [0, 1, 2].map(f => waterTile(true, f)),
    lava: [0, 1, 2].map(f => lavaTile(f)),
    chasm: [0, 1, 2].map(f => chasmTile(f)),
    ice: [0, 1].map(v => iceTile(v)),
    rock: [0, 1].map(v => rockTile(v)),
    ash: [0, 1].map(v => ashTile(v)),
    vent: ventTile(base),
    slot: slotTile(brass),
    blades: bladesTile(brass, false), bladesUp: bladesTile(brass, true),
    bridge: [0, 1].map(v => bridgeTile(v, false)), bridgeCracked: bridgeTile(0, true),
    iceWall: [0, 1].map(v => iceWallTile(v)),
    vine: [0, 1, 2].map(v => vineTile(v)),
    runeDoor: [0, 1].map(f => runeDoorTile(f)),
    iron: ironBlock(false), ironWarn: ironBlock(true),
  });
}

/** How dark each biome is (the darkness layer's alpha) and how far a caster's own light reaches (x normal). */
export const LIGHTING = {
  crypt: { dark: 0.9, reach: 0.9 }, forge: { dark: 0.86, reach: 1 }, frozen: { dark: 0.72, reach: 1.1 },
  catacombs: { dark: 0.985, reach: 0.42 }, ruins: { dark: 0.85, reach: 1 }, library: { dark: 0.84, reach: 1 },
  clockwork: { dark: 0.86, reach: 1 }, mirror: { dark: 0.74, reach: 1.15 }, storm: { dark: 0.82, reach: 1 }, void: { dark: 0.88, reach: 0.95 },
};
