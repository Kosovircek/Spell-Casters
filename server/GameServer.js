// Networking: accepts WebSocket connections, puts each player in a Room and routes their messages.
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { MAX_PLAYERS, RECONNECT } from './config.js';
import { Room } from './Room.js';
import { DuelRoom } from './DuelRoom.js';

export class GameServer {
  constructor(httpServer, store) {
    this.store = store;     // SaveStore for lobbies
    this.rooms = new Map(); // room code -> Room (duel rooms are kept under "duel:" + code)
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.sessions = new Map(); // token -> { token, ws, room, player, dropTimer }: one per caster in a game
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.beat = setInterval(() => this.heartbeat(), RECONNECT.heartbeatMs);
    this.beat.unref?.();
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
    return { room: arena, player: arena.addPlayer(ws, player.name, [...player.magic.known]) }; // the grimoire comes along
  }
  /** Esc menu in a duel: back to the co-op game, in front of the arena gate (if the party is still on the surface). */
  leaveArena(ws, room, player) {
    if (!(room instanceof DuelRoom)) return null;
    const home = this.roomFor(room.code);
    if (home.players.size >= MAX_PLAYERS) { player.tell(`Your party is full (${MAX_PLAYERS} casters) right now.`); return null; }
    room.removePlayer(player);
    return { room: home, player: home.addPlayer(ws, player.name, { fromArena: true }) };
  }

  // ------------------------------------------------------------------ connections
  /**
   * Each caster has a session: a secret token the browser keeps, and the room and player it plays. When the
   * socket drops (a phone putting the browser in the background, a Wi-Fi hiccup), the caster stays in the game
   * for RECONNECT.graceMs. A new socket that sends { t: 'resume', token } takes it over, with no new join.
   */
  onConnection(ws) {
    let s = null; // this socket's session, once it has joined or resumed
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws._socket?.setNoDelay(true); // send small updates at once instead of batching them (Nagle's algorithm)
    ws.on('message', (raw) => {
      ws.alive = true;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', c: m.c })); // the client measures its round trip
      if (m.t === 'resume' && !s) {
        s = this.resume(ws, String(m.token || ''));
        if (!s) ws.send(JSON.stringify({ t: 'resumeFailed' })); // the client joins afresh instead
        return;
      }
      if (m.t === 'join' && !s) {
        const room = this.roomFor(m.room); // you always start in the co-op game; the arena is reached from the surface
        const name = String(m.name || '');
        const dropped = this.droppedByName(room, name);
        if (dropped) { s = this.takeOver(dropped, ws); return; } // the page was reloaded: carry on as the caster who dropped
        const max = room.maxPlayers || MAX_PLAYERS;
        if (room.players.size >= max) { ws.send(JSON.stringify({ t: 'full', max })); return ws.close(); }
        s = { token: randomBytes(16).toString('hex'), ws, room, player: room.addPlayer(ws, name), dropTimer: null };
        this.sessions.set(s.token, s);
        ws.send(JSON.stringify({ t: 'session', token: s.token }));
        return;
      }
      if (!s || s.ws !== ws) return;
      const { room, player } = s;
      if (m.t === 'goto') { // walk into the arena, or leave it for the surface
        const moved = m.to === 'arena' ? this.enterArena(ws, room, player) : m.to === 'surface' ? this.leaveArena(ws, room, player) : null;
        if (moved) { s.room = moved.room; s.player = moved.player; }
        s.player.setTyping(); // the client starts the new room with an empty spell
        return;
      }
      switch (m.t) {
        case 'move': player.setMoveInput(m.x, m.y); break;
        case 'type': player.setTyping(m.s, m.b, m.k); break;
        case 'cast': player.setTyping(); room.cast(player, m.w, +m.dx, +m.dy); break;
        case 'cmd': room.command(player, m); break;
        case 'save': room.saveNow(player); break;
        case 'leave': this.leave(s); break;
      }
    });
    ws.on('close', () => { if (s && s.ws === ws) this.dropped(s); });
  }

  /** The socket of a session closed without the caster leaving: keep them in the game for a while. */
  dropped(s) {
    s.ws = null;
    const pl = s.player;
    pl.away = true;
    pl.setMoveInput(0, 0);
    pl.setTyping();
    s.room.say(`${pl.name} lost the connection...`, 2);
    clearTimeout(s.dropTimer);
    s.dropTimer = setTimeout(() => this.leave(s), RECONNECT.graceMs);
  }
  /** The caster is gone for good (left on purpose, or did not come back in time): save them and free the slot. */
  leave(s) {
    clearTimeout(s.dropTimer);
    if (!this.sessions.has(s.token)) return;
    this.sessions.delete(s.token);
    s.room.removePlayer(s.player);
    s.ws?.close();
    s.ws = null;
  }
  /** A new socket brings back this session's token. */
  resume(ws, token) {
    const s = this.sessions.get(token);
    return s ? this.takeOver(s, ws) : null;
  }
  /** A caster in this room with this name whose connection dropped (a reloaded page joins by name, not by token). */
  droppedByName(room, name) {
    const key = (name || 'Caster').slice(0, 12).toLowerCase(); // the same name the Player was given
    for (const s of this.sessions.values()) if (!s.ws && s.room.code === room.code && s.player.name.toLowerCase() === key) return s;
    return null;
  }
  /** Hand a session to a new socket and send it everything a fresh join would get, in the room the caster is in now. */
  takeOver(s, ws) {
    clearTimeout(s.dropTimer);
    s.dropTimer = null;
    if (s.ws && s.ws !== ws) { const old = s.ws; s.ws = null; old.terminate(); } // a half-dead socket the server had not noticed yet
    s.ws = ws;
    const pl = s.player;
    pl.ws = ws;
    pl.away = false;
    pl.missedEvents = [];
    ws.send(JSON.stringify({ t: 'session', token: s.token }));
    s.room.resume(pl);
    return s;
  }

  /** Hang up on sockets that stopped answering pings, so their casters start their grace period. */
  heartbeat() {
    for (const ws of this.wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      try { ws.ping(); } catch {}
    }
  }
}
