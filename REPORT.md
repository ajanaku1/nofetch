# NoFetch Gate 1 report

## Problem and context

NoFetch supports students and developers who need safe debugging help when bandwidth,
data budgets, or device resources make online assistance unreliable. The African-alpha
claim concerns this offline, safety-constrained coding-support use case; the
cross-disciplinary pairing with computer science education is load-bearing because the
tool guides learners through one local action and verification step.

## Design

This package uses the untuned `Qwen2.5-Coder-1.5B-Instruct-Q4_K_M` GGUF base model,
not a fine-tuned checkpoint. A deterministic playbook maps validated evidence to the
action, verification, and fetch status; the local model is constrained to a short
finding. The primary alternative was free-form model advice, rejected because it could
recommend unsafe state changes or downloads. InferMart is only narrative inspiration,
not a NoFetch component or shared-inference implementation.

## Constraints and reproducibility

The model is fetched only by `download_model.sh` from the immutable Qwen revision
`f86cb2c1fa58255f8052cc32aeede1b7482d4361`, then SHA-256 and byte-count verified.
The local runtime is CPU-only llama.cpp commit
`4df29be4f4c3673f428170fda944a5b19f743bb8`; profiler source pin is
`ac2e137dca65ea3b09d997774f17dd8907b489fb`. The public package started from the
official ADTC template commit `63ddc5422404f8ee112fc74d28e29764acd40a50`.

## Development compatibility measurement

One Darwin x86_64 `--skip-accuracy` development run measured 13.8 generation tok/s,
6333.56 ms time-to-first-token, peak RSS 1867.53 MB, steady RSS 1779.84 MB, and CPU
p99 77.3%. Parsed parameters were 1,777,088,000 and matched the model. Accuracy was
skipped. RSS is the meaningful physical-memory footprint here; VMS is platform-specific
virtual address space and must not be compared with installed RAM or Linux results.

This is not Standard Laptop evidence, not an official score, and not proof of the
required Ubuntu 22.04 x86-64 / 4 vCPU / 8 GB DDR4 / integrated-graphics run. That run
and accuracy evaluation remain pending.
