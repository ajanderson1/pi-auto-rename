# Testing

## Supported rungs

| Rung | Command | Coverage | Evidence |
|---|---|---|---|
| R0 — unit/in-process | `./verify.sh 0` | Formatting, lint, strict types, unit tests, real Pi RPC command loading, and fake-provider automatic naming after three exchanges | `assets/verification/0/verify.log`, `assets/verification/0/verdict.md`, `assets/verification/0/pi-*.log` |

R0 is the highest supported rung. The extension has no browser or other visual surface.

## Fixtures

Unit tests use in-memory Pi API/context fakes and temporary directories. `tests/fixtures/get-commands.rpc.jsonl` drives real Pi RPC command discovery. `scripts/integration-smoke.mjs` runs Pi against a deterministic in-process faux provider, selects that naming model, completes four exchanges, and verifies the session is named exactly once after exchange three. Automated tests make no network calls.

## Escalation

If R0 cannot load the installed Pi types or register the command against the current Pi API, attach the files under `assets/verification/0/` when escalating.
