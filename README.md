# model-harness

`mh` is a local daily-driver model harness for routing tasks across OpenCode/OpenRouter models, Codex, and Claude.

It gives you one command surface:

```sh
bin/mh help
bin/mh brain --dry-run "fix the failing tests"
bin/mh kimi --dry-run "implement this parser"
bin/mh review --dry-run "review uncommitted changes"
```

## Setup

Install dependencies:

```sh
npm install
```

Connect OpenCode to OpenRouter or OpenCode Go/Zen:

```sh
opencode
/connect
opencode auth list
```

Optional config:

```sh
mkdir -p ~/.config/mh
cp config/config.example.json ~/.config/mh/config.json
```

## Commands

```sh
mh help
mh setup
mh doctor [--json]
mh models [--json]
mh route [--json] <task>
mh brain [--dry-run] [--json] <task>
mh ask|cheap|code|free|kimi|deepseek|deepseek-pro|gemini|grok <task>
mh codex|claude|hard|review [--dry-run] [--json] <task>
mh mcp serve
```

Use `--dry-run` to inspect the selected model command without making a live model call.

## Default Lanes

- `cheap`, `ask`, `deepseek`: free DeepSeek V4 Flash through OpenCode
- `code`: Grok through OpenCode Go
- `kimi`: Kimi K2.7 Code
- `deepseek-pro`: DeepSeek V4 Pro
- `gemini`: currently routes to Qwen3.7 Plus as the OpenCode Go visual/document fallback
- `grok`: Grok 4.5
- `free`: OpenCode free lane
- `codex`, `hard`: Codex escalation
- `claude`: Claude planning/review escalation
- `review`: Codex review

## Agent Integration

Add `mh` as an MCP server:

```sh
codex mcp add mh -- /Users/toyea/Desktop/model-harness/.worktrees/mh-v1/bin/mh mcp serve
claude mcp add mh -- /Users/toyea/Desktop/model-harness/.worktrees/mh-v1/bin/mh mcp serve
opencode mcp add mh -- /Users/toyea/Desktop/model-harness/.worktrees/mh-v1/bin/mh mcp serve
```

When this branch is merged back to `/Users/toyea/Desktop/model-harness`, use:

```sh
codex mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
claude mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
opencode mcp add mh -- /Users/toyea/Desktop/model-harness/bin/mh mcp serve
```

## Safety

MCP delegation is read-only in v1.

- `mh_delegate_task` refuses `allowWrites: true`.
- MCP calls to Codex/Claude are blocked unless `allowRecursiveEscalation` is explicitly true.
- Delegated OpenCode calls use the `explore` agent.
- Tool results redact token-like secrets.

## Verify

```sh
npm test
bin/mh help
bin/mh models --json
bin/mh route --json "analyze this screenshot and suggest UI fixes"
bin/mh brain --dry-run "fix the failing tests"
bin/mh doctor --json
```
