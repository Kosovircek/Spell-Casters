// Angband-style item commands: quaff, read, wield, take off, drop, destroy, pick up.
import { EFFECTS } from './config.js';
import { rnd, pick } from './util.js';
import * as Items from './items.js';

const COMMANDS = ['quaff', 'read', 'wield', 'takeoff', 'drop', 'destroy', 'pickup'];

export class ItemCommands {
  constructor(room) {
    this.room = room;
  }

  /** m = { c: command, i: pack index, slot: equipment slot } from the client. */
  run(pl, m) {
    if (pl.dead) return pl.tell('You cannot do that while down.');
    if (!COMMANDS.includes(m.c)) return;
    const item = Number.isInteger(m.i) ? pl.pack[m.i] : null;
    this[m.c](pl, item, m);
  }

  /** Remove one of a stacked item from the pack. */
  takeOne(pl, item) { if (--item.n <= 0) pl.pack.splice(pl.pack.indexOf(item), 1); }
  used(pl, item) { this.room.emit({ t: 'use', x: pl.x, y: pl.y, kind: item.kind, c: pl.color }); }

  quaff(pl, item) {
    if (!item || Items.DEFS[item.kind].type !== 'potion') return pl.tell('You cannot quaff that.');
    this.takeOne(pl, item);
    if (item.kind === 'pot_heal') { pl.heal(2); pl.tell('You feel much better.'); }
    if (item.kind === 'pot_speed') { pl.swiftUntil = Date.now() + EFFECTS.swiftSeconds * 1000; pl.tell('You feel yourself moving faster!'); }
    if (item.kind === 'pot_ward') { pl.ward += 2; pl.tell('A shimmering bubble surrounds you.'); }
    this.used(pl, item);
  }

  read(pl, item) {
    const room = this.room;
    if (!item || Items.DEFS[item.kind].type !== 'scroll') return pl.tell('You cannot read that.');
    this.takeOne(pl, item);
    if (item.kind === 'scr_slow') { room.slowUntil = Date.now() + EFFECTS.slowSeconds * 1000; room.say(`${pl.name} slows time!`, 2); }
    if (item.kind === 'scr_tele') {
      const r = pick(room.dungeon.rooms);
      room.emit({ t: 'tele', x: pl.x, y: pl.y });
      pl.x = rnd(r.x + 1, r.x + r.w - 1); pl.y = rnd(r.y + 1, r.y + r.h - 1);
      pl.tell('You feel yourself yanked sideways!');
    }
    if (item.kind === 'scr_life') {
      for (const o of room.players.values()) {
        if (o.dead) { o.revive(pl.x, pl.y); room.emit({ t: 'revive', x: o.x, y: o.y }); }
        else o.heal(1);
      }
      room.say(`${pl.name} reads a Scroll of Resurrection!`, 2);
    }
    this.used(pl, item);
  }

  wield(pl, item, m) {
    if (!item || Items.DEFS[item.kind].type !== 'gear') return pl.tell('You cannot wear or wield that.');
    const slot = Items.DEFS[item.kind].slot, old = pl.equip[slot];
    const verb = slot === 'weapon' ? 'wielding' : 'wearing';
    pl.pack.splice(m.i, 1);
    pl.equip[slot] = item;
    if (old) Items.addToPack(pl.pack, old);
    pl.refreshMaxHp();
    pl.tell(`You are ${verb} ${Items.displayName(item)}.` + (old ? ` You were ${verb} ${Items.displayName(old)}.` : ''));
  }

  takeoff(pl, _item, m) {
    const old = pl.equip[m.slot];
    if (!old) return pl.tell('You are not wearing anything there.');
    if (pl.pack.length >= Items.PACK_SIZE) return pl.tell('You have no room for it.');
    pl.equip[m.slot] = null; Items.addToPack(pl.pack, old);
    pl.refreshMaxHp();
    pl.tell(`You take off ${Items.displayName(old)}.`);
  }

  drop(pl, item) {
    if (!item) return;
    const one = { ...item, n: 1, id: item.n > 1 ? Items.makeItem(item.kind, 'E').id : item.id };
    this.takeOne(pl, item);
    this.room.dropItem(one, pl.x, pl.y);
    pl.tell(`You drop ${Items.displayName(one)}.`);
  }

  destroy(pl, item) {
    if (!item) return;
    this.takeOne(pl, item);
    pl.tell(`You destroy ${Items.displayName({ ...item, n: 1 })}.`);
  }

  pickup(pl) {
    const room = this.room;
    const here = room.items.filter(f => f.distanceTo(pl) < 0.8);
    if (!here.length) return pl.tell('There is nothing here to pick up.');
    for (const f of here) {
      if (!Items.addToPack(pl.pack, f.item)) { pl.tell('You have no room for ' + Items.displayName(f.item) + '.'); break; }
      f.removed = true;
      const idx = pl.pack.findIndex(o => o.kind === f.item.kind && (o === f.item || Items.DEFS[o.kind].type !== 'gear'));
      pl.tell(`You have ${Items.displayName(pl.pack[idx])} (${String.fromCharCode(97 + idx)}).`);
    }
    room.items = room.items.filter(f => !f.removed);
    room.emit({ t: 'pickup', x: pl.x, y: pl.y });
  }
}
