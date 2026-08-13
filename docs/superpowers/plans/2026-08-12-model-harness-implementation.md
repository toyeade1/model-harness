# Model Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local `mh` daily-driver CLI with a configurable model router and MCP server that lets the user and agent clients route tasks across OpenCode/OpenRouter, Codex, and Claude.

**Architecture:** Use a small Node.js ESM project. Keep registry/config loading, routing, adapter command construction, CLI parsing, and MCP tool registration in separate files so each unit is independently testable. Default tests use dry-run command construction and schema checks only; no live paid model calls.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `@modelcontextprotocol/sdk`, `zod`, existing local CLIs (`opencode`, `codex`, `claude`).

---

## Chunk 1: CLI, Router, Config, MCP Surface

### File Structure

- Create `package.json`: project metadata, bin mapping, test script, MCP SDK dependencies.
- Create `bin/mh`: executable shell wrapper that calls `node src/cli.mjs`.
- Create `config/model-registry.json`: built-in model registry and lane defaults from the spec.
- Create `config/config.example.json`: user override example.
- Create `src/registry.mjs`: load built-in registry, merge `~/.config/mh/config.json`, validate lanes/fallbacks.
- Create `src/router.mjs`: command aliases, task classification, route selection, JSON routing object.
- Create `src/adapters.mjs`: construct `opencode`, `codex`, `claude`, and review commands; run child processes with timeout.
- Create `src/help.mjs`: help/setup text shared by CLI and MCP.
- Create `src/cli.mjs`: parse args and implement `mh` commands.
- Create `src/mcp-server.mjs`: stdio MCP server exposing `mh_help`, `mh_list_models`, `mh_route_task`, `mh_delegate_task`, `mh_review`, `mh_doctor`.
- Create `test/registry.test.mjs`: built-in registry validation tests.
- Create `test/router.test.mjs`: deterministic route and command construction tests.
- Create `test/cli.test.mjs`: `mh help`, `models`, `route`, `doctor` command tests.
- Create `test/mcp-schema.test.mjs`: MCP tool schema/export tests without launching a paid model.
- Create `README.md`: quickstart, setup, commands, MCP install commands.

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `bin/mh`
- Create: `.gitignore`

- [ ] **Step 1: Write package metadata**

Create `package.json` with ESM, bin mapping, and tests:

```json
{
  "name": "model-harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "mh": "./bin/mh"
  },
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write executable wrapper**

Create `bin/mh`:

```sh
#!/usr/bin/env sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$SCRIPT_DIR/../src/cli.mjs" "$@"
```

- [ ] **Step 3: Ignore local/generated files**

Create `.gitignore` with:

```gitignore
node_modules/
.DS_Store
coverage/
*.log
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and install exits 0.

- [ ] **Step 5: Commit skeleton**

Run:

```sh
git add package.json package-lock.json bin/mh .gitignore
git commit -m "chore: scaffold model harness project"
```

### Task 2: Registry And Config

**Files:**
- Create: `config/model-registry.json`
- Create: `config/config.example.json`
- Create: `src/registry.mjs`
- Test: `test/registry.test.mjs`

- [ ] **Step 1: Write failing registry validation tests**

Test requirements:

- Built-in lanes include `ask`, `cheap`, `code`, `kimi`, `deepseek`, `deepseek_pro`, `gemini`, `grok`, `free`, `codex`, `hard`, `review`, `claude`.
- Every lane points to an existing model key.
- Every fallback points to an existing model key.
- `allowAgentWrites` is false for all built-ins.
- Built-in command aliases map `ask`, `code`, `cheap`, `free`, `kimi`, `deepseek`, `deepseek-pro`, `gemini`, `grok`, `codex`, `claude`, `review`, and `hard`.
- User config can override `lanes.code`, override a model fallback, and produce warnings for unknown top-level fields.
- Invalid JSON returns `{ registry: null, warnings: [...], errors: [...] }` without throwing out of CLI callers.

Run: `npm test -- test/registry.test.mjs`

Expected: FAIL because registry code does not exist.

- [ ] **Step 2: Add built-in registry JSON**

Populate `config/model-registry.json` with top-level `models`, `lanes`, and `commandAliases`. Use this exact shape:

