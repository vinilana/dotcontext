/**
 * Explore Gateway Handler
 *
 * Handles file and code exploration operations.
 * Replaces: readFile, listFiles, analyzeSymbols, searchCode, getFileStructure
 */

import {
  readFileTool,
  listFilesTool,
  analyzeSymbolsTool,
  getFileStructureTool,
  searchCodeTool,
} from '../../harness/contextTools';

import type { ExploreParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import { toolContext } from './shared';

export interface ExploreOptions {
  repoPath: string;
}

/**
 * Handles explore gateway actions for file and code exploration.
 */
export async function handleExplore(
  params: ExploreParams,
  options: ExploreOptions
): Promise<MCPToolResponse> {
  try {
    switch (params.action) {
      case 'read': {
        const result = await readFileTool.execute!(
          { filePath: params.filePath!, encoding: params.encoding },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'list': {
        const result = await listFilesTool.execute!(
          {
            pattern: params.pattern!,
            cwd: params.cwd || options.repoPath,
            ignore: params.ignore
          },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'analyze': {
        const result = await analyzeSymbolsTool.execute!(
          { filePath: params.filePath!, symbolTypes: params.symbolTypes },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'search': {
        const result = await searchCodeTool.execute!(
          {
            pattern: params.pattern!,
            fileGlob: params.fileGlob,
            maxResults: params.maxResults || 50,
            cwd: params.cwd || options.repoPath
          } as any,
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'getStructure': {
        const result = await getFileStructureTool.execute!(
          {
            rootPath: params.rootPath || options.repoPath || '.',
            maxDepth: params.maxDepth ?? 3,
            includePatterns: params.includePatterns
          },
          toolContext
        );
        return createJsonResponse(result);
      }

      default:
        return createErrorResponse(`Unknown explore action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
