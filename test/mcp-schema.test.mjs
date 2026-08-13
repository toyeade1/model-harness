import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createToolHandlers, TOOL_DEFINITIONS, TOOL_NAMES } from '../src/mcp-server.mjs';

test('exports expected MCP tool definitions and schemas', () => {
  assert.deepEqual(TOOL_NAMES, [
    'mh_help',
    'mh_list_models',
    'mh_route_task',
    'mh_delegate_task',
    'mh_review',
    'mh_doctor'
  ]);

  for (const name of TOOL_NAMES) {
    assert.ok(TOOL_DEFINITIONS[name], `missing definition for ${name}`);
    assert.ok(TOOL_DEFINITIONS[name].inputSchema, `missing input schema for ${name}`);
  }

  assert.ok(TOOL_DEFINITIONS.mh_delegate_task.inputSchema.shape.allowRecursiveEscalation);
  assert.ok(TOOL_DEFINITIONS.mh_review.inputSchema.shape.allowRecursiveEscalation);
});

test('MCP handlers enforce safety contracts without live calls', async () => {
  const handlers = createToolHandlers();

  assert.equal((await handlers.mh_delegate_task({ task: '', dryRun: true })).structuredContent.ok, false);
  assert.equal((await handlers.mh_delegate_task({ task: 'edit files', allowWrites: true })).structuredContent.ok, false);
  assert.equal((await handlers.mh_review({ task: 'review this' })).structuredContent.ok, false);

  const delegated = await handlers.mh_delegate_task({ task: 'summarize failing tests', dryRun: true });
  assert.equal(delegated.structuredContent.ok, true);
  assert.equal(delegated.structuredContent.timeoutMs, 600000);
  assert.ok(delegated.structuredContent.timeoutMs <= 3600000);
  assert.deepEqual(Object.keys(delegated.structuredContent).sort(), [
    'ok',
    'routing',
    'stderr',
    'stdout',
    'timeoutMs'
  ]);
});

test('MCP tool output redacts token-like secrets', async () => {
  const handlers = createToolHandlers({
    runner: async () => ({
      ok: true,
      stdout: 'OPENAI_API_KEY=sk-secret ANTHROPIC_API_KEY=abc OPENROUTER_API_KEY=sk-or-v1-secret',
      stderr: '',
      exitCode: 0
    })
  });

  const result = await handlers.mh_delegate_task({
    task: 'summarize tests',
    dryRun: false
  });

  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /sk-secret/);
  assert.doesNotMatch(text, /sk-or-v1-secret/);
  assert.match(text, /\[REDACTED\]/);
});
