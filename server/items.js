// Item definitions and helpers (Angband-style: potions are quaffed, scrolls read, gear wielded in slots).
//
// Gear comes in three rarities:
//   Common     a material + a base item ("an Iron Helm"), stats only (weapons: one small effect)
//   Enchanted  a common item with one bonus ("an Iron Helm of Vitality")
//   Mythic     a named item from Greek, Norse, Chinese or Japanese myth with a special effect
// Every piece of gear needs a minimum level to wield.
import { pick } from './util.js';

export const SLOTS = ['weapon', 'shield', 'ring', 'neck', 'head', 'body', 'cloak', 'feet'];
export const PACK_SIZE = 12; // inventory letters a) to l)
export const HOME_SIZE = 24; // what your house on the surface can hold

// ------------------------------------------------------------------ materials
// A material sets an item's level and the size of its numbers. Every table below has one value per material.
export const MATERIALS = [
  { name: 'Bronze', level: 1, color: '#cd7f32' },
  { name: 'Iron', level: 5, color: '#9e9e9e' },
  { name: 'Steel', level: 10, color: '#cfd8dc' },
  { name: 'Orichalcum', level: 18, color: '#ffb74d' },
  { name: 'Adamant', level: 25, color: '#80deea' },
];

// ------------------------------------------------------------------ common bases
// stat: which stat the material table feeds. Weapons carry one small effect instead of stats.
export const BASES = {
  wand:   { slot: 'weapon', name: 'Wand',   stat: 'haste',   values: [0.10, 0.20, 0.30, 0.40, 0.50], text: v => `Your spells fly ${pct(v)} faster.` },
  spear:  { slot: 'weapon', name: 'Spear',  stat: 'reach',   values: [0.10, 0.20, 0.30, 0.40, 0.50], text: v => `Your spells travel and home ${pct(v)} farther.` },
  rod:    { slot: 'weapon', name: 'Rod',    stat: 'stagger', values: [0.3, 0.5, 0.7, 0.9, 1.2], text: v => `A correct hit stops that enemy attacking for ${v} s.` },
  staff:  { slot: 'weapon', name: 'Staff',  stat: 'wordHeal', values: [1, 2, 3, 4, 5], text: v => `Finishing a word heals you ${v} HP.` },
  blade:  { slot: 'weapon', name: 'Blade',  stat: 'echo',    values: [0.05, 0.08, 0.12, 0.16, 0.20], text: v => `${pct(v)} chance that a correct letter also removes the next one.` },
  helm:   { slot: 'head',   name: 'Helm',   stat: 'armor',   values: [3, 6, 10, 16, 24] },
  mail:   { slot: 'body',   name: 'Mail',   stat: 'armor',   values: [8, 16, 28, 45, 65] },
  cloak:  { slot: 'cloak',  name: 'Cloak',  stat: 'armor',   values: [2, 4, 7, 11, 16] },
  boots:  { slot: 'feet',   name: 'Boots',  stat: 'armor',   values: [2, 4, 7, 11, 16] },
  shield: { slot: 'shield', name: 'Shield', stat: 'armor',   values: [2, 5, 8, 12, 18], letters: [1, 1, 2, 2, 3] },
  ring:   { slot: 'ring',   name: 'Ring',   stat: 'luck',    values: [1, 2, 3, 4, 6] },
  amulet: { slot: 'neck',   name: 'Amulet', stat: 'hp',      values: [5, 10, 18, 28, 40] },
};

// One optional bonus on a common item ("of Swiftness"). Values per material again.
export const ENCHANTS = {
  swift: { name: 'Swiftness',  stat: 'speed', values: [0.05, 0.08, 0.10, 0.12, 0.15] },
  vit:   { name: 'Vitality',   stat: 'hp',    values: [5, 10, 15, 20, 30] },
  prot:  { name: 'Protection', stat: 'armor', values: [2, 4, 6, 9, 12] },
  luck:  { name: 'Fortune',    stat: 'luck',  values: [1, 2, 2, 3, 4] },
};

