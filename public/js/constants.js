// Client-wide constants.
export { TS, WALL_H } from './art/canvas.js';
export const VIEW_W = 480;   // internal canvas resolution, scaled up with crisp pixels
export const VIEW_H = 270;

/** Numpad aim keys -> screen direction. */
export const AIM_KEYS = { Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0], Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1] };
/** Movement keys -> screen direction. */
export const MOVE_KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
export const MORSE_KEYS = ['Numpad5', 'Space'];

/** Normalise a direction vector (the view is not rotated, so screen = world). */
export function normalize(x, y) { const l = Math.hypot(x, y); return l ? { x: x / l, y: y / l } : { x: 0, y: 0 }; }
/** "·−" style Morse text. */
export const prettyMorse = (code) => code.replace(/\./g, '·').replace(/-/g, '−');
export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const $ = (id) => document.getElementById(id);
