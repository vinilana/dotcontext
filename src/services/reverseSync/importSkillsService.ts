/**
 * Import Skills Service
 *
 * Imports skills from AI tool directories to .context/skills/
 * Follows the pattern of ImportAgentsService with merge strategy support.
 */

import * as path from 'path';
import * as fs from 'fs-extra';

import { colors, symbols, typography } from '../../utils/theme';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import type {
  ImportSkillsCommandFlags,
  ImportSkillsOptions,
  SkillFileInfo,
  MergeStrategy,
  ImportMetadata,
  ReverseSyncServiceDependencies,
  ImportAction,
} from './types';
import { SkillsDetector } from './skillsDetector';
import { VERSION } from '../../version';

export interface ImportSkillsResult {
  targetPath: string;
  filesCreated: number;
  filesSkipped: number;
  filesMerged: number;
  filesRenamed: number;
  filesFailed: number;
  errors: Array<{ file: string; error: string }>;
  importedFiles: Array<{
    sourcePath: string;
    targetPath: string;
    action: ImportAction;
  }>;
}

export class ImportSkillsService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;
  private readonly detector: SkillsDetector;

  constructor(dependencies: ReverseSyncServiceDependencies) {
    this.ui = dependencies.ui;
    this.t = dependencies.t;
    this.version = dependencies.version;
    this.detector = new SkillsDetector();
  }

  async run(
    rawOptions: ImportSkillsCommandFlags,
    repoPath: string = process.cwd()
  ): Promise<ImportSkillsResult> {
    const options = await this.resolveOptions(rawOptions, repoPath);

    // Detect skills
    let detectionResult;
    if (options.autoDetect && options.sourcePaths.length === 0) {
      this.ui.startSpinner('Detecting skills from AI tool directories...');
      detectionResult = await this.detector.detectSkills(repoPath, true);
      this.ui.stopSpinner();
    } else if (options.sourcePaths.length > 0) {
      this.ui.startSpinner('Scanning specified paths for skills...');
      detectionResult = await this.detector.detectFromPaths(options.sourcePaths, repoPath);
      this.ui.stopSpinner();
    } else {
      detectionResult = { files: [], sources: [] };
    }

    if (detectionResult.files.length === 0) {
      this.ui.displayWarning('No skills found in AI tool directories');
      return this.createEmptyResult(options.targetPath);
    }

    this.ui.displayInfo(
      'Skills found',
      `${detectionResult.files.length} skill(s) detected`
    );

    if (options.verbose) {
      detectionResult.files.forEach((file) => {
        console.log(
          `  ${colors.secondaryDim(symbols.pointer)} ${colors.primary(file.relativePath)}`
        );
      });
    }

    // Import files
    const result = await this.importFiles(detectionResult.files, options);

    this.displaySummary(result, options.dryRun);

    return result;
  }

  /**
   * Import skills with specific files (used by orchestrator)
   */
  async importSkillFiles(
    files: SkillFileInfo[],
    options: ImportSkillsOptions
  ): Promise<ImportSkillsResult> {
    return this.importFiles(files, options);
  }

  private async resolveOptions(
    rawOptions: ImportSkillsCommandFlags,
    repoPath: string
  ): Promise<ImportSkillsOptions> {
    const targetPath = rawOptions.target
      ? path.resolve(rawOptions.target)
      : path.resolve(repoPath, '.context/skills');

    const sourcePaths = rawOptions.source || [];
    const autoDetect = rawOptions.autoDetect !== false;

    return {
      sourcePaths,
      targetPath,
      force: Boolean(rawOptions.force),
      dryRun: Boolean(rawOptions.dryRun),
      verbose: Boolean(rawOptions.verbose),
      autoDetect,
      mergeStrategy: rawOptions.mergeStrategy || 'skip',
      addMetadata: rawOptions.metadata !== false,
    };
  }

  private async importFiles(
    files: SkillFileInfo[],
    options: ImportSkillsOptions
  ): Promise<ImportSkillsResult> {
    const result: ImportSkillsResult = {
      targetPath: options.targetPath,
      filesCreated: 0,
      filesSkipped: 0,
      filesMerged: 0,
      filesRenamed: 0,
      filesFailed: 0,
      errors: [],
      importedFiles: [],
    };

    if (!options.dryRun) {
      await fs.ensureDir(options.targetPath);
    }

    this.ui.startSpinner(`Importing skills to ${options.targetPath}...`);

    for (const file of files) {
      try {
        const importResult = await this.importSingleSkill(file, options);

        result.importedFiles.push({
          sourcePath: file.sourcePath,
          targetPath: importResult.targetPath,
          action: importResult.action,
        });

        switch (importResult.action) {
          case 'created':
          case 'overwritten':
            result.filesCreated++;
            break;
          case 'skipped':
            result.filesSkipped++;
            break;
          case 'merged':
            result.filesMerged++;
            break;
          case 'renamed':
            result.filesRenamed++;
            break;
          case 'failed':
            result.filesFailed++;
            result.errors.push({
              file: file.filename,
              error: importResult.error || 'Unknown error',
            });
            break;
        }

        if (options.verbose) {
          this.logImportAction(file, importResult);
        }
      } catch (error) {
        result.filesFailed++;
        result.errors.push({
          file: file.filename,
          error: error instanceof Error ? error.message : String(error),
        });

        if (options.verbose) {
          console.log(
            `  ${colors.error(symbols.error)} ${file.filename}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    this.ui.updateSpinner(
      `Imported ${result.filesCreated} skill(s) to ${options.targetPath}`,
      'success'
    );
    this.ui.stopSpinner();

    return result;
  }

  private async importSingleSkill(
    skill: SkillFileInfo,
    options: ImportSkillsOptions
  ): Promise<{ action: ImportAction; targetPath: string; error?: string }> {
    // Determine target path - preserve skill directory structure
    // e.g., .claude/skills/commit-message/SKILL.md -> .context/skills/commit-message/SKILL.md
    const targetDir = path.join(options.targetPath, skill.slug);
    const targetFile = path.join(targetDir, skill.filename);

    const exists = await fs.pathExists(targetFile);

    // Handle existing files based on merge strategy
    if (exists) {
      if (options.force || options.mergeStrategy === 'overwrite') {
        // Overwrite strategy
        if (!options.dryRun) {
          await fs.ensureDir(targetDir);
          const content = await this.prepareContent(skill, options);
          await fs.writeFile(targetFile, content);
        }
        return { action: 'overwritten', targetPath: targetFile };
      }

      if (options.mergeStrategy === 'skip') {
        return { action: 'skipped', targetPath: targetFile };
      }

      if (options.mergeStrategy === 'merge') {
        if (!options.dryRun) {
          await this.mergeContent(skill, targetFile, options);
        }
        return { action: 'merged', targetPath: targetFile };
      }

      if (options.mergeStrategy === 'rename') {
        const renamedPath = await this.getRenamedPath(targetFile, skill.sourceTool);
        if (!options.dryRun) {
          await fs.ensureDir(path.dirname(renamedPath));
          const content = await this.prepareContent(skill, options);
          await fs.writeFile(renamedPath, content);
        }
        return { action: 'renamed', targetPath: renamedPath };
      }
    }

    // Create new file
    if (!options.dryRun) {
      await fs.ensureDir(targetDir);
      const content = await this.prepareContent(skill, options);
      await fs.writeFile(targetFile, content);
    }

    return { action: 'created', targetPath: targetFile };
  }

  private async prepareContent(
    skill: SkillFileInfo,
    options: ImportSkillsOptions
  ): Promise<string> {
    const originalContent = await fs.readFile(skill.sourcePath, 'utf-8');

    if (!options.addMetadata) {
      return originalContent;
    }

    // Add import metadata as frontmatter
    return this.addImportMetadata(originalContent, skill);
  }

  private addImportMetadata(content: string, skill: SkillFileInfo): string {
    const metadata: ImportMetadata = {
      source_tool: skill.sourceTool,
      source_path: skill.relativePath,
      imported_at: new Date().toISOString(),
      ai_context_version: VERSION,
    };

    // Check if content already has frontmatter
    const lines = content.split('\n');
    const hasFrontmatter = lines[0]?.trim() === '---';

    if (hasFrontmatter) {
      // Find end of existing frontmatter
      const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
      if (endIndex > 0) {
        // Insert our metadata into existing frontmatter
        const existingFrontmatter = lines.slice(1, endIndex);
        const body = lines.slice(endIndex + 1).join('\n');

        const newFrontmatter = [
          '---',
          ...existingFrontmatter,
          `source_tool: ${metadata.source_tool}`,
          `source_path: ${metadata.source_path}`,
          `imported_at: ${metadata.imported_at}`,
          `ai_context_version: ${metadata.ai_context_version}`,
          '---',
        ];

        return newFrontmatter.join('\n') + '\n' + body;
      }
    }

    // Add new frontmatter
    const frontmatter = [
      '---',
      `source_tool: ${metadata.source_tool}`,
      `source_path: ${metadata.source_path}`,
      `imported_at: ${metadata.imported_at}`,
      `ai_context_version: ${metadata.ai_context_version}`,
      '---',
      '',
    ];

    return frontmatter.join('\n') + content;
  }

  private async mergeContent(
    skill: SkillFileInfo,
    existingPath: string,
    options: ImportSkillsOptions
  ): Promise<void> {
    const existingContent = await fs.readFile(existingPath, 'utf-8');
    const newContent = await this.prepareContent(skill, options);

    if (existingContent.includes(newContent)) {
      return;
    }

    const separator = [
      '',
      '---',
      `<!-- Imported from ${skill.sourceTool} on ${new Date().toISOString()} -->`,
      '',
    ].join('\n');

    const mergedContent = existingContent + separator + newContent;

    await fs.writeFile(existingPath, mergedContent);
  }

  private async getRenamedPath(originalPath: string, sourceTool: string): Promise<string> {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);

    // Try {name}-{tool}.md
    let newPath = path.join(dir, `${baseName}-${sourceTool}${ext}`);
    if (!(await fs.pathExists(newPath))) {
      return newPath;
    }

    // Try {name}-{tool}-{n}.md
    let counter = 2;
    while (await fs.pathExists(newPath)) {
      newPath = path.join(dir, `${baseName}-${sourceTool}-${counter}${ext}`);
      counter++;
      if (counter > 100) {
        throw new Error('Could not find unique filename');
      }
    }

    return newPath;
  }

  private logImportAction(
    skill: SkillFileInfo,
    result: { action: ImportAction; targetPath: string }
  ): void {
    const actionSymbols: Record<ImportAction, string> = {
      created: colors.success(symbols.success),
      overwritten: colors.warning('↻'),
      skipped: colors.secondaryDim('○'),
      merged: colors.accent('⊕'),
      renamed: colors.accent('→'),
      failed: colors.error(symbols.error),
    };

    const actionLabels: Record<ImportAction, string> = {
      created: 'Created',
      overwritten: 'Overwritten',
      skipped: 'Skipped',
      merged: 'Merged',
      renamed: 'Renamed',
      failed: 'Failed',
    };

    console.log(
      `  ${actionSymbols[result.action]} ${colors.secondaryDim(actionLabels[result.action])}: ${colors.primary(result.targetPath)}`
    );
  }

  private displaySummary(result: ImportSkillsResult, dryRun: boolean): void {
    console.log('');
    console.log(typography.separator());
    console.log(typography.header('Skills Import Summary'));
    console.log('');

    const status =
      result.filesFailed > 0 ? colors.error(symbols.error) : colors.success(symbols.success);

    console.log(`${status} ${colors.primary(result.targetPath)}`);

    const counts: string[] = [];
    if (result.filesCreated > 0) counts.push(`Created: ${result.filesCreated}`);
    if (result.filesSkipped > 0) counts.push(`Skipped: ${result.filesSkipped}`);
    if (result.filesMerged > 0) counts.push(`Merged: ${result.filesMerged}`);
    if (result.filesRenamed > 0) counts.push(`Renamed: ${result.filesRenamed}`);
    if (result.filesFailed > 0) counts.push(`Failed: ${result.filesFailed}`);

    console.log(`    ${colors.secondary(counts.join(', '))}`);

    if (result.errors.length > 0) {
      result.errors.forEach((err) => {
        console.log(
          `    ${colors.error(symbols.error)} ${colors.secondaryDim(`${err.file} - ${err.error}`)}`
        );
      });
    }

    console.log('');
    if (dryRun) {
      console.log(typography.warning('DRY RUN - No changes were made'));
    }
    console.log('');
  }

  private createEmptyResult(targetPath: string): ImportSkillsResult {
    return {
      targetPath,
      filesCreated: 0,
      filesSkipped: 0,
      filesMerged: 0,
      filesRenamed: 0,
      filesFailed: 0,
      errors: [],
      importedFiles: [],
    };
  }
}
