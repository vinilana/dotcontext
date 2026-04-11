/**
 * Unified Tool Registry
 *
 * Single source of truth for all AI tool configurations.
 * This eliminates duplication across import, export, sync, and reverse sync services.
 */

import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface ToolCapabilities {
  rules: boolean;
  agents: boolean;
  skills: boolean;
}

export interface ToolPaths {
  /** Primary export path for rules (relative to repo root) */
  rulesExport?: string;
  /** File extension to use when exporting rules directories */
  rulesFileExtension?: string;
  /** Import patterns for rules detection */
  rulesImport?: string[];
  /** Additional import paths for rules */
  rulesImportPaths?: string[];
  /** Export format for rules: 'single' file or 'directory' of files */
  rulesFormat?: 'single' | 'directory';

  /** Primary export path for agents (relative to repo root) */
  agentsExport?: string;
  /** Optional filename suffix to apply before `.md` when exporting agents */
  agentsFilenameSuffix?: string;
  /** Import patterns for agents detection */
  agentsImport?: string[];

  /** Primary export path for skills (relative to repo root) */
  skillsExport?: string;
  /** Import patterns for skills detection */
  skillsImport?: string[];
}

export interface ToolDefinition {
  /** Unique identifier (e.g., 'claude', 'cursor') */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Directory prefix for detection (e.g., '.claude', '.cursor') */
  directoryPrefix: string;
  /** What this tool supports */
  capabilities: ToolCapabilities;
  /** File paths for import/export operations */
  paths: ToolPaths;
  /** Description for CLI/docs */
  description: string;
  /** Special file patterns for detection (e.g., '.cursorrules', 'CLAUDE.md') */
  specialFiles?: string[];
}

// ============================================================================
// Tool Registry
// ============================================================================

