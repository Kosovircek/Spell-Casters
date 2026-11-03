// Turns server events (hits, blocks, chest opened...) into sounds, sparks and floating text.
export class EventEffects {
  constructor({ audio, particles, renderer, getMyId }) {
    this.audio = audio; this.particles = particles; this.renderer = renderer; this.getMyId = getMyId;
  }
  play(e) {
    const p = this.particles, sfx = (n) => this.audio.play(n);
    switch (e.t) {
      case 'cast': sfx('cast'); p.burst(e.x, e.y, e.c, 5, 25, 0.3); break;
      case 'ecast': sfx('ecast'); break;
      case 'block': sfx('block'); p.burst(e.x, e.y, '#fff59d', 16, 60, 0.6); p.text(e.x, e.y, 'BLOCK', '#fff59d'); break;
      case 'hit': sfx('hit'); p.burst(e.x, e.y, '#ffd54f', 8); break;
      case 'kill': sfx('kill'); p.burst(e.x, e.y, e.type === 'slime' ? '#66bb6a' : e.type === 'boss' ? '#80deea' : '#b39ddb', 24, 70, 0.8); break;
      case 'bblock': sfx('wrong'); p.burst(e.x, e.y, '#80deea', 8, 40, 0.4); p.text(e.x, e.y - 1, 'SHIELD', '#80deea'); break;
      case 'bshatter': sfx('shatter'); p.burst(e.x, e.y, '#80deea', 40, 90, 0.9); p.text(e.x, e.y - 1, 'SHATTER ' + e.l, '#ffffff'); this.renderer.shake = 5; break;
      case 'bshield': sfx('shield'); p.burst(e.x, e.y, '#80deea', 20, 50, 0.6); break;
      case 'bphase': sfx('phase'); p.burst(e.x, e.y, '#ef5350', 40, 90, 1); this.renderer.shake = 8; break;
      case 'bossdown': sfx('bossdown'); p.burst(e.x, e.y, '#fff59d', 70, 120, 1.4); this.renderer.shake = 10; break;
      case 'wrong': sfx('wrong'); p.text(e.x, e.y, 'NO', '#ef5350'); break;
      case 'fizzle': p.burst(e.x, e.y, '#9a8fb0', 4, 20, 0.3); break;
      case 'hurt': sfx('hurt'); p.burst(e.x, e.y, '#ef5350', 10); if (e.id === this.getMyId()) this.renderer.shake = 6; break;
      case 'down': p.burst(e.x, e.y, '#ef5350', 30, 80, 1); break;
      case 'revive': p.burst(e.x, e.y, '#fff', 20, 50, 0.7); break;
      case 'stairs': sfx('stairs'); break;
      case 'chest': sfx('chest'); p.burst(e.x, e.y, '#ffd54f', 30, 70, 0.9); break;
      case 'cloak': sfx('cloak'); p.burst(e.x, e.y, e.c, 10, 40, 0.4); p.text(e.x, e.y, 'CLOAK ' + e.l, e.c); break;
      case 'use': sfx('cloak'); p.burst(e.x, e.y, e.c, 14, 40, 0.5); break;
      case 'tele': sfx('stairs'); p.burst(e.x, e.y, '#ce93d8', 24, 60, 0.6); break;
      case 'pickup': sfx('hit'); break;
      case 'regen': p.burst(e.x, e.y, '#ef5350', 8, 30, 0.5); p.text(e.x, e.y, '+1', '#ef5350'); break;
      case 'reflect': sfx('block'); p.burst(e.x, e.y, '#e0e0e0', 14, 50, 0.4); p.text(e.x, e.y, 'DEFLECT', '#e0e0e0'); break;
      case 'ward': sfx('ward'); p.burst(e.x, e.y, '#80deea', 16, 50, 0.5); p.text(e.x, e.y, 'WARD', '#80deea'); break;
    }
  }
}
