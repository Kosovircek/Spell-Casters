// Things drawn in the dungeon. Each class mirrors a server entity and knows how to draw itself.
//
//   Entity ── Character ── Player
//      │            └───── Enemy ── Slime
//      │                       ├─── Mage
//      │                       └─── Boss (the Bellwraith)
//      ├── Chest
//      ├── Critter (zoo animals, practice dummies and the wishing fountain on the surface)
//      ├── Spell
//      └── FloorItem
import { TS, prettyMorse } from './constants.js';
import { drawWord } from './art/font.js';
import { wizardSprite, enemySprite, chestSprite, itemSprite, wraithSprite, bellSprite } from './art/sprites.js';
import { critterSprite } from './art/critters.js';
import { MORSE } from './morse.js';

export const ORB_LIFT = 8;      // px a spell's orb floats above its spot on the floor; hitboxes are drawn at this height
const SPELL_LEAD_MS = 80;       // never carry a spell further than this past its newest snapshot

// ------------------------------------------------------------------ base classes

export class Entity {
  constructor(data) {
    this.id = data.id;
    this.x = data.x; this.y = data.y;        // position used for drawing
    this.data = data;                        // latest snapshot from the server
    this.samples = [];                       // recent { t (server time), x, y }, oldest first
    this.local = null;                       // { x, y } predicted on this device (my own caster), drawn instead
    this.hx = data.x; this.hy = data.y;      // where the server had it at render time (hitboxes are drawn here)
  }
  /** New snapshot from the server (20 times a second); t is the server's time for it. */
  sync(data, t) {
    this.data = data;
    if (t === undefined) return;
    this.samples.push({ t, x: data.x, y: data.y });
    if (this.samples.length > 12) this.samples.shift();
  }
  /**
   * Called every frame. Draws everyone a little in the past (renderT, in server time) and slides between the
   * two snapshots around that moment, so movement stays smooth even when Wi-Fi delivers snapshots unevenly.
   */
  update(dt, renderT, nowT) {
    const p = this.serverPositionAt(renderT);
    // my own caster is drawn where prediction says, ahead of the server; everything else where the server had it
    const at = this.local || p;
    this.x = at.x; this.y = at.y;
    // hitbox: for my own caster, where the server has me now (behind my predicted wizard only by the real
    // network delay); for everyone else, exactly where they are drawn
    const h = this.local ? this.serverPositionAt(nowT) : p;
    this.hx = h.x; this.hy = h.y;
  }
  /** Where the server had this entity at renderT, sliding between the two snapshots around that moment. */
  serverPositionAt(renderT) {
    const s = this.samples;
    if (!s.length || renderT === undefined) return this.data;
    const last = s[s.length - 1];
    if (renderT <= s[0].t) return s[0];
    if (renderT >= last.t) return last;
    let i = s.length - 2;
    while (i > 0 && s[i].t > renderT) i--;
    const a = s[i], b = s[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 3) return b; // a teleport: no sliding across the map
    const f = (renderT - a.t) / (b.t - a.t || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
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
  update(dt, renderT, nowT) {
    const bx = this.x, by = this.y;
    super.update(dt, renderT, nowT);
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
    if (d.dead) ctx.globalAlpha = 0.35; else if (d.hidden) ctx.globalAlpha = 0.45; // Ring of Gyges
    r.shadow(sx, sy, 6);
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
    if (view.duel && !d.dead) { // in a duel, HP under every caster's feet
      const w = 16, filled = Math.round(w * Math.max(0, d.hp) / d.maxHp);
      ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - w / 2 - 1, sy + 3, w + 2, 4);
      ctx.fillStyle = '#3a1d24'; ctx.fillRect(sx - w / 2, sy + 4, w, 2);
      ctx.fillStyle = d.hp / d.maxHp > 0.3 ? '#81c784' : '#ef5350'; ctx.fillRect(sx - w / 2, sy + 4, filled, 2);
    }
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
    this.drawStatus(r, view, sx, sy - h - bob);
  }
  /** Little stars circling a stunned enemy; sparks off a burning one. */
  drawStatus(r, view, sx, top) {
    const d = this.data, ctx = r.ctx;
    if (d.stun) {
      ctx.fillStyle = '#fff59d';
      for (let k = 0; k < 3; k++) {
        const a = view.now / 250 + k * 2.1;
        ctx.fillRect(Math.round(sx + Math.cos(a) * 7), Math.round(top + 2 + Math.sin(a) * 2), 2, 2);
      }
    }
    if (d.burn && Math.random() < 0.4) view.particles.sparkle(this.x + (Math.random() - 0.5) * 0.4, this.y, '#ff7043');
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

// ------------------------------------------------------------------ surface critters

/**
 * Something friendly on the surface with a word to spell: a zoo animal (fed when you spell its letter), a
 * practice dummy or the wishing fountain. Zoo slimes, mages and the Bellwraith reuse the dungeon's sprites.
 */
export class Critter extends Character {
  get light() { return this.data.kind === 'fountain' ? { radius: 46, strength: 0.6 } : null; }
  draw(r, view) {
    const d = this.data;
    if (d.kind === 'fountain') return this.drawFountain(r, view);
    const ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    let img, bob = 0, w, h;
    if (d.kind === 'slime' || d.kind === 'mage') img = enemySprite(d.kind, d.flash, d.kind === 'mage' ? this.walkFrame : 0);
    else if (d.kind === 'boss') { img = wraithSprite(d.flash, d.happy, 1); bob = Math.round(Math.sin(view.now / 350) * 2) + 3; }
    else img = critterSprite(d.kind, d.flash);
    w = img.width; h = img.height;
    if (d.happy) bob += d.kind === 'dummy' ? 0 : Math.round(Math.abs(Math.sin(view.now / 90)) * 5); // a happy hop
    else if (this.moving && d.kind !== 'boss') bob += Math.round(Math.abs(Math.sin(this.walkTime * (d.kind === 'hopper' ? 9 : 14))) * (d.kind === 'hopper' ? 4 : 1));
    if (d.kind === 'slime' && !d.happy) { const sq = Math.sin(view.now / 300 + this.id) * 0.06; w = Math.round(w * (1 + sq)); h = Math.round(h * (1 - sq)); }
    r.shadow(sx, sy, Math.min(8, Math.round(w / 2.5)));
    const wobble = d.kind === 'dummy' && (d.happy || d.wrong) ? Math.round(Math.sin(view.now / 40) * 2) : 0;
    r.drawFacing(img, sx + wobble, sy - h + 2 - bob, w, h, d.kind === 'dummy' ? 1 : this.face);
    if (d.happy) {
      if (d.kind !== 'dummy' && Math.random() < 0.15) view.particles.sparkle(this.x + (Math.random() - 0.5) * 0.6, this.y - 0.5, '#f48fb1');
      return; // a new word comes once it is done being happy
    }
    const ly = sy - h - 10 - bob;
    if (d.kind === 'boss') r.morseWord(d.word, d.p, sx, ly, false); // even in the zoo the Bellwraith's name is Morse only
    else drawLabel(r, view, d, sx, ly, d.kind === 'dummy' ? { done: '#8a7a3f', next: '#ffd54f', rest: '#ffffff' } : { done: '#7c9a7e', next: '#f8bbd0', rest: '#ffffff' });
  }
  /** A round stone basin with a spout in the middle; the water ripples and the jet sparkles. */
  drawFountain(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y), t = view.now;
    ctx.fillStyle = '#4a4560'; r.orb(sx, sy + 2, 24, 21); ctx.fill();               // the rim's shadow side
    ctx.fillStyle = '#a7a3b8'; r.orb(sx, sy, 24, 20); ctx.fill();                   // stone rim
    ctx.fillStyle = '#d6d2e4'; r.orb(sx, sy - 1, 23, 19); ctx.fill();
    ctx.fillStyle = '#1e4f7a'; r.orb(sx, sy, 20, 16); ctx.fill();                   // the water
    ctx.fillStyle = d.flash ? '#e1f5fe' : '#2f7fb5'; r.orb(sx, sy - 1, 18, 14); ctx.fill();
    ctx.strokeStyle = '#80deea'; ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) { // ripples spreading from the spout
      const f = ((t / 1400) + k / 2) % 1;
      ctx.globalAlpha = 1 - f; r.orb(sx, sy - 1, 4 + f * 14, 2 + f * 11); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a1020'; ctx.fillRect(sx - 3, sy - 15, 6, 15);               // the spout
    ctx.fillStyle = '#a7a3b8'; ctx.fillRect(sx - 2, sy - 14, 4, 14);
    ctx.fillStyle = '#d6d2e4'; ctx.fillRect(sx - 2, sy - 14, 1, 14);
    ctx.fillStyle = '#1a1020'; ctx.fillRect(sx - 5, sy - 18, 10, 4);
    ctx.fillStyle = '#d6d2e4'; ctx.fillRect(sx - 4, sy - 17, 8, 2);
    if (Math.random() < 0.6) view.particles.trail(this.x + (Math.random() - 0.5) * 0.2, this.y - 0.9, '#b3e5fc');
    if (d.happy && Math.random() < 0.4) view.particles.sparkle(this.x + (Math.random() - 0.5) * 2, this.y - 0.4, '#ffd54f');
    if (!d.happy) drawLabel(r, view, d, sx, sy - 40, { done: '#4f7a8f', next: '#ffd54f', rest: '#b3e5fc' });
  }
}

// ------------------------------------------------------------------ spell

export class Spell extends Entity {
  get depth() { return this.y + 0.05; }
  get color() { return this.data.o === 'e' ? '#ff5252' : (this.data.c || '#4fc3f7'); }
  get light() { return { radius: 34, strength: 0.8 }; }
  /**
   * Spells fly fast (8 tiles a second) and straight, so drawing them 100 ms in the past like everything else
   * would put them most of a tile behind where the server really has them. Instead they are carried forward
   * from the newest snapshot to the server's present (at most a tick or so), which is where they hit.
   */
  update(dt, renderT, nowT) {
    const s = this.samples, last = s[s.length - 1];
    if (!last || nowT === undefined || nowT <= last.t || s.length < 2) return super.update(dt, renderT, nowT);
    const prev = s[s.length - 2], span = last.t - prev.t;
    const ahead = Math.min(nowT - last.t, SPELL_LEAD_MS);
    const jump = Math.hypot(last.x - prev.x, last.y - prev.y) > 3; // a teleport: do not fly on from it
    const f = span > 0 && !jump ? ahead / span : 0;
    this.x = this.hx = last.x + (last.x - prev.x) * f;
    this.y = this.hy = last.y + (last.y - prev.y) * f;
  }
  draw(r, view) {
    const ctx = r.ctx, { x: sx, y: base } = r.toScreen(this.x, this.y), sy = base - ORB_LIFT;
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
    const img = itemSprite(d.kind, d.type, d.slot, d.color);
    const bob = Math.round(Math.sin(view.now / 300 + this.x * 3));
    r.shadow(sx, sy, 4);
    ctx.drawImage(img, sx - (img.width >> 1), sy - img.height - 1 + bob);
    if (Math.floor(view.now / 120 + this.x * 7) % 25 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 2, sy - img.height + bob, 1, 1); }
  }
}
