import * as path from 'path';
import * as fs from 'fs-extra';
import { promises as nodeFs } from 'fs';

import {
  readHookTraceFailures,
  WorkflowService,
  type HookTraceFailureSummary,
} from '../../harness';
import {
  CODEX_HOOK_TEMPLATES,
  CODEX_HOOK_TRUST_REMINDER,
  isCurrentCodexHookCommand,
  isDotcontextCodexHookCommand,
} from '../../integrations/codex/hooks/codexHookTemplates';
import {
  resolveHookRepoRoot,
  type HookRepoRootResolution,
} from '../../integrations/shared';
import type { BaseDependencies } from '../../shared/system/types';
import { resolveRuntimeLayoutFromRepo } from '../../shared/fs/pathHelpers';

export type HookDoctorHost = 'codex';
export type HookDoctorCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface HookDoctorOptions {
  host?: string;
  repoPath?: string;
  cwd?: string;
}

export interface HookDoctorCheck {
  id: string;
  label: string;
  status: HookDoctorCheckStatus;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface HookDoctorSummary {
  status: Exclude<HookDoctorCheckStatus, 'skip'>;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
}

export interface HookDoctorHostReport {
  host: HookDoctorHost | string;
  hostDisplayName: string;
  repoPath: string;
  root: HookRepoRootResolution;
  checks: HookDoctorCheck[];
  summary: HookDoctorSummary;
  recommendations: string[];
}

export interface HookDoctorResult {
  generatedAt: string;
  requestedHost?: string;
  repoPath: string;
  root: HookRepoRootResolution;
  reports: HookDoctorHostReport[];
  summary: HookDoctorSummary;
  exitCode: 0 | 1;
}

export type HookDoctorServiceDependencies = BaseDependencies;

type CodexHookEventName = keyof typeof CODEX_HOOK_TEMPLATES;

interface ParsedCodexTomlHookBlock {
  eventName: CodexHookEventName;
  commands: string[];
}

interface CodexConfigInspection {
  format: 'json' | 'toml';
  path: string;
  parseError?: string;
  featuresHooksEnabled?: boolean;
  commandsByEvent: Record<CodexHookEventName, string[]>;
  dotcontextCommandCount: number;
  currentEvents: CodexHookEventName[];
  missingCurrentEvents: CodexHookEventName[];
}

interface RecentTraceInfo {
  sessionId: string;
  tracePath: string;
  traceAt: string;
  traceCount?: number;
}

const KNOWN_HOOK_HOSTS = new Set(['claude-code', 'codex', 'pi']);
const CODEX_EVENT_NAMES = Object.keys(CODEX_HOOK_TEMPLATES) as CodexHookEventName[];
const RECENT_TRACE_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRACE_TAIL_BYTES = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createCheck(input: HookDoctorCheck): HookDoctorCheck {
  return input;
}

function summarizeChecks(checks: HookDoctorCheck[]): HookDoctorSummary {
  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

  return {
    ...summary,
    status: summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass',
  };
}

function summarizeReports(reports: HookDoctorHostReport[]): HookDoctorSummary {
  const checks = reports.flatMap((report) => report.checks);
  return summarizeChecks(checks);
}

function parseTomlStringAssignment(line: string, key: string): string | undefined {
  const match = line.trim().match(new RegExp(`^${key}\\s*=\\s*(.+)$`));
  if (!match) {
    return undefined;
  }

  const rawValue = match[1].trim();
  try {
    return JSON.parse(rawValue) as string;
  } catch {
    return rawValue.replace(/^["']|["']$/g, '').trim();
  }
}

function parseTomlCommandLine(line: string): string | undefined {
  return parseTomlStringAssignment(line, 'command');
}

function parseCodexTomlHookBlocks(content: string): ParsedCodexTomlHookBlock[] {
  const blocks: ParsedCodexTomlHookBlock[] = [];
  let current: ParsedCodexTomlHookBlock | undefined;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const hookHeader = trimmed.match(/^\[\[hooks\.(SessionStart|PostToolUse|Stop)\]\]$/);

    if (hookHeader) {
      if (current) {
        blocks.push(current);
      }
      current = {
        eventName: hookHeader[1] as CodexHookEventName,
        commands: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith('[')) {
      blocks.push(current);
      current = undefined;
      continue;
    }

    const command = parseTomlCommandLine(line);
    if (command !== undefined) {
      current.commands.push(command);
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function tomlHooksFeatureEnabled(content: string): boolean {
  let inFeatures = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '[features]') {
      inFeatures = true;
      continue;
    }

    if (trimmed.startsWith('[')) {
      inFeatures = false;
      continue;
    }

    if (inFeatures && /^hooks\s*=\s*true(?:\s*#.*)?$/.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function emptyCommandsByEvent(): Record<CodexHookEventName, string[]> {
  return CODEX_EVENT_NAMES.reduce(
    (acc, eventName) => {
      acc[eventName] = [];
      return acc;
    },
    {} as Record<CodexHookEventName, string[]>
  );
}

function inspectCommands(
  format: CodexConfigInspection['format'],
  configPath: string,
  commandsByEvent: Record<CodexHookEventName, string[]>,
  options: { parseError?: string; featuresHooksEnabled?: boolean } = {}
): CodexConfigInspection {
  const currentEvents = CODEX_EVENT_NAMES.filter((eventName) => (
    commandsByEvent[eventName].some((command) => isCurrentCodexHookCommand(command))
  ));
  const missingCurrentEvents = CODEX_EVENT_NAMES.filter((eventName) => !currentEvents.includes(eventName));
  const dotcontextCommandCount = CODEX_EVENT_NAMES.reduce((count, eventName) => (
    count + commandsByEvent[eventName].filter((command) => isDotcontextCodexHookCommand(command)).length
  ), 0);

  return {
    format,
    path: configPath,
    commandsByEvent,
    dotcontextCommandCount,
    currentEvents,
    missingCurrentEvents,
    ...options,
  };
}

function inspectCodexJsonConfig(configPath: string, document: unknown): CodexConfigInspection {
  const commandsByEvent = emptyCommandsByEvent();
  const hooks = isRecord(document) && isRecord(document.hooks)
    ? document.hooks
    : {};

  for (const eventName of CODEX_EVENT_NAMES) {
    const entries = hooks[eventName];
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
        continue;
      }

      for (const hook of entry.hooks) {
        if (isRecord(hook) && typeof hook.command === 'string') {
          commandsByEvent[eventName].push(hook.command);
        }
      }
    }
  }

  return inspectCommands('json', configPath, commandsByEvent);
}

function inspectCodexTomlConfig(configPath: string, content: string): CodexConfigInspection {
  const commandsByEvent = emptyCommandsByEvent();
  for (const block of parseCodexTomlHookBlocks(content)) {
    commandsByEvent[block.eventName].push(...block.commands);
  }

  return inspectCommands('toml', configPath, commandsByEvent, {
    featuresHooksEnabled: tomlHooksFeatureEnabled(content),
  });
}

async function inspectExistingCodexConfigs(repoPath: string): Promise<CodexConfigInspection[]> {
  const jsonPath = path.join(repoPath, '.codex', 'hooks.json');
  const tomlPath = path.join(repoPath, '.codex', 'config.toml');
  const inspections: CodexConfigInspection[] = [];

  if (await fs.pathExists(jsonPath)) {
    try {
      inspections.push(inspectCodexJsonConfig(jsonPath, await fs.readJson(jsonPath)));
    } catch (error) {
      inspections.push(inspectCommands('json', jsonPath, emptyCommandsByEvent(), {
        parseError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (await fs.pathExists(tomlPath)) {
    try {
      inspections.push(inspectCodexTomlConfig(tomlPath, await fs.readFile(tomlPath, 'utf8')));
    } catch (error) {
      inspections.push(inspectCommands('toml', tomlPath, emptyCommandsByEvent(), {
        parseError: error instanceof Error ? error.message : String(error),
        featuresHooksEnabled: false,
      }));
    }
  }

  return inspections;
}

function relativeToRepo(repoPath: string, targetPath: string): string {
  const relative = path.relative(repoPath, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return targetPath;
  }
  return relative;
}

async function readTraceTail(tracePath: string): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof nodeFs.open>> | undefined;
  try {
    handle = await nodeFs.open(tracePath, 'r');
    const stat = await handle.stat();
    const length = Math.min(stat.size, TRACE_TAIL_BYTES);
    if (length === 0) {
      return undefined;
    }

    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return buffer.toString('utf8');
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readTraceMtime(tracePath: string): Promise<string | undefined> {
  try {
    return (await fs.stat(tracePath)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function readLastTraceAt(tracePath: string): Promise<string | undefined> {
  const content = await readTraceTail(tracePath);
  if (content) {
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (isRecord(parsed) && typeof parsed.createdAt === 'string') {
          return parsed.createdAt;
        }
      } catch {
        // Ignore malformed trace lines while looking for the latest valid trace.
      }
    }
  }

  return readTraceMtime(tracePath);
}

function compareTraceRecency(a: RecentTraceInfo, b: RecentTraceInfo): number {
  const aTime = Date.parse(a.traceAt);
  const bTime = Date.parse(b.traceAt);
  const normalizedA = Number.isFinite(aTime) ? aTime : 0;
  const normalizedB = Number.isFinite(bTime) ? bTime : 0;
  return normalizedB - normalizedA;
}

async function findLatestTrace(repoPath: string, host: HookDoctorHost): Promise<RecentTraceInfo | undefined> {
  const layout = resolveRuntimeLayoutFromRepo(repoPath);
  if (!(await fs.pathExists(layout.sessionsDir))) {
    return undefined;
  }

  const candidates: RecentTraceInfo[] = [];
  const entries = await fs.readdir(layout.sessionsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sessionPath = layout.sessionFile(entry.name);
    const tracePath = layout.sessionTraceFile(entry.name);
    if (!(await fs.pathExists(tracePath))) {
      continue;
    }

    let hostMatches = false;
    let traceAt: string | undefined;
    let traceCount: number | undefined;
    try {
      const session = await fs.readJson(sessionPath) as Record<string, unknown>;
      const metadata = isRecord(session.metadata) ? session.metadata : {};
      hostMatches = metadata.host === host
        || (typeof session.name === 'string' && session.name.startsWith(`hook:${host}:`));
      traceAt = typeof session.lastTraceAt === 'string' ? session.lastTraceAt : undefined;
      traceCount = typeof session.traceCount === 'number' ? session.traceCount : undefined;
    } catch {
      hostMatches = false;
    }

    if (!hostMatches) {
      continue;
    }

    traceAt ??= await readLastTraceAt(tracePath);
    if (!traceAt) {
      continue;
    }

    candidates.push({
      sessionId: entry.name,
      tracePath,
      traceAt,
      ...(traceCount !== undefined ? { traceCount } : {}),
    });
  }

  return candidates.sort(compareTraceRecency)[0];
}

function isRecent(isoTimestamp: string): boolean {
  const timestamp = Date.parse(isoTimestamp);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= RECENT_TRACE_WINDOW_MS;
}

async function buildWorkflowCheck(repoPath: string, contextExists: boolean): Promise<HookDoctorCheck> {
  if (!contextExists) {
    return createCheck({
      id: 'workflow_state',
      label: 'Workflow state',
      status: 'skip',
      message: 'Skipped because .context/ was not found.',
    });
  }

  try {
    const workflowService = await WorkflowService.create(repoPath);
    if (!(await workflowService.hasWorkflow())) {
      return createCheck({
        id: 'workflow_state',
        label: 'Workflow state',
        status: 'warn',
        message: 'No active PREVC workflow was found.',
      });
    }

    if (await workflowService.isComplete()) {
      return createCheck({
        id: 'workflow_state',
        label: 'Workflow state',
        status: 'warn',
        message: 'A PREVC workflow exists but is complete.',
      });
    }

    return createCheck({
      id: 'workflow_state',
      label: 'Workflow state',
      status: 'pass',
      message: 'Active PREVC workflow found.',
    });
  } catch (error) {
    return createCheck({
      id: 'workflow_state',
      label: 'Workflow state',
      status: 'warn',
      message: 'Workflow state could not be read.',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function buildRecentTraceCheck(repoPath: string, contextExists: boolean): Promise<HookDoctorCheck> {
  if (!contextExists) {
    return createCheck({
      id: 'recent_trace',
      label: 'Recent trace',
      status: 'skip',
      message: 'Skipped because .context/ was not found.',
    });
  }

  const latestTrace = await findLatestTrace(repoPath, 'codex');
  if (!latestTrace) {
    return createCheck({
      id: 'recent_trace',
      label: 'Recent trace',
      status: 'warn',
      message: 'No Codex hook trace was found yet. Run /hooks in Codex and trust project hooks, then start a session.',
      details: {
        recentWindowHours: RECENT_TRACE_WINDOW_MS / (60 * 60 * 1000),
      },
    });
  }

  const recent = isRecent(latestTrace.traceAt);
  return createCheck({
    id: 'recent_trace',
    label: 'Recent trace',
    status: recent ? 'pass' : 'warn',
    message: recent
      ? `Latest Codex hook trace was recorded at ${latestTrace.traceAt}.`
      : `Latest Codex hook trace is stale: ${latestTrace.traceAt}.`,
    path: latestTrace.tracePath,
    details: {
      sessionId: latestTrace.sessionId,
      traceAt: latestTrace.traceAt,
      traceCount: latestTrace.traceCount,
      recentWindowHours: RECENT_TRACE_WINDOW_MS / (60 * 60 * 1000),
    },
  });
}

function buildTraceFailureCheck(
  repoPath: string,
  contextExists: boolean,
  failures: HookTraceFailureSummary
): HookDoctorCheck {
  if (!contextExists) {
    return createCheck({
      id: 'trace_failures',
      label: 'Trace failures',
      status: 'skip',
      message: 'Skipped because .context/ was not found.',
    });
  }

  if (failures.readError) {
    return createCheck({
      id: 'trace_failures',
      label: 'Trace failures',
      status: 'warn',
      message: 'Trace failure diagnostics could not be read.',
      path: failures.path,
      details: {
        error: failures.readError,
      },
    });
  }

  if (failures.total === 0) {
    return createCheck({
      id: 'trace_failures',
      label: 'Trace failures',
      status: 'pass',
      message: 'No trace append failures recorded.',
      path: failures.path,
    });
  }

  return createCheck({
    id: 'trace_failures',
    label: 'Trace failures',
    status: 'warn',
    message: `${failures.total} trace append failure(s) recorded.`,
    path: failures.path,
    details: {
      lastFailureAt: failures.lastFailureAt,
      recent: failures.recent,
      relativePath: relativeToRepo(repoPath, failures.path),
    },
  });
}

function buildCodexConfigChecks(
  repoPath: string,
  inspections: CodexConfigInspection[]
): HookDoctorCheck[] {
  const configPaths = {
    json: path.join(repoPath, '.codex', 'hooks.json'),
    toml: path.join(repoPath, '.codex', 'config.toml'),
  };
  const dotcontextCommandCount = inspections.reduce((count, inspection) => (
    count + inspection.dotcontextCommandCount
  ), 0);
  const completeCurrentConfigs = inspections.filter((inspection) => (
    inspection.missingCurrentEvents.length === 0
    && inspection.dotcontextCommandCount > 0
    && !inspection.parseError
  ));
  const tomlInspectionsToCheck = inspections.filter((inspection) => (
    inspection.format === 'toml'
    && (inspection.dotcontextCommandCount > 0 || inspections.length === 1)
  ));

  const checks: HookDoctorCheck[] = [
    createCheck({
      id: 'host_supported',
      label: 'Host supported',
      status: 'pass',
      message: 'Codex hook diagnostics are supported.',
    }),
    createCheck({
      id: 'hook_config_found',
      label: 'Hook config',
      status: inspections.length > 0 ? 'pass' : 'fail',
      message: inspections.length > 0
        ? `Found Codex hook config: ${inspections.map((inspection) => relativeToRepo(repoPath, inspection.path)).join(', ')}.`
        : 'No Codex hook config found. Expected .codex/hooks.json or .codex/config.toml.',
      details: {
        expected: [
          relativeToRepo(repoPath, configPaths.json),
          relativeToRepo(repoPath, configPaths.toml),
        ],
        found: inspections.map((inspection) => ({
          format: inspection.format,
          path: inspection.path,
          parseError: inspection.parseError,
        })),
      },
    }),
  ];

  if (tomlInspectionsToCheck.length === 0) {
    checks.push(createCheck({
      id: 'codex_toml_hooks_feature',
      label: 'Codex TOML hooks feature',
      status: 'skip',
      message: 'Skipped because active dotcontext hooks were not found in .codex/config.toml.',
    }));
  } else {
    const disabledToml = tomlInspectionsToCheck.filter((inspection) => !inspection.featuresHooksEnabled);
    checks.push(createCheck({
      id: 'codex_toml_hooks_feature',
      label: 'Codex TOML hooks feature',
      status: disabledToml.length === 0 ? 'pass' : 'fail',
      message: disabledToml.length === 0
        ? '[features].hooks = true is enabled for TOML Codex hooks.'
        : '[features].hooks = true is missing in .codex/config.toml.',
      path: tomlInspectionsToCheck[0].path,
      details: {
        inspected: tomlInspectionsToCheck.map((inspection) => ({
          path: inspection.path,
          featuresHooksEnabled: inspection.featuresHooksEnabled,
          parseError: inspection.parseError,
        })),
      },
    }));
  }

  checks.push(createCheck({
    id: 'dotcontext_command_present',
    label: 'dotcontext command',
    status: inspections.length === 0 ? 'skip' : dotcontextCommandCount > 0 ? 'pass' : 'fail',
    message: inspections.length === 0
      ? 'Skipped because no Codex hook config was found.'
      : dotcontextCommandCount > 0
        ? `Found ${dotcontextCommandCount} dotcontext hook command(s).`
        : 'Codex config exists, but no dotcontext hook dispatch command was found.',
    details: {
      dotcontextCommandCount,
    },
  }));

  checks.push(createCheck({
    id: 'dispatch_command_current',
    label: 'Current dispatch command',
    status: dotcontextCommandCount === 0
      ? 'skip'
      : completeCurrentConfigs.length > 0 ? 'pass' : 'fail',
    message: dotcontextCommandCount === 0
      ? 'Skipped because no dotcontext hook command was found.'
      : completeCurrentConfigs.length > 0
        ? 'Current dotcontext dispatch command is configured for SessionStart, PostToolUse, and Stop.'
        : 'dotcontext hooks are present, but one or more events do not use the current dispatch command.',
    details: {
      requiredEvents: CODEX_EVENT_NAMES,
      configs: inspections.map((inspection) => ({
        format: inspection.format,
        path: inspection.path,
        currentEvents: inspection.currentEvents,
        missingCurrentEvents: inspection.missingCurrentEvents,
        parseError: inspection.parseError,
      })),
    },
  }));

  return checks;
}

async function buildCodexReport(root: HookRepoRootResolution): Promise<HookDoctorHostReport> {
  const repoPath = root.repoPath;
  const contextPath = path.join(repoPath, '.context');
  const contextExists = await fs.pathExists(contextPath);
  const inspections = await inspectExistingCodexConfigs(repoPath);
  const failures = await readHookTraceFailures(repoPath);

  const checks: HookDoctorCheck[] = [
    ...buildCodexConfigChecks(repoPath, inspections),
    createCheck({
      id: 'context_initialized',
      label: '.context initialized',
      status: contextExists ? 'pass' : 'fail',
      message: contextExists
        ? '.context/ was found for the resolved repository root.'
        : '.context/ was not found for the resolved repository root.',
      path: contextPath,
      details: {
        rootResolution: root,
      },
    }),
    await buildWorkflowCheck(repoPath, contextExists),
    await buildRecentTraceCheck(repoPath, contextExists),
    buildTraceFailureCheck(repoPath, contextExists, failures),
  ];

  const summary = summarizeChecks(checks);
  return {
    host: 'codex',
    hostDisplayName: 'Codex CLI',
    repoPath,
    root,
    checks,
    summary,
    recommendations: [
      CODEX_HOOK_TRUST_REMINDER,
      'If recent trace is missing, run /hooks in Codex and trust project hooks for this repo.',
    ],
  };
}

function buildUnsupportedReport(host: string, root: HookRepoRootResolution): HookDoctorHostReport {
  const known = KNOWN_HOOK_HOSTS.has(host);
  const checks = [
    createCheck({
      id: 'host_supported',
      label: 'Host supported',
      status: known ? 'pass' : 'fail',
      message: known
        ? `${host} is a known hook host.`
        : `Unsupported hook host: ${host}.`,
      details: {
        supportedHosts: ['codex'],
        knownHosts: [...KNOWN_HOOK_HOSTS],
      },
    }),
    createCheck({
      id: 'doctor_available',
      label: 'Doctor available',
      status: 'fail',
      message: 'hook doctor currently implements Codex diagnostics.',
    }),
  ];

  return {
    host,
    hostDisplayName: host,
    repoPath: root.repoPath,
    root,
    checks,
    summary: summarizeChecks(checks),
    recommendations: ['Run hook doctor codex for Codex hook diagnostics.'],
  };
}

function resolveDoctorHosts(host?: string): string[] {
  if (!host || host === 'all') {
    return ['codex'];
  }

  return [host];
}

function formatStatus(status: HookDoctorCheckStatus): string {
  return status.toUpperCase().padEnd(4, ' ');
}

export function formatHookDoctorResult(result: HookDoctorResult): string {
  const lines: string[] = [
    'dotcontext hook doctor',
    `Repo: ${result.repoPath}`,
    `Root source: ${result.root.source}${result.root.startPath ? ` from ${result.root.startPath}` : ''}`,
    '',
  ];

  for (const report of result.reports) {
    lines.push(`${report.hostDisplayName} (${report.host})`);
    for (const check of report.checks) {
      const pathDetail = check.path ? ` (${relativeToRepo(report.repoPath, check.path)})` : '';
      lines.push(`  [${formatStatus(check.status)}] ${check.label}: ${check.message}${pathDetail}`);
    }

    if (report.recommendations.length > 0) {
      lines.push('  Next steps:');
      for (const recommendation of report.recommendations) {
        lines.push(`    - ${recommendation}`);
      }
    }
    lines.push('');
  }

  lines.push(
    `Summary: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail, ${result.summary.skip} skip`
  );

  return lines.join('\n');
}

export class HookDoctorService {
  constructor(private readonly deps?: HookDoctorServiceDependencies) {}

  async run(options: HookDoctorOptions = {}): Promise<HookDoctorResult> {
    const root = await resolveHookRepoRoot({
      repoPath: options.repoPath,
      cwd: options.cwd ?? process.cwd(),
    });
    const reports: HookDoctorHostReport[] = [];

    for (const host of resolveDoctorHosts(options.host)) {
      if (host === 'codex') {
        reports.push(await buildCodexReport(root));
      } else {
        reports.push(buildUnsupportedReport(host, root));
      }
    }

    const summary = summarizeReports(reports);
    return {
      generatedAt: new Date().toISOString(),
      ...(options.host ? { requestedHost: options.host } : {}),
      repoPath: root.repoPath,
      root,
      reports,
      summary,
      exitCode: summary.fail > 0 ? 1 : 0,
    };
  }

  formatHuman(result: HookDoctorResult): string {
    void this.deps;
    return formatHookDoctorResult(result);
  }
}
