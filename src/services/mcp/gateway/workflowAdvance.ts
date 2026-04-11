/**
 * Workflow Advance Handler
 *
 * Handles advancing PREVC workflow to the next phase.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import {
  PHASE_NAMES_EN,
  WorkflowGateError,
} from '../../../workflow';
import { HarnessWorkflowBlockedError } from '../../workflow';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface WorkflowAdvanceParams {
  outputs?: string[];
  force?: boolean;
  repoPath?: string;
}

export interface WorkflowAdvanceOptions {
  repoPath: string;
}

/**
 * Advance workflow to the next PREVC phase (P→R→E→V→C).
 *
 * Enforces gates:
 * - P→R: Requires plan if require_plan=true
 * - R→E: Requires approval if require_approval=true
 *
 * Use force=true to bypass gates, or use workflow-manage({ action: 'setAutonomous' }).
 */
export async function handleWorkflowAdvance(
  params: WorkflowAdvanceParams,
  options: WorkflowAdvanceOptions
): Promise<MCPToolResponse> {
  try {
    // Resolve repo path: use explicit param, then options
    // options.repoPath is guaranteed to be valid by MCP server initialization
    const repoPath = path.resolve(params.repoPath || options.repoPath);
    const contextPath = path.join(repoPath, '.context');

    // Create service
    const service = await WorkflowService.create(repoPath);

    if (!(await service.hasWorkflow())) {
      return createJsonResponse({
        success: false,
        error: 'No workflow found. Initialize a workflow first.',
        suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
        statusFilePath: path.join(contextPath, 'workflow', 'status.yaml')
      });
    }

    try {
      const nextPhase = await service.advance(params.outputs, { force: params.force });

      if (nextPhase) {
        const orchestration = await service.getPhaseOrchestration(nextPhase);
        const phaseName = PHASE_NAMES_EN[nextPhase];
        const startAgent = orchestration.startWith;

        const response: Record<string, unknown> = {
          success: true,
          message: `Advanced to ${phaseName} phase`,
          nextPhase: {
            code: nextPhase,
            name: phaseName,
          },
          orchestration,
          // NEW: Quick start guidance for immediate action
          quickStart: {
            message: `Ready to start ${phaseName} phase`,
            firstStep: `Call agent({ action: "orchestrate", phase: "${nextPhase}" }) to discover agents`,
            agentPlaybook: `.context/agents/${startAgent}.md`,
            nextActions: [
              `1. Discover agents: agent({ action: "orchestrate", phase: "${nextPhase}" })`,
              `2. Review sequence: agent({ action: "getSequence", phases: ["${nextPhase}"] })`,
              `3. Begin with ${startAgent} - follow playbook at .context/agents/${startAgent}.md`,
              `4. Use workflow-manage to execute handoffs between agents`,
              `5. Call workflow-advance when phase is complete`,
            ],
          },
        };

        return createJsonResponse(response);
      } else {
        return createJsonResponse({
          success: true,
          message: 'Workflow completed!',
          isComplete: true
        });
      }
    } catch (error) {
      if (error instanceof HarnessWorkflowBlockedError) {
        return createJsonResponse({
          success: false,
          error: error.message,
          blockedBy: 'harness',
          reasons: error.reasons,
          harness: error.harnessStatus,
          resolution: [
            'Use workflow-manage({ action: "runSensors", sensors: [...] }) to run required sensors',
            'Use workflow-manage({ action: "recordArtifact", ... }) to attach missing artifacts',
            'Use workflow-manage({ action: "defineTask", ... }) to refresh the active task contract if it is stale',
            'Use workflow-advance({ force: true }) only if you intentionally want to bypass harness checks',
          ],
        });
      }

      if (error instanceof WorkflowGateError) {
        const blockedGate = error.message.includes('plan') ? 'plan_required' : 'approval_required';

        return createJsonResponse({
          success: false,
          error: error.message,
          gate: error.gate,
          transition: error.transition,
          blockedGate,
          hint: error.hint,
          resolution: blockedGate === 'plan_required'
            ? 'Create and link a plan: plan({ action: "link", planSlug: "plan-name" })'
            : 'Approve plan: workflow-manage({ action: "approvePlan", planSlug: "plan-name" })',
          alternative: 'Use workflow-advance({ force: true }) to bypass gate',
          autonomousMode: 'Or use workflow-manage({ action: "setAutonomous", enabled: true })'
        });
      }
      throw error;
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
