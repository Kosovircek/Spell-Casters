# How to extend it

Recipes for the common changes. Each lists every place that has to change, server first, then client.
After any change: `npm start`, open two browser windows on the same room, and try it. There is no build step
and no test suite; the `FORCE_*` switches below put what you are working on in front of you quickly.

## Testing switches

| Switch | Effect |
| --- | --- |
| `PORT=8080` | Listen on another port |
| `SAVE_DIR=/tmp/sc-saves` | Keep test saves away from your real ones |
| `FORCE_ENEMY=phantom,mimic` | Those kinds appear on every floor (as well as the usual crowd) |
| `FORCE_BOSS=hydra` | That boss guards every floor |
| `FORCE_BIOME=forge` | Every floor is that biome |
| `FORCE_MOD=runetide,golden` | Those curses or blessings on every floor |
| `FORCE_ITEM=m_svalinn` or `FORCE_ITEM=c_helm:2` | Every chest drops that item (`:2` = material index) |
| Join as **Dumbledore** | Max level, every effect spell known, endless mana, cannot die (outside duels), a house full of one of every item (`server/magic/dumbledore.js`) |
| Press **B** | Toggle hitboxes |

Example: `FORCE_BIOME=library FORCE_ENEMY=scribe SAVE_DIR=/tmp/sc npm start`

## Add an everyday enemy

1. **`server/bestiary.js`**: add a line with `kind: 'normal'`, `floors`, `weight`, `speed`, `dist`, `fire`, `shot`,
   `pace`, `dmg`, `xp`, `gold`, `words`, `move` (the header comment explains each). The type key is its id everywhere.
2. **`public/js/art/monsters.js`**: add `MONSTERS.<type>` with `rows` (palette letters, `.` transparent, `K` outline),
   `pal`, and optionally `feet`, `keep`, `pose`, `burst` (death burst colour).

That is all: `spawner.js` picks it by floors and weight (and biome `favor`), `makeEnemy` builds a generic
`Creature`, and the client's `Enemy.create` draws any type it finds in `MONSTERS`. To make a biome like it more,
add it to that biome's `favor` in `server/biomes/biomes.js`.

## Add a rare enemy (with a trick)

1. **`server/bestiary.js`**: a line with `kind: 'special'`.
2. **`server/monsters.js`**: a class `extends Creature` with `constructor(x, y, word) { super('<type>', x, y, word); }`,
   overriding the hooks it needs:
   - `think(room, now)` every tick; `wake(room, now)` when it first sees a caster
   - `hitBy(room, spell)` to change the spelling rule (return `'hit'`, `'wrong'` or `'done'`)
   - `moveVector(...)`, `attack(...)` for movement and shots
   - `onDefeated`, `onLetterHit`, `onBlocked`
   - `label(now)` to send extra fields the client draws (`show`, `tag` + `tagColor`, `rev`, `morse`...)
   - `static makeWord(room, words)` if its word is special; `toSave()` if it has state worth keeping
3. Register it in `SPECIALS` at the bottom of `monsters.js`.
4. Emit events for anything the player should notice (`room.emit({ t: 'mything', x, y })`) and add a `case` in
   **`public/js/effects.js`**.
5. Art in **`public/js/art/monsters.js`**. If `label()` sends a new field, draw it in `drawLabel` / `Creature.draw`
   in **`public/js/entities.js`**.
6. A line in the README's enemy list.

Biome natives work the same way in `server/biomes/natives.js` (`NATIVES`) with `natives: ['<type>']` on the biome.

## Add a boss

1. **`server/bestiary.js`**: `kind: 'boss'`, `debut` (first floor it may guard), `dmg`, `xp`, `gold`.
2. **`server/bosses.js`**: `class X extends Boss` with `get type() { return '<type>'; }`. A boss has several words
   (`words`, one per phase); `Boss.hitBy` moves to the next word when one is finished. Use `guarded` to make it
   untouchable for a while, `label()` for its HUD extras.
3. Register it in `BOSS_CLASSES`. `spawner.bossFor` picks it: it always guards its `debut` floor, and later floors
   choose among the bosses that have debuted, favouring newer ones. Biome bosses go in `BIOME_BOSSES`
   (`server/biomes/biomeBosses.js`) and the biome's `boss` field instead.
4. Art in `public/js/art/monsters.js` (or `biomeMonsters.js`); the boss bar uses `name`, `hint`, `phase`, `phases`.

## Add an effect spell

1. **`server/magic/spellbook.js`**: a line in `SPELLS`:
   `S('<id>', '<WORD>', '<school>', level, mana, cooldownSecs, '<Book name>', 'dungeon text', 'duel text')`.
   Keep the word short (every letter is Morse time) and at most 12 letters.
