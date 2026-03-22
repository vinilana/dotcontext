import { tool } from 'ai';
import * as path from 'path';
import * as fs from 'fs-extra';
import { z } from 'zod';
import { SemanticContextBuilder, type ContextFormat } from '../../semantic/contextBuilder';
import { DEFAULT_EXCLUDE_PATTERNS } from '../../semantic/types';
import { getScaffoldStructure, serializeStructureForAI } from '../../../generators/shared/scaffoldStructures';

// Shared context builder instance for efficiency
let sharedContextBuilder: SemanticContextBuilder | null = null;
let cachedRepoPath: string | null = null;
const cachedContexts = new Map<string, string>();

type FillContextType = Extract<ContextFormat, 'documentation' | 'plan' | 'compact'>;

/**
 * Get or build semantic context for a repository.
 * Caches the context for efficiency when processing multiple files.
 * Loads user-provided exclude patterns from .context/config.json if available.
 */
export async function getOrBuildContext(
  repoPath: string,
  contextType: FillContextType = 'documentation'
): Promise<string> {
  const resolvedRepoPath = path.resolve(repoPath);
  const cacheKey = `${resolvedRepoPath}:${contextType}`;

  if (cachedRepoPath && cachedRepoPath !== resolvedRepoPath) {
    if (sharedContextBuilder) {
      await sharedContextBuilder.shutdown();
      sharedContextBuilder = null;
    }
    cachedContexts.clear();
  }

  if (cachedContexts.has(cacheKey)) {
    return cachedContexts.get(cacheKey)!;
  }

  // Cleanup existing builder before creating new one (cache invalidation)
  // This releases LSP language server child processes
  // Load user-provided exclude patterns persisted during init
  let options: { exclude?: string[] } = {};
  const configPath = path.join(resolvedRepoPath, '.context', 'config.json');
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

  if (!sharedContextBuilder) {
    sharedContextBuilder = new SemanticContextBuilder(options);
    cachedRepoPath = resolvedRepoPath;
  }

  let context: string;
  switch (contextType) {
    case 'plan':
      context = await sharedContextBuilder.buildPlanContext(resolvedRepoPath);
      break;
    case 'compact':
      context = await sharedContextBuilder.buildCompactContext(resolvedRepoPath);
      break;
    case 'documentation':
    default:
      context = await sharedContextBuilder.buildDocumentationContext(resolvedRepoPath);
      break;
  }

  cachedContexts.set(cacheKey, context);
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
  }
  cachedRepoPath = null;
  cachedContexts.clear();
}

function getContextResource(contextType: FillContextType): string {
  return `context://codebase/${contextType}`;
}

function getContextTypeForTarget(target: 'docs' | 'agents' | 'plans' | 'all'): FillContextType {
  if (target === 'plans') {
    return 'plan';
  }
  if (target === 'all') {
    return 'compact';
  }
  return 'documentation';
}

function getContextTypeForFile(fileType: 'doc' | 'agent' | 'plan' | 'skill'): FillContextType {
  if (fileType === 'plan') {
    return 'plan';
  }
  if (fileType === 'skill') {
    return 'compact';
  }
  return 'documentation';
}

// ============================================
// listFilesToFill - Lightweight file listing
// ============================================

const ListFilesToFillInputSchema = z.object({
  repoPath: z.string().describe('Repository path'),
  outputDir: z.string().optional().describe('Scaffold directory (default: ./.context)'),
  target: z.enum(['docs', 'agents', 'plans', 'all']).default('all').optional()
    .describe('Which scaffolding to list')
});

export type ListFilesToFillInput = z.infer<typeof ListFilesToFillInputSchema>;

interface FileToFillInfo {
  path: string;
  relativePath: string;
  type: 'doc' | 'agent' | 'plan';
}

