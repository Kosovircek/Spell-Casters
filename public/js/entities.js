// Things drawn in the dungeon. Each class mirrors a server entity and knows how to draw itself.
//
//   Entity ── Character ── Player
//      │            └───── Enemy ── Slime
//      │                       ├─── Mage
//      │                       ├─── Creature (every other kind, the new bosses too; art in art/monsters.js)
//      │                       └─── Boss (the Bellwraith)
//      ├── Chest
//      ├── Critter (zoo animals, practice dummies and the wishing fountain on the surface)
//      ├── Spell (letter spells, and the rune orbs of effect spells)
//      ├── Minion (summons from effect spells; art in art/summons.js)
//      └── FloorItem
import { TS, prettyMorse } from './constants.js';
import { drawWord } from './art/font.js';
import { wizardSprite, enemySprite, chestSprite, itemSprite, wraithSprite, bellSprite } from './art/sprites.js';
import { critterSprite } from './art/critters.js';
import { MONSTERS, monsterSprite } from './art/monsters.js';
import { MORSE, RUNE } from './morse.js';
import { summonSprite, FLYING } from './art/summons.js';

export const RUNE_COLOR = '#e040fb'; // the rune ..-- (an effect spell) glows violet wherever it is drawn
const SCHOOL_COLOR = { elements: '#ff8a65', summons: '#aed581', control: '#4fc3f7', utility: '#ce93d8' };
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

/**
 * Word above an enemy or chest: removed letters show as "_", the next one is highlighted.
 * Some rare enemies change how it is shown: d.show (the word as you may see it, e.g. with ? for hidden
 * letters), d.rev (written back to front) or d.morse (only dots and dashes).
 */
function drawLabel(r, view, d, x, y, colors) {
  const shake = d.wrong ? Math.round(Math.sin(view.now / 15) * 2) : 0;
  const wordY = y - (view.insight ? 8 : 0);
  // Circlet of Insight: the Morse code for the next letter, just under the word
  if (view.insight && d.word[d.p]) r.smallText(prettyMorse(MORSE[d.word[d.p]]), x, wordY + 17, '#fff59d');
  if (d.morse) { r.morseWord(d.word, d.p, x + shake, wordY + 3, false); return; }
  const shown = d.show || d.word, n = d.word.length;
  const at = (i) => (d.rev ? n - 1 - i : i); // which letter of the word sits at place i
  const text = Array.from({ length: n }, (_, i) => (at(i) < d.p ? '_' : shown[at(i)])).join('');
  drawWord(r.ctx, text, x + shake, wordY, i => at(i) < d.p ? colors.done : at(i) === d.p ? (d.wrong ? '#ef5350' : colors.next) : colors.rest);
}

/** In the Dark Catacombs enemies are seen only by their glowing words: draw the label above the darkness. */
const glowing = (view, d) => d.dark || view.world?.map?.biome === 'catacombs';
function label(r, view, d, fn) { if (glowing(view, d)) r.onTop(fn); else fn(); }

/** Asleep on a silent floor: little z's that drift up. */
function drawSleep(r, view, sx, top) { r.smallText('z z', sx + 6, top - 2 + Math.round(Math.sin(view.now / 300) * 2), '#90a4ae'); }

/** A riddle on a dark plate (the Archivist and the rune doors of the Library of Echoes). */
function drawRiddle(r, q, cx, y) {
  const ctx = r.ctx, w = Math.max(...q.map(l => l.length)) * 5 + 8;
  ctx.globalAlpha = 0.75; ctx.fillStyle = '#1a1208'; ctx.fillRect(Math.round(cx - w / 2), y - 2, w, q.length * 9 + 3);
  ctx.globalAlpha = 1; ctx.fillStyle = '#8d6e63'; ctx.fillRect(Math.round(cx - w / 2), y + q.length * 9 + 1, w, 1);
  q.forEach((l, i) => r.smallText(l, cx, y + 8 + i * 9, '#ffe0b2'));
}

/**
 * A spell being typed, centred above a caster at (cx, y): the finished letters, then the dots and dashes of the
 * letter in progress, then a blinking mark while the Morse key is held. Other casters' spells get a dark plate
 * behind them so you can read them at a glance (what is the other wizard about to throw?).
 */
