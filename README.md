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
| Show / hide hitboxes | B (on by default in duels; also in Settings) |
| Music on / off | M (volume in Settings) |
| Menu: settings (speed, letter pause, sound, music), save and leave to the start menu, leave the duel arena | Esc |

### Touch (phones and tablets)

Hold the device sideways. The game goes full screen when you enter the dungeon (where the browser allows it).

| Action | Touch |
| --- | --- |
| Move | Put a finger anywhere on the **left half** and drag. The joystick appears where you touched, and you walk toward your finger (any angle, full speed) |
| Tap Morse | Anywhere on the **right half**: short tap = dot, long press = dash (same timing as Numpad 5; the phone buzzes lightly when a press becomes a dash) |
| Cast | Swipe on the right half; the spell flies in the swipe direction, snapped to the 8 numpad directions |
| Menu and settings | The ⚙ button, bottom right: back to the surface from the duel arena, save and quit, and "Vibrate on touch Morse" turns the buzz off |
| Pick up | A quick **tap on the left half** (without dragging) picks up the items you are standing on |
| Items | **Tap your own caster** (always in the middle of the screen) to open the ring menu around it. Segments: Pack, Wield, Gear (equipment), Potions, Scrolls and Stats (the character sheet, with your level on its badge). A number shows how many you have; greyed-out segments have nothing to act on. Tap a segment, then tap an item in the menu. Tap anywhere else to close the ring |

You can walk and tap Morse at the same time, also while an item menu is open (menus sit on the right edge, so the joystick stays free). Dragging from your caster walks, so the middle of the screen is never dead. There is no clear button on touch: a wrong letter is dropped automatically, and a misspelled spell still removes the letters before the mistake.

The menus are the same Angband-style ones as on the keyboard: every row is a button, ‹ goes back and ✕ closes. Pick an item in Pack to read, quaff, wear, drop, destroy or inspect it; pick one in Gear to take it off. With a mouse, clicking your caster opens the ring too.

## Rules

- Hit an enemy with a spell that spells its name. A misspelled spell only removes the letters before your first mistake: casting RAD at RAT leaves `_ _ T`, so you finish it with a T.
- Letters already removed show as `_`, and the next needed letter is yellow.
- Enemies throw red letter spells. A spell whose first letter matches cancels it in mid-air and keeps flying with its remaining letters. You can also dodge.
- Aiming is forgiving: a spell picks the best matching target within about 70 degrees of the direction you chose and flies a path to it, curving around walls and corners (up to about 26 tiles of path).
- Clear the floor, including its boss, then step on the glowing stairs down. Floor 1 uses only the easiest letters (E T A N I M); each floor adds more letters and longer words.
- When you go down you come back next to a teammate after 10 seconds, at half HP. If the whole party is down, everyone wakes up at half HP by the stairs up of the same floor, and the floor's enemies come back.

## The surface and persistent floors

A new game starts on **the surface**, a small village above the dungeon with your house, a shop, the duel arena and the stairs down to floor 1.

- **Floors are persistent**, like in Angband. Every floor keeps its layout, its chests (opened or not) and every item lying on the ground when you leave it, also after the game is saved and loaded.
- **Only the enemies come back.** Every time the party arrives on a floor it gets new enemies, as tough as that floor's depth (more of them, more letters, harder hits).
- **Stairs up and down.** Each floor has pale stairs up in the corner of the room you arrive in, and the stairs down in the Bellwraith's room. Stairs up always work. The stairs down open once every enemy, the Bellwraith too, is gone; after that they stay open on every later visit and that floor's Bellwraith does not come back. You use stairs by stepping onto them, so arriving next to stairs never sends you straight back.
- The whole party is always on the same floor: when one caster takes the stairs (or a travel scroll goes off), everyone goes.
- The floor line (top right) shows your floor, and on the surface the deepest floor the party has reached.

### Gold, the shop and your house

