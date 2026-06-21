import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  buildCodexHooksDocument,
  buildCodexTomlHookBlocks,
  CODEX_HOOK_DISPATCH_COMMAND,
  CODEX_HOOK_TEMPLATES,
  CODEX_HOOK_TRUST_REMINDER,
  isDotcontextCodexHookCommand,
  isCurrentCodexHookCommand,
  type CodexHookMatcherEntry,
  type CodexHookTemplate,
} from '../hooks/codexHookTemplates';

export type CodexHookInstallFormat = 'json' | 'toml';

export interface CodexHookInstallOptions {
  global?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  repoPath?: string;
  format?: CodexHookInstallFormat;
}

export interface CodexHookInstallResult {
  configPath: string;
  action: 'created' | 'updated' | 'skipped';
  dryRun: boolean;
  format: CodexHookInstallFormat;
  trustReminder: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveJsonConfigPath(options: CodexHookInstallOptions): string {
  if (options.global === false) {
    const repoPath = path.resolve(options.repoPath ?? process.cwd());
    return path.join(repoPath, '.codex', 'hooks.json');
  }

  return path.join(os.homedir(), '.codex', 'hooks.json');
}

function resolveTomlConfigPath(options: CodexHookInstallOptions): string {
  if (options.global === false) {
    const repoPath = path.resolve(options.repoPath ?? process.cwd());
    return path.join(repoPath, '.codex', 'config.toml');
  }

  return path.join(os.homedir(), '.codex', 'config.toml');
}

function entryUsesDotcontextCommand(entry: CodexHookMatcherEntry): boolean {
  return entry.hooks.some((hook) => isDotcontextCodexHookCommand(hook.command));
}

function entryUsesCurrentDotcontextCommand(entry: CodexHookMatcherEntry): boolean {
  return entry.hooks.some((hook) => isCurrentCodexHookCommand(hook.command));
}

function mergeHookTemplates(
  existing: CodexHookTemplate | undefined,
  incoming: CodexHookTemplate
): CodexHookTemplate {
  const preserved = (existing ?? []).filter((entry) => !entryUsesDotcontextCommand(entry));
  return [...preserved, ...incoming];
}

function mergeHooksDocument(existing: unknown): { hooks: Record<string, CodexHookTemplate> } {
  const document = isRecord(existing) ? existing : {};
  const existingHooks: Record<string, CodexHookTemplate> = isRecord(document.hooks)
    ? { ...(document.hooks as Record<string, CodexHookTemplate>) }
    : {};
  const fragment = buildCodexHooksDocument().hooks;

  for (const [eventName, template] of Object.entries(fragment)) {
    existingHooks[eventName] = mergeHookTemplates(
      existingHooks[eventName],
      template
    );
  }

  return { hooks: existingHooks };
}

function hooksUpToDate(document: unknown): boolean {
  if (!isRecord(document) || !isRecord(document.hooks)) {
    return false;
  }

  for (const eventName of Object.keys(CODEX_HOOK_TEMPLATES)) {
    const entries = document.hooks[eventName] as CodexHookTemplate | undefined;
    if (!entries?.some(entryUsesCurrentDotcontextCommand)) {
      return false;
    }
  }

  return true;
}

function hooksInstalled(document: unknown): boolean {
  if (!isRecord(document) || !isRecord(document.hooks)) {
    return false;
  }

  for (const eventName of Object.keys(CODEX_HOOK_TEMPLATES)) {
    const entries = document.hooks[eventName] as CodexHookTemplate | undefined;
    if (!entries?.some(entryUsesDotcontextCommand)) {
      return false;
    }
  }

  return true;
}

function tomlUpToDate(content: string): boolean {
  return content.includes(CODEX_HOOK_DISPATCH_COMMAND);
}

function parseTomlCommandLine(line: string): string | undefined {
  const match = line.trim().match(/^command\s*=\s*(.+)$/);
  if (!match) {
    return undefined;
  }

  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return match[1].replace(/^["']|["']$/g, '');
  }
}

function tomlHasDotcontextHooks(content: string): boolean {
  return content.split('\n').some((line) => {
    const command = parseTomlCommandLine(line);
    return Boolean(command && isDotcontextCodexHookCommand(command));
  });
}

function appendTomlHooks(existing: string): string {
  if (tomlUpToDate(existing)) {
    return existing;
  }

  const base = tomlHasDotcontextHooks(existing)
    ? removeDotcontextTomlHooks(existing)
    : existing.trimEnd();
  const block = buildCodexTomlHookBlocks();
  return base ? `${base}\n\n${block}` : block;
}

async function installJsonHooks(
  options: CodexHookInstallOptions
): Promise<CodexHookInstallResult> {
  const configPath = resolveJsonConfigPath(options);
  const exists = await fs.pathExists(configPath);
  const existing = exists ? await fs.readJson(configPath) : {};
  const merged = mergeHooksDocument(existing);
  const alreadyConfigured = hooksUpToDate(existing);
  const action: CodexHookInstallResult['action'] =
    !exists ? 'created' : alreadyConfigured ? 'skipped' : 'updated';

  if (options.verbose) {
    process.stderr.write(`[dotcontext] Codex hooks target: ${configPath}\n`);
  }

  if (!options.dryRun && action !== 'skipped') {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, merged, { spaces: 2 });
  }

  return {
    configPath,
    action,
    dryRun: Boolean(options.dryRun),
    format: 'json',
    trustReminder: 'After install, run /hooks in Codex and trust project hooks when prompted.',
  };
}

async function installTomlHooks(
  options: CodexHookInstallOptions
): Promise<CodexHookInstallResult> {
  const configPath = resolveTomlConfigPath(options);
  const exists = await fs.pathExists(configPath);
  const existing = exists ? await fs.readFile(configPath, 'utf8') : '';
  const alreadyConfigured = tomlUpToDate(existing);
  const action: CodexHookInstallResult['action'] =
    !exists ? 'created' : alreadyConfigured ? 'skipped' : 'updated';

  if (options.verbose) {
    process.stderr.write(`[dotcontext] Codex TOML hooks target: ${configPath}\n`);
  }

  if (!options.dryRun && action !== 'skipped') {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, appendTomlHooks(existing), 'utf8');
  }

