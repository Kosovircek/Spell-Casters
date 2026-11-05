// The shop and house screens on the surface. Walk into a door to open one; walk away (or Esc) to close it.
// It shares the popup with the inventory, and works like it: a letter picks an item, then y confirms.
//   Shop   tabs: Potions & scrolls, Weapons, Armour (buy) and Sell (your pack, at a third of the price)
//   House  tabs: Your house (take things out) and Your pack (leave things here)
// Keys: a letter picks an item, y or Enter confirms, Tab / ← → / 1-4 switch tabs, Esc goes back or closes.
import { escapeHtml } from './constants.js';

const TABS = {
  shop: [{ id: 'magic', label: 'Potions & scrolls' }, { id: 'weapons', label: 'Weapons' }, { id: 'armour', label: 'Armour' }, { id: 'sell', label: 'Sell' }],
  home: [{ id: 'take', label: 'Your house' }, { id: 'stash', label: 'Your pack' }],
};
const ACTIONS = {
  buy: (r) => `Buy it for ${r.price} gold`,
  sell: (r) => `Sell one for ${r.price} gold`,
  take: () => 'Take it with you',
  stash: () => 'Leave it in your house',
};
const letter = (i) => String.fromCharCode(97 + i);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class StoreMenu {
  /** inventory: the InventoryMenu that shares the popup element (it caches what it last drew there). */
  constructor({ el, network, getMe, inventory, onOpen }) {
    this.el = el;
    this.network = network;
    this.getMe = getMe;
    this.inventory = inventory;
    this.onOpen = onOpen;   // called when a store screen opens (stop walking, close other menus)
    this.touchMode = false;
    this.data = null;       // the server's last 'store' message: { kind, name, rows | items, size }
    this.tab = null;
    this.pick = null;       // the row being looked at, waiting for y
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || !this.isOpen) return;
      e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'close') this.close();
      else if (k.startsWith('tab:')) this.setTab(k.slice(4));
      else this.handleKey({ key: k });
    });
  }
  get isOpen() { return !!this.data; }

  /** A 'store' message from the server: open the screen, or refresh it after a trade. kind null = closed. */
  show(m) {
    if (!m.kind) return this.close();
    const fresh = !this.data || this.data.kind !== m.kind;
    this.data = m;
    this.pick = null;
    if (fresh) { this.tab = TABS[m.kind][0].id; this.onOpen(); }
    this.render(true);
  }
  close() {
    if (!this.data) return;
    this.data = null; this.pick = null;
    this.el.hidden = true; this.el.innerHTML = ''; this.lastHtml = '';
    this.inventory.lastHtml = null;
  }
  setTab(id) { this.tab = id; this.pick = null; this.render(); }

  /** The rows of the current tab: { it, price?, act, arg, note?, used? }. */
  rows() {
    const me = this.getMe(), d = this.data;
    if (!me || !d) return [];
    if (this.tab === 'sell') return me.pack.map((it, i) => ({ it, price: it.sell, act: 'sell', arg: { i } }));
    if (this.tab === 'stash') return me.pack.map((it, i) => ({ it, act: 'stash', arg: { i } }));
    if (this.tab === 'take') return d.items.map((it, i) => ({ it, act: 'take', arg: { i } }));
    return d.rows.filter(r => r.tab === this.tab).map(r => ({ it: r.it, price: r.price, note: r.note, used: r.used, act: 'buy', arg: { ref: r.ref } }));
  }

  // ------------------------------------------------------------------ keys
  handleKey(e) {
    const k = e.key, tabs = TABS[this.data.kind], at = tabs.findIndex(t => t.id === this.tab);
    if (k === 'Escape') { if (this.pick) { this.pick = null; this.render(); } else this.close(); return true; }
    if (this.pick) {
      if (k === 'y' || k === 'Enter') { this.network.command(this.pick.act, this.pick.arg); this.pick = null; this.render(); }
      else if (k === 'n') { this.pick = null; this.render(); }
      return true;
    }
    if (k === 'Tab' || k === '/' || k === 'ArrowRight') { this.setTab(tabs[(at + 1) % tabs.length].id); return true; }
    if (k === 'ArrowLeft') { this.setTab(tabs[(at + tabs.length - 1) % tabs.length].id); return true; }
    if (/^[1-4]$/.test(k) && tabs[+k - 1]) { this.setTab(tabs[+k - 1].id); return true; }
    if (/^[a-z]$/.test(k)) {
      const row = this.rows()[k.charCodeAt(0) - 97];
      if (row) { this.pick = row; this.render(); }
    }
    return true; // swallow everything else while the store is open
  }

  // ------------------------------------------------------------------ drawing
  /** New state arrived (gold, pack): redraw lists, but not over a confirmation. */
  refresh() { if (this.isOpen && !this.pick) this.render(); }

  itemLabel(it) {
    const me = this.getMe();
    const cls = it.rarity === 'mythic' ? (/cursed/i.test(it.desc) ? 'cursed' : 'myth') : it.rarity === 'enchanted' ? 'ench' : '';
    const name = cls ? `<span class="${cls}">${escapeHtml(it.name)}</span>` : escapeHtml(it.name);
    const need = it.lvl && me && me.lv < it.lvl ? ` <span class="need">(needs Lv ${it.lvl})</span>` : '';
    return name + need;
  }

  render(force = false) {
    if (!this.data) return;
    const me = this.getMe(), d = this.data;
    this.el.hidden = false;
    this.inventory.lastHtml = null; // the inventory must redraw the popup next time it opens
    const gold = `<span class="gold">${me ? me.gold : d.gold} gold</span>`;
    const head = this.touchMode
      ? `<div class="mh th">${this.pick ? '<span class="tb" data-k="Escape">‹</span>' : ''}<span class="tt">${escapeHtml(d.name)} · ${gold}</span><span class="tb" data-k="close">✕</span></div>`
      : `<div class="mh">${escapeHtml(d.name)} <span class="dim">·</span> ${gold}</div>`;
    if (this.pick) return this.setHtml(head + this.pickHtml(this.pick), force);
    const tabs = `<div class="tabs">${TABS[d.kind].map((t, i) => `<span class="tab${t.id === this.tab ? ' on' : ''}" data-k="tab:${t.id}">${this.touchMode ? '' : i + 1 + ' '}${t.label}</span>`).join('')}</div>`;
    const rows = this.rows().map((r, i) => {
      const price = r.price !== undefined ? `<span class="price${r.act === 'buy' && me && me.gold < r.price ? ' dear' : ''}">${r.price}</span>` : '';
      return `<div class="row srow" data-k="${letter(i)}"><span><span class="mk">${letter(i)})</span> ${this.itemLabel(r.it)}${r.used ? ' <span class="dim">(sold by a caster)</span>' : ''}</span>${price}</div>`;
    });
    const empty = { take: '(your house is empty)', stash: '(your pack is empty)', sell: '(you have nothing to sell)' }[this.tab] || '(nothing here)';
    if (!rows.length) rows.push(`<div class="dim">${empty}</div>`);
    const count = d.kind === 'home' && this.tab === 'take' ? `<div class="dim">${d.items.length} / ${d.size} spaces used</div>` : '';
    const help = this.touchMode ? 'Tap an item' : 'letter: pick an item · Tab or 1-4: switch tab · ESC: leave';
    this.setHtml(head + tabs + count + rows.join('') + `<div class="mf">${help}</div>`, force);
  }
  pickHtml(r) {
    const it = r.it, lines = [`<p>${escapeHtml(it.desc)}</p>`];
    if (r.note) lines.push(`<p class="dim">${escapeHtml(r.note)}.</p>`);
    const me = this.getMe();
    const short = r.act === 'buy' && me && me.gold < r.price;
    const yes = short ? `<div class="row dim">You need ${r.price} gold.</div>` : `<div class="row" data-k="y"><span class="mk">y)</span> ${ACTIONS[r.act](r)}</div>`;
    return `<div class="mh">${escapeHtml(cap(it.name))}</div>` + lines.join('') + yes + `<div class="row" data-k="n"><span class="mk">n)</span> Back</div>`;
  }
  setHtml(html, force) { if (force || html !== this.lastHtml) { this.el.innerHTML = html; this.lastHtml = html; } }
}
