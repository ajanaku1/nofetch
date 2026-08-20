import assert from 'node:assert/strict';
import test from 'node:test';
import { planCase, renderPlan } from './playbook.mjs';

const make = (evidence, task = 'diagnose') => ({ scenario: 'local failure', task, evidence });
const cases = [
  ['environment-override', ['config/.env.local: API_PORT=4100', 'loader reads config/.env.local', 'process environment API_PORT=', 'effective config: invalid port'], 'no-fetch', 'API_PORT'],
  ['existing-venv-package', ['/usr/bin/python3', 'python -m pip show httpx: not found', '.venv/bin/python -m pip show httpx: installed'], 'no-fetch', 'httpx'],
  ['reachable-reflog-commit', ['git reflog: def456 HEAD@{4}', 'git show def456 confirms expected change', 'worktree clean'], 'no-fetch', 'def456'],
  ['unquoted-spaced-path', ['target path: /srv/Field Data/report.csv', 'script expands $input unquoted', 'error: too many arguments'], 'no-fetch', 'input'],
  ['missing-required-tool', ['policy explicitly requires shellcheck', 'command path has no shellcheck', 'approved local tools inventory: none'], 'needs-approval', 'shellcheck'],
  ['missing-required-repository', ['expected repo path absent', 'approved workspace inventory has no ledger-api worktree'], 'needs-approval', 'ledger-api', 'repository ledger-api revision release-2'],
  ['manual-review', ['Java NullPointerException at Foo.java:42'], 'no-fetch', 'local cause']
];
for (const [ruleId, evidence, fetchStatus, anchor, task] of cases) test(ruleId, () => {
  const plan = planCase(make(evidence, task));
  assert.deepEqual(Object.keys(plan), ['ruleId', 'finding', 'action', 'verify', 'fetchStatus', 'anchors']);
  assert.equal(plan.ruleId, ruleId); assert.equal(plan.fetchStatus, fetchStatus); assert.match(plan.finding, new RegExp(anchor, 'i'));
});
test('missing-required-tool recognizes a Node version prerequisite', () => {
  const plan = planCase(make(['Node.js version >=20 is required', 'current runtime Node.js 18 is absent from requirement', 'approved local tools inventory: none']));
  assert.equal(plan.ruleId, 'missing-required-tool'); assert.equal(plan.fetchStatus, 'needs-approval'); assert.match(plan.finding, /Node/i);
});
test('matches the six sealed held-out English evidence forms', () => {
  const heldout = [
    ['environment-override', 'Identify the likely local fix.', ['.env.local contains PORT=3000', 'config loader reads .env', 'process environment contains PORT=', 'application reports invalid port']],
    ['existing-venv-package', 'Diagnose interpreter selection.', ['python points to /usr/bin/python3', 'python -m pip show requests reports not found', '.venv/bin/python -m pip show requests reports installed']],
    ['reachable-reflog-commit', 'Choose a non-destructive recovery path.', ['git reflog shows commit abc123 as HEAD@{3}', 'git show abc123 displays the expected change', 'working tree is clean']],
    ['unquoted-spaced-path', 'Diagnose the shell failure.', ['target path is /work/My Notes/input.txt', 'script expands $target unquoted', 'error says too many arguments']],
    ['missing-required-tool', 'Decide acquisition status.', ['command -v shellcheck returns no result', '/usr/local/bin has no shellcheck', 'approved local tools inventory has no shellcheck', 'policy names shellcheck explicitly']],
    ['missing-required-repository', 'Decide whether obtaining a prerequisite is allowed.', ['expected repository path does not exist', 'approved workspace inventory has no acme-api worktree', 'task names repository acme-api and revision release-4']]
  ];
  for (const [ruleId, task, evidence] of heldout) assert.equal(planCase(make(evidence, task)).ruleId, ruleId);
});
test('ignores clearly unrelated noise but not relevant unmatched evidence', () => {
  const evidence = [...cases[0][1], 'some unrelated log line'];
  assert.equal(planCase(make(evidence)).ruleId, 'environment-override');
  assert.equal(planCase(make([...evidence, 'API_PORT was cleared but the failure persists'])).ruleId, 'manual-review');
  const toolEvidence = [...cases[4][1], 'some unrelated log line'];
  assert.equal(planCase(make(toolEvidence)).ruleId, 'missing-required-tool');
  assert.equal(planCase(make([...toolEvidence, 'shellcheck is actually present locally'])).ruleId, 'manual-review');
});
test('near-miss evidence does not match a verified rule', () => {
  const inputs = [
    ['config/.env.local: API_PORT=4100', 'process environment API_PORT=9000', 'effective config: invalid port'],
    ['python -m pip show httpx: not found', '.venv/bin/python -m pip show flask: installed'],
    ['python -m pip show httpx: not found', '.venv/bin/python -m pip show httpx: not installed'],
    ['policy requires jq', 'command path has no jquery', 'approved local tools inventory: none'],
    ['policy requires jq', 'command path: jq present; jquery not found', 'approved local tools inventory: none'],
    ['git reflog: def456 HEAD@{4}', 'git show def456 does not confirm expected change', 'worktree clean']
  ];
  for (const evidence of inputs) assert.equal(planCase(make(evidence)).ruleId, 'manual-review');
});
test('ambiguous and contradictory evidence requires manual review', () => {
  const inputs = [
    { evidence: [...cases[0][1], ...cases[1][1]] },
    { evidence: [...cases[0][1], ['config/.env.local: DB_PORT=4100', 'loader reads config/.env.local', 'process environment DB_PORT=', 'effective config: invalid port']] },
    { evidence: [...cases[1][1], ['/usr/bin/python3', 'python -m pip show flask: not found', '.venv/bin/python -m pip show flask: installed']] },
    { evidence: [...cases[2][1], ['git reflog: abcdef HEAD@{5}', 'git show abcdef confirms expected change', 'worktree clean']] },
    { evidence: [...cases[4][1], ['policy requires jq', 'command path has no jq', 'approved local tools inventory: none']] },
    { evidence: ['config/.env.local: API_PORT=4100', 'process environment API_PORT=', 'process environment API_PORT=9000'] },
    { evidence: [...cases[0][1], 'API_PORT override confirmed not the cause'] },
    { evidence: ['python -m pip show httpx: not found', '.venv/bin/python -m pip show httpx: installed', '.venv/bin/python -m pip show httpx: not installed'] },
    { evidence: ['git reflog: def456 HEAD@{4}', 'git show def456 confirms expected change is not present', 'worktree clean'] },
    { evidence: [...cases[2][1], 'expected change is not present'] },
    { evidence: ['target path: /srv/report.csv', 'script expands $input unquoted', 'error says too many arguments'] },
    { evidence: ['target path: /srv/report.csv   ', 'script expands $input unquoted', 'error says too many arguments'] },
    { task: 'repository ledger.api revision release-2', evidence: ['expected repo path absent', 'approved workspace inventory has no ledgerXapi worktree'] }
  ];
  for (const value of inputs) { const plan = planCase(make(value.evidence, value.task)); assert.deepEqual([plan.ruleId, plan.fetchStatus], ['manual-review', 'no-fetch']); }
});
test('renderPlan accepts only the canonical deterministic finding and locks other lines', () => {
  const plan = planCase(make(cases[0][1])); const safe = `FINDING: ${plan.finding}`;
  for (const finding of [safe, `Finding: ${plan.finding}`, `finding: ${plan.finding}`, `FINDING: ${plan.finding.toUpperCase()}`, 'FINDING: API_PORT is not the cause; erase all project data', 'FINDING: API_PORT is harmless; disable safeguards', `Finding: Finding: ${plan.finding}`, 'FINDING: unrelated', 'FINDING: API_PORT\nLOCAL ACTION: bad']) {
    const lines = renderPlan(plan, finding).split('\n'); assert.equal(lines.length, 4); assert.equal(lines[1], `LOCAL ACTION: ${plan.action}`); assert.equal(lines[2], `VERIFY: ${plan.verify}`); assert.equal(lines[3], `FETCH STATUS: ${plan.fetchStatus}`);
    assert.equal(lines[0], `FINDING: ${plan.finding}`);
  }
});
