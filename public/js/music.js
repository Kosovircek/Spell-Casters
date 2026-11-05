// Ambient music, generated live with Web Audio (no audio files, nothing borrowed).
//
// A slow pad, a drone and sparse bell notes play all the time. One number, `intensity` (0 calm .. 1 in trouble),
// opens the pad's filter, speeds the tempo a little and fades in more layers: an arpeggio, then a soft pulse,
// then drums and a darker chord progression. Low HP adds a heartbeat. Each place has its own mood:
// a warm major key in town, a minor one in the dungeon, a tense Phrygian one with a beat in duels.

const MOODS = {
  // root: MIDI note of the key. Chords are semitones from the root; the first number is the bass.
  town: {
    root: 53, bpm: 66, base: 0, cap: 0.25, drums: false, bellRate: 0.05, warmth: 900,
    calm: [[0, 12, 16, 19, 23], [-3, 9, 12, 16, 19], [5, 9, 12, 16, 21], [7, 11, 14, 19, 21]], // Fmaj7 Dm7 Bbmaj7/F C
    tense: null,
  },
  dungeon: {
    root: 50, bpm: 76, base: 0, cap: 1, drums: true, bellRate: 0.035, warmth: 520,
    calm: [[0, 7, 12, 14, 15], [-4, 7, 10, 14, 15], [-7, 8, 10, 14, 17], [-5, 7, 10, 12, 16]], // Dm9 Bbmaj7 Gm9 Am
    tense: [[0, 7, 12, 15, 19], [1, 8, 13, 17, 20], [0, 7, 12, 15, 18], [-2, 10, 13, 17, 22]], // Dm Eb Ddim Cm
  },
  duel: {
    root: 52, bpm: 92, base: 0.35, cap: 1, drums: true, bellRate: 0.02, warmth: 700,
    calm: [[0, 7, 12, 15, 19], [1, 8, 13, 17, 20], [-2, 10, 14, 17, 22], [1, 8, 13, 17, 20]], // Em F D F
    tense: [[0, 7, 12, 15, 18], [1, 8, 13, 16, 20], [0, 6, 12, 15, 18], [-1, 11, 14, 17, 23]],
  },
};

