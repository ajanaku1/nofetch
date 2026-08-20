const make = (ruleId, finding, action, verify, fetchStatus, anchors) => ({ ruleId, finding, action, verify, fetchStatus, anchors });
const literal = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const manual = () => make('manual-review', 'Supplied evidence needs manual review for a local cause', 'Escalate for manual review without state change', 'Review identifies a local cause before any change', 'no-fetch', ['local cause']);

function matched(lines, roles) {
  const found = Array(roles.length).fill(undefined);
  const unmatched = [];
  for (const line of lines) {
    if (typeof line !== 'string') return;
    const hits = roles.map((role, index) => [index, line.match(role)]).filter(([, hit]) => hit);
    if (!hits.length) { unmatched.push(line); continue; }
    if (hits.length !== 1 || found[hits[0][0]]) return;
    found[hits[0][0]] = hits[0][1];
  }
  return found.every(Boolean) ? { found, unmatched } : undefined;
}
const structured = /^(?:config\/\.env|env file|\.env|loader reads|config loader|process environment|effective config|application reports|\/usr\/bin\/python3|default Python|python points|(?:default )?python -m pip show|\.venv\/bin\/python -m pip show|git reflog|git show|worktree|working tree|target path|script expands|error|policy|Node\.js version|command path|command -v|current runtime|approved local tools|approved local toolchain|expected repo|expected repository|approved workspace|task names repository)/i;
const conflicts = (match, relevant) => match.unmatched.some(line => structured.test(line) || relevant.test(line));
function environment(lines) {
  const match = matched(lines, [/^(?:config\/\.env\.local:|env file config\/\.env\.local has|\.env\.local contains) ([A-Z][A-Z0-9_]*)=([^\s]+)$/i, /^(?:loader reads config\/\.env\.local|config loader reads \.env)$/i, /^process environment(?: contains)? ([A-Z][A-Z0-9_]*)=$/i, /^(?:effective config(?::| says) invalid port|application reports invalid port)$/i]);
  const found = match?.found;
  if (!found || found[0][1] !== found[2][1] || conflicts(match, /\.env|environment|config|loader|override|port|cause|persist/i)) return;
  const name = found[0][1];
  return make('environment-override', `${name} empty process override masks the local env-file value`, `Unset or correct the ${name} process override`, `Confirm effective ${name} configuration and start`, 'no-fetch', [name]);
}
function venv(lines) {
  const match = matched(lines, [/^(?:\/usr\/bin\/python3|default Python is \/usr\/bin\/python3|python points to \/usr\/bin\/python3)$/i, /^(?:default )?python -m pip show ([A-Za-z0-9_.-]+)(?:: (?:not found|not installed)| reports not found)$/i, /^\.venv\/bin\/python -m pip show ([A-Za-z0-9_.-]+)(?:: (?:installed|found)| reports installed)$/i]);
  const found = match?.found;
  if (!found || found[1][1] !== found[2][1] || conflicts(match, /python|pip|venv|virtual environment|package|module|import|installed|found/i)) return;
  const name = found[1][1];
  return make('existing-venv-package', `${name} is installed in the existing .venv but the default interpreter bypasses it`, 'Use .venv/bin/python or activate the existing virtual environment', `Check sys.executable and import ${name}`, 'no-fetch', [name]);
}
function reflog(lines) {
  const match = matched(lines, [/^git reflog(?: shows commit| shows|:) ([a-f0-9]{6,40})(?: as| at)? HEAD@\{[0-9]+\}$/i, /^git show ([a-f0-9]{6,40}) (?:confirms|displays) (?:the )?expected change$/i, /^(?:worktree clean|working tree is clean)$/i]);
  const found = match?.found;
  if (!found || found[0][1] !== found[1][1] || conflicts(match, /git|reflog|commit|HEAD@|worktree|working tree|expected change|branch|diff|present/i)) return;
  const hash = found[0][1];
  return make('reachable-reflog-commit', `${hash} is a locally recoverable reflog commit`, `Create a safety branch at ${hash} before replaying it`, `Show the safety branch, ${hash}, and its diff`, 'no-fetch', [hash]);
}
function quote(lines) {
  const match = matched(lines, [/^target path(?::| is) (.+)$/i, /^script expands \$([A-Za-z_][A-Za-z0-9_]*) unquoted$/i, /^error(?::| says) too many arguments$/i]);
  const found = match?.found;
  const path = found?.[0][1].trim();
  if (!path || !/[ \t]/.test(path) || conflicts(match, /path|script|expand|unquoted|argument|error|cause|persist/i)) return;
  const variable = found[1][1];
  return make('unquoted-spaced-path', `Unquoted ${variable} expansion splits the spaced target path`, `Quote the ${variable} expansion at the command boundary`, 'Rerun against the spaced target path', 'no-fetch', [variable]);
}
function tool(lines) {
  const match = matched(lines, [/^(?:policy(?: explicitly)? requires ([A-Za-z][A-Za-z0-9_.-]*)|policy names ([A-Za-z][A-Za-z0-9_.-]*) explicitly|Node\.js version >=[0-9]+ is required)$/i, /^(?:command path has no ([A-Za-z][A-Za-z0-9_.-]*)|command -v ([A-Za-z][A-Za-z0-9_.-]*) returns no result|current runtime (Node\.js) [0-9]+ is absent from requirement)$/i, /^approved local (?:tools|toolchain) inventory(?:: none| has no ([A-Za-z][A-Za-z0-9_.-]*))$/i]);
  const found = match?.found;
  if (!found) return;
  const name = found[0][1] || found[0][2] || 'Node.js';
  const absent = found[1][1] || found[1][2] || found[1][3];
  const inventory = found[2][1];
  const allowed = new RegExp(`^/usr/local/bin has no ${literal(name)}$`, 'i');
  const relevant = new RegExp(`policy|command|path|inventory|tool|runtime|version|present|absent|${literal(name)}`, 'i');
  const conflict = match.unmatched.some(line => !allowed.test(line) && (structured.test(line) || relevant.test(line)));
  if (name !== absent || inventory && name !== inventory || conflict) return;
  return make('missing-required-tool', `${name} is a named prerequisite proven absent locally`, `Request approval to obtain ${name} through the project-approved tooling channel`, `Confirm ${name} identity/version, then run the required check`, 'needs-approval', [name]);
}
function repository(value) {
  const task = /^repository ([A-Za-z][A-Za-z0-9_.-]*) revision ([A-Za-z][A-Za-z0-9_.-]*)$/i.exec(value.task);
  const roles = task
    ? [/^expected (?:repo|repository) path (?:absent|does not exist)$/i, new RegExp(`^approved workspace inventory has no (${literal(task[1])}) worktree$`, 'i')]
    : [/^expected (?:repo|repository) path (?:absent|does not exist)$/i, /^approved workspace inventory has no ([A-Za-z][A-Za-z0-9_.-]*) worktree$/i, /^task names repository ([A-Za-z][A-Za-z0-9_.-]*) and revision ([A-Za-z][A-Za-z0-9_.-]*)$/i];
  const match = matched(value.evidence, roles); const found = match?.found;
  if (!found || conflicts(match, /repo|repository|worktree|revision|path|inventory|task|absent|exist/i)) return;
  const name = task?.[1] || found[1][1]; const revision = task?.[2] || found[2][2];
  if (!task && name !== found[2][1]) return;
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
