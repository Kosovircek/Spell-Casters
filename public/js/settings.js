// Player settings (Morse speed, sounds), saved in the browser and edited in the Esc panel.
import { $ } from './constants.js';

const VERSION = 2; // bump to replace old saved defaults
const DEFAULTS = { wpm: 7, gap: 3, tone: true, sfx: true, haptics: true };

export class Settings {
  constructor() {
    Object.assign(this, DEFAULTS);
    try {
      const saved = JSON.parse(localStorage.getItem('sc-settings') || '{}');
      if (saved.v !== VERSION) delete saved.wpm; // a new default speed replaces the old saved one
      for (const k of Object.keys(DEFAULTS)) if (k in saved) this[k] = saved[k];
    } catch {}
    this.listeners = [];
  }
  save() {
    try { localStorage.setItem('sc-settings', JSON.stringify({ wpm: this.wpm, gap: this.gap, tone: this.tone, sfx: this.sfx, haptics: this.haptics, v: VERSION })); } catch {}
  }
  onChange(fn) { this.listeners.push(fn); }

  /** Wire the settings panel inputs. `morse` is used to show the dot/dash timings. */
  bindPanel(morse) {
    $('wpm').value = this.wpm; $('gap').value = this.gap; $('tone').checked = this.tone; $('sfx').checked = this.sfx; $('haptics').checked = this.haptics;
    const update = () => {
      this.wpm = +$('wpm').value; this.gap = +$('gap').value; this.tone = $('tone').checked; this.sfx = $('sfx').checked; this.haptics = $('haptics').checked;
      for (const fn of this.listeners) fn(this);
      $('wpm-v').textContent = this.wpm; $('gap-v').textContent = this.gap;
      $('unit-v').textContent = Math.round(morse.unit); $('dash-v').textContent = Math.round(morse.dashAt);
      this.save();
    };
    for (const id of ['wpm', 'gap', 'tone', 'sfx', 'haptics']) $(id).addEventListener('input', update);
    update();
  }
  get panelOpen() { return !$('settings').hidden; }
  togglePanel() { $('settings').hidden = !$('settings').hidden; }
}
