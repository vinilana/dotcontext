import { z } from 'zod';

// =============================================================================
// Tool Input Schemas
// =============================================================================

export const ReadFileInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative path to the file to read'),
  encoding: z.enum(['utf-8', 'ascii', 'binary']).default('utf-8').optional()
});

export const ListFilesInputSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts")'),
  cwd: z.string().optional().describe('Working directory for the glob pattern'),
  ignore: z.array(z.string()).optional().describe('Patterns to ignore')
});

export const AnalyzeSymbolsInputSchema = z.object({
  filePath: z.string().describe('Path to the file to analyze'),
  symbolTypes: z
    .array(z.enum(['class', 'interface', 'function', 'type', 'enum']))
    .optional()
    .describe('Types of symbols to extract')
});

export const GetFileStructureInputSchema = z.object({
  rootPath: z.string().describe('Root path of the repository'),
  maxDepth: z.number().optional().default(3).describe('Maximum directory depth'),
  includePatterns: z.array(z.string()).optional()
});

export const SearchCodeInputSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  fileGlob: z.string().optional().describe('Glob pattern to filter files'),
  maxResults: z.number().optional().default(50)
});

export const GetCodebaseMapInputSchema = z.object({
  repoPath: z.string().optional().describe('Repository path (defaults to cwd)'),
  section: z.enum([
    'all',
    'stack',
    'structure',
    'architecture',
    'symbols',
    'symbols.classes',
    'symbols.interfaces',
    'symbols.functions',
    'symbols.types',
    'symbols.enums',
    'publicAPI',
    'dependencies',
    'stats',
    'keyFiles',
    'navigation'
  ]).default('all').optional()
    .describe('Section of the codebase map to retrieve. Use specific sections to reduce token usage.')
});

// =============================================================================
// Tool Output Schemas
// =============================================================================

export const ReadFileOutputSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  path: z.string(),
  size: z.number().optional(),
  error: z.string().optional()
});

export const ListFilesOutputSchema = z.object({
  success: z.boolean(),
  files: z.array(z.string()).optional(),
  count: z.number().optional(),
  pattern: z.string(),
  error: z.string().optional()
});

export const SymbolSchema = z.object({
  name: z.string(),
  kind: z.string(),
  line: z.number(),
  exported: z.boolean().optional(),
  documentation: z.string().optional()
});

export const ImportSchema = z.object({
  source: z.string(),
  specifiers: z.array(z.string()).optional()
});

export const ExportSchema = z.object({
  name: z.string(),
  isDefault: z.boolean().optional()
});

export const AnalyzeSymbolsOutputSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  language: z.string().optional(),
  symbols: z.array(SymbolSchema).optional(),
  imports: z.array(ImportSchema).optional(),
  exports: z.array(ExportSchema).optional(),
  error: z.string().optional()
});

export const FileInfoSchema = z.object({
  path: z.string(),
  extension: z.string().optional(),
  size: z.number().optional()
});

export const DirectoryStatSchema = z.object({
  name: z.string(),
  fileCount: z.number()
});

export const GetFileStructureOutputSchema = z.object({
  success: z.boolean(),
  rootPath: z.string(),
  totalFiles: z.number().optional(),
  totalSize: z.number().optional(),
  topLevelDirs: z.array(DirectoryStatSchema).optional(),
  files: z.array(FileInfoSchema).optional(),
  error: z.string().optional()
});

export const CodeMatchSchema = z.object({
  file: z.string(),
  line: z.number(),
  match: z.string(),
  context: z.string()
});

export const SearchCodeOutputSchema = z.object({
  success: z.boolean(),
  pattern: z.string(),
  matches: z.array(CodeMatchSchema).optional(),
  totalMatches: z.number().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional()
});

export const GetCodebaseMapOutputSchema = z.object({
  success: z.boolean(),
  section: z.string(),
  data: z.unknown().optional().describe('The requested section data from codebase-map.json'),
  mapPath: z.string().optional().describe('Path to the codebase-map.json file'),
  error: z.string().optional()
});

// =============================================================================
// Structured Output Schemas
// =============================================================================

export const DocumentationSectionSchema: z.ZodType<{
  title: string;
  content: string;
  subsections?: Array<{ title: string; content: string; subsections?: unknown[] }>;
}> = z.object({
  title: z.string(),
  content: z.string(),
  subsections: z.lazy(() => z.array(DocumentationSectionSchema)).optional()
});

export const GlossaryTermSchema = z.object({
  term: z.string(),
  definition: z.string()
});

export const DocumentationOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(DocumentationSectionSchema),
  relatedFiles: z.array(z.string()),
  glossaryTerms: z.array(GlossaryTermSchema).optional()
});

export const RelevantFileSchema = z.object({
  path: z.string(),
  purpose: z.string()
});

export const WorkflowStepSchema = z.object({
  step: z.number(),
  action: z.string(),
  details: z.string()
});

export const CodePatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  example: z.string().optional()
});

