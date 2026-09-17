// Note speech against a local stand-in for the TTS server: the real app,
// the real IPC path through main, a fake server that records what it was
// asked to say. No network, no real key.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { launch } from './harness.mjs';

const JP = 'e2e-jp';
const EN = 'e2e-en';

// 0.4 s of silent 8 kHz mono WAV — real, playable audio.
function silentWav(seconds = 0.4, rate = 8000) {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}

const requests = [];
let server, app;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body: body ? JSON.parse(body) : null });
      if (req.url === '/health') { res.end('ok'); return; }
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(silentWav());
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const seed = {
    tweaks: { theme: 'paper', font: 'Inter', density: 'cozy', showLinks: true, tilt: false, hideNoteTitles: false },
    folders: { root: { id: 'root', name: 'All notes', parent: null, hue: '#888' } },
    notes: [
      { id: JP, folder: 'root', title: 'JP', body: '奇跡\nきせき\nmiracle',
        color: 'yellow', x: 40, y: 40, w: 340, h: 200, z: 1, pinned: false },
      { id: EN, folder: 'root', title: 'EN', body: 'Kernel\nhttp://localhost:8351/',
        color: 'blue', x: 520, y: 40, w: 260, h: 200, z: 2, pinned: false },
    ],
    links: [], cwd: 'root', view: { x: 0, y: 0, z: 1 }, drawer: false, folderOrder: [],
  };
  app = await launch({
    seed,
    files: { 'tts.json': JSON.stringify({ url: `http://127.0.0.1:${port}/v1/audio/speech`, key: 'test-key', voice: '42', speed: 1 }) },
  });
});

after(async () => {
  if (app) await app.close();
  if (server) server.close();
});

const speakBtn = (id) => `document.querySelector('[data-note-id="${id}"] button[data-speech]')`;

test('the speak button appears on a Japanese note only', async () => {
  assert.equal(await app.evaljs(`!!${speakBtn(JP)}`), true);
  assert.equal(await app.evaljs(`!!${speakBtn(EN)}`), false);
});

test('the API key stays in main: the page never sees it', async () => {
  const leaked = await app.evaljs(`JSON.stringify(window.stickyAPI).includes('test-key') || document.documentElement.outerHTML.includes('test-key')`);
  assert.equal(leaked, false);
});

test('clicking speak sends the Japanese lines to the server and plays the audio', async () => {
  const at = await app.evaljs(`(() => { const b = ${speakBtn(JP)}.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  await app.click(at.x, at.y);
  const speech = await app.pollUntil(() => requests.find(r => r.url === '/v1/audio/speech') || null,
    { timeout: 5000, interval: 50, label: 'speech request' });
  assert.equal(speech.method, 'POST');
  assert.equal(speech.key, 'test-key');
  assert.equal(speech.body.input, '奇跡。きせき。');
  assert.equal(speech.body.voice, '42');
  // The button goes to "playing" and settles back to idle when the clip ends.
  await app.pollUntil(async () => (await app.evaljs(`${speakBtn(JP)}.dataset.speech`)) === 'idle' ? true : null,
    { timeout: 5000, interval: 50, label: 'speech to finish' });
  const title = await app.evaljs(`${speakBtn(JP)}.title`);
  assert.doesNotMatch(title, /Couldn't speak/, 'the clip must play without an error');
});

test('replaying the same note is served from the cache', async () => {
  const before = requests.filter(r => r.url === '/v1/audio/speech').length;
  const at = await app.evaljs(`(() => { const b = ${speakBtn(JP)}.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  await app.click(at.x, at.y);
  await app.pollUntil(async () => (await app.evaljs(`${speakBtn(JP)}.dataset.speech`)) === 'idle' ? true : null,
    { timeout: 5000, interval: 50, label: 'replay to finish' });
  assert.equal(requests.filter(r => r.url === '/v1/audio/speech').length, before);
});

test('with text highlighted in the note, speak reads only the highlight', async () => {
  // Highlight 「きせき」 in the rendered body.
  await app.evaljs(`(() => {
    const body = document.querySelector('[data-note-id="${JP}"] .md-body');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.data.includes('きせき'));
    const r = document.createRange();
    const i = node.data.indexOf('きせき');
    r.setStart(node, i); r.setEnd(node, i + 3);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  })()`);
  const before = requests.filter(r => r.url === '/v1/audio/speech').length;
  const at = await app.evaljs(`(() => { const b = ${speakBtn(JP)}.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  await app.click(at.x, at.y);
  const req = await app.pollUntil(() => requests.filter(r => r.url === '/v1/audio/speech')[before] || null,
    { timeout: 5000, interval: 50, label: 'speech request for the highlight' });
  assert.equal(req.body.input, 'きせき');
  await app.pollUntil(async () => (await app.evaljs(`${speakBtn(JP)}.dataset.speech`)) === 'idle' ? true : null,
    { timeout: 5000, interval: 50, label: 'highlight speech to finish' });
});
