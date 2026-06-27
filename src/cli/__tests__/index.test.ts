import {
  MCPInstallService,
  SyncService,
  ImportRulesService,
  ImportAgentsService,
  ExportRulesService,
  ReportService,
  QuickSyncService,
  ReverseQuickSyncService,
  HookDoctorService,
  getRecommendedHookTargets,
  buildHookInstallCommand,
  StateDetector,
} from '..';

describe('CLI boundary exports', () => {
  it('exposes operator-facing services', () => {
    expect(MCPInstallService).toBeDefined();
    expect(SyncService).toBeDefined();
    expect(ImportRulesService).toBeDefined();
    expect(ImportAgentsService).toBeDefined();
    expect(ExportRulesService).toBeDefined();
    expect(ReportService).toBeDefined();
    expect(QuickSyncService).toBeDefined();
    expect(ReverseQuickSyncService).toBeDefined();
    expect(HookDoctorService).toBeDefined();
    expect(getRecommendedHookTargets).toBeDefined();
    expect(buildHookInstallCommand).toBeDefined();
    expect(StateDetector).toBeDefined();
  });
});
