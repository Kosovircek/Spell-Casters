// Turns server events (hits, blocks, chest opened...) into sounds, sparks and floating text.
import { MONSTERS } from './art/monsters.js';
const SCHOOL = { elements: '#ff8a65', summons: '#aed581', control: '#4fc3f7', utility: '#ce93d8' };
const STATUS = { root: '#8bc34a', slow: '#80deea', silence: '#ef5350', stun: '#fff59d', confuse: '#f48fb1', fear: '#b39ddb', corrode: '#9ccc65', mirror: '#e0f7fa', lit: '#fff59d', clone: '#ffd54f' };
/** Sparks along a line from (x, y) to (x2, y2). */
const line = (p, e, color, n) => { for (let k = 0; k <= n; k++) p.burst(e.x + (e.x2 - e.x) * k / n, e.y + (e.y2 - e.y) * k / n, color, 1, 10, 0.4); };

export class EventEffects {
  constructor({ audio, particles, renderer, getMyId, world }) {
    this.audio = audio; this.particles = particles; this.renderer = renderer; this.getMyId = getMyId; this.world = world;
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
      // ---- effect spells (the rune ..--)
      case 'rcast': sfx('cloak'); p.burst(e.x, e.y, '#e040fb', 14, 50, 0.5); p.burst(e.x, e.y, SCHOOL[e.s] || e.c, 10, 35, 0.5); p.text(e.x, e.y - 0.4, e.w, SCHOOL[e.s] || '#e1bee7'); break;
      case 'rfizzle': if (e.id === this.getMyId()) sfx('wrong'); p.burst(e.x, e.y, '#7e57c2', 8, 25, 0.4); break;
      case 'rland': p.burst(e.x, e.y, SCHOOL[e.s] || '#e040fb', 12, 45, 0.5); break;
      case 'summon': sfx('shield'); p.burst(e.x, e.y, e.c, 16, 40, 0.6); p.burst(e.x, e.y, '#aed581', 8, 30, 0.5); break;
      case 'unsummon': p.burst(e.x, e.y, '#9a8fb0', 10, 30, 0.5); break;
      case 'soak': sfx('block'); p.burst(e.x, e.y, '#ffe082', 8, 30, 0.4); break;
      case 'eat': sfx('coin'); p.burst(e.x, e.y, '#7e57c2', 10, 30, 0.4); p.text(e.x, e.y - 0.6, 'CHOMP', '#b39ddb'); break;
      case 'spit': sfx('cast'); p.burst(e.x, e.y, e.c, 4, 20, 0.3); break;
      case 'web': sfx('cloak'); line(p, e, '#ffffff', 10); break;
      case 'boo': sfx('phase'); p.burst(e.x, e.y, '#e8f4ff', 20, 50, 0.6); p.text(e.x, e.y - 1, 'BOO', '#e8f4ff'); break;
      case 'breath': sfx('hurt'); for (let k = 0; k <= 10; k++) p.burst(e.x + (e.x2 - e.x) * k / 10, e.y + (e.y2 - e.y) * k / 10, k % 2 ? '#ff7043' : '#ffca28', 3, 30, 0.5); break;
      case 'status': p.burst(e.x, e.y, STATUS[e.s] || '#ffffff', 10, 30, 0.5); break;
      case 'quake': sfx('bossdown'); this.renderer.shake = 7; for (let k = 1; k <= 4; k++) p.burst(e.x + e.dx * k, e.y + e.dy * k, '#a1887f', 8, 40, 0.5); break;
      case 'meteor': sfx('bossdown'); p.burst(e.x, e.y, '#ff7043', 50, 120, 0.9); p.burst(e.x, e.y, '#ffeb3b', 30, 80, 0.7); this.renderer.shake = 10; break;
      case 'nova': sfx('shatter'); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; p.burst(e.x + Math.cos(a) * 2.5, e.y + Math.sin(a) * 2.5, k % 2 ? '#fff59d' : e.c, 2, 20, 0.5); } this.renderer.shake = 3; break;
      case 'beam': sfx('shatter'); line(p, e, '#fff59d', 24); line(p, e, '#ffffff', 12); this.renderer.shake = 3; break;
      case 'spike': sfx('hit'); p.burst(e.x, e.y, '#9ccc65', 14, 40, 0.5); p.text(e.x, e.y - 0.8, 'SNAP', '#dce775'); break;
      case 'zap': if (this.world?.map?.biome === 'storm') this.renderer.flash = 0.6; sfx('shatter'); for (let k = 0; k < 8; k++) p.burst(e.x + (Math.random() - 0.5) * 0.3, e.y - k * 0.5, '#fff59d', 2, 15, 0.3); p.burst(e.x, e.y, '#ffffff', 10, 50, 0.4); break;
      case 'collapse': sfx('bossdown'); p.burst(e.x, e.y, '#7c4dff', 50, 110, 0.9); p.burst(e.x, e.y, '#000000', 20, 50, 0.6); this.renderer.shake = 8; break;
      case 'crush': p.burst(e.x, e.y, '#ea80fc', 8, 25, 0.4); break;
      case 'raise': sfx('phase'); p.burst(e.x, e.y, '#8f7fc4', 20, 50, 0.6); this.renderer.shake = 3; break;
      case 'crumble': for (const t of e.tiles || []) { const w = this.world?.map?.w; if (w) p.burst(t % w + 0.5, Math.floor(t / w) + 0.7, '#6a5a9a', 4, 25, 0.4); } break;
      case 'yank': sfx('cloak'); line(p, e, e.c, 10); break;
      case 'gust': sfx('cloak'); for (let k = 1; k <= 4; k++) p.burst(e.x + e.dx * k * 0.8, e.y + e.dy * k * 0.8, '#e0f7fa', 4, 50, 0.4); break;
      case 'phase': sfx('stairs'); p.burst(e.x, e.y, e.c || '#ce93d8', 18, 40, 0.5); p.burst(e.x2, e.y2, e.c || '#ce93d8', 18, 40, 0.5); line(p, e, '#e1bee7', 8); break;
      case 'swap': sfx('stairs'); p.burst(e.x, e.y, '#ce93d8', 16, 40, 0.5); p.burst(e.x2, e.y2, '#ce93d8', 16, 40, 0.5); break;
      case 'mirror': sfx('block'); p.burst(e.x, e.y, '#e0f7fa', 18, 60, 0.5); p.text(e.x, e.y - 1, 'MIRROR', '#e0f7fa'); break;
      case 'buff': sfx('shield'); p.burst(e.x, e.y, STATUS[e.s] || '#ffffff', 16, 40, 0.6); break;
      case 'vanish': sfx('cloak'); p.burst(e.x, e.y, '#424242', 20, 40, 0.6); break;
      case 'unveil': p.burst(e.x, e.y, '#9e9e9e', 10, 30, 0.4); break;
      case 'drain': sfx('ward'); line(p, e, '#ef5350', 12); if (e.n) p.text(e.x2, e.y2, '+' + e.n, '#81c784'); break;
      case 'portalopen': sfx('stairs'); p.burst(e.x, e.y, e.c, 20, 50, 0.6); p.burst(e.x2, e.y2, e.c, 20, 50, 0.6); break;
      case 'portal': sfx('cloak'); p.burst(e.x, e.y, '#e1bee7', 10, 30, 0.4); p.burst(e.x2, e.y2, '#e1bee7', 10, 30, 0.4); break;
      // ---- the biomes (server/biomes)
      case 'freeze2': sfx('shield'); p.burst(e.x, e.y, '#b3e5fc', 20, 50, 0.7); break;
      case 'burn': p.burst(e.x, e.y, '#ff7043', 16, 50, 0.6); break;
      case 'melt': p.burst(e.x, e.y, '#80deea', 8, 30, 0.5); break;
      case 'sprout': p.burst(e.x, e.y, '#8bc34a', 6, 25, 0.4); break;
      case 'cut': sfx('hit'); p.burst(e.x, e.y, '#9ccc65', 10, 40, 0.5); break;
      case 'chip2': sfx('hit'); p.burst(e.x, e.y, '#e1f5fe', 8, 35, 0.4); break;
      case 'shatter2': sfx('shatter'); p.burst(e.x, e.y, '#e1f5fe', 24, 70, 0.7); break;
      case 'bounce': sfx('block'); p.burst(e.x, e.y, '#e1f5fe', 6, 30, 0.3); break;
      case 'erupt': sfx('hurt'); p.burst(e.x, e.y, '#ff7043', 24, 80, 0.8); p.burst(e.x, e.y, '#ffeb3b', 12, 60, 0.6); break;
      case 'envhit': p.text(e.x, e.y - 1, { vent: 'BURNED', blades: 'CUT', lightning: 'ZAP', slam: 'SLAM' }[e.why] || '', '#ff8a65'); break;
      case 'gears': sfx('block'); p.burst(e.x, e.y, '#b0bec5', 10, 40, 0.5); break;
      case 'creak': p.burst(e.x, e.y, '#8d6e63', 4, 20, 0.4); break;
      case 'fallaway': p.burst(e.x, e.y, '#5e35b1', 10, 30, 0.6); break;
      case 'fall': sfx('hurt'); p.burst(e.x, e.y, '#7c4dff', 20, 50, 0.8); p.text(e.x, e.y - 1, 'FELL', '#b388ff'); break;
      case 'gust2': sfx('cloak'); break;
      case 'trial': sfx('bossdown'); p.burst(e.x, e.y, '#ffd54f', 40, 90, 1); p.text(e.x, e.y - 1.2, 'TRIAL', '#ffd54f'); this.renderer.shake = 4; break;
      case 'trialwin': sfx('chest'); p.burst(e.x, e.y, '#ffd54f', 60, 110, 1.3); p.text(e.x, e.y - 1.2, 'TRIAL WON', '#fff59d'); break;
      case 'trialfail': sfx('wrong'); p.burst(e.x, e.y, '#ef5350', 30, 60, 0.8); p.text(e.x, e.y - 1.2, 'TRIAL LOST', '#ef5350'); break;
      case 'ignite': sfx('ecast'); p.burst(e.x, e.y - 0.6, '#ffca28', 24, 60, 0.7); break;
      case 'snuff': sfx('cloak'); p.burst(e.x, e.y - 0.6, '#455a64', 16, 30, 0.6); break;
      case 'dooropen': sfx('stairs'); p.burst(e.x, e.y, '#ffd54f', 40, 80, 1); p.text(e.x, e.y - 1, 'OPEN', '#ffd54f'); break;
      case 'shrine': sfx('ward'); p.burst(e.x, e.y, e.k === 'blood' ? '#ff1744' : '#e040fb', 40, 80, 1); break;
      case 'resist': p.burst(e.x, e.y, '#ff7043', 6, 25, 0.4); p.text(e.x, e.y - 1, 'IMMUNE', '#ffab91'); break;
      case 'heard': p.text(e.x, e.y - 1.4, '!', '#ffca28'); break;
      case 'dive': p.burst(e.x, e.y, '#4db6ac', 12, 30, 0.5); break;
      case 'surface': sfx('cloak'); p.burst(e.x, e.y, '#80cbc4', 16, 40, 0.6); break;
      case 'shock': sfx('shatter'); p.burst(e.x, e.y, '#b3e5fc', 14, 50, 0.5); p.text(e.x, e.y - 1, 'SHOCK', '#b3e5fc'); break;
      case 'swoop': sfx('cloak'); p.burst(e.x, e.y, '#cfd8dc', 12, 50, 0.5); break;
      case 'bblock2': sfx('wrong'); p.burst(e.x, e.y, '#b0bec5', 8, 40, 0.4); p.text(e.x, e.y - 1, e.why || 'GUARDED', '#b0bec5'); break;
      case 'learn': sfx('chest'); p.burst(e.x, e.y, '#e040fb', 40, 80, 1); p.text(e.x, e.y - 1, '*' + e.w, '#e1bee7'); break;
    }
  }
}
