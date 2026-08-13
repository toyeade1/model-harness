import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const mh = fileURLToPath(new URL('../bin/mh', import.meta.url));

function runMh(args) {
  return spawnSync(mh, args, {
    encoding: 'utf8'
  });
}

function assertShowsHelp(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^mh\b/);
  assert.match(result.stdout, /mh brain/);
  assert.match(result.stdout, /mh mcp serve/);
}

test('help commands print help and exit 0', () => {
  for (const args of [[], ['help'], ['--help'], ['-h']]) {
    assertShowsHelp(runMh(args));
  }
});

test('unknown commands exit 1 with a concise error', () => {
  const result = runMh(['not-a-real-command']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown command: not-a-real-command/);
  assert.match(result.stderr, /Run mh help/);
});

test('global symlink invocation resolves project sources', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mh-global-bin-'));
  const linkedMh = path.join(dir, 'mh');
  await symlink(mh, linkedMh);

  const result = spawnSync(linkedMh, ['help'], {
    encoding: 'utf8'
  });

  assertShowsHelp(result);
});
