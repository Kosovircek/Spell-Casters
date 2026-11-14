// The grimoire: every effect spell, the ones you know and the ones still to find, and the spellbook puzzle
// screen. G opens it (the Spells segment of the ring menu on touch screens).
//
// Learning: read a spellbook (r) and a puzzle opens here. Type the answer and press Enter, or tap it in Morse
// and aim (any numpad direction, or a swipe): the answer is checked instead of being cast.
import { $, escapeHtml, prettyMorse } from './constants.js';
import { MORSE } from './morse.js';

const SCHOOLS = [
  { id: 'elements', name: 'Elements' }, { id: 'summons', name: 'Summons' },
  { id: 'control', name: 'Control' }, { id: 'utility', name: 'Utility' },
];
const letter = (i) => String.fromCharCode(97 + i);

export class Grimoire {
  constructor(game) {
    this.game = game;
    this.el = $('grimoire');
    this.catalog = [];        // every effect spell (from the server)
    this.known = new Set();   // ids I know
    this.view = null;         // null (closed), 'list', 'spell', 'puzzle' or 'learned'
    this.school = 'elements';
    this.pick = null;         // the spell being looked at
    this.puzzle = null;       // { id, title, kind, lines, code, school }
    this.note = '';           // "that is not it" under the puzzle
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'close') this.close();
      else if (k === 'submit') this.answer($('gr-answer')?.value || '');
      else if (k.startsWith('tab:')) { this.school = k.slice(4); this.view = 'list'; this.render(); }
      else this.handleKey({ key: k });
    });
  }
  get isOpen() { return !!this.view; }
  get puzzleOpen() { return this.view === 'puzzle'; }
  bySchool(id) { return this.catalog.filter(s => s.school === id); }
  schoolOf(id) { return this.catalog.find(s => s.id === id)?.school; }

  // ------------------------------------------------------------------ server messages
  setCatalog(m) { this.catalog = m.spells; this.known = new Set(m.known); if (this.view === 'list') this.render(); }
  showPuzzle(m) {
    if (!m.id) { if (this.view === 'puzzle') this.close(); return; }
    this.puzzle = m; this.note = ''; this.view = 'puzzle';
    this.game.inventory.close(); this.game.store.close(); this.game.ring?.close();
    this.render();
    setTimeout(() => $('gr-answer')?.focus(), 30);
  }
  wrong(m) {
    if (this.view !== 'puzzle') return;
    this.note = m.text;
    this.render(true);
    this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
    setTimeout(() => $('gr-answer')?.focus(), 30);
  }
  learned(m) {
    this.known.add(m.id);
    this.view = 'learned'; this.learnedWord = m.word; this.learnedText = m.text; this.puzzle = null;
    this.render();
  }

  // ------------------------------------------------------------------ actions
  open() {
    this.game.inventory.close(); this.game.store.close(); this.game.ring?.close();
    this.view = 'list'; this.pick = null; this.render();
  }
  close() {
    if (this.view === 'puzzle') this.game.network.command('unstudy');
    this.view = null; this.pick = null; this.puzzle = null;
    this.el.hidden = true; this.el.innerHTML = ''; this.lastHtml = '';
    document.activeElement?.blur?.();
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  answer(text) {
    if (this.view !== 'puzzle' || !text) return;
    this.game.network.command('solve', { a: String(text) });
  }

  handleKey(e) {
    const k = e.key;
    if (k === 'Escape') { if (this.view === 'spell') { this.view = 'list'; this.render(); } else this.close(); return true; }
    if (this.view === 'learned') { this.close(); return true; }
    if (this.view === 'puzzle') return true; // the answer box has the keyboard
    if (this.view === 'spell') { this.view = 'list'; this.render(); return true; }
    if (k === 'G') { this.close(); return true; }
    const at = SCHOOLS.findIndex(s => s.id === this.school);
    if (k === 'Tab' || k === 'ArrowRight' || k === '/') { this.school = SCHOOLS[(at + 1) % 4].id; this.render(); return true; }
    if (k === 'ArrowLeft') { this.school = SCHOOLS[(at + 3) % 4].id; this.render(); return true; }
    if (/^[1-4]$/.test(k)) { this.school = SCHOOLS[+k - 1].id; this.render(); return true; }
    if (/^[a-z]$/.test(k)) {
      const sp = this.bySchool(this.school)[k.charCodeAt(0) - 97];
      if (sp) { this.pick = sp; this.view = 'spell'; this.render(); }
    }
    return true;
  }

  // ------------------------------------------------------------------ drawing
  refresh() { if (this.view === 'list') this.render(); }
  render(force = false) {
    if (!this.view) return;
    this.el.hidden = false;
    const touch = this.game.touch?.enabled;
    const head = (title) => `<div class="mh th"><span class="tt">${title}</span><span class="tb" data-k="close">✕</span></div>`;
    if (this.view === 'puzzle') return this.setHtml(head(escapeHtml(this.puzzle.title)) + this.puzzleHtml(touch), force);
    if (this.view === 'learned') {
      return this.setHtml(head('A spell is yours') + `<div class="learned"><span class="rune big">✦</span><span class="word">${this.learnedWord}</span></div>` +
        `<p>${escapeHtml(this.learnedText)}</p><p class="dim">Its Morse: <span class="code">..-- ${[...this.learnedWord].map(c => MORSE[c]).join(' ')}</span></p>` +
        `<div class="row" data-k="Escape">OK</div>`);
    }
    if (this.view === 'spell') return this.setHtml(head('Grimoire') + this.spellHtml(this.pick) + `<div class="row" data-k="Escape">‹ Back</div>`);
    const me = this.game.me;
    const tabs = `<div class="tabs">${SCHOOLS.map((s, i) => `<span class="tab sc-${s.id}${s.id === this.school ? ' on' : ''}" data-k="tab:${s.id}">${touch ? '' : i + 1 + ' '}${s.name}</span>`).join('')}</div>`;
    const rows = this.bySchool(this.school).map((sp, i) => {
      const knows = this.known.has(sp.id), low = me && !me.side && me.lv < sp.level;
      const name = knows ? `<span class="word sc-${sp.school}">${sp.word}</span>` : `<span class="dim">? ? ?</span> <span class="dim">(Spellbook of ${escapeHtml(sp.book)})</span>`;
      const info = `<span class="gi">${low ? `<span class="need">Lv ${sp.level}</span>` : `Lv ${sp.level}`} · ${sp.mana} mana · ${sp.cd}s</span>`;
      return `<div class="row srow${knows ? '' : ' unknown'}" data-k="${letter(i)}"><span><span class="mk">${letter(i)})</span> ${name}</span>${info}</div>`;
    }).join('');
    const count = `<div class="dim">${this.known.size} of ${this.catalog.length} spells known · mana ${me ? `${me.mana} / ${me.maxMana}` : '-'}</div>`;
    const how = `<div class="mf">Cast: tap the rune <b>..--</b> (✦), then the word, then aim. ${touch ? 'Tap a spell for more.' : 'Letter: details · 1-4 or Tab: school · Esc: close'}</div>`;
    this.setHtml(head('Grimoire') + tabs + count + rows + how);
  }
  spellHtml(sp) {
    const knows = this.known.has(sp.id);
    const title = knows ? `<div class="learned"><span class="rune">✦</span><span class="word sc-${sp.school}">${sp.word}</span></div>` : `<div class="mh">An unknown spell</div>`;
    const morse = knows ? `<p class="dim">Morse: <span class="code">..-- ${[...sp.word].map(c => prettyMorse(MORSE[c])).join(' ')}</span></p>` : `<p class="dim">Find a Spellbook of ${escapeHtml(sp.book)} and solve its puzzle to learn it.</p>`;
    return title + `<p>${escapeHtml(sp.desc)}</p>` + (sp.duel ? `<p class="dim">In a duel: ${escapeHtml(sp.duel)}</p>` : '') +
      `<p class="dim">Level ${sp.level} · ${sp.mana} mana · ${sp.cd} s cooldown</p>` + morse;
  }
  puzzleHtml(touch) {
    const p = this.puzzle;
    const code = p.code ? `<div class="pz-code${p.kind === 'morse' || p.kind === 'mirror' ? ' morse' : ''}">${escapeHtml(p.kind === 'morse' || p.kind === 'mirror' ? prettyMorse(p.code) : p.code)}</div>` : '';
    return p.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('') + code +
      `<div class="pz-answer"><input id="gr-answer" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="your answer"><span class="tb go" data-k="submit">Answer</span></div>` +
      (this.note ? `<p class="need">${escapeHtml(this.note)}</p>` : '') +
      `<div class="mf">Enter to answer${touch ? '' : ', or tap the answer in Morse and press any aim key'}. Esc closes the book.</div>`;
  }
  setHtml(html, force = false) {
    if (!force && html === this.lastHtml) return;
    const typed = $('gr-answer')?.value; // keep what was typed in the answer box
    this.el.innerHTML = html; this.lastHtml = html;
    const box = $('gr-answer');
    if (box) {
      if (typed) box.value = typed;
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.answer(box.value); }
        if (e.key === 'Escape') { e.preventDefault(); this.close(); }
        e.stopPropagation(); // typing an answer must not walk, cast or open menus
      });
    }
  }
}
