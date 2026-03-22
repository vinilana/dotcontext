/**
 * Workflow Manage Handler
 *
 * Handles workflow management operations: handoffs, collaboration, documents, gates, approvals.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import {
  PHASE_NAMES_EN,
  ROLE_DISPLAY_NAMES,
  createPlanLinker,
  getScaleName,
  ProjectScale,
} from '../../../workflow';

import type { PrevcRole } from '../../../workflow';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import {
  compactActiveAgents,
  compactPhaseStates,
  createHelpResourceRef,
  executionStateCache,
  resolveResponsePreferences,
} from './runtime';

export interface WorkflowManageParams {
  action: 'handoff' | 'collaborate' | 'createDoc' | 'getGates' | 'approvePlan' | 'setAutonomous';
  from?: string;
  to?: string;
  artifacts?: string[];
  topic?: string;
  participants?: PrevcRole[];
  type?: 'prd' | 'tech-spec' | 'architecture' | 'adr' | 'test-plan' | 'changelog';
  docName?: string;
  planSlug?: string;
  approver?: PrevcRole;
  notes?: string;
  enabled?: boolean;
  reason?: string;
  repoPath?: string;
  verbose?: boolean;
  includeGuidance?: boolean;
  includeLegacy?: boolean;
  profile?: string;
}

export interface WorkflowManageOptions {
  repoPath: string;
}

/**
 * Manage workflow operations: handoffs, collaboration, documents, gates, approvals.
 */
export async function handleWorkflowManage(
  params: WorkflowManageParams,
  options: WorkflowManageOptions
): Promise<MCPToolResponse> {
  try {
    const responsePrefs = resolveResponsePreferences(params);

    // Resolve repo path: use explicit param, then options
    // options.repoPath is guaranteed to be valid by MCP server initialization
    const repoPath = path.resolve(params.repoPath || options.repoPath);

    // Create service
    const service = await WorkflowService.create(repoPath);

    switch (params.action) {
      case 'handoff': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        // Validate required parameters for agent handoff
        if (!params.from || !params.to) {
          return createJsonResponse({
            success: false,
            error: 'handoff requires from and to agent names',
          });
        }

        await service.handoff(params.from, params.to, params.artifacts || []);

        // Get next agent suggestion
        const nextSuggestion = service.getNextAgentSuggestion(params.to);
        const summary = await service.getSummary();
        const status = await service.getStatus();

        const response: Record<string, unknown> = {
          success: true,
          handoff: {
            from: params.from,
            to: params.to,
            artifacts: params.artifacts || [],
          },
          activeAgent: params.to,
          revision: executionStateCache.getRevision(repoPath, {
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
          }),
        };

        if (nextSuggestion) {
          response.nextAction = `Handoff to ${nextSuggestion.agent} when ${params.to} completes.`;
          if (responsePrefs.includeGuidance || responsePrefs.includeLegacy) {
            response.nextSuggestion = nextSuggestion;
          }
        }

        if (responsePrefs.includeLegacy) {
          response.message = `Handoff complete: ${params.from} → ${params.to}`;
        }

        return createJsonResponse(response);
      }

      case 'collaborate': {
        const session = await service.startCollaboration(
          params.topic!,
          params.participants
        );
        const sessionStatus = session.getStatus();

        const response: Record<string, unknown> = {
          success: true,
          sessionId: sessionStatus.id,
          topic: sessionStatus.topic,
          participants: sessionStatus.participants,
        };

        if (responsePrefs.includeLegacy) {
          response.message = `Collaboration session started: ${params.topic}`;
          response.participants = sessionStatus.participants.map((p) => ({
            role: p,
            displayName: ROLE_DISPLAY_NAMES[p],
          }));
        }

        return createJsonResponse(response);
      }

      case 'createDoc': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const docPath = `.context/workflow/docs/${params.type}-${params.docName?.toLowerCase().replace(/\s+/g, '-')}.md`;

        return createJsonResponse({
          success: true,
          documentType: params.type,
          suggestedPath: docPath,
          name: params.docName,
        });
      }

      case 'getGates': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const gateResult = await service.checkGates();
        const settings = await service.getSettings();
        const approval = await service.getApproval();
        const summary = await service.getSummary();

        const response: Record<string, unknown> = {
          success: true,
          currentPhase: {
            code: summary.currentPhase,
            name: PHASE_NAMES_EN[summary.currentPhase],
          },
          canAdvance: gateResult.canAdvance,
          ...(gateResult.blockingReason ? { blockingReason: gateResult.blockingReason } : {}),
          ...(gateResult.hint ? { hint: gateResult.hint } : {}),
          helpRef: createHelpResourceRef('gates'),
        };

        if (responsePrefs.includeGuidance || responsePrefs.includeLegacy) {
          response.settings = {
            autonomous_mode: settings.autonomous_mode,
            require_plan: settings.require_plan,
            require_approval: settings.require_approval,
          };
          response.approval = approval ? {
            plan_created: approval.plan_created,
            plan_approved: approval.plan_approved,
            approved_by: approval.approved_by,
            approved_at: approval.approved_at,
          } : null;
        }

        if (responsePrefs.includeLegacy) {
          response.gates = gateResult.gates;
        }

        return createJsonResponse(response);
      }

      case 'approvePlan': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const currentApproval = await service.getApproval();
        if (!currentApproval?.plan_created) {
          return createJsonResponse({
            success: false,
            error: 'No plan is linked to approve. Link a plan first using plan({ action: "link" }).',
            hint: 'Use context({ action: "scaffoldPlan" }) to create a plan, then plan({ action: "link" }) to link it.'
          });
        }

        const approval = await service.approvePlan(
          params.approver || 'reviewer',
          params.notes
        );

        if (params.planSlug) {
          const planLinker = createPlanLinker(repoPath);
          const plans = await planLinker.getLinkedPlans();
          const planRef = plans.active.find(p => p.slug === params.planSlug);
          if (planRef) {
            planRef.approval_status = 'approved';
            planRef.approved_at = approval.approved_at;
            planRef.approved_by = approval.approved_by as string;
          }
        }

        const gateResult = await service.checkGates();

        const summary = await service.getSummary();
        const status = await service.getStatus();

        return createJsonResponse({
          success: true,
          approval: {
            plan_approved: approval.plan_approved,
            approved_by: approval.approved_by,
            approved_at: approval.approved_at,
            approval_notes: approval.approval_notes,
          },
          canAdvanceToExecution: gateResult.gates.approval_required.passed,
          revision: executionStateCache.getRevision(repoPath, {
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
          }),
          ...(responsePrefs.includeLegacy ? { message: 'Plan approved successfully' } : {}),
        });
      }

      case 'setAutonomous': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const settings = await service.setAutonomousMode(params.enabled!);

        const summary = await service.getSummary();
        const status = await service.getStatus();

        return createJsonResponse({
          success: true,
          settings: {
            autonomous_mode: settings.autonomous_mode,
            require_plan: settings.require_plan,
            require_approval: settings.require_approval,
          },
          revision: executionStateCache.getRevision(repoPath, {
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
          }),
          ...(responsePrefs.includeGuidance || responsePrefs.includeLegacy ? {
            effect: params.enabled
              ? 'All workflow gates are now bypassed. Use workflow-advance() freely.'
              : 'Workflow gates are now enforced based on settings.',
          } : {}),
          ...(responsePrefs.includeLegacy ? {
            message: `Autonomous mode ${params.enabled ? 'enabled' : 'disabled'}${params.reason ? `: ${params.reason}` : ''}`,
          } : {}),
        });
      }

      default:
        return createErrorResponse(`Unknown workflow manage action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
