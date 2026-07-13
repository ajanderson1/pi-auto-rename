# Pi Auto Rename — Design

**Date:** 2026-07-11  
**Status:** Approved design

## Purpose

Build an AJ-owned Pi extension that assigns concise session names after enough conversation context exists. It replaces the removed third-party `pi-auto-rename` package without depending on that package or on `pi-title-renamer`.

## Scope

The extension only manages Pi session display names. It does not change terminal titles, rename files, alter prompts in the active session, or provide project-local configuration.

## User-visible behavior

### Automatic rename

- A completed exchange is one user message followed by the assistant run settling. Internal model/tool-loop turns do not count as separate exchanges.
- After the third completed exchange, the extension generates a name if the current session remains unnamed.
- Every generated name is converted to ALL CAPS immediately before it is applied.
- Automatic rename never overwrites a name set manually or by another extension.
- If generation fails, the extension leaves the session unnamed, shows a warning when UI is available, and retries after a later completed exchange.
- Resuming an unnamed session that already has at least three completed exchanges does not trigger work at startup; it becomes eligible after the next completed exchange.

### `/auto-rename`

- With no arguments, generate a name immediately from the completed exchanges currently available.
- Manual invocation may replace an existing session name.
- At least one completed user→assistant exchange is required. Otherwise, notify the user and make no model call.

### `/auto-rename model`

- With exactly `model`, open an interactive picker containing only models scoped into the current Pi session.
- Resolve that scope from the session's `--models` argument when present; otherwise use Pi's effective `enabledModels` configuration.
- Never fall back to the full model registry when the session scope is empty.
- Mark the currently configured naming model in the picker.
- Persist the chosen provider and model ID globally.
- When no interactive UI exists, explain that the direct form is required.

### `/auto-rename model <provider>/<id>`

- Validate the exact provider/model pair against Pi's model registry.
- Verify that credentials are available before persisting it.
- Reject invalid or unavailable models loudly and keep the previous configuration.
- Command argument completion offers `model`, then scoped `provider/id` values. Direct input may still select an exact unscoped model.

## Naming model and configuration

Configuration lives at `~/.pi/agent/auto-rename.json`:

```json
{
  "provider": "opencode-go",
  "id": "glm-5.2"
}
```

`opencode-go/glm-5.2` is the default when no config exists. The extension does not silently fall back to the active conversation model or another provider. A missing model, missing credentials, malformed configuration, or failed write produces a visible warning and preserves the last valid in-memory configuration.

Configuration writes are atomic: write a sibling temporary file, then rename it into place.

## Name generation

The naming request contains:

- the working-directory basename;
- the user and assistant text from up to the first three completed exchanges on the active branch;
- an instruction to return only a descriptive session name of 3–8 words.

Tool results, reasoning blocks, images, and extension-only entries are excluded. Individual message text is bounded before constructing the request so unusually large early turns cannot create an excessive naming prompt.

The generated name is sanitised before applying it:

1. take text content only;
2. use the first non-empty line;
3. remove surrounding quotes, Markdown heading/list markers, and labels such as `Title:`;
4. collapse whitespace;
5. truncate to 60 characters at a word boundary when possible;
6. reject an empty result.

After sanitisation, the controller converts the result to ALL CAPS at the final application boundary. The model request has a 15-second timeout and is abort-aware. The extension calls Pi's model registry for the exact configured model and credentials, invokes `complete()` from `@earendil-works/pi-ai`, and applies a successful result with `pi.setSessionName()`.

## Components

- `src/index.ts` — extension registration, event wiring, command handling, notifications, and in-flight guard.
- `src/config.ts` — default configuration, validation, loading, and atomic persistence.
- `src/conversation.ts` — active-branch completed-exchange extraction and bounded naming context.
- `src/generator.ts` — exact-model resolution, authenticated model call, timeout, and output extraction.
- `src/title.ts` — prompt construction and deterministic title sanitisation.
- `src/models.ts` — exact model parsing, validation, and completion items.
- `src/session-models.ts` — current-session scope discovery and scoped-model resolution.

Each component exposes a narrow interface and is unit-testable without launching Pi.

## Event flow

1. `agent_settled` fires after Pi has no retry, compaction, or queued continuation left.
2. The extension scans the active branch and counts completed user→assistant exchanges.
3. It exits when fewer than three exist, a session name already exists, or generation is already in flight.
4. It resolves the configured model and credentials, builds bounded context, and generates a title.
5. It rechecks that the session is still unnamed before applying the automatic result, preventing a late model response from overwriting a name set while generation was running.
6. It uppercases the title, applies it with `pi.setSessionName()`, and notifies the user when UI is available.

The command flow reuses the same generator but deliberately permits replacement of an existing name. Commands wait for Pi to become idle before reading the branch or mutating the session.

## Error handling

- Invalid configuration: warn and use the documented default only when no previous valid in-memory configuration exists.
- Missing configured model or credentials: warn; never fall back silently.
- Timeout, cancellation, provider failure, or empty output: leave the name unchanged and warn.
- Persistence failure: do not claim the model changed; retain the previous configuration.
- Concurrent automatic/manual requests: one generation at a time per extension instance; a manual request reports that generation is already running rather than racing.
- UI-less modes: no prompts; errors are returned through deterministic command behavior and logged without crashing Pi.

## Packaging and installation

The extension is a standalone MIT-licensed Git repository at `~/GitHub/agent-toolkit/pi-extensions/pi-auto-rename/`, intended for the GitHub repository `ajanderson1/pi-auto-rename`.

The package uses pnpm, TypeScript, Vitest, and Biome. `package.json` declares Pi resources under `pi.extensions` and lists Pi runtime packages as peer dependencies. It is installed from Git through `agent-toolkit-cli pi-extension add`, then projected globally with `agent-toolkit-cli pi-extension install -g`.

## Verification

Automated tests cover:

- completed-exchange counting ignores internal tool turns;
- automatic trigger occurs at three exchanges;
- automatic mode protects existing names and rechecks before apply;
- manual mode can replace an existing name and works with fewer than three exchanges;
- zero-exchange manual invocation performs no model call;
- command parsing, session-scoped picker/completion filtering, and direct model IDs;
- model selection validation and persistence rollback on failure;
- malformed config behavior and atomic writes;
- prompt bounding and exclusion of non-text content;
- title sanitisation and 60-character truncation;
- timeout, provider error, missing credentials, and empty-output handling;
- in-flight request deduplication.

An integration harness loads the built extension through Pi, verifies `/auto-rename` is registered, selects a fake model/provider, simulates three completed exchanges, and confirms the session name changes exactly once. Installation verification confirms the Git-backed extension is present in the global toolkit inventory and loaded by Pi.

## Out of scope

- Project-local configuration.
- Renaming terminal tabs or cmux workspaces.
- Periodic renaming after the initial automatic name.
- Automatic fallback to another model.
- Publishing to npm.
