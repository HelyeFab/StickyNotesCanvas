import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as zoom.test.mjs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { hasJapanese, speechTextFromBody, SPEECH_MAX_CHARS } = sandbox.window;

test('hasJapanese: kana, kanji and half-width katakana count; latin does not', () => {
  assert.equal(hasJapanese('ひらがな'), true);
  assert.equal(hasJapanese('カタカナ'), true);
  assert.equal(hasJapanese('漢字'), true);
  assert.equal(hasJapanese('ｶﾀｶﾅ'), true);
  assert.equal(hasJapanese('miracle'), false);
  assert.equal(hasJapanese(''), false);
  assert.equal(hasJapanese(null), false);
});

test('a vocab note reads the word and its reading, not the English gloss', () => {
  assert.equal(speechTextFromBody('奇跡\nきせき\nmiracle'), '奇跡。きせき。');
});

test('sentences that already end in punctuation get no extra break', () => {
  assert.equal(
    speechTextFromBody('総理大臣\n\n「総理大臣」の読み方は「そうりだいじん」です。'),
    '総理大臣。「総理大臣」の読み方は「そうりだいじん」です。',
  );
});

test('markdown markers, links, pictures and URLs are never read out', () => {
  const body = [
    '# 今日の単語',
    '- **乳製品** (dairy)',
    '> 1. 引用です',
    '[辞書](https://jisho.org/search/乳製品)',
    '![図](sticky-image://0123456789abcdef.png)',
    'https://example.com/ページ',
  ].join('\n');
  assert.equal(speechTextFromBody(body), '今日の単語。乳製品 (dairy)。引用です。辞書。');
});

test('fenced blocks are skipped', () => {
  assert.equal(speechTextFromBody('前\n```\nコード\n```\n後'), '前。後。');
});

test('a note with no Japanese has nothing to read', () => {
  assert.equal(speechTextFromBody('Kernel\nhttp://localhost:8351/?token=x'), '');
  assert.equal(speechTextFromBody(undefined), '');
});

test('long notes are capped', () => {
  assert.equal(speechTextFromBody('あ'.repeat(SPEECH_MAX_CHARS * 2)).length, SPEECH_MAX_CHARS);
});
