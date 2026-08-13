import { spawnSync } from 'node:child_process';

import { loadRegistry, validateRegistry } from './registry.mjs';

function commandExists(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return {
    name: command,
    ok: result.status === 0,
    detail: result.status === 0 ? result.stdout.trim() : `${command} not found on PATH`
  };
}

export async function runDoctor(options = {}) {
  const registryResult = await loadRegistry(options.registryOptions ?? {});
  const checks = [
    commandExists('opencode'),
    commandExists('codex'),
    commandExists('claude')
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

  const openCodeAuth = spawnSync('opencode', ['auth', 'list'], { encoding: 'utf8' });
  checks.push({
    name: 'opencode auth',
    ok: openCodeAuth.status === 0 && !openCodeAuth.stdout.includes('0 credentials'),
    detail: openCodeAuth.status === 0 ? 'opencode auth list ran' : 'opencode auth list failed'
  });
  if (openCodeAuth.status === 0 && openCodeAuth.stdout.includes('0 credentials')) {
    warnings.push('OpenCode has no credentials. Run opencode, then /connect.');
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    warnings,
    errors: registryResult.errors
  };
}
