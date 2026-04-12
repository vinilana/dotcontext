/**
 * Context Export Service
 *
 * Unified export of docs, agents, and skills to AI tool directories.
 * Orchestrates ExportRulesService, SyncService, and SkillExportService.
 */

import * as path from 'path';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
} from '../shared';
import { ExportRulesService } from './exportRulesService';
import { SkillExportService } from './skillExportService';
import { SyncService } from '../sync';
import type { PresetName, SyncRunResult } from '../sync/types';

export type ContextExportServiceDependencies = BaseDependencies;

export interface ContextExportOptions {
  /** Target preset (e.g., 'claude', 'cursor', 'all') */
  preset?: string;
  /** Skip docs export */
  skipDocs?: boolean;
  /** Skip agents export */
  skipAgents?: boolean;
  /** Skip skills export */
  skipSkills?: boolean;
  /** Index mode for docs: 'readme' exports only README.md files, 'all' exports all matching files */
  docsIndexMode?: 'readme' | 'all';
  /** Sync mode for agents: 'symlink' (default) or 'markdown' */
  agentMode?: 'symlink' | 'markdown';
  /** Include built-in skills */
  includeBuiltInSkills?: boolean;
  /** Force overwrite existing files */
  force?: boolean;
  /** Preview changes without writing */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export interface ContextExportResult extends OperationResult {
  docsExported: number;
  agentsExported: number;
  skillsExported: number;
  targets: string[];
}

export class ContextExportService {
  constructor(private deps: ContextExportServiceDependencies) {}

  /**
   * Run unified export operation
   */
  async run(repoPath: string, options: ContextExportOptions = {}): Promise<ContextExportResult> {
    const absolutePath = path.resolve(repoPath);
    const fs = await import('fs-extra');

    const result: ContextExportResult = {
      ...createEmptyResult(),
      docsExported: 0,
      agentsExported: 0,
      skillsExported: 0,
      targets: [],
    };

    const preset = options.preset || 'all';
    const errors: Array<{ type: string; error: string }> = [];

    // Export docs - only if .context/docs exists
    const docsPath = path.join(absolutePath, '.context/docs');
    if (!options.skipDocs && await fs.pathExists(docsPath)) {
      try {
        this.deps.ui.startSpinner('Exporting docs...');
        const docsService = new ExportRulesService(this.deps);
        const docsResult = await docsService.run(absolutePath, {
          preset,
          indexMode: options.docsIndexMode || 'readme',
          force: options.force,
          dryRun: options.dryRun,
          verbose: options.verbose,
        });
        result.docsExported = docsResult.filesCreated;
        result.targets.push(...docsResult.targets);
        this.deps.ui.stopSpinner();
      } catch (error) {
        errors.push({ type: 'docs', error: error instanceof Error ? error.message : String(error) });
        this.deps.ui.stopSpinner();
      }
    } else if (!options.skipDocs) {
      // Docs directory doesn't exist - skip silently
    }

    // Export agents - only if .context/agents exists
    const agentsPath = path.join(absolutePath, '.context/agents');
    if (!options.skipAgents && await fs.pathExists(agentsPath)) {
      try {
        this.deps.ui.startSpinner('Exporting agents...');
        const syncService = new SyncService(this.deps);
        const syncResult: SyncRunResult = await syncService.run({
          source: agentsPath,
          preset: preset as PresetName,
          mode: options.agentMode || 'symlink',
          force: options.force || false,
          dryRun: options.dryRun || false,
          verbose: options.verbose || false,
        });
        result.agentsExported = syncResult.filesCreated;
        result.targets.push(...syncResult.targets.map((target) => target.targetPath));
        this.deps.ui.stopSpinner();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes('sourceMissing') && !errorMsg.includes('no agents')) {
          errors.push({ type: 'agents', error: errorMsg });
        }
        this.deps.ui.stopSpinner();
      }
    } else if (!options.skipAgents) {
      // Agents directory doesn't exist - skip silently
    }

    // Export skills - only if .context/skills exists
    const skillsPath = path.join(absolutePath, '.context/skills');
    if (!options.skipSkills && await fs.pathExists(skillsPath)) {
      try {
        this.deps.ui.startSpinner('Exporting skills...');
        const skillsService = new SkillExportService(this.deps);
        const skillsResult = await skillsService.run(absolutePath, {
          preset,
          includeBuiltIn: options.includeBuiltInSkills,
          force: options.force,
          dryRun: options.dryRun,
          verbose: options.verbose,
        });
        result.skillsExported = skillsResult.filesCreated;
        result.targets.push(...skillsResult.targets);
        this.deps.ui.stopSpinner();
      } catch (error) {
        errors.push({ type: 'skills', error: error instanceof Error ? error.message : String(error) });
        this.deps.ui.stopSpinner();
      }
    } else if (!options.skipSkills) {
      // Skills directory doesn't exist - skip silently
    }

    // Update error count
    result.filesFailed = errors.length;
    for (const err of errors) {
      result.errors.push({ file: err.type, error: err.error });
    }

    // Calculate total created
    result.filesCreated = result.docsExported + result.agentsExported + result.skillsExported;

    // Display summary
    if (!options.dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        `Context exported: ${result.docsExported} docs, ${result.agentsExported} agents, ${result.skillsExported} skills`
      );
    }

    return result;
  }
}
