import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./nofetch.mjs', import.meta.url));
const input = { scenario: 'build fails', task: 'diagnose', evidence: ['config/.env.local: API_PORT=4100', 'loader reads config/.env.local', 'process environment API_PORT=', 'effective config: invalid port'] };
const finding = 'API_PORT empty process override masks the local env-file value';
const good = `FINDING: ${finding}`;
const output = `${good}\nLOCAL ACTION: Unset or correct the API_PORT process override\nVERIFY: Confirm effective API_PORT configuration and start\nFETCH STATUS: no-fetch`;
const fallback = 'FINDING: API_PORT empty process override masks the local env-file value';
const model = JSON.stringify(finding);
const schema = { type: 'string', minLength: 1, maxLength: 240 };
const reply = content => JSON.stringify({ choices: [{ message: { content } }] });
const failed = result => { assert.notEqual(result.code, 0); assert.equal(result.out, ''); assert.match(result.err, /^NoFetch failed:/); };
function run(args) { return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args]);
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err })); });
}
async function invoke(host, value = input, extra = []) { const dir = await mkdtemp(join(tmpdir(), 'nofetch-'));
  try {
    const file = join(dir, 'case.json'); await writeFile(file, JSON.stringify(value));
    return await run(['--input', file, '--host', host, ...extra]);
  } finally { await rm(dir, { recursive: true, force: true }); } }
async function server(body, status = 200, host = '127.0.0.1') { let seen, count = 0;
  const instance = createServer((request, response) => {
    let requestBody = '';
    request.on('data', chunk => { requestBody += chunk; });
    request.on('end', () => {
      count += 1; seen = { request, body: requestBody };
      response.writeHead(status, { 'content-type': 'application/json' }); response.end(body);
    });
  });
  await new Promise((resolve, reject) => instance.listen(0, host, error => error ? reject(error) : resolve()));
  const address = host === '::1' ? `[${host}]` : host;
  return { host: `http://${address}:${instance.address().port}`, seen: () => seen, count: () => count, close: () => new Promise(resolve => instance.close(resolve)) }; }
test('sends the sealed llama.cpp request and prints a trusted four-line plan', async () => {
  const local = await server(reply(model));
  try {
    const result = await invoke(local.host);
    assert.deepEqual([result.code, result.out, result.err], [0, `${output}\n`, '']);
    const seen = local.seen();
    assert.deepEqual([seen.request.method, seen.request.url, seen.request.headers.authorization, seen.request.headers['content-type']], ['POST', '/v1/chat/completions', undefined, 'application/json']);
    const body = JSON.parse(seen.body); assert.deepEqual(Object.keys(body), ['model', 'messages', 'stream', 'temperature', 'seed', 'max_tokens', 'top_k', 'top_p', 'repeat_penalty', 'json_schema']);
    assert.deepEqual([body.model, body.stream, body.temperature, body.seed, body.max_tokens, body.top_k, body.top_p, body.repeat_penalty], ['nofetch', false, 0, 42, 384, 1, 1, 1]);
    assert.deepEqual(body.json_schema, schema);
    assert.equal(body.messages[0].role, 'system'); assert.match(body.messages[0].content, /JSON string/i);
    assert.match(body.messages[1].content, /TRUSTED PLAN\nRULE ID: environment-override\nFINDING HINT: API_PORT empty process override/);
    assert.match(body.messages[1].content, /LOCKED ACTION: Unset or correct the API_PORT process override/);
  } finally { await local.close(); } });
test('refuses unsafe hosts, CLI misuse, and malformed input', async () => {
  for (const host of ['http://localhost:8080', 'https://127.0.0.1:8080', 'http://127.0.0.1:8080/x', 'http://127.0.0.1:8080/?x', 'http://u@127.0.0.1:8080', 'http://128.0.0.1:8080', 'http://127.0.0.999:8080']) failed(await invoke(host));
  for (const value of [{ ...input, x: 1 }, { ...input, task: '' }, { ...input, evidence: [] }, { ...input, evidence: ['x'.repeat(2049)] }, { ...input, scenario: 'x'.repeat(8193) }]) failed(await invoke('http://127.0.0.1:9', value));
  failed(await invoke('http://127.0.0.1:9', input, ['--input', 'x']));
});
test('uses aligned narration, falls back from unsafe or unaligned narration, and rejects malformed responses', async () => {
  for (const [content, expected] of [[model, output], [JSON.stringify('unrelated'), `${fallback}\n${output.split('\n').slice(1).join('\n')}`], [JSON.stringify('API_PORT pip install'), `${fallback}\n${output.split('\n').slice(1).join('\n')}`]]) {
    const local = await server(reply(content)); try { assert.equal((await invoke(local.host)).out, `${expected}\n`); } finally { await local.close(); }
  }
  for (const [body, status] of [['no', 500], ['{', 200], [JSON.stringify({ choices: [] }), 200], [JSON.stringify({ choices: { 0: { message: { content: model } }, length: 1 } }), 200], [reply('bad'), 200], [reply(JSON.stringify({ finding })), 200], [reply(JSON.stringify(1)), 200], [reply(JSON.stringify('')), 200], [reply(JSON.stringify('API_PORT\nmultiline')), 200], [reply(JSON.stringify('x'.repeat(241))), 200]]) {
    const local = await server(body, status);
    try { failed(await invoke(local.host)); } finally { await local.close(); }
  }
  const redirect = createServer((request, response) => { response.writeHead(302, { location: 'http://127.0.0.1/' }); response.end(); }); await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve));
  try { failed(await invoke(`http://127.0.0.1:${redirect.address().port}`)); } finally { await new Promise(resolve => redirect.close(resolve)); }
});
test('uses IPv6 loopback when supported', async context => {
  let local; try { local = await server(reply(model), 200, '::1'); } catch { context.skip('::1 unavailable'); return; }
  try { assert.equal((await invoke(local.host)).code, 0); } finally { await local.close(); }
});
test('rejects whitespace-only input before HTTP and malformed finding', async () => {
  const local = await server(reply(model));
  try {
    for (const value of [{ ...input, scenario: '   ' }, { ...input, task: '\t' }, { ...input, evidence: ['\n'] }]) failed(await invoke(local.host, value));
    assert.equal(local.count(), 0);
  } finally { await local.close(); }
  const malformed = await server(reply(JSON.stringify('   '))); try { failed(await invoke(malformed.host)); } finally { await malformed.close(); }
});
