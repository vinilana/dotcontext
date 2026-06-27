import * as fs from 'fs-extra';
import * as path from 'path';

import { resolveRuntimeLayout } from '../../../shared/fs/pathHelpers';
import { consumeWorkflowMissingReminder } from './hookRuntimeState';

export type HookContextReadiness = 'missing' | 'partial' | 'ready';
export type HookWorkflowReadiness = 'none' | 'active' | 'complete' | 'invalid';

export interface HookWorkflowPreflightSummary {
  name?: string;
  phase?: string;
  nextGate?: string;
  planLinked: boolean;
  taskContractActive: boolean;
  requiredSensors: string[];
  requiredArtifacts: string[];
}

export interface HookReadinessSummary {
  context: HookContextReadiness;
  workflow: HookWorkflowReadiness;
  missing: string[];
  nextAction?: string;
  preflight?: HookWorkflowPreflightSummary;
  reminders?: {
    workflowMissing?: boolean;
  };
}

export interface GetHookReadinessSummaryOptions {
  repoPath: string;
  scaffoldStatus?: unknown;
  now?: Date;
}

interface WorkflowRecord {
  status?: unknown;
  binding?: {
    activeTaskId?: string;
  } | null;
}

interface WorkflowStatusLike {
  project?: {
    name?: string;
    current_phase?: string;
    plan?: string;
    plans?: Array<{ slug?: string; status?: string }>;
    settings?: {
      require_plan?: boolean;
      require_approval?: boolean;
    };
  };
  phases?: Record<string, { status?: string }>;
  approval?: {
    plan_created?: boolean;
    plan_approved?: boolean;
  };
}

interface TaskContractLike {
  requiredSensors?: unknown;
  requiredArtifacts?: unknown;
}

const CORE_READY_AREAS = ['docs', 'agents', 'skills', 'harness'] as const;
const SETUP_AREAS = ['docs', 'agents', 'skills', 'workflow', 'plans', 'harness'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return Boolean(record[key]);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function describeArtifact(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return 'artifact';
  }
  if (typeof value.name === 'string') {
    return value.name;
  }
  if (typeof value.path === 'string') {
    return value.path;
  }
  if (typeof value.glob === 'string') {
    return `glob(${value.glob})`;
  }
  return 'artifact';
}

