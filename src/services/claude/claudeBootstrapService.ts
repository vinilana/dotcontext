import * as path from 'path';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
  addError,
} from '../shared';

type FileAction = 'created' | 'updated' | 'unchanged';

export type ClaudeBootstrapServiceDependencies = BaseDependencies;

export interface ClaudeBootstrapOptions {
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface ClaudeBootstrapResult extends OperationResult {
  repoPath: string;
  mcpPath: string;
  settingsPath: string;
  mcpAction: FileAction;
  settingsAction: FileAction;
  agentsCreated: number;
  agentsUpdated: number;
  agentsSkipped: number;
  hookScriptsWritten: number;
  gitignoreUpdated: boolean;
  dryRun: boolean;
}

const GENERATED_MARKER = '<!-- generated-by: ai-coders-context claude -->';

const MCP_SERVER_NAME = 'ai-context';
const MCP_SERVER_CONFIG = {
  command: 'npx',
  args: ['-y', '@ai-coders/context@latest', 'mcp'],
};

const SETTINGS_LOCAL_GITIGNORE_ENTRY = '.claude/settings.local.json';

const PRE_TOOL_HOOK_COMMAND = 'node .claude/hooks/pre-tool-use.js';
const STOP_HOOK_COMMAND = 'node .claude/hooks/stop.js';

const PRE_TOOL_HOOK_RELATIVE_PATH = path.join('.claude', 'hooks', 'pre-tool-use.js');
const STOP_HOOK_RELATIVE_PATH = path.join('.claude', 'hooks', 'stop.js');

const REQUIRED_DENY_PATTERNS = [
  'Bash(rm -rf*)',
  'Bash(del /f /s*)',
  'Bash(curl *|* sh*)',
  'Bash(iwr *|* iex*)',
  'Edit(.env*)',
  'Write(.env*)',
  'Edit(**/*.pem)',
  'Write(**/*.pem)',
  'Edit(**/id_rsa*)',
  'Write(**/id_rsa*)',
  'Edit(**/*credentials*)',
  'Write(**/*credentials*)',
  'Edit(**/*secrets*)',
  'Write(**/*secrets*)',
];

const REQUIRED_ASK_PATTERNS = [
  'Bash(*)',
  'Edit(*)',
  'Write(*)',
];

interface MergeJsonResult {
  action: FileAction;
  wroteFile: boolean;
}

interface HookScriptWriteResult {
  wroteFile: boolean;
  skipped: boolean;
}

export class ClaudeBootstrapService {
  constructor(private deps: ClaudeBootstrapServiceDependencies) {}

  async run(repoPath: string, options: ClaudeBootstrapOptions = {}): Promise<ClaudeBootstrapResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const result: ClaudeBootstrapResult = {
      ...createEmptyResult(),
      repoPath: absoluteRepoPath,
      mcpPath: path.join(absoluteRepoPath, '.mcp.json'),
      settingsPath: path.join(absoluteRepoPath, '.claude', 'settings.json'),
      mcpAction: 'unchanged',
      settingsAction: 'unchanged',
      agentsCreated: 0,
      agentsUpdated: 0,
      agentsSkipped: 0,
      hookScriptsWritten: 0,
      gitignoreUpdated: false,
      dryRun: Boolean(options.dryRun),
    };

