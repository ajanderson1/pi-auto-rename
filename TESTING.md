# Testing

## Supported rungs

| Rung | Command | Coverage | Evidence |
|---|---|---|---|
| R0 — unit/in-process | `./verify.sh 0` | Formatting, lint, strict types, unit tests, and in-process Pi extension registration tests | `assets/verification/0/verify.log`, `assets/verification/0/verdict.md` |

R0 is the highest supported rung. The extension has no browser or other visual surface.

## Fixtures

Tests use in-memory Pi API/context fakes and temporary directories. Model generation is injected; automated tests make no provider/network calls. `tests/fixtures/get-commands.rpc.jsonl` drives a real Pi RPC command-discovery smoke test without invoking a model.

## Escalation

If R0 cannot load the installed Pi types or register the command against the current Pi API, attach the files under `assets/verification/0/` when escalating.
