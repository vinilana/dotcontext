/**
 * Skill Export Service
 *
 * Export skills from .context/skills to AI tool skill directories.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
  addError,
  ensureDirectory,
  pathExists,
  displayOperationSummary,
  getSkillsExportPresets,
} from '../shared';
import { createSkillRegistry, Skill, BUILT_IN_SKILLS, getBuiltInSkillTemplates, SKILL_TO_PHASES, wrapWithPortableFrontmatter } from '../../workflow/skills';

export type SkillExportServiceDependencies = BaseDependencies;

export interface SkillExportTarget {
  name: string;
  path: string;
  description: string;
}

export interface SkillExportOptions {
  targets?: string[];
  preset?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  /** Only export specific skills */
  skills?: string[];
  /** Include built-in skills even if not scaffolded */
  includeBuiltIn?: boolean;
}

export interface SkillExportResult extends OperationResult {
  targets: string[];
  skillsExported: string[];
}

/**
 * Build skill export presets from the unified tool registry
 */
function buildSkillExportPresets(): Record<string, SkillExportTarget[]> {
  const registryPresets = getSkillsExportPresets();
  const presets: Record<string, SkillExportTarget[]> = {};

  for (const [toolId, targets] of Object.entries(registryPresets)) {
    presets[toolId] = targets;
  }

  // Build 'all' preset
  presets.all = Object.entries(presets)
    .filter(([key]) => key !== 'all')
    .flatMap(([, targets]) => targets);

  return presets;
}

/**
 * Skill export presets for different AI tools (derived from tool registry)
 */
export const SKILL_EXPORT_PRESETS: Record<string, SkillExportTarget[]> = buildSkillExportPresets();

export class SkillExportService {
  constructor(private deps: SkillExportServiceDependencies) {}

  /**
   * Export skills to AI tool directories
   */
  async run(repoPath: string, options: SkillExportOptions = {}): Promise<SkillExportResult> {
    const absolutePath = path.resolve(repoPath);

    const result: SkillExportResult = {
      ...createEmptyResult(),
      targets: [],
      skillsExported: [],
    };

    // Determine targets
    const targets = this.resolveTargets(options);
    if (targets.length === 0) {
      this.deps.ui.displayError('No export targets specified');
      return result;
    }

    // Get skills to export
    const skills = await this.getSkillsToExport(absolutePath, options);
    if (skills.length === 0) {
      this.deps.ui.displayWarning('No skills found to export');
      return result;
    }

    // Export to each target
    for (const target of targets) {
      await this.exportToTarget(absolutePath, target, skills, options, result);
    }

    // Display summary
    if (!options.dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        `Exported ${result.skillsExported.length} skills to ${result.targets.length} targets`
      );
    }

    if (options.verbose) {
      displayOperationSummary(result, {
        dryRun: options.dryRun,
        labels: { created: 'Exported' },
      });
    }