export const TOOL_REGISTRY: ToolDefinition[] = [
  // Claude Code
  {
    id: 'claude',
    displayName: 'Claude Code',
    directoryPrefix: '.claude',
    capabilities: { rules: true, agents: true, skills: true },
    paths: {
      rulesExport: 'CLAUDE.md',
      rulesFormat: 'single',
      rulesImport: ['**/.claude/memories/**/*.md', '**/.claude/**/*.memory', '**/.claude/settings.json'],
      rulesImportPaths: ['.claude/memories', path.join(os.homedir(), '.claude', 'memories')],
      agentsExport: '.claude/agents',
      agentsImport: ['**/.claude/agents/**/*.md'],
      skillsExport: '.claude/skills',
      skillsImport: ['**/.claude/skills/*/SKILL.md', '**/.claude/skills/**/*.md'],
    },
    description: 'Claude Code main rules file',
    specialFiles: ['CLAUDE.md'],
  },

  // Cursor AI
  {
    id: 'cursor',
    displayName: 'Cursor AI',
    directoryPrefix: '.cursor',
    capabilities: { rules: true, agents: true, skills: false },
    paths: {
      rulesExport: '.cursor/rules',
      rulesFormat: 'directory',
      rulesFileExtension: '.mdc',
      rulesImport: ['**/.cursorrules', '**/.cursor/.cursorrules', '**/.cursor/rules/**/*.md', '**/.cursor/rules/**/*.mdc'],
      rulesImportPaths: ['.cursorrules', '.cursor/.cursorrules', '.cursor/rules'],
      agentsExport: '.cursor/agents',
      agentsImport: ['**/.cursor/agents/**/*.md'],
    },
    description: 'Cursor AI rules and agents',
    specialFiles: ['.cursorrules'],
  },

  // GitHub Copilot
  {
    id: 'github',
    displayName: 'GitHub Copilot',
    directoryPrefix: '.github',
    capabilities: { rules: true, agents: true, skills: true },
    paths: {
      rulesExport: '.github/copilot-instructions.md',
      rulesFormat: 'single',
      rulesImport: ['**/.github/copilot-instructions.md', '**/.github/instructions/**/*.instructions.md', '**/.github/copilot/**/*', '**/.github/.copilot/**/*'],
      rulesImportPaths: ['.github/copilot-instructions.md', '.github/instructions', '.github/copilot'],
      agentsExport: '.github/agents',
      agentsFilenameSuffix: '.agent',
      agentsImport: ['**/.github/agents/**/*.md', '**/.github/agents/**/*.agent.md'],
      skillsExport: '.github/skills',
      skillsImport: ['**/.github/skills/*/SKILL.md'],
    },
    description: 'GitHub Copilot instructions',
  },

  // Windsurf (Codeium)
  {
    id: 'windsurf',
    displayName: 'Windsurf (Codeium)',
    directoryPrefix: '.windsurf',
    capabilities: { rules: true, agents: true, skills: true },
    paths: {
      rulesExport: '.windsurf/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.windsurfrules', '**/.windsurf/rules/**/*.md', '**/.windsurf/.windsurfrules'],
      rulesImportPaths: ['.windsurfrules', '.windsurf/rules', '.windsurf/.windsurfrules'],
      agentsExport: '.windsurf/agents',
      agentsImport: ['**/.windsurf/agents/**/*.md'],
      skillsExport: '.windsurf/skills',
      skillsImport: ['**/.windsurf/skills/*/SKILL.md'],
    },
    description: 'Windsurf rules directory',
    specialFiles: ['.windsurfrules'],
  },

  // Cline
  {
    id: 'cline',
    displayName: 'Cline',
    directoryPrefix: '.cline',
    capabilities: { rules: true, agents: true, skills: false },
    paths: {
      rulesExport: '.cline/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.clinerules', '**/.cline/rules/**/*.md', '**/.cline/.clinerules'],
      rulesImportPaths: ['.clinerules', '.cline/rules', '.cline/.clinerules'],
      agentsExport: '.cline/agents',
      agentsImport: ['**/.cline/agents/**/*.md'],
    },
    description: 'Cline VS Code extension',
    specialFiles: ['.clinerules'],
  },

  // Continue.dev
  {
    id: 'continue',
    displayName: 'Continue.dev',
    directoryPrefix: '.continue',
    capabilities: { rules: true, agents: true, skills: false },
    paths: {
      rulesExport: '.continue/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.continuerules', '**/.continue/config.json', '**/.continue/rules/**/*.md'],
      rulesImportPaths: ['.continuerules', '.continue/config.json', '.continue/rules'],
      agentsExport: '.continue/agents',
      agentsImport: ['**/.continue/agents/**/*.md'],
    },
    description: 'Continue.dev agents directory',
    specialFiles: ['.continuerules'],
  },

  // Google Antigravity
  {
    id: 'antigravity',
    displayName: 'Google Antigravity',
    directoryPrefix: '.agent',
    capabilities: { rules: true, agents: true, skills: true },
    paths: {
      rulesExport: '.agents/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.agents/rules/**/*.md', '**/.agent/rules/**/*.md', '**/GEMINI.md'],
      rulesImportPaths: ['.agents/rules', '.agent/rules', path.join(os.homedir(), '.gemini', 'GEMINI.md')],
      agentsExport: '.agents/agents',
      agentsImport: ['**/.agents/agents/**/*.md', '**/.agent/agents/**/*.md'],
      skillsExport: '.agents/workflows',
      skillsImport: ['**/.agents/workflows/*/SKILL.md', '**/.agents/workflows/**/*.md', '**/.agent/workflows/*/SKILL.md', '**/.agent/workflows/**/*.md'],
    },
    description: 'Google Antigravity rules directory',
  },

  // Trae AI
  {
    id: 'trae',
    displayName: 'Trae AI',
    directoryPrefix: '.trae',
    capabilities: { rules: true, agents: true, skills: false },
    paths: {
      rulesExport: '.trae/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.trae/rules/**/*.md'],
      rulesImportPaths: ['.trae/rules'],
      agentsExport: '.trae/agents',
      agentsImport: ['**/.trae/agents/**/*.md'],
    },
    description: 'Trae AI rules directory',
  },

  // Gemini CLI
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    directoryPrefix: '.gemini',
    capabilities: { rules: true, agents: false, skills: true },
    paths: {
      rulesExport: 'GEMINI.md',
      rulesFormat: 'single',
      rulesImport: ['**/GEMINI.md'],
      rulesImportPaths: ['GEMINI.md'],
      skillsExport: '.gemini/skills',
      skillsImport: ['**/.gemini/skills/*/SKILL.md', '**/.gemini/skills/**/*.md'],
    },
    description: 'Gemini CLI project instructions',
  },

  // Codex CLI
  {
    id: 'codex',
    displayName: 'Codex CLI',
    directoryPrefix: '.codex',
    capabilities: { rules: true, agents: false, skills: true },
    paths: {
      rulesExport: 'AGENTS.md',
      rulesFormat: 'single',
      rulesImport: ['**/AGENTS.md', '**/.codex/instructions.md', '**/.codex/config.toml', '**/.codex/**/*.md'],
      rulesImportPaths: ['AGENTS.md', '.codex/instructions.md', '.codex/config.toml'],
      skillsExport: '.codex/skills',
      skillsImport: ['**/.codex/skills/*/SKILL.md', '**/.codex/skills/**/*.md'],
    },
    description: 'Codex project instructions',
  },

  // Agent Skills (Cross-Client) - agentskills.io interoperability standard
  {
    id: 'agents',
    displayName: 'Agent Skills (Cross-Client)',
    directoryPrefix: '.agents',
    capabilities: { rules: false, agents: false, skills: true },
    paths: {
      skillsExport: '.agents/skills',
      skillsImport: ['**/.agents/skills/*/SKILL.md', '**/.agents/skills/**/*.md'],
    },
    description: 'Cross-client agent skills directory (agentskills.io)',
  },

  // Aider
  {
    id: 'aider',
    displayName: 'Aider',
    directoryPrefix: '.aider',
    capabilities: { rules: true, agents: false, skills: false },
    paths: {
      rulesExport: 'CONVENTIONS.md',
      rulesFormat: 'single',
      rulesImport: ['**/CONVENTIONS.md', '**/.aider.conf.yml', '**/.aider/conventions.md', '**/.aider/**/*.md'],
      rulesImportPaths: ['CONVENTIONS.md', '.aider.conf.yml', '.aider/conventions.md'],
    },
    description: 'Aider coding conventions',
    specialFiles: ['CONVENTIONS.md'],
  },

  // Zed Editor
  {
    id: 'zed',
    displayName: 'Zed Editor',
    directoryPrefix: '.zed',
    capabilities: { rules: true, agents: false, skills: false },
    paths: {
      rulesExport: '.zed/rules',
      rulesFormat: 'directory',
      rulesImport: ['**/.zed/settings.json', '**/.zed/rules/**/*.md'],
      rulesImportPaths: ['.zed/settings.json', '.zed/rules'],
    },
    description: 'Zed editor AI settings',
  },

  // Claude Desktop
  {
    id: 'claude-desktop',
    displayName: 'Claude Desktop',
    directoryPrefix: '.claude-desktop',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Claude Desktop MCP configuration',
  },

  // VS Code (GitHub Copilot)
  {
    id: 'vscode',
    displayName: 'VS Code (GitHub Copilot)',
    directoryPrefix: '.vscode',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'VS Code GitHub Copilot MCP configuration',
  },

  // Roo Code
  {
    id: 'roo',
    displayName: 'Roo Code',
    directoryPrefix: '.roo',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Roo Code MCP configuration',
  },

  // Warp Terminal
  {
    id: 'warp',
    displayName: 'Warp Terminal',
    directoryPrefix: '.warp',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Warp Terminal MCP configuration',
  },

  // Amazon Q Developer CLI
  {
    id: 'amazonq',
    displayName: 'Amazon Q Developer CLI',
    directoryPrefix: '.amazonq',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Amazon Q Developer CLI MCP configuration',
  },

  // Gemini CLI
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    directoryPrefix: '.gemini',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Gemini CLI MCP configuration',
  },

  // Kiro
  {
    id: 'kiro',
    displayName: 'Kiro',
    directoryPrefix: '.kiro',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Kiro MCP configuration',
  },

  // JetBrains IDEs
  {
    id: 'jetbrains',
    displayName: 'JetBrains IDEs',
    directoryPrefix: '.idea',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'JetBrains IDEs MCP configuration',
  },

  // Kilo Code
  {
    id: 'kilo',
    displayName: 'Kilo Code',
    directoryPrefix: '.kilo',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'Kilo Code MCP configuration',
  },

  // GitHub Copilot CLI
  {
    id: 'copilot-cli',
    displayName: 'GitHub Copilot CLI',
    directoryPrefix: '.copilot',
    capabilities: { rules: false, agents: false, skills: false },
    paths: {},
    description: 'GitHub Copilot CLI MCP configuration',
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a tool by its ID
 */
export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.id === id);
}

