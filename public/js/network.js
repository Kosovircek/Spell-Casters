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

  /**
   * Join the co-op game in this room (the duel arena is entered from the surface, see goto).
   * The connection then looks after itself: if the socket drops (a phone putting the browser in the background,
   * turning the screen, a Wi-Fi hiccup) it opens a new one and resumes the same caster with the session token.
   */
  connect(name, room) {
    this.name = name; this.room = room;
    this.token = null;   // from the server's session message: proves which caster is mine when I come back
    this.retries = 0;
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.checkAlive(); });
    addEventListener('online', () => this.checkAlive());
    addEventListener('pageshow', (e) => { if (e.persisted) this.checkAlive(); }); // back from the browser's page cache
    this.on('session', (m) => { this.token = m.token; });
    this.on('resumeFailed', () => { this.token = null; this.send({ t: 'join', name: this.name, room: this.room }); }); // too late: join afresh by name
    this.open();
  }
  /** Open a socket and join (first time) or resume (after a drop). */
  open() {
    clearTimeout(this.retryTimer);
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const ws = this.ws = new WebSocket(url);
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.retries = 0;
      this.lastHeard = performance.now();
      this.send(this.token ? { t: 'resume', token: this.token } : { t: 'join', name: this.name, room: this.room });
      this.ping();
      clearInterval(this.pinger);
      this.pinger = setInterval(() => { this.ping(); this.checkAlive(); }, 1000);
    };
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      this.lastHeard = performance.now();
      const m = JSON.parse(ev.data);
      if (m.t === 'full') this.leaving = true; // nothing to come back to
      this.emit(m.t, m);
    };
    ws.onclose = () => { if (ws === this.ws) this.lost(); };
  }
  /** The socket is gone: say so and try again soon (sooner while the page is in front). */
  lost() {
    clearInterval(this.pinger);
    if (this.leaving) return;
    this.ws = null;
    this.emit('reconnecting');
    const wait = document.visibilityState === 'visible' ? Math.min(5000, 300 * 2 ** this.retries++) : 5000;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.open(), wait);
  }
  /**
   * The server sends 20 states a second, so a few silent seconds mean the socket is dead even if the browser
   * has not noticed (a phone that slept). Drop it and reconnect at once. Also called when the page comes back.
   */
  checkAlive() {
    if (this.leaving || !this.name) return;
    if (!this.ws) { this.open(); return; } // waiting for a retry: go now
    if (this.ws.readyState === 1 && performance.now() - this.lastHeard > 4000) {
      const dead = this.ws; this.ws = null;
      try { dead.close(); } catch {}
      this.lost();
      this.open();
    }
  }
  /** Hang up on purpose (leaving to the start menu): no banner, no reconnecting, and my slot is freed at once. */
  close() { this.send({ t: 'leave' }); this.leaving = true; clearTimeout(this.retryTimer); clearInterval(this.pinger); this.ws?.close(); }
  get connected() { return this.ws && this.ws.readyState === 1; }
  send(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  ping() { this.send({ t: 'ping', c: performance.now() }); }

  // ---- typed helpers for everything the client can ask the server to do
  move(x, y) { this.send({ t: 'move', x, y }); }
  /** What I am typing (finished letters, Morse of the next letter, key held), so the others see it above me. */
  typing(s, b, k) { this.send({ t: 'type', s, b, k }); }
  cast(word, dx, dy) { this.send({ t: 'cast', w: word, dx, dy }); }
  command(c, args = {}) { this.send({ t: 'cmd', c, ...args }); }
  save() { this.send({ t: 'save' }); }
  /** 'arena' walks into the duel arena (standing in its gate on the surface), 'surface' leaves it again. */
  goto(to) { this.send({ t: 'goto', to }); }
}
