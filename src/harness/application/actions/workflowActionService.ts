import * as path from 'path';

import {
  getScaleName,
  ProjectScale,
  PrevcPhase,
  WorkflowGateError,
} from '../../domain/workflow';
import {
  HarnessWorkflowBlockedError,
  WorkflowService,
} from '../workflow';

import { HarnessPolicyBlockedError } from '../policies/policyService';
import { resolveRuntimeLayout } from '../../../shared/fs/pathHelpers';
import type { HarnessWorkflowGuideInput } from '../workflow/workflowGuideTypes';

export interface HarnessWorkflowInitInput {
  name: string;
  description?: string;
  scale?: 'QUICK' | 'SMALL' | 'MEDIUM' | 'LARGE';
  autonomous?: boolean;
  require_plan?: boolean;
  require_approval?: boolean;
  archive_previous?: boolean;
  repoPath?: string;
}

export interface HarnessWorkflowStatusInput {
  repoPath?: string;
}

export type { HarnessWorkflowGuideInput } from '../workflow/workflowGuideTypes';

export interface HarnessWorkflowAdvanceInput {
  outputs?: string[];
  force?: boolean;
  repoPath?: string;
}

export type HarnessWorkflowActionResult = Record<string, unknown>;

export interface HarnessWorkflowActionServiceOptions {
  repoPath: string;
}

export class HarnessWorkflowActionService {
  constructor(private readonly options: HarnessWorkflowActionServiceOptions) {}

  async init(params: HarnessWorkflowInitInput): Promise<HarnessWorkflowActionResult> {
    const repoPath = path.resolve(params.repoPath || this.options.repoPath);
    const contextPath = path.join(repoPath, '.context');
    const service = await WorkflowService.create(repoPath);

    const status = await service.init({
      name: params.name,
      description: params.description,
      scale: params.scale,
      autonomous: params.autonomous,
      requirePlan: params.require_plan,
      requireApproval: params.require_approval,
      archivePrevious: params.archive_previous,
    });

    const workflowStatePath = resolveRuntimeLayout(contextPath).prevcFile;
    const settings = await service.getSettings();
    const scale = getScaleName(status.project.scale as ProjectScale);
    const isAutonomous = settings.autonomous_mode;
    const requiresPlan = settings.require_plan;
    const orchestration = await service.getPhaseOrchestration(status.project.current_phase);
    const harness = await service.getHarnessStatus();
    const enhancementPrompt = buildWorkflowEnhancementPrompt({
      name: params.name,
      scale,
      currentPhase: status.project.current_phase,
      isAutonomous,
      requiresPlan,
    });
    const nextSteps = buildWorkflowNextSteps({
      isAutonomous,
      requiresPlan,
    });

    return {
      success: true,
      message: `Workflow initialized: ${params.name}`,
      scale,
      currentPhase: status.project.current_phase,
      phases: Object.keys(status.phases).filter(
        (phase) => status.phases[phase as PrevcPhase].status !== 'skipped'
      ),
      settings: {
        autonomous_mode: settings.autonomous_mode,
        require_plan: settings.require_plan,
        require_approval: settings.require_approval,
      },
      workflowStatePath,
      contextPath,
      orchestration,
      harness: harness ? {
        sessionId: harness.binding.sessionId,
        sessionStatus: harness.session.status,
        runtimeStatePath: resolveRuntimeLayout(contextPath).runtimeDir,
      } : null,
      _actionRequired: true,
      _status: 'workflow_active',
      enhancementPrompt,
      nextSteps,
    };
  }

  async guide(params: HarnessWorkflowGuideInput = {}): Promise<HarnessWorkflowActionResult> {
    const repoPath = path.resolve(params.repoPath || this.options.repoPath);
    const { WorkflowGuideService } = await import('../workflow/workflowGuideService');
    const guidance = await new WorkflowGuideService({ repoPath }).guide(params);

    return {
      success: true,
      ...guidance,
    };
  }

