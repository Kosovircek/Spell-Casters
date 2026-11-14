// The ten biomes of the dungeon. Every biome is a run of three floors with its own look (the client draws it from
// the biome's id), its own ground (see terrain.js), its own rules while you are on it (see Environment.js), its
// favourite enemies plus a native kind that only lives there (see natives.js), and a boss of its own that guards
// the last floor of the run (see biomeBosses.js).
//
//   floors  1-3  Flooded Crypt     4-6  Volcanic Forge   7-9  Frozen Halls   10-12 Dark Catacombs  13-15 Overgrown Ruins
//          16-18 Library of Echoes 19-21 Clockwork Vault 22-24 Mirror Maze  25-27 Storm Spire     28-30 Void Rift
//
// Below floor 30 the biomes come round again in the same order (31-33 is a crypt again), deeper and harder.
//
// favor:  enemy type -> weight multiplier on this biome's floors (types that do not fit the floor's depth stay out)
// natives: kinds that only appear here (any depth)
// power:  effect spell id -> how strong it is here (durations and damage scale with it; see Magic.run)
// intro:  what a caster is told when they first walk into the biome
//
// For testing, FORCE_BIOME=forge makes every floor that biome.
export const RUN = 3; // floors per biome

export const BIOMES = [
  {
    id: 'crypt', name: 'the Flooded Crypt', natives: ['drowned'], boss: 'abbot',
    favor: { zombie: 3, skeleton: 2, slime: 2, ghoul: 2, mummy: 2, twinslime: 2, leech: 3 },
    power: {},
    intro: 'Black water fills the crypt. Shallow water slows you; deep water can only be crossed where GELU freezes it. FULGUR on a foe in the water hits twice as hard and leaps through the water. The Drowned only show their names when they surface.',
  },
  {
    id: 'forge', name: 'the Volcanic Forge', natives: ['cinder'], boss: 'forgemaster',
    favor: { imp: 3, goblin: 2, beetle: 2, golem: 2, troll: 2, cultist: 2, fusebeetle: 3 },
    power: { fire: 0.5, lava: 0.6, meteor: 0.7 },
    intro: 'The heat slowly drains your mana. Lava blocks the way, but GELU and GRANDO cool it into rock. Vents erupt in a steady rhythm: watch for the glow. Fire is weak here and Cinderlings shrug it off.',
  },
  {
    id: 'frozen', name: 'the Frozen Halls', natives: ['yeti'], boss: 'matron',
    favor: { frostwisp: 4, bonehound: 2, skeleton: 2, wisp: 2, troll: 2, archer: 2 },
    power: { ice: 1.3, shard: 1.3 },
    intro: 'Ice is slippery: you slide and turn slowly. Walls of ice seal some passages: IGNIS and LUX melt them, or chip them with three letter spells. When a blizzard blows, enemy names hide unless you are close.',
  },
  {
    id: 'catacombs', name: 'the Dark Catacombs', natives: ['stalker'], boss: 'lightless',
    favor: { shade: 3, bat: 3, ghoul: 2, wisp: 2, lurker: 3, phantom: 3, moth: 2 },
    power: { light: 1.5 },
    intro: 'Pitch black. You see enemies only by their glowing names. Spell the letter on a brazier to light it for good; LUX lights your way. Gloom Stalkers hide their names outside the light.',
  },
  {
    id: 'ruins', name: 'the Overgrown Ruins', natives: ['spitter'], boss: 'thornmother',
    favor: { sporecap: 3, spider: 3, beetle: 2, mossback: 3, goblin: 2, broodmother: 2 },
    power: { root: 1.8, spider: 1.8, thorn: 1.5, fire: 1.2 },
    intro: 'Vines choke the passages and grow back. Cut a vine with any letter spell, or burn a whole thicket with fire. Seed Spitters plant new vines where their letters fall. RADIX and ARANEA are stronger here.',
  },
  {
    id: 'library', name: 'the Library of Echoes', natives: ['inkwraith'], boss: 'archivist',
    favor: { mage: 3, cultist: 3, scribe: 4, moth: 3, jumble: 2, mockingbird: 2 },
    power: { echo: 1.3 },
    intro: 'Rune doors bar the halls: read the riddle and spell its answer at the door. Spellbooks are everywhere here. Ink Wraith letters are blots of ink until they come close.',
  },
  {
    id: 'clockwork', name: 'the Clockwork Vault', natives: ['cogsoldier'], boss: 'colossus',
    favor: { golem: 3, boneknight: 2, gargoyle: 2, fusebeetle: 3, keyshell: 2, beetle: 2 },
    power: { slow: 1.5 },
    intro: 'Pistons slam across the halls, rotors sweep the rooms and blade plates snap up on a beat. TARDUS on (or near) machinery slows it down. Cog Soldiers all fire on the same tick.',
  },
  {
    id: 'mirror', name: 'the Mirror Maze', natives: ['reflection'], boss: 'sovereign',
    favor: { mirrorling: 4, mirrorknight: 4, phantom: 2, blinker: 2, shade: 2, jumble: 2 },
    power: { mirror: 1.5 },
    intro: 'Every wall is a mirror: spells that fly free (yours and theirs) bounce off them. Reflections of you walk the maze, mirroring your steps, with their names written back to front.',
  },
  {
    id: 'storm', name: 'the Storm Spire', natives: ['stormhawk'], boss: 'tempest',
    favor: { gargoyle: 3, bat: 2, wisp: 3, imp: 2, warhorn: 2, archer: 2 },
    power: { bolt: 1.5, storm: 1.5 },
    intro: 'The wind turns every few seconds and pushes letters sideways. Lightning strikes where a circle glows: step out of it. FULGUR and NIMBUS are stronger in the storm.',
  },
  {
    id: 'void', name: 'the Void Rift', natives: ['voideye'], boss: 'riftmaw',
    favor: { shade: 3, phantom: 2, blinker: 3, golem: 2, cultist: 2, gremlin: 2 },
    power: { void: 1.8, gravity: 1.8, portal: 1.3 },
    intro: 'Bridges over the void crumble a moment after you step on them: keep moving. Gravity wells pull letters and casters in; portals link far rooms. CHAOS and PONDUS are strongest here.',
  },
];

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map(b => [b.id, b]));

const forced = () => BIOME_BY_ID[(process.env.FORCE_BIOME || '').trim().toLowerCase()] || null;

/** The biome of a floor (null for the surface). */
export function biomeFor(floor) {
  if (floor <= 0) return null;
  return forced() || BIOMES[Math.floor((floor - 1) / RUN) % BIOMES.length];
}
/** The last floor of a biome's run: its own boss guards the stairs there. */
export const isBiomeBossFloor = (floor) => floor > 0 && floor % RUN === 0;
/** Which floor of its run this is (1, 2 or 3). */
export const runStep = (floor) => ((floor - 1) % RUN) + 1;
