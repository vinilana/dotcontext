/**
 * MCP Server - Model Context Protocol server for dotcontext integration.
 *
 * Exposes consolidated gateway tools plus dedicated workflow entry points for
 * reduced context and simpler tool selection for AI agents.
 *
 * Simplified workflow: context init → fillSingle → workflow-init
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs-extra';

import { readFileTool } from '../harness/contextTools';
import { PathValidator, SecurityError } from '../../utils/pathSecurity';
import { SemanticContextBuilder, type ContextFormat } from '../semantic/contextBuilder';
import { ContextCache } from '../semantic/contextCache';
import { VERSION } from '../../version';
import { WorkflowService } from '../workflow';
import { logMcpAction } from './actionLogger';
import {
  PREVC_ROLES,
  getScaleName,
  ProjectScale,
  AGENT_TYPES,
} from '../../workflow';

import {
  handleExplore,
  handleContext,
  handleSync,
  handlePlan,
  handleAgent,
  handleSkill,
  handleHarness,
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowAdvance,
  handleWorkflowManage,
  type ExploreParams,
  type ContextParams,
  type SyncParams,
  type PlanParams,
  type AgentParams,
  type SkillParams,
  type HarnessParams,
  type WorkflowInitParams,
  type WorkflowStatusParams,
  type WorkflowAdvanceParams,
  type WorkflowManageParams,
  type MCPToolResponse,
} from './gatewayTools';

export interface MCPServerOptions {
  /** Default repository path for tools */
  repoPath?: string;
  /** Server name */
  name?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Optional injected SemanticContextBuilder for testing */
  contextBuilder?: SemanticContextBuilder;
}

export class AIContextMCPServer {
  private server: McpServer;
  private contextBuilder: SemanticContextBuilder;
  private readonly contextCache: ContextCache;
  private options: MCPServerOptions;
  private transport: StdioServerTransport | null = null;
  private initialRepoPath: string | null = null;
  private cachedRepoPath: string | null = null;

  constructor(options: MCPServerOptions = {}) {
    this.options = {
      name: 'dotcontext',
      verbose: false,
      ...options
    };

    this.server = new McpServer({
      name: this.options.name!,
      version: VERSION
    });

    // Support dependency injection for testing, with default fallback
    this.contextBuilder = options.contextBuilder ?? new SemanticContextBuilder();
    this.contextCache = new ContextCache();

    // Initialize and cache the correct repo path
    void this.initializeRepoPath();

    this.registerGatewayTools();
    this.registerResources();
  }

