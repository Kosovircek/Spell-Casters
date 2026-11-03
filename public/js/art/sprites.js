// Character, chest and item sprites, built once from palette strings and cached.
import { sprite, shade } from './canvas.js';

const WIZARD = [
  '......KK......',
  '.....KHHK.....',
  '....KHHHK.....',
  '....KHhHHK....',
  '...KHHHHHHK...',
  '.KKKKKKKKKKKK.',
  '...KSSSSSK..G.',
  '...KSKSSKSK.W.',
  '...KSSSSSK..W.',
  '..KRRRRRRRK.W.',
  '.KRRrRRRrRRKW.',
  '.KSRRrRRRRSKW.',
  '..KRRRrRRRK.W.',
  '..KRRRRRRrK.W.',
  '.KRRRRRRRRRK..',
  '.KKKKKKKKKKK..',
];
const SLIME = [
  '....KKKKK....',
  '..KKGGGGGKK..',
  '.KGgGGGGGGGK.',
  '.KGWWGGGWWGK.',
  'KGGWKGGGWKGGK',
  'KGGGGGGGGGGGK',
  'KGGGGdddGGGGK',
  'KdGGGGGGGGGdK',
  '.KKKKKKKKKKK.',
];
const MAGE = [
  '.....KKKK.....',
  '....KBBBBK....',
  '...KBBBBBBK...',
  '...KBKBBKBK...',
  '...KBRBBRBK...',
  '....KBKKBK....',
  '.....KBBK.....',
  '..KKPPPPPPKK..',
  '.KPPPBPPBPPPK.',
  'KBKPPPPPPPPKBK',
  '.K.KPPpPPPK.K.',
  '...KPPPPpPK...',
  '...KPpPPPPK...',
  '..KPPPPPPPPK..',
  '..KKKKKKKKKK..',
];

const spriteCache = {};
const CHEST_CLOSED = [
  '.KKKKKKKKKKKK.',
  'KwwwwwwwwwwwwK',
  'KwWwwwwwwwwWwK',
  'KwwwwwwwwwwwwK',
  'KKKKKKyyKKKKKK',
  'KwwwwwKyKwwwwK',
  'KwWwwwyyywwWwK',
  'KwwwwwwwwwwwwK',
  'KWwwwwwwwwwwWK',
  'KKKKKKKKKKKKKK',
];
const CHEST_OPEN = [
  '.KKKKKKKKKKKK.',
  'KwwwwwwwwwwwwK',
  'KKKKKKKKKKKKKK',
  'KddddddddddddK',
  'KdYddddddYdddK',
  'KKKKKKKKKKKKKK',
  'KwWwwwwwwwwWwK',
  'KwwwwwwwwwwwwK',
  'KWwwwwwwwwwwWK',
  'KKKKKKKKKKKKKK',
];
export function chestSprite(open, flash) {
  const key = 'chest' + open + flash;
  if (!spriteCache[key]) spriteCache[key] = sprite(open ? CHEST_OPEN : CHEST_CLOSED, {
    K: '#0b0910', w: flash ? '#fff' : '#a0682f', W: flash ? '#fff' : '#6d4320', y: '#ffd54f', d: '#1a1220', Y: '#ffd54f',
  });
  return spriteCache[key];
}

// Walk cycle: frame 0 = standing, 1 = stride, 2 = passing step.
const WIZARD_FEET = ['...bb..bb.....', '..bb.....bb...', '....bb.bb.....'];
const MAGE_FEET = ['...BB....BB...', '..BB......BB..', '....BB..BB....'];
export function wizardSprite(color, hurt, frame = 0) {
  const key = color + hurt + frame;
  if (!spriteCache[key]) spriteCache[key] = sprite(WIZARD.concat([WIZARD_FEET[frame]]), {
    b: '#4e342e',
    K: '#0b0910', H: hurt ? '#ffffff' : shade(color, 0.75), h: '#ffd54f', S: hurt ? '#ffffff' : '#f2c9a0',
    R: hurt ? '#ffffff' : color, r: hurt ? '#ffffff' : shade(color, 0.7), W: '#8d6e63', G: '#fff59d',
  });
  return spriteCache[key];
}
export function enemySprite(type, flash, frame = 0) {
  const key = type + flash + frame;
  if (!spriteCache[key]) {
    if (type === 'slime') spriteCache[key] = sprite(SLIME, { K: '#0b0910', G: flash ? '#fff' : '#66bb6a', g: '#c5e1a5', d: flash ? '#fff' : '#388e3c', W: '#fff', });
    else spriteCache[key] = sprite(MAGE.concat([MAGE_FEET[frame]]), { K: '#0b0910', B: flash ? '#fff' : '#e0dccc', R: '#ff1744', P: flash ? '#fff' : '#7e57c2', p: flash ? '#fff' : '#5e35b1' });
    spriteCache[key].wrong = null;
  }
  return spriteCache[key];
}

