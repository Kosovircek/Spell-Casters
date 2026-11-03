// Item definitions and helpers (Angband-style: potions are quaffed, scrolls read, gear wielded in slots).
export const SLOTS = ['weapon', 'ring', 'neck', 'head', 'body', 'cloak', 'feet'];
export const SLOT_LABEL = { weapon: 'Staff', ring: 'Ring', neck: 'Amulet', head: 'Head', body: 'Body', cloak: 'Cloak', feet: 'Feet' };
export const PACK_SIZE = 12; // inventory letters a) to l)

// weight = how often a chest drops it. {L} is replaced by the item's letter.
export const DEFS = {
  pot_heal:     { type: 'potion', weight: 5, name: 'Potion of Healing', desc: 'Heals 2 hearts.' },
  pot_speed:    { type: 'potion', weight: 4, name: 'Potion of Speed', desc: 'You run 50% faster for 30 seconds.' },
  pot_ward:     { type: 'potion', weight: 3, name: 'Potion of Warding', desc: 'A shimmering bubble absorbs the next 2 hits.' },
  scr_slow:     { type: 'scroll', weight: 3, name: 'Scroll of Slow Time', desc: 'Every enemy spell on the floor crawls at 40% speed for 15 seconds.' },
  scr_tele:     { type: 'scroll', weight: 3, name: 'Scroll of Teleportation', desc: 'Teleports you to a random room on this floor. Handy for escaping.' },
  scr_life:     { type: 'scroll', weight: 1, name: 'Scroll of Resurrection', desc: 'Revives every downed teammate at your side and heals the whole party 1 heart.' },
  staff_fork:   { type: 'gear', slot: 'weapon', weight: 1, name: 'Staff of Forking', desc: 'Every third spell you cast splits into three, and each part finds its own target.' },
  staff_haste:  { type: 'gear', slot: 'weapon', weight: 2, name: 'Staff of Haste', desc: 'Your spells fly 40% faster.' },
  cloak_ward:   { type: 'gear', slot: 'cloak', weight: 3, letter: true, name: 'Cloak of {L}-Warding', desc: 'Whenever an enemy fires the letter {L} toward you, the cloak casts a {L} counter-spell at it on its own.' },
  robe_vit:     { type: 'gear', slot: 'body', weight: 2, name: 'Robe of Vitality', desc: '+2 maximum hearts while worn.' },
  hat_insight:  { type: 'gear', slot: 'head', weight: 2, name: 'Circlet of Insight', desc: 'Shows the Morse code for the next letter above every enemy and chest. Great for learning.' },
  boots_speed:  { type: 'gear', slot: 'feet', weight: 2, name: 'Boots of Swiftness', desc: 'You walk 25% faster.' },
  ring_reflect: { type: 'gear', slot: 'ring', weight: 2, name: 'Ring of Reflection', desc: 'Each enemy spell that strikes you has a 25% chance to glance off harmlessly.' },
  amulet_regen: { type: 'gear', slot: 'neck', weight: 2, name: 'Amulet of Regeneration', desc: 'You regain 1 heart every 20 seconds.' },
};

let nextItemId = 1;
export function makeItem(kind, pool) {
  const it = { id: 'i' + nextItemId++, kind, n: 1 };
  if (DEFS[kind].letter) it.letter = pool[Math.floor(Math.random() * pool.length)];
  return it;
}
/** Restore an item from a save file with a fresh id (ids restart when the server restarts). */
export function restoreItem(saved) {
  if (!saved || !DEFS[saved.kind]) return null;
  return { ...saved, id: 'i' + nextItemId++, n: Math.max(1, saved.n | 0) };
}
export function rollKind() {
  if (process.env.FORCE_ITEM && DEFS[process.env.FORCE_ITEM]) return process.env.FORCE_ITEM; // for testing
  const total = Object.values(DEFS).reduce((a, d) => a + d.weight, 0);
  let r = Math.random() * total;
  for (const [k, d] of Object.entries(DEFS)) if ((r -= d.weight) < 0) return k;
  return 'pot_heal';
}
export function baseName(it) { return DEFS[it.kind].name.replace(/\{L\}/g, it.letter || '?'); }
// Angband-style naming: "a Potion of Healing", "3 Potions of Healing", "an Amulet of ..."
export function displayName(it) {
  const n = baseName(it);
  if (it.n > 1) return `${it.n} ${n.replace(/^(Potion|Scroll)/, '$1s')}`;
  return (/^[AEIOU]/.test(n) ? 'an ' : 'a ') + n;
}
export function describe(it) { return DEFS[it.kind].desc.replace(/\{L\}/g, it.letter || '?'); }
export function toClient(it) {
  if (!it) return null;
  const d = DEFS[it.kind];
  return { id: it.id, kind: it.kind, type: d.type, slot: d.slot || null, name: displayName(it), desc: describe(it), letter: it.letter || null, n: it.n };
}
// Put an item in a pack, stacking potions and scrolls. Returns false if the pack is full.
export function addToPack(pack, it) {
  if (DEFS[it.kind].type !== 'gear') {
    const same = pack.find(o => o.kind === it.kind);
    if (same) { same.n += it.n; return true; }
  }
  if (pack.length >= PACK_SIZE) return false;
  pack.push(it);
  // Angband keeps the pack sorted: potions, scrolls, then gear
  const order = { potion: 0, scroll: 1, gear: 2 };
  pack.sort((a, b) => order[DEFS[a.kind].type] - order[DEFS[b.kind].type] || baseName(a).localeCompare(baseName(b)));
  return true;
}

