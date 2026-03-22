/**
 * Workflow Advance Handler
 *
 * Handles advancing PREVC workflow to the next phase.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import {
  PHASE_NAMES_EN,
  getScaleName,
  ProjectScale,
  WorkflowGateError,
} from '../../../workflow';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import {
  compactActiveAgents,
  compactPhaseStates,
  createHelpResourceRef,
  executionStateCache,
  resolveResponsePreferences,
} from './runtime';

export interface WorkflowAdvanceParams {
  outputs?: string[];
  force?: boolean;
  repoPath?: string;
  verbose?: boolean;
  includeGuidance?: boolean;
  includeOrchestration?: boolean;
  includeLegacy?: boolean;
  profile?: string;
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
    const responsePrefs = resolveResponsePreferences(params);

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
        const bundle = await executionStateCache.getPhaseBundle(
          repoPath,
          nextPhase,
          () => service.getPhaseExecutionBundle(nextPhase)
        );
        const summary = await service.getSummary();
        const status = await service.getStatus();
        const gates = await service.checkGates();
        const approval = await service.getApproval();
        const response: Record<string, unknown> = {
          success: true,
          profile: responsePrefs.profile,
          currentPhase: {
            code: nextPhase,
            name: PHASE_NAMES_EN[nextPhase],
          },
          startWith: bundle.startWith,
          bundleId: bundle.bundleId,
          nextAction: bundle.nextAction,
          hint: bundle.hint,
          ...(responsePrefs.includeGuidance ? { helpRef: createHelpResourceRef('advance') } : {}),
        };

        const compactState = {
          success: true,
          name: summary.name,
          scale: getScaleName(summary.scale as ProjectScale),
          currentPhase: {
            code: summary.currentPhase,
            name: PHASE_NAMES_EN[summary.currentPhase],
          },
          progress: summary.progress,
          isComplete: summary.isComplete,
          phases: compactPhaseStates(status.phases),
          activeAgents: compactActiveAgents(status.agents),
          gates: {
            canAdvance: gates.canAdvance,
            ...(gates.blockingReason ? { blockedBy: gates.blockingReason } : {}),
          },
          approval: approval ? {
            planCreated: approval.plan_created,
            planApproved: approval.plan_approved,
            ...(approval.approved_by ? { approvedBy: String(approval.approved_by) } : {}),
            ...(approval.approved_at ? { approvedAt: approval.approved_at } : {}),
          } : null,
          bundleId: bundle.bundleId,
        };
        response.revision = executionStateCache.getRevision(repoPath, compactState);

        if (responsePrefs.includeOrchestration) {
          response.bundle = {
            startWith: bundle.startWith,
            agentIds: bundle.agentIds,
            skillIds: bundle.skillIds,
            docRefs: bundle.docRefs,
          };
        }

        if (responsePrefs.includeLegacy) {
          const orchestration = await service.getPhaseOrchestration(nextPhase);
          const phaseName = PHASE_NAMES_EN[nextPhase];
          response.message = `Advanced to ${phaseName} phase`;
          response.nextPhase = {
            code: nextPhase,
            name: phaseName,
          };
          response.orchestration = orchestration;
          response.quickStart = {
            message: `Ready to start ${phaseName} phase`,
            firstStep: `Call agent({ action: "orchestrate", phase: "${nextPhase}" }) to discover agents`,
            agentPlaybook: `.context/agents/${bundle.startWith}.md`,
            nextActions: [
              `1. Discover agents: agent({ action: "orchestrate", phase: "${nextPhase}" })`,
              `2. Review sequence: agent({ action: "getSequence", phases: ["${nextPhase}"] })`,
              `3. Begin with ${bundle.startWith} - follow playbook at .context/agents/${bundle.startWith}.md`,
              '4. Use workflow-manage to execute handoffs between agents',
              '5. Call workflow-advance when phase is complete',
            ],
          };
        }

        return createJsonResponse(response);
      } else {
        const summary = await service.getSummary();
        const status = await service.getStatus();
        const compactState = {
          success: true,
          name: summary.name,
          scale: getScaleName(summary.scale as ProjectScale),
          currentPhase: {
            code: summary.currentPhase,
            name: PHASE_NAMES_EN[summary.currentPhase],
          },
          progress: summary.progress,
          isComplete: summary.isComplete,
          phases: compactPhaseStates(status.phases),
          activeAgents: compactActiveAgents(status.agents),
        };
        return createJsonResponse({
          success: true,
          isComplete: true,
          revision: executionStateCache.getRevision(repoPath, compactState),
          ...(responsePrefs.includeLegacy ? { message: 'Workflow completed!' } : {}),
        });
      }
    } catch (error) {
      if (error instanceof WorkflowGateError) {
        const blockedGate = error.message.includes('plan') ? 'plan_required' : 'approval_required';

        const response: Record<string, unknown> = {
          success: false,
          error: error.message,
          gate: error.gate,
          transition: error.transition,
          blockedGate,
          hint: error.hint,
          resolution: blockedGate === 'plan_required'
            ? 'Create and link a plan: plan({ action: "link", planSlug: "plan-name" })'
            : 'Approve the linked plan before advancing to Execution.',
          helpRef: createHelpResourceRef('gates'),
        };

        if (responsePrefs.includeLegacy) {
          response.alternative = 'Use workflow-advance({ force: true }) to bypass gate';
          response.autonomousMode = 'Or use workflow-manage({ action: "setAutonomous", enabled: true })';
        }

        return createJsonResponse(response);
      }
      throw error;
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
