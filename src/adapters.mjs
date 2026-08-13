import { spawn } from 'node:child_process';

export const DEFAULT_TIMEOUT_MS = 600000;
export const MAX_TIMEOUT_MS = 3600000;

export function normalizeTimeoutMs(timeoutMs) {
  if (timeoutMs == null) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(timeoutMs);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, MAX_TIMEOUT_MS);
}

export function supportsMcpReadOnly(adapter) {
  return adapter === 'opencode' || adapter === 'codex' || adapter === 'claude';
}

export function buildCommand(route, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const prompt = options.prompt;
  const surface = options.surface ?? 'cli';
  const model = route.model;

  if (route.adapter === 'opencode') {
    if (surface === 'mcp') {
      return [
        'opencode',
        'run',
        '--model',
        model.model,
        '--agent',
        'explore',
        '--dir',
        cwd,
        '--format',
        'json',
        prompt ?? ''
      ];
    }
    if (prompt) {
      return ['opencode', 'run', '--model', model.model, '--dir', cwd, '--format', 'json', prompt];
    }
    return ['opencode', '--model', model.model, cwd];
  }

  if (route.adapter === 'codex') {
    if (route.mode === 'review') {
      return ['codex', 'review', '--uncommitted', prompt ?? 'Review uncommitted changes.'];
    }
    if (surface === 'mcp') {
      return ['codex', 'exec', '--sandbox', 'read-only', '-C', cwd, prompt ?? ''];
    }
    if (prompt) {
      return ['codex', 'exec', '-C', cwd, prompt];
    }
    return ['codex', '-C', cwd];
  }

  if (route.adapter === 'claude') {
    if (surface === 'mcp') {
      return ['claude', '-p', '--permission-mode', 'plan', prompt ?? ''];
    }
    if (prompt) {
      return ['claude', '-p', prompt];
    }
    return ['claude'];
  }

  throw new Error(`Unsupported adapter: ${route.adapter}`);
}

export function runCommand(command, options = {}) {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner;

  if (runner) {
    return runner(command, { cwd, timeoutMs });
  }

  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, exitCode: null, error: error.message });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, stdout, stderr, exitCode, error: `Command timed out after ${timeoutMs}ms.` });
        return;
      }
      resolve({ ok: exitCode === 0, stdout, stderr, exitCode });
    });
  });
}