  async status(params: HarnessWorkflowStatusInput = {}): Promise<HarnessWorkflowActionResult> {
    const repoPath = path.resolve(params.repoPath || this.options.repoPath);
    const contextPath = path.join(repoPath, '.context');
    const service = await WorkflowService.create(repoPath);

    if (!(await service.hasWorkflow())) {
      return {
        success: false,
        error: 'No workflow found. Initialize a workflow first.',
        suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
        note: 'Workflows enable structured PREVC phases. Skip for trivial changes.',
        workflowStatePath: resolveRuntimeLayout(contextPath).prevcFile,
      };
    }

    const summary = await service.getSummary();
    const status = await service.getStatus();
    const workflowStatePath = resolveRuntimeLayout(contextPath).prevcFile;
    const orchestration = await service.getPhaseOrchestration(summary.currentPhase);
    const harness = await service.getHarnessStatus();

    return {
      success: true,
      name: summary.name,
      scale: getScaleName(summary.scale as ProjectScale),
      currentPhase: {
        code: summary.currentPhase,
        name: service.getPhaseDisplayName(summary.currentPhase),
      },
      progress: summary.progress,
      isComplete: summary.isComplete,
      phases: status.phases,
      agents: status.agents,
      roles: status.roles,
      orchestration,
      harness,
      workflowStatePath,
    };
  }

  async advance(params: HarnessWorkflowAdvanceInput = {}): Promise<HarnessWorkflowActionResult> {
    const repoPath = path.resolve(params.repoPath || this.options.repoPath);
    const contextPath = path.join(repoPath, '.context');
    const service = await WorkflowService.create(repoPath);

    if (!(await service.hasWorkflow())) {
      return {
        success: false,
        error: 'No workflow found. Initialize a workflow first.',
        suggestion: 'Use workflow-init({ name: "feature-name" }) to start.',
        workflowStatePath: resolveRuntimeLayout(contextPath).prevcFile,
      };
    }

    try {
      const nextPhase = await service.advance(params.outputs, { force: params.force });

      if (!nextPhase) {
        return {
          success: true,
          message: 'Workflow completed!',
          isComplete: true,
        };
      }

      const orchestration = await service.getPhaseOrchestration(nextPhase);
      const phaseName = service.getPhaseDisplayName(nextPhase);
      const startAgent = orchestration.startWith;

      return {
        success: true,
        message: `Advanced to ${phaseName} phase`,
        nextPhase: {
          code: nextPhase,
          name: phaseName,
        },
        orchestration,
        quickStart: {
          message: `Ready to start ${phaseName} phase`,
          firstStep: `Call agent({ action: "orchestrate", phase: "${nextPhase}" }) to discover agents`,
          agentPlaybook: `.context/agents/${startAgent}.md`,
          nextActions: [
            `1. Discover agents: agent({ action: "orchestrate", phase: "${nextPhase}" })`,
            `2. Review sequence: agent({ action: "getSequence", phases: ["${nextPhase}"] })`,
            `3. Begin with ${startAgent} - follow playbook at .context/agents/${startAgent}.md`,
            '4. Use workflow-manage to execute handoffs between agents',
            '5. Call workflow-advance when phase is complete',
          ],
        },
      };
    } catch (error) {
      const caughtError = error instanceof Error ? error : new Error(String(error));

      if (caughtError instanceof HarnessPolicyBlockedError) {
        return {
          success: false,
          error: caughtError.message,
          blockedBy: 'policy',
          reasons: caughtError.decision.reasons,
          policy: caughtError.decision.policy,
        };
      }

      if (caughtError instanceof HarnessWorkflowBlockedError) {
        return {
          success: false,
          error: caughtError.message,
          blockedBy: 'harness',
          reasons: caughtError.reasons,
          harness: caughtError.harnessStatus,
          resolution: [
            'Use workflow-manage({ action: "runSensors", sensors: [...] }) to run required sensors',
            'Use workflow-manage({ action: "recordArtifact", ... }) to attach missing artifacts',
            'Use workflow-manage({ action: "defineTask", ... }) to refresh the active task contract if it is stale',
            'Use workflow-advance({ force: true }) only if you intentionally want to bypass harness checks',
          ],
        };
      }

      if (caughtError instanceof WorkflowGateError) {
        const blockedGate = caughtError.message.includes('plan') ? 'plan_required' : 'approval_required';

        return {
          success: false,
          error: caughtError.message,
          gate: caughtError.gate,
          transition: caughtError.transition,
          blockedGate,
          hint: caughtError.hint,
          resolution: blockedGate === 'plan_required'
            ? 'Create and link a plan: plan({ action: "link", planSlug: "plan-name" })'
            : 'Approve plan: workflow-manage({ action: "approvePlan", planSlug: "plan-name" })',
          alternative: 'Use workflow-advance({ force: true }) to bypass gate',
          autonomousMode: 'Or use workflow-manage({ action: "setAutonomous", enabled: true })',
        };
      }

      throw caughtError;
    }
  }
}