// ------------------------------------------------------------------ mythic items
// stats: numbers added to the wearer. fx: special effect keys handled in entities.js / Room.js.
// letters: letters a shield blocks; rollLetters: how many random floor letters it blocks.
// repeat: may drop more than once per saved game (the Eye of Odin is a learning aid).
export const MYTHIC = {
  m_caduceus:  { slot: 'weapon', level: 3,  myth: 'Greek',    name: 'the Caduceus of Hermes', stats: { haste: 0.4, speed: 0.05 }, desc: 'Your spells fly 40% faster.' },
  m_trident:   { slot: 'weapon', level: 8,  myth: 'Greek',    name: 'the Trident of Poseidon', fx: ['fork'], desc: 'Every third spell splits into three, and each part finds its own target.' },
  m_artemis:   { slot: 'weapon', level: 12, myth: 'Greek',    name: 'the Bow of Artemis', stats: { reach: 0.5 }, fx: ['anyAim'], desc: 'Your spells home on a matching enemy in any direction and travel 50% farther.' },
  m_ruyi:      { slot: 'weapon', level: 14, myth: 'Chinese',  name: 'the Ruyi Jingu Bang', stats: { letters: 12 }, desc: "Sun Wukong's staff stretches: your spells can hold 12 letters instead of 8." },
  m_gungnir:   { slot: 'weapon', level: 16, myth: 'Norse',    name: 'Gungnir', fx: ['pierce'], desc: 'After finishing a word, the leftover letters of your spell fly on to the next enemy.' },
  m_mjolnir:   { slot: 'weapon', level: 18, myth: 'Norse',    name: 'Mjolnir', stats: { stagger: 1 }, fx: ['thunderclap'], desc: 'Correct hits stagger for 1 s, and finishing a word sends a thunderclap that stuns enemies within 3 tiles for 2 s.' },
  m_zeus:      { slot: 'weapon', level: 22, myth: 'Greek',    name: 'the Thunderbolt of Zeus', fx: ['chain'], desc: 'Finishing a word arcs lightning to the nearest enemy and removes its next letter.' },
  m_kusanagi:  { slot: 'weapon', level: 24, myth: 'Japanese', name: 'Kusanagi-no-Tsurugi', fx: ['cut'], desc: 'Your spells also cut down every enemy letter they fly through.' },
  m_laevateinn:{ slot: 'weapon', level: 26, myth: 'Norse',    name: 'Laevateinn', fx: ['burn'], desc: 'Correct hits set the enemy burning, and it loses one more letter 2 s later.' },
  m_guanyu:    { slot: 'weapon', level: 28, myth: 'Chinese',  name: 'the Green Dragon Crescent Blade', fx: ['sweep'], desc: 'One spell can hit up to three enemies whose words start with those letters.' },

  m_odin:      { slot: 'head', level: 1,  myth: 'Norse',    name: 'the Eye of Odin', repeat: true, stats: { armor: 3, luck: 3 }, fx: ['insight'], desc: 'The halo: shows the Morse for the next letter above every enemy and chest.' },
  m_headband:  { slot: 'head', level: 6,  myth: 'Chinese',  name: 'the Golden Headband of Sun Wukong', cursed: true, stats: { haste: 0.5, letters: 10, hurtMult: 0.2 }, fx: ['stuck'], desc: "Your spells fly 50% faster and can hold 10 letters. Cursed: you take 20% more damage and can't take it off until the next floor." },
  m_kabuto:    { slot: 'head', level: 10, myth: 'Japanese', name: 'the Kabuto of Hachiman', stats: { armor: 15, hpPct: 0.1 }, desc: 'A war god\'s helmet. Armor 15, +10% max HP.' },
  m_hades:     { slot: 'head', level: 15, myth: 'Greek',    name: 'the Helm of Hades', stats: { armor: 8 }, fx: ['hidden'], desc: 'Enemies more than 5 tiles away cannot see you.' },

  m_fleece:    { slot: 'body', level: 8,  myth: 'Greek',    name: 'the Golden Fleece', stats: { armor: 10 }, fx: ['fleece'], desc: 'Heals 1 HP every 3 s once nothing has hit you for 5 s.' },
  m_nemean:    { slot: 'body', level: 12, myth: 'Greek',    name: 'the Nemean Lion Pelt', stats: { armor: 40 }, fx: ['pelt'], desc: 'The first hit every 10 s does no damage.' },
  m_jade:      { slot: 'body', level: 16, myth: 'Chinese',  name: 'the Robe of the Jade Emperor', stats: { armor: 20, hp: 40 }, desc: 'Armor 20, +40 max HP.' },
  m_aegis:     { slot: 'body', level: 22, myth: 'Greek',    name: 'the Aegis of Athena', stats: { armor: 50 }, fx: ['gaze'], desc: "Medusa's gaze: any enemy that hits you is turned to stone for 2 s." },

  m_norns:     { slot: 'cloak', level: 4,  myth: 'Norse',    name: 'the Mantle of the Norns ({L})', letter: true, stats: { armor: 5 }, fx: ['counter'], desc: 'Whenever an enemy fires the letter {L} toward you, the mantle casts a {L} counter-spell at it on its own.' },
  m_hagoromo:  { slot: 'cloak', level: 10, myth: 'Japanese', name: 'the Hagoromo', stats: { armor: 10 }, fx: ['still'], desc: 'A celestial feather robe: while you stand still you take 30% less damage.' },
  m_freyja:    { slot: 'cloak', level: 18, myth: 'Norse',    name: "Freyja's Falcon Cloak", stats: { speed: 0.15 }, fx: ['moving'], desc: 'While you are moving you take 30% less damage.' },

  m_talaria:   { slot: 'feet', level: 10, myth: 'Greek', name: 'the Talaria', stats: { speed: 0.3, haste: 0.2 }, desc: "Hermes' winged sandals: +30% speed, and your spells fly 20% faster." },
  m_sleipnir:  { slot: 'feet', level: 20, myth: 'Norse', name: 'the Horseshoes of Sleipnir', stats: { speed: 0.4 }, fx: ['trail'], desc: 'Enemy letters that cross your trail slow to half speed.' },

  m_andvaranaut:{ slot: 'ring', level: 5,  myth: 'Norse',    name: 'Andvaranaut', cursed: true, stats: { luck: 5, hpPct: -0.15 }, desc: 'The dwarf\'s cursed ring: +5 Luck, but -15% max HP.' },
  m_draupnir:  { slot: 'ring', level: 10, myth: 'Norse',    name: 'Draupnir', stats: { luck: 2 }, fx: ['draupnir'], desc: 'Every ninth enemy you defeat drops a Potion of Healing.' },
  m_yata:      { slot: 'ring', level: 12, myth: 'Japanese', name: 'the Yata no Kagami', stats: { armor: 5 }, fx: ['reflect'], desc: 'The sacred mirror: 25% of enemy letters glance off you harmlessly.' },
  m_gyges:     { slot: 'ring', level: 16, myth: 'Greek',    name: 'the Ring of Gyges', fx: ['vanish'], desc: 'You turn invisible for 2 s after taking a hit. Enemies cannot aim at you.' },

  m_harmonia:  { slot: 'neck', level: 5,  myth: 'Greek',    name: 'the Necklace of Harmonia', cursed: true, stats: { luck: 3, letters: 10, hpPct: -0.2 }, desc: 'Your spells can hold 10 letters and +3 Luck. Cursed: -20% max HP.' },
  m_magatama:  { slot: 'neck', level: 8,  myth: 'Japanese', name: 'the Magatama of Yasakani', stats: { hp: 15, wordHeal: 2 }, desc: 'Finishing a word heals you 2 HP.' },
  m_brisingamen:{ slot: 'neck', level: 12, myth: 'Norse',   name: 'the Brisingamen', stats: { hp: 25 }, fx: ['regen'], desc: 'Regenerates 2% of your max HP every 5 s.' },
  m_pearl:     { slot: 'neck', level: 24, myth: 'Chinese',  name: 'the Pearl of the Dragon King', stats: { hp: 20 }, fx: ['pearl'], desc: 'Once per floor, a hit that would down you leaves you at 1 HP instead.' },

  m_ajax:      { slot: 'shield', level: 8,  myth: 'Greek',    name: 'the Shield of Ajax', rollLetters: 2, stats: { armor: 20 }, desc: 'A tower shield. Blocks two letters completely.' },
  m_tengu:     { slot: 'shield', level: 12, myth: 'Japanese', name: 'the Tengu Feather Fan', letters: 'TMO', stats: { armor: 5 }, desc: 'Blows away letters made only of dashes.' },
  m_svalinn:   { slot: 'shield', level: 14, myth: 'Norse',    name: 'Svalinn', letters: 'AEIOU', stats: { armor: 10 }, desc: 'The shield that stands before the sun. Blocks every vowel.' },
  m_xuanwu:    { slot: 'shield', level: 16, myth: 'Chinese',  name: 'the Shell of Xuanwu', letters: 'EISH', stats: { armor: 15 }, desc: "The Black Tortoise's shell. Blocks letters made only of dots." },
  m_achilles:  { slot: 'shield', level: 24, myth: 'Greek',    name: 'the Shield of Achilles', letters: 'ETANIM', stats: { armor: 25 }, desc: 'Forged by Hephaestus. Blocks the six floor-1 letters.' },
};