  return {
    configPath,
    action,
    dryRun: Boolean(options.dryRun),
    format: 'toml',
    trustReminder: 'After install, run /hooks in Codex and trust project hooks when prompted.',
  };
}

export async function installCodexHooks(
  options: CodexHookInstallOptions = {}
): Promise<CodexHookInstallResult> {
  const format = options.format ?? 'json';
  return format === 'toml' ? installTomlHooks(options) : installJsonHooks(options);
}

function removeDotcontextJsonHooks(document: unknown): { hooks: Record<string, CodexHookTemplate> } {
  const root = isRecord(document) ? document : {};
  const existingHooks = isRecord(root.hooks) ? root.hooks : {};
  const hooks: Record<string, CodexHookTemplate> = {};

  for (const [eventName, entries] of Object.entries(existingHooks)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    hooks[eventName] = (entries as CodexHookTemplate)
      .map((entry) => ({
        ...entry,
        hooks: entry.hooks.filter((hook) => !isDotcontextCodexHookCommand(hook.command)),
      }))
      .filter((entry) => entry.hooks.length > 0);
  }

  return { hooks };
}

function removeDotcontextTomlHooks(content: string): string {
  const lines = content.split('\n');
  const filtered: string[] = [];
  let skippingBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '[features]' || trimmed === 'hooks = true') {
      continue;
    }

    if (/^\[\[hooks\.(SessionStart|PostToolUse|Stop)\]\]$/.test(trimmed)) {
      skippingBlock = true;
      continue;
    }

    if (skippingBlock) {
      if (trimmed.startsWith('matcher =')) {
        continue;
      }

      const command = parseTomlCommandLine(line);
      if (command && isDotcontextCodexHookCommand(command)) {
        skippingBlock = false;
        continue;
      }

      if (trimmed === '') {
        skippingBlock = false;
        continue;
      }

      skippingBlock = false;
    }

    filtered.push(line);
  }

  return filtered.join('\n').trimEnd() + (filtered.length > 0 ? '\n' : '');
}

export async function uninstallCodexHooks(
  options: CodexHookInstallOptions = {}
): Promise<CodexHookInstallResult> {
  const format = options.format ?? 'json';

  if (format === 'toml') {
    const configPath = resolveTomlConfigPath(options);
    if (!await fs.pathExists(configPath)) {
      return {
        configPath,
        action: 'skipped',
        dryRun: Boolean(options.dryRun),
        format,
        trustReminder: CODEX_HOOK_TRUST_REMINDER,
      };
    }

    const existing = await fs.readFile(configPath, 'utf8');
    if (!tomlHasDotcontextHooks(existing)) {
      return {
        configPath,
        action: 'skipped',
        dryRun: Boolean(options.dryRun),
        format,
        trustReminder: CODEX_HOOK_TRUST_REMINDER,
      };
    }

    if (!options.dryRun) {
      await fs.writeFile(configPath, removeDotcontextTomlHooks(existing), 'utf8');
    }

    return {
      configPath,
      action: 'updated',
      dryRun: Boolean(options.dryRun),
      format,
      trustReminder: CODEX_HOOK_TRUST_REMINDER,
    };
  }

  const configPath = resolveJsonConfigPath(options);
  if (!await fs.pathExists(configPath)) {
    return {
      configPath,
      action: 'skipped',
      dryRun: Boolean(options.dryRun),
      format,
      trustReminder: CODEX_HOOK_TRUST_REMINDER,
    };
  }

  const existing = await fs.readJson(configPath);
  if (!hooksInstalled(existing)) {
    return {
      configPath,
      action: 'skipped',
      dryRun: Boolean(options.dryRun),
      format,
      trustReminder: CODEX_HOOK_TRUST_REMINDER,
    };
  }

  const merged = removeDotcontextJsonHooks(existing);

  if (!options.dryRun) {
    await fs.writeJson(configPath, merged, { spaces: 2 });
  }

  return {
    configPath,
    action: 'updated',
    dryRun: Boolean(options.dryRun),
    format,
    trustReminder: CODEX_HOOK_TRUST_REMINDER,
  };
}

export async function previewCodexHooks(
  options: CodexHookInstallOptions = {}
): Promise<string | Record<string, unknown>> {
  const format = options.format ?? 'json';

  if (format === 'toml') {
    const configPath = resolveTomlConfigPath(options);
    const existing = (await fs.pathExists(configPath))
      ? await fs.readFile(configPath, 'utf8')
      : '';
    return appendTomlHooks(existing);
  }

  const configPath = resolveJsonConfigPath(options);
  const existing = (await fs.pathExists(configPath))
    ? await fs.readJson(configPath)
    : {};

  return mergeHooksDocument(existing);
}
