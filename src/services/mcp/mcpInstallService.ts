/**
 * MCP Install Service
 *
 * Installs and configures the dotcontext MCP server for various AI tools.
 * Supports Claude Code, Cursor, VS Code, Continue, and more.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
  addError,
} from '../shared';
import { TOOL_REGISTRY, getToolById, ToolDefinition } from '../shared/toolRegistry';

// ============================================================================
// Types
// ============================================================================

export type MCPInstallServiceDependencies = BaseDependencies;

export interface MCPInstallOptions {
  /** Specific tool to install for (e.g., 'claude', 'cursor') */
  tool?: string;
  /** Install globally (home directory) vs locally (project directory) */
  global?: boolean;
  /** Preview changes without writing */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Repository path for local installation */
  repoPath?: string;
}

export interface MCPInstallResult extends OperationResult {
  installations: MCPInstallation[];
}

export interface MCPInstallation {
  tool: string;
  toolDisplayName: string;
  configPath: string;
  action: 'created' | 'updated' | 'skipped';
  dryRun: boolean;
}

// ============================================================================
// MCP Configuration Templates
// ============================================================================

interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfigTemplate {
  toolId: string;
  /** Config file path relative to home or repo root */
  globalConfigPath: string;
  localConfigPath: string;
  /** Function to generate config content */
  generateConfig: (existingConfig: unknown, mcpServer: MCPServerConfig) => unknown;
  /** Function to check if MCP is already configured */
  isConfigured: (config: unknown) => boolean;
  /** Optional parser for non-JSON config formats */
  parseConfig?: (content: string) => unknown;
  /** Optional serializer for non-JSON config formats */
  serializeConfig?: (config: unknown) => string;
}

/**
 * Standard MCP server configuration for dotcontext
 */
const AI_CONTEXT_MCP_SERVER: MCPServerConfig = {
  command: 'npx',
  args: ['-y', '@dotcontext/cli@latest', 'mcp'],
  env: {},
};

const parseJsonConfig = (content: string): unknown => JSON.parse(content);
const serializeJsonConfig = (config: unknown): string => JSON.stringify(config, null, 2);

