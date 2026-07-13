# AGENTS.md

Project-specific context. Global conventions: `~/.conventions/CONVENTIONS.md`.

## What

`pi-auto-rename` is an AJ-owned Pi extension that names unnamed sessions after three completed user→assistant exchanges and provides `/auto-rename` commands for manual naming and model selection.

## Stack constraints

The project follows the global TypeScript defaults: pnpm, Vitest, Biome, and strict TypeScript.

## Canonical commands

- dev: `pnpm test:watch`
- build: n/a (Pi loads TypeScript directly)
- test: `pnpm test`
- lint: `pnpm lint`
- format: `pnpm format`
- typecheck: `pnpm typecheck`
- verify: `./verify.sh 0`

## Where things live

- `src/` — extension implementation.
- `tests/` — behavior tests and Pi registration smoke fixtures.
- `docs/superpowers/specs/` — approved design.
- `docs/superpowers/plans/` — implementation plan.
- `assets/verification/` — ignored local verification evidence.

## Project glossary

- **Completed exchange** — one user message followed by at least one assistant text response; tool-loop turns remain part of the same exchange.
- **Naming model** — the exact configured provider/model used only to generate session names.

## In-flight

- Initial implementation follows `docs/superpowers/plans/2026-07-11-pi-auto-rename.md`.
