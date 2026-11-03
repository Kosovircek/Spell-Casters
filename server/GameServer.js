// Networking: accepts WebSocket connections, puts each player in a Room and routes their messages.
import { WebSocketServer } from 'ws';
import { MAX_PLAYERS } from './config.js';
import { Room } from './Room.js';

export class GameServer {
  constructor(httpServer, store) {
    this.store = store;     // SaveStore for lobbies
    this.rooms = new Map(); // room code -> Room
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  roomFor(rawCode) {
    const code = String(rawCode || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'lobby';
    if (!this.rooms.has(code)) this.rooms.set(code, new Room(code, (room) => this.rooms.delete(room.code), this.store));
    return this.rooms.get(code);
  }

  /** Save every running lobby (used when the server shuts down). */
  saveAll() { for (const room of this.rooms.values()) { room.save(); room.stop(); } }

  onConnection(ws) {
    let room = null, player = null;
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'join' && !player) {
        room = this.roomFor(m.room);
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
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
