import { fileURLToPath } from 'node:url';

export const MH_BIN = fileURLToPath(new URL('../bin/mh', import.meta.url));

export const MCP_INSTALL_COMMANDS = [
  `codex mcp add mh -- ${MH_BIN} mcp serve`,
  `claude mcp add mh -- ${MH_BIN} mcp serve`,
  `opencode mcp add mh -- ${MH_BIN} mcp serve`
];

export function renderHelp() {
  return `mh - local model harness

Usage:
  mh help
  mh setup
  mh doctor [--json]
  mh models [--json]
  mh route [--json] <task>
  mh brain [--dry-run] [--json] <task>
  mh ask|cheap|code|free|kimi|deepseek|deepseek-pro|gemini|grok <task>
  mh codex|claude|hard|review [--dry-run] [--json] <task>
  mh mcp serve

Brain:
  mh brain chooses a lane from task signals and prints the chosen model before running it.
  Use --dry-run to see the command without a live model call.

MCP install:
  ${MCP_INSTALL_COMMANDS.join('\n  ')}

Config:
  Built-in registry: config/model-registry.json
  User overrides: ~/.config/mh/config.json
`;
}

export function renderSetup() {
  return `mh setup

1. Connect OpenCode to OpenRouter or OpenCode Go/Zen:
   opencode
   /connect

2. Verify credentials:
   opencode auth list

3. Optional user config:
   mkdir -p ~/.config/mh
   cp config/config.example.json ~/.config/mh/config.json

4. Add mh to agent clients:
   ${MCP_INSTALL_COMMANDS.join('\n   ')}
`;
}
