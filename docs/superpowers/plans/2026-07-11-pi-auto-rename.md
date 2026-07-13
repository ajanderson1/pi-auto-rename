# Pi Auto Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, publish, register, and globally install an AJ-owned Pi extension that names unnamed sessions after three completed user→assistant exchanges and exposes `/auto-rename` plus `/auto-rename model`.

**Architecture:** A small TypeScript Pi package separates deterministic configuration, conversation extraction, title formatting, model selection, and orchestration. `src/index.ts` wires the pure modules to Pi's `agent_settled` event and command API; model calls use the exact configured registry model through `@earendil-works/pi-ai.complete()` with no fallback.

**Tech Stack:** Node.js 20+, TypeScript strict mode, pnpm, Vitest, Biome, Pi extension API, GitHub Actions, agent-toolkit-cli.

## Global Constraints

- A completed exchange is one user message followed by at least one assistant text response; internal tool/model-loop messages remain within that exchange.
- Automatic rename begins at three completed exchanges and never overwrites an existing name.
- Manual `/auto-rename` requires one completed exchange and may overwrite an existing name.
- Default naming model is exactly `opencode-go/glm-5.2`; missing models or credentials fail visibly with no fallback.
- Configuration path is exactly `~/.pi/agent/auto-rename.json`, written atomically.
- Generated names are 3–8 words when the model complies and are sanitised to one line and at most 60 characters.
- Model calls time out after 15 seconds and respect cancellation.
- The extension changes Pi session display names only, never terminal/cmux titles.
- Every authored commit includes `Device: $(hostname -s)`.

---

## File map

- `package.json` — package metadata, Pi resource declaration, and canonical scripts.
- `pnpm-lock.yaml` — reproducible dependency graph.
- `tsconfig.json` — strict no-emit TypeScript checking.
- `biome.json` — formatting and lint rules.
- `AGENTS.md` — project facts and canonical commands.
- `TESTING.md` — declares the R0 verification rung.
- `verify.sh` — R0 runner and evidence capture.
- `src/config.ts` — config path, parsing, loading, and atomic saving.
- `src/conversation.ts` — completed-exchange extraction and bounded text conversion.
- `src/title.ts` — prompt construction and title sanitisation.
- `src/models.ts` — registry listing, model parsing, validation, selection data, and completions.
- `src/generator.ts` — authenticated, timeout-bound title model call.
- `src/controller.ts` — automatic/manual orchestration with deduplication and late-name protection.
- `src/index.ts` — Pi event and command registration only.
- `tests/*.test.ts` — behavioral unit/integration tests by module.
- `tests/helpers.ts` — small Pi API/context fakes and session-entry builders.
- `tests/fixtures/get-commands.rpc.jsonl` — deterministic RPC command-discovery smoke input.
- `README.md` — installation, commands, config, behavior, and architecture.
- `.github/workflows/ci.yml` — pnpm install plus `./verify.sh 0`.
- `.github/workflows/release-please.yml` and release-please config files — version/tag automation.
- `.github/workflows/release.yml` — GitHub release on `v*.*.*` tags.

---

### Task 1: Project foundation and atomic configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `AGENTS.md`
- Create: `TESTING.md`
- Create: `verify.sh`
- Create: `src/config.ts`
- Create: `tests/config.test.ts`
- Generate: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `NamingModelConfig { provider: string; id: string }`
- Produces: `DEFAULT_CONFIG`, `getConfigPath(homeDir?)`, `loadConfig(options?)`, and `saveConfig(config, options?)`
- `loadConfig` returns `{ config, warnings }`; a missing file is the default with no warning.

- [ ] **Step 1: Create package/tooling metadata and install dependencies**

Use package name `@ajanderson1/pi-auto-rename`, version `0.1.0`, `type: module`, `private: true`, Node `>=20`, and Pi manifest `{ "extensions": ["./src/index.ts"] }`. Add scripts `check`, `lint`, `format`, `typecheck`, `test`, and `test:watch`. Runtime peer dependencies are `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` with `*`; dev dependencies include those packages plus TypeScript, Vitest, Biome, and Node types.

Create the initial `verify.sh` as Bash with `set -euo pipefail`, rung validation (`${1:-0}` must equal `0`), and `pnpm check`; Task 5 adds durable evidence capture after the checks exist.

Run:

```bash
pnpm install
chmod +x verify.sh
```

Expected: `pnpm-lock.yaml` exists and install exits 0.

- [ ] **Step 2: Write failing config tests**

Tests must assert:

