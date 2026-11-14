// Floor modifiers: a curse or a blessing laid over a floor, rolled again whenever a floor fills with new enemies
// (someone arrives on an empty floor, or after a wipe). About half of all floors get one; the boss floor of a biome
// never gets a curse.
//
// Each modifier only sets numbers the game already reads (see the getters on Level):
//   wordShift  letters added to (or taken from) the longest enemy word
//   foePace    enemies walk and throw this much faster
//   hurtMult   casters take this much more damage
//   goldMult, xpMult, manaMult  multiply what casters get
//   springs    casters regenerate quickly after a few quiet seconds
//   runeTide   no letter spells; effect spells cost nothing and cool down twice as fast
//   silent     enemies sleep until a caster types Morse nearby
export const MODS = {
  // ---- curses
  longwords: { kind: 'curse', name: 'Words of Power', desc: 'Enemy names are a letter longer.', wordShift: 1 },
  restless: { kind: 'curse', name: 'Restless Dead', desc: 'Enemies walk and throw a third faster.', foePace: 1.33 },
  thinair: { kind: 'curse', name: 'Thin Air', desc: 'Enemy letters hurt 40% more.', hurtMult: 1.4 },
  runetide: { kind: 'curse', name: 'Rune Tide', desc: 'Letter spells do nothing here, but effect spells cost no mana and cool down twice as fast.', runeTide: true },
  silent: { kind: 'curse', name: 'Silent Floor', desc: 'Enemies sleep. Tapping Morse makes noise and wakes those within 7 tiles.', silent: true },
  // ---- blessings
  golden: { kind: 'blessing', name: 'Golden Floor', desc: 'Double gold from enemies and chests.', goldMult: 2 },
  scholar: { kind: 'blessing', name: 'Scholar\'s Floor', desc: '50% more XP.', xpMult: 1.5 },
  whispers: { kind: 'blessing', name: 'Whispered Names', desc: 'Enemy names are a letter shorter.', wordShift: -1 },
  springs: { kind: 'blessing', name: 'Healing Springs', desc: 'After 3 quiet seconds you heal 1 HP every 2 seconds.', springs: true },
  leylines: { kind: 'blessing', name: 'Ley Lines', desc: 'Mana comes back twice as fast.', manaMult: 2 },
};

/** Effect spells that take letters off enemies: the Rune Tide only comes when everyone here knows one. */
const ATTACKS = ['fire', 'bolt', 'quake', 'meteor', 'nova', 'beam', 'thorn', 'poison', 'storm', 'lava', 'shard', 'void', 'imp', 'wolf', 'skull', 'swarm', 'drake', 'drain'];

/**
 * Modifiers for a floor right now. casters = who is on it (the Rune Tide needs every one of them to know an
 * attacking effect spell). For testing, FORCE_MOD=runetide,golden puts those on every floor.
 */
export function rollMods(floor, bossFloor, casters) {
  const forced = (process.env.FORCE_MOD || '').split(',').map(s => s.trim().toLowerCase()).filter(m => MODS[m]);
  if (forced.length) return forced;
  if (floor < 2 || Math.random() > 0.5) return [];
  const canTide = casters.length && casters.every(p => ATTACKS.some(id => p.magic.knows(id)));
  const ok = Object.keys(MODS).filter(m => (m !== 'runetide' || canTide) && !(bossFloor && MODS[m].kind === 'curse'));
  return ok.length ? [ok[Math.floor(Math.random() * ok.length)]] : [];
}

/** One number from the active modifiers (multipliers multiply, shifts add, flags are true if any is). */
export function modValue(mods, key, base) {
  let v = base;
  for (const m of mods) {
    const x = MODS[m]?.[key];
    if (x === undefined) continue;
    if (typeof x === 'boolean') v = v || x;
    else if (key === 'wordShift') v += x;
    else v *= x;
  }
  return v;
}
