/**
 * Hook Install Service
 *
 * CLI-facing installation service for configuring dotcontext host hooks
 * in Claude Code, Codex CLI, and Pi.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
} from '../../shared/system/types';
import type { TranslateFn } from '../../utils/i18n';
import {
  installClaudeCodeHooks,
  uninstallClaudeCodeHooks,
  previewClaudeCodeHooks,
} from '../../integrations/claude-code/install/claudeCodeHookInstallService';
import {
  installCodexHooks,
  uninstallCodexHooks,
  previewCodexHooks,
} from '../../integrations/codex/install/codexHookInstallService';
import { CODEX_HOOK_TRUST_REMINDER } from '../../integrations/codex/hooks/codexHookTemplates';

// ============================================================================
// Types
// ============================================================================

export type HookHost = 'claude-code' | 'codex' | 'pi';

export type HookInstallServiceDependencies = BaseDependencies;

export interface HookInstallOptions {
  host?: string;
  global?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  format?: 'json' | 'toml';
  repoPath?: string;
  writeMcpSnippet?: boolean;
}

export interface HookUninstallOptions {
  host?: string;
  global?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  format?: 'json' | 'toml';
  repoPath?: string;
}

export interface HookInstallResult extends OperationResult {
  installations: HookInstallation[];
}

export interface HookInstallation {
  host: HookHost | string;
  hostDisplayName: string;
  configPath: string;
  action: 'created' | 'updated' | 'skipped' | 'instructions';
  dryRun: boolean;
  preview?: string;
}

export interface HookInstallToolChoice {
  name: string;
  value: string;
}

export interface HookInstallToolPrompt {
  message: string;
  choices: HookInstallToolChoice[];
}

export interface ResolveHookInstallHostSelectionOptions {
  selectedHost?: string;
  isInteractive: boolean;
  service: Pick<HookInstallService, 'getSupportedHosts' | 'detectInstalledHosts'>;
  t: TranslateFn;
  promptHost?: (prompt: HookInstallToolPrompt) => Promise<string>;
}

const HOST_DISPLAY_NAMES: Record<HookHost, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  pi: 'Pi',
};

const SUPPORTED_HOSTS: HookHost[] = ['claude-code', 'codex', 'pi'];

const AI_CONTEXT_MCP_SERVER = {
  command: 'npx',
  args: ['-y', '@dotcontext/mcp@latest'],
};

// ============================================================================
// Service Implementation
// ============================================================================

export class HookInstallService {
  constructor(private deps: HookInstallServiceDependencies) {}

  getSupportedHosts(): HookHost[] {
    return [...SUPPORTED_HOSTS];
  }

  getSupportedHostIds(): string[] {
    return [...SUPPORTED_HOSTS];
  }

  async detectInstalledHosts(): Promise<HookHost[]> {
    const installed: HookHost[] = [];
    const homeDir = os.homedir();
    const repoPath = process.cwd();

    const checks: Array<{ host: HookHost; paths: string[] }> = [
      { host: 'claude-code', paths: [path.join(homeDir, '.claude'), path.join(repoPath, '.claude')] },
      { host: 'codex', paths: [path.join(homeDir, '.codex'), path.join(repoPath, '.codex')] },
      { host: 'pi', paths: [path.join(homeDir, '.pi'), path.join(repoPath, '.pi')] },
    ];

    for (const check of checks) {
      for (const candidate of check.paths) {
        if (await fs.pathExists(candidate)) {
          installed.push(check.host);
          break;
        }
      }
    }

    return installed;
  }

  async runInstall(options: HookInstallOptions = {}): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      ...createEmptyResult(),
      installations: [],
    };

    const {
      host,
      global: isGlobal = true,
      dryRun = false,
      verbose = false,
      format = 'json',
      repoPath,
      writeMcpSnippet = true,
    } = options;

    const logRepoPath = repoPath ? path.resolve(repoPath) : process.cwd();
    const hostsToInstall = await this.resolveHosts(host);
    if (hostsToInstall.length === 0) {
      return result;
    }

    for (const hostId of hostsToInstall) {
      const installation = await this.installForHost(
        hostId,
        isGlobal,
        dryRun,
        verbose,
        format,
        logRepoPath,
        writeMcpSnippet
      );
      result.installations.push(installation);

      if (installation.action === 'created' || installation.action === 'updated') {
        result.filesCreated++;
      } else if (installation.action === 'skipped') {
        result.filesSkipped++;
      }

      await this.appendInstallLog(logRepoPath, {
        operation: 'install',
        host: hostId,
        action: installation.action,
        configPath: installation.configPath,
        dryRun,
        global: isGlobal,
      });
    }

    if (!dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        this.deps.t('success.hook.installed', { count: result.filesCreated })
      );
    }

    return result;
  }

  async runUninstall(options: HookUninstallOptions = {}): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      ...createEmptyResult(),
      installations: [],
    };

    const {
      host,
      global: isGlobal = true,
      dryRun = false,
      verbose = false,
      format = 'json',
      repoPath,
    } = options;

    const logRepoPath = repoPath ? path.resolve(repoPath) : process.cwd();
    const hostsToUninstall = await this.resolveHosts(host);
    if (hostsToUninstall.length === 0) {
      return result;
    }

    for (const hostId of hostsToUninstall) {
      const installation = await this.uninstallForHost(
        hostId,
        isGlobal,
        dryRun,
        verbose,
        format,
        logRepoPath
      );
      result.installations.push(installation);

      if (installation.action === 'updated') {
        result.filesCreated++;
      } else if (installation.action === 'skipped') {
        result.filesSkipped++;
      }

      await this.appendInstallLog(logRepoPath, {
        operation: 'uninstall',
        host: hostId,
        action: installation.action,
        configPath: installation.configPath,
        dryRun,
        global: isGlobal,
      });
    }

    if (!dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        this.deps.t('success.hook.uninstalled', { count: result.filesCreated })
      );
    }

    return result;
  }

  private async resolveHosts(host?: string): Promise<HookHost[]> {
    if (host) {
      if (host === 'all') {
        const detected = await this.detectInstalledHosts();
        return detected.length > 0 ? detected : this.getSupportedHosts();
      }

      if (!this.isSupportedHost(host)) {
        this.deps.ui.displayError(
          this.deps.t('errors.hook.unsupportedHost', {
            host,
            supported: this.getSupportedHostIds().join(', '),
          })
        );
        return [];
      }

      return [host];
    }

    const detected = await this.detectInstalledHosts();
    return detected.length > 0 ? detected : this.getSupportedHosts();
  }

  private isSupportedHost(host: string): host is HookHost {
    return (SUPPORTED_HOSTS as readonly string[]).includes(host);
  }

  private buildHostOptions(
    isGlobal: boolean,
    dryRun: boolean,
    verbose: boolean,
    repoPath: string,
    format?: 'json' | 'toml'
  ) {
    return {
      global: isGlobal,
      dryRun,
      verbose,
      repoPath,
      ...(format ? { format } : {}),
    };
  }

  private async installForHost(
    host: HookHost,
    isGlobal: boolean,
    dryRun: boolean,
    verbose: boolean,
    format: 'json' | 'toml',
    repoPath: string,
    writeMcpSnippet: boolean
  ): Promise<HookInstallation> {
    const displayName = HOST_DISPLAY_NAMES[host];

    if (host === 'pi') {
      this.deps.ui.displayInfo(displayName, this.deps.t('info.hook.piInstructions'));

      if (writeMcpSnippet && !dryRun) {
        await this.writePiMcpSnippet(repoPath, verbose);
      } else if (writeMcpSnippet && dryRun && verbose) {
        this.deps.ui.displayInfo(
          displayName,
          this.deps.t('info.hook.piMcpSnippetDryRun', { path: path.join(repoPath, '.mcp.json') })
        );
      }

      return {
        host,
        hostDisplayName: displayName,
        configPath: '',
        action: 'instructions',
        dryRun,
      };
    }

    const hostOptions = this.buildHostOptions(isGlobal, dryRun, verbose, repoPath, format);

    if (host === 'claude-code') {
      const preview = dryRun && verbose
        ? JSON.stringify(await previewClaudeCodeHooks(hostOptions), null, 2)
        : undefined;
      const installResult = await installClaudeCodeHooks(hostOptions);

      if (verbose) {
        this.logInstallVerbose(displayName, installResult.action, installResult.configPath, dryRun);
        if (preview) {
          console.log(preview);
        }
      }

      return {
        host,
        hostDisplayName: displayName,
        configPath: installResult.configPath,
        action: installResult.action,
        dryRun: installResult.dryRun,
        preview,
      };
    }

    const previewContent = dryRun && verbose
      ? await previewCodexHooks(hostOptions)
      : undefined;
    const preview = previewContent
      ? (typeof previewContent === 'string' ? previewContent : JSON.stringify(previewContent, null, 2))
      : undefined;
    const installResult = await installCodexHooks(hostOptions);

    if (verbose) {
      this.logInstallVerbose(displayName, installResult.action, installResult.configPath, dryRun);
      if (preview) {
        console.log(preview);
      }
    }

    this.deps.ui.displayInfo(displayName, CODEX_HOOK_TRUST_REMINDER);

    return {
      host,
      hostDisplayName: displayName,
      configPath: installResult.configPath,
      action: installResult.action,
      dryRun: installResult.dryRun,
      preview,
    };
  }

  private async uninstallForHost(
    host: HookHost,
    isGlobal: boolean,
    dryRun: boolean,
    verbose: boolean,
    format: 'json' | 'toml',
    repoPath: string
  ): Promise<HookInstallation> {
    const displayName = HOST_DISPLAY_NAMES[host];

    if (host === 'pi') {
      this.deps.ui.displayInfo(displayName, this.deps.t('info.hook.piUninstallInstructions'));
      return {
        host,
        hostDisplayName: displayName,
        configPath: '',
        action: 'skipped',
        dryRun,
      };
    }

    const hostOptions = this.buildHostOptions(isGlobal, dryRun, verbose, repoPath, format);

    if (host === 'claude-code') {
      const uninstallResult = await uninstallClaudeCodeHooks(hostOptions);

      if (verbose) {
        this.logInstallVerbose(displayName, uninstallResult.action, uninstallResult.configPath, dryRun);
      }

      return {
        host,
        hostDisplayName: displayName,
        configPath: uninstallResult.configPath,
        action: uninstallResult.action,
        dryRun: uninstallResult.dryRun,
      };
    }

    const uninstallResult = await uninstallCodexHooks(hostOptions);

    if (verbose) {
      this.logInstallVerbose(displayName, uninstallResult.action, uninstallResult.configPath, dryRun);
    }

    return {
      host,
      hostDisplayName: displayName,
      configPath: uninstallResult.configPath,
      action: uninstallResult.action,
      dryRun: uninstallResult.dryRun,
    };
  }

  private logInstallVerbose(
    displayName: string,
    action: HookInstallation['action'],
    configPath: string,
    dryRun: boolean
  ): void {
    if (action === 'skipped') {
      this.deps.ui.displayInfo(
        displayName,
        this.deps.t('info.hook.alreadyConfigured', { host: displayName })
      );
      return;
    }

    const key = dryRun ? 'info.hook.wouldInstall' : 'info.hook.installed';
    this.deps.ui.displayInfo(
      displayName,
      this.deps.t(key, { host: displayName, path: configPath })
    );
  }

  private async writePiMcpSnippet(repoPath: string, verbose: boolean): Promise<void> {
    const configPath = path.join(repoPath, '.mcp.json');
    let existing: Record<string, unknown> = {};

    if (await fs.pathExists(configPath)) {
      try {
        existing = await fs.readJson(configPath);
      } catch {
        existing = {};
      }
    }

    const servers = (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
    if (servers.dotcontext) {
      if (verbose) {
        this.deps.ui.displayInfo('Pi', this.deps.t('info.hook.piMcpAlreadyConfigured'));
      }
      return;
    }

    const nextConfig = {
      ...existing,
      mcpServers: {
        ...servers,
        dotcontext: AI_CONTEXT_MCP_SERVER,
      },
    };

    await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), 'utf-8');

    if (verbose) {
      this.deps.ui.displayInfo(
        'Pi',
        this.deps.t('info.hook.piMcpSnippetWritten', { path: configPath })
      );
    }
  }

  private async appendInstallLog(
    repoPath: string,
    entry: Record<string, unknown>
  ): Promise<void> {
    const logDir = path.join(repoPath, '.context', 'logs');
    const logPath = path.join(logDir, 'hook-install.log');
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    });

    try {
      await fs.ensureDir(logDir);
      await fs.appendFile(logPath, `${line}\n`, 'utf-8');
    } catch {
      // Logging must not block install operations.
    }
  }
}

export function buildHookInstallHostChoices(
  supportedHosts: HookHost[],
  detectedHosts: HookHost[],
  t: TranslateFn
): HookInstallToolChoice[] {
  const detectedSet = new Set(detectedHosts);
  const orderedHosts = [
    ...supportedHosts.filter((host) => detectedSet.has(host)),
    ...supportedHosts.filter((host) => !detectedSet.has(host)),
  ];

  return [
    {
      name: t('commands.hookInstall.allDetected'),
      value: 'all',
    },
    ...orderedHosts.map((host) => ({
      name: detectedSet.has(host)
        ? `${HOST_DISPLAY_NAMES[host]} (${t('labels.detected')})`
        : HOST_DISPLAY_NAMES[host],
      value: host,
    })),
  ];
}

export async function resolveHookInstallHostSelection(
  options: ResolveHookInstallHostSelectionOptions
): Promise<string> {
  const { selectedHost, isInteractive, service, t, promptHost } = options;

  if (selectedHost) {
    return selectedHost;
  }

  if (!isInteractive) {
    return 'all';
  }

  if (!promptHost) {
    throw new Error('Interactive hook install selection requires a prompt handler.');
  }

  const detectedHosts = await service.detectInstalledHosts();

  return promptHost({
    message: t('commands.hookInstall.selectHost'),
    choices: buildHookInstallHostChoices(service.getSupportedHosts(), detectedHosts, t),
  });
}
