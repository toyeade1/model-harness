import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY_PATH = fileURLToPath(
  new URL('../config/model-registry.json', import.meta.url)
);

const allowedUserConfigKeys = new Set([
  'defaultCommand',
  'budget',
  'explainRouting',
  'providers',
  'lanes',
  'commandAliases',
  'models',
  'modelOverrides'
]);

const validAdapters = new Set(['opencode', 'codex', 'claude']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function defaultUserConfigPath() {
  return path.join(os.homedir(), '.config', 'mh', 'config.json');
}

function mergeUserConfig(registry, userConfig, warnings) {
  for (const key of Object.keys(userConfig)) {
    if (!allowedUserConfigKeys.has(key)) {
      warnings.push(`Unknown config field "${key}" ignored.`);
    }
  }

  if (userConfig.lanes && typeof userConfig.lanes === 'object') {
    registry.lanes = { ...registry.lanes, ...userConfig.lanes };
  }

  if (userConfig.commandAliases && typeof userConfig.commandAliases === 'object') {
    registry.commandAliases = { ...registry.commandAliases, ...userConfig.commandAliases };
  }

  if (userConfig.models && typeof userConfig.models === 'object') {
    registry.models = { ...registry.models, ...userConfig.models };
  }

  if (userConfig.modelOverrides && typeof userConfig.modelOverrides === 'object') {
    for (const [modelId, override] of Object.entries(userConfig.modelOverrides)) {
      if (!registry.models[modelId]) {
        warnings.push(`Model override "${modelId}" does not match a built-in model.`);
        continue;
      }
      registry.models[modelId] = { ...registry.models[modelId], ...override };
    }
  }

  return registry;
}

export function validateRegistry(registry) {
  const errors = [];
  const warnings = [];

  if (!registry || typeof registry !== 'object') {
    return { ok: false, errors: ['Registry is missing or invalid.'], warnings };
  }

  if (!registry.models || typeof registry.models !== 'object') {
    errors.push('Registry is missing models.');
  }
  if (!registry.lanes || typeof registry.lanes !== 'object') {
    errors.push('Registry is missing lanes.');
  }
  if (!registry.commandAliases || typeof registry.commandAliases !== 'object') {
    errors.push('Registry is missing commandAliases.');
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  for (const [modelId, model] of Object.entries(registry.models)) {
    if (!validAdapters.has(model.adapter)) {
      errors.push(`Model "${modelId}" has unsupported adapter "${model.adapter}".`);
    }
    for (const fallbackId of model.fallbacks ?? []) {
      if (!registry.models[fallbackId]) {
        errors.push(`Model "${modelId}" fallback "${fallbackId}" does not exist.`);
      }
    }
  }

  for (const [lane, modelId] of Object.entries(registry.lanes)) {
    if (!registry.models[modelId]) {
      errors.push(`Lane "${lane}" points to missing model "${modelId}".`);
    }
  }

  for (const [alias, lane] of Object.entries(registry.commandAliases)) {
    if (!registry.lanes[lane]) {
      errors.push(`Command alias "${alias}" points to missing lane "${lane}".`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function loadRegistry(options = {}) {
  const warnings = [];
  const errors = [];
  const builtInPath = options.builtInPath ?? DEFAULT_REGISTRY_PATH;

  let registry;
  try {
    registry = clone(await readJson(builtInPath));
  } catch (error) {
    return {
      registry: null,
      warnings,
      errors: [`Failed to read registry at ${builtInPath}: ${error.message}`]
    };
  }

  const userConfigPath =
    options.userConfigPath ??
    (options.includeUserConfig === false ? null : defaultUserConfigPath());

  if (userConfigPath && (await exists(userConfigPath))) {
    let userConfig;
    try {
      userConfig = await readJson(userConfigPath);
    } catch (error) {
      return {
        registry: null,
        warnings,
        errors: [`Failed to parse user config at ${userConfigPath}: ${error.message}`]
      };
    }
    registry = mergeUserConfig(registry, userConfig, warnings);
  }

  const validation = validateRegistry(registry);
  return {
    registry: validation.ok ? registry : null,
    warnings: [...warnings, ...validation.warnings],
    errors: [...errors, ...validation.errors]
  };
}

export function getCommandAliases(registry) {
  return registry.commandAliases ?? {};
}
