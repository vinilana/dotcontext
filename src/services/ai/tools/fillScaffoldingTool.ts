import { tool } from 'ai';
import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import { z } from 'zod';
import { SemanticContextBuilder } from '../../semantic/contextBuilder';
import { DEFAULT_EXCLUDE_PATTERNS } from '../../semantic/types';
import { getScaffoldStructure, serializeStructureForAI } from '../../../generators/shared/scaffoldStructures';
import { needsFill } from '../../../utils/frontMatter';

// Shared context builder instance for efficiency
let sharedContextBuilder: SemanticContextBuilder | null = null;
let cachedContext: { repoPath: string; context: string } | null = null;

type FillTarget = 'docs' | 'skills' | 'agents' | 'plans' | 'all';
type FillPhase = 'docs' | 'skills' | 'agents';

const REQUIRED_FILL_ORDER: FillPhase[] = ['docs', 'skills', 'agents'];

const FILE_TYPE_ORDER: Record<FileToFillInfo['type'], number> = {
  doc: 1,
  skill: 2,
  agent: 3,
  plan: 4,
};

function isTargetMatch(fileType: FileToFillInfo['type'], target: FillTarget): boolean {
  if (target === 'all') return true;
  if (target === 'docs') return fileType === 'doc';
  if (target === 'skills') return fileType === 'skill';
  if (target === 'agents') return fileType === 'agent';
  return fileType === 'plan';
}

function sortByFillOrder<T extends { type: FileToFillInfo['type']; relativePath: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const typeDiff = FILE_TYPE_ORDER[a.type] - FILE_TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

function buildPendingByPhase(files: FileToFillInfo[]): Record<FillPhase, number> {
  return {
    docs: files.filter((f) => f.type === 'doc').length,
    skills: files.filter((f) => f.type === 'skill').length,
    agents: files.filter((f) => f.type === 'agent').length,
  };
}

function getOrderWarning(
  target: FillTarget,
  pendingByPhase: Record<FillPhase, number>
): { warning?: string; nextRequiredPhase?: FillPhase } {
  if (target === 'all' || target === 'docs' || target === 'plans') {
    return {};
  }

  const phaseIndex = REQUIRED_FILL_ORDER.indexOf(target as FillPhase);
  if (phaseIndex <= 0) {
    return {};
  }

  for (let i = 0; i < phaseIndex; i++) {
    const phase = REQUIRED_FILL_ORDER[i];
    const pending = pendingByPhase[phase];
    if (pending > 0) {
      return {
        warning: `Fill order warning: ${pending} ${phase} file(s) are still unfilled. Required order is docs -> skills -> agents.`,
        nextRequiredPhase: phase,
      };
    }
  }

  return {};
}

/**
 * Get or build semantic context for a repository.
 * Caches the context for efficiency when processing multiple files.
 * Loads user-provided exclude patterns from .context/config.json if available.
 */
export async function getOrBuildContext(repoPath: string): Promise<string> {
  if (cachedContext && cachedContext.repoPath === repoPath) {
    return cachedContext.context;
  }

  // Cleanup existing builder before creating new one (cache invalidation)
  // This releases LSP language server child processes
  if (sharedContextBuilder) {
    await sharedContextBuilder.shutdown();
    sharedContextBuilder = null;
  }

  // Load user-provided exclude patterns persisted during init
  let options: { exclude?: string[] } = {};
  const configPath = path.join(repoPath, '.context', 'config.json');
  if (await fs.pathExists(configPath)) {
    try {
      const config = await fs.readJson(configPath);
      if (Array.isArray(config.exclude) && config.exclude.length > 0) {
        // Merge user excludes with defaults — the spread in SemanticContextBuilder
        // replaces rather than merges, so we combine them here
        options = { exclude: [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...config.exclude])] };
      }
    } catch {
      // Ignore config read errors — fall back to defaults
    }
  }

  sharedContextBuilder = new SemanticContextBuilder(options);
  const context = await sharedContextBuilder.buildDocumentationContext(repoPath);
  cachedContext = { repoPath, context };
  return context;
}

