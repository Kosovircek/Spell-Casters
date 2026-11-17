# Architecture

Spell Casters is one Node process that does two jobs: it serves the browser client as static files, and it runs
every game room over a single WebSocket endpoint (`/ws`). Browsers connect, join a room by name, and from then on
send input and receive a snapshot of their floor 20 times a second.

## The whole system

```mermaid
flowchart LR
  subgraph Browser["Browser (public/)"]
    direction TB
    Lobby["Lobby<br/>name + room"] --> Game
    Input["Input / TouchInput<br/>keys, numpad, swipes"] --> Game
    Morse["MorseKey<br/>dots, dashes, letters"] --> Game
    Game["Game<br/>wires everything,<br/>main loop"]
    Game --> Net["Network<br/>WebSocket"]
    Net --> Game
    Game --> World["World<br/>map + entities"]
    Game --> Pred["Prediction<br/>my own caster"]
    World --> Renderer["Renderer<br/>canvas"]
    Game --> Hud["Hud, menus<br/>HTML overlay"]
    Game --> FX["EventEffects<br/>sound + particles"]
  end

  subgraph Node["Node server (server/)"]
    direction TB
    Static["StaticServer<br/>public/ + /api/saves"]
    GS["GameServer<br/>/ws connections"]
    GS --> Room["Room<br/>one co-op party"]
    GS --> Duel["DuelRoom<br/>2-player arena"]
    Room --> Level["Level<br/>one live floor<br/>(one per occupied floor)"]
    Level --> Ents["Entities<br/>players, enemies,<br/>spells, chests, items"]
    Level --> Magic["Magic<br/>effect spells"]
    Level --> Env["Environment<br/>biome rules"]
    Duel --> Magic
    Room --> Store["SaveStore<br/>saves/room.json"]
  end

  Browser -- "HTTP GET /, /js/*.js, /api/saves" --> Static
  Net <-- "WebSocket /ws (JSON)" --> GS
```

## Server object model

A **Room** is a party (up to 4 casters who joined with the same room name). Casters explore floors on their own,
so the Room keeps one running **Level** per floor that has at least one caster on it (`room.live`), and keeps the
persistent part of every other visited floor in `room.levels`. Entities get their Level as `room`: everything an
enemy, spell or item needs (map, enemies, spells, players on this floor) is reached through it.

The **DuelRoom** is a separate, Level-like room with the same tick/broadcast shape, reached from the arena gate on
the surface. Each co-op room has its own arena under the key `duel:<code>`.

```mermaid
classDiagram
  direction LR
  class GameServer {
    rooms: Map~code, Room|DuelRoom~
    roomFor(code, duel)
    enterArena() leaveArena()
    onConnection(ws)
  }
  class Room {
    players: Map~id, Player~
    live: Map~floor, Level~
    levels: floor -> saved floor
    savedPlayers, maxDepth, bestiary
    shop: Shop
    tick() movePlayer() save()
  }
  class Level {
    floor, dungeon: Dungeon|Town
    players, enemies, spells
    chests, items, critters
    magic: Magic
    env: Environment
    tick() cast() broadcastState()
  }
  class DuelRoom {
    dungeon: Arena
    players: DuelPlayer x2
    phase, round, wins
    magic: Magic
  }
  class Dungeon {
    tiles: Uint8Array
    rooms, stairs, up
    los() findPath() blocked()
  }
  class Magic {
    zones, minions, marks
    walls, portals
    cast() orb() zone() tick()
  }
  class Environment {
    biome rules
    hazards, weather
    shrine, altar
  }
  GameServer --> Room
  GameServer --> DuelRoom
  Room --> Level : live floors
  Room --> Shop
  Level --> Dungeon
  Level --> Magic
  Level --> Environment
  DuelRoom --> Magic
  Dungeon <|-- Town
  Dungeon <|-- Arena
```

### Entity class tree (server and client mirror each other)

```mermaid
classDiagram
  direction TB
  Entity <|-- Actor
  Actor <|-- Player
  Player <|-- DuelPlayer
  Actor <|-- Enemy
  Enemy <|-- Slime
  Enemy <|-- Mage
  Enemy <|-- Creature
  Creature <|-- RareEnemies : monsters.js
  Creature <|-- Natives : biomes/natives.js
  Enemy <|-- Boss
  Boss <|-- Bellwraith
  Boss <|-- NewerBosses : bosses.js
  Boss <|-- BiomeBoss : biomes/biomeBosses.js
  Actor <|-- Critter
  Critter <|-- ZooAnimal
  Critter <|-- Dummy
  Critter <|-- Fountain
  Critter <|-- Prop : biomes/props.js
  Actor <|-- Minion : magic/Minion.js
  Entity <|-- Chest
  Entity <|-- Spell
  Spell <|-- PlayerSpell
  PlayerSpell <|-- DuelSpell
  Spell <|-- EnemySpell
  Spell <|-- RuneOrb : magic/RuneOrb.js
  Entity <|-- FloorItem
  class WordLock {
    word, progress
    apply(letters)
  }
  Enemy *-- WordLock
  Chest *-- WordLock
  Critter *-- WordLock
```

`WordLock` is the "spell this word" rule shared by enemies, chests, critters and props. On the client,
`public/js/entities.js` has `Entity → Character → Player / Enemy (Slime, Mage, Creature, Boss) / Critter / Minion`,
plus `Chest`, `Spell` and `FloorItem`; each one holds the newest server snapshot in `data` and draws itself.

## One server tick (every 50 ms)

`Room.tick()` runs `Level.tick(now)` for every live floor. A tick is strictly ordered:

