import { HarnessExecutionService } from '../../harness';

import type { HarnessParams } from './types';
import type { MCPToolResponse } from './response';
import { createErrorResponse, createJsonResponse } from './response';

export interface HarnessOptions {
  repoPath: string;
}

export async function handleHarness(
  params: HarnessParams,
  options: HarnessOptions
): Promise<MCPToolResponse> {
  const service = new HarnessExecutionService({ repoPath: options.repoPath });

  try {
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
      default:
        return createErrorResponse(`Unknown harness action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}

