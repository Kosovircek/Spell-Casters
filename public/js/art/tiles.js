// Top-down 3/4 tiles: square floor, walls show their top and front face.
import { TS, WALL_H, makeCanvas, hash, shade } from './canvas.js';

function floorTile(variant, stairs) {
  const c = makeCanvas(TS, TS); const g = c.getContext('2d');
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
    const n = hash(px + variant * 50, py + variant * 31);
    let col = n < 0.12 ? '#2c2740' : n > 0.92 ? '#4a4363' : '#3a3450';
    // stone slabs: two per tile, offset per variant
    const seamX = (px + (py < 8 ? variant * 3 : variant * 3 + 8)) % 16 === 0;
    if (py === 0 || py === 8 || seamX) col = '#2a2538';
    if (py === 1 && !seamX && n > 0.5) col = '#433c5a';
    g.fillStyle = col; g.fillRect(px, py, 1, 1);
  }
  if (stairs) {
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? '#1c1626' : '#0a070f';
      g.fillRect(2 + k, 2 + k * 3, 12 - k * 2, 3);
      g.fillStyle = '#4a4363'; g.fillRect(2 + k, 2 + k * 3, 12 - k * 2, 1);
    }
  }
  return c;
}
function wallTile(variant) {
  const c = makeCanvas(TS, TS + WALL_H); const g = c.getContext('2d');
  // top face
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
    const n = hash(px + variant * 13, py + 99);
    g.fillStyle = n > 0.9 ? '#2f2842' : '#241e32'; // dark top; a light rim is drawn where it meets the floor
    g.fillRect(px, py, 1, 1);
  }
  // front face: bricks
  for (let py = 0; py < WALL_H; py++) for (let px = 0; px < TS; px++) {
    const row = Math.floor(py / 4), brickX = px + (row % 2) * 4;
    let col = '#3a3250';
    if (py % 4 === 3 || brickX % 8 === 0) col = '#241f33';
    else if (py % 4 === 0) col = '#463d60';
    if (hash(px + variant * 7, py) > 0.94) col = shade(col, 1.25);
    if (py === 0) col = '#7d7299';
    g.fillStyle = col; g.fillRect(px, TS + py, 1, 1);
  }
  return c;
}
/** Stairs up: pale steps that climb toward the top of the tile. */
function upStairsTile() {
  const c = floorTile(1, false), g = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const y = 12 - k * 3, w = 12 - k * 2;
    g.fillStyle = '#0b0910'; g.fillRect(2 + k, y, w, 3);
    g.fillStyle = k % 2 ? '#b9aed0' : '#9a8fb0'; g.fillRect(2 + k, y, w, 2);
    g.fillStyle = '#e8e2f4'; g.fillRect(2 + k, y, w, 1);
  }
  return c;
}