// ------------------------------------------------------------------ potions, scrolls and the circlet
// weight = how often a chest drops it among potions and scrolls (0 = only the shop sells it).
// cost = the shop's price in gold. The Circlet of Insight is a simple learning aid.
// depth = a travel scroll: the party is carried to that floor a few seconds after reading it.
export const CONSUMABLES = {
  pot_heal:  { type: 'potion', weight: 6, cost: 25, name: 'Potion of Healing', desc: 'Heals 30% of your max HP.' },
  pot_speed: { type: 'potion', weight: 3, cost: 40, name: 'Potion of Speed', desc: 'You run 50% faster for 30 seconds.' },
  pot_ward:  { type: 'potion', weight: 3, cost: 40, name: 'Potion of Warding', desc: 'A shimmering bubble absorbs the next 2 hits.' },
  scr_slow:  { type: 'scroll', weight: 3, cost: 50, name: 'Scroll of Slow Time', desc: 'Every enemy spell on the floor crawls at 40% speed for 15 seconds.' },
  scr_tele:  { type: 'scroll', weight: 3, cost: 40, name: 'Scroll of Teleportation', desc: 'Teleports you to a random room on this floor. Handy for escaping.' },
  scr_life:  { type: 'scroll', weight: 1, cost: 200, name: 'Scroll of Resurrection', desc: 'Revives every downed teammate at your side at half HP and heals the whole party 20% of their max HP.' },
  scr_recall:{ type: 'scroll', weight: 1, cost: 125, name: 'Scroll of Recall', travel: true, desc: 'A few seconds after you read it, the whole party is pulled up to the surface. Read on the surface, it takes the party back down to the deepest floor you have reached.' },
  scr_d10:   { type: 'scroll', weight: 0, cost: 400, depth: 10, name: 'Scroll of Descent to Floor 10', travel: true, desc: 'A few seconds after you read it, the whole party sinks straight to floor 10.' },
  scr_d20:   { type: 'scroll', weight: 0, cost: 1000, depth: 20, name: 'Scroll of Descent to Floor 20', travel: true, desc: 'A few seconds after you read it, the whole party sinks straight to floor 20.' },
  scr_d30:   { type: 'scroll', weight: 0, cost: 2000, depth: 30, name: 'Scroll of Descent to Floor 30', travel: true, desc: 'A few seconds after you read it, the whole party sinks straight to floor 30.' },
  scr_d40:   { type: 'scroll', weight: 0, cost: 3500, depth: 40, name: 'Scroll of Descent to Floor 40', travel: true, desc: 'A few seconds after you read it, the whole party sinks straight to floor 40.' },
  scr_d50:   { type: 'scroll', weight: 0, cost: 5000, depth: 50, name: 'Scroll of Descent to Floor 50', travel: true, desc: 'A few seconds after you read it, the whole party sinks straight to floor 50. Only for the bravest.' },
  circlet:   { type: 'gear', slot: 'head', level: 1, cost: 60, name: 'Circlet of Insight', stats: { armor: 1 }, fx: ['insight'], desc: 'Shows the Morse code for the next letter above every enemy and chest. Great for learning.' },
};