```typescript
expect(getConfigPath("/tmp/home")).toBe("/tmp/home/.pi/agent/auto-rename.json");
expect((await loadConfig({ homeDir, fs: fakeMissingFs })).config).toEqual(DEFAULT_CONFIG);
expect((await loadConfig({ homeDir, fs: fakeMalformedFs })).warnings).toHaveLength(1);
await saveConfig({ provider: "anthropic", id: "claude-haiku-4-5" }, { homeDir, fs: recordingFs });
expect(recordingFs.operations).toEqual(["mkdir", "write-temp", "rename"]);
```

Run: `pnpm vitest run tests/config.test.ts`  
Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement minimal configuration module**

Use:

```typescript
export interface NamingModelConfig { provider: string; id: string }
export const DEFAULT_CONFIG = { provider: "opencode-go", id: "glm-5.2" } as const;
export interface LoadedConfig { config: NamingModelConfig; warnings: string[] }
```

Validate that parsed JSON is a non-array object with non-empty string `provider` and `id`. `saveConfig` creates the parent directory, writes JSON plus a trailing newline to `auto-rename.json.tmp-<pid>`, then renames it over the target. Remove the temporary file on write/rename failure when possible and rethrow.

- [ ] **Step 4: Verify config green and foundation checks**

Run:

```bash
pnpm vitest run tests/config.test.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json biome.json AGENTS.md TESTING.md verify.sh src/config.ts tests/config.test.ts
git commit -m "feat: add extension foundation and config" -m "Device: $(hostname -s)"
```

---

### Task 2: Conversation extraction and title formatting

**Files:**
- Create: `src/conversation.ts`
- Create: `src/title.ts`
- Create: `tests/conversation.test.ts`
- Create: `tests/title.test.ts`

**Interfaces:**
- Produces: `Exchange { user: string; assistant: string }`
- Produces: `collectCompletedExchanges(entries, options?)`, defaulting to the first three exchanges and 4,000 characters per side.
- Produces: `buildTitlePrompt(projectName, exchanges)` and `sanitizeTitle(raw, maxChars?)`.

- [ ] **Step 1: Write failing conversation tests**

Cover a branch containing user, assistant text/tool call, tool result, second assistant text, then the next user. Assert the first exchange concatenates only assistant text and counts once. Also assert images, thinking blocks, tool results, custom entries, and whitespace-only responses are ignored; long message text is bounded.

Run: `pnpm vitest run tests/conversation.test.ts`  
Expected: FAIL because exports are missing.

- [ ] **Step 2: Implement minimal conversation extraction**

Walk `SessionEntry[]` in order. Start a candidate on a `message` entry whose role is `user`; append text blocks from later `assistant` message entries until the next user; finalise only when both sides contain non-empty text. Ignore all other roles and entry types. Preserve multiple assistant text responses inside one exchange, separated by newlines.

- [ ] **Step 3: Verify conversation green**

Run: `pnpm vitest run tests/conversation.test.ts`  
Expected: all conversation tests pass.

- [ ] **Step 4: Write failing title tests**

Assert prompt content includes the project basename and numbered exchanges, asks for only a 3–8 word name, and excludes absent data. Assert sanitisation converts `### Title: "Fix   auth\nextra"` to `Fix auth`, rejects empty/marker-only output, and truncates a >60-character string at a word boundary.

Run: `pnpm vitest run tests/title.test.ts`  
Expected: FAIL because title exports are missing.

- [ ] **Step 5: Implement prompt and sanitiser**

The sanitiser uses the first non-empty line, strips Markdown heading/list prefixes, strips a case-insensitive `Title:`/`Session:` label, removes one matching pair of surrounding quotes/backticks, collapses whitespace, and truncates to 60 characters. Throw `Error("Naming model returned an empty session name")` when nothing remains.

- [ ] **Step 6: Verify and commit**

```bash
pnpm vitest run tests/conversation.test.ts tests/title.test.ts
pnpm check
git add src/conversation.ts src/title.ts tests/conversation.test.ts tests/title.test.ts
git commit -m "feat: extract exchanges and format names" -m "Device: $(hostname -s)"
```

Expected: tests and checks pass before commit.

---

### Task 3: Model selection and authenticated generation

**Files:**
- Create: `src/models.ts`
- Create: `src/generator.ts`
- Create: `tests/models.test.ts`
- Create: `tests/generator.test.ts`

**Interfaces:**
- Produces: `formatModelSpec(config)`, `parseModelSpec(spec)`, `listAvailableModels(registry)`, `validateModel(registry, config)`, and `getModelArgumentCompletions(prefix, models)`.
- Produces: `generateSessionName(ctx, config, exchanges, options?)` returning a sanitised string.
- `options.complete` and `options.timeoutMs` allow deterministic tests without network calls.