- **Gold**: every caster starts with 100. Whoever finishes an enemy gets a little gold (more deeper down, x1.5 for mages, x10 for the Bellwraith), and whoever opens a chest gets some too. It shows in the party panel and on the character sheet.
- **The shop** (Dot & Dash Goods, the blue roof): walk up to its door to open it. Tabs: *Potions & scrolls*, *Weapons*, *Armour* (Bronze and Iron gear) and *Sell*. The shop buys anything from your pack for a third of its price. Things it does not stock itself (better gear, mythic items) stay on its shelf, marked "sold by a caster", so they can be bought back.
- **Your house** (the red roof): every caster has their own, with room for 24 items. Tabs: *Your house* (take things out) and *Your pack* (leave things there). It is kept in the save with the rest of your caster.
- **The Duel Arena** (the open stone ring with moon banners): walk through its gate to duel a caster from your party, see *Duel room*.
- Keys in both: a letter picks an item, then **y** (or Enter) buys, sells, takes or stores it. **Tab**, **← →** or **1-4** switch tabs. **Esc** leaves. On touch screens tap the tabs and items; walking away closes the screen.

| Item | Price | What it does |
| --- | --- | --- |
| Potion of Healing / Speed / Warding | 25 / 40 / 40 | As below |
| Scroll of Teleportation / Slow Time / Resurrection | 40 / 50 / 200 | As below |
| Scroll of Recall | 125 | After 5 seconds the party is pulled up to the surface. Read on the surface, it takes the party down to the deepest floor reached |
| Scroll of Descent to Floor 10 / 20 / 30 / 40 / 50 | 400 / 1000 / 2000 / 3500 / 5000 | After 5 seconds the party goes straight to that floor |
| Bronze / Iron weapons and armour | 40 / 120 (mail 60 / 180) | Plain common gear; a shop shield blocks one random common letter |

A travel scroll that would do nothing (Recall on the surface before anyone has been down, or a descent to the floor you are on) is not used up. Chests can also hold a Scroll of Recall now and then.

## Levels, HP and damage

- You have **HP** instead of hearts: 20 at level 1, +6 per level, plus gear. HP is **not** refilled when you go down the stairs.
- Natural regeneration is tiny: 1 HP every 10 seconds, and only after nothing has hit you for 10 seconds. Potions of Healing restore 30% of your max HP.
- **XP** goes only to the caster whose spell finishes a word. A word is worth the sum of its letters (E T A N I M = 1, S O U R D K = 2, G W H L F = 3, the rest = 4) times the enemy type: slime ×1, skeleton mage ×1.5, Bellwraith ×5 (per name), chest ×0.5.
- Level L to L+1 needs `10 × L^1.5` XP (10, 28, 52, 80 ...). Max level 30. A level up adds the new max HP to your current HP, but does not heal you fully.
- Each enemy letter that hits you deals damage: slime 4, mage 6, Bellwraith 8 on floor 1, +25% per floor, ±25% random. **Armor** lets `100 / (100 + Armor)` of it through (25 armor blocks 20%, 100 blocks 50%).
- Stats grow on their own: max HP +6 per level, speed +1% per level, Luck +1 every 5 levels. Press **C** for the character sheet.
- Killing still works only by spelling. Weapons add no damage: each one has a special effect instead.

## The Bellwraith (boss)

Every floor has a boss, the Bellwraith, guarding the stairs room. The stairs only open once it is gone.

- **Its name is written only in Morse.** Above it you see dots and dashes, not letters. Read them (the H cheat sheet helps) and cast the letters. Letters you already spelled turn back into letters.
- **Bell shield.** While its shield is up, every spell bounces off. The wraith rings one letter on its bell in Morse, again and again: the bell and its eyes flash, and you hear a low bell tone at your own Morse speed. Cast that letter at it to shatter the shield.
- **Combo.** Letters after the shield letter carry on into its name. If the bell rings M and the name is EAT, casting `MEAT` shatters the shield and kills that name in one spell.
- **Stunned.** With its shield broken it stops attacking for a few seconds (9 on floor 1, shorter deeper down). Then the shield comes back with a new letter.
- **Several names.** It has 2 names on floor 1, up to 4 deeper down (pips on the boss bar). Finishing a name makes it shriek, summon two slimes and attack faster, adding letter rings to its letter fans.
- Beating it drops three items. A Circlet of Insight shows the bell letter and the next letter as plain text.

## Duel room (2 players)

The **Duel Arena** stands on the surface, to the right of the village square. Walk through its gate and you are in your party's duel room; when a second caster from the same room walks in, the duel starts. The arena holds two casters: a third is told it is busy and stays outside. **Esc → Back to the surface** puts you in front of the gate again (if the party went down meanwhile, you join them on their floor).

