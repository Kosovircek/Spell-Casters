// Touch controls for phones and tablets.
// Left half of the screen: a floating joystick. It appears wherever the finger lands, and the
// direction from that point to the finger is where the caster walks.
// Right half: a Morse key anywhere. Short tap = dot, long press = dash (same timing as Numpad 5),
// and a swipe casts the spell in the swiped direction, snapped to the 8 numpad directions.
import { $, normalize } from './constants.js';

const STICK_RADIUS = 48;   // px the knob can travel from the joystick centre
const DEAD_ZONE = 10;      // px of finger travel before the caster starts walking
const SWIPE_MIN = 30;      // px of finger travel that turns a Morse press into a cast swipe

export class TouchInput {
  /** game provides: morse, audio, settings, hud, input, isPlaying(). */
  constructor(game) {
    this.game = game;
    this.el = $('touch');
    this.base = $('stick-base');
    this.knob = $('stick-knob');
    this.ripple = $('touch-ripple');
    this.stick = null;    // { id, ox, oy } the finger steering the joystick
    this.key = null;      // { id, x, y, swipe } the finger on the Morse side
    this.dashTimer = null;

    // Any touch switches the page into touch mode (shows the touch hints and the settings button).
    addEventListener('touchstart', () => this.enable(), { passive: true, capture: true });
    if (matchMedia('(pointer: coarse)').matches) this.enable();

    const opts = { passive: false };
    this.el.addEventListener('touchstart', (e) => this.onStart(e), opts);
    this.el.addEventListener('touchmove', (e) => this.onMove(e), opts);
    this.el.addEventListener('touchend', (e) => this.onEnd(e, false), opts);
    this.el.addEventListener('touchcancel', (e) => this.onEnd(e, true), opts);
    // Stop pinch zoom and double-tap zoom anywhere outside of menus.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => { if (game.isPlaying()) e.preventDefault(); });
    $('touch-settings').addEventListener('click', () => game.input.toggleSettings());
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    this.game.hud.touchMode = true;
    this.game.hud.renderMorse(this.game.morse);
    dispatchEvent(new Event('resize')); // the canvas fills the whole screen on touch devices
  }

  /** Called when entering the dungeon: go full screen and hold landscape where the browser allows it. */
  async goFullscreen() {
    if (!this.enabled) return;
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch {}
    try { await screen.orientation?.lock?.('landscape'); } catch {}
  }

  vibrate(ms) {
    if (this.game.settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} }
  }

  // ------------------------------------------------------------------ touch events
  onStart(e) {
    e.preventDefault();
    if (!this.game.isPlaying()) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2) {
        if (!this.stick) { this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY }; this.drawStick(t.clientX, t.clientY); }
      } else if (!this.key) this.keyDown(t);
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) this.steer(t.clientX, t.clientY);
      else if (this.key && t.identifier === this.key.id) this.keyMove(t);
    }
  }

  onEnd(e, cancelled) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) this.releaseStick();
      else if (this.key && t.identifier === this.key.id) this.keyUp(t, cancelled);
    }
  }

  // ------------------------------------------------------------------ left half: joystick
  steer(x, y) {
    const s = this.stick;
    let dx = x - s.ox, dy = y - s.oy;
    const dist = Math.hypot(dx, dy);
    // Past the rim, the joystick slides along behind the finger, so turning around is quick.
    if (dist > STICK_RADIUS) { s.ox = x - dx / dist * STICK_RADIUS; s.oy = y - dy / dist * STICK_RADIUS; dx = x - s.ox; dy = y - s.oy; }
    this.drawStick(x, y);
    if (dist < DEAD_ZONE) { this.game.input.setTouchMove(0, 0); return; }
    const d = normalize(dx, dy); // full speed in any direction, like the keyboard
    this.game.input.setTouchMove(d.x, d.y);
  }

  releaseStick() {
    this.stick = null;
    this.base.hidden = true;
    this.game.input.setTouchMove(null);
  }

  drawStick(x, y) {
    const s = this.stick;
    this.base.hidden = false;
    this.base.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    this.knob.style.transform = `translate(${x - s.ox}px, ${y - s.oy}px)`;
  }

  // ------------------------------------------------------------------ right half: Morse key
  keyDown(t) {
    const g = this.game, now = performance.now();
    this.key = { id: t.identifier, x: t.clientX, y: t.clientY, swipe: false };
    g.morse.press(now);
    g.audio.toneOn();
    this.showRipple(t.clientX, t.clientY, 'down');
    // A light buzz the moment the press becomes a dash, so you can feel when to let go.
    clearTimeout(this.dashTimer);
    this.dashTimer = setTimeout(() => { if (this.key && !this.key.swipe) { this.vibrate(15); this.showRipple(this.key.x, this.key.y, 'dash'); } }, g.morse.dashAt);
  }

  keyMove(t) {
    const k = this.key;
    if (k.swipe || Math.hypot(t.clientX - k.x, t.clientY - k.y) < SWIPE_MIN) return;
    // The finger travelled: this is a cast swipe, not a dot or dash.
    k.swipe = true;
    clearTimeout(this.dashTimer);
    this.game.audio.toneOff();
    this.game.morse.cancelPress();
    this.ripple.hidden = true;
  }

  keyUp(t, cancelled) {
    const g = this.game, k = this.key;
    this.key = null;
    clearTimeout(this.dashTimer);
    if (k.swipe) {
      if (cancelled) return;
      const dir = snap8(t.clientX - k.x, t.clientY - k.y);
      if (g.morse.spell || g.morse.buf) this.vibrate(30);
      g.input.castToward(dir);
      return;
    }
    g.audio.toneOff();
    if (cancelled) { g.morse.cancelPress(); this.ripple.hidden = true; return; }
    g.morse.release(performance.now());
    this.ripple.hidden = true;
  }

  showRipple(x, y, cls) {
    const r = this.ripple;
    r.hidden = false;
    r.className = cls;
    r.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Let go of everything (menus opened, window lost focus). */
  releaseAll() {
    if (this.stick) this.releaseStick();
    if (this.key) { this.key = null; clearTimeout(this.dashTimer); this.game.audio.toneOff(); this.game.morse.cancelPress(); this.ripple.hidden = true; }
  }
}

/** Snap a swipe to the nearest of the 8 numpad directions, as a [x, y] pair of -1, 0 or 1. */
export function snap8(dx, dy) {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
}
