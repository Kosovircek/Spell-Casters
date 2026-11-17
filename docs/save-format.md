# Save format

Lobbies are saved by `server/SaveStore.js` as `saves/<room>.json` (or `$SAVE_DIR/<room>.json`). Writes go to
`<room>.json.tmp` first and are then renamed, so a crash never leaves half a file.

## When it saves

- every 30 s (`Room.autosave`)
- when a caster changes floor (`Room.movePlayer`) or leaves (`Room.removePlayer`)
- Ctrl+S or "Leave game" (`save` message)
- on SIGINT / SIGTERM (`GameServer.saveAll`)

Duels are never saved; walking into the arena counts as leaving the co-op game, which saves you.

## Shape (version 4)

`Room.toSave()`:

```jsonc
{
  "version": 4,
  "room": "friday",
  "savedAt": 1763330000000,
  "maxDepth": 7,                       // deepest floor anyone reached (only used to give older saves a recall depth)
  "foundMythics": ["gungnir"],         // mythic kinds already dropped (each drops once per game)
  "foundBooks": ["fire", "wall"],      // spell ids whose books dropped (new drops prefer others)
  "bestiary": { "slime": 41, "mage": 12 },  // kills per enemy type (zoo pens open from this)
  "zooFed": 3,
  "zooNew": [],                        // pens that opened while nobody was on the surface
  "shop": [ /* items on the resold shelf */ ],
  "levels": {
    "0": { "dungeon": null, "cleared": true, "chests": [], "items": [ /* dropped in town */ ] },
    "4": {
      "dungeon": {
        "tiles": "000000011111...",    // one base-36 char per tile (TILE codes)
        "rooms": [{ "x": 3, "y": 4, "w": 7, "h": 6, "cx": 6.5, "cy": 7 }],
        "stairs": { "x": 30, "y": 22 },
        "up": { "x": 4, "y": 5 },
        "env": { "vents": [[12, 9, 1.5]] }   // biome features, see server/biomes/terrain.js
      },
      "cleared": false,
      "chests": [{ "x": 8.5, "y": 6.5, "open": false, "lock": { "word": "MOON", "progress": 1 } }],
      "items": [{ "x": 10.2, "y": 7.1, "item": { "kind": "pot_heal", "n": 1 }, "hidden": true }],
      "enemies": [{ "type": "mage", "x": 14, "y": 9, "lock": { "word": "TEA", "progress": 0 } }]
    }
  },
  "players": {
    "ann": {                           // keyed by lowercase name: rejoining with the same name restores it
      "name": "Ann", "floor": 4, "x": 12.4, "y": 8.9,
      "hp": 52, "dead": false, "level": 9, "xp": 120,
      "kills": 210, "blocks": 77, "ward": 0, "gold": 640, "practiceBest": 14,
      "deepest": 7, "recallDepth": 5,  // this caster's deepest floor and Word of Recall depth (missing: party maxDepth)
      "pack":  [ /* items */ ],
      "home":  [ /* items in their house */ ],
      "equip": { "weapon": { "kind": "c_staff", "mat": 1, "n": 1 }, "shield": null, "ring": null, "neck": null,
                 "head": null, "body": null, "cloak": null, "feet": null },
      "magic": { "known": ["fire", "light"], "mana": 40 }
    }
  }
}
```

Notes:

- **`enemies` only for floors someone was standing on** when the save was made (`Level.levelSave(true)`), so a
  fight carries on after a server restart. They are used once, when the lobby loads; a floor that is put away
  and visited again gets new enemies. Boss and rare-enemy subclasses add fields (`words`, `phase`...).
- **Items**: whatever `items.makeItem` made, minus nothing. On load `restoreItem` gives each a fresh `id`,
  maps renamed kinds (`OLD_KINDS`) and drops kinds that no longer exist.
- **Not saved**: flying spells, effect-spell zones and summons, timed potions, statuses, cooldowns, floor
  modifiers (rolled again on arrival), the town layout (always rebuilt by `Town.js`).
- **Restoring a player** (`Player.restore`): level is clamped to 1..30, gear above the player's level goes back
  to the pack, HP is clamped to max HP (full if they were down), a position inside a wall is moved to the floor's start.

## Versions and migrations (`Room.restore`)

| Version | Introduced by | Shape | Migration on load |
| --- | --- | --- | --- |
| none | first saves | One floor, hearts instead of HP, no levels | Players without `level` start at level 1 with full HP |
| 2 | levelling (PR #7) | One shared floor: `floor`, `dungeon`, `chests`, `items`, `enemies`, `stairsOpen` at the top level | They become `levels[floor]` (`stairsOpen` → `cleared`, enemies kept) |
| 3 | persistent floors and the town (PR #14) | `levels` for every visited floor, but still one shared `floor`; that floor's `enemies` at the top level | Top-level `enemies` move to `levels[floor].enemies` |
| 4 | independent floors (PR #20) | Every player has their own `floor`; live floors keep their enemies inside `levels` | Players without `floor` get the old shared `floor` |

When you change the format, bump `version` in `Room.toSave`, keep reading the old shape in `Room.restore` (or
in the entity's `fromSave` / `restore`), and add a row here.

## The lobby screen

`GET /api/saves` (`SaveStore.list`) reads every save and returns `{ room, deepest, players, savedAt }` for the
start screen's list.