    return result;
  }

  /**
   * Get skills to export
   */
  private async getSkillsToExport(repoPath: string, options: SkillExportOptions): Promise<Skill[]> {
    const fs = await import('fs-extra');
    const skillsPath = path.join(repoPath, '.context', 'skills');
    const skillsExist = await fs.pathExists(skillsPath);

    // If skills directory doesn't exist and includeBuiltIn is not enabled, return empty
    if (!skillsExist && !options.includeBuiltIn) {
      return [];
    }

    const registry = createSkillRegistry(repoPath);
    const discovered = await registry.discoverAll();

    let skills = discovered.all;

    // If includeBuiltIn, add any built-in skills that aren't scaffolded
    if (options.includeBuiltIn) {
      const templates = getBuiltInSkillTemplates();
      const existingSlugs = new Set(skills.map(s => s.slug));

      for (const skillType of BUILT_IN_SKILLS) {
        if (!existingSlugs.has(skillType)) {
          const template = templates[skillType];
          skills.push({
            slug: skillType,
            path: path.join(repoPath, '.context', 'skills', skillType, 'SKILL.md'),
            metadata: {
              name: skillType,
              description: template.description,
              phases: SKILL_TO_PHASES[skillType],
            },
            content: template.content,
            resources: [],
            isBuiltIn: true,
          });
        }
      }
    }

    // Filter by specific skills if provided
    if (options.skills?.length) {
      skills = skills.filter(s => options.skills!.includes(s.slug));
    }

    return skills;
  }

  /**
   * Export to a single target
   */
  private async exportToTarget(
    repoPath: string,
    target: SkillExportTarget,
    skills: Skill[],
    options: SkillExportOptions,
    result: SkillExportResult
  ): Promise<void> {
    const targetPath = path.join(repoPath, target.path);

    try {
      this.deps.ui.startSpinner(`Exporting skills to ${target.name}...`);

      if (options.dryRun) {
        this.deps.ui.updateSpinner(`[DRY-RUN] Would export to ${targetPath}`, 'success');
        result.filesSkipped++;
        this.deps.ui.stopSpinner();
        return;
      }

      // Create target directory
      await ensureDirectory(targetPath);

      // Export each skill
      for (const skill of skills) {
        await this.exportSkill(targetPath, skill, options, result);
      }

      result.targets.push(targetPath);
      this.deps.ui.updateSpinner(`Exported to ${targetPath}`, 'success');
    } catch (error) {
      addError(result, target.name, error);
      this.deps.ui.updateSpinner(`Failed to export to ${target.name}`, 'fail');
    } finally {
      this.deps.ui.stopSpinner();
    }
  }

  /**
   * Export a single skill to target directory
   */
  private async exportSkill(
    targetPath: string,
    skill: Skill,
    options: SkillExportOptions,
    result: SkillExportResult
  ): Promise<void> {
    const skillDir = path.join(targetPath, skill.slug);
    const skillFile = path.join(skillDir, 'SKILL.md');

    // Check if exists and force not set
    if (await pathExists(skillFile) && !options.force) {
      result.filesSkipped++;
      return;
    }

    // Create skill directory
    await ensureDirectory(skillDir);

    // Generate SKILL.md content
    const content = this.generateSkillContent(skill);
    await fs.writeFile(skillFile, content, 'utf-8');

    // Copy resources if any
    for (const resource of skill.resources) {
      const relativePath = path.relative(path.dirname(skill.path), resource);
      const destPath = path.join(skillDir, relativePath);
      await ensureDirectory(path.dirname(destPath));

      try {
        await fs.copy(resource, destPath);
      } catch {
        // Skip if resource can't be copied
      }
    }

    result.filesCreated++;
    if (!result.skillsExported.includes(skill.slug)) {
      result.skillsExported.push(skill.slug);
    }
  }

  /**
   * Generate SKILL.md content with frontmatter
   */
  private generateSkillContent(skill: Skill): string {
    const templates = getBuiltInSkillTemplates();
    const fallbackContent = skill.isBuiltIn ? templates[skill.slug as keyof typeof templates]?.content : undefined;
    const content = skill.content.trim() ? skill.content : fallbackContent || '';
    return wrapWithPortableFrontmatter(skill.slug, skill.metadata.description, content);
  }

  /**
   * Resolve export targets from options
   *
   * Supports three formats:
   * 1. Preset name via `preset` option (e.g., 'all', 'claude')
   * 2. Preset names in `targets` array (e.g., ['claude', 'gemini'])
   * 3. Direct paths in `targets` array (e.g., ['.custom/skills'])
   */
  private resolveTargets(options: SkillExportOptions): SkillExportTarget[] {
    if (options.preset) {
      const preset = SKILL_EXPORT_PRESETS[options.preset.toLowerCase()];
      if (preset) return preset;
    }

    if (options.targets?.length) {
      const resolved: SkillExportTarget[] = [];

      for (const t of options.targets) {
        // First check if target is a preset name
        const preset = SKILL_EXPORT_PRESETS[t.toLowerCase()];
        if (preset) {
          resolved.push(...preset);
        } else {
          // Treat as a direct path
          resolved.push({
            name: path.basename(t),
            path: t,
            description: 'Custom target',
          });
        }
      }

      return resolved;
    }

    // Default: export to all supported tools
    return SKILL_EXPORT_PRESETS.all;
  }

  /**
   * Get available presets
   */
  getAvailablePresets(): string[] {
    return Object.keys(SKILL_EXPORT_PRESETS);
  }
}
