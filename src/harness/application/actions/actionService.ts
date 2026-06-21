import {
  HarnessExecutionService,
  type HarnessExecutionServiceOptions,
} from '../execution/executionService';
import type {
  HarnessPolicyEffect,
  HarnessPolicyRisk,
  HarnessPolicyTarget,
} from '../policies/policyService';
import type { RequiredArtifactInput } from '../contracts/taskContractsService';

export type HarnessAction =
  | 'createSession'
  | 'listSessions'
  | 'getSession'
  | 'appendTrace'
  | 'listTraces'
  | 'addArtifact'
  | 'listArtifacts'
  | 'checkpoint'
  | 'resumeSession'
  | 'completeSession'
  | 'failSession'
  | 'recordSensor'
  | 'getSessionQuality'
  | 'createTask'
  | 'listTasks'
  | 'evaluateTask'
  | 'createHandoff'
  | 'listHandoffs'
  | 'replaySession'
  | 'listReplays'
  | 'getReplay'
  | 'buildDataset'
  | 'listDatasets'
  | 'getDataset'
  | 'getFailureClusters'
  | 'registerPolicy'
  | 'listPolicies'
  | 'evaluatePolicy'
  | 'getPolicy'
  | 'setPolicy'
  | 'resetPolicy';

export interface HarnessActionInput {
  action: HarnessAction;
  sessionId?: string;
  taskId?: string;
  name?: string;
  title?: string;
  description?: string;
  owner?: string;
  status?: 'draft' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
  level?: 'debug' | 'info' | 'warn' | 'error';
  event?: string;
  message?: string;
  data?: Record<string, unknown>;
  kind?: 'text' | 'json' | 'file';
  content?: unknown;
  path?: string;
  note?: string;
  artifactIds?: string[];
  pause?: boolean;
  sensorId?: string;
  sensorName?: string;
  sensorSeverity?: 'info' | 'warning' | 'critical';
  sensorBlocking?: boolean;
  sensorStatus?: 'passed' | 'failed' | 'skipped' | 'blocked';
  summary?: string;
  evidence?: string[];
  output?: unknown;
  details?: Record<string, unknown>;
  blockOnWarnings?: boolean;
  requireEvidence?: boolean;
  inputs?: string[];
  expectedOutputs?: string[];
  acceptanceCriteria?: string[];
  requiredSensors?: string[];
  requiredArtifacts?: Array<string | Record<string, unknown>>;
  from?: string;
  to?: string;
  artifacts?: string[];
  replayId?: string;
  includePayloads?: boolean;
  maxEvents?: number;
  datasetId?: string;
  sessionIds?: string[];
  includeSuccessfulSessions?: boolean;
  scope?: 'sensor' | 'artifact' | 'handoff' | 'workflow' | 'task' | 'risk';
  effect?: 'allow' | 'deny' | 'require_approval';
  target?: 'tool' | 'action' | 'path' | 'risk';
  pattern?: string;
  pathPattern?: string;
  approvalRole?: string;
  approvedBy?: string;
  approvalNote?: string;
  risk?: HarnessPolicyRisk;
  policy?: {
    defaultEffect?: 'allow' | 'deny';
    rules?: Array<{
      id?: string;
      effect: 'allow' | 'deny' | 'require_approval';
      target?: 'tool' | 'action' | 'path' | 'risk';
      pattern?: string;
      pathPattern?: string;
      approvalRole?: string;
      reason?: string;
      description?: string;
      scope?: 'sensor' | 'artifact' | 'handoff' | 'workflow' | 'task' | 'risk';
    }>;
  };
}

export type HarnessActionResult = { success: true } & Record<string, unknown>;

export interface HarnessActionServiceOptions extends HarnessExecutionServiceOptions {
  executionService?: HarnessExecutionService;
}

function normalizePolicyEffect(effect?: string): HarnessPolicyEffect {
  if (effect === 'allow' || effect === 'deny' || effect === 'require_approval') {
    return effect;
  }

  if (effect === 'warn' || effect === 'review') {
    return 'require_approval';
  }

  return 'allow';
}

function normalizePolicyTarget(
  target?: string,
  pathPattern?: string,
  risk?: string
): HarnessPolicyTarget {
  if (target === 'tool' || target === 'action' || target === 'path' || target === 'risk') {
    return target;
  }

  if (pathPattern) {
    return 'path';
  }

  if (risk) {
    return 'risk';
  }

  return 'action';
}

