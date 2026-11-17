# Code map

```
spell-casters/
├── package.json          "type": "module", one dependency (ws), npm start = node server/index.js
├── server/               Node: the authoritative simulation, networking and saving
│   ├── magic/            effect spells (the ✦ rune): table, engine, grimoire, books, summons
│   │   └── casts/        what each effect spell does, one object per spell id
│   └── biomes/           the ten biomes: terrain, hazards, natives, biome bosses, curses and blessings
├── public/               the browser client, served as static files (no build step)
│   ├── index.html        the page: canvas, HUD and menu elements, loads js/main.js as a module
│   ├── style.css         HUD, menus, lobby, touch overlay
│   └── js/
│       └── art/          procedural pixel art (palette strings → cached canvases)
├── saves/                lobby saves, one JSON per room (git-ignored; SAVE_DIR overrides)
└── docs/                 these pages
```

Dependency direction: `index.js → GameServer → Room / DuelRoom → Level → entities, Magic, Environment, Dungeon`.
Tables (`config.js`, `bestiary.js`, `items.js`, `words.js`, `magic/spellbook.js`, `biomes/biomes.js`) import
almost nothing and are imported everywhere.

## Server (`server/`)

### Core

| File | Holds | Notes |
| --- | --- | --- |
| `index.js` | Entry point | Builds `SaveStore`, `StaticServer` (with `/api/saves`) and `GameServer`; saves every room on SIGINT/SIGTERM |
| `StaticServer.js` | `createStaticServer(rootDir, api)` | Serves `public/` with `Cache-Control: no-cache`; small JSON endpoints by path |
| `GameServer.js` | `GameServer` | The `/ws` WebSocket server. Parses messages, routes them to the player's room ([protocol](network-protocol.md)). `roomFor(code, duel)` creates rooms on demand; `enterArena` / `leaveArena` move a caster between a Room and its DuelRoom on the same socket. Keeps a session per caster so a dropped socket can `resume` it (`dropped`, `takeOver`, `leave`, `heartbeat`; see [dropped connections](network-protocol.md#dropped-connections)) |
| `Room.js` | `Room` | One co-op party: `players`, `savedPlayers` (by lowercase name), `live` floors (`Level`s), `levels` (saved floors), `maxDepth`, `bestiary`, `foundMythics`, `foundBooks`, the `Shop`. `movePlayer` moves one caster between floors; `toSave` / `restore`; autosave every 30 s |
| `Level.js` | `Level` | One floor being played. Owns the map, enemies, spells, chests, items, critters, `Magic` and `Environment`. `tick()` (see [architecture](architecture.md#one-server-tick-every-50-ms)), `cast()`, `chooseTarget()` (soft aim), `resolveCollisions()`, `afterEnemyHit()`, loot, `checkProgress()` (stairs, travel, wipe), `broadcastState()` |
| `DuelRoom.js` | `Arena` (a `Dungeon`), `DuelPlayer`, `DuelSpell`, `DuelRoom` | The 2-player arena: rounds (`waiting → countdown → fight → roundover → over`), word-length damage, per-letter hitboxes, gentle bending spells |
| `Dungeon.js` | `TILE`, `Dungeon`, `encodeTiles` | Tile codes, room-and-corridor generation, stairs, collision (`solid`, `blocked`, `airSolid`), line of sight, `findPath` (grid BFS with a length cap), `toMessage()` (the `map` message) |
| `Town.js` | `Town` (a `Dungeon`) | The fixed surface village: house, shop, arena gate, zoo pens, practice yard, fountain, lamps, stairs down. `doorNear()` |
| `entities.js` | `Entity`, `Actor`, `Player`, `Enemy` (+ `Slime`, `Mage`, `Creature`, `Boss`, `Bellwraith`), `Chest`, `Spell`, `PlayerSpell`, `EnemySpell`, `FloorItem`, `WordLock` | Every object's update, `snapshot()` (what clients get) and `toSave()`. `Player.sendState` does per-socket back-pressure. Enemy hooks: `think`, `wake`, `hitBy`, `onDefeated`, `onLetterHit`, `onBlocked`, `label`, `moveVector` |
| `config.js` | `PORT`, `TICK_MS`, `PLAYER`, `SPELL`, `HITBOX`, `EFFECTS`, `DEPTH`, `GOLD`, `LEVELS`, `DUEL` | Every core tunable number |
| `SaveStore.js` | `SaveStore` | `saves/<room>.json`, write-to-temp-then-rename; `list()` for the lobby screen ([format](save-format.md)) |
| `util.js` | `rnd`, `pick` | Random helpers |

### Enemies and the world

| File | Holds | Notes |
| --- | --- | --- |
| `bestiary.js` | `BESTIARY`, `def()`, `PACE` | One line per enemy kind: floors, weight, speed, distance, fire rate, shot pattern, damage, XP and gold multipliers, word lengths, movement style. Bosses have `debut` |
| `monsters.js` | `SPECIALS` (20 rare enemies) | `Mimic`, `TwinSlime`, `MorseMoth`, `Pickpocket`, ... each a `Creature` subclass overriding hooks |
| `bosses.js` | `BOSS_CLASSES` | `Gravekeeper`, `Hydra`, `HourglassGolem`, `EchoQueen` (+ `EchoImage`), `SilentKing` |
| `spawner.js` | `spawnEnemies`, `spawnBoss`, `makeEnemy`, `wordFor`, `enemyFromSave`, `makeGuard` | Picks kinds and words for a floor; `FORCE_ENEMY`, `FORCE_BOSS` |
| `Critters.js` | `Critter`, `ZooAnimal`, `Dummy`, `Fountain`, `townCritters`, `penAnimals` | Friendly surface targets: same targeting and collisions as enemies, never hurt anyone |
| `words.js` | `letterPool(floor)`, `wordsFor(pool)` | Letter tiers `ETANIM`, `SOURDK`, `GWHLF`, `BCJPQVXYZ` and the word list |
| `progression.js` | `xpFor`, `xpToNext`, `baseHp`, `letterDamage`, `armorFactor`, `goldFor`, `chestGold` | Level curve and damage maths |

### Items and the surface

| File | Holds | Notes |
| --- | --- | --- |
| `items.js` | `SLOTS`, `MATERIALS`, `BASES`, `ENCHANTS`, `MYTHIC`, `CONSUMABLES`, `makeItem`, `info`, `toClient`, `restoreItem`, `rollItem`, `bookFor`, prices | Everything about items. An item is a plain object `{ id, kind, n, mat?, ench?, letters?, ... }` |
| `ItemCommands.js` | `ItemCommands` | `cmd` messages for items: `quaff`, `read`, `wield`, `takeoff`, `drop`, `destroy`, `pickup`, plus `solve` / `unstudy` for spellbook puzzles |
| `Shop.js` | `Shop` | `cmd` messages `enter`, `buy`, `sell`, `stash`, `take`; the stock and the resold shelf; sends `store` |

### `server/magic/` (effect spells)

| File | Holds | Notes |
| --- | --- | --- |
| `spellbook.js` | `SPELLS`, `SPELL_BY_ID`, `SPELL_BY_WORD`, `SCHOOLS`, `RUNE` (`'*'`), `RUNE_MORSE` (`..--`), `catalog()` | One line per effect spell: id, word, school, level, mana, cooldown, book name, dungeon and duel text |
| `Magic.js` | `Magic` | The engine of one room (a `Level` or the `DuelRoom`): `cast()` checks known / level / cooldown / mana; keeps zones, minions, marks, rune walls and portals; `hurt()` takes letters in the dungeon and HP in a duel; `snapshot()` is `state.magic` |
| `casts/*.js` | `ELEMENTS`, `SUMMONS`, `CONTROL`, `UTILITY` merged into `CASTS` | Per spell id: `cast(m, c)`, optional `land(m, c, x, y, foe)` for orbs, optional `zone(m, z, now)` for zones |
| `RuneOrb.js` | `RuneOrb` (a `Spell`) | The flying orb most effect spells use; carries the word so a duel opponent can block it |
| `Minion.js` | `Minion` and every summon class | Summons fight their owner's foes; some carry a word in duels |
| `Grimoire.js` | `Grimoire`, `MANA` | Per player: known spells, mana, cooldowns, buffs; `message()` is the `grimoire` message |
| `books.js` | `makePuzzle`, `solves`, riddles | Spellbook puzzles: `morse`, `anagram`, `riddle`, `shift`, `mirror` |
| `dumbledore.js` | `isDumbledore`, `makeDumbledore`, `everyItem` | The debug character (join as "Dumbledore") |

### `server/biomes/`

| File | Holds | Notes |
| --- | --- | --- |
| `biomes.js` | `BIOMES`, `biomeFor(floor)`, `isBiomeBossFloor`, `RUN` (3) | Ten biomes, three floors each, then repeating. `favor`, `natives`, `boss`, `power` (effect spell strength), `intro`; `FORCE_BIOME` |
| `terrain.js` | `decorate(dungeon, biome)` | Paints a generated floor (water, lava, ice, vines, rune doors, machinery, void) while keeping every part reachable; fills `dungeon.env` |
| `Environment.js` | `Environment` | A biome's rules on a live floor: hazards on beats, weather, crumbling bridges, wells, portals, terrain reacting to spells, shrines and challenge altars. `mapExtra()` goes in `map`, `snapshot()` is `state.env` |
| `natives.js` | `NATIVES` | One native enemy per biome |
| `biomeBosses.js` | `BIOME_BOSSES` | The ten biome bosses |
| `props.js` | `Prop`, `Brazier`, `RiddleDoor`, `Shrine`, `Altar` | Things you cast at that never fight back (they are `Critter`s) |
| `modifiers.js` | `MODS`, `rollMods`, `modValue` | Curses and blessings; they only set numbers `Level` reads through getters (`wordShift`, `foePace`, `hurtMult`...) |
| `riddles.js` | `RIDDLES` | Riddles for the library's doors and the Archivist |

## Client (`public/js/`)

### Core

| File | Holds | Notes |
| --- | --- | --- |
| `main.js` | entry | `new Game().start()` |
| `game.js` | `Game` | Creates every part, subscribes to server messages (`listen()`), `onState`, `loop → update → render`, `danger()` for the music, door detection on the surface (`checkDoor`), `shareTyping()` |
| `network.js` | `Network` | WebSocket to `/ws`, `on(type, fn)`, typed senders (`move`, `typing`, `cast`, `command`, `save`, `goto`), ping once a second, smoothed `rtt` |
| `world.js` | `World`, `WALKABLE` | The map (tiles decoded from base-36) and every entity by id; `applyState` syncs entities and estimates the server clock; `update` draws others `INTERP_MS = 100` in the past |
| `prediction.js` | `Prediction` | Walks my caster locally with the server's rules (walls, shallow water, ice, confusion) and blends in corrections |
| `entities.js` | `Entity`, `Character`, `Player`, `Enemy`, `Slime`, `Mage`, `Creature`, `Boss`, `Chest`, `Critter`, `Spell`, `Minion`, `FloorItem` | Mirrors the server classes; `sync(data, ts)` stores samples, `update` interpolates, `draw(r, view)` draws |
| `constants.js` | `AIM_KEYS`, `MOVE_KEYS`, `MORSE_KEYS`, `normalize`, `prettyMorse`, `escapeHtml`, `$` | Small shared helpers |

### Input

| File | Holds | Notes |
| --- | --- | --- |
| `morse.js` | `MorseKey`, `MORSE`, `FROM_MORSE`, `RUNE`, `RUNE_MORSE` | Press/release timing → dots and dashes → letters; `spell` holds finished letters, `buf` the current letter; `take()` returns the spell to cast |
| `input.js` | `Input` | Keyboard: Morse keys (Numpad 5, Space, Numpad 0 instant dash), numpad aiming (`castToward`), WASD/arrows (`sendMove`, only on change), menu keys |
| `touch.js` | `TouchInput`, `snap8` | Floating joystick on the left, Morse key and swipe-to-cast on the right |
| `ring.js` | `RingMenu` | Tap your caster for a ring of menus (touch-first) |

### Screens and HUD

| File | Holds | Notes |
| --- | --- | --- |
| `hud.js` | `Hud`, `spellHtml` | Party panel, Morse box, spell bar, banner, cheat sheets, boss and duel bars, message line, ping |
| `inventory.js` | `InventoryMenu` | Angband-style pack, equipment and character sheet; sends item `cmd`s |
| `store.js` | `StoreMenu` | Shop and house screens; opens on a `store` message |
| `grimoire.js` | `Grimoire` | Effect spell list and spellbook puzzle screen; sends `solve` / `unstudy` |
| `lobby.js` | `Lobby` | Name and room screen, reads `/api/saves` |
| `settings.js` | `Settings` | WPM, letter gap, volumes, hitbox mode; saved in `localStorage['sc-settings']` |

### Drawing, sound and effects

| File | Holds | Notes |
| --- | --- | --- |
| `renderer.js` | `Renderer` | Camera, tiles and walls (3/4 view), depth-sorted entities, lighting, `onTop` pass for spell letters, `renderDuel` |
| `magicfx.js` | `drawMagicFloor`, `drawMagicAir`, `magicWallDrawables`, `magicLights` | Draws `state.magic` (zones, marks, rune walls, portals) |
| `envfx.js` | `drawEnvFloor`, `envLights`, `drawWeather` | Draws `map.envFixed` and `state.env` (vents, machinery, wells, weather) |
| `effects.js` | `EventEffects` | One `case` per server event type: sound, particles, floating text, screen shake |
| `particles.js` | `Particles` | Sparks and floating text |
| `audio.js` | `AudioManager` | Morse tone and synthesized sound effects |
| `music.js` | `Music` | Generative ambient music driven by `Game.danger()` |
| `bell.js` | `BellChant` | Plays the Bellwraith's shield letter in Morse |

### `public/js/art/`

| File | Holds |
| --- | --- |
| `canvas.js` | `TS` (16 px tiles), `WALL_H`, `makeCanvas`, `sprite(rows, pal)`, `shade`, `hash` |
| `font.js` | 5x7 `FONT`, `glyph`, `drawWord`, `tinyGlyph` (3x5, for ward letters) |
| `sprites.js` | Wizards, slime, mage, chests, items, the Bellwraith and its bell |
| `monsters.js` | `MONSTERS` (every other enemy and boss, keyed by server `type`), `monsterSprite` |
| `biomeMonsters.js` | `BIOME_MONSTERS` (natives and biome bosses), merged into `MONSTERS` |
| `summons.js` | `summonSprite`, `FLYING` |
| `critters.js` | Zoo animals, dummy, fence and lamp tiles |
| `tiles.js` | `TILES`: dungeon and village tiles |
| `biomes.js` | Each biome's floor and wall tiles, the special ground tiles, `LIGHTING` per biome |
| `arena.js` | The duel platform and starry sky |
