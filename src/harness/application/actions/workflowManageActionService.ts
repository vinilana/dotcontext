import * as path from 'path';

import type { PrevcRole } from '../../domain/workflow';
import { WorkflowService } from '../workflow';

import type { HarnessArtifactKind } from '../../adapters/out/runtimeState/runtimeStateService';
import type { RequiredArtifactInput } from '../contracts/taskContractsService';

export type HarnessWorkflowManageAction =
  | 'handoff'
  | 'collaborate'
  | 'createDoc'
  | 'getGates'
  | 'approvePlan'
  | 'setAutonomous'
  | 'checkpoint'
  | 'recordArtifact'
  | 'defineTask'
  | 'runSensors';

export interface HarnessWorkflowManageActionInput {
  action: HarnessWorkflowManageAction;
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
  kind?: HarnessArtifactKind;
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

export type HarnessWorkflowManageActionResult = Record<string, unknown>;

export interface HarnessWorkflowManageActionServiceOptions {
  repoPath: string;
}

function noWorkflowResponse(): HarnessWorkflowManageActionResult {
  return {
    success: false,
    error: 'No workflow found. Initialize a workflow first.',
    suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
  };
}

export class HarnessWorkflowManageActionService {
  constructor(private readonly options: HarnessWorkflowManageActionServiceOptions) {}

  async execute(params: HarnessWorkflowManageActionInput): Promise<HarnessWorkflowManageActionResult> {
    const repoPath = path.resolve(params.repoPath || this.options.repoPath);
    const service = await WorkflowService.create(repoPath);

    switch (params.action) {
      case 'handoff': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        if (!params.from || !params.to) {
          return {
            success: false,
            error: 'handoff requires from and to agent names',
          };
        }

        await service.handoff(params.from, params.to, params.artifacts || []);
        const nextSuggestion = service.getNextAgentSuggestion(params.to);

        return {
          success: true,
          message: `Handoff complete: ${params.from} -> ${params.to}`,
          handoff: {
            from: params.from,
            to: params.to,
            artifacts: params.artifacts || [],
          },
          nextSuggestion,
        };
      }
      case 'collaborate': {
        const session = await service.startCollaboration(
          params.topic!,
          params.participants
        );
        const sessionStatus = session.getStatus();

        return {
          success: true,
          message: `Collaboration session started: ${params.topic}`,
          sessionId: sessionStatus.id,
          topic: sessionStatus.topic,
          participants: sessionStatus.participants.map((participant) => ({
            role: participant,
            displayName: service.getRoleDisplayName(participant),
          })),
        };
      }
      case 'createDoc': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        const docPath = `.context/runtime/workflows/docs/${params.type}-${params.docName?.toLowerCase().replace(/\s+/g, '-')}.md`;

        return {
          success: true,
          message: `Document template ready: ${params.type}`,
          documentType: params.type,
          suggestedPath: docPath,
          name: params.docName,
        };
      }
      case 'getGates': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        const gateResult = await service.checkGates();
        const settings = await service.getSettings();
        const approval = await service.getApproval();
        const summary = await service.getSummary();

        return {
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
        };
      }
      case 'approvePlan': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
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
          return {
            success: false,
            error: `Plan slug mismatch: workflow is linked to ${canonicalPlanSlug}, but approvePlan received ${params.planSlug}.`,
            hint: 'Pass the workflow-linked plan slug or re-link the plan before approving.',
          };
        }

        if (!requestedPlanSlug) {
          return {
            success: false,
            error: 'No linked plan is available to approve.',
            hint: 'Link a plan first using plan({ action: "link" }) or pass planSlug explicitly.',
          };
        }

        if (!linkedPlanSlugs.includes(requestedPlanSlug)) {
          return {
            success: false,
            error: `Linked plan not found: ${requestedPlanSlug}`,
            hint: 'Link the plan first using plan({ action: "link" }).',
          };
        }

        const currentApproval = await service.getApproval();
        if (!currentApproval?.plan_created) {
          return {
            success: false,
            error: 'No plan is linked to approve. Link a plan first using plan({ action: "link" }).',
            hint: 'Use context({ action: "scaffoldPlan" }) to create a plan, then plan({ action: "link" }) to link it.',
          };
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
          return {
            success: false,
            error: `Unable to persist approval metadata for linked plan: ${requestedPlanSlug}`,
          };
        }

        const gateResult = await service.checkGates();

        return {
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
        };
      }
      case 'setAutonomous': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        const settings = await service.setAutonomousMode(params.enabled!);

        return {
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
        };
      }
      case 'checkpoint': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        const result = await service.checkpointHarnessSession(
          params.notes,
          params.data,
          params.artifactIds,
          params.pause
        );

        return {
          success: true,
          message: params.pause ? 'Harness session checkpointed and paused' : 'Harness session checkpointed',
          sessionId: result.binding.sessionId,
          sessionStatus: result.session.status,
          checkpointCount: result.session.checkpointCount,
        };
      }
      case 'recordArtifact': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        if (!params.name) {
          return {
            success: false,
            error: 'recordArtifact requires name',
          };
        }

        const artifact = await service.recordHarnessArtifact({
          name: params.name,
          kind: params.kind,
          content: params.content,
          path: params.filePath,
          metadata: { action: 'workflow-manage.recordArtifact' },
        });

        return {
          success: true,
          message: `Artifact recorded: ${artifact.name}`,
          artifact,
        };
      }
      case 'defineTask': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        if (!params.taskTitle) {
          return {
            success: false,
            error: 'defineTask requires taskTitle',
          };
        }

        const task = await service.defineHarnessTask({
          title: params.taskTitle,
          description: params.taskDescription,
          owner: params.owner,
          inputs: params.inputs,
          expectedOutputs: params.expectedOutputs,
          acceptanceCriteria: params.acceptanceCriteria,
          requiredSensors: params.requiredSensors,
          requiredArtifacts: params.requiredArtifacts as RequiredArtifactInput[] | undefined,
        });

        return {
          success: true,
          message: `Harness task defined: ${task.title}`,
          task,
        };
      }
      case 'runSensors': {
        if (!(await service.hasWorkflow())) {
          return noWorkflowResponse();
        }

        if (!params.sensors || params.sensors.length === 0) {
          return {
            success: false,
            error: 'runSensors requires sensors',
          };
        }

        const result = await service.runHarnessSensors(params.sensors, {
          action: 'workflow-manage.runSensors',
        });

        return {
          success: true,
          message: `Executed ${result.runs.length} sensors`,
          runs: result.runs,
          backpressure: result.backpressure,
        };
      }
      default:
        throw new Error(`Unknown workflow manage action: ${(params as HarnessWorkflowManageActionInput).action}`);
    }
  }
}
