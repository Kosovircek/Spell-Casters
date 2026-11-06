// Tunable game constants, shared by every server module.
export const PORT = process.env.PORT || 3000;
export const TICK_MS = 50;                // server simulation step (20 Hz)
export const DT = TICK_MS / 1000;         // seconds per tick
export const MAP_W = 48, MAP_H = 48;      // dungeon size in tiles
export const MAX_PLAYERS = 4;

export const PLAYER = {
  speed: 3.6,          // tiles per second
  radius: 0.3,
  respawnSeconds: 10,
  colors: ['#4fc3f7', '#ff8a65', '#aed581', '#ce93d8'],
};

export const SPELL = {
  speed: 8,                                   // tiles per second
  lifetime: 3.2,                              // seconds
  homingCone: Math.cos(70 * Math.PI / 180),   // how far off the chosen direction a target may be
  homingRange: 14,                            // straight-line distance to consider a target
  homingPath: 26,                             // max path length (tiles) a spell will travel around walls
  turnRate: 10,                               // radians per second
  maxLetters: 8,
};

/**
 * Hit sizes, in tiles. Hits are checked between centres, so these are distances, not per-thing radii.
 * The client gets them with the map and draws them when hitboxes are on, so what you see is what counts.
 */
export const HITBOX = {
  caster: 0.45,   // an enemy letter (or a duel spell) hits a caster when its centre comes this close
  block: 0.6,     // two spells meet (and may block each other) when their centres come this close
  chest: 0.55,    // a spell opens a chest from this close
  // In a duel every letter of a spell is its own box, the size of the letter as drawn (6 x 8 pixels), side by
  // side across the word: a spell hits a caster as soon as any letter's box touches the caster's ring.
  letterW: 6 / 16,
  letterH: 8 / 16,
};

export const EFFECTS = {
  swiftSeconds: 30,     // Potion of Speed
  slowSeconds: 15,      // Scroll of Slow Time
  cloakRange: 4,        // tiles at which a cloak counters an incoming letter
  regenSeconds: 20,     // Amulet of Regeneration
  travelSeconds: 5,     // Scroll of Recall and the descent scrolls: the party is carried away after this long
};

/** Floors deeper down get harder, but some numbers stop growing so a deep floor is not wall-to-wall enemies. */
export const DEPTH = {
  maxEnemies: 24,       // regular enemies on one floor (3 + 2 per floor until this)
  maxExtraShots: 6,     // extra enemy letters allowed in the air at once (half the floor number until this)
};

export const GOLD = {
  start: 100,           // a new caster's purse
  perKill: 2,           // gold for a slime on floor 1; +1.5 per floor, x1.5 for mages, x10 for the Bellwraith
  perChest: 8,          // gold in a chest per floor number
};

export const LEVELS = {
  max: 30,
  baseHp: 20,           // max HP at level 1
  hpPerLevel: 6,
  speedPerLevel: 0.01,  // +1% walking speed per level
  regenDelay: 10,       // natural regen starts after this many seconds without being hit
  regenEvery: 10,       // ...then 1 HP every this many seconds
  reviveShare: 0.5,     // downed casters and party wipes come back at 50% HP
};

/** The duel room: two casters on a long, narrow platform among the stars. */
export const DUEL = {
  mapW: 30, mapH: 11,     // tiles (the platform sits in the middle, the rest is open sky)
  platformLength: 26,
  platformWidth: 5,
  hp: 50,                 // everyone has the same HP in a duel; levels and gear do not count
  winsNeeded: 3,          // first to win this many rounds wins the duel
  spellSpeed: 4,          // tiles per second: slow enough to read an incoming word and block it
  spellLifetime: 9,       // seconds
  bendRate: 0.4,          // radians per second a spell may curve toward the other caster...
  maxBend: 0.2,           // ...and at most this much in total (about 11 degrees): it bends, it does not track
  bendStop: 5,            // tiles: closer than this it flies straight, so a sidestep makes it miss
  blockTurnRate: 4,       // a spell aimed at an incoming spell (a block) still steers firmly to meet it
  countdown: 3,           // seconds before each round
  roundPause: 3,          // seconds to look at the result of a round
  matchPause: 6,          // seconds after the winning round before a new duel starts
};
