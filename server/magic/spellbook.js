// Every effect spell in one table.
//
// An effect spell is cast by tapping the rune ..-- (drawn as a glowing star) first, then the spell's word, then a
// direction: ✦ IGNIS + Numpad 6 throws a fire orb to the right. Without the rune the same letters are an ordinary
// letter spell, so an enemy called IGNIS is still just spelled. Only effect spells cost mana.
//
// id:     the spell's key. Saves and spellbooks use it, so a spell can be renamed by changing `word` alone.
// word:   what you spell after the rune (Latin and Greek flavoured, kept short: every letter is Morse time).
// school: 'elements', 'summons', 'control' or 'utility' (grimoire tabs and book colours).
// level:  the caster level it needs. A book can be studied earlier, but the spell only works from this level.
// mana:   cost. cd: cooldown in seconds.
// book:   what a spellbook of it is called ("a Spellbook of Embers"); it does not give the word away.
// desc:   what it does in the dungeon. duel: how it differs in the duel arena (if it does).
//
// The effects themselves live in casts/*.js, one function per id.

export const RUNE = '*';        // how the rune travels in typed text and cast words
export const RUNE_MORSE = '..--';

export const SCHOOLS = {
  elements: { name: 'Elements', color: '#ff8a65' },
  summons:  { name: 'Summons',  color: '#aed581' },
  control:  { name: 'Control',  color: '#4fc3f7' },
  utility:  { name: 'Utility',  color: '#ce93d8' },
};

const S = (id, word, school, level, mana, cd, book, desc, duel = '') => ({ id, word, school, level, mana, cd, book, desc, duel });