function buildCodexTomlConfig(existingConfig: string, server: MCPServerConfig): string {
  const lines = [
    '[mcp_servers.dotcontext]',
    `command = ${JSON.stringify(server.command)}`,
    `args = [${server.args.map(arg => JSON.stringify(arg)).join(', ')}]`,
  ];

  if (server.env && Object.keys(server.env).length > 0) {
    lines.push('[mcp_servers.dotcontext.env]');
    for (const [key, value] of Object.entries(server.env)) {
      lines.push(`${key} = ${JSON.stringify(value)}`);
    }
  }

  const trimmed = existingConfig.trimEnd();
  const block = lines.join('\n');
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

/**
 * MCP configuration templates for each supported tool
 */
const MCP_CONFIG_TEMPLATES: MCPConfigTemplate[] = [
  // Claude Code
  {
    toolId: 'claude',
    globalConfigPath: '.claude.json',
    localConfigPath: '.mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Cursor AI
  {
    toolId: 'cursor',
    globalConfigPath: '.cursor/mcp.json',
    localConfigPath: '.cursor/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': {
            type: 'stdio',
            ...server,
          },
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Windsurf (Codeium)
  {
    toolId: 'windsurf',
    globalConfigPath: '.codeium/windsurf/mcp_config.json',
    localConfigPath: '.codeium/windsurf/mcp_config.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Continue.dev — standalone per-server file
  {
    toolId: 'continue',
    globalConfigPath: '.continue/mcpServers/dotcontext.json',
    localConfigPath: '.continue/mcpServers/dotcontext.json',
    generateConfig: (_existing, server) => {
      return {
        command: server.command,
        args: server.args,
        env: server.env || {},
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      return !!c?.command;
    },
  },

  // Claude Desktop - Cross-platform paths
  {
    toolId: 'claude-desktop',
    globalConfigPath: process.platform === 'darwin'
      ? path.join('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : path.join('AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    localConfigPath: '.claude-desktop/mcp_servers.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // VS Code (GitHub Copilot)
  {
    toolId: 'vscode',
    globalConfigPath: '.vscode/mcp.json',
    localConfigPath: '.vscode/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        servers: {
          ...(config.servers as Record<string, unknown> || {}),
          'dotcontext': {
            type: 'stdio',
            ...server,
          },
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.servers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Roo Code
  {
    toolId: 'roo',
    globalConfigPath: '.roo/mcp_settings.json',
    localConfigPath: '.roo/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Amazon Q Developer CLI
  {
    toolId: 'amazonq',
    globalConfigPath: '.aws/amazonq/mcp.json',
    localConfigPath: '.amazonq/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Gemini CLI
  {
    toolId: 'gemini-cli',
    globalConfigPath: '.gemini/settings.json',
    localConfigPath: '.gemini/settings.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Codex CLI - TOML config
  {
    toolId: 'codex',
    globalConfigPath: '.codex/config.toml',
    localConfigPath: '.codex/config.toml',
    generateConfig: (existing, server) => buildCodexTomlConfig(
      typeof existing === 'string' ? existing : '',
      server
    ),
    isConfigured: (config) => (
      typeof config === 'string' && /^\s*\[mcp_servers\.dotcontext\]\s*$/m.test(config)
    ),
    parseConfig: (content) => content,
    serializeConfig: (config) => (typeof config === 'string' ? config : String(config ?? '')),
  },

  // Kiro
  {
    toolId: 'kiro',
    globalConfigPath: '.kiro/settings/mcp.json',
    localConfigPath: '.kiro/settings/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Zed Editor - Uses context_servers instead of mcpServers
  {
    toolId: 'zed',
    globalConfigPath: '.config/zed/settings.json',
    localConfigPath: '.zed/settings.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        context_servers: {
          ...(config.context_servers as Record<string, unknown> || {}),
          'dotcontext': {
            command: server.command,
            args: server.args,
            env: server.env || {},
          },
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.context_servers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // JetBrains IDEs - Uses servers array with name field
  {
    toolId: 'jetbrains',
    globalConfigPath: '.config/JetBrains/mcp.json',
    localConfigPath: '.jb-mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      const existingServers = (config.servers as Array<Record<string, unknown>>) || [];
      const filtered = existingServers.filter(s => s.name !== 'dotcontext');
      return {
        servers: [
          ...filtered,
          {
            name: 'dotcontext',
            command: server.command,
            args: server.args,
            env: server.env || {},
          },
        ],
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.servers as Array<Record<string, unknown>>;
      return Array.isArray(servers) && servers.some(s => s.name === 'dotcontext');
    },
  },

  // Trae AI (ByteDance)
  {
    toolId: 'trae',
    globalConfigPath: '.trae/mcp.json',
    localConfigPath: '.trae/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },

  // Kilo Code
  {
    toolId: 'kilo',
    globalConfigPath: '.kilo/mcp.json',
    localConfigPath: '.kilo/mcp.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcp: {
          ...(config.mcp as Record<string, unknown> || {}),
          'dotcontext': {
            type: 'local',
            command: [server.command, ...server.args],
            enabled: true,
          },
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const mcp = c?.mcp as Record<string, unknown>;
      return !!mcp?.['dotcontext'];
    },
  },

  // GitHub Copilot CLI
  {
    toolId: 'copilot-cli',
    globalConfigPath: '.copilot/mcp-config.json',
    localConfigPath: '.copilot/mcp-config.json',
    generateConfig: (existing, server) => {
      const config = (existing as Record<string, unknown>) || {};
      return {
        ...config,
        mcpServers: {
          ...(config.mcpServers as Record<string, unknown> || {}),
          'dotcontext': server,
        },
      };
    },
    isConfigured: (config) => {
      const c = config as Record<string, unknown>;
      const servers = c?.mcpServers as Record<string, unknown>;
      return !!servers?.['dotcontext'];
    },
  },
];

// ============================================================================
// Service Implementation
// ============================================================================

export class MCPInstallService {
  constructor(private deps: MCPInstallServiceDependencies) {}

  /**
   * Get list of tools that support MCP installation
   */
  getSupportedTools(): ToolDefinition[] {
    return MCP_CONFIG_TEMPLATES.map(t => getToolById(t.toolId)).filter(Boolean) as ToolDefinition[];
  }

  /**
   * Get list of supported tool IDs
   */
  getSupportedToolIds(): string[] {
    return MCP_CONFIG_TEMPLATES.map(t => t.toolId);
  }

  /**
   * Detect which supported tools are installed on the system
   */
  async detectInstalledTools(): Promise<string[]> {
    const installed: string[] = [];
    const homeDir = os.homedir();

    for (const template of MCP_CONFIG_TEMPLATES) {
      const tool = getToolById(template.toolId);
      if (!tool) continue;

      // Check if tool directory exists in home
      const toolDir = path.join(homeDir, tool.directoryPrefix);
      if (await fs.pathExists(toolDir)) {
        installed.push(template.toolId);
      }
    }

    return installed;
  }

  /**
   * Install MCP configuration for specified tools
   */
  async run(options: MCPInstallOptions = {}): Promise<MCPInstallResult> {
    const result: MCPInstallResult = {
      ...createEmptyResult(),
      installations: [],
    };

    const { tool, global: isGlobal = true, dryRun = false, verbose = false, repoPath } = options;

    // Determine base path
    const basePath = isGlobal ? os.homedir() : (repoPath ? path.resolve(repoPath) : process.cwd());

    // Determine which tools to install
    let toolsToInstall: string[];
    if (tool) {
      if (tool === 'all') {
        toolsToInstall = await this.detectInstalledTools();
        if (toolsToInstall.length === 0) {
          toolsToInstall = this.getSupportedToolIds();
        }
      } else {
        const template = MCP_CONFIG_TEMPLATES.find(t => t.toolId === tool);
        if (!template) {
          this.deps.ui.displayError(
            this.deps.t('errors.mcp.unsupportedTool', { tool, supported: this.getSupportedToolIds().join(', ') })
          );
          return result;
        }
        toolsToInstall = [tool];
      }
    } else {
      // No tool specified - install for all detected
      toolsToInstall = await this.detectInstalledTools();
    }

    if (toolsToInstall.length === 0) {
      this.deps.ui.displayWarning(this.deps.t('warnings.mcp.noToolsDetected'));
      return result;
    }

    // Install for each tool
    for (const toolId of toolsToInstall) {
      const installation = await this.installForTool(toolId, basePath, isGlobal, dryRun, verbose);
      result.installations.push(installation);

      if (installation.action === 'created' || installation.action === 'updated') {
        result.filesCreated++;
      } else if (installation.action === 'skipped') {
        result.filesSkipped++;
      }
    }

    // Display summary
    if (!dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        this.deps.t('success.mcp.installed', { count: result.filesCreated })
      );
    }

    return result;
  }

  /**
   * Install MCP configuration for a single tool
   */
  private async installForTool(
    toolId: string,
    basePath: string,
    isGlobal: boolean,
    dryRun: boolean,
    verbose: boolean
  ): Promise<MCPInstallation> {
    const template = MCP_CONFIG_TEMPLATES.find(t => t.toolId === toolId);
    const toolDef = getToolById(toolId);

    if (!template || !toolDef) {
      return {
        tool: toolId,
        toolDisplayName: toolId,
        configPath: '',
        action: 'skipped',
        dryRun,
      };
    }

    const configPath = isGlobal ? template.globalConfigPath : template.localConfigPath;
    const fullConfigPath = path.join(basePath, configPath);
    const parseConfig = template.parseConfig ?? parseJsonConfig;
    const serializeConfig = template.serializeConfig ?? serializeJsonConfig;

    // Read existing config if it exists
    let existingConfig: unknown = {};
    const configExists = await fs.pathExists(fullConfigPath);
    if (configExists) {
      try {
        const content = await fs.readFile(fullConfigPath, 'utf-8');
        existingConfig = parseConfig(content);
      } catch {
        // File exists but could not be parsed, we'll overwrite while preserving custom formats when possible.
        existingConfig = {};
      }
    }

    // Check if already configured
    if (template.isConfigured(existingConfig)) {
      if (verbose) {
        this.deps.ui.displayInfo(
          toolDef.displayName,
          this.deps.t('info.mcp.alreadyConfigured', { tool: toolDef.displayName })
        );
      }
      return {
        tool: toolId,
        toolDisplayName: toolDef.displayName,
        configPath: fullConfigPath,
        action: 'skipped',
        dryRun,
      };
    }

    // Generate new config
    const newConfig = template.generateConfig(existingConfig, AI_CONTEXT_MCP_SERVER);

    if (dryRun) {
      const serializedConfig = serializeConfig(newConfig);
      this.deps.ui.displayInfo(
        toolDef.displayName,
        this.deps.t('info.mcp.wouldInstall', { tool: toolDef.displayName, path: fullConfigPath })
      );
      if (verbose) {
        console.log(serializedConfig);
      }
      return {
        tool: toolId,
        toolDisplayName: toolDef.displayName,
        configPath: fullConfigPath,
        action: 'created',
        dryRun: true,
      };
    }

    // Write config
    try {
      await fs.ensureDir(path.dirname(fullConfigPath));
      await fs.writeFile(fullConfigPath, serializeConfig(newConfig), 'utf-8');

      if (verbose) {
        this.deps.ui.displayInfo(
          toolDef.displayName,
          this.deps.t('info.mcp.installed', { tool: toolDef.displayName, path: fullConfigPath })
        );
      }

      const action = configExists ? 'updated' : 'created';
      return {
        tool: toolId,
        toolDisplayName: toolDef.displayName,
        configPath: fullConfigPath,
        action,
        dryRun: false,
      };
    } catch (error) {
      this.deps.ui.displayError(
        this.deps.t('errors.mcp.installFailed', { tool: toolDef.displayName }),
        error as Error
      );
      return {
        tool: toolId,
        toolDisplayName: toolDef.displayName,
        configPath: fullConfigPath,
        action: 'skipped',
        dryRun: false,
      };
    }
  }
}