export const AgentPlaybookSchema = z.object({
  agentType: z.string(),
  description: z.string(),
  responsibilities: z.array(z.string()),
  relevantFiles: z.array(RelevantFileSchema),
  workflowSteps: z.array(WorkflowStepSchema),
  bestPractices: z.array(z.string()),
  commonPatterns: z.array(CodePatternSchema).optional()
});

// Development Plan Schemas
export const PlanPhaseStepSchema = z.object({
  step: z.number(),
  action: z.string(),
  owner: z.string().describe('Agent type responsible for this step'),
  deliverable: z.string(),
  evidence: z.string().describe('How to verify completion')
});

export const PlanPhaseSchema = z.object({
  name: z.string(),
  objective: z.string(),
  steps: z.array(PlanPhaseStepSchema),
  commitCheckpoint: z.string().describe('Git commit message for this phase')
});

export const AgentLineupEntrySchema = z.object({
  agent: z.string(),
  role: z.string(),
  focusAreas: z.array(z.string())
});

export const DocTouchpointSchema = z.object({
  document: z.string(),
  sections: z.array(z.string()),
  updateReason: z.string()
});

export const DevelopmentPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  goal: z.string(),
  scope: z.object({
    included: z.array(z.string()),
    excluded: z.array(z.string())
  }),
  agentLineup: z.array(AgentLineupEntrySchema),
  docTouchpoints: z.array(DocTouchpointSchema),
  phases: z.array(PlanPhaseSchema),
  successCriteria: z.array(z.string()),
  risks: z.array(z.object({
    risk: z.string(),
    mitigation: z.string()
  })).optional()
});

// =============================================================================
// MCP Scaffolding Tool Schemas
// =============================================================================

/**
 * Status enum for tools that require follow-up actions
 */
export const ToolStatusEnum = z.enum(['success', 'incomplete', 'requires_action', 'error']);

/**
 * Action status enum for tracking required actions
 */
export const ActionStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'skipped']);

/**
 * Required action schema for structured action protocol
 */
export const RequiredActionSchema = z.object({
  order: z.number().describe('Sequence order for this action'),
  actionType: z.enum(['WRITE_FILE', 'CALL_TOOL', 'VERIFY']).describe('Type of action to perform'),
  filePath: z.string().describe('Absolute path to the file'),
  fileType: z.enum(['doc', 'skill', 'agent']).describe('Type of scaffold file'),
  instructions: z.string().describe('Instructions for filling this file'),
  suggestedContent: z.string().optional().describe('Pre-generated content to write to the file'),
  status: ActionStatusEnum.describe('Current status of this action'),
});

export type RequiredAction = z.infer<typeof RequiredActionSchema>;

/**
 * Project type enum for scaffold filtering
 */
export const ProjectTypeEnum = z.enum([
  'cli',
  'web-frontend',
  'web-backend',
  'full-stack',
  'mobile',
  'library',
  'monorepo',
  'desktop',
  'unknown',
]);

export type ProjectTypeSchema = z.infer<typeof ProjectTypeEnum>;

/**
 * Project classification output schema
 */
export const ProjectClassificationSchema = z.object({
  projectType: ProjectTypeEnum,
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.array(z.string()),
});

export const CheckScaffoldingInputSchema = z.object({
  repoPath: z.string().optional().describe('Repository path to check (defaults to cwd)')
});

export const CheckScaffoldingOutputSchema = z.object({
  initialized: z.boolean().describe('Whether .context directory exists'),
  docs: z.boolean().describe('Whether docs scaffolding exists with content'),
  agents: z.boolean().describe('Whether agents scaffolding exists with content'),
  plans: z.boolean().describe('Whether plans scaffolding exists with content'),
  outputDir: z.string().describe('Resolved output directory path')
});

export const InitializeContextInputSchema = z.object({
  repoPath: z.string().describe('Repository path to initialize'),
  type: z.enum(['docs', 'agents', 'both']).default('both').optional()
    .describe('Type of scaffolding to create'),
  outputDir: z.string().optional().describe('Output directory (default: ./.context)'),
  semantic: z.boolean().default(true).optional()
    .describe('Enable semantic analysis for richer templates'),
  include: z.array(z.string()).optional().describe('Include patterns'),
  exclude: z.array(z.string()).optional().describe('Exclude patterns'),
  projectType: ProjectTypeEnum.optional()
    .describe('Override auto-detected project type (e.g., "cli", "web-frontend", "library")'),
  disableFiltering: z.boolean().default(false).optional()
    .describe('Generate all agents/docs regardless of project type'),
  autoFill: z.boolean().default(true).optional()
    .describe('Automatically fill scaffolding with codebase-aware content (default: true)'),
  skipContentGeneration: z.boolean().default(true).optional()
    .describe('Skip pre-generating content for MCP to reduce response size. Use fillSingleFile or fillScaffolding tools to generate content on demand. (default: true)'),
  generateQA: z.boolean().default(true).optional()
    .describe('Generate Q&A files based on detected patterns and stack (default: true)'),
  generateSkills: z.boolean().default(true).optional()
    .describe('Generate skills scaffolding (default: true)'),
});