function drawTyping(r, t, cx, y, color, now, plate) {
  const ctx = r.ctx, DOT = 2, DASH = 5, GAP = 2;
  const marks = [...(t.b || '')].map(c => (c === '.' ? DOT : DASH));
  if (t.k) marks.push(-1); // key held: what it will become is not known yet
  const lettersW = t.s ? t.s.length * 6 + 1 : 0;
  const marksW = marks.reduce((a, w) => a + (w < 0 ? 3 : w) + GAP, marks.length ? -GAP : 0);
  const between = lettersW && marksW ? 3 : 0;
  const total = lettersW + between + marksW;
  const left = Math.round(cx - total / 2);
  if (plate) {
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#0b0910';
    ctx.fillRect(left - 3, y - 2, total + 6, 13);
    ctx.globalAlpha = 1; ctx.fillStyle = color;
    ctx.fillRect(left - 3, y + 11, total + 6, 1); // underline in the caster's colour: whose spell this is
  }
  if (t.s) drawWord(ctx, t.s, left + lettersW / 2, y, (i) => (t.s[i] === RUNE ? RUNE_COLOR : t.s[0] === RUNE ? '#f3e5ff' : '#ffffff'));
  let x = left + lettersW + between;
  const my = y + 4; // the marks sit at the middle of the letters
  for (const w of marks) {
    if (w < 0) { // held key: a pulsing square
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 60);
      ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, my - 1, 5, 4);
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(x, my, 3, 2);
      ctx.globalAlpha = 1; x += 3 + GAP; continue;
    }
    ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, my - 1, w + 2, 4);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(x, my, w, 2);
    x += w + GAP;
  }
}

/**
 * Little marks for what effect spells did to someone: vines at the feet (rooted), a snail swirl (slowed),
 * a crossed mouth (silenced), stars (stunned), a ? (confused), green drips (corroded), a ! (afraid),
 * a silver ring (mirror) and a twin glow (clone). x, y = feet; top = top of the sprite.
 */
export function drawStatus(r, view, st, x, y, top, extra = {}) {
  if (!st || !st.length) return;
  const ctx = r.ctx, t = view.now;
  const has = (s) => st.includes(s);
  if (has('root')) {
    ctx.fillStyle = '#558b2f';
    for (let k = -2; k <= 2; k++) { const h = 3 + ((k + 3) * 7 % 3); ctx.fillRect(x + k * 3, y - h, 1, h); ctx.fillRect(x + k * 3 + (k % 2 ? 1 : -1), y - h, 1, 1); }
    ctx.fillStyle = '#8bc34a'; ctx.fillRect(x - 7, y - 1, 14, 1);
  }
  if (has('slow') || has('chill')) {
    ctx.strokeStyle = has('chill') ? '#b3e5fc' : '#80deea'; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.ellipse(x, y - 1, 8, 3, 0, t / 400, t / 400 + 4.5); ctx.stroke(); ctx.globalAlpha = 1;
  }
  let iy = top - 4;
  const icon = (ch, color) => { drawWord(ctx, ch, x + 9, iy, () => color); iy -= 9; };
  if (has('silence')) icon('-', '#ef5350');
  if (has('stun')) {
    ctx.fillStyle = '#fff59d';
    for (let k = 0; k < 3; k++) { const a = t / 250 + k * 2.1; ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(top + 2 + Math.sin(a) * 2), 2, 2); }
  }
  if (has('confuse')) icon('?', '#f48fb1');
  if (has('fear')) icon('!', '#b39ddb');
  if (has('corrode') && Math.random() < 0.3) view.particles.sparkle(extra.wx + (Math.random() - 0.5) * 0.5, extra.wy, '#9ccc65');
  if (has('mirror')) {
    ctx.strokeStyle = '#e0f7fa'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 90); ctx.lineWidth = 1;
    r.orb(x, (y + top) / 2, 9, 12); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ player

