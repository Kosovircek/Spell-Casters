// Pixel art for summoned helpers (effect spells), built once from palette strings and cached per caster colour.
// 'c' is the caster's colour (a collar, eyes or runes), so you can tell whose summon it is; K is the dark outline.
import { sprite, shade } from './canvas.js';

const K = '#0b0910';

const ART = {
  imp: {
    pal: { r: '#d84315', R: '#8f2a0c', y: '#ffd54f' },
    rows: [
      '.K.......K.',
      'KrK.....KrK',
      'KrrKKKKKrrK',
      '.KrrrrrrrK.',
      '.KrcrrrcrK.',
      '.KrrryrrrK.',
      '..KRrrrRK..',
      '.KrKrrrKrK.',
      '..KrRKRrK..',
      '..KK...KK..',
    ],
  },
  wolf: {
    pal: { g: '#9e9e9e', G: '#616161', w: '#e0e0e0' },
    rows: [
      '.K.K..........',
      'KgKgK.........',
      'KgggggK....KK.',
      'KcgggggKKKKgK.',
      'KgggwgggggggK.',
      '.KKgggggggggK.',
      '...KggGcGggK..',
      '...KgK.KgKgK..',
      '...KK..KK.KK..',
    ],
  },
  bat: {
    pal: { b: '#4a3a5e', B: '#2c2238' },
    rows: [
      'K.........K',
      'KbK.K.K.KbK',
      'KbbKKKKKbbK',
      'KbbbBcBbbbK',
      '.KbbKbKbbK.',
      '..KK.K.KK..',
    ],
  },
  skull: {
    pal: { b: '#efe9d6', B: '#a8a08a' },
    rows: [
      '..KKKKK..',
      '.KbbbbbK.',
      'KbbbbbbbK',
      'KbKcbKcbK',
      'KbKKbKKbK',
      'KbbbKbbbK',
      '.KbBbBbK.',
      '..KbKbK..',
      '...KKK...',
    ],
  },
  golem: {
    pal: { o: '#c08a3e', O: '#8a5a22', y: '#ffe082' },
    rows: [
      '....KKKKKK....',
      '...KooooooK...',
      '...KocooocK...',
      '...KooooooK...',
      '.KKKOOOOOOKKK.',
      'KooKooyyooKooK',
      'KooKoyccyoKooK',
      'KOOKooyyooKOOK',
      'KooKooooooKooK',
      '.KKKOOOOOOKKK.',
      '...KooKKooK...',
      '...KooK.KooK..',
      '...KKKK.KKKK..',
    ],
  },
  spider: {
    pal: { s: '#3e2f4a', S: '#6a5480' },
    rows: [
      'K.K.....K.K',
      '.KsK.K.KsK.',
      'K.KsKKKsK.K',
      '.KKsSsSsKK.',
      'KsKscscsKsK',
      '.K.KsssK.K.',
      '..K.KKK.K..',
    ],
  },
  ghost: {
    pal: { w: '#e8f4ff', W: '#b0c8e0' },
    rows: [
      '...KKKK...',
      '..KwwwwK..',
      '.KwwwwwwK.',
      '.KwKwwKwK.',
      '.KwcwwcwK.',
      '.KwwwwwwK.',
      'KwwwKKwwwK',
      'KwwwwwwwwK',
      'KWwwWwwWwK',
      '.KWK.KWK..',
      '..K...K...',
    ],
  },
  totem: {
    pal: { t: '#8d6e63', T: '#5d4037', g: '#81c784' },
    rows: [
      '...KKKK...',
      '..KggggK..',
      '.KKKKKKKK.',
      '.KtctctcK.',
      '.KttTTttK.',
      '.KKKKKKKK.',
      '..KtccTK..',
      '..KtTTtK..',
      '..KKKKKK..',
      '..KtttTK..',
      '..KTttTK..',
      '.KKKKKKKK.',
    ],
  },
  wisp: {
    pal: { w: '#ffffff' },
    rows: [
      '.KK.',
      'KcwK',
      'KwcK',
      '.KK.',
    ],
  },
  drake: {
    pal: { d: '#e53935', D: '#8e1c1c', y: '#ffca28' },
    rows: [
      '......KK.......',
      'K....KddK....K.',
      'KK..KddcdK..KK.',
      'KdK.KdddddKKdK.',
      'KddKKddyddKddK.',
      '.KddKdyydKddK..',
      '..KddddddddK...',
      '...KDddddDKKK..',
      '....KdKKdK..dK.',
      '....KK..KK...K.',
    ],
  },
};

const cache = {};
/** A summon's sprite in its caster's colour. flash = just got hit. */
export function summonSprite(kind, color, flash = false) {
  const key = kind + color + flash, a = ART[kind];
  if (!a) return null;
  if (!cache[key]) {
    const pal = { K, c: color, ...a.pal };
    if (flash) for (const k of Object.keys(pal)) if (k !== 'K') pal[k] = '#ffffff';
    cache[key] = sprite(a.rows, pal);
  }
  return cache[key];
}
export const FLYING = new Set(['bat', 'ghost', 'wisp', 'drake', 'skull']);
export { shade };
