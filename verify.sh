#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_root"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const metadata = JSON.parse(await readFile('metadata.json'));
assert.deepEqual(metadata, {
  team_id: 'nofetch', domain: 'coding_assistants', language_scope: ['en'],
  african_alpha_claim: true, budget_laptop_claim: true,
  submitter: { name: 'Bambam', email: 'mykdahunsi@gmail.com', github_handle: 'ajanaku1' },
  cross_disciplinary_pairing: { discipline: 'computer science education', load_bearing: true, description: 'Offline, safety-constrained debugging assistance for students and developers using budget laptops with unreliable connectivity.' },
  test_prompts: [
    { prompt_id: 'tp_001', prompt: 'Diagnose an empty process-level API_PORT overriding API_PORT=3000 in .env.local. Provide one safe local action and verification command without downloading anything.' },
    { prompt_id: 'tp_002', prompt: 'Diagnose ModuleNotFoundError when the system Python runs the script but requests is installed in .venv. Provide one safe local action and verification command without fetching packages.' }
  ],
  model: { name: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M', runtime: 'llama.cpp', quantization: 'GGUF Q4_K_M', parameters_estimate: '1.8B', packaging: 'binary_bundle' },
  _runtime: { model_path: 'model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf' }
});
const readme = await readFile('README.md', 'utf8');
const report = await readFile('REPORT.md', 'utf8');
assert.match(readme, /FINDING:.*\nLOCAL ACTION:.*\nVERIFY:.*\nFETCH STATUS:/);
assert.match(report, /not Standard Laptop evidence/i);
assert.match(report, /accuracy.*pending/i);
assert.match(report, /not a fine-tuned checkpoint/i);
assert.match(report, /not a NoFetch component or shared-inference implementation/i);
NODE
fixture=$(mktemp)
bin=$(mktemp -d)
trace=$(mktemp)
trap 'rm -f "$fixture" "$trace"; rm -rf "$bin"' EXIT HUP INT TERM
printf x > "$fixture"
if ./download_model.sh --verify-file "$fixture"; then exit 1; fi
rg -Fx 'model/*' .gitignore
rg -Fx '*.gguf' .gitignore
rg -F 'f86cb2c1fa58255f8052cc32aeede1b7482d4361' download_model.sh
rg -F 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046' download_model.sh
rg -F 'git clone https://github.com/ggerganov/llama.cpp.git "$runtime_root"' README.md
rg -F 'git -C "$runtime_root" checkout --detach "$llama_commit"' README.md
rg -F -- '-DGGML_METAL=OFF' README.md
rg -F -- '-DGGML_CUDA=OFF' README.md
rg -F -- '-DGGML_HIP=OFF' README.md
rg -F -- '-DGGML_OPENCL=OFF' README.md
rg -F -- '-DGGML_SYCL=OFF' README.md
rg -F -- '-DGGML_VULKAN=OFF' README.md
rg -F -- '-DGGML_RPC=OFF' README.md
rg -F -- '-DLLAMA_CURL=OFF' README.md
rg -F -- '-DLLAMA_BUILD_SERVER=ON' README.md
rg -F 'cmake --build "$runtime_root/build" --target llama-server -j4' README.md
rg -F -- '--alias nofetch --host 127.0.0.1 --port 8080 --offline' README.md
rg -F 'node app/nofetch.mjs --input case.json --host http://127.0.0.1:8080' README.md
rg -F 'command -v sha256sum' download_model.sh
rg -F 'command -v shasum' download_model.sh
printf '%s\n' '#!/bin/sh' 'printf sha256sum >> "$TRACE"' 'printf "cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046  %s\\n" "$1"' > "$bin/sha256sum"
printf '%s\n' '#!/bin/sh' 'printf shasum >> "$TRACE"' 'printf "cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046  %s\\n" "$3"' > "$bin/shasum"
printf '%s\n' '#!/bin/sh' 'printf "1117320768 %s\\n" "$2"' > "$bin/wc"
chmod +x "$bin/sha256sum" "$bin/shasum" "$bin/wc"
PATH="$bin:/usr/bin:/bin" TRACE="$trace" ./download_model.sh --verify-file "$fixture"
test "$(cat "$trace")" = sha256sum
rm "$bin/sha256sum"
: > "$trace"
PATH="$bin:/usr/bin:/bin" TRACE="$trace" ./download_model.sh --verify-file "$fixture"
test "$(cat "$trace")" = shasum
echo gate1-verify=PASS