- [ ] **Step 1: Write failing model-selection tests**

Assert parsing requires exactly non-empty `provider/id`; available models are sorted by provider then ID; direct selection rejects a model absent from `registry.find`; credential validation rejects `{ ok: false }`; completions offer `model` first and then matching `model provider/id` values.

Run: `pnpm vitest run tests/models.test.ts`  
Expected: FAIL because `src/models.ts` is missing.

- [ ] **Step 2: Implement model helpers**

Use `ModelRegistry.getAvailable()` for picker/completion data, `find(provider, id)` for exact lookup, and `getApiKeyAndHeaders(model)` for live credential validation. Do not substitute `ctx.model` or any other model.

- [ ] **Step 3: Verify model helpers green**

Run: `pnpm vitest run tests/models.test.ts`  
Expected: all model tests pass.

- [ ] **Step 4: Write failing generator tests**

Tests inject a fake `complete` function and assert it receives the exact configured model, prompt, API key/headers, and signal. Cover successful sanitisation, registry miss, auth failure, empty response, provider error, caller cancellation, and a short test timeout.

Run: `pnpm vitest run tests/generator.test.ts`  
Expected: FAIL because `src/generator.ts` is missing.

- [ ] **Step 5: Implement minimal generator**

Resolve and authenticate the configured model, build the prompt from `path.basename(ctx.cwd)`, link `ctx.signal` into a private `AbortController`, race `complete()` against a 15-second timeout, extract text blocks, and call `sanitizeTitle`. Always remove abort listeners and clear the timer in `finally`.

- [ ] **Step 6: Verify and commit**

```bash
pnpm vitest run tests/models.test.ts tests/generator.test.ts
pnpm check
git add src/models.ts src/generator.ts tests/models.test.ts tests/generator.test.ts
git commit -m "feat: select naming model and generate titles" -m "Device: $(hostname -s)"
```

---

### Task 4: Pi command and automatic rename orchestration

**Files:**
- Create: `src/controller.ts`
- Create: `src/index.ts`
- Create: `tests/helpers.ts`
- Create: `tests/controller.test.ts`
- Create: `tests/index.test.ts`

**Interfaces:**
- Produces: `createAutoRenameController(pi, dependencies?)` with `refresh(ctx)`, `handleAgentSettled(ctx)`, `handleCommand(args, ctx)`, and `getArgumentCompletions(prefix)`.
- `src/index.ts` registers `session_start`, `agent_settled`, and command `auto-rename`.

- [ ] **Step 1: Write failing controller tests for automatic behavior**

Using fake Pi/context objects, assert fewer than three exchanges do nothing; exactly three generate once; an existing name skips generation; a name set while generation is pending wins the late-result recheck; a failed generation warns and can retry on the next settled event; concurrent generation is deduplicated.

Run: `pnpm vitest run tests/controller.test.ts`  
Expected: FAIL because controller exports are missing.

- [ ] **Step 2: Implement automatic controller behavior**

Maintain one `inFlight` promise per extension instance and a cached valid config/model list. `handleAgentSettled` checks `pi.getSessionName()` before and after generation, requires three completed exchanges, applies with `pi.setSessionName()`, and converts errors to warning notifications without throwing into Pi.

- [ ] **Step 3: Write failing command tests**

Assert empty args wait for idle, require one exchange, and replace an existing name. Assert `model` opens a picker only with UI; direct `model provider/id` validates credentials and persists before updating cached config; persistence failures keep the previous config; unknown args show exact usage. Assert completion contains `model` and matching model specs after refresh.

Run: `pnpm vitest run tests/controller.test.ts`  
Expected: new command tests fail for missing behavior.

- [ ] **Step 4: Implement command behavior**

Use exact usage text `Usage: /auto-rename [model [provider/id]]`. The picker items are `provider/id` strings sorted deterministically, with ` (current)` appended only to the displayed label. Direct selection stores the raw provider/id pair. In UI-less mode, `model` emits `Use /auto-rename model <provider>/<id>` through the controller logger.

- [ ] **Step 5: Write failing registration test**

Capture fake `pi.on` and `pi.registerCommand` calls. Assert `agent_settled` and `session_start` handlers exist; command name is `auto-rename`; description mentions immediate rename and model selection; calling command completion with `mo` returns `model`.

Run: `pnpm vitest run tests/index.test.ts`  
Expected: FAIL because `src/index.ts` is missing.

- [ ] **Step 6: Register the extension and verify**

`src/index.ts` must contain only dependency construction and registrations. On `session_start`, call controller refresh; on `agent_settled`, call automatic handling; the command delegates handler and completion to the controller.

Run:

