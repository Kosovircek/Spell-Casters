// The HTML overlay: party list, floor info, banner, Morse input box, cheat sheet and message line.
import { $, escapeHtml, prettyMorse } from './constants.js';
import { MORSE, FROM_MORSE } from './morse.js';

export class Hud {
  constructor() {
    this.bannerText = null; this.bannerUntil = 0;
    this.messages = [];  // Angband-style message line, newest last
    setInterval(() => this.renderMessages(), 500);
  }
  show(roomCode, duel) {
    $('lobby').hidden = true; $('hud').hidden = false; $('touch').hidden = false;
    this.roomLine = duel ? `Duel arena of room ${roomCode}  (Esc to leave)` : `Room: ${roomCode}  (share this page URL)`;
    $('roomcode').textContent = this.roomLine;
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

  /** Round trip to the server, next to the room name, so a slow connection is easy to spot. */
  renderPing(rtt) {
    if (!this.roomLine || !rtt) return;
    const text = `${this.roomLine} · ping ${Math.round(rtt)} ms`;
    if ($('roomcode').textContent !== text) $('roomcode').textContent = text;
  }
  /** Only touch the page when the HTML really changed (these panels are refreshed 20 times a second). */
  setHtml(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }

  // ---- party panel and floor info
  renderParty(state, myId) {
    const duel = state.duel;
    const travel = state.travel ? `  · carried ${state.travel.to ? 'to floor ' + state.travel.to : 'to the surface'} in ${state.travel.secs}s` : '';
    $('floor').textContent = duel ? `Duel · round ${duel.round || '-'} · first to ${duel.need} wins · H: Morse sheet · B: hitboxes`
      : !state.floor ? `The surface${state.maxDepth ? ` · deepest floor ${state.maxDepth}` : ' · stairs down to floor 1'}${travel}`
      : 'Floor ' + state.floor + (state.stairsOpen ? '  - stairs down open' : '  - foes left: ' + state.enemies.length) + travel;
    this.setHtml($('party'), state.players.map(p =>
      `<div class="pl" style="border-color:${p.color}"><b style="color:${p.color}">${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''}</b>` +
      (duel ? '' : ` <span class="lv">Lv ${p.lv}</span>`) +
      this.barsHtml(p, p.id === myId && !duel, duel) +
      (duel ? `<div class="stats">${p.wins} round${p.wins === 1 ? '' : 's'} won · ${p.blocks} letters blocked</div>`
        : `<div class="stats">${p.kills} defeated · ${p.blocks} blocked${p.id === myId ? ` · <span class="gold">${p.gold} gold</span>` : ''}</div>` + this.effectsHtml(p)) + `</div>`).join('') +
      (state.elsewhere || []).map(p => `<div class="pl away" style="border-color:${p.color}"><b style="color:${p.color}">${escapeHtml(p.name)}</b>` +
        ` <span class="lv">Lv ${p.lv}</span><div class="stats">${p.dead ? 'down' : 'exploring'} ${p.floor ? 'floor ' + p.floor : 'the surface'}</div></div>`).join('') +
      (state.slow ? `<div class="pl" style="border-color:#ffd54f"><span class="fx">⌛ Enemy spells slowed ${state.slow}s</span></div>` : ''));
    const me = state.players.find(p => p.id === myId);
    $('dead').hidden = !(me && me.dead) || !!duel; // in a duel the round banner says it
    if (me && me.dead) $('dead').textContent = `You are down. Reviving next to a teammate in ${me.respawn}s...`;
  }
  /** HP bar with numbers, and an XP bar for yourself. */
  barsHtml(p, mine, duel = false) {
    const hpPct = p.maxHp ? Math.max(0, p.hp / p.maxHp * 100) : 0;
    const low = hpPct <= 30 ? ' low' : '';
    let html = p.dead ? `<div class="down">${duel ? 'defeated' : `down, back in ${p.respawn}s`}</div>`
      : `<div class="bar hpbar${low}"><i style="width:${hpPct}%"></i><span>${p.hp} / ${p.maxHp}</span></div>`;
    if (mine) html += p.xpNext ? `<div class="bar xpbar"><i style="width:${Math.min(100, p.xp / p.xpNext * 100)}%"></i><span>XP ${p.xp} / ${p.xpNext}</span></div>`
      : `<div class="bar xpbar"><i style="width:100%"></i><span>Max level</span></div>`;
    return html;
  }
  effectsHtml(p) {
    const fx = [];
    if (p.swift) fx.push(`<span class="fx">Swift ${p.swift}s</span>`);
    if (p.ward) fx.push(`<span class="fx">Ward ×${p.ward}</span>`);
    if (p.equip && p.equip.cloak && p.equip.cloak.letter) fx.push(`<span class="fx">Mantle ${p.equip.cloak.letter}</span>`);
    if (p.stats && p.stats.blocks) fx.push(`<span class="fx">Shield ${p.stats.blocks}</span>`);
    if (p.hidden) fx.push(`<span class="fx">Invisible</span>`);
    return fx.length ? `<div class="effects">${fx.join(' ')}</div>` : '';
  }

  // ---- duel scoreboard (top centre): both casters, their round wins, and what happens now
  renderDuel(state, myId) {
    const d = state.duel, el = $('bossbar');
    el.hidden = false; el.classList.add('duel');
    const bySide = [0, 1].map(s => state.players.find(p => p.side === s));
    const side = (p) => {
      if (!p) return '<span style="color:#6f6a85">waiting...</span>';
      const pips = Array.from({ length: d.need }, (_, i) => i < p.wins ? '●' : '○').join('');
      return `<span style="color:${p.color}">${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''} <span class="wins">${pips}</span></span>`;
    };
    const winner = state.players.find(p => p.id === d.winner);
    const how = {
      waiting: 'Waiting for another caster from your party to walk into the arena. Practise your casting meanwhile.',
      countdown: `Round ${d.round} starts in ${d.count}...`,
      fight: 'Cast the same letters at an incoming spell to block it',
      roundover: winner ? `${winner.name} takes round ${d.round}` : '',
      over: winner ? `${winner.name} wins the duel! A new duel starts soon` : '',
    }[d.phase] || '';
    this.setHtml(el, `<div class="bn duelists">${side(bySide[0])}<span>VS</span>${side(bySide[1])}</div><div class="bh">${escapeHtml(how)}</div>`);
  }

  // ---- boss bar (bottom centre) while the floor's boss is awake
  renderBoss(state) {
    const b = (state.enemies || []).find(e => e.boss);
    const el = $('bossbar');
    el.classList.remove('duel');
    if (!b || !b.awake) { el.hidden = true; return; }
    el.hidden = false;
    const pips = Array.from({ length: b.phases }, (_, i) => `<span class="${i < b.phase ? 'gone' : i === b.phase ? 'cur' : ''}">◆</span>`).join('');
    this.setHtml(el, `<div class="bn">${escapeHtml((b.name || 'The Bellwraith').toUpperCase())} <span class="pips">${pips}</span></div><div class="bh ${b.guard ? 'sh' : 'op'}">${escapeHtml(b.hint || '')}</div>`);
  }

  // ---- Morse input box
  renderMorse(morse) {
    let html = morse.spell ? `<span class="ch">${morse.spell}</span>` : '';
    if (morse.buf) { const guess = FROM_MORSE[morse.buf]; html += ` ${prettyMorse(morse.buf)}${guess ? ' <span style="color:#6f6040">' + guess + '</span>' : ''}`; }
    else if (morse.bad) html += ` <span class="bad">${prettyMorse(morse.bad)} ?</span>`;
    $('morse-buf').innerHTML = html || '&nbsp;';
    const h = $('morse-hint');
    if (this.touchMode) {
      if (morse.bad && !morse.buf) h.textContent = 'Not a letter, it was dropped. Keep tapping or swipe to cast.';
      else if (morse.buf) h.textContent = 'Keep tapping, pause for the next letter, or swipe to cast';
      else if (morse.spell) h.textContent = `Add letters, or swipe on the right to cast ${morse.spell}`;
      else h.textContent = 'Tap = dot, hold = dash, swipe = cast. Drag on the left to walk';
    }
    else if (morse.bad && !morse.buf) h.textContent = 'Not a letter, it was dropped. Keep typing or aim to cast.';
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
