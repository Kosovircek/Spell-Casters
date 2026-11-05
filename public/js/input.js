// Keyboard input: Morse key, numpad aiming, walking, menus and settings.
import { AIM_KEYS, MOVE_KEYS, MORSE_KEYS, normalize } from './constants.js';

export class Input {
  /**
   * game provides: morse, audio, network, inventory, settings, hud, and isPlaying().
   */
  constructor(game) {
    this.game = game;
    this.held = new Set();     // movement keys currently down
    this.lastMove = '0,0';     // last movement vector sent, to avoid spamming the server
    this.touchMove = null;     // { x, y } from the touch joystick while a finger is on it
    this.dir = { x: 0, y: 0 }; // the walking direction right now (my caster walks it at once, see prediction.js)
    addEventListener('keydown', (e) => this.onKeyDown(e));
    addEventListener('keyup', (e) => this.onKeyUp(e));
    addEventListener('blur', () => this.releaseAll());
  }

  onKeyDown(e) {
    const g = this.game;
    if (e.code === 'Escape' && g.ring?.isOpen) { g.ring.close(); e.preventDefault(); return; }
    if (e.code === 'Escape' && g.hud.visible && !g.inventory.isOpen) { this.toggleSettings(); e.preventDefault(); return; }
    if (!g.isPlaying()) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); g.network.save(); return; } // Ctrl+S saves, like Angband

    // Menus get first pick, except the numpad and Space so you can keep typing Morse and aiming,
    // and except movement keys while no menu is open.
    const isNumpadOrMorse = e.code.startsWith('Numpad') || e.code === 'Space';
    if (!isNumpadOrMorse && !(!g.inventory.isOpen && MOVE_KEYS[e.code])) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (g.inventory.handleKey(e)) { e.preventDefault(); if (g.inventory.isOpen) this.stopWalking(); return; }
    }

    if (MORSE_KEYS.includes(e.code)) { e.preventDefault(); if (!e.repeat) { g.morse.press(performance.now()); g.audio.toneOn(); } return; }
    if (AIM_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) this.castToward(AIM_KEYS[e.code]); return; }
    if (e.code === 'Numpad0') { e.preventDefault(); if (!e.repeat) { g.morse.dash(); g.audio.beep(g.morse.dashAt * 1.5); } return; }
    if (e.code === 'NumpadDecimal') { e.preventDefault(); g.morse.clear(); return; }
    if (e.code === 'Backspace') { e.preventDefault(); g.morse.backspace(); return; }
    if (e.code === 'KeyH') { g.hud.toggleCheatSheet(); return; }
    if (MOVE_KEYS[e.code]) { e.preventDefault(); this.held.add(e.code); this.sendMove(); }
  }

  onKeyUp(e) {
    const g = this.game;
    if (MORSE_KEYS.includes(e.code)) { e.preventDefault(); g.audio.toneOff(); g.morse.release(performance.now()); return; }
    if (MOVE_KEYS[e.code]) { this.held.delete(e.code); this.sendMove(); }
  }

  /** A numpad direction was pressed: send the finished spell that way. */
  castToward([ux, uy]) {
    // With the right hand on the numpad, the index finger often hits 4, 7 or 1 a moment before the
    // middle finger has lifted off 5. That press is the last dot or dash of the spell, so finish it
    // now instead of dropping the cast (take() returns nothing while the Morse key is down).
    const m = this.game.morse;
    if (m.isDown) { this.game.audio.toneOff(); m.release(performance.now()); }
    const word = m.take();
    if (!word) return;
    const d = normalize(ux, uy);
    this.game.network.cast(word, d.x, d.y);
  }

  /** Touch joystick direction (a unit vector), or null when the finger is lifted. */
  setTouchMove(x, y) {
    this.touchMove = x === null ? null : { x, y };
    this.sendMove();
  }

  /** Same speed in all 8 directions. The touch joystick wins while it is held. */
  sendMove() {
    let ux = 0, uy = 0;
    for (const k of this.held) { ux += MOVE_KEYS[k][0]; uy += MOVE_KEYS[k][1]; }
    const d = this.touchMove || normalize(Math.sign(ux), Math.sign(uy));
    this.dir = this.game.network.connected ? d : { x: 0, y: 0 };
    const key = d.x.toFixed(2) + ',' + d.y.toFixed(2);
    if (key !== this.lastMove && this.game.network.connected) { this.game.network.move(d.x, d.y); this.lastMove = key; }
  }
  stopWalking() { this.held.clear(); this.game.touch?.releaseAll(); this.touchMove = null; this.sendMove(); }
  toggleSettings() { this.game.settings.togglePanel(); this.stopWalking(); }

  releaseAll() {
    this.stopWalking();
    this.game.audio.toneOff();
    if (this.game.morse.isDown) this.game.morse.release(performance.now());
  }
}
