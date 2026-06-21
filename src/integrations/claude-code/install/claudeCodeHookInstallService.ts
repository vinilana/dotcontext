import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  buildClaudeCodeHooksFragment,
  CLAUDE_CODE_HOOK_TEMPLATES,
  isDotcontextClaudeCodeHookCommand,
  isCurrentClaudeCodeHookCommand,
  type ClaudeCodeHookMatcherEntry,
  type ClaudeCodeHookTemplate,
} from '../hooks/claudeCodeHookTemplates';

export interface ClaudeCodeHookInstallOptions {
  global?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  repoPath?: string;
}

export interface ClaudeCodeHookInstallResult {
  configPath: string;
  action: 'created' | 'updated' | 'skipped';
  dryRun: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveConfigPath(options: ClaudeCodeHookInstallOptions): string {
  if (options.global === false) {
    const repoPath = path.resolve(options.repoPath ?? process.cwd());
    return path.join(repoPath, '.claude', 'settings.json');
  }

  return path.join(os.homedir(), '.claude', 'settings.json');
}

function entryUsesDotcontextCommand(entry: ClaudeCodeHookMatcherEntry): boolean {
  return entry.hooks.some((hook) => isDotcontextClaudeCodeHookCommand(hook.command));
}

function entryUsesCurrentDotcontextCommand(entry: ClaudeCodeHookMatcherEntry): boolean {
  return entry.hooks.some((hook) => isCurrentClaudeCodeHookCommand(hook.command));
}

function mergeHookTemplates(
  existing: ClaudeCodeHookTemplate | undefined,
  incoming: ClaudeCodeHookTemplate
): ClaudeCodeHookTemplate {
  const preserved = (existing ?? []).filter((entry) => !entryUsesDotcontextCommand(entry));
  return [...preserved, ...incoming];
}

function mergeHooksConfig(existing: unknown): Record<string, unknown> {
  const config = isRecord(existing) ? { ...existing } : {};
  const existingHooks = isRecord(config.hooks) ? { ...config.hooks } : {};
  const fragment = buildClaudeCodeHooksFragment();

  for (const [eventName, template] of Object.entries(fragment)) {
    existingHooks[eventName] = mergeHookTemplates(
      existingHooks[eventName] as ClaudeCodeHookTemplate | undefined,
      template
    );
  }

  return {
    ...config,
    hooks: existingHooks,
  };
}

function hooksUpToDate(config: unknown): boolean {
  if (!isRecord(config) || !isRecord(config.hooks)) {
    return false;
  }

  for (const eventName of Object.keys(CLAUDE_CODE_HOOK_TEMPLATES)) {
    const entries = config.hooks[eventName] as ClaudeCodeHookTemplate | undefined;
    if (!entries?.some(entryUsesCurrentDotcontextCommand)) {
      return false;
    }
  }

  return true;
}

function hooksInstalled(config: unknown): boolean {
  if (!isRecord(config) || !isRecord(config.hooks)) {
    return false;
  }

  for (const eventName of Object.keys(CLAUDE_CODE_HOOK_TEMPLATES)) {
    const entries = config.hooks[eventName] as ClaudeCodeHookTemplate | undefined;
    if (!entries?.some(entryUsesDotcontextCommand)) {
      return false;
    }
  }

  return true;
}

export async function installClaudeCodeHooks(
  options: ClaudeCodeHookInstallOptions = {}
): Promise<ClaudeCodeHookInstallResult> {
  const configPath = resolveConfigPath(options);
  const exists = await fs.pathExists(configPath);
  const existing = exists ? await fs.readJson(configPath) : {};
  const merged = mergeHooksConfig(existing);
  const alreadyConfigured = hooksUpToDate(existing);
  const action: ClaudeCodeHookInstallResult['action'] =
    !exists ? 'created' : alreadyConfigured ? 'skipped' : 'updated';

  if (options.verbose) {
    process.stderr.write(`[dotcontext] Claude Code hooks target: ${configPath}\n`);
  }

  if (!options.dryRun && action !== 'skipped') {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, merged, { spaces: 2 });
  }

  return {
    configPath,
    action,
    dryRun: Boolean(options.dryRun),
  };
}

export async function uninstallClaudeCodeHooks(
  options: ClaudeCodeHookInstallOptions = {}
): Promise<ClaudeCodeHookInstallResult> {
  const configPath = resolveConfigPath(options);

  if (!await fs.pathExists(configPath)) {
    return {
      configPath,
      action: 'skipped',
      dryRun: Boolean(options.dryRun),
    };
  }

  const existing = await fs.readJson(configPath);
  if (!hooksInstalled(existing)) {
    return {
      configPath,
      action: 'skipped',
      dryRun: Boolean(options.dryRun),
    };
  }

  const config = isRecord(existing) ? { ...existing } : {};
  const hooks = isRecord(config.hooks) ? { ...config.hooks } : {};

  for (const eventName of Object.keys(CLAUDE_CODE_HOOK_TEMPLATES)) {
    const entries = hooks[eventName] as ClaudeCodeHookTemplate | undefined;
    if (!Array.isArray(entries)) {
      continue;
    }

    hooks[eventName] = entries
      .map((entry) => ({
        ...entry,
        hooks: entry.hooks.filter((hook) => !isDotcontextClaudeCodeHookCommand(hook.command)),
      }))
      .filter((entry) => entry.hooks.length > 0);
  }

  const merged = {
    ...config,
    hooks,
  };

  if (!options.dryRun) {
    await fs.writeJson(configPath, merged, { spaces: 2 });
  }

  return {
    configPath,
    action: 'updated',
    dryRun: Boolean(options.dryRun),
  };
}

export async function previewClaudeCodeHooks(
  options: ClaudeCodeHookInstallOptions = {}
): Promise<Record<string, unknown>> {
  const configPath = resolveConfigPath(options);
  const existing = (await fs.pathExists(configPath))
    ? await fs.readJson(configPath)
    : {};

  return mergeHooksConfig(existing);
}
