import { AgentSequenceStep, PrevcPhase } from '../types';
import { PHASE_NAMES_EN, getPhaseDefinition } from '../phases';
import { getRoleConfig } from '../prevcConfig';

export interface PhaseOrchestrationGuidanceInput {
  phase: PrevcPhase;
  startAgent: string;
  agents: string[];
  sequence: AgentSequenceStep[];
}

const NEXT_AGENT_SUGGESTIONS: Record<string, { agent: string; reason: string }> = {
  'feature-developer': { agent: 'test-writer', reason: 'Write tests for the new code' },
  'bug-fixer': { agent: 'test-writer', reason: 'Write regression tests' },
  'test-writer': { agent: 'code-reviewer', reason: 'Review implementation and tests' },
  'code-reviewer': { agent: 'documentation-writer', reason: 'Document the changes' },
  'backend-specialist': { agent: 'test-writer', reason: 'Write API tests' },
  'frontend-specialist': { agent: 'test-writer', reason: 'Write UI tests' },
  'refactoring-specialist': { agent: 'test-writer', reason: 'Verify refactored code' },
};

function buildToolGuidance(phase: PrevcPhase, startAgent: string) {
  return {
    discoverExample: `agent({ action: "orchestrate", phase: "${phase}" })`,
    sequenceExample: `agent({ action: "getSequence", phases: ["${phase}"] })`,
    handoffExample: `workflow-manage({ action: "handoff", from: "${startAgent}", to: "<next-agent>", artifacts: ["output.md"] })`,
  };
}

function buildOrchestrationSteps(phase: PrevcPhase, agents: string[]): string[] {
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

function buildOrchestrationInstruction(phase: PrevcPhase, startAgent: string): string {
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

export function buildPhaseOrchestrationGuidance(
  input: PhaseOrchestrationGuidanceInput
): {
  instruction: string;
  toolGuidance: ReturnType<typeof buildToolGuidance>;
  orchestrationSteps: string[];
} {
  return {
    instruction: buildOrchestrationInstruction(input.phase, input.startAgent),
    toolGuidance: buildToolGuidance(input.phase, input.startAgent),
    orchestrationSteps: buildOrchestrationSteps(input.phase, input.agents),
  };
}

export function buildRecommendedActions(phase: PrevcPhase): string[] {
  const phaseDefinition = getPhaseDefinition(phase);
  const actions: string[] = [];

  actions.push(`Complete ${phaseDefinition.name} phase tasks`);

  for (const role of phaseDefinition.roles) {
    const roleConfig = getRoleConfig(role);
    if (roleConfig) {
      actions.push(...roleConfig.responsibilities.slice(0, 2));
    }
  }

  if (phaseDefinition.outputs.length > 0) {
    actions.push(`Create outputs: ${phaseDefinition.outputs.join(', ')}`);
  }

  return actions;
}

export function buildNextAgentSuggestion(currentAgent: string): { agent: string; reason: string } | null {
  return NEXT_AGENT_SUGGESTIONS[currentAgent] || null;
}