// ---- floor item icons
const ITEM_ART = {
  potion: ['..KKK..', '..KwK..', '.KKwKK.', 'KcccccK', 'KcWcccK', 'KcccccK', 'KcccccK', '.KKKKK.'],
  scroll: ['.KKKKKKK.', 'KpPpppppK', '.KpppppK.', '.KpPPppK.', '.KpppppK.', 'KpppppPpK', '.KKKKKKK.'],
  cloak: ['..KKKK..', '.KccccK.', 'KccccccK', 'KcWccccK', 'KccccccK', 'KcccKccK', 'KKKK.KKK'],
  body: ['.KK..KK.', 'KccKKccK', 'KccccccK', '.KcWccK.', '.KccccK.', '.KccccK.', '.KKKKKK.'],
  ring: ['..KyK..', '.KyKyK.', 'KyK.KyK', 'KyK.KyK', '.KyyyK.', '..KKK..'],
  neck: ['K.....K', '.K...K.', '..K.K..', '..KyK..', '.KycyK.', '..KyK..', '...K...'],
  head: ['...KKK...', '..KcccK..', '.KcycccK.', 'KKKKKKKKK'],
  feet: ['.KKK....', '.KcK....', '.KcK....', '.KccKK..', '.KccccK.', '.KKKKKK.'],
  weapon: ['.....KG', '....KWK', '...KWK.', '..KWK..', '.KWK...', 'KWK....', 'KK.....'],
};
const ITEM_COLORS = {
  pot_heal: '#ef5350', pot_speed: '#4fc3f7', pot_ward: '#80deea',
  cloak_ward: '#7e57c2', robe_vit: '#c62828', hat_insight: '#ffd54f', boots_speed: '#8d6e63',
  ring_reflect: '#e0e0e0', amulet_regen: '#e91e63', staff_fork: '#aed581', staff_haste: '#4fc3f7',
};
export function itemSprite(kind, type, slot) {
  const key = 'item' + kind;
  if (!spriteCache[key]) {
    const art = type === 'potion' ? ITEM_ART.potion : type === 'scroll' ? ITEM_ART.scroll : ITEM_ART[slot] || ITEM_ART.cloak;
    const c = ITEM_COLORS[kind] || '#ffd54f';
    spriteCache[key] = sprite(art, { K: '#0b0910', c, w: '#e0e0e0', W: '#ffffff', p: '#e8d9b0', P: '#8d6e63', y: '#ffd54f', G: c });
  }
  return spriteCache[key];
}

// ---- the Bellwraith (boss): a hooded spirit; its bell is drawn separately so it can swing and glow
const WRAITH = [
  '.......KKKK.......',
  '.....KKCCCCKK.....',
  '....KCCCCCCCCK....',
  '...KCCCccccCCCK...',
  '...KCCcKKKKcCCK...',
  '..KCCcKEKKEKcCCK..',
  '..KCCcKKKKKKcCCK..',
  '..KCCCcKKKKcCCCK..',
  '.KCCCCCccccCCCCCK.',
  'KCCcCCCCCCCCCCcCCK',
  'KCKcCCCCCCCCCCcKCK',
  '.K.KCCCCCCCCCCK.K.',
  '...KCCcCCCCcCCK...',
  '...KCCCCCCCCCCK...',
  '..KCCCcCCCCcCCCK..',
  '..KCCCCCCCCCCCCK..',
  '.KCCcCCCCCCCCcCCK.',
  '.KCCCCCCCCCCCCCCK.',
  '.KCKCCKCCKCCKCCKK.',
  '.K.K.KK.KK.KK.K.K.',
];
const BELL = ['...K...', '..KKK..', '.KYYYK.', '.KYyYK.', 'KYYYYYK', 'KYYYYYK', 'KKKKKKK', '...K...'];
export function wraithSprite(flash, lit, phase) {
  const key = 'wraith' + flash + lit + phase;
  if (!spriteCache[key]) {
    const cloak = ['#455a64', '#4a3f6b', '#5d2f4f', '#6b2020'][Math.min(phase, 3)];
    spriteCache[key] = sprite(WRAITH, { K: '#0b0910', C: flash ? '#fff' : cloak, c: flash ? '#fff' : shade(cloak, 0.65), E: lit ? '#ffffff' : '#4dd0e1' });
  }
  return spriteCache[key];
}
export function bellSprite(lit) {
  const key = 'bell' + lit;
  if (!spriteCache[key]) spriteCache[key] = sprite(BELL, { K: '#0b0910', Y: lit ? '#fff9c4' : '#c9a227', y: lit ? '#ffffff' : '#ffe082' });
  return spriteCache[key];
}
