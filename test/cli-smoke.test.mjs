import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const mh = fileURLToPath(new URL('../bin/mh', import.meta.url));

function runMh(args) {
  return spawnSync(mh, args, {
    encoding: 'utf8'
  });
}

function assertShowsPlaceholderHelp(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^mh\b/);
  assert.match(result.stdout, /implementation is in progress/i);
}

test('help commands print placeholder help and exit 0', () => {
  for (const args of [[], ['help'], ['--help'], ['-h']]) {
    assertShowsPlaceholderHelp(runMh(args));
  }
});

test('unimplemented commands exit 1 with scaffold error', () => {
  const result = runMh(['not-a-real-command']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /command not implemented yet: not-a-real-command/);
  assert.match(result.stderr, /Run mh help/);
});
