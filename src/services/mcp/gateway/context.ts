/**
 * Context Gateway Handler
 *
 * Handles context scaffolding and semantic context operations.
 * Replaces: checkScaffolding, initializeContext, fillScaffolding, listFilesToFill,
 *           fillSingleFile, getCodebaseMap, buildSemanticContext, scaffoldPlan
 *
 * New actions: searchQA, generateQA, getFlow, detectPatterns
 */

import {
  checkScaffoldingTool,
  initializeContextTool,
  scaffoldPlanTool,
  fillScaffoldingTool,
  listFilesToFillTool,
  fillSingleFileTool,
  getCodebaseMapTool,
} from '../../ai/tools';
import { SemanticContextBuilder, type ContextFormat } from '../../semantic/contextBuilder';
import { CodebaseAnalyzer } from '../../semantic/codebaseAnalyzer';
import { QAService } from '../../qa';

import type { ContextParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse, createTextResponse, createScaffoldResponse } from './response';
import { toolContext } from './shared';

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

  try {
    switch (params.action) {
      case 'check': {
        const result = await checkScaffoldingTool.execute!(
          { repoPath },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'init': {
        const result = await initializeContextTool.execute!(
          {
            repoPath,
            type: params.type,
            outputDir: params.outputDir,
            semantic: params.semantic,
            include: params.include,
            exclude: params.exclude,
            autoFill: params.autoFill,
            skipContentGeneration: params.skipContentGeneration
          },
          toolContext
        );

        // Extract pending files from result for scaffold response
        const pendingWrites = (result as Record<string, unknown>).pendingWrites as Array<{ filePath: string }> | undefined;
        if (pendingWrites && pendingWrites.length > 0) {
          const enhancementPrompt = `SCAFFOLDING CREATED - CONTENT REQUIRED

NEXT ACTIONS REQUIRED:
1. Fill scaffold files with content using fillSingle for each pending file
   Required order: docs -> skills -> agents
2. Initialize a PREVC workflow to enable structured development

WORKFLOW:
Step 1: Use context with action "fillSingle" for each file in pendingFiles array, following docs -> skills -> agents
Step 2: Use workflow-init with name parameter to create workflow (creates .context/workflow/)

Skip workflow-init ONLY if making trivial changes (typos, single-line edits).`;

          return createScaffoldResponse(result as Record<string, unknown>, {
            filesGenerated: pendingWrites.length,
            pendingFiles: pendingWrites.map(p => p.filePath),
            enhancementPrompt,
            nextSteps: [
              'REQUIRED: Call context with action "fillSingle" for each file in pendingFiles, in order docs -> skills -> agents',
              'RECOMMENDED: Call workflow-init with name parameter after filling files',
              'OPTIONAL: Skip workflow-init only for trivial changes (typos, single edits)'
            ],
            repoPath,
          });
        }

        // If no pending files, still suggest workflow initialization
        const responseData = result as Record<string, unknown>;
        const enhancementPrompt = `✓ SCAFFOLDING READY

RECOMMENDED NEXT ACTION:
Initialize a PREVC workflow to enable structured development.

Use workflow-init with name parameter to create workflow structure.
This creates .context/workflow/ and enables phase-gated execution (Plan → Review → Execute → Verify → Complete).

Skip ONLY for trivial changes (typos, single-line edits).`;

        return createScaffoldResponse(responseData, {
          enhancementPrompt,
          nextSteps: [
            'RECOMMENDED: Call workflow-init with name parameter to enable PREVC phases',
            'OPTIONAL: Skip workflow-init only for trivial changes'
          ],
        });
      }

      case 'fill': {
        const result = await fillScaffoldingTool.execute!(
          {
            repoPath,
            outputDir: params.outputDir,
            target: params.target,
            offset: params.offset,
            limit: params.limit
          },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'fillSingle': {
        const result = await fillSingleFileTool.execute!(
          { repoPath, filePath: params.filePath! },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'listToFill': {
        const result = await listFilesToFillTool.execute!(
          { repoPath, outputDir: params.outputDir, target: params.target },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'getMap': {
        const result = await getCodebaseMapTool.execute!(
          { repoPath, section: params.section as any },
          toolContext
        );
        return createJsonResponse(result);
      }

      case 'buildSemantic': {
        const isLocalBuilder = !!params.options;
        const builder = isLocalBuilder
          ? new SemanticContextBuilder(params.options)
          : options.contextBuilder;

        try {
          let context: string;
          const contextType = (params.contextType || 'compact') as ContextFormat;

          switch (contextType) {
            case 'documentation':
              context = await builder.buildDocumentationContext(repoPath, params.targetFile);
              break;
            case 'playbook':
              context = await builder.buildPlaybookContext(repoPath, params.targetFile || 'generic');
              break;
            case 'plan':
              context = await builder.buildPlanContext(repoPath, params.targetFile);
              break;
            case 'compact':
            default:
              context = await builder.buildCompactContext(repoPath);
              break;
          }

          return createTextResponse(context);
        } finally {
          if (isLocalBuilder) {
            await builder.shutdown();
          }
        }
      }

      case 'scaffoldPlan': {
        const result = await scaffoldPlanTool.execute!(
          {
            planName: params.planName!,
            repoPath,
            outputDir: params.outputDir,
            title: params.title,
            summary: params.summary,
            semantic: params.semantic,
            autoFill: params.autoFill
          },
          toolContext
        );

        // Plan scaffold always needs enhancement
        const typedResult = result as Record<string, unknown>;
        const planPath = typedResult.planPath as string | undefined;
        if (typedResult.success && planPath) {
          return createScaffoldResponse(typedResult, {
            filesGenerated: 1,
            pendingFiles: [planPath],
            repoPath,
          });
        }

        return createJsonResponse(result);
      }

      case 'searchQA': {
        if (!params.query) {
          return createErrorResponse('Query is required for searchQA action');
        }
        const qaService = new QAService(params.options);
        try {
          const results = await qaService.search(repoPath, params.query);
          return createJsonResponse({
            query: params.query,
            results,
            count: results.length,
          });
        } finally {
          await qaService.shutdown();
        }
      }

      case 'generateQA': {
        const qaService = new QAService(params.options);
        try {
          const result = await qaService.generateFromCodebase(repoPath);
          return createJsonResponse({
            generated: result.generated.length,
            skipped: result.skipped,
            projectType: result.topicDetection.projectType,
            topics: result.topicDetection.topics.map((t) => t.slug),
            files: result.generated.map((e) => `${e.slug}.md`),
          });
        } finally {
          await qaService.shutdown();
        }
      }

      case 'getFlow': {
        if (!params.entryFile) {
          return createErrorResponse('entryFile is required for getFlow action');
        }
        const analyzer = new CodebaseAnalyzer(params.options);
        try {
          const flow = await analyzer.traceFlow(
            repoPath,
            params.entryFile,
            params.entryFunction
          );
          return createJsonResponse({
            entryPoint: flow.entryPoint,
            nodeCount: flow.nodes.length,
            edgeCount: flow.edges.length,
            mermaid: flow.mermaidDiagram,
            nodes: flow.nodes.slice(0, 20),
            edges: flow.edges.slice(0, 30),
          });
        } finally {
          await analyzer.shutdown();
        }
      }

      case 'detectPatterns': {
        const analyzer = new CodebaseAnalyzer(params.options);
        try {
          const patterns = await analyzer.detectFunctionalPatterns(repoPath);
          return createJsonResponse({
            hasAuthPattern: patterns.hasAuthPattern,
            hasDatabasePattern: patterns.hasDatabasePattern,
            hasApiPattern: patterns.hasApiPattern,
            hasCachePattern: patterns.hasCachePattern,
            hasQueuePattern: patterns.hasQueuePattern,
            hasWebSocketPattern: patterns.hasWebSocketPattern,
            hasLoggingPattern: patterns.hasLoggingPattern,
            hasValidationPattern: patterns.hasValidationPattern,
            hasErrorHandlingPattern: patterns.hasErrorHandlingPattern,
            hasTestingPattern: patterns.hasTestingPattern,
            patterns: patterns.patterns.map((p) => ({
              type: p.type,
              confidence: p.confidence,
              description: p.description,
              indicatorCount: p.indicators.length,
            })),
          });
        } finally {
          await analyzer.shutdown();
        }
      }

      default:
        return createErrorResponse(`Unknown context action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