function buildWorkflowEnhancementPrompt(options: {
  name: string;
  scale: string;
  currentPhase: string;
  isAutonomous: boolean;
  requiresPlan: boolean;
}): string {
  const { name, scale, currentPhase, isAutonomous, requiresPlan } = options;

  if (isAutonomous) {
    return `WORKFLOW ACTIVE - AUTONOMOUS MODE

Workflow "${name}" initialized (${scale} scale).
Current phase: ${currentPhase} (Plan)

AUTONOMOUS MODE ENABLED - All gates bypassed.

AGENT ORCHESTRATION:
1. Use agent tool to discover agents: agent({ action: "orchestrate", phase: "P" })
2. Use workflow-manage for handoffs: workflow-manage({ action: "handoff", from: "agent-1", to: "agent-2", artifacts: [...] })
3. Collaborate when needed: workflow-manage({ action: "collaborate", topic: "architecture", participants: [...] })

NEXT ACTIONS:
1. Begin implementation work directly
2. Use workflow-advance to move through phases as work progresses
3. Use workflow-guide to check current next steps at any time

You may proceed without creating formal plans or waiting for approvals.`;
  }

  if (requiresPlan) {
    return `WORKFLOW ACTIVE - PLAN REQUIRED

Workflow "${name}" initialized (${scale} scale).
Current phase: ${currentPhase} (Plan)

GATE: Plan required before advancing to Review phase.

AGENT ORCHESTRATION:
The Plan phase involves multiple agents working together:
1. Discover planning agents: agent({ action: "orchestrate", phase: "P" })
2. Get recommended sequence: agent({ action: "getSequence", phases: ["P"] })
3. Start with first agent and execute handoffs between agents
4. Example handoff: workflow-manage({ action: "handoff", from: "architect-specialist", to: "documentation-writer", artifacts: ["design.md"] })

REQUIRED ACTIONS:
1. Create a plan using context with action "scaffoldPlan" and planName parameter
2. Fill the plan content using context with action "fillSingle"
3. Link the plan using plan with action "link" and planSlug parameter
4. Advance to Review phase using workflow-advance

Do NOT attempt to advance without linking a plan - the gate will block you.`;
  }

  return `WORKFLOW ACTIVE

Workflow "${name}" initialized (${scale} scale).
Current phase: ${currentPhase} (Plan)

AGENT ORCHESTRATION AVAILABLE:
This workflow supports multi-agent orchestration. Use these tools:
- agent({ action: "orchestrate", phase: "P" }) - Discover agents for current phase
- agent({ action: "getSequence", task: "your task description" }) - Get recommended agent sequence
- workflow-manage({ action: "handoff", from: "agent-1", to: "agent-2", artifacts: [...] }) - Execute handoffs
- workflow-manage({ action: "collaborate", topic: "topic", participants: [...] }) - Start collaboration

RECOMMENDED ACTIONS:
1. Create a plan using context with action "scaffoldPlan" (recommended for ${scale} scale)
2. Or advance directly using workflow-advance if planning is not needed

Use workflow-guide to check current next steps at any time.`;
}

function buildWorkflowNextSteps(options: {
  isAutonomous: boolean;
  requiresPlan: boolean;
}): string[] {
  const { isAutonomous, requiresPlan } = options;

  if (isAutonomous) {
    return [
      'ENABLED: Begin implementation work directly (autonomous mode)',
      'ACTION: Call agent({ action: "orchestrate", phase: "P" }) to discover agents',
      'ACTION: Use workflow-manage({ action: "handoff", ... }) to execute agent transitions',
      'OPTIONAL: Call workflow-advance to track phase progression',
      'OPTIONAL: Call workflow-guide to check current next steps',
    ];
  }

  if (requiresPlan) {
    return [
      'REQUIRED: Call context with action "scaffoldPlan" to create a plan',
      'RECOMMENDED: Call agent({ action: "orchestrate", phase: "P" }) to discover planning agents',
      'RECOMMENDED: Use workflow-manage({ action: "handoff", ... }) for agent collaboration',
      'REQUIRED: Call plan with action "link" to link plan to workflow',
      'THEN: Call workflow-advance to move to Review phase',
    ];
  }

  return [
    'RECOMMENDED: Call agent({ action: "orchestrate", phase: "P" }) to discover agents',
    'RECOMMENDED: Call context with action "scaffoldPlan" to create a plan',
    'ALTERNATIVE: Call agent({ action: "getSequence", task: "your task" }) for task-based sequence',
    'OPTIONAL: Use workflow-manage({ action: "handoff", ... }) for multi-agent work',
    'ALTERNATIVE: Call workflow-advance to skip planning phase',
    'OPTIONAL: Call workflow-guide to check current next steps',
  ];
}
