# Spell Casters

A co-op browser dungeon crawler (1 to 4 players) with a top-down 3/4 pixel-art look (you see the top and front of walls, no rotation). Every enemy has a letter or a word above it. You defeat it by casting those letters at it, and you cast by tapping Morse code.

## Run it

```
npm install
npm start
```

Open http://localhost:3000, pick a name and a room name, and share the page URL (`?room=...`) with friends so they join the same dungeon. Port can be changed with `PORT=8080 npm start`.

## Controls

| Action | Keys |
| --- | --- |
| Move | W A S D or arrow keys (up is up on screen; same speed in all 8 directions) |
| Tap Morse | Numpad 5 (Space also works). Short press = dot, long press = dash |
| Instant dash | Numpad 0 types a dash right away, no holding (mix freely with Numpad 5) |
| Build a spell | Pause after each letter; finished letters stack up above your wizard (up to 8) |
| Cast | Numpad 7 8 9 4 6 1 2 3 sends the whole spell in that direction |
| Remove last letter | Backspace |
| Clear the spell | Numpad . |
| Morse cheat sheet | H |
| Settings (speed, letter pause, sound) | Esc |

### Touch (phones and tablets)

Hold the device sideways. The game goes full screen when you enter the dungeon (where the browser allows it).

| Action | Touch |
| --- | --- |
| Move | Put a finger anywhere on the **left half** and drag. The joystick appears where you touched, and you walk toward your finger (any angle, full speed) |
| Tap Morse | Anywhere on the **right half**: short tap = dot, long press = dash (same timing as Numpad 5; the phone buzzes lightly when a press becomes a dash) |
| Cast | Swipe on the right half; the spell flies in the swipe direction, snapped to the 8 numpad directions |
| Settings | The ⚙ button, bottom right. "Vibrate on touch Morse" turns the buzz off |
| Items and spells | **Tap your own caster** (always in the middle of the screen) to open the ring menu around it. Segments: Pick up, Pack, Wield, Gear (equipment), Potions, Scrolls and Spells. A number shows how many you have; greyed-out segments have nothing to act on. Tap a segment, then tap an item in the menu. Tap anywhere else to close the ring |

You can walk and tap Morse at the same time, also while an item menu is open (menus sit on the right edge, so the joystick stays free). Dragging from your caster walks, so the middle of the screen is never dead. There is no clear button on touch: a wrong letter is dropped automatically, and a misspelled spell still removes the letters before the mistake.

The menus are the same Angband-style ones as on the keyboard: every row is a button, ‹ goes back and ✕ closes. Pick an item in Pack to read, quaff, wear, drop, destroy or inspect it; pick one in Gear to take it off. Spells is a spellbook with the Morse for this floor's letters and a switch for the on-screen cheat sheet. With a mouse, clicking your caster opens the ring too.

## Rules

- Hit an enemy with a spell that spells its name. A misspelled spell only removes the letters before your first mistake: casting RAD at RAT leaves `_ _ T`, so you finish it with a T.
- Letters already removed show as `_`, and the next needed letter is yellow.
- Enemies throw red letter spells. A spell whose first letter matches cancels it in mid-air and keeps flying with its remaining letters. You can also dodge.
- Aiming is forgiving: a spell picks the best matching target within about 70 degrees of the direction you chose and flies a path to it, curving around walls and corners (up to about 26 tiles of path).
- Clear the floor, including its boss, then step on the glowing stairs. Floor 1 uses only the easiest letters (E T A N I M); each floor adds more letters and longer words.
- When you go down you come back next to a teammate after 10 seconds. If the whole party is down the floor restarts.

## The Bellwraith (boss)

Every floor has a boss, the Bellwraith, guarding the stairs room. The stairs only open once it is gone.

- **Its name is written only in Morse.** Above it you see dots and dashes, not letters. Read them (the H cheat sheet helps) and cast the letters. Letters you already spelled turn back into letters.
- **Bell shield.** While its shield is up, every spell bounces off. The wraith rings one letter on its bell in Morse, again and again: the bell and its eyes flash, and you hear a low bell tone at your own Morse speed. Cast that letter at it to shatter the shield.
- **Combo.** Letters after the shield letter carry on into its name. If the bell rings M and the name is EAT, casting `MEAT` shatters the shield and kills that name in one spell.
- **Stunned.** With its shield broken it stops attacking for a few seconds (9 on floor 1, shorter deeper down). Then the shield comes back with a new letter.
- **Several names.** It has 2 names on floor 1, up to 4 deeper down (pips on the boss bar). Finishing a name makes it shriek, summon two slimes and attack faster, adding letter rings to its letter fans.
- Beating it drops three items. A Circlet of Insight shows the bell letter and the next letter as plain text.

## Chests, items and equipment (Angband-style)

Every floor has 2 to 4 chests with a gold word above them; one is always in the starting room. Spell the word at a chest to open it. Its loot spills onto the floor, and anyone can walk over it and pick it up with `g`, so teammates can share by dropping items.

| Key | Command |
| --- | --- |
| `i` | Inventory (slots a to l). Press an item's letter for its menu |
| `e` | Equipment (one item per slot) |
| `g` | Pick up items you are standing on |
| `q` | Quaff a potion |
| `r` | Read a scroll |
| `t` | Take off equipment |
| `I` | Inspect an item |
| `k` | Destroy an item |
| `w` / `d` | Wear/wield and drop. Use them from inside the inventory, because W and D also walk |
| `/` | Switch between inventory and equipment |
| Esc | Back / close |

