import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function jsonFrom(args) {
  const result = runCli(args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('help and setup include command and MCP guidance', () => {
  const help = runCli(['help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /mh brain/);
  assert.match(help.stdout, /mh mcp serve/);
  assert.match(help.stdout, /codex mcp add mh/);

  const setup = runCli(['setup']);
  assert.equal(setup.status, 0);
  assert.match(setup.stdout, /\/connect/);
  assert.match(setup.stdout, /OpenRouter/);
  assert.match(setup.stdout, /OpenCode Go\/Zen/);
  assert.match(setup.stdout, /opencode auth list/);
});

test('JSON commands expose registry and deterministic routes', () => {
  const models = jsonFrom(['models', '--json']);
  assert.equal(models.lanes.kimi, 'kimi_k27_code');
  assert.ok(models.models.deepseek_flash);

  const route = jsonFrom(['route', '--json', 'analyze screenshot']);
  assert.equal(route.modelId, 'gemini_flash_latest');

  const doctor = jsonFrom(['doctor', '--json']);
  assert.equal(typeof doctor.ok, 'boolean');
  assert.ok(Array.isArray(doctor.checks));
});

test('lane aliases support dry-run without live model calls', () => {
  const deepseek = jsonFrom(['deepseek-pro', '--dry-run', '--json', 'hard bug']);
  assert.equal(deepseek.modelId, 'deepseek_pro');
  assert.ok(deepseek.command.includes('opencode-go/deepseek-v4-pro'));

  const review = jsonFrom(['review', '--dry-run', '--json', 'review uncommitted']);
  assert.equal(review.modelId, 'codex_review');
  assert.deepEqual(review.command.slice(0, 3), ['codex', 'review', '--uncommitted']);

  const kimi = jsonFrom(['kimi', '--dry-run', '--json', 'implement parser']);
  assert.equal(kimi.modelId, 'kimi_k27_code');
  assert.ok(kimi.command.includes('opencode-go/kimi-k2.7-code'));
});