```bash
pnpm vitest run tests/controller.test.ts tests/index.test.ts
pnpm check
```

Expected: all tests and checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/controller.ts src/index.ts tests/helpers.ts tests/controller.test.ts tests/index.test.ts
git commit -m "feat: register automatic and manual renaming" -m "Device: $(hostname -s)"
```

---

### Task 5: Documentation, CI, release automation, and verification evidence

**Files:**
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release-please.yml`
- Create: `.github/workflows/release.yml`
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Modify: `TESTING.md`
- Modify: `verify.sh`
- Create: `tests/fixtures/get-commands.rpc.jsonl`

**Interfaces:**
- Canonical verification command: `./verify.sh 0`.
- Evidence output: `assets/verification/0/verify.log` and `assets/verification/0/verdict.md`.

- [ ] **Step 1: Write README and project-facing docs**

Document Git installation, agent-toolkit installation, all three command forms, automatic/manual overwrite rules, config JSON, default model/no-fallback policy, development commands, architecture, and MIT license. Keep README sections in canonical order and link to the design rather than duplicating it.

- [ ] **Step 2: Finish R0 verification harness**

`verify.sh` is Bash with `set -euo pipefail`, accepts only rung `0`, creates `assets/verification/0`, pipes `pnpm check` through `tee`, preserves failure through `pipefail`, and writes a one-line PASS verdict only after checks succeed. `TESTING.md` declares R0 as the highest supported rung and states there is no visual surface.

- [ ] **Step 3: Add GitHub automation**

CI uses Node 20 and pnpm with frozen lockfile, then runs `./verify.sh 0` and uploads `assets/verification/`. Release Please manages `package.json` as a Node release starting at `0.1.0`; tag workflow creates a generated-notes GitHub release and does not publish npm.

- [ ] **Step 4: Run full verification and inspect evidence**

```bash
./verify.sh 0
test -s assets/verification/0/verify.log
grep -q '^PASS' assets/verification/0/verdict.md
```

Expected: exit 0, all tests pass, typecheck/lint are clean, and evidence files exist.

- [ ] **Step 5: Run Pi load smoke test**

Create `tests/fixtures/get-commands.rpc.jsonl` containing one RPC request followed by a shutdown request:

```jsonl
{"type":"get_commands","id":"commands-1"}
{"type":"abort","id":"abort-1"}
```

Run:

```bash
pi -e ./src/index.ts --mode rpc < tests/fixtures/get-commands.rpc.jsonl
```

Expected: RPC `get_commands` output contains extension command `auto-rename` and no extension load error. Save filtered output to `assets/verification/0/pi-load-smoke.log`.

- [ ] **Step 6: Commit**

```bash
git add README.md TESTING.md verify.sh tests/fixtures/get-commands.rpc.jsonl .github release-please-config.json .release-please-manifest.json
git commit -m "docs: add verification and release workflow" -m "Device: $(hostname -s)"
```

---

### Task 6: Independent review, publish, toolkit registration, and global install

**Files:**
- Modify only files required by confirmed review findings.
- External state: GitHub repository, global pi-extension lock, and Pi global settings.

- [ ] **Step 1: Run an independent code review**

Review the full branch against the design for correctness, race conditions, Pi API misuse, command behavior, test gaps, and accidental fallback behavior. Fix only confirmed findings with a failing regression test first, then rerun `./verify.sh 0`.

- [ ] **Step 2: Create and push the public GitHub repository**

From the feature branch after it is integrated into local `main`:

```bash
gh repo create ajanderson1/pi-auto-rename --public --source=. --remote=origin --push
```

Expected: `origin` points to `git@github.com:ajanderson1/pi-auto-rename.git` and GitHub main matches local main.

- [ ] **Step 3: Configure repository automation**

Enable write workflow permissions, Dependabot, and branch protection required checks after the first CI run. Confirm GitHub Actions CI passes.

- [ ] **Step 4: Register and globally install through agent-toolkit**

Push before registration, then run:

```bash
agent-toolkit-cli pi-extension add ajanderson1/pi-auto-rename --owned
agent-toolkit-cli pi-extension install pi-auto-rename -g
```

Expected: the global toolkit list reports `pi-auto-rename` as store-owned and globally loaded.

- [ ] **Step 5: Final live verification**

Run:

```bash
agent-toolkit-cli pi-extension status pi-auto-rename -g
pi list
```

Then start a fresh Pi session, confirm `/auto-rename` completion exists, run `/auto-rename model` and select `opencode-go/glm-5.2`, complete three user→assistant exchanges, and confirm the session name is set exactly once. Capture command/status evidence under `assets/verification/0/` locally without committing ignored artifacts.