  /**
   * Register consolidated gateway tools and dedicated workflow tools.
   *
   * Project tools removed - use context({ action: "init" }) + workflow-init instead.
   *
   * NOTE: repoPath is determined dynamically via getRepoPath() at runtime,
   * which uses smart initialization and client path caching.
   */
  private registerGatewayTools(): void {
    const wrap = <TParams>(
      toolName: string,
      handler: (params: TParams) => Promise<MCPToolResponse>
    ) => this.wrapWithActionLogging(toolName, handler);

    // Gateway 1: explore - File and code exploration
    this.server.registerTool('explore', {
      description: `File and code exploration. Actions:
- read: Read file contents (params: filePath, encoding?)
- list: List files matching pattern (params: pattern, cwd?, ignore?)
- analyze: Analyze symbols in a file (params: filePath, symbolTypes?)
- search: Search code with regex (params: pattern, fileGlob?, maxResults?, cwd?)
- getStructure: Get directory structure (params: rootPath?, maxDepth?, includePatterns?)`,
      inputSchema: {
        action: z.enum(['read', 'list', 'analyze', 'search', 'getStructure'])
          .describe('Action to perform'),
        filePath: z.string().optional()
          .describe('(read, analyze) File path to read or analyze'),
        pattern: z.string().optional()
          .describe('(list, search) Glob pattern for list, regex pattern for search'),
        cwd: z.string().optional()
          .describe('(list, search) Working directory'),
        encoding: z.enum(['utf-8', 'ascii', 'binary']).optional()
          .describe('(read) File encoding'),
        ignore: z.array(z.string()).optional()
          .describe('(list) Patterns to ignore'),
        symbolTypes: z.array(z.enum(['class', 'interface', 'function', 'type', 'enum'])).optional()
          .describe('(analyze) Types of symbols to extract'),
        fileGlob: z.string().optional()
          .describe('(search) Glob pattern to filter files'),
        maxResults: z.number().optional()
          .describe('(search) Maximum results to return'),
        rootPath: z.string().optional()
          .describe('(getStructure) Root path for structure'),
        maxDepth: z.number().optional()
          .describe('(getStructure) Maximum directory depth'),
        includePatterns: z.array(z.string()).optional()
          .describe('(getStructure) Include patterns'),
      }
    }, wrap('explore', async (params): Promise<MCPToolResponse> => {
      // explore uses cwd for file operations, not repoPath for context resolution
      return handleExplore(params as ExploreParams, { repoPath: this.getRepoPath() });
    }));

    // Gateway 2: context - Context scaffolding and semantic context
    this.server.registerTool('context', {
      description: `Context scaffolding and semantic context. Actions:
- check: Check if .context scaffolding exists (params: repoPath?)
- bootstrapStatus: Summarize scaffold, workflow, and harness bootstrap readiness (params: repoPath?)
- init: Initialize .context scaffolding (params: repoPath?, type?, outputDir?, semantic?, autoFill?, skipContentGeneration?, generateQA?)
- fill: Fill scaffolding with AI content (params: repoPath?, outputDir?, target?, offset?, limit?) Generated Q&A docs under .context/docs/qa are already populated and are not returned unless you add custom unfilled docs there. Bootstrap .context/harness/sensors.json is returned until customized.
- fillSingle: Fill a single scaffold file (params: repoPath?, filePath)
- listToFill: List files that need filling (params: repoPath?, outputDir?, target?)
- getMap: Get codebase map section with on-read auto-refresh (params: repoPath?, section?)
- buildSemantic: Build semantic context (params: repoPath?, contextType?, targetFile?, options?)
- scaffoldPlan: Create a plan template (params: planName, repoPath?, title?, summary?, autoFill?)
- searchQA: Search generated Q&A docs (params: repoPath?, query)
- generateQA: Generate Q&A docs from the codebase (params: repoPath?, options?)
- getFlow: Trace a code path from an entry file/function (params: repoPath?, entryFile, entryFunction?, options?)
- detectPatterns: Detect functional patterns in the codebase (params: repoPath?, options?)

**Important:** Agents should provide repoPath on the FIRST call, then it will be cached:
1. First call: context({ action: "check", repoPath: "/path/to/project" })
2. Subsequent calls can omit repoPath - it will use cached value from step 1
3. After context init, call fillSingle for each pending file
4. Call workflow-init to enable PREVC workflow (unless trivial change)`,
      inputSchema: {
        action: z.enum(['check', 'bootstrapStatus', 'init', 'fill', 'fillSingle', 'listToFill', 'getMap', 'buildSemantic', 'scaffoldPlan', 'searchQA', 'generateQA', 'getFlow', 'detectPatterns'])
          .describe('Action to perform'),
        repoPath: z.string().optional()
          .describe('Repository path (defaults to cwd)'),
        outputDir: z.string().optional()
          .describe('Output directory (default: ./.context)'),
        type: z.enum(['docs', 'agents', 'both']).optional()
          .describe('(init) Type of scaffolding to create'),
        semantic: z.boolean().optional()
          .describe('(init, scaffoldPlan) Enable semantic analysis'),
        include: z.array(z.string()).optional()
          .describe('(init) Include patterns'),
        exclude: z.array(z.string()).optional()
          .describe('(init) Exclude patterns'),
        autoFill: z.boolean().optional()
          .describe('(init, scaffoldPlan) Auto-fill with codebase content'),
        skipContentGeneration: z.boolean().optional()
          .describe('(init) Skip pre-generating content'),
        generateQA: z.boolean().optional()
          .describe('(init) Generate Q&A docs under .context/docs/qa; these are pre-filled and do not require fillSingle'),
        target: z.enum(['docs', 'agents', 'skills', 'plans', 'sensors', 'all']).optional()
          .describe('(fill, listToFill) Which scaffolding to target, including nested skills and harness sensors'),
        offset: z.number().optional()
          .describe('(fill) Skip first N files'),
        limit: z.number().optional()
          .describe('(fill) Max files to return'),
        filePath: z.string().optional()
          .describe('(fillSingle) Absolute path to scaffold file'),
        section: z.enum([
          'all', 'meta', 'stack', 'structure', 'architecture',
          'functionalPatterns', 'dependencies', 'stats', 'keyFiles', 'navigation'
        ]).optional()
          .describe('(getMap) Section to retrieve; the snapshot auto-refreshes on read'),
        contextType: z.enum(['documentation', 'playbook', 'plan', 'compact']).optional()
          .describe('(buildSemantic) Type of context to build'),
        targetFile: z.string().optional()
          .describe('(buildSemantic) Target file for focused context'),
        options: z.object({
          useLSP: z.boolean().optional(),
          maxContextLength: z.number().optional(),
          includeDocumentation: z.boolean().optional(),
          includeSignatures: z.boolean().optional()
        }).optional()
          .describe('(buildSemantic, generateQA, searchQA, getFlow, detectPatterns) Builder/analyzer options'),
        planName: z.string().optional()
          .describe('(scaffoldPlan) Name of the plan'),
        title: z.string().optional()
          .describe('(scaffoldPlan) Plan title'),
        summary: z.string().optional()
          .describe('(scaffoldPlan) Plan summary/goal'),
        query: z.string().optional()
          .describe('(searchQA) Query string used to search generated Q&A docs'),
        entryFile: z.string().optional()
          .describe('(getFlow) Entry file path for flow tracing'),
        entryFunction: z.string().optional()
          .describe('(getFlow) Optional entry function for flow tracing'),
      }
    }, wrap('context', async (params): Promise<MCPToolResponse> => {
      return handleContext(params as ContextParams, { repoPath: this.getRepoPath((params as ContextParams).repoPath), contextBuilder: this.contextBuilder });
    }));

    // Dedicated Workflow Tools (split from consolidated workflow gateway)

    // Tool 3a: workflow-init - Initialize PREVC workflow
    this.server.registerTool('workflow-init', {
      description: `Initialize a PREVC workflow for structured development.

**What it does:**
- Creates .context/workflow/ folder (automatically, if it doesn't exist)
- Initializes workflow status file with phase tracking
- Detects project scale and configures gates
- Sets up PREVC phases (Plan → Review → Execute → Verify → Complete)

**Prerequisites:**
- .context/ folder must exist (use context with action "init" first)
- Scaffolding files should be filled (use context with action "fillSingle")

**When to use:**
- Starting a new feature or bug fix after scaffolding is set up
- Need structured, phase-gated development
- Working on non-trivial changes

**Don't use if:**
- Making trivial changes (typo fixes, single-line edits)
- Just exploring/researching code
- User explicitly wants to skip workflow`,
      inputSchema: {
        name: z.string().describe('Workflow/feature name (required)'),
        description: z.string().optional()
          .describe('Task description for scale detection'),
        scale: z.enum(['QUICK', 'SMALL', 'MEDIUM', 'LARGE']).optional()
          .describe(`Project scale - AI should evaluate based on task characteristics:

SCALE EVALUATION CRITERIA:
• QUICK: Single file changes, bug fixes, typos (~5 min)
  - Phases: E → V only
  - Example: "Fix typo in button text"

• SMALL: Simple features, no architecture changes (~15 min)
  - Phases: P → E → V
  - Example: "Add email validation to form"

• MEDIUM: Regular features with design decisions (~30 min)
  - Phases: P → R → E → V
  - Example: "Implement user profile page"

• LARGE: Complex features, systems, compliance (~1+ hour)
  - Phases: P → R → E → V → C (full workflow)
  - Examples: "Build OAuth system", "Add GDPR compliance"

GUIDANCE:
- Analyze task complexity, architectural impact, and review needs
- Use LARGE for security/compliance requirements
- When uncertain, prefer MEDIUM
- Omit scale only if unable to evaluate (auto-detect fallback)`),
        autonomous: z.boolean().optional()
          .describe('Skip all workflow gates (default: scale-dependent)'),
        require_plan: z.boolean().optional()
          .describe('Require plan before P→R'),
        require_approval: z.boolean().optional()
          .describe('Require approval before R→E'),
        archive_previous: z.boolean().optional()
          .describe('Archive existing workflow'),
      }
    }, wrap('workflow-init', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowInit(params as WorkflowInitParams, { repoPath: this.getRepoPath((params as WorkflowInitParams).repoPath) });
    }));

