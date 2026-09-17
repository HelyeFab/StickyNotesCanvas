import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The markdown pipeline with BOTH vendored libraries evaluated first, as the
// <script> tags in index.html do (see tests/fixtures/load-md-converters.mjs).
const dir = path.dirname(fileURLToPath(import.meta.url));
const vendor = (f) => fs.readFileSync(path.join(dir, '..', 'vendor', f), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(vendor('markdown-it.min.js'), sandbox);
vm.runInContext(vendor('highlight.min.js'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
const { mdToHtml } = sandbox.window;
const visible = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('a python fence is coloured', () => {
  const html = mdToHtml('```python\ndef greet(name):\n    return "hi " + name  # say hi\n```');
  assert.match(html, /<code class="language-python">/);
  assert.match(html, /<span class="hljs-keyword">def<\/span>/);
  assert.match(html, /<span class="hljs-string">&quot;hi &quot;<\/span>/);
  assert.match(html, /<span class="hljs-comment"># say hi<\/span>/);
});

test('colouring never changes the text the note shows', () => {
  const src = 'SELECT name, COUNT(*) FROM notes WHERE id > 3 GROUP BY name;\n-- tm351';
  const html = mdToHtml('```sql\n' + src + '\n```');
  assert.match(html, /hljs-keyword/);
  assert.equal(visible(html), src + '\n');
});

test('language aliases work (py, js, sh)', () => {
  for (const lang of ['py', 'js', 'sh']) {
    assert.match(mdToHtml('```' + lang + '\nif x:\n```'), /hljs-/, lang);
  }
});

test('unlabelled and unknown-language fences stay plain', () => {
  assert.doesNotMatch(mdToHtml('```\ndef f(): pass\n```'), /hljs-/);
  assert.doesNotMatch(mdToHtml('```klingon\ndef f(): pass\n```'), /hljs-/);
  assert.match(mdToHtml('```klingon\na < b\n```'), /<code class="language-klingon">a &lt; b\n<\/code>/);
});

test('code that looks like HTML is escaped, not rendered', () => {
  const html = mdToHtml('```js\nel.innerHTML = "<img src=x onerror=alert(1)>";\n```');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('mermaid fences are untouched by colouring', () => {
  const html = mdToHtml('```mermaid\ngraph TD; A-->B\n```');
  assert.match(html, /<pre class="mermaid-src" dir="auto"><code>graph TD; A--&gt;B\n<\/code><\/pre>/);
});
