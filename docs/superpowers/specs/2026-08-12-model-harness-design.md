# Model Harness Design

## Goal

Build a local daily-driver command called `mh` that can launch and route work across OpenCode, OpenRouter-hosted models, Codex, and Claude. It should work directly from a terminal and also expose an MCP server so Codex, Claude Code, and OpenCode can call the same routing capabilities as tools.

The primary use case is fast model rotation for coding and research workflows:

- Use cheap/open models by default for routine tasks.
- Escalate to Codex, Claude, Grok, Gemini, Kimi, or DeepSeek when the task benefits from their strengths.
- Keep routing transparent, configurable, and easy to override.

## Architecture

`mh` has three layers:

1. CLI entrypoint: `bin/mh`
2. Shared router/config layer: model registry, capability scoring, command construction, diagnostics
3. MCP server: `mh mcp serve`, exposing read-only and delegated-task tools to agents

The CLI and MCP server share the same config and router so behavior stays consistent whether the user runs `mh brain "..."` or Codex calls the MCP `mh_route_task` tool.

## Provider Execution Boundary

In v1, OpenRouter, OpenCode Go, and OpenCode Zen model lanes execute through OpenCode, not through direct provider HTTP APIs. This keeps credentials in OpenCode's existing auth store and avoids adding a second API client layer.

Provider adapters:

- `opencode`: runs `opencode run --model <model> --agent explore --dir <cwd> --format json <prompt>` for MCP delegated read-only work, `opencode run --model <model> --dir <cwd> --format json <prompt>` for human CLI noninteractive work, and `opencode --model <model> <project>` for human interactive work when no prompt is provided.
- `codex`: runs `codex exec --sandbox read-only` for MCP delegated read-only work, `codex exec` for human CLI hard tasks, and `codex review --uncommitted <prompt>` when a registry entry has `mode: "review"`. If the user passes a review target later, map it explicitly to `--base` or `--commit`.
- `claude`: runs `claude -p --permission-mode plan` for MCP delegated read-only planning/review work, `claude -p` for human CLI delegated analysis, and `claude` for human interactive use.

The shared router returns an adapter plus arguments, not just a model ID. That command construction result is what the CLI executes and what MCP tools can return in dry-run mode.

Direct OpenRouter HTTP calls are out of scope for v1. They can be added later as a separate `openrouter_api` adapter if usage logging, streaming control, or direct API fallback becomes important.

## CLI Commands

The first version should include:

- `mh help`: show commands, setup steps, lanes, examples, and MCP install commands
- `mh setup`: print guided setup for OpenRouter/OpenCode Go/Zen credentials
- `mh doctor`: check local dependencies, auth state, and config validity
- `mh models`: print configured lanes and model capability metadata
- `mh brain [prompt]`: choose a model based on task requirements and run it
- `mh route [prompt]`: print only the routing decision, without running a model
- `mh ask [prompt]`: lightweight question lane
- `mh code [prompt]`: default coding lane
- `mh cheap [prompt]`: cheapest capable lane
- `mh free [prompt]`: free/experimental lane
- `mh kimi [prompt]`: Kimi coding lane
- `mh deepseek [prompt]`: DeepSeek lane
- `mh gemini [prompt]`: Gemini lane
- `mh grok [prompt]`: Grok lane
- `mh codex [prompt]`: Codex escalation lane
- `mh claude [prompt]`: Claude escalation lane
- `mh hard [prompt]`: hard-task escalation lane
- `mh deepseek-pro [prompt]`: stronger DeepSeek lane
- `mh review [prompt]`: review lane, defaulting to Codex or Claude
- `mh mcp serve`: start a local stdio MCP server

`mh route`, `mh models`, and `mh doctor` support `--json` for machine-readable output. `mh brain` and fixed lane commands support `--dry-run` to print the command without executing it.

Command-to-lane aliases:

- `mh ask`: `ask`
- `mh code`: `code`
- `mh cheap`: `cheap`
- `mh free`: `free`
- `mh kimi`: `kimi`
- `mh deepseek`: `deepseek`
- `mh gemini`: `gemini`
- `mh grok`: `grok`
- `mh codex`: `codex`
- `mh claude`: `claude`
- `mh review`: `review`
- `mh hard`: `hard`
- `mh deepseek-pro`: `deepseek_pro`

## Default Model Lanes

Initial configurable defaults map lane names to registry entry IDs:

- `cheap`: `deepseek_flash`
- `ask`: `deepseek_flash`
- `code`: `grok_build`
- `kimi`: `kimi_k27_code`
- `deepseek`: `deepseek_flash`
- `deepseek_pro`: `deepseek_pro`
- `gemini`: `gemini_flash_latest`
- `grok`: `grok_latest`
- `free`: `openrouter_free`
- `codex`: `codex_exec`
- `hard`: `codex_exec`
- `review`: `codex_review`
- `claude`: `claude_sonnet`

