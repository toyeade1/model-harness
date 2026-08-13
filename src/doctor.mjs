import { spawnSync } from 'node:child_process';

import { loadRegistry, validateRegistry } from './registry.mjs';

function cleanOutput(text = '') {
  return String(text)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
}

function failureDetail(prefix, result) {
  const output = cleanOutput([result.stderr, result.stdout].filter(Boolean).join('\n'));
  return output ? `${prefix}: ${output}` : prefix;
}

function commandExists(command, spawnSyncImpl) {
  const result = spawnSyncImpl('which', [command], { encoding: 'utf8' });
  return {
    name: command,
    ok: result.status === 0,
    detail: result.status === 0 ? result.stdout.trim() : `${command} not found on PATH`
  };
}

export async function runDoctor(options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const registryResult = await loadRegistry(options.registryOptions ?? {});
  const checks = [
    commandExists('opencode', spawnSyncImpl),
    commandExists('codex', spawnSyncImpl),
    commandExists('claude', spawnSyncImpl)
  ];
  const warnings = [...registryResult.warnings];

  if (registryResult.registry) {
    const validation = validateRegistry(registryResult.registry);
    checks.push({
      name: 'model registry',
      ok: validation.ok,
      detail: validation.ok ? 'registry lanes and fallbacks resolve' : validation.errors.join('; ')
    });
  } else {
    checks.push({
      name: 'model registry',
      ok: false,
      detail: registryResult.errors.join('; ')
    });
  }

  const openCodeAuth = spawnSyncImpl('opencode', ['auth', 'list'], { encoding: 'utf8' });
  checks.push({
    name: 'opencode auth',
    ok: openCodeAuth.status === 0 && !openCodeAuth.stdout.includes('0 credentials'),
    detail:
      openCodeAuth.status === 0
        ? 'opencode auth list ran'
        : failureDetail('opencode auth list failed', openCodeAuth)
  });
  if (openCodeAuth.status === 0 && openCodeAuth.stdout.includes('0 credentials')) {
    warnings.push('OpenCode has no credentials. Run opencode, then /connect.');
  }
  if (openCodeAuth.status !== 0) {
    const output = cleanOutput(`${openCodeAuth.stderr ?? ''}\n${openCodeAuth.stdout ?? ''}`);
    if (/database is locked|no such column/i.test(output)) {
      warnings.push('OpenCode local database appears locked or schema-incompatible after upgrade.');
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    warnings,
    errors: registryResult.errors
  };
}
