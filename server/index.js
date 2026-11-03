// Spell Casters server entry point: serves the client, runs the co-op game rooms and saves lobbies.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './config.js';
import { createStaticServer } from './StaticServer.js';
import { GameServer } from './GameServer.js';
import { SaveStore } from './SaveStore.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new SaveStore(process.env.SAVE_DIR || path.join(root, 'saves'));
const httpServer = createStaticServer(path.join(root, 'public'), {
  '/api/saves': () => store.list(), // saved lobbies for the start screen
});
const game = new GameServer(httpServer, store);
httpServer.listen(PORT, () => console.log(`Spell Casters running on http://localhost:${PORT}`));

// Save every lobby before the server stops (Ctrl+C in the terminal, or the host shutting down).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { game.saveAll(); console.log('Saved all lobbies. Bye!'); process.exit(0); });
}