const STEPS = 16;          // sixteenth notes in a bar
const LOOKAHEAD = 0.3;     // seconds of music scheduled ahead
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Music {
  constructor(audio, settings) {
    this.audio = audio;
    this.settings = settings;
    this.ctx = null;
    this.mood = 'dungeon';
    this.target = 0;        // danger asked for by the game
    this.intensity = 0;     // smoothed danger, what the music follows
    this.heart = 0;         // smoothed "low HP" for the heartbeat
    this.dead = false;
    this.ducked = false;
    this.step = 0;
    this.bar = 0;
    this.chord = 0;
    this.pad = [];          // voices of the chord now sounding
  }

  /** Build the mixing graph once audio is allowed (after the first click). */
  start() {
    if (this.ctx) return;
    const ctx = this.audio.context();
    if (!ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;               // master: volume, mute, ducking
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass';   // muffles everything when you are dead
    this.tone.frequency.value = 12000;
    this.tone.connect(this.out).connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.tone);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.2);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55;
    this.verb.connect(this.wet).connect(this.tone);
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.Q.value = 0.7;
    this.padFilter.frequency.value = 500;
    this.padBus = ctx.createGain(); this.padBus.gain.value = 0.5;
    this.padFilter.connect(this.padBus); this.send(this.padBus, 0.6);
    this.noise = this.noiseBuffer();
    this.nextTime = ctx.currentTime + 0.1;
    this.applyVolume();
    this.timer = setInterval(() => this.schedule(), 60);
  }

  /** The game calls this every frame. danger 0..1, hpLow 0..1. */
  update(dt, { mood, danger, hpLow, dead }) {
    if (!this.ctx) return;
    if (mood !== this.mood && MOODS[mood]) { this.mood = mood; this.chordChange = true; }
    const m = MOODS[this.mood];
    this.target = dead ? 0 : Math.min(m.cap, m.base + danger * (1 - m.base));
    // swell quickly when trouble comes, settle slowly once it is over
    const rate = this.target > this.intensity ? 0.8 : 0.18;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * rate);
    this.heart += ((dead ? 0 : hpLow) - this.heart) * Math.min(1, dt * 1.5);
    if (dead !== this.dead) {
      this.dead = dead;
      this.tone.frequency.setTargetAtTime(dead ? 700 : 12000, this.ctx.currentTime, 0.6);
    }
  }

  /** Volume slider / mute checkbox changed. */
  applyVolume() {
    if (!this.ctx) return;
    const v = this.settings.music ? (this.settings.musicVol / 100) * 0.6 : 0;
    this.out.gain.setTargetAtTime(v * (0.8 + 0.4 * this.intensity) * (this.ducked ? 0.55 : 1), this.ctx.currentTime, 0.15); // a little louder in a fight
  }
  /** Dip the music while your own Morse key is sounding, so every dot and dash stays clear. */
  duck(on) {
    if (on === this.ducked) return;
    this.ducked = on;
    this.applyVolume();
  }

  // ------------------------------------------------------------------ scheduling

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05; // tab was asleep: don't catch up in a burst
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      const m = MOODS[this.mood], bpm = m.bpm + this.intensity * 30;
      this.nextTime += 60 / bpm / 4;
      if (++this.step === STEPS) { this.step = 0; this.bar++; }
    }
  }

  get progression() {
    const m = MOODS[this.mood];
    return m.tense && this.intensity > 0.6 ? m.tense : m.calm;
  }

  playStep(s, t) {
    const m = MOODS[this.mood], I = this.intensity, silent = !this.settings.music;
    // chords last two bars when calm, one when the fight is on
    const barsPerChord = I > 0.55 ? 1 : 2;
    if (s === 0) this.applyVolume();
    if (s === 0 && (this.bar % barsPerChord === 0 || this.chordChange)) {
      this.chordChange = false;
      this.chord = (this.chord + 1) % 4;
      if (!silent) this.newChord(t, m);
    }
    this.padFilter.frequency.setTargetAtTime(m.warmth + I * I * 3200, t, 0.5);
    if (silent) { this.releasePad(t, 0.3); return; }
    if (!this.pad.length) this.newChord(t, m); // just unmuted
    const chord = this.progression[this.chord], root = m.root;
    const notes = chord.slice(1).map(n => root + n);

    // sparse bells: a few per bar when calm, fewer once the arpeggio takes over
    if (Math.random() < m.bellRate * (1 - I * 0.6)) {
      const n = notes[Math.floor(Math.random() * notes.length)] + 12 * (1 + (Math.random() < 0.4));
      this.bell(t, hz(n), 0.05);
    }
    // arpeggio: eighths from 0.25, sixteenths from 0.6
    if (I > 0.25 && (s % 2 === 0 || I > 0.6)) {
      const order = [0, 1, 2, 3, 2, 1, 3, 0], n = notes[order[(s >> (I > 0.6 ? 0 : 1)) % order.length]] + 12;
      this.pluck(t, hz(n), 0.045 * clamp01((I - 0.25) / 0.35), 0.18, 'triangle');
    }
    // bass pulse on the eighths once things heat up
    if (I > 0.4 && s % 2 === 0) this.pluck(t, hz(root + chord[0] - 24), 0.09 * clamp01((I - 0.4) / 0.3), 0.22, 'sawtooth', 500 + I * 700);
    // drums
    if (m.drums && I > 0.45) {
      const d = clamp01((I - 0.45) / 0.3);
      if (s === 0 || s === 8 || (I > 0.75 && (s === 6 || s === 10))) this.kick(t, 0.35 * d);
      if (I > 0.6 && (s === 4 || s === 12)) this.snare(t, 0.12 * d);
      if (s % 4 === 2 || (I > 0.75 && s % 2 === 1)) this.hat(t, 0.035 * d);
    }
    // heartbeat when your HP is low: lub-dub, once a bar
    if (this.heart > 0.15 && (s === 0 || s === 2)) this.kick(t, (s === 0 ? 0.3 : 0.2) * clamp01(this.heart), 55);
  }

  // ------------------------------------------------------------------ instruments

  /** New pad chord: fade the old voices out while the new ones swell in. Plus a held drone for the bass. */
  newChord(t, m) {
    const ctx = this.ctx, chord = this.progression[this.chord], fade = 2.5 - this.intensity * 1.5;
    this.releasePad(t, fade);
    const voices = [chord[0] - 12, ...chord.slice(1)];
    voices.forEach((n, i) => {
      const gain = ctx.createGain(), f = hz(m.root + n);
      gain.gain.setValueAtTime(0, t);
      gain.gain.setTargetAtTime(i === 0 ? 0.11 : 0.07, t, fade / 3);
      gain.connect(i === 0 ? this.dry : this.padFilter);
      const oscs = (i === 0 ? [['sine', 0]] : [['triangle', -6], ['sawtooth', 7]]).map(([type, cents]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = f; o.detune.value = cents;
        g.gain.value = type === 'sawtooth' ? 0.35 : 1;
        o.connect(g).connect(gain); o.start(t);
        return o;
      });
      oscs[0].onended = () => gain.disconnect();
      this.pad.push({ gain, oscs });
    });
  }
  releasePad(t, fade) {
    for (const v of this.pad) { v.gain.gain.setTargetAtTime(0, t, fade / 3); for (const o of v.oscs) o.stop(t + fade * 2); }
    this.pad = [];
  }

  bell(t, f, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 2.76; // a slightly inharmonic overtone makes it ring like glass
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    o.connect(g); o2.connect(g2).connect(g);
    this.send(g, 1.2);
    o.start(t); o2.start(t); o.stop(t + 2.6); o2.stop(t + 2.6);
  }

  pluck(t, f, vol, len, type, cutoff = 2400) {
    if (vol <= 0.001) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp).connect(g); this.send(g, 0.35);
    o.start(t); o.stop(t + len + 0.02);
  }

  kick(t, vol, base = 48) {
    if (vol <= 0.001) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(base * 2.5, t); o.frequency.exponentialRampToValueAtTime(base, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.dry);
    o.start(t); o.stop(t + 0.32);
  }

  noiseHit(t, vol, len, type, freq) {
    if (vol <= 0.001) return;
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f).connect(g); this.send(g, 0.25);
    n.start(t, Math.random() * 0.5); n.stop(t + len + 0.02);
  }
  hat(t, vol) { this.noiseHit(t, vol, 0.05, 'highpass', 7000); }
  snare(t, vol) { this.noiseHit(t, vol, 0.18, 'bandpass', 1800); }

  // ------------------------------------------------------------------ plumbing

  /** Route a voice to the dry mix and, by `amount`, to the reverb. */
  send(node, amount) {
    node.connect(this.dry);
    if (amount > 0) {
      const s = this.ctx.createGain(); s.gain.value = amount;
      node.connect(s).connect(this.verb);
    }
  }
  /** A cavernous reverb tail: decaying stereo noise. */
  impulse(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return buf;
  }
  noiseBuffer() {
    const ctx = this.ctx, buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
