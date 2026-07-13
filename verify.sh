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
pi_load_log="$artifacts_dir/pi-load-smoke.log"
integration_log="$artifacts_dir/pi-integration-smoke.log"
pi_agent_dir="$artifacts_dir/pi-agent"
mkdir -p "$artifacts_dir"
rm -rf "$pi_agent_dir"
mkdir -p "$pi_agent_dir"

run_verification() {
  pnpm check || return
  PI_CODING_AGENT_DIR="$pi_agent_dir" pnpm exec pi -e ./src/index.ts --mode rpc --no-session \
    < tests/fixtures/get-commands.rpc.jsonl > "$pi_load_log" || return
  node scripts/assert-pi-load.mjs "$pi_load_log" || return
  pnpm test:integration 2>&1 | tee "$integration_log" || return
}

if run_verification 2>&1 | tee "$log_file"; then
  printf 'PASS — R0 lint, strict types, unit tests, Pi loading, and automatic naming integration pass.\n' \
    > "$verdict_file"
else
  status=$?
  printf 'FAIL — R0 verification failed; inspect verify.log.\n' > "$verdict_file"
  exit "$status"
fi