/**
 * Get all tool IDs
 */
export function getAllToolIds(): string[] {
  return TOOL_REGISTRY.map(t => t.id);
}

/**
 * Get tools that support a specific capability
 */
export function getToolsWithCapability(capability: keyof ToolCapabilities): ToolDefinition[] {
  return TOOL_REGISTRY.filter(t => t.capabilities[capability]);
}

/**
 * Get tool ID from a file path
 */
export function getToolIdFromPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (normalizedPath.includes('.agents/') || normalizedPath.startsWith('.agents')) {
    return 'antigravity';
  }

  // Check directory prefixes
  for (const tool of TOOL_REGISTRY) {
    if (normalizedPath.includes(`${tool.directoryPrefix}/`) ||
        normalizedPath.startsWith(tool.directoryPrefix)) {
      return tool.id;
    }
  }

  // Check special files
  for (const tool of TOOL_REGISTRY) {
    if (tool.specialFiles) {
      for (const specialFile of tool.specialFiles) {
        if (normalizedPath.includes(specialFile)) {
          return tool.id;
        }
      }
    }
  }

  return 'unknown';
}

/**
 * Get display name for a tool ID
 */
export function getToolDisplayName(toolId: string): string {
  const tool = getToolById(toolId);
  return tool?.displayName || toolId;
}

