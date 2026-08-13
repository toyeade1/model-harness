#!/usr/bin/env node
import { buildCommand, formatCommandOutput, runCommand } from './adapters.mjs';
import { runDoctor } from './doctor.mjs';
import { renderHelp, renderSetup } from './help.mjs';
import { serveMcp } from './mcp-server.mjs';
import { loadRegistry } from './registry.mjs';
import { resolveLane, routeTask } from './router.mjs';

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];
  for (const arg of argv) {
    if (arg === '--json' || arg === '--dry-run') {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }
  return {
    command: positional[0],
    rest: positional.slice(1),
    json: flags.has('--json'),
    dryRun: flags.has('--dry-run')
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printRoute(route, json) {
  if (json) {
    printJson({
      lane: route.lane,
      modelId: route.modelId,
      adapter: route.adapter,
      mode: route.mode,
      command: route.command,
      reasons: route.reasons,
      warnings: route.warnings,
      costTier: route.costTier
    });
    return;
  }
  process.stdout.write(`lane: ${route.lane}\n`);
  process.stdout.write(`model: ${route.modelId}\n`);
  process.stdout.write(`adapter: ${route.adapter}\n`);
  process.stdout.write(`command: ${route.command.join(' ')}\n`);
  process.stdout.write(`reasons: ${route.reasons.join(', ')}\n`);
}

function promptFrom(rest) {
  return rest.join(' ').trim();
}

async function loadOrExit() {
  const result = await loadRegistry();
  if (!result.registry) {
    for (const error of result.errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
    return null;
  }
  return result.registry;
}

async function runRoutedCommand(registry, commandName, prompt, options) {
  const lane = commandName === 'brain' ? null : resolveLane(commandName, registry);
  const route = routeTask(prompt, {
    registry,
    preferredLane: lane,
    cwd: process.cwd(),
    surface: 'cli'
  });
  route.command = buildCommand(route, { prompt, cwd: process.cwd(), surface: 'cli' });

  if (options.dryRun || options.json) {
    printRoute(route, options.json);
    return;
  }

  process.stderr.write(`mh: ${route.lane} -> ${route.modelId} (${route.adapter})\n`);
  const result = await runCommand(route.command, { cwd: process.cwd() });
  process.stdout.write(formatCommandOutput(result, route));
  process.stderr.write(result.stderr ?? '');
  process.exitCode = result.ok ? 0 : result.exitCode ?? 1;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.command ?? 'help';

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(renderHelp());
    return;
  }

  if (command === 'setup') {
    process.stdout.write(renderSetup());
    return;
  }

  if (command === 'mcp' && parsed.rest[0] === 'serve') {
    await serveMcp();
    return;
  }

  if (command === 'doctor') {
    const doctor = await runDoctor();
    if (parsed.json) {
      printJson(doctor);
    } else {
      for (const check of doctor.checks) {
        process.stdout.write(`${check.ok ? 'ok' : 'warn'} ${check.name}: ${check.detail}\n`);
      }
      for (const warning of doctor.warnings) {
        process.stdout.write(`warning: ${warning}\n`);
      }
    }
    return;
  }

  const registry = await loadOrExit();
  if (!registry) return;

  if (command === 'models') {
    const payload = { lanes: registry.lanes, models: registry.models };
    if (parsed.json) {
      printJson(payload);
    } else {
      for (const [lane, modelId] of Object.entries(registry.lanes)) {
        process.stdout.write(`${lane}: ${modelId}\n`);
      }
    }
    return;
  }

  if (command === 'route') {
    const prompt = promptFrom(parsed.rest);
    if (!prompt) {
      process.stderr.write('mh route requires a task prompt.\n');
      process.exitCode = 1;
      return;
    }
    const route = routeTask(prompt, { registry, cwd: process.cwd(), surface: 'cli' });
    printRoute(route, parsed.json);
    return;
  }

  if (command === 'brain' || resolveLane(command, registry)) {
    const prompt = promptFrom(parsed.rest);
    if (!prompt) {
      if (command === 'brain') {
        process.stderr.write('mh brain requires a task prompt.\n');
        process.exitCode = 1;
        return;
      }
      const lane = resolveLane(command, registry);
      const model = registry.models[registry.lanes[lane]];
      const route = {
        lane,
        modelId: registry.lanes[lane],
        model,
        adapter: model.adapter,
        mode: model.mode,
        reasons: [`interactive ${lane} lane`],
        warnings: [],
        costTier: model.costTier
      };
      route.command = buildCommand(route, { cwd: process.cwd(), surface: 'cli' });
      printRoute(route, parsed.json);
      if (!parsed.dryRun && !parsed.json) {
        await runCommand(route.command, { cwd: process.cwd() });
      }
      return;
    }
    await runRoutedCommand(registry, command, prompt, parsed);
    return;
  }

  process.stderr.write(`mh: unknown command: ${command}\n`);
  process.stderr.write('Run mh help for available commands.\n');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
