// Every kind of enemy, in one table: who shows up on which floors, how it moves and shoots, and what it is worth.
//
// kind:   'normal'  the everyday crowd of a floor
//         'special' rare enemies with a mechanic of their own (see monsters.js); a floor gets a few at most
//         'boss'    one guards the stairs room of every floor (see bosses.js)
// floors: [first, last] floor it can appear on (normal and special)
// weight: how common it is among the others that fit the floor
// speed:  walking speed in tiles per second; dist: distance it likes to keep from its target
// fire:   [min, max] seconds between attacks (deeper floors shorten it a little)
// shot:   'one' one letter, 'two' two side by side, 'fan3' a fan of three, 'ring4' / 'ring6' a ring, 'none' never shoots
// pace:   speed of its letters: 'slow', 'normal' or 'fast'
// dmg:    damage of one of its letters on floor 1 (+25% per floor), before armor
// xp, gold: multipliers (a slime is 1)
// words:  [chance of a whole word, shortest, longest]; the longest grows with depth from the shortest
// move:   'keep' keeps its distance and circles, 'rush' closes in, 'erratic' flutters, 'skitter' darts about,
//         'still' never moves, 'perch' sits still until someone comes close, 'flee' (see the Pickpocket)
// color:  colour of its death burst on the client
export const BESTIARY = {
  // ---------------------------------------------------------------- the old crowd
  slime:      { name: 'Slime', kind: 'normal', floors: [1, 9], weight: 4, speed: 0.9, dist: 3.5, fire: [6, 9], shot: 'one', pace: 'normal', dmg: 4, xp: 1, gold: 1, words: [0, 1, 1], move: 'keep' },
  mage:       { name: 'Skeleton Mage', kind: 'normal', floors: [1, 99], weight: 3, speed: 0.7, dist: 5, fire: [3.5, 6], shot: 'one', pace: 'normal', dmg: 6, xp: 1.5, gold: 1.5, words: [0.45, 1, 4], move: 'keep' },

  // ---------------------------------------------------------------- 20 new everyday enemies, shallow to deep
  rat:        { name: 'Cave Rat', kind: 'normal', floors: [1, 8], weight: 3, speed: 1.5, dist: 2.5, fire: [6, 9], shot: 'one', pace: 'normal', dmg: 3, xp: 0.8, gold: 0.8, words: [0, 1, 1], move: 'skitter' },
  bat:        { name: 'Dusk Bat', kind: 'normal', floors: [1, 10], weight: 3, speed: 1.6, dist: 3, fire: [5, 8], shot: 'one', pace: 'fast', dmg: 3, xp: 0.9, gold: 0.8, words: [0, 1, 1], move: 'erratic' },
  skeleton:   { name: 'Skeleton', kind: 'normal', floors: [1, 14], weight: 4, speed: 0.85, dist: 3.5, fire: [4, 7], shot: 'one', pace: 'normal', dmg: 5, xp: 1.2, gold: 1.1, words: [0.3, 1, 3], move: 'keep' },
  sporecap:   { name: 'Sporecap', kind: 'normal', floors: [1, 12], weight: 2, speed: 0, dist: 0, fire: [6, 8], shot: 'ring4', pace: 'slow', dmg: 4, xp: 1, gold: 1, words: [0.2, 1, 3], move: 'still' },
  zombie:     { name: 'Zombie', kind: 'normal', floors: [2, 16], weight: 4, speed: 0.5, dist: 2, fire: [5, 8], shot: 'one', pace: 'slow', dmg: 6, xp: 1.3, gold: 1.2, words: [0.6, 2, 4], move: 'rush' },
  goblin:     { name: 'Goblin', kind: 'normal', floors: [2, 12], weight: 3, speed: 1.1, dist: 4, fire: [4, 6], shot: 'two', pace: 'normal', dmg: 4, xp: 1.2, gold: 1.4, words: [0.3, 1, 3], move: 'keep' },
  beetle:     { name: 'Cave Beetle', kind: 'normal', floors: [2, 14], weight: 2, speed: 0.6, dist: 3, fire: [5, 7], shot: 'one', pace: 'normal', dmg: 5, xp: 1.4, gold: 1.2, words: [0.85, 3, 4], move: 'keep' },
  archer:     { name: 'Skeleton Archer', kind: 'normal', floors: [3, 20], weight: 3, speed: 0.8, dist: 6, fire: [3, 5], shot: 'one', pace: 'fast', dmg: 5, xp: 1.4, gold: 1.3, words: [0.4, 1, 3], move: 'keep' },
  imp:        { name: 'Imp', kind: 'normal', floors: [3, 18], weight: 3, speed: 1.3, dist: 4, fire: [3.5, 5.5], shot: 'two', pace: 'normal', dmg: 5, xp: 1.4, gold: 1.4, words: [0.4, 1, 3], move: 'erratic' },
  ghoul:      { name: 'Ghoul', kind: 'normal', floors: [4, 22], weight: 3, speed: 1.5, dist: 1.8, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 6, xp: 1.5, gold: 1.4, words: [0.5, 2, 4], move: 'rush' },
  spider:     { name: 'Giant Spider', kind: 'normal', floors: [4, 24], weight: 3, speed: 1.4, dist: 3, fire: [4, 6], shot: 'fan3', pace: 'slow', dmg: 5, xp: 1.5, gold: 1.4, words: [0.4, 1, 4], move: 'skitter' },
  wisp:       { name: 'Will-o\'-Wisp', kind: 'normal', floors: [5, 26], weight: 2, speed: 1.0, dist: 5, fire: [3, 4.5], shot: 'one', pace: 'fast', dmg: 5, xp: 1.5, gold: 1.5, words: [0.3, 1, 3], move: 'erratic' },
  bonehound:  { name: 'Bone Hound', kind: 'normal', floors: [6, 28], weight: 3, speed: 1.9, dist: 2, fire: [4, 6], shot: 'one', pace: 'fast', dmg: 6, xp: 1.6, gold: 1.5, words: [0.5, 2, 4], move: 'rush' },
  cultist:    { name: 'Cultist', kind: 'normal', floors: [6, 30], weight: 3, speed: 0.8, dist: 4.5, fire: [4, 6], shot: 'fan3', pace: 'normal', dmg: 6, xp: 1.7, gold: 1.8, words: [0.7, 2, 5], move: 'keep' },
  boneknight: { name: 'Bone Knight', kind: 'normal', floors: [8, 40], weight: 3, speed: 0.6, dist: 3, fire: [4, 6], shot: 'two', pace: 'normal', dmg: 7, xp: 2, gold: 2, words: [0.9, 4, 6], move: 'keep' },
  gargoyle:   { name: 'Gargoyle', kind: 'normal', floors: [10, 45], weight: 2, speed: 1.4, dist: 4, fire: [3, 5], shot: 'one', pace: 'fast', dmg: 6, xp: 2, gold: 2, words: [0.7, 3, 5], move: 'perch' },
  mummy:      { name: 'Mummy', kind: 'normal', floors: [12, 60], weight: 3, speed: 0.5, dist: 2.5, fire: [4, 6], shot: 'two', pace: 'slow', dmg: 7, xp: 2.2, gold: 2.4, words: [0.9, 4, 6], move: 'rush' },
  shade:      { name: 'Shade', kind: 'normal', floors: [14, 99], weight: 3, speed: 1.1, dist: 4, fire: [3, 5], shot: 'one', pace: 'fast', dmg: 7, xp: 2.2, gold: 2.2, words: [0.8, 3, 6], move: 'erratic' },
  troll:      { name: 'Cave Troll', kind: 'normal', floors: [16, 99], weight: 2, speed: 0.7, dist: 3, fire: [5, 7], shot: 'fan3', pace: 'slow', dmg: 8, xp: 2.6, gold: 3, words: [0.9, 4, 6], move: 'rush' },
  golem:      { name: 'Rune Golem', kind: 'normal', floors: [20, 99], weight: 2, speed: 0.4, dist: 3, fire: [6, 8], shot: 'ring6', pace: 'slow', dmg: 8, xp: 3, gold: 3.5, words: [1, 5, 7], move: 'keep' },

  // ---------------------------------------------------------------- 20 rare enemies, each with a trick
  mimic:        { name: 'Mimic', kind: 'special', floors: [1, 99], weight: 3, speed: 1.6, dist: 1.5, fire: [2.5, 4], shot: 'two', pace: 'fast', dmg: 5, xp: 2.5, gold: 4, words: [1, 2, 4], move: 'rush' },
  twinslime:    { name: 'Twin Slime', kind: 'special', floors: [1, 30], weight: 3, speed: 0.8, dist: 3.5, fire: [5, 8], shot: 'one', pace: 'normal', dmg: 4, xp: 1.5, gold: 1.5, words: [1, 2, 4], move: 'keep' },
  moth:         { name: 'Morse Moth', kind: 'special', floors: [1, 99], weight: 3, speed: 1.3, dist: 3.5, fire: [5, 7], shot: 'one', pace: 'normal', dmg: 4, xp: 2.5, gold: 2, words: [0.7, 1, 4], move: 'erratic' },
  pickpocket:   { name: 'Pickpocket', kind: 'special', floors: [1, 99], weight: 2, speed: 2.2, dist: 0, fire: [99, 99], shot: 'none', pace: 'normal', dmg: 0, xp: 2, gold: 2, words: [0.6, 1, 4], move: 'flee' },
  mirrorling:   { name: 'Mirrorling', kind: 'special', floors: [2, 99], weight: 3, speed: 0.9, dist: 4, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 5, xp: 2, gold: 2, words: [1, 3, 6], move: 'keep' },
  jumble:       { name: 'Jumble Sprite', kind: 'special', floors: [2, 99], weight: 3, speed: 1.1, dist: 4, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 5, xp: 2.2, gold: 2, words: [1, 3, 5], move: 'erratic' },
  mockingbird:  { name: 'Mockingbird', kind: 'special', floors: [2, 99], weight: 3, speed: 1.2, dist: 4, fire: [4, 6], shot: 'one', pace: 'fast', dmg: 4, xp: 2, gold: 2, words: [0.7, 1, 4], move: 'erratic' },
  fusebeetle:   { name: 'Fuse Beetle', kind: 'special', floors: [2, 99], weight: 2, speed: 1.0, dist: 1.5, fire: [99, 99], shot: 'none', pace: 'normal', dmg: 12, xp: 2.2, gold: 2.5, words: [0.8, 2, 5], move: 'rush' },
  phantom:      { name: 'Phantom', kind: 'special', floors: [3, 99], weight: 3, speed: 1.0, dist: 4, fire: [3.5, 5], shot: 'one', pace: 'normal', dmg: 6, xp: 2.4, gold: 2.2, words: [0.8, 2, 5], move: 'erratic' },
  lurker:       { name: 'Lurker', kind: 'special', floors: [3, 99], weight: 3, speed: 0.7, dist: 3, fire: [4, 6], shot: 'fan3', pace: 'slow', dmg: 6, xp: 2.2, gold: 2.2, words: [1, 3, 5], move: 'keep' },
  keyshell:     { name: 'Keyshell', kind: 'special', floors: [3, 99], weight: 3, speed: 0.7, dist: 3.5, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 6, xp: 2.4, gold: 2.5, words: [0.8, 2, 5], move: 'keep' },
  blinker:      { name: 'Blink Imp', kind: 'special', floors: [3, 99], weight: 3, speed: 1.2, dist: 4.5, fire: [3.5, 5], shot: 'one', pace: 'fast', dmg: 5, xp: 2.4, gold: 2.2, words: [1, 3, 5], move: 'keep' },
  mossback:     { name: 'Mossback', kind: 'special', floors: [4, 99], weight: 3, speed: 0.4, dist: 3, fire: [5, 7], shot: 'two', pace: 'slow', dmg: 7, xp: 2.5, gold: 2.5, words: [1, 4, 6], move: 'keep' },
  gremlin:      { name: 'Gremlin', kind: 'special', floors: [4, 99], weight: 2, speed: 1.3, dist: 3.5, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 5, xp: 2, gold: 2, words: [1, 2, 4], move: 'erratic' },
  leech:        { name: 'Bloodleech', kind: 'special', floors: [4, 99], weight: 3, speed: 1.0, dist: 2.5, fire: [3, 4.5], shot: 'one', pace: 'fast', dmg: 5, xp: 2.4, gold: 2.2, words: [1, 3, 5], move: 'rush' },
  broodmother:  { name: 'Brood Mother', kind: 'special', floors: [5, 99], weight: 2, speed: 0.5, dist: 4, fire: [5, 7], shot: 'fan3', pace: 'slow', dmg: 6, xp: 3, gold: 3, words: [1, 4, 6], move: 'keep' },
  scribe:       { name: 'Hollow Scribe', kind: 'special', floors: [5, 99], weight: 3, speed: 0.7, dist: 4.5, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 6, xp: 2.6, gold: 2.6, words: [1, 4, 7], move: 'keep' },
  mirrorknight: { name: 'Mirror Knight', kind: 'special', floors: [6, 99], weight: 3, speed: 0.7, dist: 3, fire: [4, 6], shot: 'one', pace: 'normal', dmg: 8, xp: 2.8, gold: 3, words: [1, 3, 6], move: 'keep' },
  warhorn:      { name: 'Warhorn Goblin', kind: 'special', floors: [6, 99], weight: 2, speed: 0.9, dist: 6, fire: [6, 8], shot: 'one', pace: 'normal', dmg: 5, xp: 2.6, gold: 3, words: [0.8, 2, 5], move: 'keep' },
  frostwisp:    { name: 'Frost Wisp', kind: 'special', floors: [7, 99], weight: 3, speed: 1.0, dist: 4.5, fire: [3.5, 5], shot: 'one', pace: 'normal', dmg: 5, xp: 2.6, gold: 2.6, words: [0.7, 2, 5], move: 'erratic' },

  // ---------------------------------------------------------------- bosses (debut = first floor it guards)
  boss:        { name: 'The Bellwraith', kind: 'boss', debut: 1, dmg: 8, xp: 5, gold: 10 },
  gravekeeper: { name: 'The Gravekeeper', kind: 'boss', debut: 3, dmg: 8, xp: 5.5, gold: 11 },
  hydra:       { name: 'The Lettered Hydra', kind: 'boss', debut: 6, dmg: 8, xp: 6, gold: 12 },
  hourglass:   { name: 'The Hourglass Golem', kind: 'boss', debut: 9, dmg: 9, xp: 6.5, gold: 13 },
  echoqueen:   { name: 'The Echo Queen', kind: 'boss', debut: 12, dmg: 8, xp: 7, gold: 14 },
  silentking:  { name: 'The Silent King', kind: 'boss', debut: 15, dmg: 9, xp: 8, gold: 16 },
};

/** A few kinds only appear because something else brings them along. */
BESTIARY.spiderling = { name: 'Spiderling', kind: 'minion', speed: 1.7, dist: 2.5, fire: [5, 7], shot: 'one', pace: 'normal', dmg: 3, xp: 0.6, gold: 0.4, words: [0, 1, 1], move: 'skitter' };
BESTIARY.echoimage = { name: 'Echo', kind: 'minion', dmg: 0, xp: 0, gold: 0 };

export const def = (type) => BESTIARY[type] || BESTIARY.slime;
export const PACE = { slow: 0.7, normal: 1, fast: 1.45 };

/** Everything of this kind that can show up on this floor. */
export function eligible(kind, floor) {
  return Object.entries(BESTIARY).filter(([, d]) => d.kind === kind && floor >= d.floors[0] && floor <= d.floors[1]).map(([type]) => type);
}

/** Pick a type, weighted. */
export function pickWeighted(types) {
  const total = types.reduce((a, t) => a + BESTIARY[t].weight, 0);
  let r = Math.random() * total;
  for (const t of types) { r -= BESTIARY[t].weight; if (r <= 0) return t; }
  return types[types.length - 1];
}
