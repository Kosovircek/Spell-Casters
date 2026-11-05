// The duel arena: a long, narrow stone platform floating in a starry sky.
// Its floor is inlaid in silver with a row of crescent moons along the middle, small gold stars in two
// rows beside it, a moon medallion in the centre and a starting circle at each end.
import { TS, WALL_H, makeCanvas, hash } from './canvas.js';

const C = {
  mortar: [24, 27, 51], stone: [38, 43, 71], stoneHi: [45, 51, 84], stoneLo: [31, 35, 64],
  edge: [13, 12, 28], trim: [170, 180, 216], trimHi: [230, 235, 255],
  inlay: [227, 232, 255], inlayMid: [167, 178, 220], carve: [20, 22, 42],
  gold: [243, 221, 138], goldLo: [176, 146, 74],
  face: [27, 30, 54], faceHi: [42, 47, 82], faceLo: [16, 17, 34],
};

/** Inside a crescent: inside circle (cx, cy, r) but outside the same circle shifted by `off` toward dir. */
function inCrescent(px, py, cx, cy, r, dir, off = r * 0.45) {
  const a = Math.hypot(px - cx, py - cy) <= r;
  const b = Math.hypot(px - (cx + dir * off), py - cy) <= r * 0.92;
  return a && !b;
}
/** A small four-point star (a plus with a bright centre), radius 1 or 2. */
function starAt(px, py, cx, cy, size) {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  if (dx === 0 && dy === 0) return 2;
  if ((dx === 0 && dy <= size) || (dy === 0 && dx <= size)) return 1;
  return 0;
}

