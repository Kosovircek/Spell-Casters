// The start screen: pick a name and a room, then enter the dungeon or start a duel.
import { $, escapeHtml } from './constants.js';

function timeAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

export class Lobby {
  /** onPlay(name, roomCode, mode) is called when the player clicks a button or presses Enter. mode is 'duel' or ''. */
  constructor(onPlay) {
    this.onPlay = onPlay;
    const params = new URLSearchParams(location.search);
    $('room').value = params.get('room') || '';
    this.invitedToDuel = params.get('mode') === 'duel'; // a duel invite link: Enter joins the duel
    if (this.invitedToDuel) { $('duel').textContent = 'Join the duel'; $('duel').classList.add('invite'); }
    try { $('name').value = localStorage.getItem('sc-name') || ''; } catch {}
    $('play').onclick = () => this.submit('');
    $('duel').onclick = () => this.submit('duel');
    for (const id of ['name', 'room']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(this.invitedToDuel ? 'duel' : ''); });
    this.showSavedGames();
  }

  /** List saved lobbies; clicking one fills in its room name so you can carry on. */
  async showSavedGames() {
    let saves = [];
    try { saves = await (await fetch('/api/saves')).json(); } catch { return; }
    const el = $('saves');
    if (!saves.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="saves-title">Saved games: click one, then enter the same name as before to get your gear back</div>' +
      saves.map(s => `<button class="save" data-room="${escapeHtml(s.room)}"><b>${escapeHtml(s.room)}</b> · floor ${s.floor} · ${escapeHtml(s.players.join(', ') || 'no players')} · ${timeAgo(s.savedAt)}</button>`).join('');
    for (const b of el.querySelectorAll('button.save')) b.onclick = () => { $('room').value = b.dataset.room; $('name').focus(); };
  }
  submit(mode) {
    const name = $('name').value.trim() || 'Caster';
    const room = ($('room').value.trim() || Math.random().toString(36).slice(2, 7)).toLowerCase().replace(/[^a-z0-9-]/g, '');
    try { localStorage.setItem('sc-name', name); } catch {}
    history.replaceState(null, '', '?room=' + room + (mode === 'duel' ? '&mode=duel' : '')); // the page URL is now the invite link
    this.onPlay(name, room, mode);
  }
}
