/**
 * PREVC Workflow Orchestrator
 *
 * Manages workflow progression, phase transitions, and role handoffs.
 */

import * as path from 'path';
import {
  PrevcStatus,
  PrevcPhase,
  PrevcRole,
  ProjectContext,
  ProjectScale,
  WorkflowSettings,
  PlanApproval,
  PhaseOrchestration,
  AgentSequenceStep,
  ToolGuidance,
} from './types';
import { PrevcStatusManager } from './status/statusManager';
import { detectProjectScale, getScaleRoute } from './scaling';
import { PREVC_PHASE_ORDER, getPhaseDefinition, PHASE_NAMES_EN } from './phases';
import { getRoleConfig } from './prevcConfig';
import { WorkflowGateChecker, GateCheckResult, getDefaultSettings } from './gates';
import { PlanLinker } from './plans/planLinker';
import { AgentOrchestrator, PHASE_TO_AGENTS } from './orchestration/agentOrchestrator';
import { createSkillRegistry } from './skills';

/**
 * Options for completing a phase
 */
export interface CompletePhaseOptions {
  /** Force advancement even if gates would block */
  force?: boolean;
}

/**
 * Options for initializing a workflow with settings
 */
export interface InitWorkflowOptions {
  name: string;
  scale: ProjectScale;
  /** Override default settings */
  settings?: Partial<WorkflowSettings>;
}

/**
 * PREVC Workflow Orchestrator
 *
 * Coordinates the execution of the PREVC workflow.
 */
export class PrevcOrchestrator {
  private repoPath: string;
  private contextPath: string;
  private statusManager: PrevcStatusManager;
  private gateChecker: WorkflowGateChecker;
  private planLinker: PlanLinker;

  constructor(contextPath: string) {
    this.repoPath = path.dirname(contextPath);
    this.contextPath = contextPath;
    this.statusManager = new PrevcStatusManager(contextPath);
    this.gateChecker = new WorkflowGateChecker();
    // Pass statusManager to PlanLinker for breadcrumb trail logging
    this.planLinker = new PlanLinker(path.dirname(contextPath), this.statusManager);
  }

  /**
   * Check if a workflow exists
   */
  async hasWorkflow(): Promise<boolean> {
    return this.statusManager.exists();
  }

  /**
   * Initialize a new workflow
   */
  async initWorkflow(context: ProjectContext): Promise<PrevcStatus> {
    const scale = detectProjectScale(context);
    const route = getScaleRoute(scale);

    const status = await this.statusManager.create({
      name: context.name,
      scale,
      phases: route.phases,
      roles: route.roles,
    });

    await this.planLinker.ensureWorkflowPlanIndex();

    return status;
  }

  /**
   * Initialize a workflow with explicit scale
   * @param archivePrevious - If undefined and workflow exists, throws error. If true, archives. If false, deletes.
   */
  async initWorkflowWithScale(
    name: string,
    scale: ProjectScale,
    settings?: Partial<WorkflowSettings>,
    archivePrevious?: boolean
  ): Promise<PrevcStatus> {
    // Check for existing workflow
    if (await this.hasWorkflow()) {
      if (archivePrevious === undefined) {
        throw new Error(
          'A workflow already exists. Use archivePrevious=true to archive or archivePrevious=false to delete the existing workflow.'
        );
      }
      await this.resetWorkflow(archivePrevious);
    }

    const route = getScaleRoute(scale);

    const status = await this.statusManager.create({
      name,
      scale,
      phases: route.phases,
      roles: route.roles,
    });

    await this.planLinker.ensureWorkflowPlanIndex();

    // Apply custom settings if provided
    if (settings) {
      await this.statusManager.setSettings(settings);
      return this.statusManager.load();
    }

    return status;
  }

  /**
   * Reset the current workflow
   * @param archive - If true, archives the current workflow. If false, deletes it.
   */
  async resetWorkflow(archive: boolean): Promise<void> {
    if (archive) {
      await this.archiveCurrentWorkflow();
      await this.planLinker.archivePlans();
    } else {
      await this.planLinker.clearAllPlans();
      await this.statusManager.remove();
    }
  }

  /**
   * Archive the current workflow to .context/workflow/archive/
   */
  private async archiveCurrentWorkflow(): Promise<void> {
    if (!(await this.statusManager.exists())) {
      return;
    }

    // Get current workflow name for archive folder
    let archiveName = 'workflow';
    try {
      const status = await this.statusManager.load();
      archiveName = status.project.name.replace(/[^a-zA-Z0-9-_]/g, '-');
    } catch {
      // Use default name if can't load status
    }
    await this.statusManager.archive(archiveName);
  }