export const InitializeContextOutputSchema = z.object({
  // Immediate action signal - appears first in JSON for AI visibility
  instruction: z.string().optional()
    .describe('Human-readable instruction telling the AI what to do immediately'),
  _warning: z.string().optional()
    .describe('Warning signal for incomplete operations'),

  // Structured action protocol fields
  status: ToolStatusEnum.describe('Operation status - "incomplete" means pending writes must be completed'),
  complete: z.boolean().optional()
    .describe('Explicit boolean: false means operation is NOT complete'),
  operationType: z.string().optional().describe('Type of operation performed'),
  completionCriteria: z.string().optional()
    .describe('Explicit description of what makes this operation complete'),

  // Fill instructions (the UPDATE_SCAFFOLD_PROMPT)
  fillInstructions: z.string().optional()
    .describe('Standard prompt with guidelines for HOW to fill the scaffolded files (order: docs -> skills -> agents)'),

  // Pending writes (renamed from requiredActions for clarity)
  pendingWrites: z.array(RequiredActionSchema).optional()
    .describe('Files that MUST be written in order. Each has content ready to write.'),

  // Legacy: requiredActions (kept for backwards compatibility)
  requiredActions: z.array(RequiredActionSchema).optional()
    .describe('DEPRECATED: Use pendingWrites instead'),

  // Checklist format that AIs recognize
  checklist: z.array(z.string()).optional()
    .describe('Human-readable checklist of pending tasks in "[ ] task" format'),

  codebaseContext: z.string().optional()
    .describe('Semantic context for understanding the codebase'),
  nextStep: z.object({
    action: z.string().describe('What to do next'),
    example: z.string().optional().describe('Example tool call'),
  }).optional().describe('Explicit next step with example'),

  // Metadata fields
  _metadata: z.object({
    docsGenerated: z.number().optional(),
    agentsGenerated: z.number().optional(),
    outputDir: z.string(),
    classification: ProjectClassificationSchema.optional(),
  }).optional().describe('Metadata about the operation'),

  // Legacy fields (kept for backwards compatibility)
  docsGenerated: z.number().optional(),
  agentsGenerated: z.number().optional(),
  outputDir: z.string(),
  classification: ProjectClassificationSchema.optional()
    .describe('Detected project type and classification confidence'),
  error: z.string().optional()
});

export const ScaffoldPlanInputSchema = z.object({
  planName: z.string().describe('Name of the plan (will be slugified)'),
  repoPath: z.string().optional().describe('Repository path'),
  outputDir: z.string().optional().describe('Output directory'),
  title: z.string().optional().describe('Plan title (defaults to formatted planName)'),
  summary: z.string().optional().describe('Plan summary/goal'),
  semantic: z.boolean().default(true).optional().describe('Enable semantic analysis'),
  autoFill: z.boolean().default(true).optional()
    .describe('Automatically fill the plan with codebase-aware content (default: true)'),
});

export const ScaffoldPlanOutputSchema = z.object({
  success: z.boolean(),
  planPath: z.string().optional(),
  planContent: z.string().optional(),
  error: z.string().optional()
});

// =============================================================================
// Type Exports
// =============================================================================

export type CheckScaffoldingInput = z.infer<typeof CheckScaffoldingInputSchema>;
export type CheckScaffoldingOutput = z.infer<typeof CheckScaffoldingOutputSchema>;
export type InitializeContextInput = z.infer<typeof InitializeContextInputSchema>;
export type InitializeContextOutput = z.infer<typeof InitializeContextOutputSchema>;
export type ScaffoldPlanInput = z.infer<typeof ScaffoldPlanInputSchema>;
export type ScaffoldPlanOutput = z.infer<typeof ScaffoldPlanOutputSchema>;
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;
export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
export type ListFilesOutput = z.infer<typeof ListFilesOutputSchema>;
export type AnalyzeSymbolsInput = z.infer<typeof AnalyzeSymbolsInputSchema>;
export type AnalyzeSymbolsOutput = z.infer<typeof AnalyzeSymbolsOutputSchema>;
export type GetFileStructureInput = z.infer<typeof GetFileStructureInputSchema>;
export type GetFileStructureOutput = z.infer<typeof GetFileStructureOutputSchema>;
export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;
export type SearchCodeOutput = z.infer<typeof SearchCodeOutputSchema>;
export type GetCodebaseMapInput = z.infer<typeof GetCodebaseMapInputSchema>;
export type GetCodebaseMapOutput = z.infer<typeof GetCodebaseMapOutputSchema>;
export type DocumentationOutput = z.infer<typeof DocumentationOutputSchema>;
export type AgentPlaybook = z.infer<typeof AgentPlaybookSchema>;
export type DevelopmentPlan = z.infer<typeof DevelopmentPlanSchema>;