async function hasContent(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function hasSkillContent(skillsDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      const stat = await fs.stat(skillDir).catch(() => null);
      if (!stat?.isDirectory()) {
        continue;
      }
      if (await fs.pathExists(path.join(skillDir, 'SKILL.md'))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function hasHarnessRuntimeContent(runtimeDir: string): Promise<boolean> {
  for (const entry of ['sessions', 'workflows', 'contracts', 'evaluations']) {
    if (await hasContent(path.join(runtimeDir, entry))) {
      return true;
    }
  }

  return false;
}

async function readScaffoldStatus(repoPath: string): Promise<Record<string, unknown>> {
  const contextPath = path.join(repoPath, '.context');
  const layout = resolveRuntimeLayout(contextPath);
  const initialized = await fs.pathExists(contextPath);

  if (!initialized) {
    return {
      initialized: false,
      docs: false,
      agents: false,
      skills: false,
      workflow: false,
      plans: false,
      harness: false,
    };
  }

  return {
    initialized,
    docs: await hasContent(path.join(contextPath, 'docs')),
    agents: await hasContent(path.join(contextPath, 'agents')),
    skills: await hasSkillContent(path.join(contextPath, 'skills')),
    workflow: await hasContent(layout.workflowsDir),
    plans: await hasContent(path.join(contextPath, 'plans')),
    harness: await hasHarnessRuntimeContent(layout.runtimeDir),
  };
}

function resolveContextReadiness(scaffold: Record<string, unknown>): {
  context: HookContextReadiness;
  missing: string[];
} {
  if (!readBoolean(scaffold, 'initialized')) {
    return { context: 'missing', missing: ['.context'] };
  }

  const missing = SETUP_AREAS.filter((area) => !readBoolean(scaffold, area));
  const ready = CORE_READY_AREAS.every((area) => readBoolean(scaffold, area));

  return {
    context: ready ? 'ready' : 'partial',
    missing: missing.slice(0, 3),
  };
}

function isWorkflowComplete(status: WorkflowStatusLike): boolean {
  const phases = status.phases;
  if (!isRecord(phases)) {
    return false;
  }

  return ['P', 'R', 'E', 'V', 'C'].every((phase) => {
    const phaseStatus = phases[phase];
    return phaseStatus?.status === 'completed' || phaseStatus?.status === 'skipped';
  });
}

function hasLinkedPlan(status: WorkflowStatusLike): boolean {
  if (typeof status.project?.plan === 'string' && status.project.plan.length > 0) {
    return true;
  }

  return Array.isArray(status.project?.plans)
    && status.project.plans.some((plan) => plan.status === 'active' || plan.status === 'completed');
}

function resolveNextGate(status: WorkflowStatusLike, taskContractActive: boolean): string {
  const phase = status.project?.current_phase;
  const settings = status.project?.settings;
  const approval = status.approval;

  if (phase === 'P' && settings?.require_plan && !approval?.plan_created) {
    return 'linked plan before leaving P';
  }

  if (phase === 'R' && settings?.require_approval && !approval?.plan_approved) {
    return 'plan approval before leaving R';
  }

  if (phase === 'E' || phase === 'V') {
    return taskContractActive
      ? 'execution evidence before advancing'
      : 'active task contract before evidence gates';
  }

  return 'next PREVC phase gate';
}

async function readActiveTaskContract(
  repoPath: string,
  activeTaskId?: string
): Promise<TaskContractLike | null> {
  if (!activeTaskId) {
    return null;
  }

  const layout = resolveRuntimeLayout(path.join(repoPath, '.context'));
  const taskPath = path.join(layout.contractTasksDir, `${activeTaskId}.json`);

  try {
    const task = await fs.readJson(taskPath) as TaskContractLike;
    return isRecord(task) ? task : null;
  } catch {
    return null;
  }
}

async function resolveWorkflowReadiness(repoPath: string): Promise<{
  workflow: HookWorkflowReadiness;
  preflight?: HookWorkflowPreflightSummary;
}> {
  const layout = resolveRuntimeLayout(path.join(repoPath, '.context'));

  if (!(await fs.pathExists(layout.prevcFile))) {
    return { workflow: 'none' };
  }

  let record: WorkflowRecord;
  try {
    record = await fs.readJson(layout.prevcFile) as WorkflowRecord;
  } catch {
    return { workflow: 'invalid' };
  }

  const status = (isRecord(record.status) ? record.status : record) as WorkflowStatusLike;
  if (!isRecord(status.project) || typeof status.project.current_phase !== 'string') {
    return { workflow: 'invalid' };
  }

  const activeTask = await readActiveTaskContract(repoPath, record.binding?.activeTaskId);
  const requiredSensors = readStringArray(activeTask?.requiredSensors);
  const requiredArtifacts = Array.isArray(activeTask?.requiredArtifacts)
    ? activeTask.requiredArtifacts.map(describeArtifact)
    : [];
  const taskContractActive = Boolean(activeTask);

  return {
    workflow: isWorkflowComplete(status) ? 'complete' : 'active',
    preflight: {
      name: status.project.name,
      phase: status.project.current_phase,
      nextGate: resolveNextGate(status, taskContractActive),
      planLinked: hasLinkedPlan(status),
      taskContractActive,
      requiredSensors,
      requiredArtifacts,
    },
  };
}

export async function buildHookReadinessSummary(
  repoPath: string,
  scaffoldStatus?: unknown
): Promise<HookReadinessSummary> {
  const scaffold = isRecord(scaffoldStatus)
    ? scaffoldStatus
    : await readScaffoldStatus(repoPath);
  const context = resolveContextReadiness(scaffold);

  if (context.context === 'missing') {
    return {
      context: 'missing',
      workflow: 'none',
      missing: context.missing,
      nextAction: 'Configure MCP and ask the agent to run context init in this project.',
    };
  }

  const workflow = await resolveWorkflowReadiness(repoPath);
  const nextAction = context.context === 'partial'
    ? 'Use MCP to start workflow-init or create/link a plan.'
    : workflow.workflow === 'none'
      ? 'Start a PREVC workflow with workflow-init for planned work.'
      : undefined;

  return {
    context: context.context,
    workflow: workflow.workflow,
    missing: context.missing,
    nextAction,
    preflight: workflow.workflow === 'active' ? workflow.preflight : undefined,
  };
}

export async function getHookReadinessSummary(
  options: GetHookReadinessSummaryOptions
): Promise<HookReadinessSummary> {
  const summary = await buildHookReadinessSummary(options.repoPath, options.scaffoldStatus);

  if (summary.context === 'ready' && summary.workflow === 'none') {
    return {
      ...summary,
      reminders: {
        ...summary.reminders,
        workflowMissing: await consumeWorkflowMissingReminder({
          repoPath: options.repoPath,
          now: options.now,
        }),
      },
    };
  }

  return summary;
}

export function extractHookReadinessSummary(value: unknown): HookReadinessSummary | undefined {
  if (!isRecord(value) || !isRecord(value.hookReadiness)) {
    return undefined;
  }

  const candidate = value.hookReadiness;
  if (
    candidate.context !== 'missing' &&
    candidate.context !== 'partial' &&
    candidate.context !== 'ready'
  ) {
    return undefined;
  }

  if (
    candidate.workflow !== 'none' &&
    candidate.workflow !== 'active' &&
    candidate.workflow !== 'complete' &&
    candidate.workflow !== 'invalid'
  ) {
    return undefined;
  }

  return {
    context: candidate.context,
    workflow: candidate.workflow,
    missing: Array.isArray(candidate.missing)
      ? candidate.missing.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : [],
    nextAction: typeof candidate.nextAction === 'string' ? candidate.nextAction : undefined,
    preflight: isRecord(candidate.preflight)
      ? {
          name: typeof candidate.preflight.name === 'string' ? candidate.preflight.name : undefined,
          phase: typeof candidate.preflight.phase === 'string' ? candidate.preflight.phase : undefined,
          nextGate: typeof candidate.preflight.nextGate === 'string' ? candidate.preflight.nextGate : undefined,
          planLinked: candidate.preflight.planLinked === true,
          taskContractActive: candidate.preflight.taskContractActive === true,
          requiredSensors: readStringArray(candidate.preflight.requiredSensors),
          requiredArtifacts: readStringArray(candidate.preflight.requiredArtifacts),
        }
      : undefined,
    reminders: isRecord(candidate.reminders)
      ? {
          workflowMissing: candidate.reminders.workflowMissing === true,
        }
      : undefined,
  };
}

export function formatHookReadinessAdditionalContext(
  summary: HookReadinessSummary,
  options: {
    source?: string;
    workflowMissingReminder?: boolean;
  } = {}
): string {
  const lines: string[] = [];

  if (summary.context === 'missing') {
    lines.push('dotcontext: this repository does not have .context/ yet.');
    if (options.source) {
      lines.push(`Host: ${options.source}.`);
    }
    lines.push('Next step: configure MCP and ask the agent to run context init in this project.');
    return lines.join('\n');
  }

  if (summary.context === 'partial') {
    const missing = summary.missing.length > 0 ? summary.missing.join(', ') : 'setup';
    lines.push(`dotcontext: .context/ exists, but setup is still missing: ${missing}.`);
    lines.push(`Next step: ${summary.nextAction ?? 'complete context setup with MCP.'}`);
    return lines.join('\n');
  }

  lines.push('dotcontext: scaffold ready. Use MCP context tools for navigation and workflow.');

  if (summary.workflow === 'active' && summary.preflight) {
    const preflight = summary.preflight;
    lines.push(`dotcontext workflow: phase ${preflight.phase ?? 'unknown'} is in progress.`);
    lines.push(`Likely gate: ${preflight.nextGate ?? 'next PREVC phase gate'}.`);

    const risks: string[] = [];
    if (!preflight.planLinked) {
      risks.push('missing plan');
    }
    if (!preflight.taskContractActive) {
      risks.push('missing task contract');
    }
    if (preflight.requiredSensors.length > 0) {
      risks.push(`sensors: ${preflight.requiredSensors.slice(0, 3).join(', ')}`);
    }
    if (preflight.requiredArtifacts.length > 0) {
      risks.push(`artifacts: ${preflight.requiredArtifacts.slice(0, 3).join(', ')}`);
    }
    if (risks.length > 0) {
      lines.push(`Preflight: ${risks.slice(0, 3).join('; ')}.`);
    }
  } else if (
    summary.workflow === 'none' &&
    (options.workflowMissingReminder ?? summary.reminders?.workflowMissing) === true
  ) {
    lines.push('dotcontext: context is loaded, but no PREVC workflow is active.');
    lines.push('For gated work and evidence, start a workflow with workflow-init through MCP.');
  }

  return lines.join('\n');
}
