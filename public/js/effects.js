// Turns server events (hits, blocks, chest opened...) into sounds, sparks and floating text.
import { MONSTERS } from './art/monsters.js';
export class EventEffects {
  constructor({ audio, particles, renderer, getMyId }) {
    this.audio = audio; this.particles = particles; this.renderer = renderer; this.getMyId = getMyId;
  }
  play(e) {
    const p = this.particles, sfx = (n) => this.audio.play(n);
    switch (e.t) {
      case 'cast': sfx('cast'); p.burst(e.x, e.y, e.c, 5, 25, 0.3); break;
      case 'ecast': sfx('ecast'); break;
      case 'block': sfx('block'); p.burst(e.x, e.y, '#fff59d', 16, 60, 0.6); p.text(e.x, e.y, e.cut ? 'CUT' : 'BLOCK', '#fff59d'); break;
      case 'hit': sfx('hit'); p.burst(e.x, e.y, '#ffd54f', 8); break;
      case 'kill': sfx('kill'); p.burst(e.x, e.y, e.type === 'slime' ? '#66bb6a' : e.type === 'boss' ? '#80deea' : MONSTERS[e.type]?.burst || '#b39ddb', 24, 70, 0.8); break;
      // ---- the rare enemies' tricks
      case 'mimic': sfx('shatter'); p.burst(e.x, e.y, '#ffd54f', 20, 60, 0.6); p.text(e.x, e.y - 1, 'MIMIC!', '#ff5252'); this.renderer.shake = 4; break;
      case 'split': sfx('phase'); p.burst(e.x, e.y, '#ffa726', 20, 50, 0.6); p.text(e.x, e.y - 1, 'SPLIT', '#ffa726'); break;
      case 'steal': sfx('coin'); p.text(e.x, e.y - 1, 'STOLEN', '#ffd54f'); break;
      case 'jumble': p.burst(e.x, e.y, '#f06292', 8, 30, 0.4); break;
      case 'mock': sfx('wrong'); p.text(e.x, e.y - 1.2, '+' + e.l, '#ef5350'); break;
      case 'boom': sfx('bossdown'); p.burst(e.x, e.y, '#ff7043', 60, 130, 0.9); p.burst(e.x, e.y, '#ffeb3b', 30, 90, 0.6); this.renderer.shake = 9; break;
      case 'kblock': sfx('wrong'); p.text(e.x, e.y - 1, 'KEY ' + e.l, '#ffca28'); break;
      case 'unlock': sfx('block'); p.burst(e.x, e.y, '#ffca28', 12, 40, 0.5); break;
      case 'regrow': p.burst(e.x, e.y, e.why === 'sip' ? '#ff1744' : '#9ccc65', 8, 30, 0.5); p.text(e.x, e.y - 1, (e.why === 'sip' ? 'SIP ' : '+') + (e.l || ''), e.why === 'sip' ? '#ff5252' : '#9ccc65'); break;
      case 'gdown': sfx('kill'); p.burst(e.x, e.y, '#7e57c2', 14, 40, 0.6); break;
      case 'grevive': sfx('shield'); p.burst(e.x, e.y, '#c6ff00', 16, 50, 0.6); p.text(e.x, e.y - 1, 'BACK UP', '#c6ff00'); break;
      case 'hatch': p.burst(e.x, e.y, '#f5f5f5', 10, 30, 0.5); break;
      case 'mreflect': sfx('block'); p.burst(e.x, e.y, '#e1f5fe', 14, 50, 0.4); p.text(e.x, e.y - 1, 'MIRROR ' + e.l, '#e1f5fe'); break;
      case 'horn': sfx('ecast'); p.burst(e.x, e.y, '#ffb74d', 16, 60, 0.6); break;
      case 'freeze': sfx('shield'); p.burst(e.x, e.y, '#b3e5fc', 16, 40, 0.6); p.text(e.x, e.y, 'FROZEN', '#b3e5fc'); break;
      case 'rouse': sfx('ecast'); p.burst(e.x, e.y, '#78909c', 12, 40, 0.5); break;
      // ---- the bosses' tricks
      case 'graves': sfx('phase'); p.burst(e.x, e.y, '#b0bec5', 40, 90, 1); this.renderer.shake = 5; break;
      case 'gopen': sfx('shatter'); p.burst(e.x, e.y, '#ffca28', 30, 70, 0.8); p.text(e.x, e.y - 1, 'EXPOSED', '#ffca28'); break;
      case 'gblock': sfx('wrong'); p.burst(e.x, e.y, '#b0bec5', 8, 40, 0.4); p.text(e.x, e.y - 1, 'GUARDED', '#b0bec5'); break;
      case 'hcut': sfx('shatter'); p.burst(e.x, e.y - 1, '#43a047', 30, 80, 0.8); p.text(e.x, e.y - 1.5, 'HEAD CUT', '#c5e1a5'); this.renderer.shake = 4; break;
      case 'hgrow': sfx('shield'); p.burst(e.x, e.y - 1, '#43a047', 16, 50, 0.6); break;
      case 'slam': sfx('bossdown'); p.burst(e.x, e.y, '#ffe082', 50, 110, 0.9); this.renderer.shake = 8; break;
      case 'echo': sfx('shield'); p.burst(e.x, e.y, '#b39ddb', 30, 70, 0.8); break;
      case 'eshatter': sfx('shatter'); p.burst(e.x, e.y, '#e1f5fe', 40, 90, 0.8); p.text(e.x, e.y - 1, 'ECHO', '#e1f5fe'); break;
      case 'eshuffle': sfx('cloak'); p.burst(e.x, e.y, '#b39ddb', 20, 60, 0.5); break;
      case 'reveal': sfx('chest'); p.burst(e.x, e.y, '#ff5252', 16, 50, 0.6); p.text(e.x, e.y - 1.5, 'REVEALED ' + e.l, '#ffffff'); break;
      case 'bblock': sfx('wrong'); p.burst(e.x, e.y, '#80deea', 8, 40, 0.4); p.text(e.x, e.y - 1, 'SHIELD', '#80deea'); break;
      case 'bshatter': sfx('shatter'); p.burst(e.x, e.y, '#80deea', 40, 90, 0.9); p.text(e.x, e.y - 1, 'SHATTER ' + e.l, '#ffffff'); this.renderer.shake = 5; break;
      case 'bshield': sfx('shield'); p.burst(e.x, e.y, '#80deea', 20, 50, 0.6); break;
      case 'bphase': sfx('phase'); p.burst(e.x, e.y, '#ef5350', 40, 90, 1); this.renderer.shake = 8; break;
      case 'bossdown': sfx('bossdown'); p.burst(e.x, e.y, '#fff59d', 70, 120, 1.4); this.renderer.shake = 10; break;
      case 'wrong': sfx('wrong'); p.text(e.x, e.y, 'NO', '#ef5350'); break;
      case 'fizzle': p.burst(e.x, e.y, '#9a8fb0', 4, 20, 0.3); break;
      case 'hurt': sfx('hurt'); p.burst(e.x, e.y, '#ef5350', 10); if (e.n) p.text(e.x, e.y, '-' + e.n, '#ef5350'); if (e.id === this.getMyId()) this.renderer.shake = 6; break;
      case 'down': p.burst(e.x, e.y, '#ef5350', 30, 80, 1); break;
      case 'revive': p.burst(e.x, e.y, '#fff', 20, 50, 0.7); break;
      case 'stairs': sfx('stairs'); break;
      case 'gold': if (e.id === this.getMyId()) { if (e.n > 0) sfx('coin'); p.text(e.x, e.y - 0.9, (e.n > 0 ? '+' : '') + e.n + ' gold', '#ffd54f'); } break;
      case 'travel': sfx('stairs'); p.burst(e.x, e.y, '#ce93d8', 40, 80, 1.2); break;
      case 'duelgo': sfx('shatter'); break;
      case 'duelwin': sfx('bossdown'); p.burst(e.x, e.y, e.c, 60, 110, 1.4); p.burst(e.x, e.y, '#fff59d', 30, 80, 1); p.text(e.x, e.y - 1, 'WINNER', '#fff59d'); this.renderer.shake = 6; break;
      case 'chest': sfx('chest'); p.burst(e.x, e.y, '#ffd54f', 30, 70, 0.9); break;
      case 'cloak': sfx('cloak'); p.burst(e.x, e.y, e.c, 10, 40, 0.4); p.text(e.x, e.y, 'CLOAK ' + e.l, e.c); break;
      case 'use': sfx('cloak'); p.burst(e.x, e.y, e.c, 14, 40, 0.5); break;
      case 'tele': sfx('stairs'); p.burst(e.x, e.y, '#ce93d8', 24, 60, 0.6); break;
      case 'pickup': sfx('hit'); break;
      case 'regen': p.burst(e.x, e.y, '#81c784', 8, 30, 0.5); p.text(e.x, e.y, '+' + (e.n || 1), '#81c784'); break;
      case 'xp': if (e.id === this.getMyId()) p.text(e.x, e.y - 0.5, '+' + e.n + ' XP', '#ce93d8'); break;
      case 'levelup': sfx('stairs'); p.burst(e.x, e.y, '#ffd54f', 40, 80, 1.1); p.text(e.x, e.y - 0.8, 'LEVEL ' + e.lv, '#ffd54f'); break;
      case 'sblock': sfx('block'); p.burst(e.x, e.y, '#90caf9', 14, 50, 0.5); p.text(e.x, e.y, 'SHIELD ' + e.l, '#90caf9'); break;
      case 'pelt': sfx('ward'); p.burst(e.x, e.y, '#ffb74d', 14, 50, 0.5); p.text(e.x, e.y, 'PELT', '#ffb74d'); break;
      case 'pearl': sfx('ward'); p.burst(e.x, e.y, '#e1f5fe', 30, 70, 0.9); p.text(e.x, e.y, 'PEARL', '#e1f5fe'); break;
      case 'stun': p.burst(e.x, e.y, e.kind === 'stone' ? '#9e9e9e' : '#fff59d', 8, 30, 0.4); if (e.kind === 'stone') p.text(e.x, e.y - 1, 'STONE', '#bdbdbd'); break;
      case 'thunder': sfx('shatter'); p.burst(e.x, e.y, '#fff59d', 40, 110, 0.7); this.renderer.shake = 5; break;
      case 'chain': sfx('shatter'); for (let k = 0; k <= 8; k++) p.burst(e.x + (e.x2 - e.x) * k / 8, e.y + (e.y2 - e.y) * k / 8, '#b3e5fc', 2, 20, 0.4); break;
      case 'chip': p.burst(e.x, e.y, e.why === 'burn' ? '#ff7043' : '#ffd54f', 10, 40, 0.5); if (e.l) p.text(e.x, e.y - 1, e.l, e.why === 'burn' ? '#ff7043' : '#ffd54f'); break;
      case 'reflect': sfx('block'); p.burst(e.x, e.y, '#e0e0e0', 14, 50, 0.4); p.text(e.x, e.y, 'DEFLECT', '#e0e0e0'); break;
      case 'feed': sfx('coin'); p.burst(e.x, e.y, '#f48fb1', 14, 40, 0.7); p.text(e.x, e.y - 0.6, 'YUM', '#f48fb1'); break;
      case 'dummy':
        sfx(e.best && e.n > 1 ? 'chest' : 'kill'); p.burst(e.x, e.y, '#e0b95a', 18, 50, 0.6);
        if (e.id === this.getMyId()) p.text(e.x, e.y - 0.9, e.best && e.n > 1 ? 'BEST ' + e.n : 'STREAK ' + e.n, e.best && e.n > 1 ? '#ffd54f' : '#ffffff');
        break;
      case 'wish': sfx('chest'); p.burst(e.x, e.y, '#ffd54f', 30, 70, 1); p.burst(e.x, e.y, '#80deea', 30, 60, 1); break;
      case 'ward': sfx('ward'); p.burst(e.x, e.y, '#80deea', 16, 50, 0.5); p.text(e.x, e.y, 'WARD', '#80deea'); break;
    }
  }
}