Numpad Morse and aiming keep working while a menu is open. The game does not pause.

**Potions** (quaff): Healing (+2 hearts), Speed (+50% run speed for 30s), Warding (absorbs the next 2 hits).
**Scrolls** (read): Slow Time (enemy spells at 40% speed for 15s), Teleportation (random room), Resurrection (revives downed teammates, heals the party 1 heart).

| Slot | Item | Effect |
| --- | --- | --- |
| Staff | Staff of Forking | Every third spell splits into three |
| Staff | Staff of Haste | Spells fly 40% faster |
| Ring | Ring of Reflection | 25% chance an enemy spell glances off |
| Amulet | Amulet of Regeneration | +1 heart every 20s |
| Head | Circlet of Insight | Shows the Morse code of the next letter above enemies and chests |
| Body | Robe of Vitality | +2 max hearts |
| Cloak | Cloak of X-Warding | Auto-casts an X counter-spell at incoming X letters |
| Feet | Boots of Swiftness | Walk 25% faster |

Items stay with you between floors and when you go down. For testing, `FORCE_ITEM=cloak_ward npm start` makes every chest drop that item (ids are in `server/items.js`).

## Saving lobbies

A lobby (room) is saved on the server as `saves/<room>.json`: the floor, the map, the enemies left, the chests and items on the floor, and every player's hearts, gear, pack and position.

- It saves every 30 seconds, on every new floor, whenever someone leaves, when anyone presses **Ctrl+S**, and when you stop the server with Ctrl+C.
- To carry on, open the game, click the saved lobby on the start screen (or type its room name) and enter **the same name as before**. Your gear comes back; a new name starts with an empty pack.
- Flying spells and the timers of Speed potions and Slow Time are not kept.
- Delete a file in `saves/` to start that lobby over. `SAVE_DIR=/some/folder npm start` keeps saves somewhere else (useful on a host with a persistent disk).

## Timing

Default speed is 7 WPM: a dot is about 170 ms and anything held longer than about 340 ms is a dash. A letter finishes after 3 dot lengths of silence (about 510 ms). Both are adjustable in settings and stored in the browser.

## Code map

Both halves use ES modules (`import`/`export`) and classes. The server is authoritative: it runs the
simulation 20 times a second and sends snapshots; the client draws them and sends input.

### Server (`server/`, Node)

| File | What it holds |
| --- | --- |
| `index.js` | Entry point: starts the web server and the game server |
| `StaticServer.js` | Serves the `public/` folder |
| `GameServer.js` | **Networking**: WebSocket connections, rooms, routing messages (`join`, `move`, `cast`, `cmd`) |
| `Room.js` | **One co-op game**: loads floors, runs `tick()` (update entities, collisions, stairs, wipe), casting and targeting, broadcasts state |
| `entities.js` | **OOP game objects**: `Entity` → `Actor` → `Player`, `Enemy` (→ `Slime`, `Mage`, `Boss`); `Chest`; `Spell` (→ `PlayerSpell`, `EnemySpell`); `FloorItem`; and `WordLock` (the spell-the-word rule shared by enemies and chests) |
| `Dungeon.js` | Map generation plus collision, line of sight and path finding |
| `ItemCommands.js` | Angband item commands: quaff, read, wield, take off, drop, destroy, pick up |
| `SaveStore.js` | Reads and writes lobby saves in `saves/`; entities, `Dungeon` and `Room` each have `toSave()` / `fromSave()` |
| `items.js` | Item definitions, names, pack stacking |
| `words.js` | Letters and words per floor |
| `config.js` | All tunable numbers (speeds, ranges, timings) |
| `util.js` | Random helpers |

### Client (`public/js/`, browser)

| File | What it holds |
| --- | --- |
| `main.js` | Entry point: `new Game().start()` |
| `game.js` | **`Game` class**: creates every part, handles server messages, runs the main loop (`update` then `render`) |
| `entities.js` | **OOP drawable objects** mirroring the server: `Entity` → `Character` → `Player`, `Enemy` (→ `Slime`, `Mage`, `Boss`); `Chest`; `Spell`; `FloorItem`. Each smooths its position and draws itself |
| `world.js` | `World`: the tile map and all entities, kept in sync with server snapshots |
| `renderer.js` | `Renderer`: camera, tiles and walls, depth sorting, lighting, drawing helpers |
| `network.js` | `Network`: WebSocket connection, `on(type, fn)` subscriptions, `move` / `cast` / `command` |
| `input.js` | `Input`: keyboard handling for Morse, aiming, walking, menus |
| `morse.js` | `MorseKey`: dot/dash timing and decoding |
| `hud.js` | `Hud`: party panel, Morse box, banner, cheat sheet, message line |
| `inventory.js` | `InventoryMenu`: the Angband-style inventory and equipment popup |
| `bell.js` | `BellChant`: plays the Bellwraith's bell letter in Morse (flashes and tone) |
| `effects.js` | `EventEffects`: turns server events into sounds and particles |
| `particles.js` | `Particles`: sparks and floating text |
| `audio.js` | `AudioManager`: Morse tone and sound effects |
| `settings.js` | `Settings`: saved preferences and the Esc panel |
| `lobby.js` | `Lobby`: name and room screen |
| `constants.js` | Screen size, key maps, small helpers |
| `art/` | Procedural pixel art: `canvas.js` (helpers), `font.js`, `sprites.js`, `tiles.js` |
