# Pi Auto Rename

[![CI](https://github.com/ajanderson1/pi-auto-rename/actions/workflows/ci.yml/badge.svg)](https://github.com/ajanderson1/pi-auto-rename/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)](https://www.typescriptlang.org/)

Automatically give Pi sessions concise, useful names after three completed exchanges.

## Overview

Pi Auto Rename names an unnamed session once it has enough context: three completed user→assistant exchanges. Internal tool loops do not inflate the count, and automatic naming never overwrites a name you or another extension already set.

The `/auto-rename` command can rename immediately. Its `model` subcommand selects the exact model used for naming. There is no silent fallback to the active conversation model.

## Installation

Requires Node.js 22.19.0 or newer, matching Pi's runtime requirement.

Add the owned Git repository to the agent-toolkit library, then project it into Pi globally:

```bash
agent-toolkit-cli pi-extension add ajanderson1/pi-auto-rename --owned
agent-toolkit-cli pi-extension install pi-auto-rename -g
```

Restart Pi or run `/reload` in an existing Pi session.

Direct Pi installation is also supported:

```bash
pi install git:github.com/ajanderson1/pi-auto-rename
```

## Quickstart

1. Start a fresh Pi session.
2. Complete three user→assistant exchanges.
3. Pi Auto Rename assigns a session name once, provided the session is still unnamed.

To rename immediately after at least one completed exchange:

```text
/auto-rename
```

## Usage

| Command | Behavior |
|---|---|
| `/auto-rename` | Generate a name now; may replace the current session name. |
| `/auto-rename model` | Open an interactive picker and persist the naming model. |
| `/auto-rename model provider/id` | Validate and persist an exact model directly. |

Examples:

```text
/auto-rename model
/auto-rename model opencode-go/glm-5.2
/auto-rename model anthropic/claude-haiku-4-5
```

Automatic generation retries after a later completed exchange if a provider call fails. A late automatic result rechecks the current session name before applying, so a manual name always wins.

## Configuration

Global configuration lives at `~/.pi/agent/auto-rename.json`:

```json
{
  "provider": "opencode-go",
  "id": "glm-5.2"
}
```

`opencode-go/glm-5.2` is the default. The configured model must exist in Pi's model registry and have credentials. Missing models, missing credentials, malformed configuration, timeouts, and provider errors are reported visibly; the extension never substitutes another model.

## Architecture

The extension separates branch extraction, title formatting, model resolution, generation, persistence, and Pi event wiring into focused modules under `src/`. See the [approved design](docs/superpowers/specs/2026-07-11-pi-auto-rename-design.md) for behavior and failure semantics.

## Contributing

```bash
pnpm install
./verify.sh 0
```

Pi loads TypeScript extension sources directly, so there is no build step.

## License

[MIT](LICENSE) © AJ Anderson
