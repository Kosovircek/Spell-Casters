// Short-lived sparks and floating text ("BLOCK", "+1"). Positions are in world pixels (tile * TS).
import { TS } from './constants.js';
import { drawWord } from './art/font.js';

export class Particles {
  constructor() { this.sparks = []; this.texts = []; }
  clear() { this.sparks = []; this.texts = []; }

  /** Explosion of n sparks at a tile position. */
  burst(x, y, color, n, speed = 40, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.sparks.push({ x: x * TS, y: y * TS - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 10, life: life * (0.5 + Math.random()), max: life, color });
    }
  }
  /** One spark left behind by a flying spell. */
  trail(x, y, color) {
    this.sparks.push({ x: x * TS, y: y * TS - 8, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 0.25, max: 0.25, color });
  }
  /** A slowly rising glint (chests). */
  sparkle(x, y, color) { this.sparks.push({ x: x * TS, y: y * TS - 6, vx: 0, vy: -12, life: 0.6, max: 0.6, color }); }
  text(x, y, text, color) { this.texts.push({ x: x * TS, y: y * TS - 22, text, color, life: 1 }); }

  update(dt) {
    this.sparks = this.sparks.filter(p => (p.life -= dt) > 0);
    for (const p of this.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; }
    this.texts = this.texts.filter(t => (t.life -= dt) > 0);
    for (const t of this.texts) t.y -= 14 * dt;
  }
  draw(ctx, ox, oy) {
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x + ox), Math.round(p.y + oy), 2, 2);
    }
    for (const t of this.texts) { ctx.globalAlpha = Math.min(1, t.life * 2); drawWord(ctx, t.text, t.x + ox, t.y + oy, () => t.color); }
    ctx.globalAlpha = 1;
  }
}