/**
 * Cleanup shared context builder resources.
 * Call this during server/process shutdown to release LSP processes.
 */
export async function cleanupSharedContext(): Promise<void> {
  if (sharedContextBuilder) {
    await sharedContextBuilder.shutdown();
    sharedContextBuilder = null;
    cachedContext = null;
  }
}

// ============================================
// listFilesToFill - Lightweight file listing
// ============================================

const ListFilesToFillInputSchema = z.object({
  repoPath: z.string().describe('Repository path'),
  outputDir: z.string().optional().describe('Scaffold directory (default: ./.context)'),
  target: z.enum(['docs', 'skills', 'agents', 'plans', 'all']).default('all').optional()
    .describe('Which scaffolding to list')
});

export type ListFilesToFillInput = z.infer<typeof ListFilesToFillInputSchema>;

interface FileToFillInfo {
  path: string;
  relativePath: string;
  type: 'doc' | 'skill' | 'agent' | 'plan';
}

async function collectAllPendingFiles(outputDir: string): Promise<FileToFillInfo[]> {
  const files: FileToFillInfo[] = [];

  const docsDir = path.join(outputDir, 'docs');
  if (await fs.pathExists(docsDir)) {
    const docFiles = await fs.readdir(docsDir);
    for (const file of docFiles) {
      if (!file.endsWith('.md')) continue;
      if (file.toLowerCase() === 'readme.md') continue;
      const filePath = path.join(docsDir, file);
      if (!await needsFill(filePath)) continue;
      files.push({
        path: filePath,
        relativePath: `docs/${file}`,
        type: 'doc'
      });
    }
  }

  const skillsDir = path.join(outputDir, 'skills');
  if (await fs.pathExists(skillsDir)) {
    const skillFiles = await glob('**/*.md', { cwd: skillsDir, absolute: true });
    for (const skillFile of skillFiles) {
      if (path.basename(skillFile).toLowerCase() === 'readme.md') continue;
      if (!await needsFill(skillFile)) continue;
      const skillRelativePath = path.relative(skillsDir, skillFile).replace(/\\/g, '/');
      files.push({
        path: skillFile,
        relativePath: `skills/${skillRelativePath}`,
        type: 'skill'
      });
    }
  }

  const agentsDir = path.join(outputDir, 'agents');
  if (await fs.pathExists(agentsDir)) {
    const agentFiles = await fs.readdir(agentsDir);
    for (const file of agentFiles) {
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
      const filePath = path.join(agentsDir, file);
      if (!await needsFill(filePath)) continue;
      files.push({
        path: filePath,
        relativePath: `agents/${file}`,
        type: 'agent'
      });
    }
  }

  const plansDir = path.join(outputDir, 'plans');
  if (await fs.pathExists(plansDir)) {
    const planFiles = await fs.readdir(plansDir);
    for (const file of planFiles) {
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
      const filePath = path.join(plansDir, file);
      if (!await needsFill(filePath)) continue;
      files.push({
        path: filePath,
        relativePath: `plans/${file}`,
        type: 'plan'
      });
    }
  }

  return sortByFillOrder(files);
}

