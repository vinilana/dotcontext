import {
  WorkflowService,
  HarnessAgentsService,
  HarnessPlansService,
  HarnessContextService,
  HarnessSkillsService,
  HarnessRuntimeStateService,
  HarnessSensorsService,
  HarnessTaskContractsService,
  HarnessExecutionService,
  HarnessReplayService,
  HarnessDatasetService,
  HarnessPolicyService,
  getScaleName,
  PHASE_NAMES_PT,
  ROLE_DISPLAY_NAMES,
} from './index';

describe('Harness boundary exports', () => {
  it('exposes runtime and orchestration services', () => {
    expect(WorkflowService).toBeDefined();
    expect(HarnessAgentsService).toBeDefined();
    expect(HarnessPlansService).toBeDefined();
    expect(HarnessContextService).toBeDefined();
    expect(HarnessSkillsService).toBeDefined();
    expect(HarnessRuntimeStateService).toBeDefined();
    expect(HarnessSensorsService).toBeDefined();
    expect(HarnessTaskContractsService).toBeDefined();
    expect(HarnessExecutionService).toBeDefined();
    expect(HarnessReplayService).toBeDefined();
    expect(HarnessDatasetService).toBeDefined();
    expect(HarnessPolicyService).toBeDefined();
    expect(getScaleName).toBeDefined();
    expect(PHASE_NAMES_PT).toBeDefined();
    expect(ROLE_DISPLAY_NAMES).toBeDefined();
  });
});