export class Player extends Character {
  get light() {
    if (this.data.dead) return { radius: 40, strength: 1 };
    const lit = this.data.st?.includes('lit'); // LUX
    return { radius: (lit ? 200 : 120) + Math.sin(performance.now() / 300) * 3, strength: 1 };
  }

  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    const mine = this.id === view.myId;
    // UMBRA or a fog bank: my own caster shows faintly, someone else's is only a shimmer (unless my LUX shows them)
    const veiled = d.conc && !mine && !view.seeHidden?.(this);
    if (veiled) return this.drawShimmer(r, view, sx, sy);
    if (d.dead) ctx.globalAlpha = 0.35; else if (d.hidden || d.conc) ctx.globalAlpha = 0.45; // Ring of Gyges
    r.shadow(sx, sy, 6);
    const frame = this.walkFrame;
    const img = wizardSprite(d.color, d.hurt && Math.floor(view.now / 60) % 2 === 0, frame);
    r.drawFacing(img, sx, sy - img.height + 2 - (this.moving && frame === 0 ? 1 : 0), img.width, img.height, this.face);
    if (d.frozen) { // a Frost Wisp's letter: frozen in place for a moment
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#b3e5fc'; r.orb(sx, sy - img.height / 2, img.width / 2 + 2, img.height / 2 + 1); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 4, sy - img.height + 3, 1, 1); ctx.fillRect(sx + 3, sy - 6, 1, 1);
    }
    ctx.globalAlpha = 1;
    if (!d.dead) drawStatus(r, view, d.st, sx, sy, sy - img.height, { wx: this.x, wy: this.y });
    if (d.clone) { ctx.globalAlpha = 0.3 + 0.15 * Math.sin(view.now / 120); r.drawFacing(img, sx + 6, sy - img.height + 1, img.width, img.height, this.face); ctx.globalAlpha = 1; } // GEMINI
    const morse = view.morse;
    // The spell being typed floats above the wizard: mine from my own Morse key, everyone else's from the server.
    const typing = mine ? { s: morse.spell, b: morse.buf, k: morse.isDown } : d.dead ? null : d.ty;
    const shown = typing && (typing.s || typing.b || typing.k);
    const wordY = sy - img.height - 10 + Math.round(Math.sin(view.now / 150));
    if (shown) r.onTop(() => drawTyping(r, typing, sx, wordY, d.color, view.now, !mine));
    if (mine && morse.spell) r.aimRing(sx, sy - 6, d.color, view.now);
    if (!mine) r.smallText(d.name, sx, shown ? wordY - 3 : sy - img.height - 4, d.color);
    if (view.duel && !d.dead) { // in a duel, HP (and mana) under every caster's feet
      const w = 16, filled = Math.round(w * Math.max(0, d.hp) / d.maxHp);
      ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - w / 2 - 1, sy + 3, w + 2, d.maxMana ? 6 : 4);
      ctx.fillStyle = '#3a1d24'; ctx.fillRect(sx - w / 2, sy + 4, w, 2);
      ctx.fillStyle = d.hp / d.maxHp > 0.3 ? '#81c784' : '#ef5350'; ctx.fillRect(sx - w / 2, sy + 4, filled, 2);
      if (d.maxMana) { ctx.fillStyle = '#1d2340'; ctx.fillRect(sx - w / 2, sy + 6, w, 2); ctx.fillStyle = '#7c4dff'; ctx.fillRect(sx - w / 2, sy + 6, Math.round(w * d.mana / d.maxMana), 2); }
    }
  }
  /** An invisible caster: a faint ripple in the air, nothing more. */
  drawShimmer(r, view, sx, sy) {
    const ctx = r.ctx, t = view.now;
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t / 150);
    ctx.strokeStyle = '#e0e0ff'; ctx.lineWidth = 1;
    r.orb(sx, sy - 8, 5 + Math.sin(t / 200), 9); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ enemies

export class Enemy extends Character {
  static create(data) {
    if (data.type === 'slime') return new Slime(data);
    if (data.type === 'boss') return new Boss(data);
    if (MONSTERS[data.type]) return new Creature(data);
    return new Mage(data);
  }
  get labelColors() { return { done: '#5d8a5f', next: '#ffd54f', rest: '#ffffff' }; }
  /** Subclasses return { img, w, h, bob } for this frame. */
  pose(view) { throw new Error('not implemented'); }

