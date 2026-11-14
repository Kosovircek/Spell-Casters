// A caster's magic: the effect spells they have learned, their mana, cooldowns and the spell buffs on them
// (mirror, clone, invisibility...). Every Player has one. Only effect spells use mana; letter spells are free.
import { SPELLS, SPELL_BY_ID, catalog } from './spellbook.js';

export const MANA = {
  base: 30,          // max mana at level 1...
  perLevel: 4,       // ...plus this per level (146 at level 30)
  regen: 1.5,        // mana per second...
  regenPerLevel: 0.05, // ...plus this per level
  duel: 100,         // in the duel arena both casters have the same pool
  duelRegen: 4,
};

export class Grimoire {
  constructor(owner) {
    this.owner = owner;
    this.known = new Set();   // spell ids
    this.mana = MANA.base;
    this.cooldowns = {};      // id -> time (ms) it can be cast again
    this.last = null;         // id of the last effect spell cast (for ITERUM)
    this.clone = 0;           // GEMINI: spells left that are cast twice...
    this.cloneUntil = 0;      // ...until this time
    this.dirty = true;        // the client's grimoire screen needs a fresh copy
  }

  get maxMana() { return this.owner.duelMana ? MANA.duel : MANA.base + MANA.perLevel * (this.owner.level - 1); }
  get regenRate() { return this.owner.duelMana ? MANA.duelRegen : MANA.regen + MANA.regenPerLevel * (this.owner.level - 1); }

  knows(id) { return this.known.has(id); }
  learn(id) { if (!SPELL_BY_ID[id] || this.known.has(id)) return false; this.known.add(id); this.dirty = true; return true; }
  learnAll() { for (const s of SPELLS) this.known.add(s.id); this.dirty = true; }
  cooldownLeft(id, now) { return Math.max(0, (this.cooldowns[id] || 0) - now); }

  tick(dt) { this.mana = Math.min(this.maxMana, this.mana + this.regenRate * dt); }
  fill() { this.mana = this.maxMana; }

  // ---- saving
  toSave() { return { known: [...this.known], mana: Math.round(this.mana) }; }
  restore(s) {
    if (!s) return;
    this.known = new Set((s.known || []).filter(id => SPELL_BY_ID[id]));
    this.mana = Math.min(this.maxMana, Number.isFinite(s.mana) ? s.mana : this.maxMana);
    this.dirty = true;
  }

  /** Small, every tick: mana and the cooldowns still running (seconds, one decimal). */
  snapshot(now) {
    const cd = {};
    for (const [id, t] of Object.entries(this.cooldowns)) if (t > now) cd[id] = Math.ceil((t - now) / 100) / 10;
    return { mana: Math.floor(this.mana), maxMana: this.maxMana, cd, clone: this.clone && this.cloneUntil > now ? this.clone : 0 };
  }
  /** Big, only when it changed: the whole spell list and which ones I know. */
  message() { this.dirty = false; return { t: 'grimoire', spells: catalog(), known: [...this.known] }; }
}
