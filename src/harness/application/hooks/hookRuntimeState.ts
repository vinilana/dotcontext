import * as fs from 'fs-extra';
import * as path from 'path';

export interface HookReminderPolicy {
  lastShownAt?: string;
  cooldownHours: number;
}

export interface HookRemindersState {
  workflowMissingReminder?: HookReminderPolicy;
}

export interface HookTraceFailuresState {
  version: 1;
  total: number;
  lastFailureAt?: string;
  recent: HookTraceFailureRecord[];
}

export interface HookTraceFailureRecord {
  occurredAt: string;
  source: string;
  reason: string;
  message?: string;
  hostSessionId?: string;
  harnessSessionId?: string;
}

export interface HookTraceFailureRecordResult {
  recorded: boolean;
  count: number;
  recentCount: number;
  shouldWarn: boolean;
  statePath?: string;
}

export interface HookTraceFailureSummary {
  path: string;
  exists: boolean;
  total: number;
  lastFailureAt?: string;
  recent: HookTraceFailureRecord[];
  readError?: string;
}

interface RuntimeHookStateOptions {
  repoPath: string;
  now?: Date;
}

export interface ConsumeWorkflowMissingReminderOptions extends RuntimeHookStateOptions {
  cooldownHours?: number;
}

export interface RecordTraceFailureOptions extends RuntimeHookStateOptions {
  error?: unknown;
  message?: string;
  source?: string;
  reason?: string;
  hostSessionId?: string;
  harnessSessionId?: string;
  windowMinutes?: number;
  warningThreshold?: number;
  maxRecentFailures?: number;
}

function resolveContextPath(repoPath: string): string {
  return path.join(path.resolve(repoPath), '.context');
}

function resolveHooksRuntimeDir(repoPath: string): string {
  return path.join(resolveContextPath(repoPath), 'runtime', 'hooks');
}

function resolveRemindersPath(repoPath: string): string {
  return path.join(resolveHooksRuntimeDir(repoPath), 'reminders.json');
}

function resolveTraceFailuresPath(repoPath: string): string {
  return path.join(resolveHooksRuntimeDir(repoPath), 'trace-failures.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  try {
    const value = await fs.readJson(filePath);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

async function hasContext(repoPath: string): Promise<boolean> {
  return fs.pathExists(resolveContextPath(repoPath));
}

async function isWorkflowMissingReminderDisabled(repoPath: string): Promise<boolean> {
  const hooksConfigPath = path.join(resolveContextPath(repoPath), 'config', 'hooks.json');
  const config = await readJsonRecord(hooksConfigPath);
  const workflowMissingReminder = config.workflowMissingReminder;
  if (isRecord(workflowMissingReminder) && workflowMissingReminder.enabled === false) {
    return true;
  }

  const reminders = config.reminders;
  if (isRecord(reminders) && reminders.workflowMissing === false) {
    return true;
  }

  return config.workflowMissingReminder === false;
}

export async function consumeWorkflowMissingReminder(
  options: ConsumeWorkflowMissingReminderOptions
): Promise<boolean> {
  if (!(await hasContext(options.repoPath))) {
    return false;
  }

  if (await isWorkflowMissingReminderDisabled(options.repoPath)) {
    return false;
  }

  const cooldownHours = Math.max(1, Math.floor(options.cooldownHours ?? 24));
  const now = options.now ?? new Date();
  const statePath = resolveRemindersPath(options.repoPath);
  const state = await readJsonRecord(statePath) as HookRemindersState;
  const reminder = state.workflowMissingReminder;
  const lastShownAt = parseDate(reminder?.lastShownAt);

  if (lastShownAt && now.getTime() - lastShownAt.getTime() < cooldownHours * 60 * 60 * 1000) {
    return false;
  }

  const nextState: HookRemindersState = {
    ...state,
    workflowMissingReminder: {
      lastShownAt: now.toISOString(),
      cooldownHours,
    },
  };

  await fs.ensureDir(path.dirname(statePath));
  await fs.writeJson(statePath, nextState, { spaces: 2 });
  return true;
}

function errorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }

  return error instanceof Error ? error.message : String(error);
}

