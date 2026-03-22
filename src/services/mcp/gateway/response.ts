/**
 * MCP Response Helpers
 *
 * Standardized response creation for MCP tool handlers.
 */

/**
 * MCP Tool Response type that matches the MCP SDK CallToolResult interface.
 * Uses index signature for forward compatibility with SDK extensions.
 */
export interface MCPToolResponse {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
    annotations?: {
      audience?: ('user' | 'assistant')[];
      priority?: number;
    };
  }>;
  isError?: boolean;
}

/**
 * Creates a successful JSON response for MCP tool handlers.
 */
export function createJsonResponse(
  data: unknown,
  options: { pretty?: boolean } = {}
): MCPToolResponse {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, options.pretty ? 2 : undefined)
    }]
  };
}

/**
 * Creates an error response for MCP tool handlers.
 */
export function createErrorResponse(
  error: unknown,
  options: { pretty?: boolean } = {}
): MCPToolResponse {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, null, options.pretty ? 2 : undefined)
    }],
    isError: true
  };
}

/**
 * Creates a plain text response for MCP tool handlers.
 */
export function createTextResponse(text: string): MCPToolResponse {
  return {
    content: [{
      type: 'text' as const,
      text
    }]
  };
}

/**
 * Creates a scaffold response that includes the enhancement prompt.
 * This ensures AI agents always receive instructions to enhance generated scaffolding.
 */
export function createScaffoldResponse(
  data: Record<string, unknown>,
  options: {
    filesGenerated?: number;
    pendingFiles?: string[];
    repoPath?: string;
    enhancementPrompt?: string;
    nextSteps?: string[];
    mode?: 'compact' | 'verbose';
    helpRef?: string;
  } = {}
): MCPToolResponse {
  const {
    filesGenerated = 0,
    pendingFiles = [],
    repoPath,
    enhancementPrompt: customPrompt,
    nextSteps: customNextSteps,
    mode = 'compact',
    helpRef,
  } = options;
  const hasFilesToEnhance = filesGenerated > 0 || pendingFiles.length > 0;
  const hasCustomPrompt = customPrompt || customNextSteps;
  const nextSteps = customNextSteps || [
    'Call context({ action: "listToFill" }) to get files needing content',
    'For each file, call context({ action: "fillSingle", filePath: "..." })',
    'Generate content based on the semantic context returned',
    'Write enhanced content using the Write tool',
  ];

  // Build enhanced response with clear action signals
  const enhancedData = {
    // Original data
    ...data,

    // Action signals (appear first for visibility)
    ...(hasFilesToEnhance || hasCustomPrompt) && {
      _actionRequired: true,
      _status: hasCustomPrompt && !hasFilesToEnhance ? 'ready' : 'incomplete',
      _warning: hasCustomPrompt && !hasFilesToEnhance ? 'ACTION SUGGESTED' : 'SCAFFOLDING REQUIRES ENHANCEMENT',
      nextAction: nextSteps[0],
      ...(helpRef ? { helpRef } : {}),
      ...(mode === 'verbose' ? {
        enhancementPrompt: customPrompt || buildEnhancementPrompt(pendingFiles, repoPath),
        nextSteps,
      } : {}),

      // Files needing enhancement
      ...(pendingFiles.length > 0 && {
        pendingEnhancement: pendingFiles,
        pendingCount: pendingFiles.length,
      }),
    },
  };

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(enhancedData)
    }]
  };
}

/**
 * Build enhancement prompt for scaffold files.
 */
function buildEnhancementPrompt(pendingFiles: string[], repoPath?: string): string {
  const filesList = pendingFiles.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join('\n');
  const moreFiles = pendingFiles.length > 5 ? `\n... and ${pendingFiles.length - 5} more files` : '';

  return `IMPORTANT ENHANCEMENT REQUIRED

Scaffolding has been created but files need codebase-specific content.

Files to enhance:
${filesList}${moreFiles}

REQUIRED WORKFLOW:
1. Call context({ action: "fillSingle", filePath: "<file>" }) for each file
2. Use the returned semantic context to generate rich content
3. Write the enhanced content to the file

${repoPath ? `Repository: ${repoPath}` : ''}

DO NOT report completion until ALL files have been enhanced.`;
}