  /**
   * Initialize a workflow with full options
   */
  async initWorkflowWithOptions(options: InitWorkflowOptions): Promise<PrevcStatus> {
    return this.initWorkflowWithScale(options.name, options.scale, options.settings);
  }

  /**
   * Get the current workflow status
   */
  async getStatus(): Promise<PrevcStatus> {
    return this.statusManager.load();
  }

  /**
   * Get the current phase
   */
  async getCurrentPhase(): Promise<PrevcPhase> {
    return this.statusManager.getCurrentPhase();
  }

  /**
   * Get the current active role
   */
  async getCurrentRole(): Promise<PrevcRole | null> {
    return this.statusManager.getActiveRole();
  }

  /**
   * Get the phase definition for the current phase
   */
  async getCurrentPhaseDefinition() {
    const phase = await this.getCurrentPhase();
    return getPhaseDefinition(phase);
  }

  /**
   * Perform a handoff from one agent to another
   * @param from - Agent name handing off (e.g., 'feature-developer')
   * @param to - Agent name receiving (e.g., 'test-writer')
   * @param artifacts - Array of output file paths
   */
  async handoff(
    from: string,
    to: string,
    artifacts: string[]
  ): Promise<void> {
    // Update the outgoing agent
    await this.statusManager.updateAgent(from, {
      status: 'completed',
      outputs: artifacts,
    });

    // Update the incoming agent
    await this.statusManager.updateAgent(to, {
      status: 'in_progress',
    });
  }

  /**
   * Get the next agent suggestion after a handoff
   */
  getNextAgentSuggestion(currentAgent: string): { agent: string; reason: string } | null {
    const orchestrator = new AgentOrchestrator();

    // Common handoff sequences
    const handoffSequences: Record<string, { agent: string; reason: string }> = {
      'feature-developer': { agent: 'test-writer', reason: 'Write tests for the new code' },
      'bug-fixer': { agent: 'test-writer', reason: 'Write regression tests' },
      'test-writer': { agent: 'code-reviewer', reason: 'Review implementation and tests' },
      'code-reviewer': { agent: 'documentation-writer', reason: 'Document the changes' },
      'backend-specialist': { agent: 'test-writer', reason: 'Write API tests' },
      'frontend-specialist': { agent: 'test-writer', reason: 'Write UI tests' },
      'refactoring-specialist': { agent: 'test-writer', reason: 'Verify refactored code' },
    };

    return handoffSequences[currentAgent] || null;
  }

  /**
   * Get orchestration guidance for a phase
   */
  async getPhaseOrchestration(phase: PrevcPhase): Promise<PhaseOrchestration> {
    const orchestrator = new AgentOrchestrator();
    const agents = PHASE_TO_AGENTS[phase] || [];
    const sequence = orchestrator.getAgentHandoffSequence([phase]);

    const suggestedSequence: AgentSequenceStep[] = sequence.map((agent) => ({
      agent,
      task: this.getAgentDefaultTask(agent),
    }));

    const startWith = agents.length > 0 ? agents[0] : 'feature-developer';
    const instruction = this.buildOrchestrationInstruction(phase, startWith);
    const skillRegistry = createSkillRegistry(this.repoPath);
    const skills = await skillRegistry.getSkillsForPhase(phase);
    const recommendedSkills = skills.map((skill) => ({
      slug: skill.slug,
      name: skill.metadata.name,
      description: skill.metadata.description,
      path: skill.path,
      isBuiltIn: skill.isBuiltIn,
    }));

    // Build tool guidance for explicit orchestration
    const toolGuidance = this.buildToolGuidance(phase, startWith);

    // Build step-by-step orchestration instructions
    const orchestrationSteps = this.buildOrchestrationSteps(phase, sequence);

    return {
      recommendedAgents: agents,
      suggestedSequence,
      startWith,
      instruction,
      recommendedSkills,
      toolGuidance,
      orchestrationSteps,
    };
  }

