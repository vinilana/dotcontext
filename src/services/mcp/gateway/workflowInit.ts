/**
 * Workflow Init Handler
 *
 * Handles PREVC workflow initialization.
 * Primary entry point for AI to start workflows.
 */

import * as path from 'path';
import { WorkflowService } from '../../workflow';
import {
  PHASE_NAMES_EN,
  getScaleName,
  ProjectScale,
  PrevcPhase,
} from '../../../workflow';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import {
  createHelpResourceRef,
  compactActiveAgents,
  compactPhaseStates,
  executionStateCache,
  resolveResponsePreferences,
} from './runtime';

export interface WorkflowInitParams {
  name: string;
  description?: string;
  scale?: 'QUICK' | 'SMALL' | 'MEDIUM' | 'LARGE';
  autonomous?: boolean;
  require_plan?: boolean;
  require_approval?: boolean;
  archive_previous?: boolean;
  repoPath?: string;
  verbose?: boolean;
  includeGuidance?: boolean;
  includeOrchestration?: boolean;
  includeLegacy?: boolean;
  profile?: string;
}

export interface WorkflowInitOptions {
  repoPath: string;
}

/**
 * Initialize a PREVC workflow.
 *
 * This is the primary method for AI to start workflows.
 * Use this after .context/ exists (use project-setup for first-time setup).
 */
export async function handleWorkflowInit(
  params: WorkflowInitParams,
  options: WorkflowInitOptions
): Promise<MCPToolResponse> {
  try {
    const responsePrefs = resolveResponsePreferences(params);

    // Resolve repo path: use explicit param, then options
    // options.repoPath is guaranteed to be valid by MCP server initialization
    const repoPath = path.resolve(params.repoPath || options.repoPath);
    const contextPath = path.join(repoPath, '.context');

    // Create service
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

    const statusFilePath = path.join(contextPath, 'workflow', 'status.yaml');
    const settings = await service.getSettings();
    const scale = getScaleName(status.project.scale as ProjectScale);
    const isAutonomous = settings.autonomous_mode;
    const requiresPlan = settings.require_plan;
    const currentPhase = status.project.current_phase;
    const bundle = await executionStateCache.getPhaseBundle(
      repoPath,
      currentPhase,
      () => service.getPhaseExecutionBundle(currentPhase)
    );
    const summary = await service.getSummary();
    const fullStatus = await service.getStatus();

    const response: Record<string, unknown> = {
      success: true,
      name: params.name,
      scale,
      currentPhase: {
        code: currentPhase,
        name: PHASE_NAMES_EN[currentPhase],
      },
      settings: {
        autonomous_mode: settings.autonomous_mode,
        require_plan: settings.require_plan,
        require_approval: settings.require_approval,
      },
      startWith: bundle.startWith,
      bundleId: bundle.bundleId,
      nextAction: bundle.nextAction,
      hint: bundle.hint,
      helpRef: createHelpResourceRef('init'),
      profile: responsePrefs.profile,
      revision: executionStateCache.getRevision(repoPath, {
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
        phases: compactPhaseStates(fullStatus.phases),
        activeAgents: compactActiveAgents(fullStatus.agents),
        settings: {
          autonomous_mode: settings.autonomous_mode,
          require_plan: settings.require_plan,
          require_approval: settings.require_approval,
        },
        bundleId: bundle.bundleId,
      }),
    };

    if (responsePrefs.includeOrchestration) {
      response.bundle = {
        agentIds: bundle.agentIds,
        skillIds: bundle.skillIds,
        docRefs: bundle.docRefs,
      };
    }

    if (responsePrefs.includeGuidance) {
      response.guidance = buildCompactWorkflowGuidance({
        isAutonomous,
        requiresPlan,
        currentPhase,
      });
    }

    if (responsePrefs.includeLegacy) {
      const orchestration = await service.getPhaseOrchestration(currentPhase);
      response.message = `Workflow initialized: ${params.name}`;
      response.phases = Object.keys(status.phases).filter(
        (phase) => status.phases[phase as PrevcPhase].status !== 'skipped'
      );
      response.statusFilePath = statusFilePath;
      response.contextPath = contextPath;
      response.orchestration = orchestration;
      response._actionRequired = true;
      response._status = 'workflow_active';
      response.enhancementPrompt = buildWorkflowEnhancementPrompt({
        name: params.name,
        scale,
        currentPhase,
        isAutonomous,
        requiresPlan,
      });
      response.nextSteps = buildWorkflowNextSteps({
        currentPhase,
        isAutonomous,
        requiresPlan,
      });
    }

    return createJsonResponse(response);
  } catch (error) {
    return createErrorResponse(error);
  }
}

function buildCompactWorkflowGuidance(options: {
  currentPhase: string;
  isAutonomous: boolean;
  requiresPlan: boolean;
}): Record<string, unknown> {
  if (options.isAutonomous) {
    return {
      mode: 'autonomous',
      gate: 'bypassed',
      next: 'Start implementation work directly and advance phases as they complete.',
    };
  }

  if (options.requiresPlan) {
    return {
      mode: 'plan_required',
      gate: 'plan_required',
      next: 'Create and link a plan before advancing to Review.',
    };
  }

  return {
    mode: 'standard',
    gate: 'none',
    next: `Current phase is ${options.currentPhase}. Planning is recommended before advancing.`,
  };
}

/**
 * Build enhancement prompt for workflow initialization.
 */
function buildWorkflowEnhancementPrompt(options: {
  name: string;
  scale: string;
  currentPhase: string;
  isAutonomous: boolean;
  requiresPlan: boolean;
}): string {
  const { name, scale, currentPhase, isAutonomous, requiresPlan } = options;

  if (isAutonomous) {
    return `✓ WORKFLOW ACTIVE - AUTONOMOUS MODE

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
3. Use workflow-status to check current state at any time

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

  return `✓ WORKFLOW ACTIVE

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

Use workflow-status to check current state at any time.`;
}

/**
 * Build next steps array for workflow initialization.
 */
function buildWorkflowNextSteps(options: {
  currentPhase: string;
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
      'OPTIONAL: Call workflow-status to check current state',
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
    'OPTIONAL: Call workflow-status to check current state',
  ];
}