```mermaid
flowchart TD
  A["players update<br/>walk, regen, statuses, respawn"] --> B["env.tick<br/>vents, machinery, weather"]
  B --> C["enemies update<br/>think, walk, throw letters<br/>(shared shot budget)"]
  C --> D["fireCloaks<br/>Mantle of the Norns"]
  D --> E["spells update<br/>fly, home, slide along walls"]
  E --> F["resolveCollisions<br/>block, hit enemy, open chest,<br/>feed critter, letter hits caster"]
  F --> G["magic.tick<br/>zones, summons, marks, walls"]
  G --> H["chests, critters update"]
  H --> I["drop removed spells and enemies"]
  I --> J["checkProgress<br/>open stairs, take stairs,<br/>travel scrolls, wipe"]
  J --> K["broadcastState<br/>one JSON per tick, events appended per player"]
```

Effects that clients should see or hear (a block, a hit, gold, a level up) are pushed with `level.emit({ t, ... })`
during the tick and sent as the `ev` list of that tick's `state` message.

## Client frame

The client runs on `requestAnimationFrame`. Network messages are handled as they arrive; drawing happens once per frame.

```mermaid
sequenceDiagram
  participant WS as WebSocket
  participant G as Game
  participant W as World
  participant P as Prediction
  participant R as Renderer
  WS->>G: state (20/s)
  G->>W: applyState: create/update/remove entities, store sample (server ts)
  G->>P: onServer: compare server pos with my predicted pos
  G->>G: effects.play(each event), remember state for HUD
  loop every frame
    G->>P: update(dt): walk my caster locally
    G->>W: update(dt): others drawn 100 ms in the past, interpolated
    G->>G: renderHud (once per frame, newest state only)
    G->>R: render(world, particles, morse...)
  end
```

## The life of a letter spell

```mermaid
sequenceDiagram
  actor U as Player
  participant M as MorseKey (client)
  participant I as Input (client)
  participant S as GameServer
  participant L as Level
  participant Sp as PlayerSpell
  U->>M: hold Numpad 5 (short = dot, long = dash)
  M->>M: silence of 3 dot lengths ends a letter, appended to spell
  M-->>S: {t:'type', s, b, k} on every change (others see it above you)
  U->>I: Numpad direction
  I->>M: take() the finished letters
  I->>S: {t:'cast', w:'RAT', dx, dy}
  S->>L: room.cast → level.cast(player, word, dx, dy)
  L->>L: check A-Z and length, chooseTarget in a 70° cone with a path around walls
  L->>Sp: new PlayerSpell(owner, letters, dir, target)
  loop each tick
    Sp->>Sp: steer toward target (path finding), fly
    L->>L: resolveCollisions
  end
  alt meets an enemy letter with the same first letter
    L-->>U: event block, spell loses its first letter
  else hits an enemy
    L->>L: WordLock.apply(letters): hit / wrong / done
    L-->>U: events hit / wrong / kill, xp, gold
  end
```

Effect spells take the same road: the typed word starts with the rune `*` (Morse `..--`), and `Level.cast` hands
it to `Magic.cast`, which checks the grimoire, level, cooldown and mana, then runs the spell's function from
`server/magic/casts/`. Many of those throw a `RuneOrb`, a spell that carries the word and runs `land()` where it stops.

## A caster moving between floors

Stairs and travel scrolls move only the caster who uses them. Floors nobody stands on are put away.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Saved: floor first generated<br/>by Dungeon and terrain.decorate
  Saved --> Live: someone arrives<br/>Room.levelFor builds a Level<br/>with fresh enemies and modifiers
  Live --> Live: more casters arrive or leave
  Live --> Saved: last caster leaves<br/>Room.putAway keeps map,<br/>chests, items, cleared flag
  Live --> Live: everyone here down<br/>Level.restart brings new enemies,<br/>casters wake at the stairs up
```

```mermaid
sequenceDiagram
  participant C as Caster
  participant L1 as Level (floor 3)
  participant R as Room
  participant L2 as Level (floor 4)
  C->>L1: steps onto open stairs down
  L1->>R: checkProgress → movePlayer(caster, 4, 'down')
  R->>L1: leave(caster), putAway if empty
  R->>L2: levelFor(4) (build from saved part or generate)
  R->>L2: enter(caster, arrival('down'))
  L2-->>C: map message (tiles, pool, biome...)
  R->>R: save()
  L2-->>C: state every tick from now on
```

## Connection lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant GS as GameServer
  participant R as Room
  B->>GS: WebSocket /ws
  B->>GS: {t:'join', name, room}
  GS-->>B: {t:'session', token}
  GS->>R: roomFor(room) (loads saves/room.json if any)
  alt room full
    GS-->>B: {t:'full', max} and close
  else
    R-->>B: {t:'welcome', id, room}
    R-->>B: {t:'map', ...}
    R-->>B: {t:'grimoire', ...}
    loop 20 per second
      R-->>B: {t:'state', ...}
    end
  end
  B->>GS: {t:'goto', to:'arena'} at the arena gate
  GS-->>B: welcome (duel:true) + map (duel:true), same socket
  B->>GS: socket drops (phone in the background)
  Note over GS,R: caster stays, standing still, for the grace period
  B->>GS: new socket, {t:'resume', token}
  GS-->>B: session + welcome (resumed) + map + grimoire
  B->>GS: {t:'leave'} from the Esc menu, or the grace period runs out
  GS->>R: removePlayer → progress kept in savedPlayers, save()
```

## Where to go next

- [Code map](code-map.md) for what each file holds.
- [Network protocol](network-protocol.md) for every message and field.
- [Game systems](game-systems.md) for the rules in code.
