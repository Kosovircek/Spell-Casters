// WebSocket connection to the game server. Other modules subscribe to message types with on().
export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {}; // message type -> [fn]
    this.rtt = 0;       // smoothed round trip to the server in ms (used by movement prediction)
    this.pinger = null;
    this.on('pong', (m) => {
      const sample = performance.now() - m.c;
      this.rtt = this.rtt ? this.rtt + (sample - this.rtt) * 0.2 : sample;
    });
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, data) { for (const fn of this.handlers[type] || []) fn(data); }

  /** mode is 'duel' for the duel room, anything else for the co-op dungeon. */
  connect(name, room, mode) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.send({ t: 'join', name, room, mode });
      this.ping();
      this.pinger = setInterval(() => this.ping(), 1000);
    };
    this.ws.onmessage = (ev) => { const m = JSON.parse(ev.data); this.emit(m.t, m); };
    this.ws.onclose = () => { clearInterval(this.pinger); this.emit('close'); };
  }
  get connected() { return this.ws && this.ws.readyState === 1; }
  send(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  ping() { this.send({ t: 'ping', c: performance.now() }); }

  // ---- typed helpers for everything the client can ask the server to do
  move(x, y) { this.send({ t: 'move', x, y }); }
  cast(word, dx, dy) { this.send({ t: 'cast', w: word, dx, dy }); }
  command(c, args = {}) { this.send({ t: 'cmd', c, ...args }); }
  save() { this.send({ t: 'save' }); }
}
