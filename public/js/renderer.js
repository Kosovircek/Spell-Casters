// Draws the world: camera, tiles, depth-sorted entities, particles, lighting and the stairs arrow.
import { VIEW_W, VIEW_H, TS, WALL_H, AIM_KEYS } from './constants.js';
import { makeCanvas, hash } from './art/canvas.js';
import { TILES } from './art/tiles.js';
import { arenaPlatform, arenaSky, drawTwinkles } from './art/arena.js';
import { MORSE } from './morse.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.dark = makeCanvas(VIEW_W, VIEW_H);  // darkness layer with holes cut out for lights
    this.dctx = this.dark.getContext('2d');
    this.ox = 0; this.oy = 0;                 // camera offset in pixels
    this.shake = 0;
    this.textCache = {};
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Scale the low-res canvas up to fill the window in crisp half-steps (phones: fill the screen exactly). */
  resize() {
    const fit = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    const s = document.body.classList.contains('touch') ? fit : Math.max(1, Math.floor(fit * 2) / 2);
    const st = this.canvas.style;
    st.width = VIEW_W * s + 'px'; st.height = VIEW_H * s + 'px';
    st.left = Math.floor((innerWidth - VIEW_W * s) / 2) + 'px'; st.top = Math.floor((innerHeight - VIEW_H * s) / 2) + 'px';
  }

  /** Tile position -> screen pixel (rounded). */
  toScreen(x, y) { return { x: Math.round(x * TS + this.ox), y: Math.round(y * TS + this.oy) }; }

  // ------------------------------------------------------------------ frame
  /** view = { world, focus, now, dt, myId, morse, insight, particles } */
  render(view) {
    const { ctx } = this, { world, focus, now, dt } = view;
    ctx.fillStyle = '#0b0910'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!world.ready) return this.drawTitle(now);
    if (world.map.duel) return this.renderDuel(view);

    this.shake = Math.max(0, this.shake - dt * 30);
    this.ox = Math.round(VIEW_W / 2 - focus.x * TS + (Math.random() - 0.5) * this.shake);
    this.oy = Math.round(VIEW_H / 2 - focus.y * TS + (Math.random() - 0.5) * this.shake);

    const drawables = this.drawFloorAndCollectWalls(world, focus, now);
    for (const e of world.entities.values()) drawables.push({ d: e.depth, draw: () => e.draw(this, view) });
    drawables.sort((a, b) => a.d - b.d);
    for (const d of drawables) d.draw();

    view.particles.draw(ctx, this.ox, this.oy);
    this.drawLighting(world, now);
    this.drawStairsArrow(world);
  }

  /** The duel arena: a fixed camera on the platform, a starry sky behind it and no darkness. */
  renderDuel(view) {
    const { ctx } = this, { world, now, dt } = view, map = world.map, p = map.platform;
    if (this.arenaFor !== map) { // pre-render the platform and the sky once per arena
      this.arenaFor = map;
      this.arenaImg = arenaPlatform(p);
      this.skyImg = arenaSky(VIEW_W, VIEW_H);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.ox = Math.round(VIEW_W / 2 - (p.x + p.w / 2) * TS + (Math.random() - 0.5) * this.shake);
    this.oy = Math.round(VIEW_H / 2 - (p.y + p.h / 2) * TS - WALL_H / 2 + (Math.random() - 0.5) * this.shake);
    ctx.drawImage(this.skyImg, 0, 0);
    const px = p.x * TS + this.ox, py = p.y * TS + this.oy;
    drawTwinkles(ctx, VIEW_W, VIEW_H, now, { x: px, y: py, w: p.w * TS, h: p.h * TS + WALL_H });
    // a soft glow under the platform, as if it hangs in moonlight
    ctx.fillStyle = 'rgba(120,130,220,0.06)';
    for (let k = 0; k < 4; k++) ctx.fillRect(px + 6 + k * 3, py + p.h * TS + WALL_H + k * 2, p.w * TS - 12 - k * 6, 2);
    ctx.drawImage(this.arenaImg, px, py);
    const ents = [...world.entities.values()].sort((a, b) => a.depth - b.depth);
    for (const e of ents) e.draw(this, view);
    view.particles.draw(ctx, this.ox, this.oy);
  }

  /** Floors are drawn right away; walls are returned so they sort with entities (a wall can hide you). */
  drawFloorAndCollectWalls(world, focus, now) {
    const { ctx } = this, map = world.map, state = world.state, walls = [];
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
      const sx = i * TS + this.ox, sy = j * TS + this.oy;
      if (sx < -TS || sx > VIEW_W || sy < -TS || sy > VIEW_H + WALL_H + TS) continue;
      if (map.tiles[j * map.w + i] === 1) {
        const isStairs = i === map.stairs.x && j === map.stairs.y;
        ctx.drawImage(isStairs ? TILES.stairs : TILES.floor[Math.floor(hash(i, j) * 4)], sx, sy);
        if (isStairs && state.stairsOpen) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now / 200); ctx.fillStyle = '#ffd54f'; ctx.fillRect(sx + 2, sy + 2, 12, 12); ctx.globalAlpha = 1; }
      } else if (this.touchesFloor(world, i, j)) {
        walls.push({ d: j + 1, draw: () => this.drawWall(world, i, j, sx, sy, focus) });
      }
    }
    return walls;
  }
  touchesFloor(world, i, j) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && world.tileAt(i + di, j + dj)) return true;
    return false;
  }
  /** A wall block is raised by WALL_H: its top sits up the screen and its front face covers its own square. */
  drawWall(world, i, j, sx, sy, focus) {
    const { ctx } = this;
    const nearPlayer = j + 1 > focus.y && j - focus.y < 1.5 && Math.abs(i + 0.5 - focus.x) < 1.6;
    if (nearPlayer) ctx.globalAlpha = 0.45; // see-through when it stands in front of you
    ctx.drawImage(TILES.wall[Math.floor(hash(j, i) * 3)], sx, sy - WALL_H);
    ctx.fillStyle = '#7d7299'; const ty = sy - WALL_H; // light rim where the wall meets open floor
    if (world.tileAt(i - 1, j)) ctx.fillRect(sx, ty, 1, TS);
    if (world.tileAt(i + 1, j)) ctx.fillRect(sx + TS - 1, ty, 1, TS);
    if (world.tileAt(i, j - 1)) ctx.fillRect(sx, ty, TS, 1);
    if (world.tileAt(i, j + 1)) ctx.fillRect(sx, ty + TS - 1, TS, 1);
    ctx.globalAlpha = 1;
  }

  /** Darkness everywhere except around light sources (players, spells, chests, open stairs). */
  drawLighting(world, now) {
    const d = this.dctx;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VIEW_W, VIEW_H); d.fillStyle = 'rgba(6,4,12,0.9)'; d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a) => {
      const sx = x * TS + this.ox, sy = y * TS + this.oy - 6;
      const g = d.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.6, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.fillRect(sx - r, sy - r, r * 2, r * 2);
    };
    for (const e of world.entities.values()) { const l = e.light; if (l) light(e.x, e.y, l.radius, l.strength); }
    if (world.state.stairsOpen) light(world.map.stairs.x + 0.5, world.map.stairs.y + 0.5, 60, 0.9);
    this.ctx.drawImage(this.dark, 0, 0);
  }

  /** Arrow at the screen edge pointing to the open stairs. */
  drawStairsArrow(world) {
    if (!world.state.stairsOpen) return;
    const st = world.map.stairs, sx = (st.x + 0.5) * TS + this.ox, sy = (st.y + 0.5) * TS + this.oy;
    if (sx >= 10 && sx <= VIEW_W - 10 && sy >= 10 && sy <= VIEW_H - 10) return;
    const a = Math.atan2(sy - VIEW_H / 2, sx - VIEW_W / 2), ctx = this.ctx;
    ctx.save(); ctx.translate(Math.round(VIEW_W / 2 + Math.cos(a) * (VIEW_W / 2 - 16)), Math.round(VIEW_H / 2 + Math.sin(a) * (VIEW_H / 2 - 16))); ctx.rotate(a);
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.fill(); ctx.restore();
  }

  drawTitle(now) {
    for (let i = 0; i < 40; i++) {
      const x = (hash(i, 1) * VIEW_W + now / 40 * (0.3 + hash(i, 2))) % VIEW_W, y = hash(i, 3) * VIEW_H;
      this.ctx.fillStyle = i % 3 ? '#4b3d63' : '#ffd54f'; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // ------------------------------------------------------------------ drawing helpers for entities
  shadow(x, y, r) { const c = this.ctx; c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x, y, r, r / 2, 0, 0, 7); c.fill(); }
  orb(x, y, rx, ry) { this.ctx.beginPath(); this.ctx.ellipse(x, y, rx, ry, 0, 0, 7); }
  /** Draw a sprite centred on cx, mirrored when facing left. */
  drawFacing(img, cx, top, w, h, face) {
    const c = this.ctx, x = Math.round(cx - w / 2), y = Math.round(top);
    if (face === -1) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(img, 0, 0, w, h); c.restore(); }
    else c.drawImage(img, x, y, w, h);
  }
  /** Eight dots around the caster: "pick a direction". */
  aimRing(x, y, color, now) {
    const c = this.ctx;
    c.fillStyle = color; c.globalAlpha = 0.6 + 0.3 * Math.sin(now / 120);
    for (const [ux, uy] of Object.values(AIM_KEYS)) { const l = Math.hypot(ux, uy); c.fillRect(Math.round(x + ux / l * 12) - 1, Math.round(y + uy / l * 11) - 1, 2, 2); }
    c.globalAlpha = 1;
  }
  /**
   * A word written only in Morse: dots and dashes, centred at (cx, y). Letters before `done` are already
   * spelled and show as small letters. The next letter is yellow, unless `dim` (the boss is shielded).
   */
  morseWord(word, done, cx, y, dim) {
    const c = this.ctx, DOT = 2, DASH = 5, GAP = 2, LETTER_GAP = 6;
    const parts = [...word].map((ch, i) => i < done ? { ch, w: 5 } : { code: MORSE[ch] || '', w: [...(MORSE[ch] || '')].reduce((a, s) => a + (s === '.' ? DOT : DASH) + GAP, -GAP) });
    const total = parts.reduce((a, p) => a + p.w + LETTER_GAP, -LETTER_GAP);
    let x = Math.round(cx - total / 2);
    parts.forEach((p, i) => {
      if (p.ch) { this.smallText(p.ch, x + 3, y + 8, '#7c9a7e'); x += p.w + LETTER_GAP; return; }
      const color = dim ? '#a9a2c2' : i === done ? '#ffd54f' : '#ffffff';
      for (const s of p.code) {
        const w = s === '.' ? DOT : DASH;
        c.fillStyle = '#0b0910'; c.fillRect(x - 1, y - 1, w + 2, 4);
        c.fillStyle = color; c.fillRect(x, y, w, 2);
        x += w + GAP;
      }
      x += LETTER_GAP - GAP;
    });
  }
  /** Small text (names, Morse hints), cached per string. */
  smallText(text, x, y, color) {
    const key = text + color;
    if (!this.textCache[key]) {
      const c = makeCanvas(160, 10), g = c.getContext('2d');
      g.font = '8px monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = '#000'; g.fillText(text, 81, 1); g.fillStyle = color; g.fillText(text, 80, 0);
      this.textCache[key] = c;
    }
    this.ctx.drawImage(this.textCache[key], Math.round(x - 80), Math.round(y - 8));
  }
}
