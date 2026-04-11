export { SyncService } from './syncService';
export type {
  SyncMode,
  PresetName,
  TargetPreset,
  SyncCommandFlags,
  SyncServiceDependencies,
  SyncOptions,
  SyncResult,
  SyncRunResult,
  AgentFileInfo,
  HandlerOptions,
  HandlerResult
} from './types';
export { TARGET_PRESETS, resolvePresets, getPresetByPath, getAllPresetNames } from './presets';
export { createSymlinks, checkSymlinkSupport } from './symlinkHandler';
export { createMarkdownReferences } from './markdownReferenceHandler';
