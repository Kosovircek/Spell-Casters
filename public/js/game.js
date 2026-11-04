// The Game class wires every part together, then runs the main loop: update the world, render a frame.
import { $ } from './constants.js';
import { Settings } from './settings.js';
import { AudioManager } from './audio.js';
import { MorseKey } from './morse.js';
import { Network } from './network.js';
import { World } from './world.js';
import { Renderer } from './renderer.js';
import { Particles } from './particles.js';
import { EventEffects } from './effects.js';
import { Hud } from './hud.js';
import { InventoryMenu } from './inventory.js';
import { Input } from './input.js';
import { TouchInput } from './touch.js';
import { RingMenu } from './ring.js';
import { Lobby } from './lobby.js';
import { BellChant } from './bell.js';

export class Game {
  constructor() {
    this.myId = null;      // my player id, from the server's welcome message
    this.roomCode = '';
    this.lastFrame = performance.now();
    this.lastSeenItems = '';

    // ---- setup
    this.settings = new Settings();
    this.audio = new AudioManager(this.settings);
    this.morse = new MorseKey({
      wpm: this.settings.wpm, gapUnits: this.settings.gap,
      onChange: () => { if (this.morse.bad) this.audio.play('bad'); this.hud.renderMorse(this.morse); },
    });
    this.settings.onChange(s => { this.morse.wpm = s.wpm; this.morse.gapUnits = s.gap; this.hud.renderMorse(this.morse); });

    this.network = new Network();
    this.world = new World();
    this.renderer = new Renderer($('game'));
    this.particles = new Particles();
    this.hud = new Hud();
    this.effects = new EventEffects({ audio: this.audio, particles: this.particles, renderer: this.renderer, getMyId: () => this.myId });
    this.inventory = new InventoryMenu({ el: $('menu'), network: this.network, getMe: () => this.me, message: (t) => this.hud.message(t) });
    this.bell = new BellChant({ audio: this.audio, settings: this.settings });
    this.input = new Input(this);
    this.ring = new RingMenu(this);
    this.touch = new TouchInput(this);
    this.lobby = new Lobby((name, room) => this.join(name, room));

    this.settings.bindPanel(this.morse);
    $('close-settings').onclick = () => this.input.toggleSettings();
    this.listen();
  }

  /** Start drawing (the title screen until the player joins). */
  start() {
    this.hud.renderMorse(this.morse);
    requestAnimationFrame((t) => this.loop(t));
  }

  join(name, room) {
    this.roomCode = room;
    this.audio.context(); // unlock audio on this click
    this.touch.goFullscreen();
    this.network.connect(name, room);
  }

  /** My own player snapshot (pack, equipment, hp...). */
  get me() { return this.world.state?.players.find(p => p.id === this.myId) || null; }
  isPlaying() { return this.hud.visible && !this.settings.panelOpen; }

  // ------------------------------------------------------------------ server messages
  listen() {
    this.network
      .on('welcome', (m) => { this.myId = m.id; this.roomCode = m.room; this.hud.show(m.room); })
      .on('full', () => alert('That room is full (4 players). Try another room name.'))
      .on('map', (m) => { this.world.setMap(m); this.particles.clear(); this.hud.renderCheatSheet(m.pool); })
      .on('state', (m) => this.onState(m))
      .on('msg', (m) => this.hud.message(m.text))
      .on('close', () => { if (this.hud.visible) this.hud.banner('Disconnected. Refresh to rejoin.', 99999); });
  }

  onState(state) {
    this.world.applyState(state);
    const me = state.players.find(p => p.id === this.myId);
    if (me && me.stats) this.morse.maxLen = me.stats.letters; // some gear lets spells hold more letters
    for (const e of state.ev) this.effects.play(e);
    this.inventory.refresh();
    this.ring.refresh();
    this.announceItemsHere();
    this.hud.renderParty(state, this.myId);
    this.hud.renderBoss(state);
    this.hud.banner(state.msg);
  }

  /** Angband-style "You see a Potion of Healing." when you step onto items. */
  announceItemsHere() {
    const me = this.me;
    if (!me || me.dead) return;
    const here = this.itemsHere();
    const key = here.map(f => f.id).join();
    const how = this.touch.enabled ? 'tap the left side' : 'g';
    if (key && key !== this.lastSeenItems) this.hud.message(here.length === 1 ? `You see ${here[0].name}. (${how} to pick up)` : `You see ${here.length} items here. (${how} to pick them up)`);
    this.lastSeenItems = key;
  }
  /** Floor items close enough to pick up (same distance the server uses). */
  itemsHere() {
    const me = this.me;
    if (!me || me.dead || !this.world.state) return [];
    return (this.world.state.items || []).filter(f => Math.hypot(f.x - me.x, f.y - me.y) < 0.8);
  }

  // ------------------------------------------------------------------ main loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.update(dt);
    this.render(now, dt);
  }

  update(dt) {
    if (!this.world.ready) return;
    this.world.update(dt);
    this.particles.update(dt);
    this.bell.update(this.world.boss, this.world.player(this.myId), performance.now());
  }

  render(now, dt) {
    const world = this.world;
    const me = world.ready ? world.player(this.myId) : null;
    const meData = this.me;
    this.renderer.render({
      world, now, dt,
      focus: me || (world.map ? { x: world.map.stairs.x, y: world.map.stairs.y } : { x: 0, y: 0 }),
      myId: this.myId,
      morse: this.morse,
      particles: this.particles,
      insight: !!meData?.stats?.fx?.includes('insight'), // Circlet of Insight or the Eye of Odin
    });
    this.ring.place();
    this.hud.renderHoldBar(this.morse, now);
    this.hud.banner(null);
  }
}
