import {
  HarnessExecutionService,
  HarnessReplayService,
  HarnessDatasetService,
  type HarnessPolicyEffect,
  type HarnessPolicyTarget,
} from '../../harness';

import type { HarnessParams } from './types';
import type { MCPToolResponse } from './response';
import { createErrorResponse, createJsonResponse } from './response';

export interface HarnessOptions {
  repoPath: string;
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

function normalizePolicyTarget(target?: string, pathPattern?: string, risk?: string): HarnessPolicyTarget {
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

export async function handleHarness(
  params: HarnessParams,
  options: HarnessOptions
): Promise<MCPToolResponse> {
  const service = new HarnessExecutionService({ repoPath: options.repoPath });
  const replayService = new HarnessReplayService({ repoPath: options.repoPath });
  const datasetService = new HarnessDatasetService({ repoPath: options.repoPath });

  try {
    const inferPolicyAction = () => {
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
    };

    switch (params.action) {
      case 'createSession':
        return createJsonResponse({
          success: true,
          session: await service.createSession({
            name: params.name!,
            metadata: params.metadata,
          }),
        });
      case 'listSessions':
        return createJsonResponse({
          success: true,
          sessions: await service.listSessions(),
        });
      case 'getSession':
        return createJsonResponse({
          success: true,
          session: await service.getSession(params.sessionId!),
        });
      case 'appendTrace':
        return createJsonResponse({
          success: true,
          trace: await service.appendTrace(params.sessionId!, {
            level: params.level!,
            event: params.event!,
            message: params.message!,
            data: params.data,
          }),
        });
      case 'listTraces':
        return createJsonResponse({
          success: true,
          traces: await service.listTraces(params.sessionId!),
        });
      case 'addArtifact':
        return createJsonResponse({
          success: true,
          artifact: await service.addArtifact(params.sessionId!, {
            name: params.name!,
            kind: params.kind,
            content: params.content,
            path: params.path,
            metadata: params.metadata,
          }),
        });
      case 'listArtifacts':
        return createJsonResponse({
          success: true,
          artifacts: await service.listArtifacts(params.sessionId!),
        });
      case 'checkpoint':
        return createJsonResponse({
          success: true,
          session: await service.checkpointSession(params.sessionId!, {
            note: params.note,
            data: params.data,
            artifactIds: params.artifactIds,
            pause: params.pause,
          }),
        });
      case 'resumeSession':
        return createJsonResponse({
          success: true,
          session: await service.resumeSession(params.sessionId!),
        });
      case 'completeSession':
        return createJsonResponse({
          success: true,
          session: await service.completeSession(params.sessionId!, params.note),
        });
      case 'failSession':
        return createJsonResponse({
          success: true,
          session: await service.failSession(params.sessionId!, params.message!),
        });
      case 'recordSensor':
        return createJsonResponse({
          success: true,
          sensorRun: await service.runSensor({
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
        });
      case 'getSessionQuality':
        return createJsonResponse({
          success: true,
          quality: await service.getSessionQuality(params.sessionId!, {
            taskId: params.taskId,
            policy: {
              blockOnWarnings: params.blockOnWarnings,
              requireEvidence: params.requireEvidence,
            },
          }),
        });
      case 'createTask':
        return createJsonResponse({
          success: true,
          task: await service.createTaskContract({
            title: params.title!,
            description: params.description,
            sessionId: params.sessionId,
            owner: params.owner,
            inputs: params.inputs,
            expectedOutputs: params.expectedOutputs,
            acceptanceCriteria: params.acceptanceCriteria,
            requiredSensors: params.requiredSensors,
            requiredArtifacts: params.requiredArtifacts,
            status: params.status,
            metadata: params.metadata,
          }),
        });
      case 'listTasks':
        return createJsonResponse({
          success: true,
          tasks: await service.listTaskContracts(),
        });
      case 'evaluateTask':
        return createJsonResponse({
          success: true,
          evaluation: await service.evaluateTaskCompletion(params.taskId!, params.sessionId),
        });
      case 'createHandoff':
        return createJsonResponse({
          success: true,
          handoff: await service.createHandoffContract({
            from: params.from!,
            to: params.to!,
            sessionId: params.sessionId,
            taskId: params.taskId,
            artifacts: params.artifacts,
            evidence: params.evidence,
            metadata: params.metadata,
          }),
        });
      case 'listHandoffs':
        return createJsonResponse({
          success: true,
          handoffs: await service.listHandoffContracts(),
        });
      case 'replaySession':
        return createJsonResponse({
          success: true,
          replay: await replayService.replaySession(params.sessionId!, {
            includePayloads: params.includePayloads,
            maxEvents: params.maxEvents,
          }),
        });
      case 'listReplays':
        return createJsonResponse({
          success: true,
          replays: await replayService.listReplays(
            params.sessionId ? { sessionId: params.sessionId } : undefined
          ),
        });
      case 'getReplay':
        return createJsonResponse({
          success: true,
          replay: await replayService.getReplay(params.replayId!),
        });
      case 'buildDataset':
        return createJsonResponse({
          success: true,
          dataset: await datasetService.buildFailureDataset({
            sessionIds: params.sessionIds,
            includeSuccessfulSessions: params.includeSuccessfulSessions,
          }),
        });
      case 'listDatasets':
        return createJsonResponse({
          success: true,
          datasets: await datasetService.listDatasets(),
        });
      case 'getDataset':
        return createJsonResponse({
          success: true,
          dataset: await datasetService.getDataset(params.datasetId!),
        });
      case 'getFailureClusters':
        return createJsonResponse({
          success: true,
          clusters: await datasetService.getFailureClusters(params.datasetId!),
        });
      case 'registerPolicy':
        if (!params.effect) {
          return createErrorResponse('registerPolicy requires effect');
        }
        const effect: HarnessPolicyEffect = params.effect === 'allow' || params.effect === 'deny'
          ? params.effect
          : 'require_approval';
        const target: HarnessPolicyTarget = params.target === 'tool'
          || params.target === 'action'
          || params.target === 'path'
          || params.target === 'risk'
          ? params.target
          : params.pathPattern
            ? 'path'
            : params.risk
              ? 'risk'
              : 'action';
        return createJsonResponse({
          success: true,
          rule: await service.registerPolicy({
            id: params.name || `policy-${Date.now()}`,
            effect,
            target,
            pattern: params.pattern || params.pathPattern || params.risk || inferPolicyAction(),
            approvalRole: params.owner,
            reason: params.description,
          }),
        });
      case 'listPolicies':
        return createJsonResponse({
          success: true,
          rules: await service.listPolicies(),
        });
      case 'getPolicy':
        return createJsonResponse({
          success: true,
          policy: await service.getPolicy(),
        });
      case 'setPolicy':
        if (!params.policy) {
          return createErrorResponse('setPolicy requires policy');
        }
        return createJsonResponse({
          success: true,
          policy: await service.setPolicy({
            defaultEffect: params.policy.defaultEffect,
            rules: (params.policy.rules ?? []).map((rule, index) => ({
              id: rule.id ?? `policy-${Date.now()}-${index}`,
              effect: normalizePolicyEffect(rule.effect),
              target: normalizePolicyTarget(rule.target, rule.pathPattern, rule.scope === 'risk' ? 'high' : undefined),
              pattern: rule.pattern ?? rule.pathPattern ?? rule.scope ?? 'harness',
              approvalRole: rule.approvalRole,
              reason: rule.reason ?? rule.description,
            })),
          }),
        });
      case 'resetPolicy':
        return createJsonResponse({
          success: true,
          policy: await service.resetPolicy(),
        });
      case 'evaluatePolicy':
        return createJsonResponse({
          success: true,
          evaluation: await service.evaluatePolicy({
            tool: params.scope === 'workflow' ? 'workflow' : 'harness',
            action: params.target || inferPolicyAction(),
            paths: params.path ? [params.path] : undefined,
            risk: params.risk,
            metadata: params.metadata,
          }),
        });
      default:
        return createErrorResponse(`Unknown harness action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