```json
{
  "models": {
    "deepseek_flash": {
      "adapter": "opencode",
      "model": "openrouter/deepseek/deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "capabilities": ["coding", "long_context", "cheap", "fast"],
      "costTier": "low",
      "contextTokens": 1000000,
      "inputCostPerMTok": 0.08,
      "outputCostPerMTok": 0.252,
      "defaultFor": ["routine_code", "repo_summary", "test_triage"],
      "fallbacks": ["qwen_plus"],
      "allowAgentWrites": false
    },
    "grok_build": {
      "adapter": "opencode",
      "model": "openrouter/x-ai/grok-build-0.1",
      "name": "Grok Build 0.1",
      "capabilities": ["agentic_coding", "coding", "tool_use", "fast"],
      "costTier": "medium",
      "contextTokens": 262000,
      "inputCostPerMTok": 1,
      "outputCostPerMTok": 2,
      "defaultFor": ["implementation", "multi_file_edits"],
      "fallbacks": ["kimi_k27_code"],
      "allowAgentWrites": false
    },
    "kimi_k27_code": {
      "adapter": "opencode",
      "model": "openrouter/moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "capabilities": ["agentic_coding", "coding", "reasoning", "tool_use"],
      "costTier": "medium",
      "contextTokens": 262000,
      "inputCostPerMTok": 0.67,
      "outputCostPerMTok": 3.4,
      "defaultFor": ["implementation", "long_horizon_code"],
      "fallbacks": ["deepseek_flash"],
      "allowAgentWrites": false
    },
    "deepseek_pro": {
      "adapter": "opencode",
      "model": "openrouter/deepseek/deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "capabilities": ["coding", "reasoning", "long_context"],
      "costTier": "medium",
      "contextTokens": 1000000,
      "inputCostPerMTok": 0.435,
      "outputCostPerMTok": 0.87,
      "defaultFor": ["hard_debugging", "deep_reasoning"],
      "fallbacks": ["deepseek_flash"],
      "allowAgentWrites": false
    },
    "gemini_flash_latest": {
      "adapter": "opencode",
      "model": "openrouter/~google/gemini-flash-latest",
      "name": "Gemini Flash Latest",
      "capabilities": ["vision", "documents", "long_context", "coding"],
      "costTier": "high",
      "contextTokens": 1000000,
      "inputCostPerMTok": 1.5,
      "outputCostPerMTok": 7.5,
      "defaultFor": ["screenshots", "pdfs", "visual_frontend_review"],
      "fallbacks": ["qwen_plus"],
      "allowAgentWrites": false
    },
    "grok_latest": {
      "adapter": "opencode",
      "model": "openrouter/~x-ai/grok-latest",
      "name": "Grok Latest",
      "capabilities": ["reasoning", "coding", "stem", "knowledge_work"],
      "costTier": "high",
      "contextTokens": 500000,
      "inputCostPerMTok": 2,
      "outputCostPerMTok": 6,
      "defaultFor": ["hard_reasoning", "knowledge_work"],
      "fallbacks": ["deepseek_pro"],
      "allowAgentWrites": false
    },
    "qwen_plus": {
      "adapter": "opencode",
      "model": "openrouter/qwen/qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "capabilities": ["vision", "coding", "tool_use", "long_context"],
      "costTier": "medium",
      "contextTokens": 1000000,
      "inputCostPerMTok": 0.32,
      "outputCostPerMTok": 1.28,
      "defaultFor": ["vision_fallback", "general_multimodal"],
      "fallbacks": ["deepseek_flash"],
      "allowAgentWrites": false
    },
    "openrouter_free": {
      "adapter": "opencode",
      "model": "openrouter/openrouter/free",
      "name": "OpenRouter Free Router",
      "capabilities": ["cheap", "experimental"],
      "costTier": "free",
      "contextTokens": null,
      "defaultFor": ["low_stakes_exploration"],
      "fallbacks": ["deepseek_flash"],
      "allowAgentWrites": false
    },
    "codex_exec": {
      "adapter": "codex",
      "model": null,
      "name": "Codex Exec",
      "capabilities": ["reasoning", "safe_repo_edits", "review", "architecture"],
      "costTier": "subscription",
      "defaultFor": ["risky_changes", "hard_debugging"],
      "fallbacks": ["claude_sonnet"],
      "allowAgentWrites": false
    },
    "codex_review": {
      "adapter": "codex",
      "mode": "review",
      "model": null,
      "name": "Codex Review",
      "capabilities": ["review", "security_review", "safe_repo_edits"],
      "costTier": "subscription",
      "defaultFor": ["code_review", "security_review"],
      "fallbacks": ["claude_sonnet"],
      "allowAgentWrites": false
    },
    "claude_sonnet": {
      "adapter": "claude",
      "model": "sonnet",
      "name": "Claude Sonnet",
      "capabilities": ["architecture", "planning", "review", "careful_refactor"],
      "costTier": "subscription",
      "defaultFor": ["architecture", "ambiguous_requirements", "large_refactor"],
      "fallbacks": ["codex_exec"],
      "allowAgentWrites": false
    }
  },
  "lanes": {
    "ask": "deepseek_flash",
    "cheap": "deepseek_flash",
    "code": "grok_build",
    "kimi": "kimi_k27_code",
    "deepseek": "deepseek_flash",
    "deepseek_pro": "deepseek_pro",
    "gemini": "gemini_flash_latest",
    "grok": "grok_latest",
    "free": "openrouter_free",
    "codex": "codex_exec",
    "hard": "codex_exec",
    "review": "codex_review",
    "claude": "claude_sonnet"
  },
  "commandAliases": {
    "ask": "ask",
    "code": "code",
    "cheap": "cheap",
    "free": "free",
    "kimi": "kimi",
    "deepseek": "deepseek",
    "deepseek-pro": "deepseek_pro",
    "gemini": "gemini",
    "grok": "grok",
    "codex": "codex",
    "claude": "claude",
    "review": "review",
    "hard": "hard"
  }
}
```

