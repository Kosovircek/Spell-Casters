// The surface's shop and every caster's house. Walk into a door to open it.
//
//   Shop   buys any item for a third of its price and sells basic potions, scrolls, weapons and armour.
//          Things casters sold that it does not stock itself (better gear, mythic items) go on its shelf,
//          so a teammate (or you, if you change your mind) can buy them back.
//   House  every caster has their own, with room for Items.HOME_SIZE items, kept with their save.
import { letterPool } from './words.js';
import { pick } from './util.js';
import * as Items from './items.js';

const SHELF_SIZE = 12;   // items sold by casters that the shop keeps for sale
export const SHOP_TABS = ['magic', 'weapons', 'armour', 'sell'];

/** What the shop always has (as much as you like). mat = material index (0 Bronze, 1 Iron). */
const STOCK = [
  ...['pot_heal', 'pot_speed', 'pot_ward', 'scr_tele', 'scr_slow', 'scr_life', 'scr_recall', 'scr_d10', 'scr_d20', 'scr_d30', 'scr_d40', 'scr_d50']
    .map(kind => ({ kind })),
  ...['wand', 'spear', 'rod', 'staff', 'blade'].flatMap(b => [0, 1].map(mat => ({ kind: 'c_' + b, mat }))),
  ...['helm', 'mail', 'cloak', 'boots', 'shield'].flatMap(b => [0, 1].map(mat => ({ kind: 'c_' + b, mat }))),
].map(spec => {
  const proto = Items.makeItem(spec.kind, spec.mat !== undefined ? { mat: spec.mat } : {});
  return { ref: 's:' + spec.kind + (spec.mat !== undefined ? ':' + spec.mat : ''), proto };
});

/** Which shop tab an item belongs on. */
function tabOf(it) {
  const d = Items.info(it);
  if (d.type !== 'gear') return 'magic';
  return d.slot === 'weapon' ? 'weapons' : 'armour';
}

export class Shop {
  constructor(room) {
    this.room = room;
    this.shelf = []; // items casters sold, newest first
  }
  toSave() { return this.shelf; }
  restore(saved) { this.shelf = (saved || []).map(Items.restoreItem).filter(Boolean); }

  /** m = { c, kind?, ref?, i? } from the client. Every command needs you standing in the right door. */
  run(pl, m) {
    const kind = m.c === 'enter' ? m.kind : ['buy', 'sell'].includes(m.c) ? 'shop' : 'home';
    if (pl.dead) return;
    if (!this.room.dungeon.doorNear || !this.room.dungeon.doorNear(pl.x, pl.y, kind)) return pl.send({ t: 'store', kind: null });
    if (m.c === 'buy') this.buy(pl, String(m.ref || ''));
    if (m.c === 'sell') this.sell(pl, pl.pack[m.i]);
    if (m.c === 'stash') this.stash(pl, pl.pack[m.i]);
    if (m.c === 'take') this.take(pl, pl.home[m.i]);
    this.send(pl, kind);
  }

  // ------------------------------------------------------------------ shop
  /** Everything for sale: { ref, tab, it, price, note? } (the client shows them by tab). */
  listing() {
    const row = (ref, it, extra = {}) => ({ ref, tab: tabOf(it), it: Items.toClient(it), price: Items.itemValue(it), ...extra });
    return [
      ...STOCK.map(s => row(s.ref, s.proto, s.proto.kind === 'c_shield' ? { note: 'Blocks 1 random common letter' } : {})),
      ...this.shelf.map(it => row('u:' + it.id, it, { used: true })),
    ];
  }
  buy(pl, ref) {
    const row = this.listing().find(r => r.ref === ref);
    if (!row) return pl.tell('That is no longer for sale.');
    if (pl.gold < row.price) return pl.tell(`You need ${row.price} gold for that, and you have ${pl.gold}.`);
    let item;
    if (row.used) item = this.shelf.find(it => 'u:' + it.id === ref);
    else {
      const s = STOCK.find(s => s.ref === ref), b = Items.BASES[s.proto.kind.slice(2)];
      const extra = s.proto.mat !== undefined ? { mat: s.proto.mat } : {};
      if (b && b.letters) extra.letters = pick(letterPool(s.proto.mat + 1)); // a shop shield blocks one common letter
      item = Items.makeItem(s.proto.kind, extra);
    }
    if (!Items.addToPack(pl.pack, item)) return pl.tell('You have no room in your pack.');
    if (row.used) this.shelf = this.shelf.filter(it => it !== item);
    pl.gold -= row.price;
    pl.tell(`You buy ${Items.displayName({ ...item, n: 1 })} for ${row.price} gold.`);
    this.room.emit({ t: 'gold', x: pl.x, y: pl.y, n: -row.price, id: pl.id });
  }
  sell(pl, item) {
    if (!item) return;
    const price = Items.sellPrice(item);
    const one = { ...item, n: 1, id: item.n > 1 ? Items.makeItem(item.kind).id : item.id };
    if (--item.n <= 0) pl.pack.splice(pl.pack.indexOf(item), 1);
    pl.gold += price;
    // Basic stock is endless anyway; anything else waits on the shelf for someone to buy it back.
    if (!STOCK.some(s => s.proto.kind === one.kind && (s.proto.mat === undefined || (s.proto.mat === one.mat && !one.ench)))) {
      this.shelf.unshift(one);
      this.shelf.length = Math.min(this.shelf.length, SHELF_SIZE);
    }
    pl.tell(`You sell ${Items.displayName(one)} for ${price} gold.`);
    this.room.emit({ t: 'gold', x: pl.x, y: pl.y, n: price, id: pl.id });
  }

  // ------------------------------------------------------------------ house
  stash(pl, item) {
    if (!item) return;
    if (!Items.addToPack(pl.home, item, Items.HOME_SIZE)) return pl.tell('Your house is full.');
    pl.pack.splice(pl.pack.indexOf(item), 1);
    pl.tell(`You leave ${Items.displayName(item)} in your house.`);
  }
  take(pl, item) {
    if (!item) return;
    if (!Items.addToPack(pl.pack, item)) return pl.tell('You have no room in your pack.');
    pl.home.splice(pl.home.indexOf(item), 1);
    pl.tell(`You take ${Items.displayName(item)}.`);
  }

  /** The store screen's contents for this caster. Sent when they walk in and after every trade. */
  send(pl, kind) {
    if (kind === 'shop') pl.send({ t: 'store', kind, name: 'Dot & Dash Goods', gold: pl.gold, rows: this.listing() });
    else pl.send({ t: 'store', kind: 'home', name: 'Your house', gold: pl.gold, items: pl.home.map(Items.toClient), size: Items.HOME_SIZE });
  }
}
