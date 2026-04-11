/**
 * Context Gateway Handler
 *
 * Handles context scaffolding and semantic context operations.
 * Replaces: checkScaffolding, initializeContext, fillScaffolding, listFilesToFill,
 *           fillSingleFile, getCodebaseMap, buildSemanticContext, scaffoldPlan
 *
 * New actions: searchQA, generateQA, getFlow, detectPatterns
 */

import { SemanticContextBuilder } from '../../semantic/contextBuilder';
import { HarnessContextService } from '../../harness';

import type { ContextParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse, createTextResponse, createScaffoldResponse } from './response';

export interface ContextOptions {
  repoPath: string;
  contextBuilder: SemanticContextBuilder;
}

/**
 * Handles context gateway actions for scaffolding and semantic context.
 */
export async function handleContext(
  params: ContextParams,
  options: ContextOptions
): Promise<MCPToolResponse> {
   const repoPath = params.repoPath || options.repoPath;
   const service = new HarnessContextService({
     repoPath: options.repoPath,
     contextBuilder: options.contextBuilder,
   });

  try {
    switch (params.action) {
      case 'check': {
        return createJsonResponse(await service.check(repoPath));
      }

      case 'init': {
        const { result, scaffold } = await service.init({
          repoPath,
          type: params.type,
          outputDir: params.outputDir,
          semantic: params.semantic,
          include: params.include,
          exclude: params.exclude,
          autoFill: params.autoFill,
          skipContentGeneration: params.skipContentGeneration,
        });
        return createScaffoldResponse(result, scaffold || {});
      }

      case 'fill': {
        return createJsonResponse(await service.fill({
          repoPath,
          outputDir: params.outputDir,
          target: params.target,
          offset: params.offset,
          limit: params.limit,
        }));
      }

      case 'fillSingle': {
        return createJsonResponse(await service.fillSingle({
          repoPath,
          filePath: params.filePath!,
        }));
      }

      case 'listToFill': {
        return createJsonResponse(await service.listToFill({
          repoPath,
          outputDir: params.outputDir,
          target: params.target,
        }));
      }

      case 'getMap': {
        return createJsonResponse(await service.getMap({
          repoPath,
          section: params.section,
        }));
      }

      case 'buildSemantic': {
        return createTextResponse(await service.buildSemantic({
          repoPath,
          contextType: params.contextType,
          targetFile: params.targetFile,
          options: params.options,
        }));
      }

      case 'scaffoldPlan': {
        const { result, scaffold } = await service.scaffoldPlan({
          planName: params.planName!,
          repoPath,
          outputDir: params.outputDir,
          title: params.title,
          summary: params.summary,
          semantic: params.semantic,
          autoFill: params.autoFill,
        });
        return scaffold
          ? createScaffoldResponse(result, scaffold)
          : createJsonResponse(result);
      }

      case 'searchQA': {
        if (!params.query) {
          return createErrorResponse('Query is required for searchQA action');
        }
        return createJsonResponse(await service.searchQA({
          repoPath,
          query: params.query,
          options: params.options,
        }));
      }

      case 'generateQA': {
        return createJsonResponse(await service.generateQA({
          repoPath,
          options: params.options,
        }));
      }

      case 'getFlow': {
        if (!params.entryFile) {
          return createErrorResponse('entryFile is required for getFlow action');
        }
        return createJsonResponse(await service.getFlow({
          repoPath,
          entryFile: params.entryFile,
          entryFunction: params.entryFunction,
          options: params.options,
        }));
      }

      case 'detectPatterns': {
        return createJsonResponse(await service.detectPatterns({
          repoPath,
          options: params.options,
        }));
      }

      default:
        return createErrorResponse(`Unknown context action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
