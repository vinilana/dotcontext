import {
  AIContextMCPServer,
  startMCPServer,
  handleExplore,
  handleContext,
  handlePlan,
  handleAgent,
  handleSkill,
  handleHarness,
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowGuide,
  handleWorkflowAdvance,
  handleWorkflowManage,
} from '..';

describe('MCP boundary exports', () => {
  it('exposes MCP transport and gateway handlers', () => {
    expect(AIContextMCPServer).toBeDefined();
    expect(startMCPServer).toBeDefined();
    expect(handleExplore).toBeDefined();
    expect(handleContext).toBeDefined();
    expect(handlePlan).toBeDefined();
    expect(handleAgent).toBeDefined();
    expect(handleSkill).toBeDefined();
    expect(handleHarness).toBeDefined();
    expect(handleWorkflowInit).toBeDefined();
    expect(handleWorkflowStatus).toBeDefined();
    expect(handleWorkflowGuide).toBeDefined();
    expect(handleWorkflowAdvance).toBeDefined();
    expect(handleWorkflowManage).toBeDefined();
  });
});