  /**
   * Get default task description for an agent
   */
  private getAgentDefaultTask(agent: string): string {
    const taskMap: Record<string, string> = {
      'feature-developer': 'Implement core functionality',
      'bug-fixer': 'Fix identified issues',
      'test-writer': 'Write tests for new code',
      'code-reviewer': 'Review implementation',
      'documentation-writer': 'Document the changes',
      'backend-specialist': 'Implement server-side logic',
      'frontend-specialist': 'Build user interface',
      'database-specialist': 'Design and optimize database',
      'architect-specialist': 'Design system architecture',
      'security-auditor': 'Audit for security vulnerabilities',
      'performance-optimizer': 'Optimize performance',
      'refactoring-specialist': 'Improve code structure',
      'devops-specialist': 'Configure deployment pipeline',
      'mobile-specialist': 'Develop mobile features',
    };

    return taskMap[agent] || 'Execute assigned tasks';
  }

  /**
   * Build tool guidance with concrete MCP tool call examples
   */
  private buildToolGuidance(phase: PrevcPhase, startAgent: string): ToolGuidance {
    return {
      discoverExample: `agent({ action: "orchestrate", phase: "${phase}" })`,
      sequenceExample: `agent({ action: "getSequence", phases: ["${phase}"] })`,
      handoffExample: `workflow-manage({ action: "handoff", from: "${startAgent}", to: "<next-agent>", artifacts: ["output.md"] })`,
    };
  }

  /**
   * Build step-by-step orchestration instructions with tool calls
   */
  private buildOrchestrationSteps(phase: PrevcPhase, agents: string[]): string[] {
    const phaseName = PHASE_NAMES_EN[phase];
    const startAgent = agents[0] || 'feature-developer';
    const nextAgent = agents[1] || '<next-agent>';

    return [
      `1. Discover agents for ${phaseName} phase: agent({ action: "orchestrate", phase: "${phase}" })`,
      `2. Review recommended sequence: agent({ action: "getSequence", phases: ["${phase}"] })`,
      `3. Begin with ${startAgent} agent - follow playbook at .context/agents/${startAgent}.md`,
      `4. Execute handoffs: workflow-manage({ action: "handoff", from: "${startAgent}", to: "${nextAgent}", artifacts: ["output.md"] })`,
      `5. Leverage skills: skill({ action: "getForPhase", phase: "${phase}" })`,
    ];
  }

  /**
   * Build orchestration instruction for a phase
   */
  private buildOrchestrationInstruction(phase: PrevcPhase, startAgent: string): string {
    const phaseName = PHASE_NAMES_EN[phase];

    return `ORCHESTRATION GUIDE for ${phaseName} phase:\n\n` +
      `1. START: Activate ${startAgent} agent\n` +
      `   - Review agent playbook: .context/agents/${startAgent}.md\n` +
      `   - Understand responsibilities and outputs\n\n` +
      `2. DISCOVER: Find all agents for this phase\n` +
      `   - Call: agent({ action: "orchestrate", phase: "${phase}" })\n` +
      `   - Review: Recommended agents and their roles\n\n` +
      `3. SEQUENCE: Plan agent handoff order\n` +
      `   - Call: agent({ action: "getSequence", phases: ["${phase}"] })\n` +
      `   - Follow: Suggested sequence for optimal workflow\n\n` +
      `4. EXECUTE: Perform work and handoffs\n` +
      `   - Work: Complete tasks as ${startAgent}\n` +
      `   - Handoff: workflow-manage({ action: "handoff", from: "${startAgent}", to: "<next-agent>", artifacts: [...] })\n` +
      `   - Repeat: Continue through sequence until phase complete\n\n` +
      `5. ADVANCE: Move to next phase\n` +
      `   - Call: workflow-advance({ outputs: [...] })\n` +
      `   - Review: Next phase orchestration guidance`;
  }

  /**
   * Complete the current phase and advance to the next
   */
  async completePhase(
    outputs?: string[],
    options: CompletePhaseOptions = {}
  ): Promise<PrevcPhase | null> {
    const status = await this.getStatus();
    const currentPhase = status.project.current_phase;
    const nextPhase = await this.getNextPhase();

    // Check gates before advancing (unless force is true)
    if (nextPhase) {
      this.gateChecker.enforceGates(status, {
        force: options.force,
        nextPhase,
      });
    }

    const advancedPhase = await this.statusManager.completePhaseTransition(outputs);

    // Auto-sync linked plan markdown with execution progress
    if (status.project.plan) {
      try {
        await this.planLinker.syncPlanMarkdown(status.project.plan);
      } catch {
        // Silent fail - plan sync is non-critical
      }
    }

    return advancedPhase;
  }

