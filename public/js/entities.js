// Things drawn in the dungeon. Each class mirrors a server entity and knows how to draw itself.
//
//   Entity ── Character ── Player
//      │            └───── Enemy ── Slime
//      │                       ├─── Mage
//      │                       └─── Boss (the Bellwraith)
//      ├── Chest
//      ├── Spell
//      └── FloorItem
import { TS, prettyMorse } from './constants.js';
import { drawWord } from './art/font.js';
import { wizardSprite, enemySprite, chestSprite, itemSprite, wraithSprite, bellSprite } from './art/sprites.js';
import { MORSE } from './morse.js';

// ------------------------------------------------------------------ base classes

export class Entity {
  constructor(data) {
    this.id = data.id;
    this.x = data.x; this.y = data.y;        // smoothed position used for drawing
    this.data = data;                        // latest snapshot from the server
  }
  /** New snapshot from the server (20 times a second). */
  sync(data) { this.data = data; }
  /** Called every frame: glide toward the server position. */
  update(dt) {
    const k = 1 - Math.exp(-dt * 18);
    this.x += (this.data.x - this.x) * k;
    this.y += (this.data.y - this.y) * k;
  }
  /** Draw order: things further down the screen are drawn later (in front). */
  get depth() { return this.y; }
  /** Light this entity gives off as { radius, strength }, or null. */
  get light() { return null; }
  draw(r, view) {}
}

/** An entity that walks: tracks its screen velocity for walk cycles and facing. */
export class Character extends Entity {
  constructor(data) {
    super(data);
    this.vx = 0; this.vy = 0;  // smoothed screen velocity, px/s
    this.face = 1;             // 1 = right, -1 = left
    this.moving = false;
    this.walkTime = 0;
  }
  update(dt) {
    const bx = this.x, by = this.y;
    super.update(dt);
    if (dt <= 0) return;
    this.vx = this.vx * 0.8 + (this.x - bx) * TS / dt * 0.2;
    this.vy = this.vy * 0.8 + (this.y - by) * TS / dt * 0.2;
    if (Math.abs(this.vx) > 4) this.face = this.vx < 0 ? -1 : 1;
    this.moving = Math.hypot(this.vx, this.vy) > 8;
    this.walkTime = this.moving ? this.walkTime + dt : 0;
  }
  /** 4-step walk cycle: stride, pass, other stride, pass. */
  get walkFrame() { return this.moving ? [1, 0, 2, 0][Math.floor(this.walkTime * 8) % 4] : 0; }
}

/** Word above an enemy or chest: removed letters show as "_", the next one is highlighted. */
function drawLabel(r, view, d, x, y, colors) {
  const word = '_'.repeat(d.p) + d.word.slice(d.p);
  const shake = d.wrong ? Math.round(Math.sin(view.now / 15) * 2) : 0;
  const wordY = y - (view.insight ? 8 : 0);
  // Circlet of Insight: the Morse code for the next letter, just under the word
  if (view.insight) r.smallText(prettyMorse(MORSE[d.word[d.p]]), x, wordY + 17, '#fff59d');
  drawWord(r.ctx, word, x + shake, wordY, i => i < d.p ? colors.done : i === d.p ? (d.wrong ? '#ef5350' : colors.next) : colors.rest);
}

// ------------------------------------------------------------------ player

export class Player extends Character {
  get light() { return { radius: this.data.dead ? 40 : 120 + Math.sin(performance.now() / 300) * 3, strength: 1 }; }

  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    if (d.dead) ctx.globalAlpha = 0.35;
    r.shadow(sx, sy, 6);
    // On touch screens, a faint ring under your own caster shows it can be tapped for the item menu.
    if (view.touch && this.id === view.myId && !d.dead) r.tapHint(sx, sy - 8, view.now);
    const frame = this.walkFrame;
    const img = wizardSprite(d.color, d.hurt && Math.floor(view.now / 60) % 2 === 0, frame);
    r.drawFacing(img, sx, sy - img.height + 2 - (this.moving && frame === 0 ? 1 : 0), img.width, img.height, this.face);
    ctx.globalAlpha = 1;
    const morse = view.morse;
    if (this.id === view.myId && (morse.spell || morse.buf)) {
      // the spell being typed floats above your own wizard
      const txt = morse.spell + (morse.buf ? '_' : '');
      drawWord(ctx, txt, sx, sy - img.height - 10 + Math.round(Math.sin(view.now / 150)), i => i < morse.spell.length ? '#ffffff' : d.color);
      if (morse.spell) r.aimRing(sx, sy - 6, d.color, view.now);
    } else if (this.id !== view.myId) r.smallText(d.name, sx, sy - img.height - 4, d.color);
  }
}

// ------------------------------------------------------------------ enemies

export class Enemy extends Character {
  static create(data) { return data.type === 'slime' ? new Slime(data) : data.type === 'boss' ? new Boss(data) : new Mage(data); }
  get labelColors() { return { done: '#5d8a5f', next: '#ffd54f', rest: '#ffffff' }; }
  /** Subclasses return { img, w, h, bob } for this frame. */
  pose(view) { throw new Error('not implemented'); }

  draw(r, view) {
    const d = this.data, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    r.shadow(sx, sy, 6);
    const { img, w, h, bob } = this.pose(view);
    r.drawFacing(img, sx, sy - h + 2 - bob, w, h, this.face);
    const ly = sy - img.height - 10 - bob + (d.wrong ? Math.round(Math.sin(view.now / 20)) : 0);
    drawLabel(r, view, d, sx, ly, this.labelColors);
  }
}

