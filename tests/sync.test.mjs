import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeBackup, loadSyncConfig, saveSyncConfig, listHistory, LATEST_NAME, HISTORY_DIR } from '../sync.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-sync-'));
const store = (notes) => ({ tweaks: { theme: 'paper' }, folders: { root: { id: 'root', name: 'All notes', parent: null } }, notes, links: [] });
const at = (iso) => new Date(iso);
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

test('the first backup writes the latest file and one dated copy', () => {
  const dir = tmpDir();
  const r = writeBackup({ dir, store: store([{ id: 'a', body: 'hi' }]), now: at('2026-09-22T06:05:07') });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(r.path, path.join(dir, LATEST_NAME));
  assert.equal(path.basename(r.historyPath), 'sticky-notes-2026-09-22_060507.json');
  assert.deepEqual(readJSON(r.path).notes, [{ id: 'a', body: 'hi' }]);
  assert.deepEqual(readJSON(r.historyPath), readJSON(r.path));
});

test('a backup of the same state overwrites the latest file but adds no history', () => {
  const dir = tmpDir();
  const s = store([{ id: 'a', body: 'hi' }]);
  writeBackup({ dir, store: s, now: at('2026-09-22T06:00:00') });
  const r = writeBackup({ dir, store: s, now: at('2026-09-22T07:00:00') });
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
  assert.equal(r.historyPath, null);
  assert.equal(listHistory(dir).length, 1);
});

test('a changed state adds a dated copy, and the oldest are pruned past keep', () => {
  const dir = tmpDir();
  for (let i = 0; i < 5; i++) {
    writeBackup({ dir, store: store([{ id: 'a', body: 'v' + i }]), now: at(`2026-09-2${i}T06:00:00`), keep: 3 });
  }
  const h = listHistory(dir);
  assert.deepEqual(h, ['sticky-notes-2026-09-22_060000.json', 'sticky-notes-2026-09-23_060000.json', 'sticky-notes-2026-09-24_060000.json']);
  assert.equal(readJSON(path.join(dir, LATEST_NAME)).notes[0].body, 'v4');
  // The oldest copy still holds the state from before the later edits.
  assert.equal(readJSON(path.join(dir, HISTORY_DIR, h[0])).notes[0].body, 'v2');
});

test('the bundle is the "Save backup…" shape: store keys plus images last, only when there are any', () => {
  const dir = tmpDir();
  const s = store([{ id: 'a', body: '![](sticky-image://abc.png)' }]);
  writeBackup({ dir, store: s, images: { 'abc.png': 'AAAA' }, now: at('2026-09-22T06:00:00') });
  const j = readJSON(path.join(dir, LATEST_NAME));
  assert.deepEqual(Object.keys(j), ['tweaks', 'folders', 'notes', 'links', 'images']);
  assert.deepEqual(j.images, { 'abc.png': 'AAAA' });
  const r = writeBackup({ dir, store: store([{ id: 'b', body: 'no pictures' }]), now: at('2026-09-23T06:00:00') });
  assert.equal('images' in readJSON(r.path), false);
});

test('the image bundle does not count as a change on its own', () => {
  const dir = tmpDir();
  const s = store([{ id: 'a', body: 'x' }]);
  writeBackup({ dir, store: s, images: {}, now: at('2026-09-22T06:00:00') });
  const r = writeBackup({ dir, store: s, images: { 'abc.png': 'AAAA' }, now: at('2026-09-22T07:00:00') });
  assert.equal(r.changed, false);
});

test('a missing folder is created; an unwritable one fails soft', () => {
  const dir = path.join(tmpDir(), 'nested', 'deeper');
  const r = writeBackup({ dir, store: store([]), now: at('2026-09-22T06:00:00') });
  assert.equal(r.ok, true);
  assert.equal(fs.existsSync(path.join(dir, LATEST_NAME)), true);
  const bad = writeBackup({ dir: path.join(os.tmpdir(), 'sticky-sync-file-not-dir-' + Date.now(), 'x'), store: null });
  assert.equal(bad.ok, false);
  const none = writeBackup({ dir: null, store: store([]) });
  assert.equal(none.ok, false);
  assert.match(none.error, /no backup folder/);
});

test('sync.json round-trips and tolerates garbage', () => {
  const file = path.join(tmpDir(), 'sync.json');
  assert.deepEqual(loadSyncConfig(file), {});
  saveSyncConfig(file, { dir: '/tmp/x', keep: 5, last: { at: 't', ok: true } });
  assert.deepEqual(loadSyncConfig(file), { dir: '/tmp/x', keep: 5, last: { at: 't', ok: true } });
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(loadSyncConfig(file), {});
  fs.writeFileSync(file, JSON.stringify({ dir: 42, keep: -1 }));
  assert.deepEqual(loadSyncConfig(file), { dir: null, keep: 30, last: null });
});
