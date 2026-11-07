// Networking: accepts WebSocket connections, puts each player in a Room and routes their messages.
import { WebSocketServer } from 'ws';
import { MAX_PLAYERS } from './config.js';
import { Room } from './Room.js';
import { DuelRoom } from './DuelRoom.js';

export class GameServer {
  constructor(httpServer, store) {
    this.store = store;     // SaveStore for lobbies
    this.rooms = new Map(); // room code -> Room (duel rooms are kept under "duel:" + code)
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  /**
   * The co-op room with this code, or its duel arena when duel is true. The arena is a separate room
   * with the same code: casters from one party walk into it through the arena gate on the surface.
   */
  roomFor(rawCode, duel = false) {
    const code = String(rawCode || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'lobby';
    const key = (duel ? 'duel:' : '') + code;
    if (!this.rooms.has(key)) {
      const onEmpty = () => this.rooms.delete(key);
      this.rooms.set(key, duel ? new DuelRoom(code, onEmpty) : new Room(code, onEmpty, this.store));
    }
    return this.rooms.get(key);
  }

  /** Save every running lobby (used when the server shuts down). */
  saveAll() { for (const room of this.rooms.values()) { room.save(); room.stop(); } }

  /**
   * A caster walks through the arena gate on the surface. They leave the co-op game (which saves their
   * progress, like any player leaving) and join their party's duel room. Two can duel; a third is told to wait.
   */
  enterArena(ws, room, player) {
    if (room instanceof DuelRoom || player.floor !== 0 || player.dead || !room.levelOf(player).dungeon.doorNear(player.x, player.y, 'arena')) return null;
    const arena = this.roomFor(room.code, true);
    if (arena.players.size >= arena.maxPlayers) {
      const names = [...arena.players.values()].map(p => p.name).join(' and ');
      player.tell(`The arena is busy: ${names} are duelling. Come back when one of them leaves.`);
      return null;
    }
    room.removePlayer(player);
    room.say(`${player.name} went into the duel arena`, 2);
    return { room: arena, player: arena.addPlayer(ws, player.name) };
  }
  /** Esc menu in a duel: back to the co-op game, in front of the arena gate (if the party is still on the surface). */
  leaveArena(ws, room, player) {
    if (!(room instanceof DuelRoom)) return null;
    const home = this.roomFor(room.code);
    if (home.players.size >= MAX_PLAYERS) { player.tell(`Your party is full (${MAX_PLAYERS} casters) right now.`); return null; }
    room.removePlayer(player);
    return { room: home, player: home.addPlayer(ws, player.name, { fromArena: true }) };
  }

  onConnection(ws) {
    let room = null, player = null;
    ws._socket?.setNoDelay(true); // send small updates at once instead of batching them (Nagle's algorithm)
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', c: m.c })); // the client measures its round trip
      if (m.t === 'join' && !player) {
        room = this.roomFor(m.room); // you always start in the co-op game; the arena is reached from the surface
        const max = room.maxPlayers || MAX_PLAYERS;
        if (room.players.size >= max) { ws.send(JSON.stringify({ t: 'full', max })); room = null; return ws.close(); }
        player = room.addPlayer(ws, String(m.name || ''));
        return;
      }
      if (!player) return;
      if (m.t === 'goto') { // walk into the arena, or leave it for the surface
        const moved = m.to === 'arena' ? this.enterArena(ws, room, player) : m.to === 'surface' ? this.leaveArena(ws, room, player) : null;
        if (moved) ({ room, player } = moved);
        return;
      }
      switch (m.t) {
        case 'move': player.setMoveInput(m.x, m.y); break;
        case 'cast': room.cast(player, m.w, +m.dx, +m.dy); break;
        case 'cmd': room.command(player, m); break;
        case 'save': room.saveNow(player); break;
      }
    });
    ws.on('close', () => { if (room && player) room.removePlayer(player); });
  }
}