2. **`server/magic/casts/<school>.js`**: add `<id>: { cast(m, c) {...}, land(m, c, x, y, foe) {...} }`.
   `c = { pl, sp, dx, dy, now, power }`. The building blocks on `m` (`Magic`):
   - `m.orb(c, opts)` throws a `RuneOrb`; its `land()` runs where it stops or hits
   - `m.zone(kind, x, y, r, secs, owner, opts)` leaves a patch; give the kind a `zone(m, z, now)` handler
   - `m.summon(minion)` (classes in `magic/Minion.js`), `m.status(target, name, ms, by)`, `m.hurt(target, letters, hp, by, why)`
   - `m.duel` tells you which room you are in; `m.long` is the dungeon's duration multiplier
3. Optional: a riddle for its book in `RIDDLES` in **`server/magic/books.js`** (keyed by id); a strength per biome in
   `power` in **`server/biomes/biomes.js`**; what it does to terrain in `Environment.onZone` / `onLand`.
4. **Client**: new zone or mark kinds in **`public/js/magicfx.js`**, new summons in **`public/js/art/summons.js`**,
   new events in **`public/js/effects.js`**, new status names in `STATUS_NAMES` in **`public/js/hud.js`**.
   The grimoire, the book item (`bk_<id>`) and book drops pick the spell up automatically.
5. Try it as Dumbledore, in the dungeon and in the duel arena.

## Add an item

- **Potion or scroll**: an entry in `CONSUMABLES` in `server/items.js` (`type`, `weight`, `cost`, `name`, `desc`),
  then its effect in `quaff` or `read` in `server/ItemCommands.js`. Add a sprite case in `itemSprite`
  (`public/js/art/sprites.js`) if the default does not fit. The shop's `STOCK` (`server/Shop.js`) decides whether it is sold.
- **Mythic gear**: an entry in `MYTHIC` (`slot`, `level`, `myth`, `name`, `stats` and/or `fx`, `desc`). An `fx` flag is
  read with `player.has('<flag>')` wherever it acts (`Level.cast`, `Level.afterEnemyHit`, `Player.takeHit`, `Player.update`).
- **Common gear**: a base in `BASES` (numbers per material) or an enchantment in `ENCHANTS`.
- Renamed or removed a kind? Map the old kind in `OLD_KINDS` so saves still load.

## Add a floor modifier

One line in `MODS` in `server/biomes/modifiers.js`, using the existing knobs (`wordShift`, `foePace`, `hurtMult`,
`goldMult`, `xpMult`, `manaMult`, `springs`, `runeTide`, `silent`). A new kind of knob needs a getter on `Level` and
code that reads it. The client lists modifiers from `map.mods` with no changes.

## Add a biome

1. **`server/biomes/biomes.js`**: an entry in `BIOMES` (`id`, `name`, `natives`, `boss`, `favor`, `power`, `intro`).
   The order of the list is the order of the floors.
2. **`server/biomes/terrain.js`**: how `decorate()` paints its floors (use the reachability check for anything that blocks).
3. **`server/biomes/Environment.js`**: its rules per tick, what spells do to its ground, `snapshot()` fields.
4. A native in `natives.js` and a boss in `biomeBosses.js`.
5. **Client**: floor and wall palettes in `T` and a `LIGHTING` entry in `public/js/art/biomes.js`; moving parts in
   `public/js/envfx.js`; art for the native and boss.

## Add a tile

1. **`server/Dungeon.js`**: a code in `TILE` (the map is sent in base 36, so codes up to 35 fit one character).
   Put it in `WALKABLE` if casters and enemies can walk on it, or in `LOW` if only spells pass over it (spells use
   `AIRWAY` = both), and in `GROUND` if things may be placed or spawned on it (`Dungeon.open`).
2. **`public/js/world.js`**: `WALKABLE` or `FLAT`, and the tile list in the comment.
3. **`public/js/prediction.js`** if it changes how your caster walks (it copies the server's rules).
4. Draw it in `public/js/art/tiles.js` or `public/js/art/biomes.js`.

## Add a network message

1. **Client → server**: a helper on `Network` (`public/js/network.js`), a `case` in `GameServer.onConnection`
   (`server/GameServer.js`), validating every field (clamp numbers, check strings with a regex). Menu actions
   usually fit better as a `cmd` with a new `c` handled in `ItemCommands` or `Shop`.
2. **Server → client, one player**: `player.send({ t: 'mymsg', ... })`, and `.on('mymsg', ...)` in `Game.listen` (`public/js/game.js`).
3. **Server → client, every tick**: add a field to `Level.broadcastState` (and `DuelRoom.broadcastState`), read it in
   `World.applyState`. Keep it small (it goes out 20 times a second to everyone) and leave it out when empty.
4. **A one-off effect**: `room.emit({ t, x, y, ... })` and a `case` in `public/js/effects.js`.
5. Add it to [network-protocol.md](network-protocol.md).

## Tune numbers

Most balance lives in tables: `server/config.js` (speeds, ranges, hitboxes, levels, duel), `server/bestiary.js`,
`server/items.js`, `server/magic/spellbook.js`, `MANA` in `server/magic/Grimoire.js`, `server/biomes/biomes.js`.
`HITBOX` is sent to the client with the map, so hitboxes always match. Walking constants that `prediction.js` copies
(`PLAYER.radius`, shallow water, ice grip) must be changed on both sides.
