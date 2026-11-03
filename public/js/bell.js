// The Bellwraith rings a letter in Morse while its shield is up. This plays it: the bell flashes
// and you hear a bell tone, at your own Morse speed from the settings. Cast that letter to break the shield.
import { MORSE } from './morse.js';

const HEAR_RANGE = 11; // tiles

export class BellChant {
  constructor({ audio, settings }) {
    this.audio = audio;
    this.settings = settings;
    this.letter = null;
    this.startedAt = 0;
    this.on = false;
  }

  /** On/off timeline for one letter: dot 1 unit, dash 3, 1 unit between symbols, then a long pause. */
  timeline(letter) {
    const unit = 1200 / this.settings.wpm, steps = [];
    for (const s of MORSE[letter] || '') { steps.push([true, s === '.' ? unit : unit * 3]); steps.push([false, unit]); }
    steps[steps.length - 1] = [false, unit * 9]; // pause before it rings again
    return steps;
  }

  /** Called every frame. boss is the client Boss entity (or null), me is my Player entity. */
  update(boss, me, now) {
    const d = boss?.data;
    const active = d && d.awake && d.shield && d.chant && me && Math.hypot(boss.x - me.x, boss.y - me.y) < HEAR_RANGE;
    if (!active) { this.set(boss, false); this.letter = null; return; }
    if (d.chant !== this.letter) { this.letter = d.chant; this.startedAt = now + 600; } // short silence before a new letter
    const steps = this.timeline(this.letter), total = steps.reduce((a, s) => a + s[1], 0);
    let t = now - this.startedAt, on = false;
    if (t >= 0) {
      t %= total;
      for (const [isOn, len] of steps) { if (t < len) { on = isOn; break; } t -= len; }
    }
    this.set(boss, on);
  }

  set(boss, on) {
    if (boss) boss.lit = on;
    if (on === this.on) return;
    this.on = on;
    if (on) this.audio.bellOn(); else this.audio.bellOff();
  }
}
