# Testing

## Supported rungs

| Rung | Command | Coverage |
|---|---|---|
| R0 — unit/in-process | `./verify.sh 0` | Formatting, lint, strict types, unit tests, and in-process Pi extension registration tests |

R0 is the highest supported rung. The extension has no browser or other visual surface.

## Fixtures

Tests use in-memory Pi API/context fakes and temporary directories. Model generation is injected; automated tests make no provider/network calls.

## Escalation

If R0 cannot load the installed Pi types or register the command against the current Pi API, attach `assets/verification/0/verify.log` when escalating.