    try {
      const mcpMerge = await this.mergeMcpConfig(absoluteRepoPath, options);
      result.mcpAction = mcpMerge.action;
      if (mcpMerge.wroteFile) {
        result.filesCreated += 1;
      } else {
        result.filesSkipped += 1;
      }

      const settingsMerge = await this.mergeClaudeSettings(absoluteRepoPath, options);
      result.settingsAction = settingsMerge.action;
      if (settingsMerge.wroteFile) {
        result.filesCreated += 1;
      } else {
        result.filesSkipped += 1;
      }

      const hookResults = await this.writeHookScripts(absoluteRepoPath, options);
      result.hookScriptsWritten = hookResults.filter((item) => item.wroteFile).length;
      result.filesCreated += result.hookScriptsWritten;
      result.filesSkipped += hookResults.filter((item) => !item.wroteFile).length;

      const agentResult = await this.exportClaudeAgents(absoluteRepoPath, options);
      result.agentsCreated = agentResult.created;
      result.agentsUpdated = agentResult.updated;
      result.agentsSkipped = agentResult.skipped;
      result.filesCreated += agentResult.created + agentResult.updated;
      result.filesSkipped += agentResult.skipped;

      const gitignoreUpdated = await this.ensureLocalSettingsIgnored(absoluteRepoPath, options);
      result.gitignoreUpdated = gitignoreUpdated;
      if (gitignoreUpdated) {
        result.filesCreated += 1;
      } else {
        result.filesSkipped += 1;
      }

      this.logSummary(result);
      return result;
    } catch (error) {
      addError(result, 'claude:bootstrap', error);
      throw error;
    }
  }

  private async mergeMcpConfig(
    repoPath: string,
    options: ClaudeBootstrapOptions
  ): Promise<MergeJsonResult> {
    const mcpPath = path.join(repoPath, '.mcp.json');
    const existing = await this.readJsonFile(mcpPath);
    const output = this.asObject(existing.data);
    const mcpServers = this.asObject(output.mcpServers);
    output.mcpServers = mcpServers;

    const existingServer = mcpServers[MCP_SERVER_NAME];
    let action: FileAction = 'unchanged';

    if (!this.isObject(existingServer)) {
      mcpServers[MCP_SERVER_NAME] = { ...MCP_SERVER_CONFIG };
      action = existing.exists ? 'updated' : 'created';
    } else if (options.force) {
      if (!this.deepEqual(existingServer, MCP_SERVER_CONFIG)) {
        mcpServers[MCP_SERVER_NAME] = { ...MCP_SERVER_CONFIG };
        action = 'updated';
      }
    }

    if (action === 'unchanged') {
      return { action, wroteFile: false };
    }

    const wroteFile = await this.writeJsonFile(mcpPath, output, options);
    return { action, wroteFile };
  }

  private async mergeClaudeSettings(
    repoPath: string,
    options: ClaudeBootstrapOptions
  ): Promise<MergeJsonResult> {
    const settingsPath = path.join(repoPath, '.claude', 'settings.json');
    const existing = await this.readJsonFile(settingsPath);
    const output = this.asObject(existing.data);

    output.permissions = this.mergePermissions(output.permissions);
    output.hooks = this.mergeHooks(output.hooks);

    const action: FileAction = existing.exists
      ? (this.deepEqual(existing.data, output) ? 'unchanged' : 'updated')
      : 'created';

    if (action === 'unchanged') {
      return { action, wroteFile: false };
    }

    const wroteFile = await this.writeJsonFile(settingsPath, output, options);
    return { action, wroteFile };
  }

  private mergePermissions(value: unknown): Record<string, unknown> {
    const permissions = this.asObject(value);
    const deny = this.uniqueStrings([
      ...this.toStringArray(permissions.deny),
      ...REQUIRED_DENY_PATTERNS,
    ]);
    const ask = this.uniqueStrings([
      ...this.toStringArray(permissions.ask),
      ...REQUIRED_ASK_PATTERNS,
    ]);

    const merged: Record<string, unknown> = {
      ...permissions,
      deny,
      ask,
    };

    return merged;
  }

  private mergeHooks(value: unknown): Record<string, unknown> {
    const hooks = this.asObject(value);
    const preToolUse = this.ensureCommandHook(
      this.toObjectArray(hooks.PreToolUse),
      PRE_TOOL_HOOK_COMMAND
    );
    const stop = this.ensureCommandHook(
      this.toObjectArray(hooks.Stop),
      STOP_HOOK_COMMAND
    );

    return {
      ...hooks,
      PreToolUse: preToolUse,
      Stop: stop,
    };
  }

