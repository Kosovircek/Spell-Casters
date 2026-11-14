// Fills a floor with enemies: which kinds, which words, how many rare ones, and which boss guards the stairs.
// Also turns saved enemies back into objects.
//
// For testing, FORCE_ENEMY=phantom,mimic puts those kinds on every floor (as well as the usual crowd) and
// FORCE_BOSS=hydra makes that boss guard every floor.
import { DEPTH } from './config.js';
import { BESTIARY, eligible, pickWeighted, nativesOf } from './bestiary.js';
import { Slime, Mage, Creature, Bellwraith, WordLock } from './entities.js';
import { SPECIALS, Gremlin } from './monsters.js';
import { BOSS_CLASSES } from './bosses.js';
import { NATIVES } from './biomes/natives.js';
import { BIOME_BOSSES } from './biomes/biomeBosses.js';
import { biomeFor, isBiomeBossFloor } from './biomes/biomes.js';
import { rnd, pick } from './util.js';

const BOSSES = { boss: Bellwraith, ...BOSS_CLASSES, ...BIOME_BOSSES };
const listEnv = (name) => (process.env[name] || '').split(',').map(s => s.trim().toLowerCase()).filter(t => BESTIARY[t]);

/** A new enemy of this type. */
export function makeEnemy(type, x, y, word) {
  if (type === 'slime') return new Slime(x, y, word);
  if (type === 'mage') return new Mage(x, y, word);
  if (SPECIALS[type]) return new SPECIALS[type](x, y, word);
  if (NATIVES[type]) return new NATIVES[type](x, y, word);
  return new Creature(type, x, y, word);
}

/**
 * The word (or single letter) an enemy of this type carries on this floor. Its table line gives the chance
 * of a whole word and the shortest and longest; the longest it may use grows by one every three floors.
 */
export function wordFor(room, type, words) {
  if (SPECIALS[type]?.makeWord) return SPECIALS[type].makeWord(room, words);
  const d = BESTIARY[type], [chance, min0, max] = d.words || [0, 1, 1];
  const shift = room.wordShift || 0; // floor modifiers: Words of Power (+1), Whispered Names (-1)
  const min = Math.max(1, min0 + Math.min(0, shift));
  const top = Math.max(min, Math.min(max + shift, min0 + 1 + shift + Math.floor((room.floor - (d.floors?.[0] || 1)) / 3)));
  if (min <= 1 && (top <= 1 || Math.random() >= chance)) return pick(room.pool);
  const lo = Math.max(2, min);
  const ok = words.filter(w => w.length >= lo && w.length <= top);
  return ok.length ? pick(ok) : Array.from({ length: lo }, () => pick(room.pool)).join('');
}

/** How many rare enemies a floor gets: often one, deeper down sometimes two or three. */
function specialCount(floor) {
  let n = Math.random() < Math.min(0.35 + floor * 0.04, 0.8) ? 1 : 0;
  if (floor >= 5 && Math.random() < 0.35) n++;
  if (floor >= 12 && Math.random() < 0.35) n++;
  return n;
}

/** New enemies for the floor the party just arrived on: never in the start room, not in the boss's room either. */
export function spawnEnemies(room, words) {
  const floor = room.floor, dg = room.dungeon;
  const count = Math.min(3 + floor * 2, DEPTH.maxEnemies);
  const all = dg.rooms;
  const rooms = all.length > 2 ? all.slice(1, -1) : all.slice(1);
  const spot = (n, snap = false) => {
    const r = rooms[n % rooms.length];
    for (let tries = 0; tries < 10; tries++) {
      let x = rnd(r.x + 1, r.x + r.w - 1), y = rnd(r.y + 1, r.y + r.h - 1);
      if (snap) { x = Math.floor(x) + 0.5; y = Math.floor(y) + 0.5; } // a Mimic sits on a tile, like a real chest
      if (!dg.blocked(x, y, 0.32) && !dg.stairsAt(x, y)) return { x, y };
    }
    return freeTileIn(dg, r);
  };

  // the rare ones first (and anything forced for testing), then the biome's natives, then the everyday crowd
  const biome = biomeFor(floor), favor = biome?.favor || {};
  const plan = [...listEnv('FORCE_ENEMY')];
  const specials = eligible('special', floor);
  for (let k = specialCount(floor); k > 0 && specials.length; k--) plan.push(pickWeighted(specials, favor));
  const natives = biome ? nativesOf(biome.id) : [];
  for (let k = Math.round(count * 0.3); k > 0 && natives.length; k--) plan.push(pickWeighted(natives));
  const normals = eligible('normal', floor);
  while (plan.length < count) plan.push(pickWeighted(normals, favor));

  plan.forEach((type, n) => {
    const at = spot(n, type === 'mimic');
    const e = makeEnemy(type, at.x, at.y, wordFor(room, type, words));
    room.enemies.push(e);
    if (e instanceof Gremlin) { // gremlins come in pairs that share a name
      const twin = new Gremlin(at.x + 0.7, at.y, e.lock.word);
      if (dg.blocked(twin.x, twin.y, 0.32)) twin.x = at.x - 0.7;
      if (dg.blocked(twin.x, twin.y, 0.32)) { twin.x = at.x; twin.y = at.y + 0.7; }
      e.partner = twin; twin.partner = e;
      room.enemies.push(twin);
    }
  });
}