export const SPELLS = [
  // ---------------------------------------------------------------- elements
  S('fire',    'IGNIS',  'elements', 1,  12, 5,  'Embers',          'Throws a fire orb. Where it lands the floor burns for 5 s: every enemy standing in the flames loses a letter each second.', 'Burns for 3 HP every half second while your foe stands in it.'),
  S('ice',     'GELU',   'elements', 1,  10, 6,  'Frost',           'Freezes a patch of floor for 6 s. Enemies on the ice walk and shoot at a crawl, and enemy letters flying over it slow down.', 'Your foe slows to a crawl on the ice, and so do their spells.'),
  S('bolt',    'FULGUR', 'elements', 5,  16, 6,  'Storms',          'A very fast bolt. It takes a letter from the enemy it hits, then jumps to two more enemies nearby and takes a letter from each.', 'Hits for 8 and stuns for a moment.'),
  S('quake',   'TREMOR', 'elements', 10, 22, 10, 'the Deep Earth',  'The ground shakes in a wide cone in front of you: every enemy in it loses a letter and is stunned for 2 s.', 'Hits for 6 and stuns your foe for 1 s (no walking, no casting).'),
  S('meteor',  'ASTRUM', 'elements', 18, 35, 14, 'Falling Stars',   'Calls a star down on the spot you aim at. A shadow grows there for 1.6 s, then it strikes: three letters off every enemy under it, and the floor burns.', 'Hits for 20 if your foe is still under the shadow when it lands.'),
  S('acid',    'ROBIGO', 'elements', 8,  18, 9,  'Rust',            'A pool of acid for 7 s. Enemies in it are corroded: every correct hit on them takes one extra letter.', 'Corroded casters take 50% more damage from everything.'),
  S('nova',    'ORBIS',  'elements', 8,  20, 9,  'Rings',           'A ring of light bursts out around you: enemies within 3 tiles lose a letter and are thrown back, and enemy letters in the ring are wiped away.', 'Hits for 6, pushes your foe away and wipes out their spells near you.'),
  S('beam',    'RADIUS', 'elements', 12, 24, 9,  'the Sun',         'A thin line shows where it goes, then a beam burns straight through: every enemy on the line loses two letters. It stops at walls.', 'Hits for 14 if your foe is still on the line.'),
  S('thorn',   'SPINA',  'elements', 2,  8,  4,  'Thorns',          'Plants a hidden spike trap where the orb lands (up to three). The first enemy to step on it loses a letter and is stuck for 2.5 s.', 'Your foe sees it only as a faint glint. Hits for 6 and roots for 1.5 s.'),
  S('poison',  'MIASMA', 'elements', 6,  16, 10, 'Miasma',          'A poison cloud for 8 s. Enemies inside lose a letter every 2 seconds.', '2 HP every half second inside the cloud.'),
  S('storm',   'NIMBUS', 'elements', 20, 30, 14, 'Thunderheads',    'A storm cloud over the spot you aim at for 6 s: lightning strikes enemies under it again and again, a letter each time.', 'Each strike flashes on the ground a moment before it lands: step away. 6 per strike.'),
  S('lava',    'MAGMA',  'elements', 20, 30, 14, 'the Forge',       'A river of lava flows out in front of you for 8 s. Enemies on it lose a letter every 0.8 s.', '4 HP every half second on the lava.'),
  S('shard',   'GRANDO', 'elements', 5,  14, 6,  'Hail',            'Five ice shards in a fan. Each takes a letter from the enemy it hits and slows it.', '4 per shard, and each one slows.'),
  S('void',    'CHAOS',  'elements', 22, 34, 16, 'the Void',        'Opens a black hole where it lands for 3 s. It drags enemies and their letters in, swallows the letters, then collapses: two letters off everything near its heart.', 'Drags your foe in; 14 if they are near the middle when it collapses.'),

  // ---------------------------------------------------------------- summons
  S('imp',     'DAEMON', 'summons',  3,  14, 10, 'Imps',            'Two imps hunt the nearest enemies for 15 s and bite: a letter per bite, two bites each.', 'Each imp carries a one-letter name: your foe can spell it away.'),
  S('wolf',    'LUPUS',  'summons',  7,  20, 18, 'the Pack',        'A wolf runs beside you for 25 s and bites enemies within 5 tiles. It soaks up enemy letters aimed at it (6 of them).', 'Bites for 5. It has a three-letter name.'),
  S('bat',     'VESPER', 'summons',  7,  16, 14, 'Night Wings',     'Four bats circle you for 14 s. Each one snaps up an enemy letter that flies close, then is gone.', 'They eat your foe\'s spells, whole words too.'),
  S('skull',   'CALVA',  'summons',  12, 22, 16, 'Bones',           'A floating skull turret for 15 s. It spits the right letter at the nearest enemy every 1.4 s.', 'Spits easy letters at your foe; they can be blocked.'),
  S('golem',   'TALOS',  'summons',  18, 30, 22, 'Bronze',          'A bronze golem walks toward the enemies for 20 s. Enemies near it attack it instead of you, and it soaks up 12 letters.', 'It walks between you and your foe and swallows their spells.'),
  S('spider',  'ARANEA', 'summons',  10, 20, 16, 'Webs',            'A spider follows you for 20 s and shoots webs: the enemy it hits cannot move for 2 s.', 'Its web roots your foe for 1.2 s.'),
  S('ghost',   'LARVA',  'summons',  11, 18, 14, 'Haunting',        'A ghost glides through walls to the nearest enemy. When it touches it, the enemy panics: it runs away and does not shoot for 4 s.', 'Its touch makes your foe drop the spell they were typing.'),
  S('totem',   'IDOLUM', 'summons',  3,  16, 20, 'Idols',           'A healing totem for 12 s. You and your teammates within 3 tiles get 1 HP back every 0.8 s.', 'Heals you; your foe can spell its name to smash it.'),
  S('decoy',   'IMAGO',  'summons',  6,  14, 14, 'Masks',           'A copy of you walks off the way you aimed for 8 s. Enemies shoot at it instead; it pops after three letters.', 'Your foe\'s spells home on the copy. It even shows what you type.'),
  S('swarm',   'EXAMEN', 'summons',  15, 24, 16, 'the Hive',        'Seven tiny spirits zip out to the nearest enemies. Each one takes a letter and fades.', '2 per spirit.'),
  S('drake',   'DRACO',  'summons',  24, 36, 24, 'Dragons',         'A small drake flies with you for 20 s, over walls, and breathes fire on enemies: a letter off each one in its breath, and the floor burns.', 'Its breath hits for 8; it rears up a moment before.'),

  // ---------------------------------------------------------------- control
  S('wall',    'MURUS',  'control',  3,  12, 9,  'Walls',           'Raises a wall of rune stones, five tiles wide, two tiles in front of you, for 6 s. Nothing walks or flies through it.'),
  S('pull',    'TRAHO',  'control',  6,  12, 8,  'Hooks',           'An orb that yanks the enemy it hits right in front of you. Bosses are only staggered.'),
  S('push',    'PELLO',  'control',  2,  10, 7,  'Gales',           'A gust in front of you throws enemies 3 tiles back and turns their letters around.', 'Throws your foe back and turns their spells around.'),
  S('root',    'RADIX',  'control',  3,  10, 8,  'Roots',           'An orb that roots the enemy it hits for 3 s.', 'Roots for 1.8 s.'),
  S('fog',     'NEBULA', 'control',  6,  14, 14, 'Mists',           'A fog bank around you for 10 s. Enemies cannot see anyone inside it.', 'While you stand in it your foe cannot see you or what you type.'),
  S('slow',    'TARDUS', 'control',  5,  12, 9,  'the Sloth',       'An orb that slows the enemy it hits for 5 s: it walks and shoots at half speed and its letters crawl.', 'Your foe walks at half speed and their spells crawl for 4 s.'),
  S('silence', 'TACE',   'control',  12, 18, 14, 'Hushes',          'An orb that silences the enemy it hits: no letters for 5 s.', 'Your foe cannot cast anything for 2.5 s.'),
  S('swap',    'MUTO',   'control',  11, 14, 10, 'Changes',         'An orb: you and the enemy it hits swap places.'),
  S('cage',    'CAVEA',  'control',  14, 22, 16, 'Cages',           'An orb that drops a cage of rune stones around the enemy it hits for 4 s.'),
  S('gravity', 'PONDUS', 'control',  20, 26, 16, 'Weight',          'A gravity well where the orb lands, for 6 s. Enemy letters that come near curve into it and are crushed.', 'It eats your foe\'s spells.'),
  S('scramble','MISCEO', 'control',  13, 14, 10, 'Confusion',       'An orb that confuses the enemy it hits for 4 s: it stumbles about and its letters fly every which way.', 'Shuffles the spell your foe is typing, and their walking is reversed for 1.5 s.'),

  // ---------------------------------------------------------------- utility
  S('mirror',  'AEGIS',  'utility',  10, 16, 12, 'Mirrors',         'For 5 s the next enemy letter that would hit you bounces back and takes a letter from whoever threw it.', 'Your foe\'s next spell (an effect spell too) flies back at them.'),
  S('echo',    'ITERUM', 'utility',  22, 10, 12, 'Echoes',          'Casts your last effect spell again, cooldown or not, for 10 mana plus half of its cost.'),
  S('light',   'LUX',    'utility',  1,  6,  8,  'Lanterns',        'A bright light follows you for 25 s. It shows hidden spellbooks, traps, invisible and fogged casters near you.'),
  S('invis',   'UMBRA',  'utility',  12, 18, 16, 'Shadows',         'You turn invisible for 5 s: enemies cannot see you. Casting anything ends it.', 'Your foe sees only a shimmer, not what you type, and their spells do not home on you.'),
  S('drain',   'HAURIO', 'utility',  8,  16, 9,  'Thirst',          'An orb that takes two letters from the enemy it hits and heals you 3 HP for each.', 'Hits for 8 and heals you 8.'),
  S('portal',  'IANUA',  'utility',  14, 20, 14, 'Doors',           'Opens two linked portals for 12 s: one at your feet, one up to 8 tiles the way you aim. Casters, enemies and spells that step in come out of the other.'),
  S('clone',   'GEMINI', 'utility',  25, 28, 18, 'Twins',           'Your next three spells within 12 s are cast twice. The twin of an effect spell costs nothing.'),
  S('revive',  'ANIMA',  'utility',  5,  30, 30, 'Souls',           'Wakes every downed teammate within 6 tiles at 40% HP. With nobody down, it heals you and your teammates nearby for 25%.', 'Heals you 12.'),
];

export const SPELL_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));
export const SPELL_BY_WORD = Object.fromEntries(SPELLS.map(s => [s.word, s]));
export const MAX_WORD = Math.max(...SPELLS.map(s => s.word.length));

/** What the client needs to show the grimoire. */
export function catalog() {
  return SPELLS.map(({ id, word, school, level, mana, cd, book, desc, duel }) => ({ id, word, school, level, mana, cd, book, desc, duel }));
}
