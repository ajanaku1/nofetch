import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');

test('landing page presents the NoFetch product and its local-first workflow', async () => {
  const html = await read('./index.html');

  assert.match(html, /Repair locally\. Fetch only with evidence\./);
  assert.match(html, /Inspect locally/);
  assert.match(html, /Repair reversibly/);
  assert.match(html, /Verify the result/);
  assert.match(html, /Fetch with evidence/);
  assert.match(html, /21\.62/);
  assert.match(html, /1\.87/);
  assert.match(html, /0\.66/);
});

test('landing page has semantic, keyboard-friendly navigation and actions', async () => {
  const html = await read('./index.html');

  assert.match(html, /<header[\s>]/);
  assert.match(html, /<main[\s>]/);
  assert.match(html, /<footer[\s>]/);
  assert.match(html, /<nav[^>]+aria-label="Primary"/);
  assert.match(html, /href="#how-it-works"/);
  assert.match(html, /href="https:\/\/github\.com\/ajanaku1\/nofetch"/);
  assert.match(html, /<button[^>]+data-copy-command/);
  assert.match(html, /<span[^>]+aria-live="polite"/);
});

test('landing page ships responsive styles and respects reduced motion', async () => {
  const css = await read('./styles.css');

  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /--ink:/);
  assert.match(css, /--signal:/);
});

test('copy action writes the install command and exposes a visible status', async () => {
  const script = await read('./script.js');

  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.match(script, /document\.execCommand\('copy'\)/);
  assert.match(script, /copyButton\.focus\(\)/);
  assert.match(script, /data-copy-command/);
  assert.match(script, /data-copy-status/);
  assert.match(script, /Copied/);
});
