/**
 * Workflow Manage Handler
 *
 * Handles workflow management operations: handoffs, collaboration, documents, gates, approvals.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import { HarnessPolicyBlockedError } from '../../harness';

import type { PrevcRole } from '../../../workflow';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface WorkflowManageParams {
  action: 'handoff' | 'collaborate' | 'createDoc' | 'getGates' | 'approvePlan' | 'setAutonomous' | 'checkpoint' | 'recordArtifact' | 'defineTask' | 'runSensors';
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
  name?: string;
  kind?: 'text' | 'json' | 'file';
  content?: unknown;
  filePath?: string;
  taskTitle?: string;
  taskDescription?: string;
  owner?: string;
  inputs?: string[];
  expectedOutputs?: string[];
  acceptanceCriteria?: string[];
  requiredSensors?: string[];
  requiredArtifacts?: Array<string | Record<string, unknown>>;
  sensors?: string[];
  data?: unknown;
  artifactIds?: string[];
  pause?: boolean;
  repoPath?: string;
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

        return createJsonResponse({
          success: true,
          message: `Handoff complete: ${params.from} → ${params.to}`,
          handoff: {
            from: params.from,
            to: params.to,
            artifacts: params.artifacts || [],
          },
          nextSuggestion,
        });
      }

      case 'collaborate': {
        const session = await service.startCollaboration(
          params.topic!,
          params.participants
        );
        const sessionStatus = session.getStatus();

        return createJsonResponse({
          success: true,
          message: `Collaboration session started: ${params.topic}`,
          sessionId: sessionStatus.id,
          topic: sessionStatus.topic,
          participants: sessionStatus.participants.map((p) => ({
            role: p,
            displayName: service.getRoleDisplayName(p),
          })),
        });
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
          message: `Document template ready: ${params.type}`,
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

        return createJsonResponse({
          success: true,
          currentPhase: {
            code: summary.currentPhase,
            name: service.getPhaseDisplayName(summary.currentPhase),
          },
          canAdvance: gateResult.canAdvance,
          gates: gateResult.gates,
          blockingReason: gateResult.blockingReason,
          hint: gateResult.hint,
          settings: {
            autonomous_mode: settings.autonomous_mode,
            require_plan: settings.require_plan,
            require_approval: settings.require_approval,
          },
          approval: approval ? {
            plan_created: approval.plan_created,
            plan_approved: approval.plan_approved,
            approved_by: approval.approved_by,
            approved_at: approval.approved_at,
          } : null,
        });
      }

      case 'approvePlan': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const workflowStatus = await service.getStatus();
        const planLinker = service.getPlanLinkerForWorkflow();
        const plans = await planLinker.getLinkedPlans();
        const linkedPlanSlugs = [...plans.active, ...plans.completed].map((plan) => plan.slug);
        const canonicalPlanSlug = workflowStatus.project.plan
          || plans.primary
          || (plans.active.length === 1 ? plans.active[0].slug : null);
        const requestedPlanSlug = params.planSlug || canonicalPlanSlug;

        if (params.planSlug && canonicalPlanSlug && params.planSlug !== canonicalPlanSlug) {
          return createJsonResponse({
            success: false,
            error: `Plan slug mismatch: workflow is linked to ${canonicalPlanSlug}, but approvePlan received ${params.planSlug}.`,
            hint: 'Pass the workflow-linked plan slug or re-link the plan before approving.',
          });
        }

        if (!requestedPlanSlug) {
          return createJsonResponse({
            success: false,
            error: 'No linked plan is available to approve.',
            hint: 'Link a plan first using plan({ action: "link" }) or pass planSlug explicitly.',
          });
        }

        if (!linkedPlanSlugs.includes(requestedPlanSlug)) {
          return createJsonResponse({
            success: false,
            error: `Linked plan not found: ${requestedPlanSlug}`,
            hint: 'Link the plan first using plan({ action: "link" }).',
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

        const syncedPlan = await planLinker.updatePlanApproval(requestedPlanSlug, {
          approvalStatus: 'approved',
          approvedAt: approval.approved_at,
          approvedBy: approval.approved_by ? String(approval.approved_by) : undefined,
        });

        if (!syncedPlan) {
          return createJsonResponse({
            success: false,
            error: `Unable to persist approval metadata for linked plan: ${requestedPlanSlug}`,
          });
        }

        const gateResult = await service.checkGates();

        return createJsonResponse({
          success: true,
          message: 'Plan approved successfully',
          plan: {
            slug: syncedPlan.slug,
            approval_status: syncedPlan.approval_status,
            approved_by: syncedPlan.approved_by,
            approved_at: syncedPlan.approved_at,
          },
          approval: {
            plan_approved: approval.plan_approved,
            approved_by: approval.approved_by,
            approved_at: approval.approved_at,
            approval_notes: approval.approval_notes,
          },
          canAdvanceToExecution: gateResult.gates.approval_required.passed,
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

        return createJsonResponse({
          success: true,
          message: `Autonomous mode ${params.enabled ? 'enabled' : 'disabled'}${params.reason ? `: ${params.reason}` : ''}`,
          settings: {
            autonomous_mode: settings.autonomous_mode,
            require_plan: settings.require_plan,
            require_approval: settings.require_approval,
          },
          effect: params.enabled
            ? 'All workflow gates are now bypassed. Use workflow-advance() freely.'
            : 'Workflow gates are now enforced based on settings.',
        });
      }

      case 'checkpoint': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        const result = await service.checkpointHarnessSession(
          params.notes,
          params.data,
          params.artifactIds,
          params.pause
        );

        return createJsonResponse({
          success: true,
          message: params.pause ? 'Harness session checkpointed and paused' : 'Harness session checkpointed',
          sessionId: result.binding.sessionId,
          sessionStatus: result.session.status,
          checkpointCount: result.session.checkpointCount,
        });
      }

      case 'recordArtifact': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        if (!params.name) {
          return createJsonResponse({
            success: false,
            error: 'recordArtifact requires name',
          });
        }

        const artifact = await service.recordHarnessArtifact({
          name: params.name,
          kind: params.kind,
          content: params.content,
          path: params.filePath,
          metadata: { action: 'workflow-manage.recordArtifact' },
        });

        return createJsonResponse({
          success: true,
          message: `Artifact recorded: ${artifact.name}`,
          artifact,
        });
      }

      case 'defineTask': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        if (!params.taskTitle) {
          return createJsonResponse({
            success: false,
            error: 'defineTask requires taskTitle',
          });
        }

        const task = await service.defineHarnessTask({
          title: params.taskTitle,
          description: params.taskDescription,
          owner: params.owner,
          inputs: params.inputs,
          expectedOutputs: params.expectedOutputs,
          acceptanceCriteria: params.acceptanceCriteria,
          requiredSensors: params.requiredSensors,
          requiredArtifacts: params.requiredArtifacts as import('../../harness').RequiredArtifactInput[] | undefined,
        });

        return createJsonResponse({
          success: true,
          message: `Harness task defined: ${task.title}`,
          task,
        });
      }

      case 'runSensors': {
        if (!(await service.hasWorkflow())) {
          return createJsonResponse({
            success: false,
            error: 'No workflow found. Initialize a workflow first.',
            suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
          });
        }

        if (!params.sensors || params.sensors.length === 0) {
          return createJsonResponse({
            success: false,
            error: 'runSensors requires sensors',
          });
        }

        const result = await service.runHarnessSensors(params.sensors, {
          action: 'workflow-manage.runSensors',
        });

        return createJsonResponse({
          success: true,
          message: `Executed ${result.runs.length} sensors`,
          runs: result.runs,
          backpressure: result.backpressure,
        });
      }

      default:
        return createErrorResponse(`Unknown workflow manage action: ${params.action}`);
    }
  } catch (error) {
    const caughtError = error instanceof Error ? error : new Error(String(error));

    if (caughtError instanceof HarnessPolicyBlockedError) {
      return createJsonResponse({
        success: false,
        error: caughtError.message,
        blockedBy: 'policy',
        reasons: caughtError.decision.reasons,
        policy: caughtError.decision.policy,
      });
    }

    return createErrorResponse(caughtError);
  }
}
