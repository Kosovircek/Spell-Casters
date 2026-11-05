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
import { StoreMenu } from './store.js';
import { Input } from './input.js';
import { TouchInput } from './touch.js';
import { RingMenu } from './ring.js';
import { Lobby } from './lobby.js';
import { BellChant } from './bell.js';
import { Prediction } from './prediction.js';

export class Game {
  constructor() {
    this.myId = null;      // my player id, from the server's welcome message
    this.roomCode = '';
    this.lastFrame = performance.now();
    this.lastSeenItems = '';
    this.hudState = null;  // newest state the HUD has not shown yet (drawn once per frame, not per message)

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
    this.doorKind = null; // the shop or house door my caster is walking into, if any
    this.store = new StoreMenu({
      el: $('menu'), network: this.network, getMe: () => this.me, inventory: this.inventory,
      onOpen: () => { this.inventory.close(); this.ring?.close(); this.input.stopWalking(); },
    });
    this.bell = new BellChant({ audio: this.audio, settings: this.settings });
    this.input = new Input(this);
    this.ring = new RingMenu(this);
    this.touch = new TouchInput(this);
    this.prediction = new Prediction(this);
    this.lobby = new Lobby((name, room, mode) => this.join(name, room, mode));

    this.settings.bindPanel(this.morse);
    $('close-settings').onclick = () => this.input.toggleSettings();
    this.listen();
  }

  /** Start drawing (the title screen until the player joins). */
  start() {
    this.hud.renderMorse(this.morse);
    requestAnimationFrame((t) => this.loop(t));
  }

  join(name, room, mode) {
    this.roomCode = room;
    this.audio.context(); // unlock audio on this click
    this.touch.goFullscreen();
    this.network.connect(name, room, mode);
  }

  /** My own player snapshot (pack, equipment, hp...). */
  get me() { return this.world.state?.players.find(p => p.id === this.myId) || null; }
  isPlaying() { return this.hud.visible && !this.settings.panelOpen; }

  // ------------------------------------------------------------------ server messages
  listen() {
    this.network
      .on('welcome', (m) => { this.myId = m.id; this.roomCode = m.room; this.hud.show(m.room, m.duel); if (m.duel) $('cheat').hidden = true; }) // the cheat sheet would cover one end of the duel platform (H shows it)
      .on('full', (m) => alert(`That room is full (${m.max || 4} players). Try another room name.`))
      .on('map', (m) => { this.world.setMap(m); this.prediction.reset(); this.particles.clear(); this.hud.renderCheatSheet(m.pool); this.store.close(); this.doorKind = null; })
      .on('store', (m) => { if (m.kind && m.kind !== this.doorKind) return; this.store.show(m); }) // ignore it if I already walked away
      .on('state', (m) => this.onState(m))
      .on('msg', (m) => this.hud.message(m.text))
      .on('close', () => { if (this.hud.visible) this.hud.banner('Disconnected. Refresh to rejoin.', 99999); });
  }

  onState(state) {
    this.world.applyState(state);
    this.prediction.onServer(performance.now());
    const me = state.players.find(p => p.id === this.myId);
    if (me && me.stats) this.morse.maxLen = me.stats.letters; // some gear lets spells hold more letters
    for (const e of state.ev) this.effects.play(e);
    this.hudState = state;
  }

  /** Menus and panels follow the newest state, once per frame: after a Wi-Fi hiccup several states can arrive at once. */
  renderHud() {
    const state = this.hudState;
    if (!state) return;
    this.hudState = null;
    this.inventory.refresh();
    this.store.refresh();
    this.ring.refresh();
    this.announceItemsHere();
    this.hud.renderParty(state, this.myId);
    if (state.duel) this.hud.renderDuel(state, this.myId); else this.hud.renderBoss(state);
    this.hud.banner(state.msg);
    this.hud.renderPing(this.network.rtt);
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
  /**
   * On the surface, walking up to the shop's or the house's door opens it; walking away closes it.
   * It opens a little before you touch the door and closes only once you are clearly away from it,
   * so the small catch-up of my caster to the server's position never flickers it shut.
   */
  checkDoor() {
    const me = this.world.ready ? this.world.player(this.myId) : null;
    const doors = me && !me.data.dead && this.world.map.town ? this.world.map.doors : [];
    const near = (d, reach) => Math.abs(me.x - (d.x + 0.5)) < reach && me.y - (d.y + 0.5) < reach + 0.2 && me.y > d.y;
    const open = doors.find(d => d.kind === this.doorKind);
    if (open && near(open, 1.4)) return; // still at the open door
    const door = doors.find(d => near(d, 0.8));
    const kind = door ? door.kind : null;
    if (kind === this.doorKind) return;
    this.doorKind = kind;
    if (kind) this.network.command('enter', { kind });
    else this.store.close();
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
    this.prediction.update(dt, performance.now());
    this.world.update(dt);
    this.particles.update(dt);
    this.bell.update(this.world.boss, this.world.player(this.myId), performance.now());
  }

  render(now, dt) {
    this.renderHud();
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
      duel: !!world.map?.duel,
      hitboxes: this.settings.showHitboxes(!!world.map?.duel),
    });
    this.ring.place();
    this.checkDoor();
    this.hud.renderHoldBar(this.morse, now);
    this.hud.banner(null);
  }
}
