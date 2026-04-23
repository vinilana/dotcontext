import {
  buildNextAgentSuggestion,
  buildPhaseOrchestrationGuidance,
  buildRecommendedActions,
} from './orchestrationGuidance';

describe('workflow guidance helpers', () => {
  it('builds phase orchestration guidance without orchestrator internals', () => {
    const guidance = buildPhaseOrchestrationGuidance({
      phase: 'P',
      startAgent: 'architect-specialist',
      agents: ['architect-specialist', 'documentation-writer'],
      sequence: [
        { agent: 'architect-specialist', task: 'Design system architecture' },
        { agent: 'documentation-writer', task: 'Document the changes' },
      ],
    });

    expect(guidance.instruction).toContain('ORCHESTRATION GUIDE for Planning phase');
    expect(guidance.instruction).toContain('architect-specialist');
    expect(guidance.toolGuidance).toEqual({
      discoverExample: 'agent({ action: "orchestrate", phase: "P" })',
      sequenceExample: 'agent({ action: "getSequence", phases: ["P"] })',
      handoffExample: 'workflow-manage({ action: "handoff", from: "architect-specialist", to: "<next-agent>", artifacts: ["output.md"] })',
    });
    expect(guidance.orchestrationSteps).toEqual([
      '1. Discover agents for Planning phase: agent({ action: "orchestrate", phase: "P" })',
      '2. Review recommended sequence: agent({ action: "getSequence", phases: ["P"] })',
      '3. Begin with architect-specialist agent - follow playbook at .context/agents/architect-specialist.md',
      '4. Execute handoffs: workflow-manage({ action: "handoff", from: "architect-specialist", to: "documentation-writer", artifacts: ["output.md"] })',
      '5. Leverage skills: skill({ action: "getForPhase", phase: "P" })',
    ]);
  });

  it('derives recommended actions from the phase model', () => {
    expect(buildRecommendedActions('V')).toContain('Complete Validation phase tasks');
  });

  it('suggests the next agent for common handoffs', () => {
    expect(buildNextAgentSuggestion('feature-developer')).toEqual({
      agent: 'test-writer',
      reason: 'Write tests for the new code',
    });
  });
});