Create `config/config.example.json` with this exact shape:

```json
{
  "defaultCommand": "brain",
  "budget": "balanced",
  "explainRouting": true,
  "lanes": {
    "code": "grok_build",
    "cheap": "deepseek_flash",
    "review": "codex_review"
  },
  "modelOverrides": {
    "deepseek_flash": {
      "fallbacks": ["gemini_flash_latest"]
    }
  }
}
```

- [ ] **Step 3: Implement registry loader**

`src/registry.mjs` exports:

```js
export function loadRegistry(options = {}) {}
export function validateRegistry(registry) {}
export function getCommandAliases(registry) {}
```

`loadRegistry` reads built-in JSON, optionally merges a user config path, and returns `{ registry, warnings }`.

Merge rules:

- `lanes`: shallow merge over built-in lanes.
- `modelOverrides`: shallow merge by model ID, then shallow merge model fields.
- unknown top-level fields: warning, not fatal.
- invalid JSON: return `errors` and no registry for CLI diagnostics.
- unresolved lanes/fallbacks: validation errors.

- [ ] **Step 4: Run registry tests**

Run: `npm test -- test/registry.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit registry**

Run:

```sh
git add config/model-registry.json config/config.example.json src/registry.mjs test/registry.test.mjs
git commit -m "feat: add model registry and validation"
```

### Task 3: Router And Adapters

**Files:**
- Create: `src/router.mjs`
- Create: `src/adapters.mjs`
- Test: `test/router.test.mjs`

- [ ] **Step 1: Write failing router tests**

Test route fixtures:

- `fix failing test` routes to `deepseek_flash` or `grok_build` with coding reason.
- `review this diff for security` routes to `codex_review`.
- `analyze this screenshot` routes to `gemini_flash_latest`.
- `use kimi to implement this` routes to `kimi_k27_code`.
- MCP delegated route with `allowRecursiveEscalation: false` refuses `codex`/`claude` adapters.
- `allowWrites: true` returns a structured unsupported error for MCP delegation.

Run: `npm test -- test/router.test.mjs`

Expected: FAIL because router code does not exist.

- [ ] **Step 2: Implement route selection**

`src/router.mjs` exports:

```js
export function routeTask(task, options = {}) {}
export function resolveLane(commandOrLane, registry) {}
```

Return shape:

```js
{
  lane,
  modelId,
  model,
  adapter,
  mode,
  command,
  reasons,
  warnings,
  costTier
}
```

- [ ] **Step 3: Implement adapter command builders**

`src/adapters.mjs` exports:

```js
export function buildCommand(route, options = {}) {}
export async function runCommand(command, options = {}) {}
```

Required dry-run commands:

- OpenCode MCP read-only: `opencode run --model <model> --agent explore --dir <cwd> --format json <prompt>`
- OpenCode CLI noninteractive: `opencode run --model <model> --dir <cwd> --format json <prompt>`
- OpenCode CLI interactive with no prompt: `opencode --model <model> <cwd>`
- Codex MCP read-only: `codex exec --sandbox read-only -C <cwd> <prompt>`
- Codex CLI noninteractive: `codex exec -C <cwd> <prompt>`
- Claude MCP read-only: `claude -p --permission-mode plan <prompt>`
- Claude CLI noninteractive: `claude -p <prompt>`
- Claude CLI interactive with no prompt: `claude`
- Codex review: `codex review --uncommitted <prompt>`

- [ ] **Step 4: Run router tests**

Run: `npm test -- test/router.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit router**

Run:

```sh
git add src/router.mjs src/adapters.mjs test/router.test.mjs
git commit -m "feat: add model router and adapters"
```

### Task 4: CLI