// ------------------------------------------------------------------ prices
// What the shop asks for an item. It pays a third of that when you sell it.
const MATERIAL_COST = [40, 120, 300, 700, 1500];
export function itemValue(it) {
  const d = info(it);
  if (!d) return 0;
  if (d.mythic) return 400 + d.level * 80;
  if (d.base) return Math.round(MATERIAL_COST[it.mat] * (it.ench ? 1.6 : 1) * (d.base.slot === 'body' ? 1.5 : 1));
  return d.cost || 10;
}
export const sellPrice = (it) => Math.max(1, Math.floor(itemValue(it) / 3));

const pct = (v) => Math.round(v * 100) + '%';

// ------------------------------------------------------------------ item objects
// An item is plain data so it can be saved:
//   { id, kind, n }                         potion or scroll (n = stack size)
//   { id, kind: 'c_helm', mat, ench? }      common / enchanted gear
//   { id, kind: 'm_svalinn', letter?, letters? }  mythic gear
let nextItemId = 1;
const newItemId = () => 'i' + nextItemId++;

export function makeItem(kind, extra = {}) { return { id: newItemId(), kind, n: 1, ...extra }; }

/** What sort of thing this is: { type, slot, level, ... } merged from its definition. */
export function info(it) {
  if (it.kind.startsWith('c_')) {
    const b = BASES[it.kind.slice(2)];
    return b && { type: 'gear', slot: b.slot, level: MATERIALS[it.mat]?.level ?? 1, base: b };
  }
  if (MYTHIC[it.kind]) return { type: 'gear', ...MYTHIC[it.kind], mythic: true };
  return CONSUMABLES[it.kind] || null;
}
export const isGear = (it) => info(it)?.type === 'gear';

