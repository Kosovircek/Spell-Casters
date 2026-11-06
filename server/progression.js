// Levels, XP and damage numbers.
import { LEVELS, GOLD } from './config.js';
import { BESTIARY } from './bestiary.js';

// Letter difficulty follows the floors' letter tiers: E T A N I M = 1 ... B C J P Q V X Y Z = 4.
export const LETTER_VALUE = {};
['ETANIM', 'SOURDK', 'GWHLF', 'BCJPQVXYZ'].forEach((tier, i) => { for (const c of tier) LETTER_VALUE[c] = i + 1; });

/** XP for spelling a whole word on an enemy (or chest) of this type. */
export function xpFor(word, type) {
  const sum = [...word].reduce((a, c) => a + (LETTER_VALUE[c] || 1), 0);
  return Math.max(1, Math.round(sum * (type === 'chest' ? 0.5 : BESTIARY[type]?.xp ?? 1)));
}

/** XP needed to go from level L to L+1. */
export const xpToNext = (level) => Math.round(10 * Math.pow(level, 1.5));

/** Base max HP at a level, before gear. */
export const baseHp = (level) => LEVELS.baseHp + LEVELS.hpPerLevel * (level - 1);

/** Damage of one enemy letter on this floor (before the random roll and armor). */
export function letterDamage(enemyType, floor) {
  const base = BESTIARY[enemyType]?.dmg ?? 4;
  return base * (1 + 0.25 * (floor - 1));
}

/** Share of damage that gets through this much armor: 25 -> 80%, 100 -> 50%. */
export const armorFactor = (armor) => 100 / (100 + Math.max(0, armor));

/** Gold for finishing an enemy of this type on this floor (roughly; a little random). */
export function goldFor(enemyType, floor) {
  const mult = BESTIARY[enemyType]?.gold ?? 1;
  return Math.max(1, Math.round((GOLD.perKill + 1.5 * (floor - 1)) * mult * (0.6 + Math.random() * 0.8)));
}
/** Gold in a chest on this floor. */
export const chestGold = (floor) => Math.round(GOLD.perChest * floor * (0.5 + Math.random()));
