// Sound: the Morse key tone and small synthesized effects (no audio files).
const SOUNDS = { // [wave, startHz, endHz, seconds, volume]
  cast: ['square', 520, 900, 0.12, 0.06], ecast: ['sawtooth', 220, 160, 0.15, 0.04], block: ['triangle', 900, 1600, 0.18, 0.12],
  hit: ['square', 400, 300, 0.1, 0.07], kill: ['triangle', 300, 1200, 0.3, 0.12], hurt: ['sawtooth', 200, 60, 0.25, 0.12],
  wrong: ['square', 140, 120, 0.12, 0.06], coin: ['square', 1300, 1900, 0.1, 0.05], stairs: ['triangle', 400, 800, 0.6, 0.1], chest: ['triangle', 500, 1500, 0.45, 0.12],
  cloak: ['sine', 1200, 1800, 0.15, 0.08], shatter: ['triangle', 1800, 300, 0.5, 0.14], shield: ['sine', 300, 700, 0.35, 0.1],
  phase: ['sawtooth', 500, 80, 0.7, 0.1], bossdown: ['triangle', 200, 1600, 1.2, 0.14], ward: ['triangle', 700, 300, 0.2, 0.1], bad: ['square', 120, 90, 0.15, 0.05],
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.tone = null; // { osc, gain } while the Morse key is held
    this.bell = null; // same, while the Bellwraith's bell is ringing
  }
  /** Browsers only allow audio after a user gesture, so this is created lazily. */
  context() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  /** Start a held tone; returns a handle for stopTone. */
  startTone(type, hz, volume) {
    const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    osc.connect(gain).connect(ctx.destination); osc.start();
    return { osc, gain };
  }
  stopTone(h) {
    if (!h) return;
    h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01); h.osc.stop(this.ctx.currentTime + 0.05);
  }
  toneOn() {
    if (!this.settings.tone || !this.context()) return;
    this.toneOff();
    this.tone = this.startTone('sine', 620, 0.18);
  }
  /** A fixed-length key tone, for the instant dash key. Separate handle so it never cuts a held tone. */
  beep(ms) {
    if (!this.settings.tone || !this.context()) return;
    const h = this.startTone('sine', 620, 0.18);
    setTimeout(() => this.stopTone(h), ms);
  }
  toneOff() { this.stopTone(this.tone); this.tone = null; }
  /** The Bellwraith's bell: lower and rounder than your own key, so you can tell them apart. */
  bellOn() {
    if (!this.settings.sfx || !this.context()) return;
    this.bellOff();
    this.bell = this.startTone('triangle', 392, 0.16);
  }
  bellOff() { this.stopTone(this.bell); this.bell = null; }
  play(name) {
    const S = SOUNDS[name];
    if (!S || !this.settings.sfx || !this.context()) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = S[0]; o.frequency.setValueAtTime(S[1], t); o.frequency.exponentialRampToValueAtTime(S[2], t + S[3]);
    g.gain.setValueAtTime(S[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + S[3]);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + S[3] + 0.02);
  }
}