/** Numbers this item adds to its wearer: armor, hp, hpPct, speed, luck, haste, reach, stagger, echo, wordHeal, letters, hurtMult. */
export function itemStats(it) {
  const d = info(it), s = {};
  if (!d || d.type !== 'gear') return s;
  const add = (k, v) => { s[k] = (s[k] || 0) + v; };
  if (d.base) {
    add(d.base.stat, d.base.values[it.mat]);
    if (it.ench) { const e = ENCHANTS[it.ench]; add(e.stat, e.values[it.mat]); }
  }
  for (const [k, v] of Object.entries(d.stats || {})) add(k, v);
  return s;
}
/** Effect keys (see MYTHIC). */
export const itemFx = (it) => info(it)?.fx || [];
/** Letters a shield stops. */
export const blockedLetters = (it) => it.letters || info(it)?.letters || '';

export function baseName(it) {
  const d = info(it);
  if (!d) return 'something strange';
  if (d.base) return `${MATERIALS[it.mat].name} ${d.base.name}` + (it.ench ? ` of ${ENCHANTS[it.ench].name}` : '');
  return d.name.replace(/\{L\}/g, it.letter || '?');
}
// Angband-style naming: "a Potion of Healing", "3 Potions of Healing", "an Iron Helm", "the Aegis of Athena"
export function displayName(it) {
  const n = baseName(it);
  if (it.n > 1) return `${it.n} ${n.replace(/^(Potion|Scroll)/, '$1s')}`;
  if (MYTHIC[it.kind]) return n; // mythic names carry their own article
  if (it.kind === 'c_boots') return 'a pair of ' + n;
  return (/^[AEIOU]/.test(n) ? 'an ' : 'a ') + n;
}

/** Item description for the inspect screen: what it does, its numbers, and its level. */
export function describe(it) {
  const d = info(it);
  if (!d) return '';
  if (d.type !== 'gear') return d.desc;
  const s = itemStats(it), parts = [];
  if (d.base?.text) parts.push(d.base.text(d.base.values[it.mat]));
  if (d.desc) parts.push(d.desc.replace(/\{L\}/g, it.letter || '?'));
  const letters = blockedLetters(it);
  if (letters) parts.push(`Blocks every ${letters.split('').join(', ')} letter that reaches you.`);
  const nums = [];
  if (s.armor) nums.push(`Armor ${s.armor}`);
  if (s.hp) nums.push(`+${s.hp} max HP`);
  if (s.hpPct) nums.push(`${s.hpPct > 0 ? '+' : ''}${pct(s.hpPct)} max HP`);
  if (s.speed) nums.push(`+${pct(s.speed)} speed`);
  if (s.luck) nums.push(`+${s.luck} Luck`);
  if (nums.length) parts.push(nums.join(', ') + '.');
  if (d.cursed) parts.push('It is cursed.');
  parts.push(`Needs level ${d.level}.`);
  return parts.join(' ');
}

export function toClient(it) {
  if (!it) return null;
  const d = info(it);
  return {
    id: it.id, kind: it.kind, type: d.type, slot: d.slot || null, name: displayName(it), desc: describe(it), n: it.n,
    letter: it.letter || null, letters: blockedLetters(it) || null, lvl: d.level || 0,
    rarity: d.mythic ? 'mythic' : it.ench ? 'enchanted' : d.type === 'gear' ? 'common' : null,
    color: itemColor(it), sell: sellPrice(it),
  };
}
export function itemColor(it) {
  const d = info(it);
  if (d?.mythic) return d.cursed ? '#b71c1c' : '#ffd54f';
  if (it.kind.startsWith('c_')) return MATERIALS[it.mat].color;
  return null;
}