// ---- the surface town
/** Ground tiles: grass (with the odd flower) and dirt path. */
function groundTile(kind, variant) {
  const c = makeCanvas(TS, TS); const g = c.getContext('2d');
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
    const n = hash(px + variant * 17 + (kind === 'path' ? 300 : 0), py + variant * 23);
    let col;
    if (kind === 'grass') col = n < 0.15 ? '#2f5629' : n > 0.9 ? '#4f8240' : '#3d6b35';
    else col = n < 0.12 ? '#5e452b' : n > 0.9 ? '#8d6e4a' : '#7a5c3a';
    g.fillStyle = col; g.fillRect(px, py, 1, 1);
  }
  if (kind === 'grass' && variant === 3) { // a few flowers
    g.fillStyle = '#fff59d'; g.fillRect(4, 5, 1, 1); g.fillRect(11, 10, 1, 1);
    g.fillStyle = '#f48fb1'; g.fillRect(8, 12, 1, 1);
  }
  return c;
}
/** A tree: a round, lumpy canopy with a trunk under it. Grass is drawn beneath, so the corners stay open. */
function treeTile(variant) {
  const c = makeCanvas(TS, TS + WALL_H); const g = c.getContext('2d');
  const cx = 7.5 + (variant ? 0.5 : -0.5), cy = 10, r = 8.2;
  g.fillStyle = '#3e2a1a'; g.fillRect(6, 18, 4, 10); g.fillStyle = '#5d4027'; g.fillRect(7, 18, 2, 10); // trunk
  for (let py = 0; py < TS + WALL_H; py++) for (let px = 0; px < TS; px++) {
    const d = Math.hypot(px - cx, (py - cy) * 1.1) + hash(px + variant * 41, py) * 1.2;
    if (d > r) continue;
    const lit = (px - cx) + (py - cy) < -4; // light from the top left
    const n = hash(px + variant * 13, py + 51);
    g.fillStyle = d > r - 1.2 ? '#14290f' : lit ? (n > 0.6 ? '#5f9a4c' : '#4f8240') : py > cy + 3 ? '#24481f' : (n > 0.85 ? '#4f8240' : '#356b2e');
    g.fillRect(px, py, 1, 1);
  }
  return c;
}
/** A building block: a shingled roof on top; the front face is the wall you see (with a window or a door). */
function buildingTile(kind, front) {
  const roof = kind === 'house' ? ['#7b3a2a', '#9c4a33', '#5a2a1f'] : ['#3d4a66', '#506080', '#2a3349'];
  const wall = kind === 'house' ? ['#d7c49e', '#bfa97f', '#5d4027'] : ['#a7a3b8', '#8f8ba3', '#4a4560'];
  const c = makeCanvas(TS, TS + WALL_H); const g = c.getContext('2d');
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) { // roof shingles
    const row = Math.floor(py / 3), sx = (px + (row % 2) * 3) % 6;
    g.fillStyle = py % 3 === 2 ? roof[2] : sx === 0 ? roof[2] : hash(px, py + row) > 0.85 ? roof[1] : roof[0];
    g.fillRect(px, py, 1, 1);
  }
  for (let py = 0; py < WALL_H; py++) for (let px = 0; px < TS; px++) { // the wall
    g.fillStyle = py < 2 ? wall[2] : (hash(px + 5, py + 9) > 0.9 ? wall[1] : wall[0]);
    g.fillRect(px, TS + py, 1, 1);
  }
  g.fillStyle = wall[2]; g.fillRect(0, TS, 1, WALL_H); // timber post between blocks
  if (front === 'window') {
    g.fillStyle = wall[2]; g.fillRect(4, TS + 3, 8, 6);
    g.fillStyle = '#ffd54f'; g.fillRect(5, TS + 4, 6, 4);
    g.fillStyle = '#ffb300'; g.fillRect(8, TS + 4, 1, 4); g.fillRect(5, TS + 6, 6, 1);
  }
  if (front === 'door') {
    g.fillStyle = wall[2]; g.fillRect(4, TS + 1, 8, WALL_H - 1);
    g.fillStyle = kind === 'house' ? '#8d5a2b' : '#6d4c41'; g.fillRect(5, TS + 2, 6, WALL_H - 2);
    g.fillStyle = '#5d4027'; g.fillRect(8, TS + 2, 1, WALL_H - 2);
    g.fillStyle = '#ffd54f'; g.fillRect(9, TS + 7, 1, 1); // the handle
  }
  return c;
}

/**
 * The duel arena: an open-air ring of pale stone. From above you see its rim (crenellated stone) around a
 * sandy fighting floor; the front wall has arches and moon banners, and the gate is a big arch with a raised
 * portcullis and a crescent moon over it.
 * top: 'rim' or 'sand'; front: 'plain', 'arch', 'banner' or 'gate'.
 */