export class Slime extends Enemy {
  /** Hop-squash while moving, gentle breathing when idle. */
  pose(view) {
    const img = enemySprite('slime', this.data.flash);
    const t = this.moving ? this.walkTime * 9 : view.now / 300 + this.id;
    const sq = this.moving ? Math.sin(t) : Math.sin(t) * 0.35;
    return {
      img, w: Math.round(img.width * (1 + sq * 0.15)), h: Math.round(img.height * (1 - sq * 0.15)),
      bob: this.moving ? Math.round(Math.max(0, -Math.sin(t)) * 4) : 0,
    };
  }
}

export class Mage extends Enemy {
  pose(view) {
    const frame = this.walkFrame, img = enemySprite('mage', this.data.flash, frame);
    return { img, w: img.width, h: img.height, bob: this.moving ? (frame === 0 ? 1 : 0) : Math.round(Math.sin(view.now / 400 + this.id)) };
  }
}

/**
 * The Bellwraith. Its name is only shown in Morse (dots and dashes); letters you already spelled show as letters.
 * While its shield is up it rings a letter on its bell in Morse: the bell and eyes flash (and you hear it).
 * `this.lit` is set every frame by the BellChant player in game.js.
 */
export class Boss extends Enemy {
  constructor(data) { super(data); this.lit = false; }
  get light() { return { radius: this.lit ? 90 : 60, strength: this.data.shield ? 0.8 : 0.95 }; }

  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    const bob = Math.round(Math.sin(view.now / 350) * 2) + 3; // it floats
    r.shadow(sx, sy, 10);
    const img = wraithSprite(d.flash, this.lit, d.phase);
    const top = sy - img.height - bob;
    r.drawFacing(img, sx, top, img.width, img.height, this.face);
    // the bell, held out to one side, swings while it rings
    const bell = bellSprite(this.lit), swing = this.lit ? 2 : Math.round(Math.sin(view.now / 500));
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx + this.face * 9, top + 9, this.face * 3, 1);
    ctx.drawImage(bell, Math.round(sx + this.face * 13 - bell.width / 2 + swing), top + 6);
    if (this.lit && d.shield) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff59d'; r.orb(sx + this.face * 13, top + 10, 7, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (d.shield) { // the bell shield: a shimmering ring
      ctx.strokeStyle = '#80deea'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(view.now / 160); ctx.lineWidth = 1;
      r.orb(sx, sy - 12 - bob, 17, 19); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#80deea'; ctx.fill(); ctx.globalAlpha = 1;
    }
    const shake = d.wrong ? Math.round(Math.sin(view.now / 15) * 2) : 0;
    const ly = top - 10;
    r.morseWord(d.word, d.p, sx + shake, ly, d.shield);
    if (d.shield) r.smallText(view.insight ? `bell rings ${d.chant}` : 'listen to the bell', sx, ly - 2, '#80deea');
    else r.smallText(view.insight ? `next: ${d.word[d.p]}` : `stunned ${d.open}s`, sx, ly - 2, '#ffd54f');
  }
}

// ------------------------------------------------------------------ chest

export class Chest extends Entity {
  get light() { return this.data.open ? null : { radius: 26, strength: 0.5 }; }
  draw(r, view) {
    const d = this.data, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    r.shadow(sx, sy + 1, 7);
    const img = chestSprite(d.open, d.flash);
    r.ctx.drawImage(img, sx - (img.width >> 1), sy - img.height + 3);
    if (d.open) return;
    if (Math.random() < 0.04) view.particles.sparkle(this.x + (Math.random() - 0.5) * 14 / TS, this.y, '#ffd54f');
    drawLabel(r, view, d, sx, sy - img.height - 8, { done: '#8a7a3f', next: '#ffffff', rest: '#ffd54f' });
  }
}

// ------------------------------------------------------------------ spell

export class Spell extends Entity {
  get depth() { return this.y + 0.05; }
  get color() { return this.data.o === 'e' ? '#ff5252' : (this.data.c || '#4fc3f7'); }
  get light() { return { radius: 34, strength: 0.8 }; }
  draw(r, view) {
    const ctx = r.ctx, { x: sx, y: base } = r.toScreen(this.x, this.y), sy = base - 8;
    const letters = this.data.l, half = (letters.length - 1) * 3, pulse = Math.sin(view.now / 80) * 1.5;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.35; r.orb(sx, sy, half + 7 + pulse, 7 + pulse); ctx.fill();
    ctx.globalAlpha = 1; r.orb(sx, sy, half + 5, 5); ctx.fill();
    r.shadow(sx, sy + 8, 3 + half / 2);
    drawWord(ctx, letters, sx, sy - 4, () => '#fff');
    if (Math.random() < 0.5) view.particles.trail(this.x, this.y, this.color);
  }
}

// ------------------------------------------------------------------ floor item

export class FloorItem extends Entity {
  get depth() { return this.y - 0.2; }
  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    const img = itemSprite(d.kind, d.type, d.slot);
    const bob = Math.round(Math.sin(view.now / 300 + this.x * 3));
    r.shadow(sx, sy, 4);
    ctx.drawImage(img, sx - (img.width >> 1), sy - img.height - 1 + bob);
    if (Math.floor(view.now / 120 + this.x * 7) % 25 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 2, sy - img.height + bob, 1, 1); }
  }
}