export const listFilesToFillTool = tool({
  description: `List scaffold files that need to be filled. Returns only file paths (no content) for efficient listing.
Use this first to get the list, then call fillSingleFile for each file.`,
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

      const files: FileToFillInfo[] = [];

      // Collect docs
      if (target === 'all' || target === 'docs') {
        const docsDir = path.join(outputDir, 'docs');
        if (await fs.pathExists(docsDir)) {
          const docFiles = await fs.readdir(docsDir);
          for (const file of docFiles) {
            if (!file.endsWith('.md')) continue;
            files.push({
              path: path.join(docsDir, file),
              relativePath: `docs/${file}`,
              type: 'doc'
            });
          }
        }
      }

      // Collect agents
      if (target === 'all' || target === 'agents') {
        const agentsDir = path.join(outputDir, 'agents');
        if (await fs.pathExists(agentsDir)) {
          const agentFiles = await fs.readdir(agentsDir);
          for (const file of agentFiles) {
            if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
            files.push({
              path: path.join(agentsDir, file),
              relativePath: `agents/${file}`,
              type: 'agent'
            });
          }
        }
      }

      // Collect plans
      if (target === 'all' || target === 'plans') {
        const plansDir = path.join(outputDir, 'plans');
        if (await fs.pathExists(plansDir)) {
          const planFiles = await fs.readdir(plansDir);
          for (const file of planFiles) {
            if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
            files.push({
              path: path.join(plansDir, file),
              relativePath: `plans/${file}`,
              type: 'plan'
            });
          }
        }
      }

      return {
        success: true,
        files,
        totalCount: files.length,
        instructions: `Found ${files.length} files to fill. Call fillSingleFile for each file path to get suggested content.`
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
  filePath: z.string().describe('Absolute path to the scaffold file to fill'),
  includeContext: z.boolean().default(true).optional()
    .describe('Include semantic context inline for compatibility clients')
});

export type FillSingleFileInput = z.infer<typeof FillSingleFileInputSchema>;

export const fillSingleFileTool = tool({
  description: `Get context and structure guidance for filling a single scaffold file.
Returns semantic context (codebase analysis) and scaffold structure (section guidance, tone, audience).
Use this context to generate intelligent content, then write the content to the file path.`,
  inputSchema: FillSingleFileInputSchema,
  execute: async (input: FillSingleFileInput) => {
    const { repoPath, filePath, includeContext = true } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const resolvedFilePath = path.resolve(filePath);

    try {
      if (!await fs.pathExists(resolvedFilePath)) {
        return {
          success: false,
          error: `File does not exist: ${resolvedFilePath}`
        };
      }

      // Read current content (frontmatter/template)
      const currentContent = await fs.readFile(resolvedFilePath, 'utf-8');
      const fileName = path.basename(resolvedFilePath);
      const parentDir = path.basename(path.dirname(resolvedFilePath));

      // Determine file type and get scaffold structure
      let fileType: 'doc' | 'agent' | 'plan' | 'skill';
      let documentName: string;

      if (parentDir === 'docs') {
        fileType = 'doc';
        documentName = path.basename(fileName, '.md');
      } else if (parentDir === 'agents') {
        fileType = 'agent';
        documentName = path.basename(fileName, '.md');
      } else if (parentDir === 'plans') {
        fileType = 'plan';
        documentName = path.basename(fileName, '.md');
      } else if (parentDir === 'skills') {
        fileType = 'skill';
        documentName = path.basename(fileName, '.md');
      } else {
        fileType = 'doc';
        documentName = path.basename(fileName, '.md');
      }

      // Get scaffold structure and serialize for AI
      const structure = getScaffoldStructure(documentName);
      const scaffoldStructure = structure ? serializeStructureForAI(structure) : undefined;
      const contextType = getContextTypeForFile(fileType);
      const semanticContext = includeContext
        ? await getOrBuildContext(resolvedRepoPath, contextType)
        : undefined;
      const contextResource = getContextResource(contextType);

      return {
        success: true,
        filePath: resolvedFilePath,
        fileType,
        documentName,
        contextType,
        contextResource,
        contextIncluded: includeContext,
        // Context for intelligent generation
        semanticContext,
        scaffoldStructure,
        currentContent,
        // Instructions for the calling LLM
        instructions: includeContext
          ? `Generate content for "${fileName}" using the provided semanticContext and scaffoldStructure. Follow the structure's tone (${structure?.tone || 'technical'}), audience (${structure?.audience || 'developers'}), and section guidance. Write the complete markdown content (without frontmatter) to ${resolvedFilePath}.`
          : `Use ${contextResource} (${contextType}) plus scaffoldStructure to generate content for "${fileName}", then write the completed markdown to ${resolvedFilePath}.`
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
  target: z.enum(['docs', 'agents', 'plans', 'all']).default('all').optional()
    .describe('Which scaffolding to fill'),
  offset: z.number().optional().describe('Skip first N files (for pagination)'),
  limit: z.number().optional().describe('Max files to return (default: 3, use 0 for all)'),
  includeContext: z.boolean().default(false).optional()
    .describe('Include shared semantic context inline for compatibility clients')
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
Supports pagination with offset/limit. Generate content for each file using its scaffoldStructure, then write to its path.`,
  inputSchema: FillScaffoldingInputSchema,
  execute: async (input: FillScaffoldingInput) => {
    const {
      repoPath,
      outputDir: customOutputDir,
      target = 'all',
      offset = 0,
      limit = 3,
      includeContext = false,
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

      const contextType = getContextTypeForTarget(target);
      const contextResource = getContextResource(contextType);
      const semanticContext = includeContext
        ? await getOrBuildContext(resolvedRepoPath, contextType)
        : undefined;

      // Collect all file paths first
      const allFiles: { path: string; relativePath: string; type: 'doc' | 'agent' | 'plan' }[] = [];

      // Collect docs
      if (target === 'all' || target === 'docs') {
        const docsDir = path.join(outputDir, 'docs');
        if (await fs.pathExists(docsDir)) {
          const docFiles = await fs.readdir(docsDir);
          for (const file of docFiles) {
            if (!file.endsWith('.md')) continue;
            allFiles.push({
              path: path.join(docsDir, file),
              relativePath: path.relative(outputDir, path.join(docsDir, file)),
              type: 'doc'
            });
          }
        }
      }

      // Collect agents
      if (target === 'all' || target === 'agents') {
        const agentsDir = path.join(outputDir, 'agents');
        if (await fs.pathExists(agentsDir)) {
          const agentFiles = await fs.readdir(agentsDir);
          for (const file of agentFiles) {
            if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
            allFiles.push({
              path: path.join(agentsDir, file),
              relativePath: path.relative(outputDir, path.join(agentsDir, file)),
              type: 'agent'
            });
          }
        }
      }

      // Collect plans
      if (target === 'all' || target === 'plans') {
        const plansDir = path.join(outputDir, 'plans');
        if (await fs.pathExists(plansDir)) {
          const planFiles = await fs.readdir(plansDir);
          for (const file of planFiles) {
            if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
            allFiles.push({
              path: path.join(plansDir, file),
              relativePath: path.relative(outputDir, path.join(plansDir, file)),
              type: 'plan'
            });
          }
        }
      }

      const totalCount = allFiles.length;

      // Apply pagination (limit=0 means all files)
      const effectiveLimit = limit === 0 ? totalCount : limit;
      const paginatedFiles = allFiles.slice(offset, offset + effectiveLimit);

      // Build context info for paginated files
      const filesToFill: FileToFill[] = [];
      for (const fileInfo of paginatedFiles) {
        const currentContent = await fs.readFile(fileInfo.path, 'utf-8');
        const documentName = path.basename(fileInfo.path, '.md');

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
        contextType,
        contextResource,
        contextIncluded: includeContext,
        semanticContext,
        filesToFill,
        pagination: {
          offset,
          limit: effectiveLimit,
          returned: filesToFill.length,
          totalCount,
          hasMore
        },
        instructions: hasMore
          ? includeContext
            ? `Returned ${filesToFill.length} of ${totalCount} files. Generate content for each file using semanticContext + its scaffoldStructure. Call again with offset=${offset + paginatedFiles.length} to continue.`
            : `Returned ${filesToFill.length} of ${totalCount} files. Use ${contextResource} (${contextType}) plus each scaffoldStructure. Call again with offset=${offset + paginatedFiles.length} to continue.`
          : includeContext
            ? `All ${totalCount} files ready. Generate content for each file using semanticContext + its scaffoldStructure. Write each generated content to its file path.`
            : `All ${totalCount} files ready. Use ${contextResource} (${contextType}) plus each scaffoldStructure, then write the generated content to each file path.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});
