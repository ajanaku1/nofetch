const make = (ruleId, finding, action, verify, fetchStatus, anchors) => ({ ruleId, finding, action, verify, fetchStatus, anchors });
const literal = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const manual = () => make('manual-review', 'Supplied evidence needs manual review for a local cause', 'Escalate for manual review without state change', 'Review identifies a local cause before any change', 'no-fetch', ['local cause']);

function matched(lines, roles) {
  if (lines.length !== roles.length) return;
  const found = Array(roles.length).fill(undefined);
  for (const line of lines) {
    const hits = roles.map((role, index) => [index, line.match(role)]).filter(([, hit]) => hit);
    if (hits.length !== 1 || found[hits[0][0]]) return;
    found[hits[0][0]] = hits[0][1];
  }
  return found.every(Boolean) ? found : undefined;
}
function environment(lines) {
  const found = matched(lines, [/^(?:config\/\.env\.local:|env file config\/\.env\.local has) ([A-Z][A-Z0-9_]*)=([^\s]+)$/i, /^loader reads config\/\.env\.local$/i, /^process environment ([A-Z][A-Z0-9_]*)=$/i, /^effective config(?::| says) invalid port$/i]);
  if (!found || found[0][1] !== found[2][1]) return;
  const name = found[0][1];
  return make('environment-override', `${name} empty process override masks the local env-file value`, `Unset or correct the ${name} process override`, `Confirm effective ${name} configuration and start`, 'no-fetch', [name]);
}
function venv(lines) {
  const found = matched(lines, [/^(?:\/usr\/bin\/python3|default Python is \/usr\/bin\/python3)$/i, /^(?:default )?python -m pip show ([A-Za-z0-9_.-]+): (?:not found|not installed)$/i, /^\.venv\/bin\/python -m pip show ([A-Za-z0-9_.-]+): (?:installed|found)$/i]);
  if (!found || found[1][1] !== found[2][1]) return;
  const name = found[1][1];
  return make('existing-venv-package', `${name} is installed in the existing .venv but the default interpreter bypasses it`, 'Use .venv/bin/python or activate the existing virtual environment', `Check sys.executable and import ${name}`, 'no-fetch', [name]);
}
function reflog(lines) {
  const found = matched(lines, [/^git reflog(?: shows|:) ([a-f0-9]{6,40})(?: at)? HEAD@\{[0-9]+\}$/i, /^git show ([a-f0-9]{6,40}) confirms expected change$/i, /^worktree clean$/i]);
  if (!found || found[0][1] !== found[1][1]) return;
  const hash = found[0][1];
  return make('reachable-reflog-commit', `${hash} is a locally recoverable reflog commit`, `Create a safety branch at ${hash} before replaying it`, `Show the safety branch, ${hash}, and its diff`, 'no-fetch', [hash]);
}
function quote(lines) {
  const found = matched(lines, [/^target path: (.+)$/i, /^script expands \$([A-Za-z_][A-Za-z0-9_]*) unquoted$/i, /^error(?::| says) too many arguments$/i]);
  const path = found?.[0][1].trim();
  if (!path || !/[ \t]/.test(path)) return;
  const variable = found[1][1];
  return make('unquoted-spaced-path', `Unquoted ${variable} expansion splits the spaced target path`, `Quote the ${variable} expansion at the command boundary`, 'Rerun against the spaced target path', 'no-fetch', [variable]);
}
function tool(lines) {
  const found = matched(lines, [/^(?:policy(?: explicitly)? requires ([A-Za-z][A-Za-z0-9_.-]*)|Node\.js version >=[0-9]+ is required)$/i, /^(?:command path has no ([A-Za-z][A-Za-z0-9_.-]*)|current runtime (Node\.js) [0-9]+ is absent from requirement)$/i, /^approved local tools inventory(?: has|:) none$/i]);
  if (!found) return;
  const name = found[0][1] || 'Node.js';
  if (name !== (found[1][1] || found[1][2])) return;
  return make('missing-required-tool', `${name} is a named prerequisite proven absent locally`, `Request approval to obtain ${name} through the project-approved tooling channel`, `Confirm ${name} identity/version, then run the required check`, 'needs-approval', [name]);
}
function repository(value) {
  const task = /^repository ([A-Za-z][A-Za-z0-9_.-]*) revision ([A-Za-z][A-Za-z0-9_.-]*)$/i.exec(value.task);
  if (!task || !matched(value.evidence, [/^expected repo path absent$/i, new RegExp(`^approved workspace inventory has no ${literal(task[1])} worktree$`, 'i')])) return;
  const [, name, revision] = task;
  return make('missing-required-repository', `${name} at ${revision} is a named repository/revision proven absent locally`, `Request approval through the project-approved source-control channel for ${name} at ${revision}`, `Confirm worktree identity, ${revision}, and status`, 'needs-approval', [name, revision]);
}
export function planCase(value) {
  const plans = [environment(value.evidence), venv(value.evidence), reflog(value.evidence), quote(value.evidence), tool(value.evidence), repository(value)].filter(Boolean);
  return plans.length === 1 ? plans[0] : manual();
}
function canonical(plan, value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 384 || /[\r\n\u2028\u2029]/.test(value)) return;
  const finding = value.trim().replace(/^Finding:[ \t]*/, '');
  return finding === plan.finding ? plan.finding : undefined;
}
export function renderPlan(plan, generatedFinding) {
  const finding = canonical(plan, generatedFinding) || plan.finding;
  return `FINDING: ${finding}\nLOCAL ACTION: ${plan.action}\nVERIFY: ${plan.verify}\nFETCH STATUS: ${plan.fetchStatus}`;
}