  private ensureCommandHook(
    hookRules: Array<Record<string, unknown>>,
    command: string
  ): Array<Record<string, unknown>> {
    const hasHook = hookRules.some((rule) => {
      const hooks = this.toObjectArray(rule.hooks);
      return hooks.some((hook) => hook.command === command);
    });

    if (hasHook) {
      return hookRules;
    }

    return [
      ...hookRules,
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command,
          },
        ],
      },
    ];
  }

  private async writeHookScripts(
    repoPath: string,
    options: ClaudeBootstrapOptions
  ): Promise<HookScriptWriteResult[]> {
    const preToolResult = await this.writeManagedFile(
      path.join(repoPath, PRE_TOOL_HOOK_RELATIVE_PATH),
      this.buildPreToolUseHookScript(),
      options
    );
    const stopResult = await this.writeManagedFile(
      path.join(repoPath, STOP_HOOK_RELATIVE_PATH),
      this.buildStopHookScript(),
      options
    );

    return [preToolResult, stopResult];
  }

  private async exportClaudeAgents(
    repoPath: string,
    options: ClaudeBootstrapOptions
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const sourceDir = path.join(repoPath, '.context', 'agents');
    const targetDir = path.join(repoPath, '.claude', 'agents');
    const output = { created: 0, updated: 0, skipped: 0 };

    if (!(await fs.pathExists(sourceDir))) {
      return output;
    }

    const entries = await fs.readdir(sourceDir);
    const agentFiles = entries.filter((file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md');

    if (agentFiles.length === 0) {
      return output;
    }

    if (!options.dryRun) {
      await fs.ensureDir(targetDir);
    }

    for (const filename of agentFiles) {
      const sourcePath = path.join(sourceDir, filename);
      const targetPath = path.join(targetDir, filename);
      const sourceContent = await fs.readFile(sourcePath, 'utf-8');
      const targetContent = this.buildManagedAgentContent(sourceContent, filename);

      if (!(await fs.pathExists(targetPath))) {
        if (!options.dryRun) {
          await fs.writeFile(targetPath, targetContent, 'utf-8');
        }
        output.created += 1;
        continue;
      }

      const existingTarget = await fs.readFile(targetPath, 'utf-8');
      const isManaged = existingTarget.includes(GENERATED_MARKER);
      if (!isManaged) {
        output.skipped += 1;
        continue;
      }

      if (existingTarget === targetContent) {
        output.skipped += 1;
        continue;
      }

      if (!options.dryRun) {
        await fs.writeFile(targetPath, targetContent, 'utf-8');
      }
      output.updated += 1;
    }

    return output;
  }

  private async ensureLocalSettingsIgnored(
    repoPath: string,
    options: ClaudeBootstrapOptions
  ): Promise<boolean> {
    const gitignorePath = path.join(repoPath, '.gitignore');
    const exists = await fs.pathExists(gitignorePath);
    const content = exists ? await fs.readFile(gitignorePath, 'utf-8') : '';
    const lines = content.split(/\r?\n/);

    if (lines.some((line) => line.trim() === SETTINGS_LOCAL_GITIGNORE_ENTRY)) {
      return false;
    }

    const next = content.length > 0 && !content.endsWith('\n')
      ? `${content}\n${SETTINGS_LOCAL_GITIGNORE_ENTRY}\n`
      : `${content}${SETTINGS_LOCAL_GITIGNORE_ENTRY}\n`;

    if (!options.dryRun) {
      await fs.writeFile(gitignorePath, next, 'utf-8');
    }

    return true;
  }

  private buildManagedAgentContent(content: string, filename: string): string {
    const normalized = content.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    const frontmatterEnsured = this.ensureAgentFrontmatter(normalized, filename);
    const withTrailingNewline = frontmatterEnsured.endsWith('\n')
      ? frontmatterEnsured
      : `${frontmatterEnsured}\n`;

    return `${GENERATED_MARKER}\n${withTrailingNewline}`;
  }

  private ensureAgentFrontmatter(content: string, filename: string): string {
    const lines = content.split('\n');
    const derivedName = this.toAgentName(filename);
    const derivedDescription = `Claude Code subagent for ${derivedName.toLowerCase()} tasks`;

    if (lines[0]?.trim() === '---') {
      const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
      if (endIndex > 0) {
        const frontmatterLines = lines.slice(1, endIndex);
        const body = lines.slice(endIndex + 1).join('\n').replace(/^\n+/, '');
        const hasName = frontmatterLines.some((line) => /^\s*name:\s*/i.test(line));
        const hasDescription = frontmatterLines.some((line) => /^\s*description:\s*/i.test(line));

        if (!hasName) {
          frontmatterLines.unshift(`name: ${this.toYamlString(derivedName)}`);
        }
        if (!hasDescription) {
          frontmatterLines.push(`description: ${this.toYamlString(derivedDescription)}`);
        }

        return ['---', ...frontmatterLines, '---', '', body].join('\n');
      }
    }

    const body = content.replace(/^\n+/, '');
    return [
      '---',
      `name: ${this.toYamlString(derivedName)}`,
      `description: ${this.toYamlString(derivedDescription)}`,
      '---',
      '',
      body,
    ].join('\n');
  }

  private toAgentName(filename: string): string {
    const slug = filename.replace(/\.md$/i, '');
    return slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toYamlString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private async writeManagedFile(
    filePath: string,
    content: string,
    options: ClaudeBootstrapOptions
  ): Promise<HookScriptWriteResult> {
    const exists = await fs.pathExists(filePath);

    if (exists) {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      const isManaged = existingContent.includes(GENERATED_MARKER);
      if (!isManaged) {
        return { wroteFile: false, skipped: true };
      }
      if (existingContent === content) {
        return { wroteFile: false, skipped: true };
      }
    }

    if (!options.dryRun) {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf-8');
    }

    return { wroteFile: true, skipped: false };
  }

  private buildPreToolUseHookScript(): string {
    return `#!/usr/bin/env node
${GENERATED_MARKER}
'use strict';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function get(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return acc[key];
    return undefined;
  }, obj);
}

function includesSensitiveValue(value) {
  const patterns = [
    /(^|[\\\\/])\\.env(\\.|$)/i,
    /\\.pem$/i,
    /(^|[\\\\/])id_rsa(\\.|$|_)/i,
    /credentials/i,
    /secrets/i,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function block(message) {
  process.stderr.write('[claude-guardrails] ' + message + '\\n');
  process.exit(2);
}

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }

  const toolName = String(
    get(payload, 'tool_name') ||
    get(payload, 'toolName') ||
    get(payload, 'tool.name') ||
    ''
  );
  const command = String(
    get(payload, 'tool_input.command') ||
    get(payload, 'input.command') ||
    get(payload, 'command') ||
    ''
  );
  const filePath = String(
    get(payload, 'tool_input.file_path') ||
    get(payload, 'tool_input.path') ||
    get(payload, 'input.file_path') ||
    get(payload, 'input.path') ||
    ''
  );

  const destructivePatterns = [
    /\\brm\\s+-rf\\b/i,
    /\\bdel\\s+\\/f\\s+\\/s\\b/i,
    /\\bcurl\\b[^\\n|]*\\|\\s*(sh|bash)\\b/i,
    /\\biwr\\b[^\\n|]*\\|\\s*iex\\b/i,
  ];
  if (destructivePatterns.some((pattern) => pattern.test(command))) {
    block('Blocked dangerous command in PreToolUse: ' + command);
  }

  const sensitiveInCommand = includesSensitiveValue(command);
  const sensitiveInPath = includesSensitiveValue(filePath);
  if (sensitiveInCommand || sensitiveInPath) {
    block('Blocked access to sensitive file or credential-like path in PreToolUse.');
  }

  const writeLikeTool = /^(write|edit|multiedit|bash)$/i.test(toolName);
  if (writeLikeTool && includesSensitiveValue(filePath)) {
    block('Blocked write/edit to sensitive file in PreToolUse: ' + filePath);
  }

  process.exit(0);
})();
`;
  }

  private buildStopHookScript(): string {
    return `#!/usr/bin/env node
${GENERATED_MARKER}
'use strict';

const { execSync } = require('child_process');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function get(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return acc[key];
    return undefined;
  }, obj);
}

function getChangedFiles() {
  try {
    const output = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractAssistantText(payload) {
  const candidates = [
    get(payload, 'response.output_text'),
    get(payload, 'output_text'),
    get(payload, 'message'),
    get(payload, 'text'),
    get(payload, 'completion'),
  ];
  return String(candidates.find((item) => typeof item === 'string' && item.trim().length > 0) || '');
}

function missingChecklist(text) {
  const hasSummary = /(summary|resumo|changes|mudancas|o que mudou)/i.test(text);
  const hasFiles = /(files|arquivos|alterados|modified)/i.test(text);
  const hasTests = /(test|tests|como testar|how to test|npm test|pnpm test|yarn test)/i.test(text);
  return !(hasSummary && hasFiles && hasTests);
}

(async () => {
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    process.exit(0);
  }

  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }

  const stopReason = String(get(payload, 'stop_reason') || get(payload, 'stopReason') || '').toLowerCase();
  if (stopReason && !/(end|stop|complete|done)/.test(stopReason)) {
    process.exit(0);
  }

  const assistantText = extractAssistantText(payload).trim();
  if (assistantText.length < 120) {
    process.exit(0);
  }

  if (missingChecklist(assistantText)) {
    process.stderr.write('[claude-guardrails] Stop checklist required when changes exist:\\n');
    process.stderr.write('1) resumo do que mudou\\n2) arquivos alterados\\n3) como testar\\n');
    process.exit(2);
  }

  process.exit(0);
})();
`;
  }

  private async readJsonFile(filePath: string): Promise<{ exists: boolean; data: unknown }> {
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      return { exists: false, data: {} };
    }

    const raw = await fs.readFile(filePath, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      return { exists: true, data: parsed };
    } catch {
      throw new Error(`Invalid JSON at ${filePath}`);
    }
  }

  private async writeJsonFile(
    filePath: string,
    data: Record<string, unknown>,
    options: ClaudeBootstrapOptions
  ): Promise<boolean> {
    if (options.dryRun) {
      return true;
    }

    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, this.stringifyJson(data), 'utf-8');
    return true;
  }

  private stringifyJson(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asObject(value: unknown): Record<string, unknown> {
    return this.isObject(value) ? { ...value } : {};
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private toObjectArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is Record<string, unknown> => this.isObject(item));
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values)];
  }

  private deepEqual(left: unknown, right: unknown): boolean {
    return this.stableStringify(left) === this.stableStringify(right);
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(this.sortRecursively(value));
  }

  private sortRecursively(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortRecursively(item));
    }
    if (!this.isObject(value)) {
      return value;
    }
    const sortedEntries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(sortedEntries.map(([key, item]) => [key, this.sortRecursively(item)]));
  }

  private logSummary(result: ClaudeBootstrapResult): void {
    const details = [
      `mcp=${result.mcpAction}`,
      `settings=${result.settingsAction}`,
      `agents(created=${result.agentsCreated}, updated=${result.agentsUpdated}, skipped=${result.agentsSkipped})`,
      `hooks=${result.hookScriptsWritten}`,
      `gitignore=${result.gitignoreUpdated ? 'updated' : 'unchanged'}`,
    ];

    this.deps.ui.displaySuccess('Claude Code bootstrap completed');
    this.deps.ui.displayInfo('Summary', details.join(', '));
  }
}
