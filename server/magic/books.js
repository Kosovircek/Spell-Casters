// Spellbook puzzles. Reading a spellbook opens one; solving it teaches the spell (the book crumbles to dust).
// The deeper the spell, the harder the puzzle:
//   morse    the spell's word written in Morse dots and dashes
//   anagram  its letters, shuffled (easy books say how it starts)
//   riddle   a riddle about what the spell does; the answer is a plain word
//   shift    every letter stepped forward in the alphabet by a few places (a Caesar cipher)
//   mirror   the Morse written back to front
import { SPELL_BY_ID } from './spellbook.js';
import { pick } from '../util.js';
export { bookFor } from '../items.js';

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
const morseOf = (w) => [...w].map(c => MORSE[c]).join(' / ');

/** Riddles whose answer is the plain word for what the spell does. Several answers may count. */
const RIDDLES = {
  fire:    ['I eat and eat but am never full. Give me a drink and I die.', ['FIRE', 'FLAME']],
  ice:     ['I am water that stands still and hard. Warm me and I run away.', ['ICE']],
  bolt:    ['I leap from the clouds with a crack, and the thunder follows me.', ['LIGHTNING', 'BOLT']],
  quake:   ['When I wake, towers fall and the ground itself shivers.', ['QUAKE', 'EARTHQUAKE']],
  meteor:  ['A star that falls and never climbs back into the sky.', ['METEOR', 'SHOOTINGSTAR']],
  poison:  ['In a cup I look like wine. One sip and you sleep for ever.', ['POISON']],
  storm:   ['I have a calm eye, yet I howl all around it.', ['STORM', 'HURRICANE']],
  void:    ['The more of me there is, the less you see. I am what is left when all is gone.', ['NOTHING', 'VOID', 'DARKNESS']],
  wolf:    ['I sing to the moon and hunt with my pack.', ['WOLF']],
  bat:     ['I fly by night, see with my ears, and sleep upside down.', ['BAT']],
  spider:  ['I spin without a wheel and weave without a loom.', ['SPIDER']],
  ghost:   ['I walk through walls and haunt old halls, and you cannot touch me.', ['GHOST', 'SPIRIT']],
  mirror:  ['I show you yourself, but I swap your left and your right.', ['MIRROR']],
  echo:    ['I speak only after you have spoken, and only your own last words.', ['ECHO']],
  light:   ['Fill a room with me and it weighs nothing more. The dark runs from me.', ['LIGHT']],
  fog:     ['I can hide a mountain, yet a breeze carries me off.', ['FOG', 'MIST']],
  wall:    ['I keep things in and keep things out, and I never take a step.', ['WALL']],
  invis:   ['I follow you all day, but at noon and at midnight I am gone.', ['SHADOW']],
  portal:  ['I have a handle but no hands. I let you in, and I let you out.', ['DOOR', 'GATE']],
  phase:   ['Light goes through me as if I were not there, yet I am part of the wall.', ['WINDOW', 'GLASS']],
  clone:   ['Two of us, born on one day, as alike as two drops of rain.', ['TWINS', 'TWIN']],
  drain:   ['Taken from your veins, and the heart cannot live without me.', ['BLOOD']],
  slow:    ['I carry my house on my back and never hurry home.', ['SNAIL', 'TORTOISE', 'TURTLE']],
  silence: ['Say my name and I am broken.', ['SILENCE']],
  root:    ['I hold the tree to the ground, and you never see me.', ['ROOT', 'ROOTS']],
  lava:    ['I was stone, and I will be stone again, but now I flow red.', ['LAVA', 'MAGMA']],
  revive:  ['It leaves when you die, and the stories say it can be called back.', ['SOUL', 'LIFE', 'SPIRIT']],
};

const shuffle = (s) => {
  for (let tries = 0; tries < 10; tries++) {
    const a = [...s];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.join('') !== s || s.length < 2) return a.join('');
  }
  return s;
};
const shift = (w, k) => [...w].map(c => String.fromCharCode((c.charCodeAt(0) - 65 + k) % 26 + 65)).join('');
const tier = (level) => (level <= 3 ? 1 : level <= 8 ? 2 : level <= 15 ? 3 : 4);

/** A fresh puzzle for the spell in this book: { kind, title, lines, code?, answers }. */
export function makePuzzle(spellId) {
  const sp = SPELL_BY_ID[spellId], w = sp.word, t = tier(sp.level);
  const kinds = t === 1 ? ['morse', 'anagram'] : t === 2 ? ['morse', 'anagram', 'riddle'] : t === 3 ? ['shift', 'anagram', 'riddle'] : ['shift', 'mirror', 'riddle'];
  let kind = pick(kinds);
  if (kind === 'riddle' && !RIDDLES[spellId]) kind = t >= 3 ? 'shift' : 'anagram';
  const title = `Spellbook of ${sp.book}`;
  if (kind === 'morse') return { kind, title, lines: ['The ink on the first page pulses in dots and dashes. Spell the word it taps out.'], code: morseOf(w), answers: [w] };
  if (kind === 'mirror') return { kind, title, lines: ['The pulses run back to front, as if seen in a mirror. Read them from the last letter to the first.'], code: morseOf([...w].reverse().join('')), answers: [w] };
  if (kind === 'anagram') {
    const lines = ['The runes on the page have been shaken loose. Put them back in order.'];
    if (t <= 2) lines.push(`The word starts with ${w[0]}.`);
    return { kind, title, lines, code: shuffle(w).split('').join(' '), answers: [w] };
  }
  if (kind === 'shift') {
    const k = t === 4 ? pick([2, 3, 4]) : pick([1, 2]);
    return { kind, title, lines: [`Every rune has stepped ${k} place${k > 1 ? 's' : ''} forward in the alphabet (A became ${shift('A', k)}). Step them back.`], code: shift(w, k).split('').join(' '), answers: [w] };
  }
  const [q, answers] = RIDDLES[spellId];
  return { kind, title, lines: ['A riddle is written across the page. Answer it and the spell will show itself.', `"${q}"`], answers };
}

/** Does this answer solve it? Spaces and case do not matter. */
export function solves(puzzle, answer) {
  const a = String(answer || '').toUpperCase().replace(/[^A-Z]/g, '');
  return !!a && puzzle.answers.includes(a);
}