function arenaTile(top, front) {
  const stone = ['#c8bfa8', '#a99f88', '#7a7060', '#e2dac4'];
  const c = makeCanvas(TS, TS + WALL_H); const g = c.getContext('2d');
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
    const n = hash(px + 71, py + (top === 'sand' ? 13 : 37));
    let col;
    if (top === 'sand') col = n < 0.1 ? '#b8975e' : n > 0.92 ? '#e6cc94' : '#d4b67c';
    else {
      const merlon = (Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0; // raised stones in a checker: battlements
      col = merlon ? (n > 0.85 ? stone[3] : stone[0]) : (n > 0.85 ? stone[1] : stone[2]);
      if (merlon && (px % 4 === 0 || py % 4 === 0)) col = stone[3]; // lit top-left edge of each raised stone
    }
    g.fillStyle = col; g.fillRect(px, py, 1, 1);
  }
  // the front wall: big stone blocks
  for (let py = 0; py < WALL_H; py++) for (let px = 0; px < TS; px++) {
    const row = Math.floor(py / 4), bx = px + (row % 2) * 4;
    let col = hash(px + 3, py + 81) > 0.9 ? stone[3] : stone[0];
    if (py % 4 === 3 || bx % 8 === 0) col = stone[2];
    if (py === 0) col = stone[3];
    g.fillStyle = col; g.fillRect(px, TS + py, 1, 1);
  }
  const y0 = TS;
  if (front === 'arch') { // a dark arched opening
    g.fillStyle = stone[2]; g.fillRect(4, y0 + 3, 8, WALL_H - 3); g.fillRect(5, y0 + 2, 6, 1);
    g.fillStyle = '#1a1424'; g.fillRect(5, y0 + 4, 6, WALL_H - 4); g.fillRect(6, y0 + 3, 4, 1);
  }
  if (front === 'banner') { // a purple banner with a gold crescent moon
    g.fillStyle = '#3a2350'; g.fillRect(5, y0 + 1, 6, 9);
    g.fillStyle = '#6a3f8f'; g.fillRect(5, y0 + 1, 6, 8); g.fillRect(6, y0 + 9, 4, 1); g.fillRect(7, y0 + 10, 2, 1);
    g.fillStyle = '#ffd54f'; g.fillRect(7, y0 + 3, 2, 1); g.fillRect(6, y0 + 4, 1, 3); g.fillRect(7, y0 + 7, 2, 1);
    g.fillStyle = '#8b5a2b'; g.fillRect(4, y0, 8, 1); // the pole
  }
  if (front === 'gate') { // a tall arch, the portcullis raised into it
    g.fillStyle = stone[2]; g.fillRect(2, y0, 12, WALL_H); g.fillRect(3, y0 - 1, 10, 1);
    g.fillStyle = '#120d1a'; g.fillRect(3, y0 + 2, 10, WALL_H - 2); g.fillRect(4, y0 + 1, 8, 1);
    g.fillStyle = '#4a4560'; for (let k = 0; k < 5; k++) g.fillRect(4 + k * 2, y0 + 1, 1, 4); // portcullis bars
    g.fillRect(4, y0 + 2, 9, 1); g.fillRect(4, y0 + 4, 9, 1);
    g.fillStyle = '#8f8ba3'; for (let k = 0; k < 5; k++) g.fillRect(4 + k * 2, y0 + 5, 1, 1); // its spikes
    g.fillStyle = '#d4b67c'; g.fillRect(3, y0 + WALL_H - 2, 10, 2); // sand spills out of the gate
    // a gold crescent moon carved over the gate (on the rim above it)
    g.fillStyle = '#ffd54f'; g.fillRect(7, TS - 6, 3, 1); g.fillRect(6, TS - 5, 1, 3); g.fillRect(7, TS - 2, 3, 1);
    g.fillStyle = '#c79100'; g.fillRect(7, TS - 5, 1, 1); g.fillRect(7, TS - 3, 1, 1);
  }
  return c;
}

export const TILES = {
  floor: [0, 1, 2, 3].map(v => floorTile(v, false)),
  stairs: floorTile(0, true),
  upStairs: upStairsTile(),
  wall: [0, 1, 2].map(v => wallTile(v)),
  grass: [0, 1, 2, 3].map(v => groundTile('grass', v)),
  path: [0, 1].map(v => groundTile('path', v)),
  tree: [0, 1].map(v => treeTile(v)),
  house: { plain: buildingTile('house', null), window: buildingTile('house', 'window'), door: buildingTile('house', 'door') },
  shop: { plain: buildingTile('shop', null), window: buildingTile('shop', 'window'), door: buildingTile('shop', 'door') },
  arena: {
    sand: arenaTile('sand', 'plain'),
    rim: { plain: arenaTile('rim', 'plain'), arch: arenaTile('rim', 'arch'), banner: arenaTile('rim', 'banner') },
    gate: arenaTile('rim', 'gate'),
  },
};