  draw(r, view) {
    const d = this.data, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    r.shadow(sx, sy, 6);
    const { img, w, h, bob } = this.pose(view);
    r.drawFacing(img, sx, sy - h + 2 - bob, w, h, this.face);
    const ly = sy - img.height - 10 - bob + (d.wrong ? Math.round(Math.sin(view.now / 20)) : 0);
    label(r, view, d, () => drawLabel(r, view, d, sx, ly, this.labelColors));
    if (d.zz) drawSleep(r, view, sx, sy - h - bob);
    this.drawStatus(r, view, sx, sy - h - bob);
  }
  /** Little stars circling a stunned enemy; sparks off a burning one. */
  drawStatus(r, view, sx, top) {
    const d = this.data, ctx = r.ctx;
    if (d.st) drawStatus(r, view, d.st.filter(s => s !== 'stun'), sx, r.toScreen(this.x, this.y).y, top, { wx: this.x, wy: this.y }); // effect spells
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
 * Every enemy kind drawn from art/monsters.js, rare ones and new bosses included. Besides the sprite it
 * shows what the server says about the enemy's trick: a timer or key over its word (d.tag), a faded or
 * downed body, an aura (Warhorn Goblin), a guard ring (Gravekeeper), sand (Hourglass Golem) and the
 * Hydra's heads, each with a word of its own.
 */
export class Creature extends Enemy {
  get art() { return MONSTERS[this.data.type]; }
  get light() { return this.art.light ? { radius: 46, strength: 0.6 } : null; }
  /** Which of the Hydra's heads are still up, as a bitmask (the sprite leaves the others out). */
  get variant() { return this.data.heads ? this.data.heads.reduce((m, h, i) => m | (h.up ? 1 << i : 0), 0) : 0; }
  pose(view) {
    const style = this.art.pose, frame = style === 'walk' ? this.walkFrame : 0;
    const img = this.art.wizard // a Reflection: a caster in the colour of the one it copies
      ? wizardSprite(this.data.mimic || '#e1f5fe', this.data.flash, frame)
      : monsterSprite(this.data.type, this.data.flash, frame, this.variant);
    let w = img.width, h = img.height, bob = 0;
    if (style === 'hop') {
      const t = this.moving ? this.walkTime * 9 : view.now / 300 + this.id, sq = this.moving ? Math.sin(t) : Math.sin(t) * 0.35;
      w = Math.round(w * (1 + sq * 0.12)); h = Math.round(h * (1 - sq * 0.12));
      bob = this.moving ? Math.round(Math.max(0, -Math.sin(t)) * 3) : 0;
    } else if (style === 'float') bob = 3 + Math.round(Math.sin(view.now / 260 + this.id) * 2);
    else if (style === 'skitter') bob = this.moving ? Math.round(Math.abs(Math.sin(this.walkTime * 22))) : 0;
    else if (style === 'walk') bob = this.moving ? (frame === 0 ? 1 : 0) : Math.round(Math.sin(view.now / 500 + this.id) * 0.6);
    return { img, w, h, bob };
  }

  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    if (d.disguise) return this.drawAsChest(r, view, sx, sy);
    if (d.sub) return this.drawSubmerged(r, view, sx, sy);
    const { img, w, h, bob } = this.pose(view);
    if (d.aura) { // the Warhorn Goblin's reach: everyone inside throws twice as fast
      ctx.strokeStyle = d.aura; ctx.lineWidth = 1; ctx.globalAlpha = 0.18 + 0.08 * Math.sin(view.now / 200);
      r.orb(sx, sy, 5 * 16, 5 * 16 * 0.75); ctx.stroke(); ctx.globalAlpha = 1;
    }
    r.shadow(sx, sy, Math.min(11, Math.max(4, Math.round(w / 2.6))));
    ctx.globalAlpha = d.faded ? 0.2 : d.downed ? 0.4 : this.art.wizard ? 0.75 : (this.art.alpha || 1);
    r.drawFacing(img, sx, sy - h + 2 - bob, w, h, this.face);
    ctx.globalAlpha = 1;
    const top = sy - h - bob;
    if (d.ward) { // the Gravekeeper's guard: spells bounce off while its raised dead stand
      ctx.strokeStyle = d.ward; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(view.now / 160); ctx.lineWidth = 1;
      r.orb(sx, sy - h / 2, w / 2 + 5, h / 2 + 4); ctx.stroke();
      ctx.globalAlpha = 0.1; ctx.fillStyle = d.ward; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (d.downed) { r.smallText('z z', sx + 6, top - 2 + Math.round(Math.sin(view.now / 300) * 2), '#c6ff00'); }
    else if (d.zz) drawSleep(r, view, sx, top);
    let ly = top - 10 + (d.wrong ? Math.round(Math.sin(view.now / 20)) : 0);
    if (d.heads) ly = this.drawHeads(r, view, sx, top, img.width);
    else if (!d.downed) {
      const colors = d.boss || d.phase !== undefined ? { done: '#7c9a7e', next: '#ffd54f', rest: d.dark ? '#b39ddb' : '#ffffff' } : this.labelColors;
      label(r, view, d, () => { if (d.faded) ctx.globalAlpha = 0.45; drawLabel(r, view, d, sx, ly, colors); ctx.globalAlpha = 1; });
      for (const x of d.extra || []) { ly -= 12; const at = ly; label(r, view, d, () => drawLabel(r, view, x, sx, at, { done: '#7c9a7e', next: '#ffd54f', rest: x.color || '#ffffff' })); } // a second word (the Frost Matron's shell)
      if (d.q) { const at = ly - 4 - d.q.length * 9; r.onTop(() => drawRiddle(r, d.q, sx, at)); ly = at; }
    }
    if (d.tag) r.smallText(d.tag, sx, ly - (d.morse ? 0 : 2) - (view.insight ? 8 : 0), d.tagColor || '#ffffff');
    if (d.sand !== undefined) this.drawSand(r, sx, ly - 6, d.sand, d.sandMax || 1);
    this.drawStatus(r, view, sx, top);
  }
  /** Under the water (Drowned, Drowned Abbot): only rings on the surface and a row of ~ for its name. */
  drawSubmerged(r, view, sx, sy) {
    const ctx = r.ctx, t = view.now, d = this.data;
    ctx.strokeStyle = '#b2dfdb'; ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) { const f = (t / 1100 + k / 2 + this.id * 0.13) % 1; ctx.globalAlpha = 0.6 * (1 - f); r.orb(sx, sy, 3 + f * 8, 1.5 + f * 4); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (Math.random() < 0.05) view.particles.sparkle(this.x + (Math.random() - 0.5) * 0.4, this.y, '#b2dfdb');
    drawLabel(r, view, d, sx, sy - 18, { done: '#4f7a8f', next: '#80cbc4', rest: '#80cbc4' });
  }
  /** Until it bites, a Mimic is drawn exactly like a closed chest. */
  drawAsChest(r, view, sx, sy) {
    const d = this.data, img = chestSprite(false, d.flash);
    r.shadow(sx, sy + 1, 7);
    r.ctx.drawImage(img, sx - (img.width >> 1), sy - img.height + 3);
    if (Math.random() < 0.04) view.particles.sparkle(this.x + (Math.random() - 0.5) * 14 / TS, this.y, '#ffd54f');
    drawLabel(r, view, d, sx, sy - img.height - 8, { done: '#8a7a3f', next: '#ffffff', rest: '#ffd54f' });
  }
  /** The Hydra: each head that is up carries its own word; when all are cut, the body's name shows. Returns the label's y. */
  drawHeads(r, view, sx, top, imgW) {
    const d = this.data, art = this.art;
    if (!d.heads.some(h => h.up)) { const ly = top - 2; drawLabel(r, view, d, sx, ly, { done: '#7c9a7e', next: '#ffd54f', rest: '#ffffff' }); return ly; }
    let highest = top;
    d.heads.forEach((h, i) => {
      if (!h.up) return;
      const hx = sx - imgW / 2 + (art.heads[i].x0 + art.heads[i].x1 + 1) / 2, ly = top - 10 - [0, 18, 9][i]; // one row per head so words never overlap
      const ctx = r.ctx; ctx.fillStyle = '#2e7d32'; ctx.fillRect(Math.round(hx), ly + 9, 1, top - ly - 8); // a thin stalk down to its head
      drawLabel(r, view, { word: h.w, p: h.p, wrong: h.wrong }, hx, ly, { done: '#7c9a7e', next: '#ffd54f', rest: '#c5e1a5' });
      highest = Math.min(highest, ly);
    });
    return highest;
  }
  /** The Hourglass Golem's sand: a bar that drains. */
  drawSand(r, sx, y, left, max) {
    const ctx = r.ctx, w = 30, f = Math.max(0, Math.min(1, left / max));
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#4e3b1f'; ctx.fillRect(sx - w / 2, y, w, 2);
    ctx.fillStyle = f > 0.3 ? '#ffe082' : '#ff7043'; ctx.fillRect(sx - w / 2, y, Math.round(w * f), 2);
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
  get light() {
    const k = this.data.kind;
    if (k === 'brazier') return this.data.lit ? { radius: 92 + Math.sin(performance.now() / 120) * 4, strength: 1 } : { radius: 14, strength: 0.4 };
    if (k === 'shrine' || k === 'altar') return { radius: 40, strength: 0.6 };
    if (k === 'riddle') return this.data.open ? null : { radius: 36, strength: 0.6 };
    return k === 'fountain' ? { radius: 46, strength: 0.6 } : null;
  }
  draw(r, view) {
    const d = this.data;
    if (d.kind === 'fountain') return this.drawFountain(r, view);
    if (d.kind === 'brazier') return this.drawBrazier(r, view);
    if (d.kind === 'riddle') return this.drawRiddleDoor(r, view);
    if (d.kind === 'shrine') return this.drawShrine(r, view);
    if (d.kind === 'altar') return this.drawAltar(r, view);
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
  /** A brazier in the catacombs: an iron bowl on three legs, a fire in it once its letter is spelled. */
  drawBrazier(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y), t = view.now;
    r.shadow(sx, sy, 6);
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - 5, sy - 6, 1, 6); ctx.fillRect(sx + 4, sy - 6, 1, 6); ctx.fillRect(sx - 1, sy - 6, 2, 7);
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - 7, sy - 11, 14, 6);
    ctx.fillStyle = d.flash ? '#ffffff' : '#5d4037'; ctx.fillRect(sx - 6, sy - 10, 12, 4);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(sx - 6, sy - 10, 12, 1);
    if (d.lit) {
      for (let k = 0; k < 5; k++) {
        const h = 5 + ((t / 50 + k * 13) % 7);
        ctx.fillStyle = k % 2 ? '#ff7043' : '#ffca28'; ctx.fillRect(sx - 5 + k * 2, sy - 10 - h, 2, h);
      }
      ctx.fillStyle = '#fff59d'; ctx.fillRect(sx - 1, sy - 14, 2, 3);
      if (Math.random() < 0.3) view.particles.sparkle(this.x + (Math.random() - 0.5) * 0.4, this.y - 0.8, '#ffca28');
      return;
    }
    ctx.fillStyle = '#37474f'; ctx.fillRect(sx - 4, sy - 11, 8, 1); // cold ashes
    r.onTop(() => drawLabel(r, view, d, sx, sy - 24, { done: '#8a7a3f', next: '#ffca28', rest: '#ffe0b2' }));
  }
  /** A rune door's riddle hangs over it; the answer's letters show as ? until spelled (or given as a hint). */
  drawRiddleDoor(r, view) {
    const d = this.data, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    if (d.open) return;
    if (Math.random() < 0.08) view.particles.sparkle(this.x + (Math.random() - 0.5), this.y, '#ffd54f');
    r.onTop(() => {
      drawRiddle(r, d.q || [], sx, sy - 34 - (d.q?.length || 0) * 9);
      drawLabel(r, view, d, sx, sy - 26, { done: '#8a7a3f', next: '#ffd54f', rest: '#ffe0b2' });
    });
  }
  /** A shrine: a stone pillar with a bowl of blood (MANA) or a violet rune that turns (SWAP). */
  drawShrine(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y), t = view.now;
    const glow = d.sk === 'blood' ? '#ff1744' : '#e040fb';
    r.shadow(sx, sy, 7);
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - 6, sy - 20, 12, 21);
    ctx.fillStyle = d.flash ? '#ffffff' : '#78718a'; ctx.fillRect(sx - 5, sy - 19, 10, 19);
    ctx.fillStyle = '#a7a3b8'; ctx.fillRect(sx - 5, sy - 19, 2, 19);
    ctx.fillStyle = '#4a4560'; ctx.fillRect(sx - 7, sy - 22, 14, 3);
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t / 200);
    ctx.fillStyle = glow;
    if (d.sk === 'blood') { ctx.fillRect(sx - 4, sy - 23, 8, 2); ctx.fillRect(sx - 1, sy - 14, 2, 6); }
    else { ctx.fillRect(sx - 1, sy - 15, 2, 8); ctx.fillRect(sx - 3, sy - 12, 6, 2); }
    ctx.globalAlpha = 1;
    if (Math.random() < 0.08) view.particles.sparkle(this.x + (Math.random() - 0.5) * 0.5, this.y - 1.2, glow);
    drawLabel(r, view, d, sx, sy - 34, { done: '#7c6a8a', next: '#ffd54f', rest: d.sk === 'blood' ? '#ff8a80' : '#ea80fc' });
  }
  /** A challenge altar: a gold-trimmed slab. Idle it asks for DARE; during a trial it burns. */
  drawAltar(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y), t = view.now;
    r.shadow(sx, sy + 1, 10);
    ctx.fillStyle = '#0b0910'; ctx.fillRect(sx - 10, sy - 10, 20, 11);
    ctx.fillStyle = d.flash ? '#ffffff' : '#5c5470'; ctx.fillRect(sx - 9, sy - 9, 18, 9);
    ctx.fillStyle = '#ffca28'; ctx.fillRect(sx - 9, sy - 9, 18, 1); ctx.fillRect(sx - 9, sy - 4, 18, 1);
    ctx.fillStyle = d.ak === 'nohit' ? '#80deea' : '#ff8a65'; ctx.fillRect(sx - 2, sy - 8, 4, 3); // timed: an ember; untouched: a pearl
    if (d.state === 'active') {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t / 90); ctx.fillStyle = '#ffd54f'; r.orb(sx, sy - 5, 16, 12); ctx.fill(); ctx.globalAlpha = 1;
      if (Math.random() < 0.3) view.particles.sparkle(this.x + (Math.random() - 0.5), this.y - 0.4, '#ffd54f');
    }
    if (d.state === 'idle') {
      r.smallText(d.ak === 'nohit' ? 'trial: untouched' : 'trial: in time', sx, sy - 22, '#ffe082');
      drawLabel(r, view, d, sx, sy - 44, { done: '#8a7a3f', next: '#ffd54f', rest: '#ffffff' });
    } else if (d.state !== 'active') r.smallText(d.state === 'won' ? 'trial won' : 'trial lost', sx, sy - 14, d.state === 'won' ? '#fff59d' : '#ef5350');
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
  get color() {
    const d = this.data;
    if (d.seed) return '#7cb342';           // a seed: a vine grows where it falls
    if (d.l === '?') return '#37474f';      // an Ink Wraith's blot, until you are close
    return d.o === 'e' ? '#ff5252' : (d.c || '#4fc3f7');
  }
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
  get light() { return this.data.rn ? { radius: 46, strength: 0.9 } : { radius: 34, strength: 0.8 }; }
  draw(r, view) {
    if (this.data.rn) return this.drawRune(r, view);
    const ctx = r.ctx, { x: sx, y: base } = r.toScreen(this.x, this.y), sy = base - ORB_LIFT;
    const letters = this.data.l, half = (letters.length - 1) * 3, pulse = Math.sin(view.now / 80) * 1.5;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.35; r.orb(sx, sy, half + 7 + pulse, 7 + pulse); ctx.fill();
    ctx.globalAlpha = 1; r.orb(sx, sy, half + 5, 5); ctx.fill();
    r.shadow(sx, sy + 8, 3 + half / 2);
    r.onTop(() => drawWord(ctx, letters, sx, sy - 4, () => '#fff')); // above the trail particles and the dark
    if (Math.random() < 0.5) view.particles.trail(this.x, this.y, this.color);
  }
  /**
   * An effect spell in flight: a spinning violet star in a halo of its school's colour, with its word above it
   * (in a duel the other caster can read it and block it letter by letter). Hail shards are small ice splinters.
   */
  drawRune(r, view) {
    const ctx = r.ctx, { x: sx, y: base } = r.toScreen(this.x, this.y), sy = base - ORB_LIFT, d = this.data, t = view.now;
    if (d.l === RUNE) { // GRANDO's shards
      ctx.fillStyle = '#e1f5fe'; ctx.save(); ctx.translate(sx, sy); ctx.rotate(t / 60);
      ctx.fillRect(-3, -1, 6, 2); ctx.fillStyle = '#4fc3f7'; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
      if (Math.random() < 0.4) view.particles.trail(this.x, this.y, '#b3e5fc');
      return;
    }
    const school = SCHOOL_COLOR[view.spellSchool?.(d.rn)] || RUNE_COLOR;
    ctx.globalAlpha = 0.3; ctx.fillStyle = school; r.orb(sx, sy, 9 + Math.sin(t / 70) * 1.5, 8); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = this.color; r.orb(sx, sy, 5, 5); ctx.fill();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t / 140);
    ctx.fillStyle = RUNE_COLOR; ctx.fillRect(-1, -6, 2, 12); ctx.fillRect(-6, -1, 12, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    r.shadow(sx, sy + 8, 4);
    r.onTop(() => drawWord(ctx, d.l, sx, sy - 16, () => '#f3e5ff'));
    if (Math.random() < 0.7) view.particles.trail(this.x, this.y, Math.random() < 0.5 ? school : RUNE_COLOR);
  }
}