Your co-op caster is saved as you walk in and comes back exactly as it was: levels and gear do not count in the arena, and nothing that happens there changes them.

- You face each other from the two ends of a long, narrow platform floating in the night sky, inlaid with silver crescent moons and gold stars.
- **Any letter goes**, A to Z. Spells fly at 4 tiles per second, slow enough to read what is coming. Aimed at the other caster they only **bend a little** (at most about 11°, and not at all in the last 5 tiles), so they do not track you: step aside and they miss.
- A spell whose first letter matches an incoming spell steers firmly to meet it, so blocks are easy to land.
- **Blocking works like against enemies**: when two spells meet, matching first letters cancel each other, letter by letter. Cast `T` at an incoming `TEA` and only `EA` keeps coming; cast `TEA` and both spells vanish. Whatever is left of a spell after a block flies on.
- **Words are what hurt.** Damage = the letters' Morse difficulty (E T A N I M = 1, S O U R D K = 2, G W H L F = 3, the rest = 4) × half the length: `E` = 1, `TEA` = 5, `MOON` = 12, `GHOST` = 28, `SHADOW` = 39. So countering just the start of a long word takes most of its sting away (`SHADOW` blocked down to `DOW` does 11). Both casters have 50 HP; dungeon levels and gear do not count, and nothing regenerates.
- **Rounds**: a 3 second countdown (you cannot move or cast), then fight. First to win 3 rounds wins the duel, then a new duel starts by itself. While you wait for an opponent you can walk around and practise casting.
- Items commands do nothing in a duel, and duels are never saved (your co-op progress stays saved outside). All duel numbers are in `DUEL` in `server/config.js`.

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
| `C` | Character sheet: level, XP, HP, armor, speed, luck and what your gear adds |
| `w` / `d` | Wear/wield and drop. Use them from inside the inventory, because W and D also walk |
| `/` | Switch between inventory and equipment |
| Esc | Back / close |

Numpad Morse and aiming keep working while a menu is open. The game does not pause.

**Potions** (quaff): Healing (30% of max HP), Speed (+50% run speed for 30s), Warding (absorbs the next 2 hits).
**Scrolls** (read): Slow Time (enemy spells at 40% speed for 15s), Teleportation (random room), Resurrection (revives downed teammates at half HP, heals the party 20%), Recall and Descent (see *The surface and persistent floors*).

Every piece of gear needs a minimum level. You can carry gear above your level; it shows "(needs Lv N)" in red until you get there. There are eight slots: weapon, shield, ring, amulet, head, body, cloak, feet.

- **Common** gear is a material plus a base item: Bronze (level 1), Iron (5), Steel (10), Orichalcum (18), Adamant (25). Helms, mail, cloaks, boots and shields give Armor, rings give Luck, amulets give HP.
- **Weapons** each have one small effect that grows with the material: Wand (spells fly 10-50% faster), Spear (spells reach 10-50% farther), Rod (a correct hit staggers the enemy 0.3-1.2 s), Staff (finishing a word heals 1-5 HP), Blade (5-20% chance a correct letter also removes the next one).
- **Shields** block letters completely: a common shield blocks 1-3 random letters of the floor it was found on.
- **Enchanted** gear has one bonus: of Swiftness, Vitality, Protection or Fortune.
- **Mythic** gear (gold names) comes from Greek, Norse, Chinese and Japanese myth, has a special effect, and drops at most once per saved game. Three are cursed (red names).

