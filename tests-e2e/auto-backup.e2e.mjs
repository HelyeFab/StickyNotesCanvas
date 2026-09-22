// Automatic backup to a chosen folder: written at startup, on demand from
// Preferences, and at quit — as a "Save backup…"-shaped bundle plus a dated
// history copy on change. The folder is seeded through userData/sync.json,
// which is what "Choose folder…" writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, NOTE, pollUntil } from './harness.mjs';

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const history = (dir) => { try { return fs.readdirSync(path.join(dir, 'history')).sort(); } catch { return []; } };

test('startup writes the bundle and a first history copy; "now" repeats without new history; quit records an edit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-drive-'));
  const app = await launch({ files: { 'sync.json': JSON.stringify({ dir }) } });
  const latest = path.join(dir, 'sticky-notes-backup.json');
  try {
    await pollUntil(() => fs.existsSync(latest), { timeout: 8000, interval: 100, label: 'startup backup' });
    const b = readJSON(latest);
    assert.equal(b.notes.length, 5, 'the seeded notes are in the bundle');
    assert.equal(b.notes.some(n => n.id === NOTE.plain), true);
    assert.equal(history(dir).length, 1, 'first backup adds one dated copy');
    assert.match(history(dir)[0], /^sticky-notes-\d{4}-\d{2}-\d{2}_\d{6}\.json$/);

    // Preferences shows the folder and the last run.
    const prefs = await app.evaljs(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'preferences'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    await app.click(prefs.x, prefs.y);
    // The panel paints once before its status request resolves, so wait for
    // the real value rather than the first non-empty text.
    const shown = await app.pollUntil(() => app.evaljs(`(() => { const t = document.querySelector('[data-auto-backup-dir]')?.textContent; return t === ${JSON.stringify(dir)} ? t : null; })()`), { timeout: 3000, interval: 50, label: 'backup dir in prefs' });
    assert.equal(shown, dir);
    await app.pollUntil(() => app.evaljs(`/Last backup .*\\(start, new history copy\\)/.test(document.querySelector('[data-auto-backup-status]')?.textContent || '') || null`), { timeout: 3000, interval: 50, label: 'status line' });

    // "Back up now" with nothing changed: the latest file is rewritten, no
    // new dated copy.
    const r = await app.evaljs(`window.stickyAPI.autoBackup.now()`);
    assert.equal(r.ok, true);
    assert.equal(r.last.reason, 'manual');
    assert.equal(r.last.changed, false);
    assert.equal(history(dir).length, 1);

    // Edit a note, then quit gracefully: the quit backup carries the edit
    // and adds a second dated copy.
    await app.evaljs(`(async () => { const s = await window.stickyAPI.load(); s.notes[0].body = 'edited before quit'; await window.stickyAPI.save(s); })()`);
    await pollUntil(() => JSON.parse(fs.readFileSync(path.join(app.userData, 'notes.json'), 'utf8')).notes[0].body === 'edited before quit', { timeout: 3000, interval: 50, label: 'edit saved' });
    // Closing the window quits the app the way its × does (window-all-closed
    // → quit → before-quit). The evaluate reply may never arrive over a
    // socket that is closing, so don't wait on it.
    app.evaljs('window.close(); 1').catch(() => {});
    await pollUntil(() => history(dir).length === 2 || null, { timeout: 8000, interval: 100, label: 'quit backup' });
    assert.equal(readJSON(latest).notes[0].body, 'edited before quit');
    const cfg = readJSON(path.join(app.userData, 'sync.json'));
    assert.equal(cfg.last.reason, 'quit');
    assert.equal(cfg.last.ok, true);
  } finally { await app.close(); }
});

test('with no folder chosen nothing is written and Preferences says so', async () => {
  const app = await launch();
  try {
    const st = await app.evaljs(`window.stickyAPI.autoBackup.status()`);
    assert.deepEqual(st, { dir: null, last: null });
    const r = await app.evaljs(`window.stickyAPI.autoBackup.now()`);
    assert.equal(r.ok, false);
    assert.equal(fs.existsSync(path.join(app.userData, 'sync.json')), false, 'a no-op never creates sync.json');
  } finally { await app.close(); }
});
