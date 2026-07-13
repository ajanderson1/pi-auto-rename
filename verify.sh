#!/usr/bin/env bash
set -euo pipefail

rung="${1:-0}"
if [[ "$rung" != "0" ]]; then
  printf 'Unsupported verification rung: %s (supported: 0)\n' "$rung" >&2
  exit 2
fi

artifacts_dir="${ARTIFACTS_DIR:-assets/verification}/0"
log_file="$artifacts_dir/verify.log"
verdict_file="$artifacts_dir/verdict.md"
mkdir -p "$artifacts_dir"

if pnpm check 2>&1 | tee "$log_file"; then
  printf 'PASS — R0 lint, strict types, and tests pass.\n' > "$verdict_file"
else
  status=$?
  printf 'FAIL — R0 verification failed; inspect verify.log.\n' > "$verdict_file"
  exit "$status"
fi