function normalizeTraceFailureRecord(value: unknown): HookTraceFailureRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.occurredAt !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.reason !== 'string'
  ) {
    return undefined;
  }

  return {
    occurredAt: value.occurredAt,
    source: value.source,
    reason: value.reason,
    message: typeof value.message === 'string' ? value.message : undefined,
    hostSessionId: typeof value.hostSessionId === 'string' ? value.hostSessionId : undefined,
    harnessSessionId: typeof value.harnessSessionId === 'string' ? value.harnessSessionId : undefined,
  };
}

function normalizeTraceFailuresState(value: Record<string, unknown>): HookTraceFailuresState {
  const recent = Array.isArray(value.recent)
    ? value.recent.map(normalizeTraceFailureRecord).filter((record): record is HookTraceFailureRecord => Boolean(record))
    : [];

  return {
    version: 1,
    total: typeof value.total === 'number' && Number.isFinite(value.total)
      ? Math.max(0, Math.floor(value.total))
      : recent.length,
    lastFailureAt: typeof value.lastFailureAt === 'string' ? value.lastFailureAt : undefined,
    recent,
  };
}

export async function recordHookTraceFailure(
  options: RecordTraceFailureOptions
): Promise<HookTraceFailureRecordResult> {
  if (!(await hasContext(options.repoPath))) {
    return {
      recorded: false,
      count: 0,
      recentCount: 0,
      shouldWarn: false,
    };
  }

  const now = options.now ?? new Date();
  const nowIso = toIso(now);
  const windowMinutes = Math.max(1, Math.floor(options.windowMinutes ?? 10));
  const warningThreshold = Math.max(1, Math.floor(options.warningThreshold ?? 3));
  const maxRecentFailures = Math.max(1, Math.floor(options.maxRecentFailures ?? 20));
  const statePath = resolveTraceFailuresPath(options.repoPath);
  const rawState = await readJsonRecord(statePath);
  const state = normalizeTraceFailuresState(rawState);
  const windowStart = now.getTime() - windowMinutes * 60 * 1000;
  const message = options.message ?? errorMessage(options.error);
  const recent = state.recent
    .filter((record) => {
      const date = parseDate(record.occurredAt);
      return date ? date.getTime() >= windowStart : false;
    })
    .concat({
      occurredAt: nowIso,
      source: options.source ?? 'harness',
      reason: options.reason ?? 'append_trace_failed',
      ...(message ? { message } : {}),
      ...(options.hostSessionId ? { hostSessionId: options.hostSessionId } : {}),
      ...(options.harnessSessionId ? { harnessSessionId: options.harnessSessionId } : {}),
    })
    .slice(-maxRecentFailures);

  const nextState: HookTraceFailuresState = {
    version: 1,
    total: state.total + 1,
    lastFailureAt: nowIso,
    recent,
  };

  await fs.ensureDir(path.dirname(statePath));
  await fs.writeJson(statePath, nextState, { spaces: 2 });

  return {
    recorded: true,
    count: nextState.total,
    recentCount: recent.length,
    shouldWarn: recent.length >= warningThreshold,
    statePath,
  };
}

export async function readHookTraceFailures(repoPath: string): Promise<HookTraceFailureSummary> {
  const failurePath = resolveTraceFailuresPath(repoPath);
  if (!(await fs.pathExists(failurePath))) {
    return {
      path: failurePath,
      exists: false,
      total: 0,
      recent: [],
    };
  }

  try {
    const value = await fs.readJson(failurePath);
    const state = normalizeTraceFailuresState(isRecord(value) ? value : {});
    return {
      path: failurePath,
      exists: true,
      total: state.total,
      lastFailureAt: state.lastFailureAt,
      recent: state.recent,
    };
  } catch (error) {
    return {
      path: failurePath,
      exists: true,
      total: 0,
      recent: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}
