// Which letters and words appear on each floor. Floor 1 uses the easiest Morse letters.
const LETTER_TIERS = ['ETANIM', 'SOURDK', 'GWHLF', 'BCJPQVXYZ'];

const WORDS = ['IT', 'AT', 'IN', 'AN', 'ME', 'AM', 'TO', 'SO', 'DO', 'NO', 'GO', 'UP', 'US', 'AS', 'IS', 'ON',
  'TEA', 'EAT', 'ATE', 'MEN', 'TAN', 'NET', 'TIN', 'MAT', 'ANT', 'AIM', 'MAN', 'TEN', 'TIME', 'MINT', 'MAIN',
  'SUN', 'RUN', 'DOT', 'NOT', 'RAT', 'SIT', 'DUST', 'MIST', 'RAIN', 'STAR', 'DARK', 'MOON', 'RUNE', 'DOOM', 'ROOT',
  'FIRE', 'WIND', 'GOLD', 'KING', 'WOLF', 'HOWL', 'GLOW', 'SKULL', 'STONE', 'GHOST', 'TORCH', 'SHADOW', 'WRATH',
  'BONE', 'WAND', 'ORB', 'HEX', 'ZAP', 'JINX', 'VOID', 'QUEST', 'BLAZE', 'CRYPT', 'SPELL', 'MAGIC', 'CURSE'];

/** All letters unlocked by this floor, e.g. floor 1 -> "ETANIM". */
export function letterPool(floor) {
  return LETTER_TIERS.slice(0, Math.min(floor, LETTER_TIERS.length)).join('');
}

/** Words that only use letters from the pool. */
export function wordsFor(pool) {
  return WORDS.filter(w => [...w].every(c => pool.includes(c)));
}
