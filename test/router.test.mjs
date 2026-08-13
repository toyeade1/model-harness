import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCommand, formatCommandOutput } from '../src/adapters.mjs';
import { loadRegistry } from '../src/registry.mjs';
import { createDelegateResult, routeTask } from '../src/router.mjs';

async function registry() {
  const result = await loadRegistry({ includeUserConfig: false });
  assert.deepEqual(result.errors, []);
  return result.registry;
}

test('routes common tasks to expected model lanes', async () => {
  const loaded = await registry();

  assert.equal(routeTask('fix failing test in this repo', { registry: loaded }).modelId, 'deepseek_flash');
  assert.equal(routeTask('review this diff for security', { registry: loaded }).modelId, 'codex_review');
  assert.equal(routeTask('analyze this screenshot and suggest UI fixes', { registry: loaded }).modelId, 'gemini_flash_latest');
  assert.equal(routeTask('use kimi to implement this parser', { registry: loaded }).modelId, 'kimi_k27_code');
});

test('builds read-only and human command variants', async () => {
  const loaded = await registry();
  const cwd = '/tmp/example';

  const openCodeRoute = routeTask('fix failing test', { registry: loaded, cwd, preferredLane: 'cheap' });
  assert.deepEqual(buildCommand(openCodeRoute, { prompt: 'fix failing test', cwd, surface: 'mcp' }), [
    'opencode',
    'run',
    '--model',
    'opencode/deepseek-v4-flash-free',
    '--agent',
    'explore',
    '--dir',
    cwd,
    '--format',
    'json',
    'fix failing test'
  ]);
  assert.deepEqual(buildCommand(openCodeRoute, { prompt: 'fix failing test', cwd, surface: 'cli' }).slice(0, 4), [
    'opencode',
    'run',
    '--model',
    'opencode/deepseek-v4-flash-free'
  ]);
  assert.deepEqual(buildCommand(openCodeRoute, { cwd, surface: 'cli' }), [
    'opencode',
    '--model',
    'opencode/deepseek-v4-flash-free',
    cwd
  ]);

  const codexRoute = routeTask('hard architecture issue', { registry: loaded, cwd, preferredLane: 'hard' });
  assert.deepEqual(buildCommand(codexRoute, { prompt: 'hard architecture issue', cwd, surface: 'mcp' }), [
    'codex',
    'exec',
    '--sandbox',
    'read-only',
    '-C',
    cwd,
    'hard architecture issue'
  ]);

  const reviewRoute = routeTask('review uncommitted', { registry: loaded, cwd, preferredLane: 'review' });
  assert.deepEqual(buildCommand(reviewRoute, { prompt: 'review uncommitted', cwd, surface: 'cli' }), [
    'codex',
    'review',
    '--uncommitted',
    'review uncommitted'
  ]);
});

test('MCP delegation refuses writes and recursive escalation by default', async () => {
  const loaded = await registry();

  const writeResult = createDelegateResult({
    task: 'edit files',
    registry: loaded,
    allowWrites: true,
    dryRun: true
  });
  assert.equal(writeResult.ok, false);
  assert.match(writeResult.error, /write-capable MCP delegation is not implemented/i);

  const recursiveResult = createDelegateResult({
    task: 'review this diff',
    registry: loaded,
    lane: 'review',
    dryRun: true
  });
  assert.equal(recursiveResult.ok, false);
  assert.match(recursiveResult.error, /recursive escalation/i);
});

test('formats opencode JSON event output as readable text', () => {
  const route = {
    adapter: 'opencode'
  };
  const output = [
    JSON.stringify({ type: 'step_start' }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: 'Kimi is stronger for long coding tasks.' } }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: 'DeepSeek is cheaper for routine work.' } }),
    JSON.stringify({ type: 'step_finish' })
  ].join('\n');

  assert.equal(
    formatCommandOutput({ stdout: output, stderr: '' }, route),
    'Kimi is stronger for long coding tasks.\nDeepSeek is cheaper for routine work.\n'
  );
});
