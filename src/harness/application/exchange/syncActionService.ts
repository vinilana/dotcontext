import * as path from 'path';

import { VERSION } from '../../../version';
import { ContextExportService, ExportRulesService } from './export';
import { ImportAgentsService, ImportRulesService } from './import';
import { ImportSkillsService, ReverseQuickSyncService } from './reverseSync';
import { minimalUI, mockTranslate } from '../../../shared';
import { SyncService } from './sync';
import type { PresetName } from './sync/types';

export type HarnessSyncAction =
  | 'exportRules'
  | 'exportDocs'
  | 'exportAgents'
  | 'exportContext'
  | 'exportSkills'
  | 'reverseSync'
  | 'importDocs'
  | 'importAgents'
  | 'importSkills';

export interface HarnessSyncActionInput {
  action: HarnessSyncAction;
  preset?: string;
  force?: boolean;
  dryRun?: boolean;
  indexMode?: 'readme' | 'all';
  mode?: 'symlink' | 'markdown';
  skipDocs?: boolean;
  skipAgents?: boolean;
  skipSkills?: boolean;
  skipRules?: boolean;
  docsIndexMode?: 'readme' | 'all';
  agentMode?: 'symlink' | 'markdown';
  includeBuiltInSkills?: boolean;
  mergeStrategy?: 'skip' | 'overwrite' | 'merge' | 'rename';
  autoDetect?: boolean;
  addMetadata?: boolean;
  repoPath?: string;
  includeBuiltIn?: boolean;
}

export type HarnessSyncActionResult = Record<string, unknown>;

export interface HarnessSyncActionServiceOptions {
  repoPath: string;
}

function serviceDependencies() {
  return {
    ui: minimalUI as any,
    t: mockTranslate,
    version: VERSION,
  };
}

export class HarnessSyncActionService {
  constructor(private readonly options: HarnessSyncActionServiceOptions) {}

  async execute(params: HarnessSyncActionInput): Promise<HarnessSyncActionResult> {
    const repoPath = params.repoPath || this.options.repoPath || process.cwd();

    switch (params.action) {
      case 'exportRules': {
        const exportService = new ExportRulesService(serviceDependencies());
        const result = await exportService.run(repoPath, {
          preset: params.preset,
          force: params.force,
          dryRun: params.dryRun,
        });

        return {
          success: true,
          filesCreated: result.filesCreated,
          filesSkipped: result.filesSkipped,
          filesFailed: result.filesFailed,
          targets: result.targets,
          errors: result.errors,
          dryRun: params.dryRun || false,
        };
      }
      case 'exportDocs': {
        const exportService = new ExportRulesService(serviceDependencies());
        const result = await exportService.run(repoPath, {
          preset: params.preset,
          indexMode: params.indexMode,
          force: params.force,
          dryRun: params.dryRun,
        });

        return {
          success: true,
          filesCreated: result.filesCreated,
          filesSkipped: result.filesSkipped,
          filesFailed: result.filesFailed,
          targets: result.targets,
          errors: result.errors,
          indexMode: params.indexMode || 'readme',
          dryRun: params.dryRun || false,
        };
      }
      case 'exportAgents': {
        const syncService = new SyncService(serviceDependencies());

        await syncService.run({
          source: path.join(repoPath, '.context', 'agents'),
          preset: (params.preset || 'all') as PresetName,
          mode: (params.mode || 'symlink') as 'symlink' | 'markdown',
          force: params.force || false,
          dryRun: params.dryRun || false,
        });

        return {
          success: true,
          preset: params.preset,
          mode: params.mode,
          dryRun: params.dryRun || false,
          message: `Agents exported to ${params.preset} targets`,
        };
      }
      case 'exportContext': {
        const contextExportService = new ContextExportService(serviceDependencies());
        const result = await contextExportService.run(repoPath, {
          preset: params.preset,
          skipDocs: params.skipDocs,
          skipAgents: params.skipAgents,
          skipSkills: params.skipSkills,
          docsIndexMode: params.docsIndexMode,
          agentMode: params.agentMode,
          includeBuiltInSkills: params.includeBuiltInSkills,
          force: params.force,
          dryRun: params.dryRun,
        });

        return {
          success: true,
          docsExported: result.docsExported,
          agentsExported: result.agentsExported,
          skillsExported: result.skillsExported,
          targets: result.targets,
          errors: result.errors,
          dryRun: params.dryRun || false,
        };
      }
      case 'exportSkills': {
        const { SkillExportService } = require('./export/skillExportService');
        const exportService = new SkillExportService({
          ui: minimalUI,
          t: mockTranslate,
          version: VERSION,
        });
        const result = await exportService.run(repoPath, {
          preset: params.preset,
          includeBuiltIn: params.includeBuiltIn,
          force: params.force,
        });

        return {
          success: result.filesCreated > 0,
          targets: result.targets,
          skillsExported: result.skillsExported,
          filesCreated: result.filesCreated,
          filesSkipped: result.filesSkipped,
        };
      }
      case 'reverseSync': {
        const service = new ReverseQuickSyncService(serviceDependencies());
        const result = await service.run(repoPath, {
          skipRules: params.skipRules || false,
          skipAgents: params.skipAgents || false,
          skipSkills: params.skipSkills || false,
          mergeStrategy: params.mergeStrategy || 'skip',
          dryRun: params.dryRun || false,
          force: params.force || false,
          metadata: params.addMetadata !== false,
        });

        return {
          success: true,
          ...result,
        };
      }
      case 'importDocs': {
        const service = new ImportRulesService(serviceDependencies());
        await service.run({
          autoDetect: params.autoDetect !== false,
          force: params.force || false,
          dryRun: params.dryRun || false,
        }, repoPath);

        return {
          success: true,
          message: 'Docs imported successfully',
          dryRun: params.dryRun || false,
        };
      }
      case 'importAgents': {
        const service = new ImportAgentsService(serviceDependencies());
        await service.run({
          autoDetect: params.autoDetect !== false,
          force: params.force || false,
          dryRun: params.dryRun || false,
        }, repoPath);

        return {
          success: true,
          message: 'Agents imported successfully',
          dryRun: params.dryRun || false,
        };
      }
      case 'importSkills': {
        const service = new ImportSkillsService(serviceDependencies());
        const result = await service.run({
          autoDetect: params.autoDetect !== false,
          mergeStrategy: params.mergeStrategy || 'skip',
          force: params.force || false,
          dryRun: params.dryRun || false,
        }, repoPath);

        return {
          success: true,
          skillsImported: result.filesCreated,
          filesSkipped: result.filesSkipped,
          filesFailed: result.filesFailed,
          dryRun: params.dryRun || false,
        };
      }
      default:
        throw new Error(`Unknown sync action: ${(params as HarnessSyncActionInput).action}`);
    }
  }
}
