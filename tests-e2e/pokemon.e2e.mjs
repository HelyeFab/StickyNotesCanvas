// The Pokémon layer on the real app, offline: sprites are pre-seeded into
// userData/pokemon-sprites/ (a 1x1 stand-in PNG — no artwork in the repo),
// which is exactly where main.js caches what it downloads.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let app;

before(async () => {
  const files = {};
  for (const n of [25, 133]) files[`pokemon-sprites/${n}.png`] = PNG;
  app = await launch({
    files,
    seed: {
      tweaks: { theme: 'pokemon', font: 'Inter', density: 'cozy', showLinks: true, tilt: false, hideNoteTitles: false, showPartner: true, partner: 133 },
      folders: { root: { id: 'root', name: 'All notes', parent: null, hue: '#888' }, f: { id: 'f', name: 'F', parent: 'root', hue: '#5a82c9' } },
      notes: [
        { id: 'with', folder: 'f', title: 'With', body: 'has a sticker', color: 'yellow', x: 40, y: 40, w: 300, h: 220, z: 1, pinned: true, pokemon: 25 },
        { id: 'without', folder: 'f', title: 'Without', body: 'sticker removed', color: 'blue', x: 420, y: 40, w: 300, h: 220, z: 2, pinned: false, pokemon: 0 },
        { id: 'auto', folder: 'f', title: 'Auto', body: 'never picked one', color: 'green', x: 800, y: 40, w: 300, h: 220, z: 3, pinned: false },
      ],
      links: [], cwd: 'root', view: { x: 0, y: 0, z: 1 }, drawer: false, folderOrder: ['f'],
    },
  });
});
after(async () => { if (app) await app.close(); });

const centre = (sel) => app.evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const loaded = (sel) => app.evaljs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); return !!i && i.complete && i.naturalWidth > 0; })()`);
const savedNotes = () => JSON.parse(fs.readFileSync(path.join(app.userData, 'notes.json'), 'utf8')).notes;

test('a note sticker renders from the sprite cache over sticky-pokemon://', async () => {
  await app.pollUntil(() => loaded('[data-pokemon-sticker="25"] img'), { timeout: 5000, interval: 50, label: 'sticker sprite' });
  assert.equal(await app.evaljs(`document.querySelector('[data-pokemon-sticker="25"] img').src`), 'sticky-pokemon://25.png');
  assert.equal(await app.evaljs(`!!document.querySelector('[data-note-id="without"] [data-pokemon-sticker]')`), false);
});

test('in the Pokémon theme a note that never picked one gets its own; a removed one stays gone', async () => {
  const expected = await app.evaljs(`pokemonForNoteId('auto')`);
  const shown = await app.evaljs(`document.querySelector('[data-note-id="auto"] [data-pokemon-sticker]')?.dataset.pokemonSticker`);
  assert.equal(Number(shown), expected);
  assert.equal(await app.evaljs(`!!document.querySelector('[data-note-id="without"] [data-pokemon-sticker]')`), false);
});

test('the Pokémon theme pins are Poké Balls', async () => {
  // The pinned note's pin button draws the ball instead of the pushpin image.
  const hasBall = await app.evaljs(`!!document.querySelector('[data-note-id="with"] button svg path[fill="#e3350d"]')`);
  assert.equal(hasBall, true);
  assert.equal(await app.evaljs(`!!document.querySelector('[data-note-id="with"] img[src*="pin-filled"]')`), false);
});

test('the partner Pokémon is on the desk and hops when clicked', async () => {
  await app.pollUntil(() => loaded('[data-partner="133"] img'), { timeout: 5000, interval: 50, label: 'partner sprite' });
  const at = await centre('[data-partner="133"] img');
  await app.click(at.x, at.y);
  const mood = await app.pollUntil(async () => {
    const m = await app.evaljs(`document.querySelector('[data-partner]').dataset.partnerMood`);
    return m === 'hop' ? m : null;
  }, { timeout: 2000, interval: 20, label: 'partner to hop' });
  assert.equal(mood, 'hop');
});

test('the partner reacts when a note is deleted', async () => {
  await app.pollUntil(async () => (await app.evaljs(`document.querySelector('[data-partner]').dataset.partnerMood`)) === 'idle' ? true : null,
    { timeout: 3000, interval: 50, label: 'partner back to idle' });
  await app.evaljs(`window.pokemonReact('delete')`);
  const mood = await app.evaljs(`new Promise(r => requestAnimationFrame(() => r(document.querySelector('[data-partner]').dataset.partnerMood)))`);
  assert.equal(mood, 'shake');
});

test('right-click → Add Pokémon… → search → pick saves the sticker on the note', async () => {
  const note = await centre('[data-note-id="without"] .md-body');
  await app.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: note.x, y: note.y, button: 'right', buttons: 2, clickCount: 1 });
  await app.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: note.x, y: note.y, button: 'right', buttons: 2, clickCount: 1 });
  const row = await app.pollUntil(() => app.evaljs(`(() => {
    const b = [...document.querySelectorAll('.ctx-row > button')].find(b => b.textContent.trim() === 'Add Pokémon…');
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`), { timeout: 3000, interval: 50, label: '"Add Pokémon…" menu row' });
  await app.click(row.x, row.y);
  await app.pollUntil(() => app.evaljs(`!!document.querySelector('[data-pokemon-picker] input')`), { timeout: 3000, interval: 50, label: 'picker' });
  await app.type('ぴかちゅう');
  const hit = await app.pollUntil(() => centre('[data-pokemon-picker] [data-pokemon-id="25"]'), { timeout: 3000, interval: 50, label: 'Pikachu in results' });
  await app.click(hit.x, hit.y);
  await app.pollUntil(() => app.evaljs(`!!document.querySelector('[data-note-id="without"] [data-pokemon-sticker="25"]')`),
    { timeout: 3000, interval: 50, label: 'sticker on the note' });
  const saved = await app.pollUntil(() => (savedNotes().find(n => n.id === 'without')?.pokemon === 25 ? true : null),
    { timeout: 5000, interval: 100, label: 'sticker persisted to notes.json' });
  assert.equal(saved, true);
});

test('the sprite protocol refuses numbers outside the Dex without going online', async () => {
  // #9999 is outside the Dex, so main answers 404 without touching the network.
  const ok = await app.evaljs(`new Promise(r => { const i = new Image(); i.onload = () => r('loaded'); i.onerror = () => r('error'); i.src = 'sticky-pokemon://9999.png'; })`);
  assert.equal(ok, 'error');
});