  /**
   * Check gates for the current phase transition
   */
  async checkGates(): Promise<GateCheckResult> {
    const status = await this.getStatus();
    return this.gateChecker.checkGates(status);
  }

  /**
   * Set workflow settings
   */
  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    return this.statusManager.setSettings(settings);
  }

  /**
   * Get workflow settings
   */
  async getSettings(): Promise<WorkflowSettings> {
    return this.statusManager.getSettings();
  }

  /**
   * Mark that a plan has been created/linked
   */
  async markPlanCreated(planSlug: string): Promise<void> {
    return this.statusManager.markPlanCreated(planSlug);
  }

  /**
   * Approve the plan
   */
  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    return this.statusManager.approvePlan(approver, notes);
  }

  /**
   * Get approval status
   */
  async getApproval(): Promise<PlanApproval | undefined> {
    return this.statusManager.getApproval();
  }

  /**
   * Advance to the next phase
   */
  async advanceToNextPhase(): Promise<PrevcPhase | null> {
    const nextPhase = await this.getNextPhase();
    if (nextPhase) {
      await this.statusManager.transitionToPhase(nextPhase);
    }
    return nextPhase;
  }

  /**
   * Get the next phase that should be executed
   */
  async getNextPhase(): Promise<PrevcPhase | null> {
    return this.statusManager.getNextPhase();
  }

  /**
   * Check if the workflow is complete
   */
  async isComplete(): Promise<boolean> {
    return this.statusManager.isComplete();
  }

  /**
   * Get recommended next actions for the current state
   */
  async getRecommendedActions(): Promise<string[]> {
    const status = await this.getStatus();
    const currentPhase = status.project.current_phase;
    const phaseDefinition = getPhaseDefinition(currentPhase);
    const actions: string[] = [];

    // Suggest phase-specific actions
    actions.push(
      `Complete ${phaseDefinition.name} phase tasks`
    );

    // Suggest role-specific actions
    for (const role of phaseDefinition.roles) {
      const roleConfig = getRoleConfig(role);
      if (roleConfig) {
        actions.push(...roleConfig.responsibilities.slice(0, 2));
      }
    }

    // Suggest output creation
    if (phaseDefinition.outputs.length > 0) {
      actions.push(
        `Create outputs: ${phaseDefinition.outputs.join(', ')}`
      );
    }

    return actions;
  }

  /**
   * Get a summary of the current workflow state
   */
  async getSummary(): Promise<WorkflowSummary> {
    const status = await this.getStatus();
    const isComplete = await this.isComplete();

    // Count completed phases
    let completedPhases = 0;
    let totalPhases = 0;

    for (const phase of PREVC_PHASE_ORDER) {
      if (status.phases[phase].status !== 'skipped') {
        totalPhases++;
        if (status.phases[phase].status === 'completed') {
          completedPhases++;
        }
      }
    }

    return {
      name: status.project.name,
      scale: status.project.scale,
      currentPhase: status.project.current_phase,
      progress: {
        completed: completedPhases,
        total: totalPhases,
        percentage: Math.round((completedPhases / totalPhases) * 100),
      },
      isComplete,
      startedAt: status.project.started,
    };
  }

  /**
   * Update the current task description
   */
  async updateCurrentTask(task: string): Promise<void> {
    const currentPhase = await this.getCurrentPhase();
    const activeRole = await this.getCurrentRole();

    await this.statusManager.updatePhase(currentPhase, {
      current_task: task,
      role: activeRole || undefined,
    });
  }

  /**
   * Start a specific role in the current phase
   */
  async startRole(role: PrevcRole): Promise<void> {
    const currentPhase = await this.getCurrentPhase();

    await this.statusManager.updateRole(role, {
      status: 'in_progress',
      phase: currentPhase,
    });

    await this.statusManager.updatePhase(currentPhase, {
      role,
    });
  }

  /**
   * Complete a role's work in the current phase
   */
  async completeRole(role: PrevcRole, outputs: string[]): Promise<void> {
    await this.statusManager.updateRole(role, {
      status: 'completed',
      outputs,
      last_active: new Date().toISOString(),
    });
  }
}

/**
 * Workflow summary for display
 */
export interface WorkflowSummary {
  name: string;
  scale: ProjectScale | keyof typeof ProjectScale;
  currentPhase: PrevcPhase;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  isComplete: boolean;
  startedAt: string;
}
