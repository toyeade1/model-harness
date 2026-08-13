import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runDoctor } from '../src/doctor.mjs';

test('doctor includes stderr when opencode auth list fails', async () => {
  function spawnSyncImpl(command, args) {
    if (command === 'which') {
      return { status: 0, stdout: `/usr/bin/${args[0]}\n`, stderr: '' };
    }
    if (command === 'opencode' && args.join(' ') === 'auth list') {
      return { status: 1, stdout: '', stderr: 'Error: Unexpected error\n\nno such column: name\n' };
    }
    return { status: 0, stdout: '', stderr: '' };
  }

  const result = await runDoctor({
    spawnSyncImpl,
    registryOptions: { includeUserConfig: false }
  });

  const authCheck = result.checks.find((check) => check.name === 'opencode auth');
  assert.equal(authCheck.ok, false);
  assert.match(authCheck.detail, /opencode auth list failed/);
  assert.match(authCheck.detail, /no such column: name/);
});
