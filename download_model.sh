#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$repo_root/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
url=https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
expected_bytes=1117320768
expected_sha=cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "sha256sum or shasum is required for model verification" >&2
    return 1
  fi
}

verify() {
  test "$(wc -c < "$1" | tr -d ' ')" = "$expected_bytes" &&
    test "$(sha256 "$1")" = "$expected_sha"
}

if test "${1-}" = --verify-file; then
  test "$#" = 2 && verify "$2"
  exit
fi
test "$#" = 0
mkdir -p "$(dirname "$target")"
if test -e "$target"; then
  verify "$target" || { echo "existing model failed byte/SHA-256 verification" >&2; exit 1; }
  echo "verified existing model: $target"
  exit
fi
tmp=$(mktemp "$target.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT HUP INT TERM
curl -fL --retry 3 --output "$tmp" "$url"
verify "$tmp" || { echo "download failed byte/SHA-256 verification" >&2; exit 1; }
mv "$tmp" "$target"
trap - EXIT HUP INT TERM
echo "downloaded and verified: $target"
