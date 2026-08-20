import { readFile } from 'node:fs/promises';
import { planCase, renderPlan } from './playbook.mjs';
const fail = reason => { throw Error(reason); };
const bytes = value => Buffer.byteLength(value, 'utf8');
const jsonSchema = { type: 'string', minLength: 1, maxLength: 240 };
function args(argv) {
  let input, host = 'http://127.0.0.1:8080';
  let hasHost = false;
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[++i];
    if (!['--input', '--host'].includes(key) || !value || value.startsWith('--')) fail('invalid arguments');
    if (key === '--input') {
      if (input) fail('invalid arguments'); input = value;
    } else {
      if (hasHost) fail('invalid arguments'); hasHost = true;
      host = value;
    }
  }
  if (!input) fail('invalid arguments'); return { input, host };
}
function nonemptyString(value, max) {
  if (typeof value !== 'string' || !value.trim() || bytes(value) > max) fail('invalid input');
}
function caseData(raw) {
  let value; try { value = JSON.parse(raw); } catch { fail('invalid input'); }
  const keys = ['scenario', 'task', 'evidence'];
  if (!value || Array.isArray(value) || Object.keys(value).length !== 3 || !keys.every(key => key in value)) fail('invalid input');
  nonemptyString(value.scenario, 2048); nonemptyString(value.task, 2048);
  if (!Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 32) fail('invalid input');
  value.evidence.forEach(item => nonemptyString(item, 2048));
  if (bytes(`${value.scenario}\n${value.task}\n${value.evidence.join('\n')}`) > 6000) fail('invalid input'); return value;
}
function endpoint(raw) {
  const literal = /^http:\/\/(?:127\.(?:\d{1,3}\.){2}\d{1,3}|\[::1\])(?::\d+)?\/?$/;
  if (!literal.test(raw)) fail('host rejected');
  let url;
  try { url = new URL(raw); } catch { fail('host rejected'); }
  const ip = /^127\.(\d+)\.(\d+)\.(\d+)$/.exec(url.hostname);
  const loopback = url.hostname === '[::1]' || (ip && ip.slice(1).every(part => Number(part) <= 255));
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !loopback) fail('host rejected');
  return new URL('/v1/chat/completions', url);
}
function prompt(value, plan) {
  const evidence = value.evidence.map((item, index) => `${index + 1}. ${item}`).join('\n');
  return `SCENARIO\n${value.scenario}\nTASK\n${value.task}\nEVIDENCE\n${evidence}\nTRUSTED PLAN\nRULE ID: ${plan.ruleId}\nFINDING HINT: ${plan.finding}\nLOCKED ACTION: ${plan.action}\nLOCKED VERIFY: ${plan.verify}\nLOCKED STATUS: ${plan.fetchStatus}`;
}
function validContent(value) {
  let parsed; try { parsed = JSON.parse(value); } catch { return; }
  const finding = parsed;
  if (typeof finding !== 'string' || !finding.trim() || finding.length > 240 || /[\r\n\u2028\u2029]/.test(finding)) return;
  return finding;
}
async function systemMessage() {
  const base = new URL('../baseline/system-prompt.txt', import.meta.url);
  const policy = new URL('policy.txt', import.meta.url);
  const [baseline, rules] = await Promise.all([readFile(base, 'utf8'), readFile(policy, 'utf8')]);
  return `${baseline}\n${rules}`;
}
async function request(url, user) {
  const body = {
    model: 'nofetch', messages: [{ role: 'system', content: await systemMessage() }, { role: 'user', content: user }],
    stream: false, temperature: 0, seed: 42, max_tokens: 384, top_k: 1, top_p: 1, repeat_penalty: 1, json_schema: jsonSchema
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
    if (!response.ok) fail('model unavailable');
    const value = await response.json();
    const content = Array.isArray(value?.choices) && value.choices.length === 1 && value.choices[0]?.message?.content;
    const finding = validContent(content);
    if (!finding) fail('model unavailable');
    return finding;
  } finally {
    clearTimeout(timer);
  }
}
async function main() {
  const { input, host } = args(process.argv.slice(2));
  const url = endpoint(host);
  let value;
  try {
    const raw = await readFile(input);
    if (raw.length > 8192) fail('invalid input');
    value = caseData(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch { fail('invalid input'); }
  const plan = planCase(value); const user = prompt(value, plan);
  if (bytes(user) > 7000) fail('invalid input');
  let finding;
  try { finding = await request(url, user); }
  catch { process.stderr.write('NoFetch warning: model unavailable; using trusted plan\n'); }
  process.stdout.write(`${renderPlan(plan, finding)}\n`);
}
main().catch(error => {
  const known = ['invalid arguments', 'host rejected', 'invalid input'];
  const reason = known.includes(error.message) ? error.message : 'invalid input';
  process.stderr.write(`NoFetch failed: ${reason}\n`);
  process.exitCode = 1;
});
