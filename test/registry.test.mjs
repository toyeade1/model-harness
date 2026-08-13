import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadRegistry, validateRegistry } from '../src/registry.mjs';

const requiredLanes = [
  'ask',
  'cheap',
  'code',
  'kimi',
  'deepseek',
  'deepseek_pro',
  'gemini',
  'grok',
  'free',
  'codex',
  'hard',
  'review',
  'claude'
];

const requiredAliases = [
  'ask',
  'code',
  'cheap',
  'free',
  'kimi',
  'deepseek',
  'deepseek-pro',
  'gemini',
  'grok',
  'codex',
  'claude',
  'review',
  'hard'
];

test('built-in registry lanes, aliases, and fallbacks resolve', async () => {
  const { registry, warnings, errors } = await loadRegistry({ includeUserConfig: false });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);

  for (const lane of requiredLanes) {
    assert.ok(registry.lanes[lane], `missing lane ${lane}`);
    assert.ok(registry.models[registry.lanes[lane]], `lane ${lane} points to missing model`);
  }

  for (const alias of requiredAliases) {
    assert.ok(registry.commandAliases[alias], `missing alias ${alias}`);
    assert.ok(registry.lanes[registry.commandAliases[alias]], `alias ${alias} points to missing lane`);
  }

  for (const [modelId, model] of Object.entries(registry.models)) {
    assert.equal(model.allowAgentWrites, false, `${modelId} should not allow agent writes in v1`);
    for (const fallbackId of model.fallbacks ?? []) {
      assert.ok(registry.models[fallbackId], `${modelId} fallback ${fallbackId} missing`);
    }
  }

  assert.deepEqual(validateRegistry(registry).errors, []);
});

test('user config shallow-merges lanes and model overrides', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mh-config-'));
  const userConfigPath = path.join(dir, 'config.json');
  await writeFile(
    userConfigPath,
    JSON.stringify({
      surprise: true,
      lanes: { code: 'kimi_k27_code' },
      modelOverrides: { deepseek_flash: { fallbacks: ['gemini_flash_latest'] } }
    })
  );

  const { registry, warnings, errors } = await loadRegistry({ userConfigPath });

  assert.deepEqual(errors, []);
  assert.equal(registry.lanes.code, 'kimi_k27_code');
  assert.deepEqual(registry.models.deepseek_flash.fallbacks, ['gemini_flash_latest']);
  assert.ok(warnings.some((warning) => warning.includes('surprise')));
});

test('invalid user config returns diagnostics without throwing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mh-invalid-config-'));
  const userConfigPath = path.join(dir, 'config.json');
  await writeFile(userConfigPath, '{ broken json');

  const result = await loadRegistry({ userConfigPath });

  assert.equal(result.registry, null);
  assert.ok(result.errors.some((error) => error.includes(userConfigPath)));
});

