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
export const TILES = {
  floor: [0, 1, 2, 3].map(v => floorTile(v, false)),
  stairs: floorTile(0, true),
  wall: [0, 1, 2].map(v => wallTile(v)),
};
