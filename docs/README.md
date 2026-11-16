# Spell Casters developer docs

These pages explain how the code works, for anyone (you, a friend, or a future Claude session) who wants to
change it. The main [README](../README.md) is the player's guide: controls, rules, enemies, items.

| Page | What it covers |
| --- | --- |
| [Architecture](architecture.md) | The big picture with diagrams: server and client, rooms and floors, the 20 Hz tick, the life of a spell, how a caster moves between floors |
| [Code map](code-map.md) | Every file in `server/` and `public/js/`, what it holds and what it talks to |
| [Network protocol](network-protocol.md) | The WebSocket messages in both directions, the `map` and `state` payloads, the event list, prediction, interpolation and back-pressure |
| [Game systems](game-systems.md) | How the rules are implemented: Morse input, word locks, blocking and soft aim, damage and levels, floors, biomes, effect spells, the duel |
| [Save format](save-format.md) | What goes into `saves/<room>.json`, versions and migrations |
| [How to extend it](how-to.md) | Recipes: add an enemy, a rare enemy, a boss, an effect spell, an item, a biome, a tile, a network message; testing switches |

## Ground rules of the codebase

- **Plain JavaScript ES modules, no build step.** The server runs `node server/index.js`; the browser loads
  `public/js/main.js` as a module straight from disk. The only dependency is [`ws`](https://github.com/websockets/ws).
- **The server is authoritative.** It simulates every room 20 times a second (`TICK_MS = 50`) and sends snapshots.
  The client sends input (walk direction, the spell it typed and a direction) and draws what the server says.
  The one exception is your own caster's walking, which the client predicts (see [prediction](network-protocol.md#prediction-your-own-caster)).
- **One class per concept, one file per concern.** Server entities and client entities mirror each other
  (`server/entities.js` and `public/js/entities.js` have the same class tree), and each client class draws itself.
- **All art and sound are procedural.** Sprites are palette strings in `public/js/art/`, music and sound effects
  are generated with Web Audio. There are no image or audio files to load.
- **Tunable numbers live in tables**: `server/config.js` for the core numbers, `server/bestiary.js` for enemies,
  `server/items.js` for items, `server/magic/spellbook.js` for effect spells, `server/biomes/biomes.js` for biomes.
