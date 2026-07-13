#!/usr/bin/env bash
set -euo pipefail

rung="${1:-0}"
if [[ "$rung" != "0" ]]; then
  printf 'Unsupported verification rung: %s (supported: 0)\n' "$rung" >&2
  exit 2
fi

pnpm check