| Slot | Mythic item | Level | Effect |
| --- | --- | --- | --- |
| Weapon | Caduceus of Hermes | 3 | Spells fly 40% faster, +5% speed |
| Weapon | Trident of Poseidon | 8 | Every third spell splits into three |
| Weapon | Bow of Artemis | 12 | Spells home in any direction and reach 50% farther |
| Weapon | Ruyi Jingu Bang | 14 | Spells hold 12 letters |
| Weapon | Gungnir | 16 | Leftover letters fly on to the next enemy |
| Weapon | Mjolnir | 18 | 1 s stagger; finishing a word stuns enemies within 3 tiles |
| Weapon | Thunderbolt of Zeus | 22 | Finishing a word chains lightning to the nearest enemy |
| Weapon | Kusanagi-no-Tsurugi | 24 | Spells cut every enemy letter they fly through |
| Weapon | Laevateinn | 26 | Correct hits burn away one more letter 2 s later |
| Weapon | Green Dragon Crescent Blade | 28 | One spell hits up to three enemies |
| Shield | Shield of Ajax | 8 | Armor 20, blocks 2 random letters |
| Shield | Tengu Feather Fan | 12 | Blocks T M O (dash-only letters) |
| Shield | Svalinn | 14 | Blocks every vowel |
| Shield | Shell of Xuanwu | 16 | Blocks E I S H (dot-only letters) |
| Shield | Shield of Achilles | 24 | Blocks E T A N I M |
| Head | Eye of Odin | 1 | Shows the Morse of the next letter (can drop again) |
| Head | Golden Headband of Sun Wukong | 6 | Spells 50% faster and 10 letters. Cursed: +20% damage taken, stuck until the next floor |
| Head | Kabuto of Hachiman | 10 | Armor 15, +10% HP |
| Head | Helm of Hades | 15 | Enemies more than 5 tiles away can't see you |
| Body | Golden Fleece | 8 | Heals 1 HP every 3 s after 5 s without a hit |
| Body | Nemean Lion Pelt | 12 | Armor 40, the first hit every 10 s does nothing |
| Body | Robe of the Jade Emperor | 16 | Armor 20, +40 HP |
| Body | Aegis of Athena | 22 | Armor 50, enemies that hit you turn to stone for 2 s |
| Cloak | Mantle of the Norns (X) | 4 | Auto-casts an X counter-spell at incoming X letters |
| Cloak | Hagoromo | 10 | 30% less damage while standing still |
| Cloak | Freyja's Falcon Cloak | 18 | +15% speed, 30% less damage while moving |
| Feet | Talaria | 10 | +30% speed, spells 20% faster |
| Feet | Horseshoes of Sleipnir | 20 | +40% speed, enemy letters crossing your trail slow down |
| Ring | Andvaranaut | 5 | +5 Luck. Cursed: -15% HP |
| Ring | Draupnir | 10 | Every ninth kill drops a Potion of Healing |
| Ring | Yata no Kagami | 12 | 25% of enemy letters glance off |
| Ring | Ring of Gyges | 16 | Invisible for 2 s after a hit |
| Amulet | Necklace of Harmonia | 5 | 10-letter spells, +3 Luck. Cursed: -20% HP |
| Amulet | Magatama of Yasakani | 8 | +15 HP, finishing a word heals 2 HP |
| Amulet | Brisingamen | 12 | +25 HP, regenerates 2% of max HP every 5 s |
| Amulet | Pearl of the Dragon King | 24 | Once per floor, a killing hit leaves you at 1 HP |

A plain Circlet of Insight (level 1) also drops: it shows the Morse code of the next letter above enemies and chests.

Items stay with you between floors and when you go down. For testing, `FORCE_ITEM=m_svalinn npm start` makes every chest drop that item (ids are in `server/items.js`; common gear takes a material index, e.g. `FORCE_ITEM=c_helm:2` for a Steel Helm).

## Music

Original ambient music, generated live in the browser with Web Audio (no audio files). It is calm while you explore
and grows more urgent as you get into trouble: your HP dropping below three quarters and hostile spells flying close
to you, and most of all both at once. As danger rises the pad brightens, the tempo lifts, an arpeggio, a bass pulse
and then drums fade in, and the chords turn darker. Low HP adds a heartbeat. It swells quickly and settles slowly.
The surface town has a warm, quiet variant that never gets intense; duels start tense with a beat already going;
a living Bellwraith adds a little extra edge. When you die it muffles until you respawn. The music dips while your
own Morse tone sounds so every dot and dash stays clear. M mutes it; Settings has a volume slider.

## Saving lobbies