The model IDs should live in config rather than code so pricing, availability, and preference changes do not require editing the launcher.

## Model Registry

The registry is a structured JSON file, not only a lane-to-model map. The object key is the stable model ID; do not duplicate it in a separate `id` field. Each model entry includes:

- `adapter`: `opencode`, `codex`, or `claude`
- `model`: provider-specific model string, when applicable
- `mode`: optional adapter mode such as `review`
- `name`: human-readable display name
- `capabilities`: capability tags used by the router
- `costTier`: `free`, `low`, `medium`, `high`, or `subscription`
- `contextTokens`: approximate context window when known
- `inputCostPerMTok` and `outputCostPerMTok`: optional reference pricing
- `defaultFor`: task tags this model should prefer
- `fallbacks`: ordered model IDs to try when the primary fails before starting
- `allowAgentWrites`: whether an agent-facing delegated run may use this model for write-capable tasks

Lane entries point to model registry IDs. User config can override lanes and selected model fields without replacing the entire built-in registry.
In v1, `allowAgentWrites` is reserved for future use and all built-in entries set it to `false`.

Example built-in registry entries:

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
    "cheap": "deepseek_flash",
    "ask": "deepseek_flash",
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
  }
}
```

Every `lanes` value and every `fallbacks` entry must resolve to a registry key. `mh doctor` should warn on unresolved IDs, and tests should fail on unresolved IDs in the built-in registry.

## Router Behavior

`mh brain` should be deterministic and explainable. It scores the task against capability tags and then picks a lane.

Signals:

- Prompt keywords and requested action
- Current directory and git repository status
- Whether prompt mentions screenshots, PDFs, images, frontend visuals, tests, logs, architecture, review, or risky edits
- Budget preference: `cheap`, `balanced`, `quality`
- Write permission preference: default no writes for agent-called tools unless explicitly enabled

Capability tags:

- `coding`
- `agentic_coding`
- `reasoning`
- `review`
- `vision`
- `documents`
- `long_context`
- `cheap`
- `fast`
- `tool_use`
- `safe_repo_edits`
- `architecture`

Example routing rules:

- Routine code, test triage, repo summary: DeepSeek V4 Flash
- Multi-file implementation: Grok Build or Kimi
- Screenshot/PDF/visual task: Gemini
- Careful architecture or ambiguous refactor: Claude
- Risky edit, security review, or final code review: Codex or Claude
- User explicitly names a model/lane: respect the override

The router should print:

- Selected lane
- Selected command
- Main reasons
- Estimated cost tier
- Warnings, such as missing credentials or recursive escalation risk

## MCP Tools

The MCP server exposes:

- `mh_help`: read-only help and command summary
- `mh_list_models`: read-only model registry with costs, capabilities, and lanes
- `mh_route_task`: read-only routing decision for a task
- `mh_delegate_task`: run a selected or routed model noninteractively
- `mh_review`: run the configured review lane
- `mh_doctor`: read-only environment and auth diagnostics

Tool input/output contracts:

- `mh_help`
  - Input: `{ "topic"?: "commands" | "models" | "setup" | "mcp" | "routing" }`
  - Output: `{ "text": string }`
- `mh_list_models`
  - Input: `{ "includeDisabled"?: boolean }`
  - Output: `{ "lanes": object, "models": object }`
- `mh_route_task`
  - Input: `{ "task": string, "cwd"?: string, "budget"?: "cheap" | "balanced" | "quality", "allowWrites"?: boolean, "preferredLane"?: string }`
  - Output: `{ "lane": string, "modelId": string, "adapter": string, "command": string[], "reasons": string[], "warnings": string[] }`
- `mh_delegate_task`
  - Input: `{ "task": string, "cwd"?: string, "lane"?: string, "budget"?: "cheap" | "balanced" | "quality", "allowWrites"?: boolean, "allowRecursiveEscalation"?: boolean, "timeoutMs"?: number, "dryRun"?: boolean }`
  - Output: `{ "ok": boolean, "routing": object, "stdout"?: string, "stderr"?: string, "exitCode"?: number, "error"?: string }`
- `mh_review`
  - Input: `{ "task"?: string, "cwd"?: string, "target"?: string, "allowWrites"?: false, "allowRecursiveEscalation"?: boolean }`
  - Output: `{ "ok": boolean, "stdout"?: string, "stderr"?: string, "exitCode"?: number, "error"?: string }`
- `mh_doctor`
  - Input: `{ "cwd"?: string }`
  - Output: `{ "ok": boolean, "checks": array, "warnings": string[] }`

Safety defaults:

- `mh_route_task`, `mh_help`, `mh_list_models`, and `mh_doctor` are read-only.
- `mh_delegate_task` defaults to analysis-only. Analysis-only means the delegated prompt instructs the selected agent to inspect, explain, summarize, plan, or review without editing files, running destructive commands, committing, pushing, installing dependencies, or changing external services.
- MCP delegation is read-only in v1. If `allowWrites` is true, `mh_delegate_task` returns a structured error explaining that write-capable MCP delegation is not implemented yet.
- Read-only is enforced by adapter flags, not only by prompt text: OpenCode uses `--agent explore`, Codex uses `--sandbox read-only`, and Claude uses plan-mode noninteractive execution. If an adapter cannot produce a read-only command, `mh_delegate_task` must refuse to run that adapter from MCP.
- `mh_review` is always read-only in v1. It must not apply edits.
- `mh_delegate_task` blocks recursive escalation without needing to identify the caller: when `allowRecursiveEscalation` is false, MCP delegation refuses any route whose adapter is `codex` or `claude`, including `codex` entries with `mode: "review"`. Agent clients can still route to OpenCode/OpenRouter lanes such as Kimi, DeepSeek, Gemini, Grok, Qwen, and free/cheap lanes. If `allowRecursiveEscalation` is true, the tool may return or run Codex/Claude commands and must include a warning.
- `mh_review` follows the same recursion rule as `mh_delegate_task`. When called through MCP, it refuses the default Codex/Claude review lane unless `allowRecursiveEscalation` is true; without escalation it can return the would-run command and recommend running `mh review` from the human CLI.
- Tool outputs must not include secrets or API keys.
- The MCP server should use clear tool descriptions and input schemas so agent clients know when to call each tool.
- Delegated tools default to a 10 minute timeout, configurable per call up to 60 minutes.
- Cancellation is handled by MCP client process cancellation or local process termination; no background job queue is required in v1.

## Config

User config lives at `~/.config/mh/config.json`. Project-local overrides can later be added at `.mh/config.json`, but v1 can keep project-local config optional.

Example:

```json
{
  "defaultCommand": "brain",
  "budget": "balanced",
  "explainRouting": true,
  "providers": {
    "primary": "openrouter"
  },
  "lanes": {
    "cheap": "deepseek_flash",
    "ask": "deepseek_flash",
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
  "modelOverrides": {
    "deepseek_flash": {
      "fallbacks": ["gemini_flash_latest"]
    }
  }
}
```

The built-in registry should be versioned in the project under `config/model-registry.json`. User config at `~/.config/mh/config.json` is merged on top. Invalid JSON or unknown fields should produce clear diagnostics in `mh doctor`; unknown fields should warn but not fail unless they affect a selected lane.

## Integration Commands

After scaffolding, `mh help` should show:

```sh
codex mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
claude mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
opencode mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
```

## Error Handling

- Missing `opencode`, `codex`, or `claude`: show actionable install/status guidance.
- Missing OpenCode auth: show `opencode auth list` and `/connect` guidance.
- Unknown lane/model: show valid lanes and config path.
- Empty prompt: launch interactive TUI for human commands when appropriate; reject empty delegated MCP tasks.
- Non-git directory for Codex noninteractive commands: add clear guidance, and only pass `--skip-git-repo-check` when the user explicitly configures it.
- Config parse error: fail fast with file path, line/column when available, and fallback guidance.
- Model command nonzero exit: return exit code, stderr tail, and the attempted adapter/model.
- Network, rate limit, or provider unavailable: report the failure and suggest the configured fallback lane; automatic fallback should only happen before a model begins making changes.
- Unavailable model ID: show the selected model string and suggest `opencode models <provider>` or `mh models`.
- Context limit risk: warn when a task references large repo/file scope and selected context window is lower than the configured threshold.
- Timeout: terminate the child process and return a timeout error with the configured timeout.

## Testing

Use lightweight command-level tests:

- `mh help` exits 0 and includes key commands.
- `mh route` returns deterministic choices for sample prompts.
- `mh models` includes configured lanes.
- `mh doctor` handles missing credentials without failing hard.
- MCP server exposes expected tool names and JSON schemas.
- `mh route --json` emits stable JSON for sample routing fixtures.
- MCP schema snapshot tests cover tool input and output contracts.
- Snapshot tests include concrete shapes for `routing`, `checks`, `lanes`, and `models` objects.
- Tests cover command aliases, built-in lane resolution, fallback resolution, adapter read-only command construction, `mh_delegate_task allowWrites=true`, and unresolved lane/fallback IDs.

Avoid live paid model calls in default tests. Use dry-run mode and command construction tests.

## Initial Scope

In v1, implement the shell/Node local harness and stdio MCP server. Do not build a web UI, benchmark dashboard, or long-term cost database yet.