// ------------------------------------------------------------------ summons

/**
 * A helper called by an effect spell. Drawn in its caster's colour; in a duel its name floats above it (spell it
 * to break it). The decoy looks exactly like its caster, name and typing included.
 */
export class Minion extends Character {
  get light() { const k = this.data.k; return k === 'drake' || k === 'ghost' || k === 'wisp' || k === 'totem' ? { radius: k === 'wisp' ? 20 : 40, strength: 0.7 } : null; }
  get depth() { return this.y + (FLYING.has(this.data.k) ? 0.6 : 0); }
  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y), t = view.now;
    if (d.k === 'decoy') return this.drawDecoy(r, view, sx, sy);
    const img = summonSprite(d.k, d.c, d.flash);
    if (!img) return;
    const fly = FLYING.has(d.k), lift = fly ? 8 + Math.round(Math.sin(t / 180 + this.id) * 2) : (this.moving ? Math.round(Math.abs(Math.sin(this.walkTime * 12))) : 0);
    r.shadow(sx, sy, Math.max(3, Math.round(img.width / 3)));
    if (d.k === 'ghost') ctx.globalAlpha = 0.75;
    if (d.k === 'totem') { ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t / 200); ctx.fillStyle = '#81c784'; r.orb(sx, sy, 3 * 16, 3 * 16 * 0.5); ctx.fill(); ctx.globalAlpha = 1; } // its healing ring
    r.drawFacing(img, sx, sy - img.height + 1 - lift, img.width, img.height, d.k === 'skull' || d.k === 'totem' ? 1 : this.face);
    ctx.globalAlpha = 1;
    if (d.k === 'wisp' && Math.random() < 0.6) view.particles.trail(this.x, this.y + 0.3, d.c);
    if (d.k === 'drake' && Math.random() < 0.1) view.particles.sparkle(this.x, this.y - 0.6, '#ff7043');
    if (d.word) drawLabel(r, view, d, sx, sy - img.height - 10 - lift, { done: '#5d8a5f', next: '#ffd54f', rest: d.c });
    else if (d.t <= 3 && d.k !== 'wisp' && Math.floor(t / 200) % 2) { ctx.fillStyle = d.c; ctx.fillRect(sx - 1, sy - img.height - 4 - lift, 2, 2); } // about to go
  }
  drawDecoy(r, view, sx, sy) {
    const d = this.data, img = wizardSprite(d.c, false, this.walkFrame);
    r.shadow(sx, sy, 6);
    r.drawFacing(img, sx, sy - img.height + 2, img.width, img.height, this.face);
    const shown = d.ty && (d.ty.s || d.ty.b || d.ty.k);
    const wordY = sy - img.height - 10 + Math.round(Math.sin(view.now / 150));
    if (shown) r.onTop(() => drawTyping(r, d.ty, sx, wordY, d.c, view.now, true));
    if (d.pid !== view.myId) r.smallText(d.name, sx, shown ? wordY - 3 : sy - img.height - 4, d.c);
    else r.smallText('(decoy)', sx, sy - img.height - 4, d.c);
  }
}

// ------------------------------------------------------------------ floor item

export class FloorItem extends Entity {
  get depth() { return this.y - 0.2; }
  draw(r, view) {
    const d = this.data, ctx = r.ctx, { x: sx, y: sy } = r.toScreen(this.x, this.y);
    if (d.h && !view.seeHidden?.(this, 2.2)) { // a hidden spellbook: a faint glint now and then, unless you are close or lit
      if (Math.floor(view.now / 90 + this.x * 13) % 40 === 0) { ctx.fillStyle = '#e1bee7'; ctx.fillRect(sx, sy - 4, 1, 1); }
      return;
    }
    const img = itemSprite(d.kind, d.type, d.slot, d.color);
    const bob = Math.round(Math.sin(view.now / 300 + this.x * 3));
    r.shadow(sx, sy, 4);
    ctx.drawImage(img, sx - (img.width >> 1), sy - img.height - 1 + bob);
    if (Math.floor(view.now / 120 + this.x * 7) % 25 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 2, sy - img.height + bob, 1, 1); }
  }
}
