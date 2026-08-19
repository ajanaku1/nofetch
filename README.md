# NoFetch

NoFetch is a local, offline debugging assistant for coding learners and developers
working on budget laptops or unreliable connections. It sends a bounded request only
to a local `llama.cpp` loopback server and turns supplied evidence into a constrained
safe debugging plan.

## Output contract

```
FINDING: <local cause only>
LOCAL ACTION: <one safe local action>
VERIFY: <local verification>
FETCH STATUS: <no-fetch or needs-approval>
```

The deterministic playbook fixes the action, verification, and fetch status; the
local model can only narrate the finding. NoFetch does not perform downloads, remote
inference, or shared inference.

## Layout and offline boundary

- `app/` is the dependency-free Node client and deterministic playbook.
- `baseline/` is its system prompt.
- `download_model.sh` obtains the immutable public GGUF once before offline use.
- `model/` is ignored by Git; inference is local-only after download.

## Setup-time fetches and local build

Use Node 20+ and run these commands from the repository root. `git clone` and
`./download_model.sh` are setup-time network operations; after that, inference is
local and offline. This sequence neither starts a daemon in the background nor runs
the profiler.

```sh
set -eu
llama_commit=4df29be4f4c3673f428170fda944a5b19f743bb8
runtime_root=.tools/llama.cpp
if test -e "$runtime_root" && ! test -d "$runtime_root/.git"; then
  echo "refusing non-checkout runtime path: $runtime_root" >&2; exit 1
fi
if ! test -d "$runtime_root"; then
  mkdir -p .tools
  git clone https://github.com/ggerganov/llama.cpp.git "$runtime_root"
fi
test "$(git -C "$runtime_root" remote get-url origin)" = https://github.com/ggerganov/llama.cpp.git
git -C "$runtime_root" fetch --depth 1 origin "$llama_commit"
git -C "$runtime_root" checkout --detach "$llama_commit"
test "$(git -C "$runtime_root" rev-parse HEAD)" = "$llama_commit"
cmake -S "$runtime_root" -B "$runtime_root/build" -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_HIP=OFF -DGGML_OPENCL=OFF \
  -DGGML_SYCL=OFF -DGGML_VULKAN=OFF -DGGML_RPC=OFF -DLLAMA_CURL=OFF \
  -DLLAMA_BUILD_SERVER=ON
cmake --build "$runtime_root/build" --target llama-server -j4
./download_model.sh
```

The pinned source exposes each listed CMake option. The build enables only the local
CPU server; its `--offline` mode prevents runtime network access.

## Local inference

In one terminal, start the server and leave it in the foreground:

```sh
.tools/llama.cpp/build/bin/llama-server --model model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf \
  --alias nofetch --host 127.0.0.1 --port 8080 --offline --ctx-size 2048
```

In a second terminal, create a local case and invoke the client:

```sh
cat > case.json <<'JSON'
{"scenario":"build fails","task":"diagnose","evidence":["config/.env.local: API_PORT=4100","loader reads config/.env.local","process environment API_PORT=","effective config: invalid port"]}
JSON
node app/nofetch.mjs --input case.json --host http://127.0.0.1:8080
```

Test without a model or server using:

```sh
node --test app/nofetch.test.mjs app/playbook.test.mjs
./verify.sh
```

For a later Gate 1 smoke only, use profiler source commit
`ac2e137dca65ea3b09d997774f17dd8907b489fb` with participant mode and
`--skip-accuracy`. Do not install or resolve the accuracy stack for this package.

## Evidence limits

The published development measurement is Darwin x86_64 compatibility evidence only.
It is not an official score or Standard Laptop result; Ubuntu 22.04 x86-64, 4 vCPU,
8 GB DDR4, integrated-graphics validation and accuracy evaluation remain pending.