export const listFilesToFillTool = tool({
  description: `List scaffold files that need to be filled. Returns only file paths (no content) for efficient listing.
Use this first to get the list, then call fillSingleFile for each file in order docs -> skills -> agents.`,
  inputSchema: ListFilesToFillInputSchema,
  execute: async (input: ListFilesToFillInput) => {
    const { repoPath, outputDir: customOutputDir, target = 'all' } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');

    try {
      if (!await fs.pathExists(outputDir)) {
        return {
          success: false,
          error: `Scaffold directory does not exist: ${outputDir}. Run initializeContext first.`
        };
      }

      const allPendingFiles = await collectAllPendingFiles(outputDir);
      const files = allPendingFiles.filter((file) => isTargetMatch(file.type, target));
      const pendingByPhase = buildPendingByPhase(allPendingFiles);
      const { warning, nextRequiredPhase } = getOrderWarning(target, pendingByPhase);
      const targetLabel = target === 'all' ? 'all requested' : target;
      const orderHint = 'Required fill order: docs -> skills -> agents.';

      return {
        success: true,
        files,
        totalCount: files.length,
        pendingByPhase,
        ...(warning && { warning, nextRequiredPhase }),
        instructions: `Found ${files.length} unfilled file(s) for ${targetLabel}. ${orderHint} Call fillSingleFile for each file path to get semantic context and scaffold guidance, then generate and write the content.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// ============================================
// fillSingleFile - Process one file at a time
// ============================================

const FillSingleFileInputSchema = z.object({
  repoPath: z.string().describe('Repository path'),
  filePath: z.string().describe('Absolute path to the scaffold file to fill')
});

export type FillSingleFileInput = z.infer<typeof FillSingleFileInputSchema>;

export const fillSingleFileTool = tool({
  description: `Get context and structure guidance for filling a single scaffold file.
Returns semantic context (codebase analysis) and scaffold structure (section guidance, tone, audience).
Use this context to generate intelligent content, then write the content to the file path. If the file is out of order, returns a warning.`,
  inputSchema: FillSingleFileInputSchema,
  execute: async (input: FillSingleFileInput) => {
    const { repoPath, filePath } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const resolvedFilePath = path.resolve(filePath);

    try {
      if (!await fs.pathExists(resolvedFilePath)) {
        return {
          success: false,
          error: `File does not exist: ${resolvedFilePath}`
        };
      }

      // Get or build semantic context (cached)
      const semanticContext = await getOrBuildContext(resolvedRepoPath);

      // Read current content (frontmatter/template)
      const currentContent = await fs.readFile(resolvedFilePath, 'utf-8');
      const fileName = path.basename(resolvedFilePath);
      const normalizedFilePath = resolvedFilePath.replace(/\\/g, '/');
      const outputDir = path.resolve(resolvedRepoPath, '.context');

      // Determine file type and get scaffold structure
      let fileType: 'doc' | 'agent' | 'plan' | 'skill';
      let documentName: string;

      if (normalizedFilePath.includes('/.context/docs/')) {
        fileType = 'doc';
        documentName = path.basename(fileName, '.md');
      } else if (normalizedFilePath.includes('/.context/agents/')) {
        fileType = 'agent';
        documentName = path.basename(fileName, '.md');
      } else if (normalizedFilePath.includes('/.context/plans/')) {
        fileType = 'plan';
        documentName = path.basename(fileName, '.md');
      } else if (normalizedFilePath.includes('/.context/skills/')) {
        fileType = 'skill';
        documentName = path.basename(path.dirname(resolvedFilePath));
      } else {
        fileType = 'doc';
        documentName = path.basename(fileName, '.md');
      }

      // Get scaffold structure and serialize for AI
      const structure = getScaffoldStructure(documentName);
      const scaffoldStructure = structure ? serializeStructureForAI(structure) : undefined;
      const allPendingFiles = await collectAllPendingFiles(outputDir);
      const pendingByPhase = buildPendingByPhase(allPendingFiles);
      const targetForWarning: FillTarget =
        fileType === 'doc' ? 'docs' :
        fileType === 'skill' ? 'skills' :
        fileType === 'agent' ? 'agents' : 'plans';
      const { warning, nextRequiredPhase } = getOrderWarning(targetForWarning, pendingByPhase);

      return {
        success: true,
        filePath: resolvedFilePath,
        fileType,
        documentName,
        pendingByPhase,
        ...(warning && { warning, nextRequiredPhase }),
        // Context for intelligent generation
        semanticContext,
        scaffoldStructure,
        currentContent,
        // Instructions for the calling LLM
        instructions: `Generate content for "${fileName}" using the provided semanticContext and scaffoldStructure. Follow the structure's tone (${structure?.tone || 'technical'}), audience (${structure?.audience || 'developers'}), and section guidance. Write the complete markdown content (without frontmatter) to ${resolvedFilePath}.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// ============================================
// fillScaffolding - Original tool with pagination
// ============================================

const FillScaffoldingInputSchema = z.object({
  repoPath: z.string().describe('Repository path'),
  outputDir: z.string().optional().describe('Scaffold directory (default: ./.context)'),
  target: z.enum(['docs', 'skills', 'agents', 'plans', 'all']).default('all').optional()
    .describe('Which scaffolding to fill'),
  offset: z.number().optional().describe('Skip first N files (for pagination)'),
  limit: z.number().optional().describe('Max files to return (default: 3, use 0 for all)')
});

export type FillScaffoldingInput = z.infer<typeof FillScaffoldingInputSchema>;

interface FileToFill {
  path: string;
  relativePath: string;
  type: 'doc' | 'agent' | 'plan' | 'skill';
  documentName: string;
  scaffoldStructure?: string;
  currentContent: string;
}

export const fillScaffoldingTool = tool({
  description: `Get context and structure guidance for filling multiple scaffold files.
Returns semantic context (shared) and scaffold structure per file for intelligent content generation.
Supports pagination with offset/limit. Generate content for each file using its scaffoldStructure, then write to its path in order docs -> skills -> agents.`,
  inputSchema: FillScaffoldingInputSchema,
  execute: async (input: FillScaffoldingInput) => {
    const {
      repoPath,
      outputDir: customOutputDir,
      target = 'all',
      offset = 0,
      limit = 3
    } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');

    try {
      // Validate paths exist
      if (!await fs.pathExists(resolvedRepoPath)) {
        return {
          success: false,
          error: `Repository path does not exist: ${resolvedRepoPath}`
        };
      }

      if (!await fs.pathExists(outputDir)) {
        return {
          success: false,
          error: `Scaffold directory does not exist: ${outputDir}. Run initializeContext first.`
        };
      }

      // Get or build semantic context (cached for efficiency)
      const semanticContext = await getOrBuildContext(resolvedRepoPath);

      const allPendingFiles = await collectAllPendingFiles(outputDir);
      const targetPendingFiles = allPendingFiles
        .filter((file) => isTargetMatch(file.type, target))
        .map((file) => ({
          ...file,
          relativePath: file.relativePath.replace(/\\/g, '/'),
        }));
      const pendingByPhase = buildPendingByPhase(allPendingFiles);
      const { warning, nextRequiredPhase } = getOrderWarning(target, pendingByPhase);
      const totalCount = targetPendingFiles.length;

      // Apply pagination (limit=0 means all files)
      const effectiveLimit = limit === 0 ? totalCount : limit;
      const paginatedFiles = targetPendingFiles.slice(offset, offset + effectiveLimit);

      // Build context info for paginated files
      const filesToFill: FileToFill[] = [];
      for (const fileInfo of paginatedFiles) {
        const currentContent = await fs.readFile(fileInfo.path, 'utf-8');
        const documentName = fileInfo.type === 'skill'
          ? path.basename(path.dirname(fileInfo.path))
          : path.basename(fileInfo.path, '.md');

        // Get scaffold structure for this file
        const structure = getScaffoldStructure(documentName);
        const scaffoldStructure = structure ? serializeStructureForAI(structure) : undefined;

        filesToFill.push({
          path: fileInfo.path,
          relativePath: fileInfo.relativePath,
          type: fileInfo.type,
          documentName,
          scaffoldStructure,
          currentContent
        });
      }

      const hasMore = offset + paginatedFiles.length < totalCount;

      return {
        success: true,
        // Shared semantic context for all files
        semanticContext,
        filesToFill,
        pendingByPhase,
        ...(warning && { warning, nextRequiredPhase }),
        pagination: {
          offset,
          limit: effectiveLimit,
          returned: filesToFill.length,
          totalCount,
          hasMore
        },
        instructions: hasMore
          ? `Returned ${filesToFill.length} of ${totalCount} unfilled file(s). Required fill order: docs -> skills -> agents. Generate content for each file using semanticContext + its scaffoldStructure. Call again with offset=${offset + paginatedFiles.length} to continue.`
          : `All ${totalCount} unfilled file(s) for this target are ready. Required fill order: docs -> skills -> agents. Generate content for each file using semanticContext + its scaffoldStructure. Write each generated content to its file path.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});