/**
 * Which boss guards this floor. Each boss first appears on its debut floor (Bellwraith 1, Gravekeeper 3,
 * Hydra 6, Hourglass Golem 9, Echo Queen 12, Silent King 15); on other floors it is any boss met by then,
 * with the newer ones a little more likely.
 */
export function bossFor(floor) {
  const forced = listEnv('FORCE_BOSS').find(t => BOSSES[t]);
  if (forced) return forced;
  if (isBiomeBossFloor(floor)) return biomeFor(floor).boss; // the last floor of a biome: its own boss
  const types = Object.keys(BOSSES).filter(t => BESTIARY[t].debut <= floor);
  const debut = types.find(t => BESTIARY[t].debut === floor);
  if (debut) return debut;
  const weights = types.map((t, i) => i + 1);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < types.length; i++) { r -= weights[i]; if (r <= 0) return types[i]; }
  return types[types.length - 1];
}

/** The boss guards the stairs room. Its name has 2 words on floor 1, up to 4 deeper down. */
export function spawnBoss(room, words) {
  const dg = room.dungeon, r = dg.rooms[dg.rooms.length - 1], floor = room.floor;
  const type = bossFor(floor);
  const phases = Math.min(1 + Math.ceil(floor / 2), 4);
  // the Hourglass Golem's names are the longest; the others follow the Bellwraith's rule
  const minLen = type === 'hourglass' ? 5 : 3, maxLen = type === 'hourglass' ? 8 : Math.min(3 + floor, 6);
  let choices = words.filter(w => w.length >= minLen && w.length <= maxLen);
  if (choices.length < phases) choices = words.filter(w => w.length >= 2);
  const names = [];
  while (names.length < phases) {
    const left = choices.filter(w => !names.includes(w));
    names.push(left.length ? pick(left) : Array.from({ length: minLen }, () => pick(room.pool)).join(''));
  }
  names.sort((a, b) => a.length - b.length); // short name first, longest last
  const own = BOSSES[type].makeNames?.(room, phases); // the Archivist's names are riddle answers
  let x = r.cx, y = r.cy - 1.5;
  if (dg.blocked(x, y, 0.45)) { x = r.cx; y = r.cy; }
  if (dg.blocked(x, y, 0.45)) ({ x, y } = freeTileIn(dg, r));
  room.enemies.push(new BOSSES[type](x, y, own || names));
}

/** Some free tile in a room (biomes may have flooded, frozen or overgrown most of it). */
export function freeTileIn(dg, r) {
  const spots = [];
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) if (!dg.blocked(i + 0.5, j + 0.5, 0.32) && !dg.stairsAt(i + 0.5, j + 0.5)) spots.push({ x: i + 0.5, y: j + 0.5 });
  return spots.length ? pick(spots) : { x: r.cx, y: r.cy };
}

/** One extra everyday enemy of this floor's kind (the guardians of a challenge altar). */
export function makeGuard(room, x, y, words) {
  const biome = biomeFor(room.floor), normals = eligible('normal', room.floor);
  const natives = biome ? nativesOf(biome.id) : [];
  const type = natives.length && Math.random() < 0.4 ? pick(natives) : pickWeighted(normals, biome?.favor || {});
  return makeEnemy(type, x, y, wordFor(room, type, words));
}

/** An enemy back from a save, or null for things that are made again on their own (the Echo Queen's echoes). */
export function enemyFromSave(s) {
  if (!s || !BESTIARY[s.type] || s.type === 'echoimage') return null;
  if (BOSSES[s.type]) {
    const b = new BOSSES[s.type](s.x, s.y, s.words);
    b.restore(s);
    return b;
  }
  const e = makeEnemy(s.type, s.x, s.y, s.lock.word);
  e.lock = WordLock.fromSave(s.lock);
  if (s.loot) e.loot = s.loot | 0; // a Pickpocket keeps what it stole
  return e;
}
