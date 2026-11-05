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

  /** The co-op room with this code, or the duel room when mode is 'duel' (same codes, separate rooms). */
  roomFor(rawCode, mode) {
    const code = String(rawCode || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'lobby';
    const duel = mode === 'duel', key = (duel ? 'duel:' : '') + code;
    if (!this.rooms.has(key)) {
      const onEmpty = () => this.rooms.delete(key);
      this.rooms.set(key, duel ? new DuelRoom(code, onEmpty) : new Room(code, onEmpty, this.store));
    }
    return this.rooms.get(key);
  }

  /** Save every running lobby (used when the server shuts down). */
  saveAll() { for (const room of this.rooms.values()) { room.save(); room.stop(); } }

  onConnection(ws) {
    let room = null, player = null;
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'join' && !player) {
        room = this.roomFor(m.room, m.mode);
        const max = room.maxPlayers || MAX_PLAYERS;
        if (room.players.size >= max) { ws.send(JSON.stringify({ t: 'full', max })); room = null; return ws.close(); }
        player = room.addPlayer(ws, String(m.name || ''));
        return;
      }
      if (!player) return;
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
