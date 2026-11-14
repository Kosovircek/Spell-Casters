// Drawing what effect spells leave on the floor and in the air: burning and frozen patches, acid, lava, thorns,
// storm clouds, the void, gravity wells, fog and poison, rune-stone walls, portals, and the warnings ("marks")
// shown before a meteor, a beam, a lightning strike, a web or a drake's breath lands.
// The server sends all of it in state.magic (see server/magic/Magic.js); the renderer calls these each frame.
import { TS, WALL_H } from './constants.js';
import { hash } from './art/canvas.js';
import { drawWord } from './art/font.js';

const TAU = Math.PI * 2;

/** Ground layer: drawn on the floor, under every caster, enemy and spell. */
export function drawMagicFloor(r, view) {
  const m = view.world.magic;
  if (!m) return;
  const ctx = r.ctx, t = view.now;
  const P = (x, y) => r.toScreen(x, y);
  for (const z of m.z) {
    const c = P(z.x, z.y), R = z.r * TS, fade = Math.min(1, z.t / 0.8);
    ctx.save();
    ctx.globalAlpha = fade;
    switch (z.k) {
      case 'fire': {
        disc(ctx, c, R, 'rgba(120,20,0,0.45)');
        for (let k = 0; k < 14; k++) { // flickering flames
          const a = hash(k, z.id.length) * TAU, d = Math.sqrt(hash(k, 7)) * R * 0.9;
          const h = 2 + Math.floor(((t / 90 + k * 3) % 5));
          const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
          ctx.fillStyle = k % 3 ? '#ff7043' : '#ffca28'; ctx.fillRect(x, y - h, 2, h);
        }
        if (Math.random() < 0.3) view.particles.sparkle(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r, '#ff8a65');
        break;
      }
      case 'ice': {
        disc(ctx, c, R, 'rgba(179,229,252,0.35)');
        ctx.strokeStyle = 'rgba(225,245,254,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 6; k++) { // glints
          if (Math.floor(t / 120 + k * 5) % 9) continue;
          const a = hash(k, 3) * TAU, d = hash(k, 4) * R * 0.8;
          ctx.fillRect(Math.round(c.x + Math.cos(a) * d) - 1, Math.round(c.y + Math.sin(a) * d), 3, 1);
          ctx.fillRect(Math.round(c.x + Math.cos(a) * d), Math.round(c.y + Math.sin(a) * d) - 1, 1, 3);
        }
        break;
      }
      case 'acid': {
        disc(ctx, c, R, 'rgba(118,180,30,0.4)');
        ctx.strokeStyle = '#c6ff00'; ctx.lineWidth = 1;
        for (let k = 0; k < 5; k++) { // bubbles that grow and pop
          const f = ((t / 700) + k / 5) % 1, a = hash(k, 9) * TAU, d = hash(k, 2) * R * 0.75;
          ctx.globalAlpha = fade * (1 - f); ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 1 + f * 3, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'lava': {
        const w = view.world.map.w;
        for (const idx of z.tiles || []) {
          const i = idx % w, j = Math.floor(idx / w), p = r.toScreen(i, j);
          const glow = 0.5 + 0.5 * Math.sin(t / 300 + i * 1.7 + j);
          ctx.fillStyle = '#5d1a0a'; ctx.fillRect(p.x, p.y, TS, TS);
          ctx.fillStyle = glow > 0.5 ? '#ff6d00' : '#e64a19'; ctx.fillRect(p.x + 1, p.y + 1, TS - 2, TS - 2);
          ctx.fillStyle = '#ffca28';
          ctx.fillRect(p.x + 3 + Math.round(hash(i, j) * 8), p.y + 4 + Math.round(glow * 6), 3, 2);
          ctx.fillStyle = '#3e1206'; ctx.fillRect(p.x + 2 + Math.round(hash(j, i) * 9), p.y + 9, 4, 2); // crust
          if (Math.random() < 0.02) view.particles.sparkle(i + 0.5, j + 0.7, '#ffab40');
        }
        break;
      }
      case 'thorn': {
        const mine = z.pid === view.myId, seen = mine || view.seeHidden?.({ x: z.x, y: z.y }, 0);
        if (!seen) { if (Math.floor(t / 100 + z.x * 7) % 30 === 0) { ctx.fillStyle = '#c5e1a5'; ctx.fillRect(c.x, c.y - 1, 1, 1); } break; } // a faint glint
        ctx.globalAlpha = fade * (mine ? 0.85 : 0.6);
        for (let k = -2; k <= 2; k++) {
          ctx.fillStyle = '#33691e'; ctx.fillRect(c.x + k * 3, c.y - 4 + Math.abs(k), 1, 4 - Math.abs(k));
          ctx.fillStyle = '#dce775'; ctx.fillRect(c.x + k * 3, c.y - 5 + Math.abs(k), 1, 1);
        }
        break;
      }
      case 'storm': {
        disc(ctx, c, R, 'rgba(20,20,40,0.35)'); // the cloud's shadow
        break;
      }
      case 'void': {
        disc(ctx, c, R, 'rgba(10,0,20,0.35)');
        disc(ctx, c, 6 + Math.sin(t / 60) * 1.5, '#000000');
        ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const rr = 8 + k * 7 + ((t / 50) % 7); ctx.globalAlpha = fade * 0.7 * (1 - k / 3); ctx.beginPath(); ctx.arc(c.x, c.y, rr, t / 200 + k, t / 200 + k + 2.4); ctx.stroke(); }
        if (Math.random() < 0.8) { const a = Math.random() * TAU; view.particles.burst(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r, '#7c4dff', 1, 5, 0.4); }
        break;
      }
      case 'gravity': {
        ctx.strokeStyle = '#ea80fc'; ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) { const f = 1 - ((t / 900 + k / 4) % 1); ctx.globalAlpha = fade * f * 0.8; ctx.beginPath(); ctx.arc(c.x, c.y, R * f, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = fade; disc(ctx, c, 3, '#ea80fc');
        break;
      }
    }
    ctx.restore();
  }
  // portals: two swirling doorways in their caster's colour
  for (const p of m.pt || []) for (const [x, y] of [[p.x, p.y], [p.x2, p.y2]]) {
    const c = P(x, y);
    ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 6, 6, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y - 6, 6, 9, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c.x, c.y - 6, 3, 6, 0, t / 150, t / 150 + 3); ctx.stroke();
    if (Math.random() < 0.3) view.particles.sparkle(x + (Math.random() - 0.5) * 0.5, y, p.c);
  }
  // warnings: something is about to land here
  for (const mk of m.mk) {
    const c = P(mk.x, mk.y), f = +mk.f;
    ctx.save();
    if (mk.k === 'meteor' || mk.k === 'strike' || mk.k === 'web') {
      const R = (mk.r || 1) * TS, col = mk.k === 'meteor' ? '#ff5252' : mk.k === 'strike' ? '#fff59d' : '#ffffff';
      ctx.globalAlpha = 0.25 + 0.25 * f; disc(ctx, c, R * f, col);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
      if (mk.k === 'meteor') { // the star coming down
        const y = c.y - (1 - f) * 140;
        ctx.globalAlpha = 1; disc(ctx, { x: c.x + (1 - f) * 40, y }, 5, '#ffca28'); disc(ctx, { x: c.x + (1 - f) * 40, y }, 3, '#ffffff');
        if (Math.random() < 0.8) view.particles.trail(mk.x + (1 - f) * 2.5, mk.y - (1 - f) * 8.7 + 0.5, '#ff7043');
      }
    } else if (mk.k === 'beam' || mk.k === 'breath') {
      const a = P(mk.x, mk.y), b = P(mk.x2, mk.y2);
      ctx.globalAlpha = 0.3 + 0.5 * f * (0.5 + 0.5 * Math.sin(t / 30));
      ctx.strokeStyle = mk.k === 'beam' ? '#fff59d' : '#ff7043'; ctx.lineWidth = mk.k === 'beam' ? 1 : 3; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(b.x, b.y - 6); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

/** Air layer: clouds that hang over everything (fog hides what is inside it), drawn after the entities. */
export function drawMagicAir(r, view) {
  const m = view.world.magic;
  if (!m) return;
  const ctx = r.ctx, t = view.now;
  for (const z of m.z) {
    if (z.k !== 'fog' && z.k !== 'poison' && z.k !== 'storm') continue;
    const c = r.toScreen(z.x, z.y), R = z.r * TS, fade = Math.min(1, z.t / 1.2);
    const col = z.k === 'fog' ? [190, 190, 210] : z.k === 'poison' ? [120, 170, 60] : [40, 40, 70];
    const lift = z.k === 'storm' ? 40 : 6, alpha = z.k === 'fog' ? 0.55 : z.k === 'poison' ? 0.32 : 0.75;
    ctx.save();
    for (let k = 0; k < 9; k++) { // a few soft blobs drifting round the middle
      const a = hash(k, 11) * TAU + t / (3000 + k * 400), d = (0.2 + hash(k, 12) * 0.6) * R;
      const bx = c.x + Math.cos(a) * d, by = c.y - lift + Math.sin(a) * d * (z.k === 'storm' ? 0.4 : 0.7);
      const br = R * (0.45 + hash(k, 13) * 0.3);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `rgba(${col},${alpha * fade})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    if (z.k === 'poison' && Math.random() < 0.3) view.particles.sparkle(z.x + (Math.random() - 0.5) * z.r * 1.5, z.y + (Math.random() - 0.5) * z.r, '#aed581');
    ctx.restore();
  }
}

/** MURUS and CAVEA: rune stones, raised blocks that sort with everything else like walls do. */
export function magicWallDrawables(r, view) {
  const world = view.world, out = [];
  if (!world.magicWalls.size) return out;
  const w = world.map.w;
  for (const idx of world.magicWalls) {
    const i = idx % w, j = Math.floor(idx / w);
    out.push({ d: j + 1, draw: () => runeStone(r, i, j, view.now) });
  }
  return out;
}
function runeStone(r, i, j, t) {
  const ctx = r.ctx, p = r.toScreen(i, j), top = p.y - WALL_H;
  ctx.fillStyle = '#0b0910'; ctx.fillRect(p.x, top, TS, TS + WALL_H);
  ctx.fillStyle = '#6a5a9a'; ctx.fillRect(p.x + 1, top + 1, TS - 2, TS - 2);          // top face
  ctx.fillStyle = '#8f7fc4'; ctx.fillRect(p.x + 1, top + 1, TS - 2, 2);
  ctx.fillStyle = '#3f3466'; ctx.fillRect(p.x + 1, top + TS, TS - 2, WALL_H - 1);     // front face
  const glow = 0.5 + 0.5 * Math.sin(t / 250 + i + j);
  drawWord(ctx, '*', p.x + TS / 2, top + TS + 1, () => (glow > 0.5 ? '#e040fb' : '#b388ff')); // the rune carved in it
}

/** Light given off by effects (burning floors, lava, portals, the void's rim) for the darkness layer. */
export function magicLights(world) {
  const m = world.magic, out = [];
  if (!m) return out;
  for (const z of m.z) {
    if (z.k === 'fire') out.push([z.x, z.y, 40, 0.8]);
    else if (z.k === 'lava') out.push([z.x, z.y, 70, 0.8]);
    else if (z.k === 'void' || z.k === 'gravity') out.push([z.x, z.y, 30, 0.5]);
    else if (z.k === 'ice' || z.k === 'acid') out.push([z.x, z.y, 26, 0.4]);
  }
  for (const p of m.pt || []) { out.push([p.x, p.y, 34, 0.7]); out.push([p.x2, p.y2, 34, 0.7]); }
  for (const mk of m.mk) if (mk.k === 'meteor') out.push([mk.x, mk.y, 30 + 40 * +mk.f, 0.9]);
  return out;
}

function disc(ctx, c, R, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.5, R), 0, TAU); ctx.fill(); }