**Files:**
- Create: `src/help.mjs`
- Create: `src/cli.mjs`
- Test: `test/cli.test.mjs`

- [ ] **Step 1: Write failing CLI tests**

Test:

- `node src/cli.mjs help` exits 0 and includes `mh brain`, `mh mcp serve`, and MCP install commands.
- `node src/cli.mjs route --json "analyze screenshot"` returns JSON with `gemini_flash_latest`.
- `node src/cli.mjs models --json` returns lanes and models.
- `node src/cli.mjs doctor --json` exits 0 even if credentials are missing and reports warnings.
- `node src/cli.mjs setup` exits 0 and mentions `/connect`, OpenRouter, OpenCode Go/Zen, and `opencode auth list`.
- `node src/cli.mjs deepseek-pro --dry-run "hard bug"` includes `deepseek-v4-pro`.
- `node src/cli.mjs review --dry-run "review uncommitted"` includes `codex review --uncommitted`.
- `node src/cli.mjs kimi --dry-run "implement"` includes `kimi-k2.7-code`.
- Every command alias in the registry can be invoked with `--dry-run` or resolves to a non-running informational command.

Run: `npm test -- test/cli.test.mjs`

Expected: FAIL because CLI code does not exist.

- [ ] **Step 2: Implement help/setup text**

`src/help.mjs` exports `renderHelp`, `renderSetup`, and `MCP_INSTALL_COMMANDS`.

- [ ] **Step 3: Implement CLI parser**

Keep parsing simple and explicit. Support:

```sh
mh help
mh setup
mh doctor [--json]
mh models [--json]
mh route [--json] [prompt]
mh brain [--dry-run] [--json] [prompt]
mh <lane-command> [--dry-run] [--json] [prompt]
mh mcp serve
```

- [ ] **Step 4: Run CLI tests**

Run: `npm test -- test/cli.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit CLI**

Run:

```sh
git add src/help.mjs src/cli.mjs test/cli.test.mjs
git commit -m "feat: add mh command line interface"
```

### Task 5: MCP Server

**Files:**
- Create: `src/mcp-server.mjs`
- Test: `test/mcp-schema.test.mjs`

- [ ] **Step 1: Write failing MCP schema tests**

Test:

- Exported tool definitions include `mh_help`, `mh_list_models`, `mh_route_task`, `mh_delegate_task`, `mh_review`, `mh_doctor`.
- `mh_delegate_task` with `allowWrites: true` returns `ok: false`.
- `mh_review` without `allowRecursiveEscalation` returns `ok: false` for default Codex review route.
- Empty `mh_delegate_task` task returns `ok: false`.
- Default timeout is 600000 ms and max accepted timeout is 3600000 ms.
- Delegation refuses adapters without MCP read-only command support.
- `mh_delegate_task` output uses `{ ok, routing, stdout, stderr, exitCode, error }`.
- Tool result text redacts `sk-`, `sk-or-v1-`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENROUTER_API_KEY`-looking values.
- Tool schemas include every input field from the design spec.

Run: `npm test -- test/mcp-schema.test.mjs`

Expected: FAIL because MCP code does not exist.

- [ ] **Step 2: Implement MCP handlers**

`src/mcp-server.mjs` exports:

```js
export const TOOL_NAMES = [...]
export function createToolHandlers(deps = {}) {}
export async function serveMcp() {}
```

Handlers should call shared registry/router/adapter functions. Tool output must never include secrets.

- [ ] **Step 3: Register stdio server**

Use `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`. Register all six tools with Zod schemas.

- [ ] **Step 4: Run MCP tests**

Run: `npm test -- test/mcp-schema.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit MCP**

Run:

```sh
git add src/mcp-server.mjs test/mcp-schema.test.mjs
git commit -m "feat: expose mh as an MCP server"
```

### Task 6: Docs And Verification

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-08-12-model-harness-design.md` only if implementation discoveries require clarifying corrections.

- [ ] **Step 1: Write README**

Cover:

- What `mh` is
- Quickstart
- OpenCode/OpenRouter setup
- `mh help`
- `mh brain`
- Model lanes
- MCP install commands for Codex, Claude, and OpenCode
- Safety defaults

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run smoke commands**

Run:

```sh
bin/mh help
bin/mh models --json
bin/mh route --json "analyze this screenshot and suggest UI fixes"
bin/mh brain --dry-run "fix the failing tests"
bin/mh doctor --json
```

Expected: all exit 0. No live model calls occur except dry-run command construction.

- [ ] **Step 4: Commit docs and final verification**

Run:

```sh
git add README.md
git commit -m "docs: add model harness quickstart"
git status --short
```

Expected: clean working tree.