A lobby (room) is saved on the server as `saves/<room>.json`: the current floor and the deepest one reached, the layout, chests and floor items of every floor visited, the enemies left on the current floor, the shop's shelf, and every player's level, XP, HP, gold, gear, pack, house and position. Saves from before persistent floors still load: their current floor becomes the first saved floor (with stairs up added), and every caster gets a starting purse of 100 gold. Saves from before levelling still load: those casters start at level 1, their old items turn into the closest new ones, and gear above their level goes into the pack.

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
| `DuelRoom.js` | **The duel room** (each co-op room has one; `GameServer.enterArena` / `leaveArena` move a caster in and out on the same connection): `Arena` (the platform, a `Dungeon` subclass), `DuelPlayer`, `DuelSpell`, rounds and spell-vs-spell blocking |
| `Room.js` | **One co-op game**: keeps every visited floor (`levels`), moves the party between floors (`enterFloor`: stairs, recall and descent scrolls, wipes), runs `tick()` (update entities, collisions, stairs, wipe), casting and targeting, broadcasts state |
| `Town.js` | `Town`: the surface village (a fixed `Dungeon` subclass with the house, the shop, the duel arena, their doors and the stairs down) |
| `Shop.js` | `Shop`: the shop's stock, buying, selling and its shelf of resold items, and every caster's house storage |
| `entities.js` | **OOP game objects**: `Entity` → `Actor` → `Player`, `Enemy` (→ `Slime`, `Mage`, `Boss`); `Chest`; `Spell` (→ `PlayerSpell`, `EnemySpell`); `FloorItem`; and `WordLock` (the spell-the-word rule shared by enemies and chests) |
| `Dungeon.js` | Tile codes, map generation with stairs down and up, plus collision, line of sight and path finding |
| `ItemCommands.js` | Angband item commands: quaff, read, wield, take off, drop, destroy, pick up |
| `SaveStore.js` | Reads and writes lobby saves in `saves/`; entities, `Dungeon` and `Room` each have `toSave()` / `fromSave()` |
| `items.js` | Item definitions (materials, bases, enchantments, mythic items, scrolls), prices, names, loot rolls, pack stacking |
| `progression.js` | XP values, the level curve, enemy damage and armor, gold for kills and chests |
| `words.js` | Letters and words per floor |
| `config.js` | All tunable numbers (speeds, ranges, timings) |
| `util.js` | Random helpers |

### Client (`public/js/`, browser)

| File | What it holds |
| --- | --- |
| `main.js` | Entry point: `new Game().start()` |
| `game.js` | **`Game` class**: creates every part, handles server messages, runs the main loop (`update` then `render`) |
| `entities.js` | **OOP drawable objects** mirroring the server: `Entity` → `Character` → `Player`, `Enemy` (→ `Slime`, `Mage`, `Boss`); `Chest`; `Spell`; `FloorItem`. Each slides between server snapshots (drawn 100 ms in the past, so uneven Wi-Fi stays smooth) and draws itself |
| `world.js` | `World`: the tile map and all entities, kept in sync with server snapshots |
| `renderer.js` | `Renderer`: camera, tiles and walls, depth sorting, lighting, drawing helpers; `renderDuel` for the duel arena |
| `network.js` | `Network`: WebSocket connection, `on(type, fn)` subscriptions, `move` / `cast` / `command`, ping (shown next to the room name) |
| `prediction.js` | `Prediction`: your own caster walks at once on your device (same speed and walls as the server) and is nudged back if the server disagrees, so players on other machines feel no input delay |
| `input.js` | `Input`: keyboard handling for Morse, aiming, walking, menus |
| `morse.js` | `MorseKey`: dot/dash timing and decoding |
| `hud.js` | `Hud`: party panel, Morse box, banner, cheat sheet, message line |
| `inventory.js` | `InventoryMenu`: the Angband-style inventory, equipment and character sheet popup |
| `store.js` | `StoreMenu`: the shop and house screens on the surface (opened by walking up to their doors) |
| `bell.js` | `BellChant`: plays the Bellwraith's bell letter in Morse (flashes and tone) |
| `effects.js` | `EventEffects`: turns server events into sounds and particles |
| `particles.js` | `Particles`: sparks and floating text |
| `audio.js` | `AudioManager`: Morse tone and sound effects |
| `music.js` | `Music`: generative ambient music that follows `Game.danger()` |
| `settings.js` | `Settings`: saved preferences and the Esc panel |
| `lobby.js` | `Lobby`: name and room screen |
| `constants.js` | Screen size, key maps, small helpers |
| `art/` | Procedural pixel art: `canvas.js` (helpers), `font.js`, `sprites.js`, `tiles.js` (dungeon, stairs up and down, and the village's grass, paths, trees, buildings and duel arena), `arena.js` (the duel platform and starry sky) |