// ------------------------------------------------------------------ old saves
// Items from before levelling turn into their closest new version.
const OLD_KINDS = {
  staff_fork: { kind: 'm_trident' }, staff_haste: { kind: 'm_caduceus' }, cloak_ward: { kind: 'm_norns' },
  robe_vit: { kind: 'm_jade' }, hat_insight: { kind: 'circlet' }, ring_reflect: { kind: 'm_yata' },
  amulet_regen: { kind: 'm_brisingamen' }, boots_speed: { kind: 'c_boots', mat: 0, ench: 'swift' },
};
/** Restore an item from a save file with a fresh id (ids restart when the server restarts). */
export function restoreItem(saved) {
  if (!saved) return null;
  const it = { ...saved, ...(OLD_KINDS[saved.kind] || {}), id: newItemId(), n: Math.max(1, saved.n | 0) };
  return info(it) ? it : null;
}

// ------------------------------------------------------------------ loot rolls
/**
 * Roll one chest item for this floor. luck = the opener's Luck. found = mythic kinds already dropped in this game.
 * Items are rolled for about level 2 x floor, sometimes a few levels higher, so there is always something to grow into.
 */
export function rollItem(floor, pool, luck = 0, found = new Set()) {
  if (process.env.FORCE_ITEM) { const forced = forceItem(process.env.FORCE_ITEM, pool); if (forced) return forced; } // for testing
  if (Math.random() < 0.5) return makeItem(rollConsumable());
  const target = 2 * floor + Math.floor(Math.random() * 4);
  // Mythic: rare, more likely with Luck, never above the target level by more than a few
  const mythics = Object.entries(MYTHIC).filter(([k, d]) => d.level <= target + 2 && (d.repeat || !found.has(k)));
  if (mythics.length && Math.random() < 0.06 + luck * 0.01) {
    const [kind] = pick(mythics);
    return mythicItem(kind, pool);
  }
  if (Math.random() < 0.06) return makeItem('circlet');
  let mat = 0;
  for (let k = 0; k < MATERIALS.length; k++) if (MATERIALS[k].level <= target) mat = k;
  const base = pick(Object.keys(BASES));
  const extra = { mat };
  if (BASES[base].letters) extra.letters = rollLetters(pool, BASES[base].letters[mat]);
  if (!BASES[base].slot.match(/weapon/) && Math.random() < 0.3 + luck * 0.02) extra.ench = pick(Object.keys(ENCHANTS));
  return makeItem('c_' + base, extra);
}
function rollConsumable() {
  const entries = Object.entries(CONSUMABLES).filter(([, d]) => d.weight);
  let r = Math.random() * entries.reduce((a, [, d]) => a + d.weight, 0);
  for (const [k, d] of entries) if ((r -= d.weight) < 0) return k;
  return 'pot_heal';
}
function rollLetters(pool, n) {
  const left = [...new Set(pool)];
  let out = '';
  while (out.length < n && left.length) out += left.splice(Math.floor(Math.random() * left.length), 1)[0];
  return out;
}
export function mythicItem(kind, pool) {
  const d = MYTHIC[kind], extra = {};
  if (d.letter) extra.letter = pick(pool);
  if (d.rollLetters) extra.letters = rollLetters(pool, d.rollLetters);
  return makeItem(kind, extra);
}
/** FORCE_ITEM=m_svalinn or FORCE_ITEM=c_helm:2 (material index) for testing. */
function forceItem(spec, pool) {
  const [kind, mat] = spec.split(':');
  if (MYTHIC[kind]) return mythicItem(kind, pool);
  if (CONSUMABLES[kind]) return makeItem(kind);
  if (kind.startsWith('c_') && BASES[kind.slice(2)]) {
    const m = Math.min(4, mat | 0), b = BASES[kind.slice(2)];
    return makeItem(kind, { mat: m, ...(b.letters ? { letters: rollLetters(pool, b.letters[m]) } : {}) });
  }
  return null;
}

// Put an item in a pack (or the house), stacking potions and scrolls. Returns false if it is full.
export function addToPack(pack, it, size = PACK_SIZE) {
  if (!isGear(it)) {
    const same = pack.find(o => o.kind === it.kind);
    if (same) { same.n += it.n; return true; }
  }
  if (pack.length >= size) return false;
  pack.push(it);
  // Angband keeps the pack sorted: potions, scrolls, then gear
  const order = { potion: 0, scroll: 1, gear: 2 };
  pack.sort((a, b) => order[info(a).type] - order[info(b).type] || baseName(a).localeCompare(baseName(b)));
  return true;
}
