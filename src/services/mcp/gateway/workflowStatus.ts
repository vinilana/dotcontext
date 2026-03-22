/**
 * Workflow Status Handler
 *
 * Handles PREVC workflow status queries.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import {
  PHASE_NAMES_EN,
  getScaleName,
  ProjectScale,
} from '../../../workflow';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import {
  compactActiveAgents,
  compactPhaseStates,
  createHelpResourceRef,
  executionStateCache,
  resolveResponsePreferences,
  type CompactWorkflowState,
} from './runtime';

export interface WorkflowStatusParams {
  repoPath?: string;
  revision?: string;
  verbose?: boolean;
  includeGuidance?: boolean;
  includeOrchestration?: boolean;
  includeLegacy?: boolean;
  profile?: string;
}

export interface WorkflowStatusOptions {
  repoPath: string;
}

/**
 * Get current PREVC workflow status including phase, gates, and linked plans.
 */
export async function handleWorkflowStatus(
  params: WorkflowStatusParams,
  options: WorkflowStatusOptions
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
        note: 'Workflows enable structured PREVC phases. Skip for trivial changes.',
        statusFilePath: path.join(contextPath, 'workflow', 'status.yaml')
      });
    }

    const summary = await service.getSummary();
    const status = await service.getStatus();
    const settings = await service.getSettings();
    const approval = await service.getApproval();
    const gates = await service.checkGates();
    const bundle = await executionStateCache.getPhaseBundle(
      repoPath,
      summary.currentPhase,
      () => service.getPhaseExecutionBundle(summary.currentPhase)
    );

    const compactState: CompactWorkflowState = {
      success: true,
      name: summary.name,
      scale: getScaleName(summary.scale as ProjectScale),
      profile: responsePrefs.profile,
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
    } as CompactWorkflowState;

    const revision = executionStateCache.getRevision(repoPath, compactState);
    if (params.revision && params.revision === revision) {
      return createJsonResponse({
        success: true,
        notModified: true,
        revision,
      });
    }

    compactState.revision = revision;

    const response: Record<string, unknown> = { ...compactState };

    if (responsePrefs.includeOrchestration) {
      response.bundle = {
        startWith: bundle.startWith,
        agentIds: bundle.agentIds,
        skillIds: bundle.skillIds,
        docRefs: bundle.docRefs,
        nextAction: bundle.nextAction,
        hint: bundle.hint,
      };
    }

    if (responsePrefs.includeGuidance) {
      response.helpRef = createHelpResourceRef('status');
      response.settings = settings;
    }

    if (responsePrefs.includeLegacy) {
      const statusFilePath = path.join(contextPath, 'workflow', 'status.yaml');
      const orchestration = await service.getPhaseOrchestration(summary.currentPhase);
      response.agents = status.agents;
      response.roles = status.roles;
      response.phases = status.phases;
      response.orchestration = orchestration;
      response.statusFilePath = statusFilePath;
    }

    return createJsonResponse(response);
  } catch (error) {
    return createErrorResponse(error);
  }
}
