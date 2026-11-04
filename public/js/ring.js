// The ring menu: tap your own caster to open a segmented ring around them.
// Each segment opens a touchable menu (inventory, equipment, potions, scrolls, spells) or acts
// right away (pick up). It is built for touch, but a mouse click on your caster opens it too.
import { $, VIEW_W, TS } from './constants.js';
import { chestSprite, itemSprite } from './art/sprites.js';

const INNER = 30;     // CSS px: hole in the middle, so the caster stays visible
const OUTER = 96;     // CSS px: outer edge of the ring
const GAP = 2.5;      // degrees of empty space between two segments
const SVG_NS = 'http://www.w3.org/2000/svg';

/** game provides: me, network, inventory, renderer, world, myId, itemsHere(). */
const SEGMENTS = [
  { id: 'pickup', label: 'Pick up', icon: () => itemSprite('ring_reflect', 'gear', 'ring'),
    count: g => g.itemsHere().length, run: g => g.network.command('pickup') },
  { id: 'pack', label: 'Pack', icon: () => chestSprite(false, false),
    count: g => g.me?.pack.length || 0, run: g => g.inventory.open('pack') },
  { id: 'wield', label: 'Wield', icon: () => itemSprite('staff_fork', 'gear', 'weapon'),
    count: g => (g.me?.pack || []).filter(it => it.type === 'gear').length, run: g => g.inventory.open('pack', 'wield') },
  { id: 'equip', label: 'Gear', icon: () => itemSprite('robe_vit', 'gear', 'body'),
    count: g => Object.values(g.me?.equip || {}).filter(Boolean).length, run: g => g.inventory.open('equip') },
  { id: 'quaff', label: 'Potions', icon: () => itemSprite('pot_heal', 'potion'),
    count: g => countOf(g.me, 'potion'), run: g => g.inventory.open('pack', 'quaff') },
  { id: 'read', label: 'Scrolls', icon: () => itemSprite('scr_slow', 'scroll'),
    count: g => countOf(g.me, 'scroll'), run: g => g.inventory.open('pack', 'read') },
  { id: 'spells', label: 'Spells', text: '·−',
    count: () => null, run: g => g.inventory.openSpellbook() },
];
const countOf = (me, type) => (me?.pack || []).filter(it => it.type === type).reduce((a, it) => a + (it.n || 1), 0);

export class RingMenu {
  constructor(game) {
    this.game = game;
    this.el = $('ring');
    this.built = false;
    this.el.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-seg]');
      if (!seg) return;
      e.stopPropagation();
      if (seg.dataset.seg === 'close') return this.close();
      this.choose(SEGMENTS.find(s => s.id === seg.dataset.seg));
    });
  }
  get isOpen() { return !this.el.hidden; }

  // ------------------------------------------------------------------ where my caster is on screen
  /** My caster's middle in CSS pixels, plus how many CSS pixels one canvas pixel takes. */
  casterOnScreen() {
    const g = this.game, me = g.world.ready ? g.world.player(g.myId) : null;
    if (!me) return null;
    const rect = g.renderer.canvas.getBoundingClientRect(), scale = rect.width / VIEW_W;
    const p = g.renderer.toScreen(me.x, me.y);
    return { x: rect.left + p.x * scale, y: rect.top + (p.y - 9) * scale, scale }; // the sprite stands ~18px tall
  }
  /** Did a touch at (x, y) land on my caster? The hit area is a bit larger than the sprite for fingers. */
  hitsCaster(x, y) {
    const c = this.casterOnScreen();
    if (!c || this.game.me?.dead) return false;
    return Math.hypot(x - c.x, y - c.y) < Math.max(26, TS * 0.85 * c.scale);
  }

  // ------------------------------------------------------------------ open / close
  open() {
    if (!this.built) this.build();
    this.game.inventory.close();
    this.game.input.stopWalking();
    this.el.hidden = false;
    this.refresh();
    this.place();
  }
  close() { this.el.hidden = true; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  choose(seg) {
    if (!seg || seg.disabled) return;
    this.close();
    seg.run(this.game);
  }

  /** Keep the ring on the caster (called every frame while it is open). */
  place() {
    if (!this.isOpen) return;
    const c = this.casterOnScreen();
    if (!c) return this.close();
    this.el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
  }

  /** Update the counts, and grey out segments that have nothing to act on. */
  refresh() {
    if (!this.isOpen) return;
    for (const s of SEGMENTS) {
      const n = s.count(this.game);
      s.disabled = n === 0;
      s.node.classList.toggle('off', s.disabled);
      s.badge.textContent = n ? String(n) : '';
    }
  }

  // ------------------------------------------------------------------ drawing
  build() {
    this.built = true;
    const size = OUTER * 2 + 4, svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    const step = 360 / SEGMENTS.length;
    SEGMENTS.forEach((s, i) => {
      const a0 = -90 - step / 2 + i * step + GAP / 2, a1 = a0 + step - GAP; // first segment points straight up
      const g = document.createElementNS(SVG_NS, 'g');
      g.dataset.seg = s.id; g.classList.add('seg');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', arcPath(INNER, OUTER, a0, a1));
      g.appendChild(path);
      const mid = (a0 + a1) / 2 * Math.PI / 180, r = (INNER + OUTER) / 2 + 2;
      const cx = Math.cos(mid) * r, cy = Math.sin(mid) * r;
      if (s.icon) {
        const img = document.createElementNS(SVG_NS, 'image'), c = s.icon(), k = 2;
        img.setAttribute('href', c.toDataURL());
        img.setAttribute('width', c.width * k); img.setAttribute('height', c.height * k);
        img.setAttribute('x', cx - c.width * k / 2); img.setAttribute('y', cy - 6 - c.height * k / 2);
        g.appendChild(img);
      } else g.appendChild(text(s.text, cx, cy - 2, 'glyph'));
      g.appendChild(text(s.label, cx, cy + 16, 'lbl'));
      s.badge = text('', cx + 15, cy - 14, 'badge');
      g.appendChild(s.badge);
      s.node = g;
      svg.appendChild(g);
    });
    // Tapping the caster again (the hole in the middle) closes the ring.
    const hole = document.createElementNS(SVG_NS, 'circle');
    hole.setAttribute('r', INNER - 2); hole.dataset.seg = 'close'; hole.classList.add('hole');
    svg.appendChild(hole);
    this.el.appendChild(svg);
  }
}

function text(str, x, y, cls) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('class', cls);
  t.textContent = str;
  return t;
}

/** An annulus slice from angle a0 to a1 (degrees, clockwise from the +x axis). */
function arcPath(r0, r1, a0, a1) {
  const p = (r, a) => `${(Math.cos(a * Math.PI / 180) * r).toFixed(2)} ${(Math.sin(a * Math.PI / 180) * r).toFixed(2)}`;
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}
