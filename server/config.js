// Tunable game constants, shared by every server module.
export const PORT = process.env.PORT || 3000;
export const TICK_MS = 50;                // server simulation step (20 Hz)
export const DT = TICK_MS / 1000;         // seconds per tick
export const MAP_W = 48, MAP_H = 48;      // dungeon size in tiles
export const MAX_PLAYERS = 4;

export const PLAYER = {
  speed: 3.6,          // tiles per second
  radius: 0.3,
  hp: 5,
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
