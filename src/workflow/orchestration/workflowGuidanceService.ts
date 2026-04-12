import {
  PhaseOrchestration,
  PrevcPhase,
  PrevcStatus,
} from '../types';
import { createSkillRegistry } from '../skills';
import { AgentOrchestrator, PHASE_TO_AGENTS } from './agentOrchestrator';
import {
  buildPhaseOrchestrationGuidance,
  buildRecommendedActions,
} from '../guidance/orchestrationGuidance';

/**
 * Presentation-oriented workflow guidance derived from canonical PREVC metadata.
 *
 * This keeps textual instructions and recommendations out of the runtime
 * orchestration layer so callers can evolve the UX surface independently.
 */
export class WorkflowGuidanceService {
  constructor(
    private readonly repoPath: string,
    private readonly orchestrator: AgentOrchestrator = new AgentOrchestrator()
  ) {}

  async getPhaseOrchestration(phase: PrevcPhase): Promise<PhaseOrchestration> {
    const agents = PHASE_TO_AGENTS[phase] || [];
    const sequence = this.orchestrator.getAgentHandoffSequence([phase]);

    const suggestedSequence = sequence.map((agent) => ({
      agent,
      task: this.getAgentDefaultTask(agent),
    }));

    const startWith = agents.length > 0 ? agents[0] : 'feature-developer';
    const skillRegistry = createSkillRegistry(this.repoPath);
    const skills = await skillRegistry.getSkillsForPhase(phase);
    const recommendedSkills = skills.map((skill) => ({
      slug: skill.slug,
      name: skill.metadata.name,
      description: skill.metadata.description,
      path: skill.path,
      isBuiltIn: skill.isBuiltIn,
    }));

    const { instruction, toolGuidance, orchestrationSteps } = buildPhaseOrchestrationGuidance({
      phase,
      startAgent: startWith,
      agents: sequence,
      sequence: suggestedSequence,
    });

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

  getRecommendedActions(status: PrevcStatus): string[] {
    return buildRecommendedActions(status.project.current_phase);
  }

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
}
