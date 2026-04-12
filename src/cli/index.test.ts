import {
  MCPInstallService,
  SyncService,
  ImportRulesService,
  ImportAgentsService,
  ExportRulesService,
  ReportService,
  QuickSyncService,
  ReverseQuickSyncService,
  StateDetector,
} from './index';

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
    expect(StateDetector).toBeDefined();
  });
});
