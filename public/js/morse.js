// Morse decoding with beginner-friendly timing.
export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
export const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export class MorseKey {
  // opts: { wpm, gapUnits, onChange() }
  constructor(opts) {
    Object.assign(this, opts);
    this.buf = '';
    this.downAt = 0;
    this.gapTimer = null;
    this.spell = '';       // finished letters waiting for a direction
    this.maxLen = 8;
    this.bad = null;       // last invalid code, shown briefly
  }
  get unit() { return 1200 / this.wpm; }          // PARIS standard: dot length in ms
  get dashAt() { return this.unit * 2; }           // press longer than 2 dots = dash
  get isDown() { return this.downAt > 0; }

  press(t) {
    if (this.downAt) return;
    clearTimeout(this.gapTimer);
    this.bad = null;
    this.downAt = t;
    this.onChange();
  }
  release(t) {
    if (!this.downAt) return;
    const held = t - this.downAt;
    this.downAt = 0;
    this.add(held < this.dashAt ? '.' : '-');
  }
  // Drop a press without adding a symbol (the touch key turned it into a cast swipe).
  cancelPress() {
    if (!this.downAt) return;
    this.downAt = 0;
    if (this.buf) this.gapTimer = setTimeout(() => this.finish(), this.unit * this.gapUnits);
    this.onChange();
  }
  // Instant dash (numpad 0): no hold needed. Counts as a keying event, so the letter gap restarts.
  dash() {
    if (this.downAt) return;
    clearTimeout(this.gapTimer);
    this.bad = null;
    this.add('-');
  }
  add(symbol) {
    this.buf += symbol;
    if (this.buf.length > 5) { this.fail(); return; }
    this.gapTimer = setTimeout(() => this.finish(), this.unit * this.gapUnits);
    this.onChange();
  }
  // Finish the current letter now (timer elapsed, or a direction key was pressed).
  // Adds it to the spell; an invalid code is dropped but the spell so far is kept.
  finish() {
    clearTimeout(this.gapTimer);
    if (!this.buf) return;
    const l = FROM_MORSE[this.buf];
    if (!l) { this.fail(); return; }
    if (this.spell.length < this.maxLen) this.spell += l;
    this.buf = '';
    this.onChange();
  }
  fail() { this.bad = this.buf; this.buf = ''; clearTimeout(this.gapTimer); this.onChange(); }
  clear() { this.buf = ''; this.spell = ''; this.bad = null; clearTimeout(this.gapTimer); this.onChange(); }
  backspace() {
    clearTimeout(this.gapTimer);
    if (this.buf) this.buf = ''; else this.spell = this.spell.slice(0, -1);
    this.bad = null; this.onChange();
  }
  // Called when a direction key is pressed: returns the whole spell to cast, or ''.
  take() {
    if (this.downAt) return '';
    this.finish();
    const s = this.spell;
    this.spell = '';
    this.onChange();
    return s;
  }
}