/** Pre-render the platform (top surface plus its front face) once per arena. */
export function arenaPlatform(platform) {
  const W = platform.w * TS, H = platform.h * TS;
  const c = makeCanvas(W, H + WALL_H), g = c.getContext('2d');
  const img = g.createImageData(W, H + WALL_H), px = img.data;
  const set = (x, y, col) => { const i = (y * W + x) * 4; px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255; };

  const cy = H / 2 - 0.5, mid = W / 2 - 0.5;
  const ends = [2.5 * TS - 0.5, W - 2.5 * TS - 0.5];        // starting circles, where the casters stand
  const MED_R = 29;                                         // centre medallion
  const moons = [];                                         // crescents along the middle line
  for (let x = mid - 52; x > ends[0] + 18; x -= 34) moons.push({ x, dir: 1 });
  for (let x = mid + 52; x < ends[1] - 18; x += 34) moons.push({ x, dir: -1 });
  const stars = [];                                         // gold stars in two rows beside the moons
  for (let x = 20; x < W - 20; x += 17) {
    if (Math.abs(x - mid) < MED_R + 6) continue;
    const row = Math.round(x / 17) % 2 ? -1 : 1;
    stars.push({ x: Math.round(x), y: Math.round(cy + row * 22), s: hash(x, 3) > 0.6 ? 2 : 1 });
  }

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // stone slabs, two tiles long, every other row shifted
    const n = hash(x * 3 + 11, y * 7 + 5), row = Math.floor(y / TS), sx = (x + (row % 2) * TS) % (TS * 2);
    let col = n < 0.1 ? C.stoneLo : n > 0.93 ? C.stoneHi : C.stone;
    if (y % TS === 0 || sx === 0) col = C.mortar;

    // middle line, broken by the medallion and the moons
    if (Math.abs(y - cy) < 0.6 && x > ends[0] + 10 && x < ends[1] - 10) col = C.inlayMid;

    // starting circles: a ring with a star in the middle
    for (const ex of ends) {
      const d = Math.hypot(x - ex, y - cy);
      if (d < 0.5 + 10 && d > 10 - 1.2) col = C.inlay;
      else if (d < 13 && d > 12) col = C.inlayMid;
      const st = starAt(Math.round(x), Math.round(y), Math.round(ex), Math.round(cy), 3);
      if (st) col = st === 2 ? C.trimHi : C.gold;
    }

    // centre medallion: double ring, a big crescent and three stars in its curve
    const md = Math.hypot(x - mid, y - cy);
    if (md <= MED_R) {
      if (md > MED_R - 2) col = C.inlay;
      else if (md > MED_R - 4) col = C.carve;
      else if (md > MED_R - 5) col = C.inlayMid;
      else col = n > 0.5 ? C.stoneLo : C.mortar;
      if (inCrescent(x, y, mid + 4, cy, 17, -1, 9)) col = Math.hypot(x - (mid + 4) + 1, y - cy + 1) > 16 ? C.inlayMid : C.inlay;
      for (const [ox, oy, s] of [[9, -12, 1], [14, 0, 2], [9, 12, 1]]) {
        const st = starAt(Math.round(x), Math.round(y), Math.round(mid + ox), Math.round(cy + oy), s);
        if (st) col = st === 2 ? C.trimHi : C.gold;
      }
    }

    // crescents along the middle line, all facing the centre
    for (const m of moons) {
      if (Math.abs(x - m.x) > 9 || Math.abs(y - cy) > 9) continue;
      if (inCrescent(x, y, m.x, cy, 7, m.dir)) col = C.inlay;
      else if (inCrescent(x - 1, y - 1, m.x, cy, 7, m.dir)) col = C.carve; // carved shadow
      else if (Math.abs(y - cy) < 0.6) col = C.stone;                      // the line stops at each moon
    }

    // gold stars
    for (const s of stars) {
      if (Math.abs(x - s.x) > 2 || Math.abs(y - s.y) > 2) continue;
      const st = starAt(x, y, s.x, s.y, s.s);
      if (st) col = st === 2 ? C.trimHi : C.gold;
    }

    // silver trim around the edge, with a gold stud every tile
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e === 0) col = C.edge;
    else if (e <= 2) col = (y === 1 || x === 1) ? C.trimHi : C.trim;
    else if (e === 3) col = C.carve;
    if (e <= 2 && e >= 1 && ((y <= 2 || y >= H - 3) ? (x % TS === 8 && e === 2 && (y === 2 || y === H - 3)) : (y % TS === 8 && e === 2))) col = C.gold;
    set(x, y, col);
  }

  // front face: carved panels under a silver lip, darker toward the bottom
  for (let y = 0; y < WALL_H; y++) for (let x = 0; x < W; x++) {
    let col = y === 0 ? C.trim : y === 1 ? C.trimHi : y === WALL_H - 1 ? C.faceLo : C.face;
    if (y > 2 && y < WALL_H - 2 && x % TS === 0) col = C.faceLo;
    if (y > 2 && y < WALL_H - 2 && x % TS === 1) col = C.faceHi;
    if (y === 6 && x % TS === 8) col = C.gold;                    // a gold dot in every panel
    if ((y === 5 || y === 7) && x % TS === 8) col = C.goldLo;
    if (y >= WALL_H - 4 && hash(x, y) > 0.8) col = C.faceLo;
    if (x === 0 || x === W - 1) col = C.edge;
    set(x, H + y, col);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The sky behind the platform: deep blue, a crescent moon and a field of stars (twinkling ones are drawn per frame). */
export function arenaSky(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#05040f'); grad.addColorStop(0.55, '#0d0a24'); grad.addColorStop(1, '#170f33');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  // a faint band of sky dust
  for (let i = 0; i < 900; i++) {
    const t = hash(i, 41), x = t * w, y = h * 0.18 + (x / w) * h * 0.45 + (hash(i, 42) - 0.5) * 50;
    g.fillStyle = `rgba(150,140,220,${0.04 + hash(i, 43) * 0.08})`; g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  // still stars
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash(i, 7) * w), y = Math.floor(hash(i, 8) * h), b = hash(i, 9);
    g.fillStyle = b > 0.85 ? '#ffffff' : b > 0.5 ? '#9fa8da' : '#4b4f7a';
    g.fillRect(x, y, 1, 1);
  }
  // the moon: a pale crescent with a soft halo
  const mx = Math.round(w * 0.4), my = 28, r = 16;
  const halo = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 3);
  halo.addColorStop(0, 'rgba(240,236,210,0.18)'); halo.addColorStop(1, 'rgba(240,236,210,0)');
  g.fillStyle = halo; g.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (!inCrescent(x, y, 0, 0, r, -1, 7)) continue;
    const rim = Math.hypot(x, y) > r - 1.5;
    g.fillStyle = rim ? '#d9d2ae' : hash(x + 50, y + 50) > 0.9 ? '#e6dfbd' : '#f6f2dc';
    g.fillRect(mx + x, my + y, 1, 1);
  }
  return c;
}

/** Bigger stars that twinkle, drawn every frame on top of the sky. */
export function drawTwinkles(ctx, w, h, now, avoid) {
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash(i, 21) * w), y = Math.floor(hash(i, 22) * h);
    if (avoid && x > avoid.x - 4 && x < avoid.x + avoid.w + 4 && y > avoid.y - 4 && y < avoid.y + avoid.h + 4) continue;
    const t = Math.sin(now / (500 + hash(i, 23) * 900) + i * 1.7);
    if (t < -0.2) continue;
    ctx.fillStyle = t > 0.7 ? '#ffffff' : '#c5cae9';
    ctx.fillRect(x, y, 1, 1);
    if (t > 0.5) { ctx.globalAlpha = (t - 0.5) * 1.6; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); ctx.globalAlpha = 1; }
    if (t > 0.9 && hash(i, 24) > 0.5) { ctx.globalAlpha = 0.5; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); ctx.globalAlpha = 1; }
  }
}
