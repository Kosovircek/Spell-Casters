// Angband-style inventory / equipment popup.
// Keys: i inventory, e equipment, w wear/wield, t take off, d drop, q quaff, r read,
// I inspect, k destroy, g pick up, C character sheet, / switch list, Esc back/close.
// Inside a list, pressing an item's letter opens a menu of what you can do with it.
// On touch screens every row is a button: tapping it is the same as pressing its key.
import { escapeHtml } from './constants.js';

export const SLOT_ORDER = ['weapon', 'shield', 'ring', 'neck', 'head', 'body', 'cloak', 'feet'];
export const SLOT_NAMES = { weapon: 'Weapon', shield: 'Shield', ring: 'Ring', neck: 'Amulet', head: 'Head', body: 'Body', cloak: 'Cloak', feet: 'Feet' };

const VERBS = {
  quaff:   { key: 'q', label: 'Quaff', prompt: 'Quaff which potion?', from: 'pack', ok: it => it.type === 'potion', none: 'You have no potions to quaff.' },
  read:    { key: 'r', label: 'Read', prompt: 'Read which scroll?', from: 'pack', ok: it => it.type === 'scroll', none: 'You have no scrolls to read.' },
  wield:   { key: 'w', label: 'Wear/Wield', prompt: 'Wear or wield which item?', from: 'pack', ok: it => it.type === 'gear', none: 'You have nothing to wear or wield.' },
  drop:    { key: 'd', label: 'Drop', prompt: 'Drop which item?', from: 'pack', ok: () => true, none: 'You have nothing to drop.' },
  destroy: { key: 'k', label: 'Destroy', prompt: 'Destroy which item?', from: 'pack', ok: () => true, none: 'You have nothing to destroy.' },
  takeoff: { key: 't', label: 'Take off', prompt: 'Take off which item?', from: 'equip', ok: () => true, none: 'You are not wearing anything.' },
  inspect: { key: 'I', label: 'Inspect', prompt: 'Inspect which item?', from: null, ok: () => true, none: 'You have nothing to inspect.' },
};
const KEY_TO_VERB = Object.fromEntries(Object.entries(VERBS).map(([v, d]) => [d.key, v]));
const letter = (i) => String.fromCharCode(97 + i);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The popup is a small state machine held in `this.ui`:
 *   null                         closed
 *   { view, verb: null }         browsing a list ('pack' or 'equip')
 *   { view, verb: 'quaff' ... }  a "Quaff which potion?" prompt
 *   { view, item: { ref, it } }  menu of what you can do with one item
 *   { inspect: it }              an item's description
 *   { sheet: true }              the character sheet (level, HP, armor, ...)
 */