    // Tool 3b: workflow-status - Get current workflow status
    this.server.registerTool('workflow-status', {
      description: `Get current PREVC workflow status including phase, gates, and linked plans.

Returns: Current phase, all phase statuses, gate settings, linked plans, agent activity.`,
      inputSchema: {
        // No required parameters
      }
    }, wrap('workflow-status', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowStatus(params as WorkflowStatusParams, { repoPath: this.getRepoPath((params as WorkflowStatusParams).repoPath) });
    }));

    // Tool 3c: workflow-advance - Advance to next phase
    this.server.registerTool('workflow-advance', {
      description: `Advance workflow to the next PREVC phase (P→R→E→V→C).

Enforces gates:
- P→R: Requires plan if require_plan=true
- R→E: Requires approval if require_approval=true

Use force=true to bypass gates, or use workflow-manage({ action: 'setAutonomous' }).`,
      inputSchema: {
        outputs: z.array(z.string()).optional()
          .describe('Artifact paths produced in current phase'),
        force: z.boolean().optional()
          .describe('Force advancement even if gates block'),
      }
    }, wrap('workflow-advance', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowAdvance(params as WorkflowAdvanceParams, { repoPath: this.getRepoPath((params as WorkflowAdvanceParams).repoPath) });
    }));

    // Tool 3d: workflow-manage - Manage workflow operations
    this.server.registerTool('workflow-manage', {
      description: `Manage workflow operations: handoffs, collaboration, documents, gates, approvals, and harness runtime state.

Actions:
- handoff: Transfer work between agents (params: from, to, artifacts)
- collaborate: Start collaboration session (params: topic, participants?)
- createDoc: Create workflow document (params: type, docName)
- getGates: Check gate status
- approvePlan: Approve linked plan (params: planSlug?, approver?, notes?)
- setAutonomous: Toggle autonomous mode (params: enabled, reason?)
- checkpoint: Record a harness checkpoint (params: notes?, data?, artifactIds?, pause?)
- recordArtifact: Attach an artifact to the active harness session (params: name, kind?, filePath?, content?)
- defineTask: Define the active harness task contract (params: taskTitle, taskDescription?, expectedOutputs?, acceptanceCriteria?, requiredSensors?, requiredArtifacts?)
- runSensors: Execute harness sensors for the active session (params: sensors)`,
      inputSchema: {
        action: z.enum(['handoff', 'collaborate', 'createDoc', 'getGates', 'approvePlan', 'setAutonomous', 'checkpoint', 'recordArtifact', 'defineTask', 'runSensors'])
          .describe('Action to perform'),
        from: z.string().optional()
          .describe('(handoff) Agent handing off (e.g., feature-developer)'),
        to: z.string().optional()
          .describe('(handoff) Agent receiving (e.g., code-reviewer)'),
        artifacts: z.array(z.string()).optional()
          .describe('(handoff) Artifacts to hand off'),
        topic: z.string().optional()
          .describe('(collaborate) Collaboration topic'),
        participants: z.array(z.enum(PREVC_ROLES as unknown as [string, ...string[]])).optional()
          .describe('(collaborate) Participating roles'),
        type: z.enum(['prd', 'tech-spec', 'architecture', 'adr', 'test-plan', 'changelog']).optional()
          .describe('(createDoc) Document type'),
        docName: z.string().optional()
          .describe('(createDoc) Document name'),
        planSlug: z.string().optional()
          .describe('(approvePlan) Plan to approve'),
        approver: z.enum(PREVC_ROLES as unknown as [string, ...string[]]).optional()
          .describe('(approvePlan) Approving role'),
        notes: z.string().optional()
          .describe('(approvePlan) Approval notes'),
        enabled: z.boolean().optional()
          .describe('(setAutonomous) Enable/disable'),
        reason: z.string().optional()
          .describe('(setAutonomous) Reason for change'),
        name: z.string().optional()
          .describe('(recordArtifact) Artifact name'),
        kind: z.enum(['text', 'json', 'file']).optional()
          .describe('(recordArtifact) Artifact kind'),
        content: z.any().optional()
          .describe('(recordArtifact, checkpoint) Structured content or payload'),
        filePath: z.string().optional()
          .describe('(recordArtifact) Artifact file path'),
        taskTitle: z.string().optional()
          .describe('(defineTask) Task title'),
        taskDescription: z.string().optional()
          .describe('(defineTask) Task description'),
        owner: z.string().optional()
          .describe('(defineTask) Task owner'),
        inputs: z.array(z.string()).optional()
          .describe('(defineTask) Required inputs'),
        expectedOutputs: z.array(z.string()).optional()
          .describe('(defineTask) Expected outputs'),
        acceptanceCriteria: z.array(z.string()).optional()
          .describe('(defineTask) Acceptance criteria'),
        requiredSensors: z.array(z.string()).optional()
          .describe('(defineTask) Required sensors'),
        requiredArtifacts: z.array(z.string()).optional()
          .describe('(defineTask) Required artifacts'),
        sensors: z.array(z.string()).optional()
          .describe('(runSensors) Sensors to execute'),
        data: z.any().optional()
          .describe('(checkpoint) Optional checkpoint payload'),
        artifactIds: z.array(z.string()).optional()
          .describe('(checkpoint) Artifact IDs associated with the checkpoint'),
        pause: z.boolean().optional()
          .describe('(checkpoint) Pause the active harness session after checkpoint'),
      }
    }, wrap('workflow-manage', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowManage(params as WorkflowManageParams, { repoPath: this.getRepoPath((params as WorkflowManageParams).repoPath) });
    }));

    // Gateway 5: sync - Import/export synchronization
    this.server.registerTool('sync', {
      description: `Import/export synchronization with AI tools. Actions:
- exportRules: Export rules to AI tools (params: preset?, force?, dryRun?)
- exportDocs: Export docs to AI tools (params: preset?, indexMode?, force?, dryRun?)
- exportAgents: Export agents to AI tools (params: preset?, mode?, force?, dryRun?)
- exportContext: Export all context (params: preset?, skipDocs?, skipAgents?, skipSkills?, docsIndexMode?, agentMode?, force?, dryRun?)
- exportSkills: Export skills to AI tools (params: preset?, includeBuiltIn?, force?)
- reverseSync: Import from AI tools to .context/ (params: skipRules?, skipAgents?, skipSkills?, mergeStrategy?, dryRun?, force?, addMetadata?)
- importDocs: Import docs from AI tools (params: autoDetect?, force?, dryRun?)
- importAgents: Import agents from AI tools (params: autoDetect?, force?, dryRun?)
- importSkills: Import skills from AI tools (params: autoDetect?, mergeStrategy?, force?, dryRun?)`,
      inputSchema: {
        action: z.enum(['exportRules', 'exportDocs', 'exportAgents', 'exportContext', 'exportSkills', 'reverseSync', 'importDocs', 'importAgents', 'importSkills'])
          .describe('Action to perform'),
        preset: z.string().optional()
          .describe('Target AI tool preset'),
        force: z.boolean().optional()
          .describe('Overwrite existing files'),
        dryRun: z.boolean().optional()
          .describe('Preview without writing'),
        indexMode: z.enum(['readme', 'all']).optional()
          .describe('(exportDocs) Index mode'),
        mode: z.enum(['symlink', 'markdown']).optional()
          .describe('(exportAgents) Sync mode'),
        skipDocs: z.boolean().optional()
          .describe('(exportContext) Skip docs'),
        skipAgents: z.boolean().optional()
          .describe('(exportContext, reverseSync) Skip agents'),
        skipSkills: z.boolean().optional()
          .describe('(exportContext, reverseSync) Skip skills'),
        skipRules: z.boolean().optional()
          .describe('(reverseSync) Skip rules'),
        docsIndexMode: z.enum(['readme', 'all']).optional()
          .describe('(exportContext) Docs index mode'),
        agentMode: z.enum(['symlink', 'markdown']).optional()
          .describe('(exportContext) Agent sync mode'),
        includeBuiltInSkills: z.boolean().optional()
          .describe('(exportContext) Include built-in skills'),
        includeBuiltIn: z.boolean().optional()
          .describe('(exportSkills) Include built-in skills'),
        mergeStrategy: z.enum(['skip', 'overwrite', 'merge', 'rename']).optional()
          .describe('(reverseSync, importSkills) Conflict handling'),
        autoDetect: z.boolean().optional()
          .describe('(import*) Auto-detect files'),
        addMetadata: z.boolean().optional()
          .describe('(reverseSync) Add frontmatter metadata'),
        repoPath: z.string().optional()
          .describe('Repository path'),
      }
    }, wrap('sync', async (params): Promise<MCPToolResponse> => {
      return handleSync(params as SyncParams, { repoPath: this.getRepoPath((params as SyncParams).repoPath) });
    }));

    // Gateway 6: plan - Plan management and execution tracking
    this.server.registerTool('plan', {
      description: `Plan management and execution tracking. Actions:
- link: Link plan to workflow (params: planSlug)
- getLinked: Get all linked plans
- getDetails: Get detailed plan info (params: planSlug)
- getForPhase: Get plans for PREVC phase (params: phase)
- updatePhase: Update plan phase status (params: planSlug, phaseId, status)
- recordDecision: Record a decision (params: planSlug, title, description, phase?, alternatives?)
- updateStep: Update step status (params: planSlug, phaseId, stepIndex, status, output?, notes?)
- getStatus: Get plan execution status (params: planSlug)
- syncMarkdown: Sync tracking to markdown (params: planSlug)
- commitPhase: Create git commit for completed phase (params: planSlug, phaseId, coAuthor?, stagePatterns?, dryRun?)`,
      inputSchema: {
        action: z.enum(['link', 'getLinked', 'getDetails', 'getForPhase', 'updatePhase', 'recordDecision', 'updateStep', 'getStatus', 'syncMarkdown', 'commitPhase'])
          .describe('Action to perform'),
        planSlug: z.string().optional()
          .describe('Plan slug/identifier'),
        phaseId: z.string().optional()
          .describe('(updatePhase, updateStep, commitPhase) Phase ID'),
        status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional()
          .describe('(updatePhase, updateStep) New status'),
        phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional()
          .describe('(getForPhase, recordDecision) PREVC phase'),
        title: z.string().optional()
          .describe('(recordDecision) Decision title'),
        description: z.string().optional()
          .describe('(recordDecision) Decision description'),
        alternatives: z.array(z.string()).optional()
          .describe('(recordDecision) Considered alternatives'),
        stepIndex: z.number().optional()
          .describe('(updateStep) Step number (1-based)'),
        output: z.string().optional()
          .describe('(updateStep) Step output artifact'),
        notes: z.string().optional()
          .describe('(updateStep) Execution notes'),
        coAuthor: z.string().optional()
          .describe('(commitPhase) Agent name for Co-Authored-By footer'),
        stagePatterns: z.array(z.string()).optional()
          .describe('(commitPhase) Patterns for files to stage (default: [".context/**"])'),
        dryRun: z.boolean().optional()
          .describe('(commitPhase) Preview without committing'),
      }
    }, wrap('plan', async (params): Promise<MCPToolResponse> => {
      return handlePlan(params as PlanParams, { repoPath: this.getRepoPath() });
    }));

    // Gateway 7: agent - Agent orchestration and discovery
    this.server.registerTool('agent', {
      description: `Agent orchestration and discovery. Actions:
- discover: Discover all agents (built-in + custom)
- getInfo: Get agent details (params: agentType)
- orchestrate: Select agents for task/phase/role (params: task?, phase?, role?)
- getSequence: Get agent handoff sequence (params: task, includeReview?, phases?)
- getDocs: Get agent documentation (params: agent)
- getPhaseDocs: Get phase documentation (params: phase)
- listTypes: List all agent types`,
      inputSchema: {
        action: z.enum(['discover', 'getInfo', 'orchestrate', 'getSequence', 'getDocs', 'getPhaseDocs', 'listTypes'])
          .describe('Action to perform'),
        agentType: z.string().optional()
          .describe('(getInfo) Agent type identifier'),
        task: z.string().optional()
          .describe('(orchestrate, getSequence) Task description'),
        phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional()
          .describe('(orchestrate, getPhaseDocs) PREVC phase'),
        role: z.enum(PREVC_ROLES as unknown as [string, ...string[]]).optional()
          .describe('(orchestrate) PREVC role'),
        includeReview: z.boolean().optional()
          .describe('(getSequence) Include code review'),
        phases: z.array(z.enum(['P', 'R', 'E', 'V', 'C'])).optional()
          .describe('(getSequence) Phases to include'),
        agent: z.enum(AGENT_TYPES as unknown as [string, ...string[]]).optional()
          .describe('(getDocs) Agent type for docs'),
      }
    }, wrap('agent', async (params): Promise<MCPToolResponse> => {
      return handleAgent(params as AgentParams, { repoPath: this.getRepoPath() });
    }));

    // Gateway 8: skill - Skill management
    this.server.registerTool('skill', {
      description: `Skill management for on-demand expertise. Actions:
- list: List all skills (params: includeContent?)
- getContent: Get skill content (params: skillSlug)
- getForPhase: Get skills for PREVC phase (params: phase)
- scaffold: Generate skill files (params: skills?, force?)
- export: Export skills to AI tools (params: preset?, includeBuiltIn?, force?)
- fill: Fill skills with codebase content (params: skills?, force?)`,
      inputSchema: {
        action: z.enum(['list', 'getContent', 'getForPhase', 'scaffold', 'export', 'fill'])
          .describe('Action to perform'),
        skillSlug: z.string().optional()
          .describe('(getContent) Skill identifier'),
        phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional()
          .describe('(getForPhase) PREVC phase'),
        skills: z.array(z.string()).optional()
          .describe('(scaffold, fill) Specific skills to process'),
        includeContent: z.boolean().optional()
          .describe('(list) Include full content'),
        includeBuiltIn: z.boolean().optional()
          .describe('(export, fill) Include built-in skills'),
        preset: z.string().optional()
          .describe('(export) Target AI tool preset'),
        force: z.boolean().optional()
          .describe('(scaffold, export) Overwrite existing'),
      }
    }, wrap('skill', async (params): Promise<MCPToolResponse> => {
      return handleSkill(params as SkillParams, { repoPath: this.getRepoPath() });
    }));

    // Gateway 9: harness - Explicit harness runtime operations
    this.server.registerTool('harness', {
      description: `Harness runtime operations. Actions:
- createSession: Create durable harness session (params: name, metadata?)
- listSessions: List harness sessions
- getSession: Get a harness session (params: sessionId)
- appendTrace: Append trace event (params: sessionId, level, event, message, data?)
- listTraces: List trace events for a session (params: sessionId)
- addArtifact: Add artifact to a session (params: sessionId, name, kind?, content?, path?, metadata?)
- listArtifacts: List session artifacts (params: sessionId)
- checkpoint: Record session checkpoint (params: sessionId, note?, data?, artifactIds?, pause?)
- resumeSession: Resume paused session (params: sessionId)
- completeSession: Complete session (params: sessionId, note?)
- failSession: Fail session (params: sessionId, message)
- recordSensor: Record sensor result for session (params: sessionId, sensorId, sensorStatus, summary, sensorSeverity?, sensorBlocking?, evidence?)
- getSessionQuality: Evaluate backpressure and task completion (params: sessionId, taskId?, blockOnWarnings?, requireEvidence?)
- createTask: Create task contract (params: title, sessionId?, expectedOutputs?, acceptanceCriteria?, requiredSensors?, requiredArtifacts?)
- listTasks: List task contracts
- evaluateTask: Evaluate task completion (params: taskId, sessionId?)
- createHandoff: Create handoff contract (params: from, to, sessionId?, taskId?, artifacts?, evidence?)
- listHandoffs: List handoff contracts
- replaySession: Replay a durable session timeline (params: sessionId, includePayloads?, maxEvents?)
- listReplays: List generated replays (params: sessionId?)
- getReplay: Get replay by id (params: replayId)
- buildDataset: Build a failure dataset from sessions (params: sessionIds?, includeSuccessfulSessions?)
- listDatasets: List failure datasets
- getDataset: Get failure dataset by id (params: datasetId)
- getFailureClusters: Get clusters for a dataset (params: datasetId)
- registerPolicy: Register policy rule (params: scope, effect, target?, pattern?, pathPattern?, risk?, description?)
- listPolicies: List policy rules
- getPolicy: Retrieve current policy document
- setPolicy: Replace policy document (params: policy)
- resetPolicy: Reset policy to bootstrap defaults
- evaluatePolicy: Evaluate policy against runtime input (params: scope, pattern?, target?, path?, pathPattern?, risk?, approvedBy?, approvalRole?, approvalNote?)`,
      inputSchema: {
        action: z.enum([
          'createSession',
          'listSessions',
          'getSession',
          'appendTrace',
          'listTraces',
          'addArtifact',
          'listArtifacts',
          'checkpoint',
          'resumeSession',
          'completeSession',
          'failSession',
          'recordSensor',
          'getSessionQuality',
          'createTask',
          'listTasks',
          'evaluateTask',
          'createHandoff',
          'listHandoffs',
          'replaySession',
          'listReplays',
          'getReplay',
          'buildDataset',
          'listDatasets',
          'getDataset',
          'getFailureClusters',
          'registerPolicy',
          'listPolicies',
          'getPolicy',
          'setPolicy',
          'resetPolicy',
          'evaluatePolicy',
        ]).describe('Action to perform'),
        sessionId: z.string().optional(),
        taskId: z.string().optional(),
        name: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        owner: z.string().optional(),
        status: z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed', 'failed']).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
        event: z.string().optional(),
        message: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        kind: z.enum(['text', 'json', 'file']).optional(),
        content: z.unknown().optional(),
        path: z.string().optional(),
        note: z.string().optional(),
        artifactIds: z.array(z.string()).optional(),
        pause: z.boolean().optional(),
        sensorId: z.string().optional(),
        sensorName: z.string().optional(),
        sensorSeverity: z.enum(['info', 'warning', 'critical']).optional(),
        sensorBlocking: z.boolean().optional(),
        sensorStatus: z.enum(['passed', 'failed', 'skipped', 'blocked']).optional(),
        summary: z.string().optional(),
        evidence: z.array(z.string()).optional(),
        output: z.unknown().optional(),
        details: z.record(z.string(), z.unknown()).optional(),
        blockOnWarnings: z.boolean().optional(),
        requireEvidence: z.boolean().optional(),
        inputs: z.array(z.string()).optional(),
        expectedOutputs: z.array(z.string()).optional(),
        acceptanceCriteria: z.array(z.string()).optional(),
        requiredSensors: z.array(z.string()).optional(),
        requiredArtifacts: z.array(z.string()).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        artifacts: z.array(z.string()).optional(),
        replayId: z.string().optional(),
        includePayloads: z.boolean().optional(),
        maxEvents: z.number().optional(),
        datasetId: z.string().optional(),
        sessionIds: z.array(z.string()).optional(),
        includeSuccessfulSessions: z.boolean().optional(),
        scope: z.enum(['sensor', 'artifact', 'handoff', 'workflow', 'task', 'risk']).optional(),
        effect: z.enum(['allow', 'deny', 'require_approval']).optional(),
        target: z.enum(['tool', 'action', 'path', 'risk']).optional(),
        pattern: z.string().optional(),
        pathPattern: z.string().optional(),
        approvalRole: z.string().optional(),
        approvedBy: z.string().optional(),
        approvalNote: z.string().optional(),
        risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        policy: z.object({
          defaultEffect: z.enum(['allow', 'deny']).optional(),
          rules: z.array(z.object({
            id: z.string().optional(),
            effect: z.enum(['allow', 'deny', 'require_approval']),
            target: z.enum(['tool', 'action', 'path', 'risk']).optional(),
            pattern: z.string().optional(),
            pathPattern: z.string().optional(),
            approvalRole: z.string().optional(),
            reason: z.string().optional(),
            description: z.string().optional(),
            scope: z.enum(['sensor', 'artifact', 'handoff', 'workflow', 'task', 'risk']).optional(),
          })).optional(),
        }).optional(),
      }
    }, wrap('harness', async (params): Promise<MCPToolResponse> => {
      return handleHarness(params as HarnessParams, { repoPath: this.getRepoPath() });
    }));

    this.log('Registered consolidated MCP gateway and workflow tools');
  }

  /**
   * Register semantic context resources
   * Uses initialRepoPath if found, otherwise process.cwd()
   */
  private registerResources(): void {
    const repoPath = this.initialRepoPath ?? process.cwd();

    // Register context resources as templates with URI patterns
    this.server.registerResource(
      'codebase-context',
      `context://codebase/{contextType}`,
      {
        description: 'Semantic context for the codebase. Use contextType: documentation, playbook, plan, or compact',
        mimeType: 'text/markdown'
      },
      async (uri) => {
        // Extract context type from URI
        const match = uri.pathname.match(/\/([^/]+)$/);
        const contextType = (match?.[1] || 'compact') as ContextFormat;

        let context: string;

        // Check cache first
        const cached = await this.contextCache.get(repoPath, contextType);
        if (cached) {
          context = cached;
        } else {
          switch (contextType) {
            case 'documentation':
              context = await this.contextBuilder.buildDocumentationContext(repoPath);
              break;
            case 'playbook':
              context = await this.contextBuilder.buildPlaybookContext(repoPath, 'generic');
              break;
            case 'plan':
              context = await this.contextBuilder.buildPlanContext(repoPath);
              break;
            case 'compact':
            default:
              context = await this.contextBuilder.buildCompactContext(repoPath);
              break;
          }
          // Store in cache for subsequent calls
          await this.contextCache.set(repoPath, contextType, context);
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/markdown',
            text: context
          }]
        };
      }
    );

    // Register file resource template
    this.server.registerResource(
      'file-content',
      `file://{path}`,
      {
        description: 'Read file contents from the repository',
        mimeType: 'text/plain'
      },
      async (uri) => {
        const filePath = uri.pathname;
        const result = await readFileTool.execute!(
          { filePath },
          { toolCallId: '', messages: [] }
        ) as { success: boolean; content?: string; error?: string };

        if (!result.success) {
          throw new Error(result.error || 'Failed to read file');
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: result.content || ''
          }]
        };
      }
    );

    this.log('Registered 2 resource templates');

    // Register PREVC workflow resources
    this.registerWorkflowResources();
  }

  /**
   * Register PREVC workflow resources
   * Uses initialRepoPath if found, otherwise process.cwd()
   */
  private registerWorkflowResources(): void {
    const repoPath = this.initialRepoPath ?? process.cwd();

    // workflow://status - Current workflow status
    this.server.registerResource(
      'workflow-status',
      'workflow://status',
      {
        description: 'Current PREVC workflow status including phases, roles, and progress',
        mimeType: 'application/json'
      },
      async () => {
        try {
          const service = new WorkflowService(repoPath);

          if (!(await service.hasWorkflow())) {
            return {
              contents: [{
                uri: 'workflow://status',
                mimeType: 'application/json',
                text: JSON.stringify({ error: 'No workflow found' }, null, 2)
              }]
            };
          }

          const summary = await service.getSummary();
          const status = await service.getStatus();

          return {
            contents: [{
              uri: 'workflow://status',
              mimeType: 'application/json',
              text: JSON.stringify({
                name: summary.name,
                scale: getScaleName(summary.scale as ProjectScale),
                currentPhase: summary.currentPhase,
                progress: summary.progress,
                isComplete: summary.isComplete,
                phases: status.phases,
                roles: status.roles,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            contents: [{
              uri: 'workflow://status',
              mimeType: 'application/json',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              }, null, 2)
            }]
          };
        }
      }
    );

    this.log('Registered 1 workflow resource');
  }

  /**
   * Initialize repo path with smart detection and caching
   *
   * Strategy:
   * 1. If explicit options.repoPath provided, try to find project root from there
   * 2. Otherwise search upward from process.cwd() for .context or .git
   * 3. Set as initialRepoPath if found (for resources)
   * 4. First valid repoPath from client gets cached for all subsequent tool calls
   * 5. Fallback to process.cwd() if nothing found (allows flexible MCP usage)
   */
  private async initializeRepoPath(): Promise<void> {
    const startPath = this.options.repoPath || process.cwd();
    const foundRoot = await this.findProjectRoot(startPath);

    if (foundRoot) {
      this.initialRepoPath = path.resolve(foundRoot);
      this.log(`Server initialized with project root: ${this.initialRepoPath}`);
    } else {
      // No project found - will use process.cwd() as fallback
      // This allows flexible MCP server usage without strict project detection
      this.initialRepoPath = null;
      this.log(`No project root found. Will use process.cwd() or first valid client-provided path.`);
    }
  }

  /**
   * Find project root by searching upward for .context or .git
   */
  private async findProjectRoot(startPath: string): Promise<string | null> {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    // Search upward for .context or .git
    while (currentPath !== root) {
      if (
        await fs.pathExists(path.join(currentPath, '.context')) ||
        await fs.pathExists(path.join(currentPath, '.git'))
      ) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }

    // Not found
    return null;
  }

  /**
   * Cache a valid repoPath from client
   * Only cache if it contains .context and we haven't cached yet
   */
  private cacheRepoPathIfValid(repoPath: string): void {
    if (this.cachedRepoPath) {
      return; // Already cached
    }

    const contextPath = path.join(repoPath, '.context');
    if (fs.existsSync(contextPath)) {
      this.cachedRepoPath = path.resolve(repoPath);
      process.stderr.write(`[mcp] ✓ Cached repoPath for this session: ${this.cachedRepoPath}\n`);
      this.log(`Cached valid repoPath: ${this.cachedRepoPath}`);
    }
  }

  /**
   * Get the effective repo path for a tool call
   * Priority: 1) explicit param, 2) cached path, 3) initial path, 4) process.cwd()
   */
  private getRepoPath(paramsRepoPath?: string): string {
    if (paramsRepoPath) {
      const resolved = path.resolve(paramsRepoPath);
      this.cacheRepoPathIfValid(resolved);
      return resolved;
    }

    if (this.cachedRepoPath) {
      this.log(`Using cached repoPath: ${this.cachedRepoPath}`);
      return this.cachedRepoPath;
    }

    if (this.initialRepoPath) {
      this.log(`Using initial repoPath: ${this.initialRepoPath}`);
      return this.initialRepoPath;
    }

    // Fallback to current working directory
    const cwd = process.cwd();
    this.log(`Using fallback cwd: ${cwd}`);
    return cwd;
  }

  private wrapWithActionLogging<TParams>(
    toolName: string,
    handler: (params: TParams) => Promise<MCPToolResponse>
  ): (params: TParams) => Promise<MCPToolResponse> {
    return async (params: TParams) => {
      const resolvedRepoPath = this.getRepoPath((params as { repoPath?: string })?.repoPath);
      const action = typeof (params as { action?: string })?.action === 'string'
        ? (params as { action?: string }).action!
        : toolName;

      // Validate file paths to prevent path traversal attacks
      try {
        this.validatePathParams(params, resolvedRepoPath);
      } catch (error) {
        if (error instanceof SecurityError) {
          this.log(`[SECURITY] Path traversal blocked: ${error.message} (tool: ${toolName}, path: ${error.attemptedPath})`);
          const errorResponse: MCPToolResponse = {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Security: ${error.message}` }) }],
            isError: true,
          };
          await this.logToolError(resolvedRepoPath, toolName, action, params, error);
          return errorResponse;
        }
        throw error;
      }

      try {
        const response = await handler(params);
        await this.logToolResponse(resolvedRepoPath, toolName, action, params, response);
        return response;
      } catch (error) {
        await this.logToolError(resolvedRepoPath, toolName, action, params, error);
        throw error;
      }
    };
  }

  /**
   * Validate path-related parameters against the workspace boundary.
   * Throws SecurityError if any path escapes the workspace.
   */
  private validatePathParams<TParams>(params: TParams, repoPath: string): void {
    const validator = new PathValidator(repoPath);
    const pathKeys: Array<keyof { filePath?: string; rootPath?: string; cwd?: string }> = ['filePath', 'rootPath', 'cwd'];

    for (const key of pathKeys) {
      const value = (params as Record<string, unknown>)[key as string];
      if (typeof value === 'string' && value.length > 0) {
        validator.validatePath(value);
      }
    }
  }

  private async logToolResponse<TParams>(
    repoPath: string,
    toolName: string,
    action: string,
    params: TParams,
    response: MCPToolResponse
  ): Promise<void> {
    const payload = this.parseResponsePayload(response);
    const success = typeof payload?.success === 'boolean'
      ? payload.success
      : !response.isError;
    const errorMessage = typeof payload?.error === 'string' ? payload.error : undefined;
    const resultSummary = payload ? this.buildResultSummary(payload) : undefined;

    await logMcpAction(repoPath, {
      tool: toolName,
      action,
      status: success ? 'success' : 'error',
      details: {
        params,
        ...(resultSummary ? { result: resultSummary } : {}),
      },
      ...(success ? {} : { error: errorMessage || 'Tool reported failure' }),
    });
  }

  private async logToolError<TParams>(
    repoPath: string,
    toolName: string,
    action: string,
    params: TParams,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    await logMcpAction(repoPath, {
      tool: toolName,
      action,
      status: 'error',
      details: { params },
      error: message,
    });
  }

  private parseResponsePayload(response: MCPToolResponse): Record<string, unknown> | null {
    const text = response.content?.[0]?.text;
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  private buildResultSummary(payload: Record<string, unknown>): Record<string, unknown> | null {
    const summaryKeys = [
      'success',
      'message',
      'currentPhase',
      'nextPhase',
      'phase',
      'scale',
      'planSlug',
      'count',
      'total',
      'status',
    ];
    const summary: Record<string, unknown> = {};

    for (const key of summaryKeys) {
      if (key in payload) {
        summary[key] = payload[key];
      }
    }

    return Object.keys(summary).length > 0 ? summary : null;
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    this.log('MCP Server started on stdio');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    await this.server.close();
    await this.contextBuilder.shutdown();
    this.log('MCP Server stopped');
  }

  /**
   * Log message to stderr (not stdout, to avoid polluting MCP messages)
   */
  private log(message: string): void {
    if (this.options.verbose) {
      process.stderr.write(`[mcp] ${message}\n`);
    }
  }
}

/**
 * Create and start an MCP server
 */
export async function startMCPServer(options: MCPServerOptions = {}): Promise<AIContextMCPServer> {
  const server = new AIContextMCPServer(options);
  await server.start();
  return server;
}
