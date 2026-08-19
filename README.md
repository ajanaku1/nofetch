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

## Setup, build, run, and test

Use Node 20+ for the client. Download the exact model once with
`./download_model.sh`. Build a CPU-only pinned llama.cpp checkout (commit
`4df29be4f4c3673f428170fda944a5b19f743bb8`) with `GGML_METAL=OFF`, then start
`llama-server` on `127.0.0.1:8080` using `model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`.
Run `node app/nofetch.mjs --input case.json --host http://127.0.0.1:8080` and test
with `node --test app/nofetch.test.mjs app/playbook.test.mjs && ./verify.sh`.

For a later Gate 1 smoke only, use profiler source commit
`ac2e137dca65ea3b09d997774f17dd8907b489fb` with participant mode and
`--skip-accuracy`. Do not install or resolve the accuracy stack for this package.

## Evidence limits

The published development measurement is Darwin x86_64 compatibility evidence only.
It is not an official score or Standard Laptop result; Ubuntu 22.04 x86-64, 4 vCPU,
8 GB DDR4, integrated-graphics validation and accuracy evaluation remain pending.
