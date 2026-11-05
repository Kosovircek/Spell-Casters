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

export const EFFECTS = {
  swiftSeconds: 30,     // Potion of Speed
  slowSeconds: 15,      // Scroll of Slow Time
  cloakRange: 4,        // tiles at which a cloak counters an incoming letter
  regenSeconds: 20,     // Amulet of Regeneration
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
  turnRate: 2.5,          // radians per second: homing is gentle, so a late sidestep can make a spell miss
  countdown: 3,           // seconds before each round
  roundPause: 3,          // seconds to look at the result of a round
  matchPause: 6,          // seconds after the winning round before a new duel starts
};
