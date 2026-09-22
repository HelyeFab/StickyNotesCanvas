// Moving a multi-selection into a sidebar folder, both ways the app offers:
// dragging one selected note's header onto a folder row (a subfolder here),
// and the note context menu's "Move N notes to folder ▶" submenu.
// Each test launches its own app so the second never inherits the first's
// note positions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const note = (id, folder, x, y) => ({ id, folder, title: id, body: 'body ' + id, color: 'yellow', x, y, w: 260, h: 160, z: 1, pinned: false });
const seed = (notes) => ({
  tweaks: { theme: 'default', font: 'Inter', density: 'cozy', showLinks: true, tilt: false },
  folders: {
    root: { id: 'root', name: 'All notes', parent: null, hue: '#888' },
    a: { id: 'a', name: 'A', parent: 'root', hue: '#5a82c9' },
    b: { id: 'b', name: 'B', parent: 'root', hue: '#c95a5a' },
    c: { id: 'c', name: 'C', parent: 'b', hue: '#5ac97a' },
  },
  notes, links: [], cwd: 'root', view: { x: 0, y: 0, z: 1 }, drawer: true, folderOrder: ['a', 'b', 'c'],
});

const helpers = (app) => {
  const centre = (sel) => app.evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const header = (id) => centre(`[data-note-id="${id}"] > div:first-child`);
  const ctrlClick = async ({ x, y }) => {
    await app.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers: 2 });
    await app.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers: 2 });
  };
  const rightClick = async ({ x, y }) => {
    await app.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
    await app.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 2, clickCount: 1 });
  };
  const folders = () => Object.fromEntries(JSON.parse(fs.readFileSync(path.join(app.userData, 'notes.json'), 'utf8')).notes.map(n => [n.id, n.folder]));
  const settled = (want) => app.pollUntil(() => {
    const f = folders();
    return Object.entries(want).every(([k, v]) => f[k] === v) ? f : null;
  }, { timeout: 3000, interval: 100, label: 'folders ' + JSON.stringify(want) });
  return { centre, header, ctrlClick, rightClick, settled };
};

test('dragging one note of a selection onto a subfolder row moves the whole selection', async () => {
  const app = await launch({ seed: seed([note('n1', 'a', 40, 40), note('n2', 'a', 340, 40), note('n3', 'a', 40, 260)]) });
  try {
    const { header, ctrlClick, centre, settled } = helpers(app);
    const h1 = await header('n1'), h2 = await header('n2');
    await app.click(h1.x, h1.y);
    await ctrlClick(h2);
    const target = await centre('[data-folder-id="c"]');
    const pts = [h1];
    for (let i = 1; i <= 10; i++) pts.push({ x: Math.round(h1.x + (target.x - h1.x) * i / 10), y: Math.round(h1.y + (target.y - h1.y) * i / 10) });
    await app.drag(pts);
    const f = await settled({ n1: 'c', n2: 'c' });
    assert.equal(f.n3, 'a', 'the unselected note stays put');
  } finally { await app.close(); }
});

test('right-click → "Move 2 notes to folder ▶" moves the whole selection', async () => {
  const app = await launch({ seed: seed([note('n1', 'c', 40, 40), note('n2', 'c', 340, 40), note('n3', 'a', 40, 260)]) });
  try {
    const { header, ctrlClick, rightClick, settled } = helpers(app);
    const h3 = await header('n3'), h2 = await header('n2');
    await app.click(h3.x, h3.y);
    await ctrlClick(h2);
    await rightClick(h3);
    const row = await app.pollUntil(() => app.evaljs(`(() => {
      const b = [...document.querySelectorAll('.ctx-row > button')].find(b => b.textContent.trim().startsWith('Move 2 notes to folder'));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`), { timeout: 2000, interval: 50, label: 'group move row' });
    await app.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.x, y: row.y });
    const item = await app.pollUntil(() => app.evaljs(`(() => {
      const row = [...document.querySelectorAll('.ctx-row')].find(r => r.querySelector(':scope > button')?.textContent.trim().startsWith('Move 2 notes'));
      const b = row && [...row.querySelectorAll('.ctx-sub button')].find(b => b.textContent.trim() === 'B');
      if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    })()`), { timeout: 2000, interval: 50, label: 'submenu B' });
    await app.click(item.x, item.y);
    const f = await settled({ n2: 'b', n3: 'b' });
    assert.equal(f.n1, 'c', 'the unselected note stays put');
    assert.equal(await app.evaljs(`!!document.querySelector('.ctx-row')`), false, 'the menu closes after the move');
  } finally { await app.close(); }
});

test('a folder view shows only its own notes; subfolder notes stay in the subfolder', async () => {
  // n1 lives in c (a subfolder of b); n2 lives in b itself. Opening b must
  // show n2 only, and the sidebar count for b must be 1 — no roll-up, so a
  // note moved into a subfolder can never look like a duplicate in its parent.
  // (The harness waits for every seeded note to render, so start in All
  // notes and open b from the sidebar.)
  const app = await launch({ seed: seed([note('n1', 'c', 40, 40), note('n2', 'b', 340, 40)]) });
  try {
    const b = await helpers(app).centre('[data-folder-id="b"]');
    await app.click(b.x, b.y);
    await app.pollUntil(() => app.evaljs(`!document.querySelector('[data-note-id="n1"]') && !!document.querySelector('[data-note-id="n2"]')`), { timeout: 3000, interval: 50, label: 'only n2 rendered in b' });
    const countB = await app.evaljs(`document.querySelector('[data-folder-id="b"]').textContent`);
    assert.match(countB, /\D1 note\b/, 'sidebar count for b is its own notes only');
    const countC = await app.evaljs(`document.querySelector('[data-folder-id="c"]').textContent`);
    assert.match(countC, /\D1 note\b/);
    // Opening the subfolder shows its note.
    const c = await helpers(app).centre('[data-folder-id="c"]');
    await app.click(c.x, c.y);
    await app.pollUntil(() => app.evaljs(`!!document.querySelector('[data-note-id="n1"]')`), { timeout: 3000, interval: 50, label: 'n1 rendered in c' });
    assert.equal(await app.evaljs(`!!document.querySelector('[data-note-id="n2"]')`), false);
  } finally { await app.close(); }
});
