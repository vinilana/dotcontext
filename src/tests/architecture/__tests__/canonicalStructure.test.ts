import { MCPInstallService } from '../../../cli/services';
import { handleContext } from '../../../mcp/gateway';
import { AIContextMCPServer } from '../../../mcp/server';
import { HarnessAdapterRuntime } from '../../../harness/application/actions';
import { WorkflowService } from '../../../harness/application/workflow';
import { PREVC_PHASES } from '../../../harness/domain/workflow';
import { HarnessRuntimeStateService } from '../../../harness/adapters/out/runtimeState';
import { SemanticContextBuilder } from '../../../harness/adapters/out/semantic';
import { getContextRootPath } from '../../../shared/context';
import { TOOL_REGISTRY } from '../../../shared/registry';
import { createCodexHookAdapter } from '../../../integrations/codex';

describe('canonical architecture structure', () => {
  it('exposes canonical inbound, core, outbound, and integration barrels', () => {
    expect(MCPInstallService).toBeDefined();
    expect(handleContext).toBeDefined();
    expect(AIContextMCPServer).toBeDefined();
    expect(HarnessAdapterRuntime).toBeDefined();
    expect(WorkflowService).toBeDefined();
    expect(PREVC_PHASES).toBeDefined();
    expect(HarnessRuntimeStateService).toBeDefined();
    expect(SemanticContextBuilder).toBeDefined();
    expect(getContextRootPath).toBeDefined();
    expect(TOOL_REGISTRY.length).toBeGreaterThan(0);
    expect(createCodexHookAdapter).toBeDefined();
  });
});
