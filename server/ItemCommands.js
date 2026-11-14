// Angband-style item commands: quaff, read, wield, take off, drop, destroy, pick up.
import { EFFECTS } from './config.js';
import { rnd, pick } from './util.js';
import * as Items from './items.js';
import { makePuzzle, solves } from './magic/books.js';
import { SPELL_BY_ID } from './magic/spellbook.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const COMMANDS = ['quaff', 'read', 'wield', 'takeoff', 'drop', 'destroy', 'pickup', 'solve', 'unstudy'];

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
    if (!item || Items.info(item).type !== 'potion') return pl.tell('You cannot quaff that.');
    this.takeOne(pl, item);
    if (item.kind === 'pot_heal') { const got = pl.heal(pl.maxHp * 0.3); this.room.emit({ t: 'regen', x: pl.x, y: pl.y, n: got }); pl.tell('You feel much better.'); }
    if (item.kind === 'pot_speed') { pl.swiftUntil = Date.now() + EFFECTS.swiftSeconds * 1000; pl.tell('You feel yourself moving faster!'); }
    if (item.kind === 'pot_ward') { pl.ward += 2; pl.tell('A shimmering bubble surrounds you.'); }
    this.used(pl, item);
  }

  read(pl, item) {
    const room = this.room;
    if (item && Items.info(item).type === 'book') return this.study(pl, item);
    if (!item || Items.info(item).type !== 'scroll') return pl.tell('You cannot read that.');
    if (Items.info(item).travel) { // Recall and the descent scrolls carry the reader (only), after a few seconds
      const to = Items.info(item).depth ?? (room.floor > 0 ? 0 : room.maxDepth);
      const why = room.travelProblem(pl, to);
      if (why) return pl.tell(why); // nothing happens, and the scroll is kept
      this.takeOne(pl, item);
      room.startTravel(pl, to);
      return this.used(pl, item);
    }
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
        else o.heal(o.maxHp * 0.2);
      }
      room.say(`${pl.name} reads a Scroll of Resurrection!`, 2);
    }
    this.used(pl, item);
  }

  // ------------------------------------------------------------------ spellbooks
  /** Open a spellbook: its puzzle goes to the reader's screen. A new puzzle every time it is opened. */
  study(pl, item) {
    const d = Items.info(item), sp = SPELL_BY_ID[d.spell];
    if (pl.magic.knows(sp.id)) return pl.tell(`You already know the spell in this book (${sp.word}). You could sell it, or give it to a teammate.`);
    const pz = makePuzzle(sp.id);
    pl.puzzle = { itemId: item.id, spell: sp.id, answers: pz.answers, tries: 0 };
    pl.send({ t: 'puzzle', id: item.id, title: pz.title, kind: pz.kind, lines: pz.lines, code: pz.code || null, school: sp.school });
  }
  /** An answer to the open puzzle. Right: the spell is learned and the book crumbles. */
  solve(pl, _item, m) {
    const pz = pl.puzzle;
    if (!pz) return;
    const item = pl.pack.find(it => it.id === pz.itemId);
    if (!item) { pl.puzzle = null; return pl.send({ t: 'puzzle', id: null }); }
    if (!solves(pz, m.a)) {
      pz.tries++;
      return pl.send({ t: 'puzzleWrong', tries: pz.tries, text: pz.tries >= 3 ? 'The runes swim before your eyes. Close the book and open it again for a new page.' : 'The runes stay dark. That is not it.' });
    }
    const sp = SPELL_BY_ID[pz.spell];
    pl.puzzle = null;
    this.takeOne(pl, item);
    pl.magic.learn(sp.id);
    const ready = pl.level >= sp.level ? `Cast it with the rune ..-- then ${sp.word}, then a direction.` : `You can cast it once you reach level ${sp.level}.`;
    pl.send({ t: 'learned', id: sp.id, word: sp.word, text: ready });
    pl.tell(`The book crumbles to dust. You have learned ${sp.word}! ${ready}`);
    this.room.emit({ t: 'learn', x: pl.x, y: pl.y, c: pl.color, w: sp.word });
  }
  unstudy(pl) { pl.puzzle = null; }

  wield(pl, item, m) {
    if (!item || !Items.isGear(item)) return pl.tell('You cannot wear or wield that.');
    const d = Items.info(item), slot = d.slot, old = pl.equip[slot];
    if (pl.level < d.level) return pl.tell(`You need to be level ${d.level} to use ${Items.displayName(item)}.`);
    if (old && old.stuck) return pl.tell(`${cap(Items.displayName(old))} is cursed and will not come off until the next floor.`);
    const verb = slot === 'weapon' ? 'wielding' : 'wearing';
    pl.pack.splice(m.i, 1);
    pl.equip[slot] = item;
    if (Items.itemFx(item).includes('stuck')) item.stuck = true;
    if (old) Items.addToPack(pl.pack, old);
    pl.refreshStats();
    pl.tell(`You are ${verb} ${Items.displayName(item)}.` + (old ? ` You were ${verb} ${Items.displayName(old)}.` : ''));
  }

  takeoff(pl, _item, m) {
    const old = pl.equip[m.slot];
    if (!old) return pl.tell('You are not wearing anything there.');
    if (old.stuck) return pl.tell(`${cap(Items.displayName(old))} is cursed and will not come off until the next floor.`);
    if (pl.pack.length >= Items.PACK_SIZE) return pl.tell('You have no room for it.');
    pl.equip[m.slot] = null; Items.addToPack(pl.pack, old);
    pl.refreshStats();
    pl.tell(`You take off ${Items.displayName(old)}.`);
  }

  drop(pl, item) {
    if (!item) return;
    const one = { ...item, n: 1, id: item.n > 1 ? Items.makeItem(item.kind).id : item.id };
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
      const idx = pl.pack.findIndex(o => o.kind === f.item.kind && (o === f.item || !Items.isGear(o)));
      pl.tell(`You have ${Items.displayName(pl.pack[idx])} (${String.fromCharCode(97 + idx)}).`);
    }
    room.items = room.items.filter(f => !f.removed);
    room.emit({ t: 'pickup', x: pl.x, y: pl.y });
  }
}
