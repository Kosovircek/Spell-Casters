// Saves lobbies as JSON files in saves/<room>.json so a party can stop and carry on later.
import fs from 'node:fs';
import path from 'node:path';

export class SaveStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  file(code) { return path.join(this.dir, code.replace(/[^a-z0-9-]/g, '') + '.json'); }

  load(code) {
    try { return JSON.parse(fs.readFileSync(this.file(code), 'utf8')); }
    catch { return null; } // no save yet (or unreadable): start fresh
  }
  save(code, data) {
    const file = this.file(code), tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file); // write-then-rename so a crash never leaves half a save
  }
  delete(code) { try { fs.unlinkSync(this.file(code)); } catch {} }

  /** Summaries for the lobby screen, newest first. */
  list() {
    const out = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
        const players = Object.values(d.players || {});
        out.push({ room: d.room, deepest: d.maxDepth | 0, players: players.map(p => Number.isFinite(p.floor ?? d.floor) && (p.floor ?? d.floor) > 0 ? `${p.name} (floor ${p.floor ?? d.floor})` : p.name), savedAt: d.savedAt });
      } catch {}
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }
}