/**
 * Get tool capabilities
 */
export function getToolCapabilities(toolId: string): ToolCapabilities {
  const tool = getToolById(toolId);
  return tool?.capabilities || { rules: false, agents: false, skills: false };
}

/**
 * Build directory prefix to tool ID mapping
 */
export function getDirectoryPrefixMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tool of TOOL_REGISTRY) {
    map[tool.directoryPrefix] = tool.id;
  }
  return map;
}

/**
 * Build tool ID to display name mapping
 */
export function getDisplayNameMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tool of TOOL_REGISTRY) {
    map[tool.id] = tool.displayName;
  }
  return map;
}

/**
 * Build tool capabilities mapping
 */
export function getCapabilitiesMap(): Record<string, ToolCapabilities> {
  const map: Record<string, ToolCapabilities> = {};
  for (const tool of TOOL_REGISTRY) {
    map[tool.id] = tool.capabilities;
  }
  return map;
}

// ============================================================================
// Derived Presets (for backward compatibility)
// ============================================================================

/**
 * Get rules export presets (for exportRulesService)
 */
export function getRulesExportPresets(): Record<string, Array<{
  name: string;
  path: string;
  format: 'single' | 'directory';
  fileExtension?: string;
  description: string;
}>> {
  const presets: Record<string, Array<{ name: string; path: string; format: 'single' | 'directory'; fileExtension?: string; description: string }>> = {};

  for (const tool of getToolsWithCapability('rules')) {
    if (tool.paths.rulesExport) {
      presets[tool.id] = [{
        name: `${tool.id}-rules`,
        path: tool.paths.rulesExport,
        format: tool.paths.rulesFormat || 'single',
        fileExtension: tool.paths.rulesFileExtension,
        description: tool.description,
      }];
    }
  }

  return presets;
}

/**
 * Get agents sync presets (for sync/presets)
 */
export function getAgentsSyncPresets(): Record<string, {
  name: string;
  path: string;
  filenameSuffix?: string;
  description: string;
}> {
  const presets: Record<string, { name: string; path: string; filenameSuffix?: string; description: string }> = {};

  for (const tool of getToolsWithCapability('agents')) {
    if (tool.paths.agentsExport) {
      presets[tool.id] = {
        name: tool.id,
        path: tool.paths.agentsExport,
        filenameSuffix: tool.paths.agentsFilenameSuffix,
        description: `${tool.displayName} agents directory`,
      };
    }
  }

  return presets;
}

/**
 * Get skills export presets (for skillExportService)
 */
export function getSkillsExportPresets(): Record<string, Array<{
  name: string;
  path: string;
  description: string;
}>> {
  const presets: Record<string, Array<{ name: string; path: string; description: string }>> = {};

  for (const tool of getToolsWithCapability('skills')) {
    if (tool.paths.skillsExport) {
      presets[tool.id] = [{
        name: `${tool.id}-skills`,
        path: tool.paths.skillsExport,
        description: `${tool.displayName} skills directory`,
      }];
    }
  }

  return presets;
}

/**
 * Get rules import sources (for import/presets)
 */
export function getRulesImportSources(): Array<{
  name: string;
  paths: string[];
  patterns: string[];
  description: string;
}> {
  return getToolsWithCapability('rules')
    .filter(t => t.paths.rulesImport)
    .map(t => ({
      name: t.id === 'cursor' ? 'cursorrules' :
            t.id === 'windsurf' ? 'windsurfrules' :
            t.id === 'cline' ? 'clinerules' :
            t.id,
      paths: t.paths.rulesImportPaths || [],
      patterns: t.paths.rulesImport || [],
      description: t.description,
    }));
}

/**
 * Get agents import sources (for import/presets)
 */
export function getAgentsImportSources(): Array<{
  name: string;
  paths: string[];
  patterns: string[];
  description: string;
}> {
  return getToolsWithCapability('agents')
    .filter(t => t.paths.agentsImport)
    .map(t => ({
      name: `${t.id}-agents`,
      paths: [t.paths.agentsExport || ''],
      patterns: t.paths.agentsImport || [],
      description: `${t.displayName} agents directory`,
    }));
}

/**
 * Get skills import sources (for reverseSync/presets)
 */
export function getSkillsImportSources(): Array<{
  name: string;
  paths: string[];
  patterns: string[];
  description: string;
}> {
  return getToolsWithCapability('skills')
    .filter(t => t.paths.skillsImport)
    .map(t => ({
      name: `${t.id}-skills`,
      paths: [t.paths.skillsExport || ''],
      patterns: t.paths.skillsImport || [],
      description: `${t.displayName} skills directory`,
    }));
}
