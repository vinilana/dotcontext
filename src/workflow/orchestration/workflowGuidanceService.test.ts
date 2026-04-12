import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { ProjectScale, type PrevcStatus } from '../types';
import { WorkflowGuidanceService } from './workflowGuidanceService';

describe('WorkflowGuidanceService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-guidance-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('builds phase orchestration guidance outside the runtime orchestrator', async () => {
    const service = new WorkflowGuidanceService(tempDir);

    const guidance = await service.getPhaseOrchestration('P');

    expect(guidance.recommendedAgents.length).toBeGreaterThan(0);
    expect(guidance.startWith).toBe(guidance.recommendedAgents[0]);
    expect(guidance.suggestedSequence.length).toBeGreaterThan(0);
    expect(guidance.toolGuidance?.discoverExample).toContain('phase: "P"');
    expect(guidance.orchestrationSteps?.[0]).toContain('Discover agents for Planning phase');
    expect(guidance.instruction).toContain('ORCHESTRATION GUIDE for Planning phase');
  });

  it('derives recommended actions from the canonical phase and role definitions', () => {
    const service = new WorkflowGuidanceService(tempDir);
    const status: PrevcStatus = {
      project: {
        name: 'guided-project',
        scale: ProjectScale.MEDIUM,
        started: new Date().toISOString(),
        current_phase: 'V',
      },
      phases: {
        P: { status: 'completed' },
        R: { status: 'completed' },
        E: { status: 'completed' },
        V: { status: 'in_progress' },
        C: { status: 'pending' },
      },
      agents: {},
      roles: {},
    };

    const actions = service.getRecommendedActions(status);

    expect(actions).toContain('Complete Validation phase tasks');
    expect(actions).toContain('Create and execute integration tests');
    expect(actions).toContain('Review code and architecture');
    expect(actions).toContain('Create outputs: test-report, review-comments, approval');
  });
});