export class InventoryMenu {
  constructor({ el, network, getMe, message }) {
    this.el = el;
    this.network = network;
    this.getMe = getMe;     // () => my player snapshot (pack, equip)
    this.message = message; // (text) => show on the message line
    this.touchMode = false; // set by the touch controls: show tap hints instead of key hints
    this.ui = null;
    // A tap on a row works like pressing that row's key.
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || !this.ui) return;
      e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'close') this.close();
      else this.handleKey({ key: k });
    });
  }
  get isOpen() { return !!this.ui; }

  // ------------------------------------------------------------------ data
  /** Rows of the pack or equipment list: { key, it, ref, slot }. */
  entries(view) {
    const me = this.getMe(); if (!me) return [];
    if (view === 'pack') return me.pack.map((it, i) => ({ key: letter(i), it, ref: { from: 'pack', idx: i } }));
    return SLOT_ORDER.map((slot, i) => ({ key: letter(i), it: me.equip[slot], ref: { from: 'equip', slot }, slot }));
  }
  verbsFor(ref, it) {
    if (!it) return [];
    if (ref.from === 'equip') return ['inspect', 'takeoff'];
    return Object.keys(VERBS).filter(v => VERBS[v].from === 'pack' && VERBS[v].ok(it)).concat('inspect');
  }

  // ------------------------------------------------------------------ actions
  open(view, verb = null) {
    const v = verb ? (VERBS[verb].from || view) : view;
    const usable = this.entries(v).filter(e => e.it && (!verb || VERBS[verb].ok(e.it)));
    if (verb && !usable.length) return this.message(VERBS[verb].none);
    this.ui = { view: v, verb };
    this.render();
  }
  close() { this.ui = null; this.render(); }
  openSheet() { this.ui = { sheet: true }; this.render(); }
  run(verb, ref, it) {
    if (verb === 'inspect') { this.ui = { inspect: it }; return this.render(); }
    if (verb === 'takeoff') this.network.command('takeoff', { slot: ref.slot });
    else this.network.command(verb, { i: ref.idx });
    this.close();
  }

  // ------------------------------------------------------------------ keys
  /** Handle a keydown. Returns true when the menu used the key. */
  handleKey(e) {
    const k = e.key, ui = this.ui;
    if (!ui) return this.handleClosedKey(k);
    if (k === 'Escape') { if (ui.item) { this.ui = { view: ui.view, verb: ui.verb }; this.render(); } else this.close(); return true; }
    if (ui.inspect) { this.close(); return true; }
    if (ui.sheet) { if (k === 'C') return true; if (k === 'i' || k === 'e') this.open(k === 'i' ? 'pack' : 'equip'); else this.close(); return true; }
    if (k === 'C') { this.openSheet(); return true; }
    if (ui.item) {
      const v = KEY_TO_VERB[k];
      if (v && this.verbsFor(ui.item.ref, ui.item.it).includes(v)) this.run(v, ui.item.ref, ui.item.it);
      return true;
    }
    if (k === '/') { ui.view = ui.view === 'pack' ? 'equip' : 'pack'; if (ui.verb && VERBS[ui.verb].from) ui.verb = null; this.render(); return true; }
    if (!ui.verb && (k === 'i' || k === 'e')) { ui.view = k === 'i' ? 'pack' : 'equip'; this.render(); return true; }
    if (/^[a-l]$/.test(k)) {
      const ent = this.entries(ui.view).find(x => x.key === k);
      if (ent && ent.it) {
        if (ui.verb) { if (VERBS[ui.verb].ok(ent.it)) this.run(ui.verb, ent.ref, ent.it); }
        else { this.ui = { view: ui.view, item: { ref: ent.ref, it: ent.it } }; this.render(); }
        return true;
      }
    }
    if (!ui.verb && KEY_TO_VERB[k]) {
      const v = KEY_TO_VERB[k];
      if (v === 'takeoff') { this.ui = { view: 'equip', verb: v }; this.render(); }
      else this.open(ui.view === 'equip' && v === 'inspect' ? 'equip' : 'pack', v);
      return true;
    }
    return true; // swallow everything else while a menu is open
  }
  /** Shortcut keys while no menu is open. W, A, S, D walk, so wear and drop live inside the inventory. */
  handleClosedKey(k) {
    if (k === 'i') { this.open('pack'); return true; }
    if (k === 'C') { this.openSheet(); return true; }
    if (k === 'e') { this.open('equip'); return true; }
    if (k === 'g') { this.network.command('pickup'); return true; }
    if (['q', 'r', 't', 'I', 'k'].includes(k)) { const v = KEY_TO_VERB[k]; this.open(v === 'takeoff' ? 'equip' : 'pack', v); return true; }
    return false;
  }

  // ------------------------------------------------------------------ drawing
  /** Re-render when new state arrives (counts change), but not over an item menu or description. */
  refresh() { if (this.ui && !this.ui.inspect && !this.ui.item) this.render(); }

  /** An item's name, coloured by rarity, with its level when you are too low for it. */
  itemLabel(it) {
    const me = this.getMe();
    const cls = it.rarity === 'mythic' ? (/cursed/i.test(it.desc) ? 'cursed' : 'myth') : it.rarity === 'enchanted' ? 'ench' : '';
    const name = cls ? `<span class="${cls}">${escapeHtml(it.name)}</span>` : escapeHtml(it.name);
    const need = it.lvl && me && me.lv < it.lvl ? ` <span class="need">(needs Lv ${it.lvl})</span>` : '';
    return name + need;
  }

  render() {
    const el = this.el, ui = this.ui;
    if (!ui) { el.hidden = true; this.setHtml(''); return; }
    el.hidden = false;
    if (ui.inspect) return this.renderInspect(ui.inspect);
    if (ui.sheet) return this.renderSheet();
    if (ui.item) return this.renderItemMenu(ui.item);
    const me = this.getMe();
    const title = ui.verb ? VERBS[ui.verb].prompt : ui.view === 'pack' ? `Inventory (${me ? me.pack.length : 0}/12)` : 'Equipment';
    const rows = this.entries(ui.view).map(e => {
      const usable = !ui.verb || (e.it && VERBS[ui.verb].ok(e.it));
      const label = e.it ? this.itemLabel(e.it) : '<span class="dim">(nothing)</span>';
      const slot = ui.view === 'equip' ? `<span class="slot">${SLOT_NAMES[e.slot].padEnd(7, ' ')}:</span> ` : '';
      return `<div class="row ${usable ? '' : 'dim'}"${e.it && usable ? ` data-k="${e.key}"` : ''}><span class="mk">${e.key})</span> ${slot}${label}</div>`;
    });
    if (!rows.length) rows.push('<div class="dim">(your pack is empty)</div>');
    if (this.touchMode) {
      // Tabs to switch between the pack and the equipment list.
      const tabs = ui.verb ? '' : this.touchTabs(ui.view);
      const help = ui.verb ? 'Tap an item' : 'Tap an item for what you can do with it';
      this.setHtml(this.touchHead(title, false) + tabs + rows.join('') + `<div class="mf">${help}</div>`);
      return;
    }
    const help = ui.verb ? 'Pick a letter · / switch list · ESC cancel'
      : ui.view === 'pack' ? 'letter: item menu · w wear · d drop · q quaff · r read · I inspect · k destroy · e equipment · C stats · ESC'
      : 'letter: item menu · t take off · I inspect · i inventory · C stats · ESC';
    this.setHtml(`<div class="mh">${title}</div>${rows.join('')}<div class="mf">${help}</div>`);
  }
  renderItemMenu({ ref, it }) {
    const verbs = this.verbsFor(ref, it).map(v => `<div class="row" data-k="${VERBS[v].key}"><span class="mk">${VERBS[v].key})</span> ${VERBS[v].label}</div>`).join('');
    if (this.touchMode) { this.setHtml(this.touchHead(escapeHtml(cap(it.name)), true) + verbs); return; }
    this.setHtml(`<div class="mh">${escapeHtml(cap(it.name))}:</div>` + verbs + `<div class="mf">ESC to go back</div>`);
  }
  renderInspect(it) {
    const how = it.type === 'gear' ? `It is worn on the ${SLOT_NAMES[it.slot].toLowerCase()} slot.` : it.type === 'potion' ? 'Quaff it with q.' : 'Read it with r.';
    const body = `<p>${escapeHtml(it.desc)}</p>`;
    if (this.touchMode) { this.setHtml(this.touchHead(escapeHtml(cap(it.name)), false) + body + `<div class="row" data-k="close">OK</div>`); return; }
    this.setHtml(`<div class="mh">${escapeHtml(cap(it.name))}</div>${body}<p class="dim">${how}</p><div class="mf">(press any key)</div>`);
  }
  touchTabs(view) {
    const tab = (k, label, on) => `<span class="tab${on ? ' on' : ''}" data-k="${k}">${label}</span>`;
    return `<div class="tabs">${tab('i', 'Pack', view === 'pack')}${tab('e', 'Equipment', view === 'equip')}${tab('C', 'Stats', view === 'sheet')}</div>`;
  }
  /** Character sheet: everything your level and gear add up to. */
  renderSheet() {
    const me = this.getMe();
    if (!me) return this.close();
    const st = me.stats || {};
    const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    const rows = [
      row('Level', me.lv + (me.xpNext ? ` (XP ${me.xp} / ${me.xpNext})` : ' (max)')),
      row('HP', `${me.hp} / ${me.maxHp}`),
      row('Armor', `${st.armor} (blocks ${st.cut}% of each hit)`),
      row('Speed', `${st.speed}%`),
      row('Luck', st.luck),
    ];
    const extra = [];
    if (st.letters !== 8) extra.push(row('Spell length', `${st.letters} letters`));
    if (st.haste) extra.push(row('Spell speed', `+${st.haste}%`));
    if (st.reach) extra.push(row('Spell reach', `+${st.reach}%`));
    if (st.stagger) extra.push(row('Stagger', `${st.stagger} s`));
    if (st.echo) extra.push(row('Echo', `${st.echo}%`));
    if (st.wordHeal) extra.push(row('Heal per word', `${st.wordHeal} HP`));
    if (st.blocks) extra.push(row('Shield blocks', st.blocks.split('').join(' ')));
    const body = `<table class="sheet">${rows.join('')}</table>` + (extra.length ? `<div class="mh" style="margin-top:6px">From your gear</div><table class="sheet">${extra.join('')}</table>` : '');
    if (this.touchMode) { this.setHtml(this.touchHead(escapeHtml(me.name), false) + this.touchTabs('sheet') + body); return; }
    this.setHtml(`<div class="mh">${escapeHtml(me.name)}, level ${me.lv} caster</div>${body}<div class="mf">i inventory · e equipment · any other key closes</div>`);
  }
  /** Only touch the DOM when the menu really changed, so a row is never swapped out under a finger. */
  setHtml(html) { if (html !== this.lastHtml) { this.el.innerHTML = html; this.lastHtml = html; } }
  /** Title bar with a back arrow (item menus) and a close button, for touch screens. */
  touchHead(title, back) {
    return `<div class="mh th">${back ? '<span class="tb" data-k="Escape">‹</span>' : ''}<span class="tt">${title}</span><span class="tb" data-k="close">✕</span></div>`;
  }
}
