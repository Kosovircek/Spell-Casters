// The HTML overlay: party list, floor info, banner, Morse input box, cheat sheet and message line.
import { $, escapeHtml, prettyMorse } from './constants.js';
import { MORSE, FROM_MORSE } from './morse.js';

export class Hud {
  constructor() {
    this.bannerText = null; this.bannerUntil = 0;
    this.messages = [];  // Angband-style message line, newest last
    setInterval(() => this.renderMessages(), 500);
  }
  show(roomCode) {
    $('lobby').hidden = true; $('hud').hidden = false;
    $('roomcode').textContent = 'Room: ' + roomCode + '  (share this page URL)';
  }
  get visible() { return !$('hud').hidden; }
  toggleCheatSheet() { $('cheat').hidden = !$('cheat').hidden; }

  // ---- banner (big centred text)
  banner(text, ms = 400) {
    if (text) { this.bannerText = text; this.bannerUntil = performance.now() + ms; }
    $('banner').textContent = performance.now() < this.bannerUntil ? this.bannerText : '';
  }

  // ---- message line
  message(text) {
    this.messages.push({ text, at: performance.now() });
    while (this.messages.length > 3) this.messages.shift();
    this.renderMessages();
  }
  renderMessages() {
    const now = performance.now();
    while (this.messages.length && now - this.messages[0].at > 6000) this.messages.shift();
    $('msgline').innerHTML = this.messages.map(m => `<div>${escapeHtml(m.text)}</div>`).join('');
  }

  // ---- party panel and floor info
  renderParty(state, myId) {
    $('floor').textContent = 'Floor ' + state.floor + (state.stairsOpen ? '  - stairs open!' : '  - foes left: ' + state.enemies.length);
    $('party').innerHTML = state.players.map(p =>
      `<div class="pl" style="border-color:${p.color}"><b style="color:${p.color}">${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''}</b><br>` +
      `<span class="hp">${p.dead ? 'down, back in ' + p.respawn + 's' : '♥'.repeat(p.hp) + '<span style="color:#4b3d63">' + '♥'.repeat(p.maxHp - p.hp) + '</span>'}</span>` +
      `<div class="stats">${p.kills} defeated · ${p.blocks} blocked</div>` + this.effectsHtml(p) + `</div>`).join('') +
      (state.slow ? `<div class="pl" style="border-color:#ffd54f"><span class="fx">⌛ Enemy spells slowed ${state.slow}s</span></div>` : '');
    const me = state.players.find(p => p.id === myId);
    $('dead').hidden = !(me && me.dead);
    if (me && me.dead) $('dead').textContent = `You are down. Reviving next to a teammate in ${me.respawn}s...`;
  }
  effectsHtml(p) {
    const fx = [];
    if (p.swift) fx.push(`<span class="fx">Swift ${p.swift}s</span>`);
    if (p.ward) fx.push(`<span class="fx">Ward ×${p.ward}</span>`);
    if (p.equip && p.equip.cloak && p.equip.cloak.letter) fx.push(`<span class="fx">Cloak ${p.equip.cloak.letter}</span>`);
    return fx.length ? `<div class="effects">${fx.join(' ')}</div>` : '';
  }

  // ---- boss bar (top centre) while the Bellwraith is awake
  renderBoss(state) {
    const b = (state.enemies || []).find(e => e.type === 'boss');
    const el = $('bossbar');
    if (!b || !b.awake) { el.hidden = true; return; }
    el.hidden = false;
    const pips = Array.from({ length: b.phases }, (_, i) => `<span class="${i < b.phase ? 'gone' : i === b.phase ? 'cur' : ''}">◆</span>`).join('');
    const how = b.shield ? 'Bell shield up: cast the letter its bell rings'
      : `Shield broken for ${b.open}s: spell the Morse name above it`;
    el.innerHTML = `<div class="bn">THE BELLWRAITH <span class="pips">${pips}</span></div><div class="bh ${b.shield ? 'sh' : 'op'}">${how}</div>`;
  }

  // ---- Morse input box
  renderMorse(morse) {
    let html = morse.spell ? `<span class="ch">${morse.spell}</span>` : '';
    if (morse.buf) { const guess = FROM_MORSE[morse.buf]; html += ` ${prettyMorse(morse.buf)}${guess ? ' <span style="color:#6f6040">' + guess + '</span>' : ''}`; }
    else if (morse.bad) html += ` <span class="bad">${prettyMorse(morse.bad)} ?</span>`;
    $('morse-buf').innerHTML = html || '&nbsp;';
    const h = $('morse-hint');
    if (morse.bad && !morse.buf) h.textContent = 'Not a letter, it was dropped. Keep typing or aim to cast.';
    else if (morse.buf) h.textContent = 'Keep tapping, pause for the next letter, or aim to cast';
    else if (morse.spell) h.textContent = `Add letters, or aim with the numpad to cast ${morse.spell}. Backspace removes a letter.`;
    else h.textContent = 'Tap Numpad 5 (or Space). Short = dot, long = dash. Numpad 0 = instant dash';
  }
  /** Bar that fills while the key is held; it turns yellow once the press counts as a dash. */
  renderHoldBar(morse, now) {
    const bar = $('morse-hold-bar'), full = morse.unit * 3;
    $('morse-hold-mark').style.left = (morse.dashAt / full * 100) + '%';
    if (morse.isDown) {
      const t = now - morse.downAt;
      bar.style.width = Math.min(100, t / full * 100) + '%';
      bar.style.background = t < morse.dashAt ? '#4fc3f7' : '#ffd54f';
    } else bar.style.width = '0';
  }

  /** Morse cheat sheet; letters used on this floor are bright. */
  renderCheatSheet(pool) {
    $('cheat').innerHTML = '<div style="column-span:all;color:#9a8fb0;margin-bottom:4px">Morse (H to hide)</div>' +
      Object.entries(MORSE).map(([k, v]) => `<div class="${pool.includes(k) ? 'on' : 'off'}"><span class="k">${k}</span> ${prettyMorse(v)}</div>`).join('');
  }
}
