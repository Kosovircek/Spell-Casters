// A debug character for trying everything out: join with the name Dumbledore (any capitals) and you are at the
// max level, know every effect spell, and your house holds one of every item in the game (a stack of each potion,
// scroll and spellbook, every mythic item, and every common item in every material, plain and enchanted).
// It happens every time you join, so the house is refilled each time.
import { LEVELS } from '../config.js';
import * as Items from '../items.js';
import { letterPool } from '../words.js';

export const DEBUG_NAME = 'dumbledore';
export const isDumbledore = (name) => String(name || '').trim().toLowerCase() === DEBUG_NAME;

/** One of everything. */
export function everyItem() {
  const pool = letterPool(99), out = [];
  for (const kind of Object.keys(Items.CONSUMABLES)) out.push(Items.makeItem(kind, Items.isGear({ kind }) ? {} : { n: 9 }));
  for (const kind of Object.keys(Items.MYTHIC)) out.push(Items.mythicItem(kind, pool));
  for (const [base, b] of Object.entries(Items.BASES)) {
    Items.MATERIALS.forEach((_, mat) => {
      const extra = { mat, ...(b.letters ? { letters: pool.slice(0, b.letters[mat]) } : {}) };
      out.push(Items.makeItem('c_' + base, extra));
      if (b.slot !== 'weapon') for (const ench of Object.keys(Items.ENCHANTS)) out.push(Items.makeItem('c_' + base, { ...extra, ench }));
    });
  }
  for (const kind of Object.keys(Items.BOOKS)) out.push(Items.makeItem(kind, { n: 3 }));
  return out;
}

/** Turn this caster into the debug character. */
export function makeDumbledore(pl) {
  pl.level = LEVELS.max; pl.xp = 0;
  pl.refreshStats();
  pl.hp = pl.maxHp;
  pl.magic.learnAll();
  pl.magic.fill();
  pl.home = everyItem();
  pl.homeSize = pl.home.length + 24;
  pl.gold = Math.max(pl.gold, 99999);
  pl.immortal = true; // no damage, and effect spells cost no mana (only outside duels: a duel stays fair)
  pl.tell('Dumbledore: max level, immortal, endless mana, every effect spell, and one of everything in your house. Have fun!');
}
