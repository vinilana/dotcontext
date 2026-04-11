import {
  AIContextMCPServer,
  startMCPServer,
  handleExplore,
  handleContext,
  handlePlan,
  handleAgent,
  handleSkill,
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowAdvance,
  handleWorkflowManage,
} from './index';

describe('MCP boundary exports', () => {
  it('exposes MCP transport and gateway handlers', () => {
    expect(AIContextMCPServer).toBeDefined();
    expect(startMCPServer).toBeDefined();
    expect(handleExplore).toBeDefined();
    expect(handleContext).toBeDefined();
    expect(handlePlan).toBeDefined();
    expect(handleAgent).toBeDefined();
    expect(handleSkill).toBeDefined();
    expect(handleWorkflowInit).toBeDefined();
    expect(handleWorkflowStatus).toBeDefined();
    expect(handleWorkflowAdvance).toBeDefined();
    expect(handleWorkflowManage).toBeDefined();
  });
});
