import { buildCommand, normalizeTimeoutMs, supportsMcpReadOnly } from './adapters.mjs';

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function chooseLane(task, registry, preferredLane) {
  const requested = resolveLane(preferredLane, registry);
  if (requested) return { lane: requested, reasons: [`preferred lane: ${requested}`] };

  const text = task.toLowerCase();
  const explicitPairs = [
    ['deepseek-pro', 'deepseek_pro'],
    ['deepseek pro', 'deepseek_pro'],
    ['kimi', 'kimi'],
    ['gemini', 'gemini'],
    ['grok', 'grok'],
    ['claude', 'claude'],
    ['codex', 'codex'],
    ['deepseek', 'deepseek'],
    ['free', 'free'],
    ['cheap', 'cheap']
  ];

  for (const [needle, lane] of explicitPairs) {
    if (text.includes(needle)) return { lane, reasons: [`explicit ${lane} request`] };
  }

  if (includesAny(text, ['review', 'security', 'diff', 'pull request', 'pr '])) {
    return { lane: 'review', reasons: ['review/security task'] };
  }
  if (includesAny(text, ['screenshot', 'image', 'vision', 'pdf', 'visual', 'frontend review'])) {
    return { lane: 'gemini', reasons: ['visual or document task'] };
  }
  if (includesAny(text, ['architecture', 'ambiguous', 'large refactor', 'careful refactor'])) {
    return { lane: 'claude', reasons: ['architecture/planning task'] };
  }
  if (includesAny(text, ['implement', 'multi-file', 'agentic', 'build'])) {
    return { lane: 'code', reasons: ['implementation task'] };
  }
  if (includesAny(text, ['failing test', 'fix', 'test', 'repo summary', 'summarize repo'])) {
    return { lane: 'cheap', reasons: ['routine coding or repo task'] };
  }

  return { lane: 'ask', reasons: ['default lightweight question lane'] };
}

export function resolveLane(commandOrLane, registry) {
  if (!commandOrLane) return null;
  const aliases = registry.commandAliases ?? {};
  if (aliases[commandOrLane]) return aliases[commandOrLane];
  if (registry.lanes?.[commandOrLane]) return commandOrLane;
  return null;
}

export function routeTask(task, options = {}) {
  const registry = options.registry;
  if (!registry) throw new Error('routeTask requires a registry.');

  const cwd = options.cwd ?? process.cwd();
  const preferredLane = options.preferredLane ?? options.lane;
  const { lane, reasons } = chooseLane(task, registry, preferredLane);
  const modelId = registry.lanes[lane];
  if (!modelId || !registry.models[modelId]) {
    throw new Error(`Lane "${lane}" does not resolve to a model.`);
  }
  const model = registry.models[modelId];
  const route = {
    lane,
    modelId,
    model,
    adapter: model.adapter,
    mode: model.mode,
    reasons,
    warnings: [],
    costTier: model.costTier
  };

  route.command = buildCommand(route, {
    prompt: task,
    cwd,
    surface: options.surface ?? 'cli'
  });
  return route;
}

export function createDelegateResult(options = {}) {
  const task = options.task ?? '';
  if (!task.trim()) {
    return { ok: false, error: 'Task is required for mh_delegate_task.' };
  }
  if (options.allowWrites) {
    return { ok: false, error: 'Write-capable MCP delegation is not implemented in v1.' };
  }

  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const route = routeTask(task, {
    registry: options.registry,
    cwd: options.cwd,
    preferredLane: options.lane,
    budget: options.budget,
    surface: 'mcp'
  });

  if (!supportsMcpReadOnly(route.adapter)) {
    return { ok: false, routing: route, error: `Adapter "${route.adapter}" does not support MCP read-only delegation.` };
  }

  if (!options.allowRecursiveEscalation && (route.adapter === 'codex' || route.adapter === 'claude')) {
    return {
      ok: false,
      routing: route,
      error: 'Refusing recursive escalation to Codex/Claude from MCP. Set allowRecursiveEscalation to true to override.'
    };
  }

  const analysisPrompt = [
    'Analysis-only delegation. Do not edit files, install dependencies, commit, push, or change external services.',
    '',
    task
  ].join('\n');
  const command = buildCommand(route, {
    prompt: analysisPrompt,
    cwd: options.cwd,
    surface: 'mcp'
  });
  return {
    ok: true,
    routing: { ...route, command },
    stdout: '',
    stderr: '',
    timeoutMs
  };
}
