import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { buildCommand, DEFAULT_TIMEOUT_MS, normalizeTimeoutMs, runCommand } from './adapters.mjs';
import { runDoctor } from './doctor.mjs';
import { renderHelp } from './help.mjs';
import { loadRegistry } from './registry.mjs';
import { createDelegateResult, routeTask } from './router.mjs';

export const TOOL_NAMES = [
  'mh_help',
  'mh_list_models',
  'mh_route_task',
  'mh_delegate_task',
  'mh_review',
  'mh_doctor'
];

const budgetSchema = z.enum(['cheap', 'balanced', 'quality']);

export const TOOL_DEFINITIONS = {
  mh_help: {
    title: 'MH Help',
    description: 'Read help for the local mh model harness.',
    inputSchema: z.object({
      topic: z.enum(['commands', 'models', 'setup', 'mcp', 'routing']).optional()
    })
  },
  mh_list_models: {
    title: 'List MH Models',
    description: 'List configured mh lanes and models.',
    inputSchema: z.object({
      includeDisabled: z.boolean().optional()
    })
  },
  mh_route_task: {
    title: 'Route MH Task',
    description: 'Choose an mh lane/model for a task without executing it.',
    inputSchema: z.object({
      task: z.string(),
      cwd: z.string().optional(),
      budget: budgetSchema.optional(),
      allowWrites: z.boolean().optional(),
      preferredLane: z.string().optional()
    })
  },
  mh_delegate_task: {
    title: 'Delegate MH Task',
    description: 'Run or dry-run a read-only delegated task through mh.',
    inputSchema: z.object({
      task: z.string(),
      cwd: z.string().optional(),
      lane: z.string().optional(),
      budget: budgetSchema.optional(),
      allowWrites: z.boolean().optional(),
      allowRecursiveEscalation: z.boolean().optional(),
      timeoutMs: z.number().optional(),
      dryRun: z.boolean().optional()
    })
  },
  mh_review: {
    title: 'MH Review',
    description: 'Run or explain the configured mh review lane.',
    inputSchema: z.object({
      task: z.string().optional(),
      cwd: z.string().optional(),
      target: z.string().optional(),
      allowWrites: z.literal(false).optional(),
      allowRecursiveEscalation: z.boolean().optional()
    })
  },
  mh_doctor: {
    title: 'MH Doctor',
    description: 'Check local mh dependencies and configuration.',
    inputSchema: z.object({
      cwd: z.string().optional()
    })
  }
};

function redactText(text = '') {
  return String(text)
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/(OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY)=\S+/g, '$1=[REDACTED]');
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}

function toolResult(structuredContent) {
  const redacted = redactValue(structuredContent);
  return {
    structuredContent: redacted,
    content: [{ type: 'text', text: JSON.stringify(redacted, null, 2) }]
  };
}

async function registryOrError() {
  const result = await loadRegistry();
  if (!result.registry) {
    return { error: result.errors.join('; ') || 'Unable to load registry.' };
  }
  return { registry: result.registry, warnings: result.warnings };
}

export function createToolHandlers(deps = {}) {
  const runner = deps.runner;

  return {
    mh_help: async ({ topic } = {}) => toolResult({ text: renderHelp(topic) }),

    mh_list_models: async () => {
      const loaded = await registryOrError();
      if (loaded.error) return toolResult({ ok: false, error: loaded.error });
      return toolResult({ lanes: loaded.registry.lanes, models: loaded.registry.models });
    },

    mh_route_task: async ({ task, cwd, budget, preferredLane } = {}) => {
      const loaded = await registryOrError();
      if (loaded.error) return toolResult({ ok: false, error: loaded.error });
      if (!task?.trim()) return toolResult({ ok: false, error: 'Task is required.' });
      const route = routeTask(task, {
        registry: loaded.registry,
        cwd,
        budget,
        preferredLane,
        surface: 'mcp'
      });
      return toolResult(route);
    },

    mh_delegate_task: async (input = {}) => {
      const loaded = await registryOrError();
      if (loaded.error) return toolResult({ ok: false, error: loaded.error });
      const planned = createDelegateResult({ ...input, registry: loaded.registry });
      if (!planned.ok) return toolResult(planned);
      if (input.dryRun ?? true) return toolResult(planned);

      const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
      const execution = await runCommand(planned.routing.command, {
        cwd: input.cwd ?? process.cwd(),
        timeoutMs,
        runner
      });
      return toolResult({ ...planned, ...execution, timeoutMs });
    },

    mh_review: async (input = {}) => {
      if (!input.allowRecursiveEscalation) {
        return toolResult({
          ok: false,
          error: 'Refusing recursive escalation for MCP review. Run mh review from the human CLI or set allowRecursiveEscalation.'
        });
      }
      const loaded = await registryOrError();
      if (loaded.error) return toolResult({ ok: false, error: loaded.error });
      const task = input.task || 'Review uncommitted changes.';
      const route = routeTask(task, {
        registry: loaded.registry,
        cwd: input.cwd,
        preferredLane: 'review',
        surface: 'mcp'
      });
      const command = buildCommand(route, { prompt: task, cwd: input.cwd ?? process.cwd(), surface: 'cli' });
      return toolResult({ ok: true, routing: { ...route, command }, stdout: '', stderr: '', timeoutMs: DEFAULT_TIMEOUT_MS });
    },

    mh_doctor: async (input = {}) => toolResult(await runDoctor({ cwd: input.cwd }))
  };
}

export async function serveMcp() {
  const server = new McpServer(
    { name: 'mh-model-harness', version: '0.1.0' },
    {
      instructions:
        'Use mh_route_task before mh_delegate_task. MCP delegation is read-only in v1; write-capable delegation is refused.'
    }
  );
  const handlers = createToolHandlers();

  for (const name of TOOL_NAMES) {
    const definition = TOOL_DEFINITIONS[name];
    server.registerTool(
      name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema.shape
      },
      handlers[name]
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