function inferPolicyAction(params: HarnessActionInput): string {
  switch (params.scope) {
    case 'artifact':
      return 'addArtifact';
    case 'sensor':
      return 'runSensor';
    case 'handoff':
      return 'createHandoff';
    case 'task':
      return 'createTask';
    case 'workflow':
    default:
      return 'workflow';
  }
}

function isHarnessPolicyRisk(value: string | undefined): value is HarnessPolicyRisk {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

/**
 * Transport-neutral harness action port.
 *
 * Adapters such as MCP, CLI hooks, editor extensions, or future HTTP handlers
 * should call this service and adapt only their protocol-specific envelope.
 */
export class HarnessActionService {
  private readonly executionService: HarnessExecutionService;

  constructor(options: HarnessActionServiceOptions) {
    this.executionService = options.executionService
      ?? new HarnessExecutionService({ repoPath: options.repoPath });
  }

  async execute(params: HarnessActionInput): Promise<HarnessActionResult> {
    switch (params.action) {
      case 'createSession':
        return {
          success: true,
          session: await this.executionService.createSession({
            name: params.name!,
            metadata: params.metadata,
          }),
        };
      case 'listSessions':
        return {
          success: true,
          sessions: await this.executionService.listSessions(),
        };
      case 'getSession':
        return {
          success: true,
          session: await this.executionService.getSession(params.sessionId!),
        };
      case 'appendTrace':
        return {
          success: true,
          trace: await this.executionService.appendTrace(params.sessionId!, {
            level: params.level!,
            event: params.event!,
            message: params.message!,
            data: params.data,
          }),
        };
      case 'listTraces':
        return {
          success: true,
          traces: await this.executionService.listTraces(params.sessionId!),
        };
      case 'addArtifact':
        return {
          success: true,
          artifact: await this.executionService.addArtifact(params.sessionId!, {
            name: params.name!,
            kind: params.kind,
            content: params.content,
            path: params.path,
            metadata: params.metadata,
          }),
        };
      case 'listArtifacts':
        return {
          success: true,
          artifacts: await this.executionService.listArtifacts(params.sessionId!),
        };
      case 'checkpoint':
        return {
          success: true,
          session: await this.executionService.checkpointSession(params.sessionId!, {
            note: params.note,
            data: params.data,
            artifactIds: params.artifactIds,
            pause: params.pause,
          }),
        };
      case 'resumeSession':
        return {
          success: true,
          session: await this.executionService.resumeSession(params.sessionId!),
        };
      case 'completeSession':
        return {
          success: true,
          session: await this.executionService.completeSession(params.sessionId!, params.note),
        };
      case 'failSession':
        return {
          success: true,
          session: await this.executionService.failSession(params.sessionId!, params.message!),
        };
      case 'recordSensor':
        return {
          success: true,
          sensorRun: await this.executionService.runSensor({
            id: params.sensorId!,
            name: params.sensorName || params.sensorId!,
            description: params.description,
            severity: params.sensorSeverity,
            blocking: params.sensorBlocking,
            execute: async () => ({
              status: params.sensorStatus!,
              summary: params.summary!,
              evidence: params.evidence,
              output: params.output,
              details: params.details,
            }),
          }, {
            sessionId: params.sessionId!,
            contractId: params.taskId,
            context: params.data,
            metadata: params.metadata,
          }),
        };
      case 'getSessionQuality':
        return {
          success: true,
          quality: await this.executionService.getSessionQuality(params.sessionId!, {
            taskId: params.taskId,
            policy: {
              blockOnWarnings: params.blockOnWarnings,
              requireEvidence: params.requireEvidence,
            },
          }),
        };
      case 'createTask':
        return {
          success: true,
          task: await this.executionService.createTaskContract({
            title: params.title!,
            description: params.description,
            sessionId: params.sessionId,
            owner: params.owner,
            inputs: params.inputs,
            expectedOutputs: params.expectedOutputs,
            acceptanceCriteria: params.acceptanceCriteria,
            requiredSensors: params.requiredSensors,
            requiredArtifacts: params.requiredArtifacts as RequiredArtifactInput[] | undefined,
            status: params.status,
            metadata: params.metadata,
          }),
        };
      case 'listTasks':
        return {
          success: true,
          tasks: await this.executionService.listTaskContracts(),
        };
      case 'evaluateTask':
        return {
          success: true,
          evaluation: await this.executionService.evaluateTaskCompletion(
            params.taskId!,
            params.sessionId
          ),
        };
      case 'createHandoff':
        return {
          success: true,
          handoff: await this.executionService.createHandoffContract({
            from: params.from!,
            to: params.to!,
            sessionId: params.sessionId,
            taskId: params.taskId,
            artifacts: params.artifacts,
            evidence: params.evidence,
            metadata: params.metadata,
          }),
        };
      case 'listHandoffs':
        return {
          success: true,
          handoffs: await this.executionService.listHandoffContracts(),
        };
      case 'replaySession':
        return {
          success: true,
          replay: await this.executionService.replaySession(params.sessionId!, {
            includePayloads: params.includePayloads,
            maxEvents: params.maxEvents,
          }),
        };
      case 'listReplays':
        return {
          success: true,
          replays: await this.executionService.listReplays(params.sessionId),
        };
      case 'getReplay':
        return {
          success: true,
          replay: await this.executionService.getReplay(params.replayId!),
        };
      case 'buildDataset':
        return {
          success: true,
          dataset: await this.executionService.buildFailureDataset({
            sessionIds: params.sessionIds,
            includeSuccessfulSessions: params.includeSuccessfulSessions,
          }),
        };
      case 'listDatasets':
        return {
          success: true,
          datasets: await this.executionService.listDatasets(),
        };
      case 'getDataset':
        return {
          success: true,
          dataset: await this.executionService.getDataset(params.datasetId!),
        };
      case 'getFailureClusters':
        return {
          success: true,
          clusters: await this.executionService.getFailureClusters(params.datasetId!),
        };
      case 'registerPolicy':
        if (!params.effect) {
          throw new Error('registerPolicy requires effect');
        }

        return {
          success: true,
          rule: await this.executionService.registerPolicy({
            id: params.name || `policy-${Date.now()}`,
            effect: normalizePolicyEffect(params.effect),
            target: normalizePolicyTarget(params.target, params.pathPattern, params.risk),
            pattern: params.pattern || params.pathPattern || params.risk || inferPolicyAction(params),
            approvalRole: params.owner,
            reason: params.description,
          }),
        };
      case 'listPolicies':
        return {
          success: true,
          rules: await this.executionService.listPolicies(),
        };
      case 'getPolicy':
        return {
          success: true,
          policy: await this.executionService.getPolicy(),
        };
      case 'setPolicy':
        if (!params.policy) {
          throw new Error('setPolicy requires policy');
        }

        return {
          success: true,
          policy: await this.executionService.setPolicy({
            defaultEffect: params.policy.defaultEffect,
            rules: (params.policy.rules ?? []).map((rule, index) => ({
              id: rule.id ?? `policy-${Date.now()}-${index}`,
              effect: normalizePolicyEffect(rule.effect),
              target: normalizePolicyTarget(
                rule.target,
                rule.pathPattern,
                rule.scope === 'risk' ? 'high' : undefined
              ),
              pattern: rule.pattern ?? rule.pathPattern ?? rule.scope ?? 'harness',
              approvalRole: rule.approvalRole,
              reason: rule.reason ?? rule.description,
            })),
          }),
        };
      case 'resetPolicy':
        return {
          success: true,
          policy: await this.executionService.resetPolicy(),
        };
      case 'evaluatePolicy': {
        const evaluationTarget = normalizePolicyTarget(
          params.target,
          params.pathPattern,
          params.risk
        );
        const evaluationPath = params.pathPattern
          || params.path
          || (evaluationTarget === 'path' ? params.pattern : undefined);
        const evaluationApproval = params.approvedBy || params.approvalRole || params.approvalNote
          ? {
              approvedBy: params.approvedBy,
              note: params.approvalNote,
            }
          : undefined;
        const risk = evaluationTarget === 'risk' && isHarnessPolicyRisk(params.pattern)
          ? params.pattern
          : params.risk;

        return {
          success: true,
          evaluation: await this.executionService.evaluatePolicy({
            tool: params.scope === 'workflow' ? 'workflow' : 'harness',
            action: evaluationTarget === 'action'
              ? (params.pattern || inferPolicyAction(params))
              : inferPolicyAction(params),
            paths: evaluationPath ? [evaluationPath] : undefined,
            risk,
            metadata: params.metadata,
            approval: evaluationApproval,
            approvalRole: params.approvalRole,
          }),
        };
      }
      default:
        throw new Error(`Unknown harness action: ${(params as HarnessActionInput).action}`);
    }
  }
}
