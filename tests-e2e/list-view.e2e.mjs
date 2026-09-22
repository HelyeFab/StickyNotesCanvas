// The list view: one folded row per note, most recently touched first;
// a row unfolds to the rendered body; "Open on canvas" returns to the desk
// with that note focused; the choice persists in the store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, NOTE } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

const centre = (sel) => app.evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const clickSel = async (sel) => { const c = await centre(sel); assert.ok(c, 'missing ' + sel); await app.click(c.x, c.y); };
const storeLayout = () => JSON.parse(fs.readFileSync(path.join(app.userData, 'notes.json'), 'utf8')).layout;

test('the List toggle replaces the desk with one row per note, newest-touched first', async () => {
  await clickSel('[data-layout="list"]');
  await app.pollUntil(() => app.evaljs(`document.querySelectorAll('[data-list-note]').length === 5 || null`), { timeout: 3000, interval: 50, label: 'list rows' });
  assert.equal(await app.evaljs(`!!document.querySelector('#desk')`), false, 'the desk is gone');
  const heads = await app.evaljs(`[...document.querySelectorAll('[data-list-head]')].map(e => e.textContent)`);
  assert.deepEqual(heads, ['Empty', 'Rich', 'Bad mermaid', 'Other', 'Plain']);
  const rest = await app.evaljs(`document.querySelector('[data-list-note="${NOTE.plain}"] [data-list-rest]').textContent`);
  assert.match(rest, /^alpha bravo charlie delta/);
  // In All notes every row names its folder.
  const chips = await app.evaljs(`[...document.querySelectorAll('[data-list-folder]')].map(e => e.textContent.trim())`);
  assert.deepEqual(chips, ['E2E', 'E2E', 'E2E', 'E2E', 'E2E']);
  await app.pollUntil(() => storeLayout() === 'list' || null, { timeout: 3000, interval: 100, label: 'layout persisted' });
});

test('a row unfolds to the rendered body and folds back', async () => {
  await clickSel(`[data-list-note="${NOTE.plain}"] [data-list-row]`);
  const body = await app.pollUntil(() => app.evaljs(`document.querySelector('[data-list-note="${NOTE.plain}"][data-expanded="1"] .md-body')?.textContent || null`), { timeout: 2000, interval: 50, label: 'expanded body' });
  assert.match(body, /alpha bravo charlie delta/);
  assert.match(body, /india juliet kilo lima/);
  assert.equal(await app.evaljs(`!!document.querySelector('[data-list-note="${NOTE.plain}"] [data-list-rest]')`), false, 'no preview while unfolded');
  await clickSel(`[data-list-note="${NOTE.plain}"] [data-list-row]`);
  await app.pollUntil(() => app.evaljs(`document.querySelector('[data-list-note="${NOTE.plain}"]').dataset.expanded === '0' || null`), { timeout: 2000, interval: 50, label: 'folded' });
});

test('"Open on canvas" returns to the desk with that note selected', async () => {
  await clickSel(`[data-list-note="${NOTE.other}"] [data-list-row]`);
  await clickSel(`[data-list-note="${NOTE.other}"] [data-list-open]`);
  await app.pollUntil(() => app.evaljs(`!!document.querySelector('#desk') || null`), { timeout: 3000, interval: 50, label: 'desk back' });
  const selected = await app.pollUntil(() => app.evaljs(`(() => { const e = document.querySelector('[data-note-id="${NOTE.other}"]'); return e && getComputedStyle(e).outlineStyle === 'solid' ? true : null; })()`), { timeout: 3000, interval: 50, label: 'note focused' });
  assert.equal(selected, true);
  assert.equal(await app.evaljs(`document.querySelector('[data-layout="canvas"]').getAttribute('aria-pressed')`), 'true');
  await app.pollUntil(() => storeLayout() === 'canvas' || null, { timeout: 3000, interval: 100, label: 'layout persisted back' });
});
