// Drawing what the biomes do on their own (see server/biomes/Environment.js): glowing and erupting vents, warnings
// on machinery about to move, gravity wells and portals in the void, and the weather (wind and rain in the storm,
// snow and blizzards in the frozen halls, embers in the forge, lightning flashes).
// map.envFixed holds the things that never move; world.env the moving parts, with every state.
import { VIEW_W, VIEW_H, TS } from './constants.js';
import { hash } from './art/canvas.js';
import { T } from './art/biomes.js';

const TAU = Math.PI * 2;

/** On the floor, under everyone: wells, portals, vent glow, machinery warnings. */
export function drawEnvFloor(r, view) {
  const world = view.world, map = world.map, env = world.env || {}, fixed = map.envFixed || {}, ctx = r.ctx, t = view.now;
  const tile = (n) => r.toScreen(n % map.w, Math.floor(n / map.w));
  for (const n of env.warm || []) { // a vent about to erupt glows
    const p = tile(n); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t / 60); ctx.fillStyle = '#ff6d00'; ctx.fillRect(p.x + 3, p.y + 3, 10, 10); ctx.globalAlpha = 1;
  }
  for (const n of env.hot || []) { // erupting: a column of fire
    const p = tile(n);
    ctx.fillStyle = '#ffca28'; ctx.fillRect(p.x + 3, p.y + 3, 10, 10);
    r.onTop(() => {
      for (let k = 0; k < 6; k++) {
        const h = 10 + ((t / 40 + k * 7) % 14);
        ctx.fillStyle = k % 2 ? '#ff7043' : '#ffeb3b';
        ctx.fillRect(p.x + 3 + k * 2, p.y + 8 - h, 2, h);
      }
    });
    if (Math.random() < 0.6) view.particles.sparkle(n % map.w + Math.random(), Math.floor(n / map.w) + 0.5, '#ff8a65');
  }
  for (const n of env.warn || []) { // machinery about to move: hazard stripes
    const p = tile(n); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 50);
    ctx.fillStyle = '#ffca28'; for (let k = 0; k < 4; k++) ctx.fillRect(p.x + k * 4, p.y + 1, 2, TS - 2);
    ctx.globalAlpha = 1;
  }
  for (const n of env.slow || []) { // TARDUS on machinery: a slow blue swirl
    const p = tile(n); ctx.strokeStyle = '#80deea'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x + 8, p.y + 8, 6, t / 600, t / 600 + 4.5); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const [x, y] of fixed.wells || []) { // a gravity well: a slow spiral
    const c = r.toScreen(x, y);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = k % 2 ? '#7c4dff' : '#b388ff'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 10 + k * 14, (10 + k * 14) * 0.7, 0, -t / (400 + k * 200), -t / (400 + k * 200) + 4); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#0b0614'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e1bee7'; ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
  }
  for (const pt of fixed.portals || []) for (const [x, y] of [[pt.a.x, pt.a.y], [pt.b.x, pt.b.y]]) { // portals linking rooms
    const c = r.toScreen(x, y);
    ctx.fillStyle = '#1a0b2e'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 8, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ea80fc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c.x, c.y, 8, 5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#b388ff'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5, 3, 0, t / 200, t / 200 + 4); ctx.stroke();
    if (Math.random() < 0.15) view.particles.sparkle(x + (Math.random() - 0.5) * 0.8, y, '#ea80fc');
  }
}

/** Lights from the biome itself: lava, erupting vents, wells, portals. */
export function envLights(r, world, now) {
  const map = world.map, out = [];
  if (!map.biome) return out;
  const env = world.env || {}, fixed = map.envFixed || {};
  if (map.biome === 'forge') { // every other lava tile on screen glows
    const i0 = Math.max(0, Math.floor(-r.ox / TS) - 2), j0 = Math.max(0, Math.floor(-r.oy / TS) - 2);
    const i1 = Math.min(map.w, i0 + Math.ceil(VIEW_W / TS) + 4), j1 = Math.min(map.h, j0 + Math.ceil(VIEW_H / TS) + 4);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if ((i + j) % 2 === 0 && map.tiles[j * map.w + i] === T.LAVA) out.push([i + 0.5, j + 0.5, 30, 0.55]);
  }
  for (const n of env.hot || []) out.push([n % map.w + 0.5, Math.floor(n / map.w) + 0.5, 60, 0.9]);
  for (const n of env.warm || []) out.push([n % map.w + 0.5, Math.floor(n / map.w) + 0.5, 26, 0.5]);
  for (const [x, y] of fixed.wells || []) out.push([x, y, 34, 0.5]);
  for (const pt of fixed.portals || []) { out.push([pt.a.x, pt.a.y, 30, 0.6]); out.push([pt.b.x, pt.b.y, 30, 0.6]); }
  return out;
}

/** Weather, over everything but the letters: drawn in screen space. */
const flakes = Array.from({ length: 90 }, (_, k) => ({ x: hash(k, 1) * VIEW_W, y: hash(1, k) * VIEW_H, s: 0.5 + hash(k, k) }));
export function drawWeather(r, view) {
  const world = view.world, map = world.map, env = world.env || {}, ctx = r.ctx, t = view.now, dt = view.dt;
  if (!map.biome) return;
  if (map.biome === 'storm') {
    const [wx, wy] = env.wind || [1, 0];
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 1;
    for (const f of flakes) { // rain, slanting with the wind
      f.x += (wx * 120 + 10) * f.s * dt; f.y += (180 + wy * 80) * f.s * dt;
      if (f.x > VIEW_W) f.x -= VIEW_W; if (f.x < 0) f.x += VIEW_W; if (f.y > VIEW_H) f.y -= VIEW_H; if (f.y < 0) f.y += VIEW_H;
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - wx * 4 - 1, f.y - 5); ctx.stroke();
    }
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; // gust lines show where the wind blows
    for (let k = 0; k < 6; k++) {
      const len = 30, ph = ((t / 900 + hash(k, 3)) % 1);
      const x = hash(k, 7) * VIEW_W + wx * ph * 200, y = hash(7, k) * VIEW_H + wy * ph * 200;
      ctx.globalAlpha = 0.35 * Math.sin(ph * Math.PI);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + wx * len, y + wy * len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (map.biome === 'frozen') {
    const storm = env.bliz > 0;
    if (storm) { ctx.fillStyle = 'rgba(225,240,250,0.22)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    ctx.fillStyle = '#ffffff';
    const n = storm ? flakes.length : 30;
    for (let k = 0; k < n; k++) {
      const f = flakes[k];
      f.x += (storm ? 160 : 8 + Math.sin(t / 900 + k) * 10) * f.s * dt; f.y += (storm ? 50 : 18) * f.s * dt;
      if (f.x > VIEW_W) f.x -= VIEW_W; if (f.y > VIEW_H) f.y -= VIEW_H;
      ctx.globalAlpha = storm ? 0.8 : 0.5; ctx.fillRect(Math.round(f.x), Math.round(f.y), storm ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  if (map.biome === 'forge' && Math.random() < 0.5) { // embers drifting up
    const x = (Math.random() * VIEW_W - r.ox) / TS, y = (Math.random() * VIEW_H - r.oy) / TS;
    view.particles.sparkle(x, y, Math.random() < 0.5 ? '#ff8a65' : '#ffca28');
  }
  if (r.flash > 0) { // lightning
    ctx.fillStyle = `rgba(255,255,240,${Math.min(0.5, r.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    r.flash -= dt * 2.5;
  }
}
