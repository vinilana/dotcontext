/**
 * MCP Server - Model Context Protocol server for Claude Code integration
 *
 * Exposes a profile-aware tool surface for reduced context overhead.
 *
 * Simplified workflow: context init -> fillSingle -> workflow-init
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs-extra';

import { readFileTool } from '../ai/tools';
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
  type WorkflowInitParams,
  type WorkflowStatusParams,
  type WorkflowAdvanceParams,
  type WorkflowManageParams,
  type MCPToolResponse,
} from './gatewayTools';

type MCPServerProfile = 'standalone' | 'planning' | 'execution';
type MCPServerProfileInput = MCPServerProfile | 'full' | 'codex' | 'claude-code';

const PROFILE_TOOLSETS: Record<MCPServerProfile, ReadonlySet<string>> = {
  standalone: new Set(['explore', 'context', 'workflow-init', 'workflow-status', 'workflow-advance', 'workflow-manage', 'sync', 'plan', 'agent', 'skill']),
  planning: new Set(['explore', 'context', 'workflow-init', 'workflow-status', 'workflow-advance', 'workflow-manage', 'plan', 'agent', 'skill']),
  execution: new Set(['explore', 'workflow-init', 'workflow-status', 'workflow-advance', 'workflow-manage', 'plan']),
};

const HELP_TOPICS = ['overview', 'profiles', 'workflow-init', 'workflow-status', 'workflow-advance', 'workflow-manage'] as const;
type HelpTopic = (typeof HELP_TOPICS)[number];

function resolveServerProfile(profile?: string): MCPServerProfile {
  switch ((profile || '').trim().toLowerCase()) {
    case 'execution':
    case 'codex':
    case 'claude-code':
      return 'execution';
    case 'planning':
      return 'planning';
    case 'full':
    case 'standalone':
    default:
      return 'standalone';
  }
}

export interface MCPServerOptions {
  /** Default repository path for tools */
  repoPath?: string;
  /** Server name */
  name?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Tool-surface profile */
  profile?: MCPServerProfileInput;
  /** Optional injected SemanticContextBuilder for testing */
  contextBuilder?: SemanticContextBuilder;
}

export class AIContextMCPServer {
  private server: McpServer;
  private contextBuilder: SemanticContextBuilder;
  private readonly contextCache: ContextCache;
  private options: MCPServerOptions;
  private readonly profile: MCPServerProfile;
  private transport: StdioServerTransport | null = null;
  private initialRepoPath: string | null = null;
  private cachedRepoPath: string | null = null;

  constructor(options: MCPServerOptions = {}) {
    this.options = {
      name: 'dotcontext',
      verbose: false,
      ...options
    };
    this.profile = resolveServerProfile(options.profile || process.env.DOTCONTEXT_MCP_PROFILE);

    this.server = new McpServer({
      name: this.options.name!,
      version: VERSION
    });

    // Support dependency injection for testing, with default fallback
    this.contextBuilder = options.contextBuilder ?? new SemanticContextBuilder();
    this.contextCache = new ContextCache();

    // Initialize and cache the correct repo path
    void this.initializeRepoPath();

    this.log(`Using MCP profile: ${this.profile}`);
    this.registerGatewayTools();
    this.registerResources();
  }

  /**
   * Register tools for the active MCP profile.
   */
  private registerGatewayTools(): void {
    const wrap = <TParams>(
      toolName: string,
      handler: (params: TParams) => Promise<MCPToolResponse>
    ) => this.wrapWithActionLogging(toolName, handler);
    let registeredCount = 0;

    if (this.hasTool('explore')) {
      this.server.registerTool('explore', {
        description: 'Explore code and files: read, list, analyze, search, getStructure.',
        inputSchema: {
          action: z.enum(['read', 'list', 'analyze', 'search', 'getStructure']).describe('Action'),
          filePath: z.string().optional().describe('File path'),
          pattern: z.string().optional().describe('Pattern'),
          cwd: z.string().optional().describe('Working dir'),
          encoding: z.enum(['utf-8', 'ascii', 'binary']).optional().describe('Encoding'),
          ignore: z.array(z.string()).optional().describe('Ignore globs'),
          symbolTypes: z.array(z.enum(['class', 'interface', 'function', 'type', 'enum'])).optional().describe('Symbol kinds'),
          fileGlob: z.string().optional().describe('File glob'),
          maxResults: z.number().optional().describe('Max results'),
          rootPath: z.string().optional().describe('Root path'),
          maxDepth: z.number().optional().describe('Max depth'),
          includePatterns: z.array(z.string()).optional().describe('Include globs'),
        }
      }, wrap('explore', async (params): Promise<MCPToolResponse> => {
        return handleExplore(params as ExploreParams, { repoPath: this.getRepoPath() });
      }));
      registeredCount++;
    }

    if (this.hasTool('context')) {
      this.server.registerTool('context', {
        description: 'Scaffold and fetch context: check, init, fill, fillSingle, listToFill, getMap, buildSemantic, scaffoldPlan.',
        inputSchema: {
          action: z.enum(['check', 'init', 'fill', 'fillSingle', 'listToFill', 'getMap', 'buildSemantic', 'scaffoldPlan']).describe('Action'),
          repoPath: z.string().optional().describe('Repo path'),
          verbose: z.boolean().optional().describe('Verbose mode'),
          includeGuidance: z.boolean().optional().describe('Include guidance'),
          includeContent: z.boolean().optional().describe('Include inline content'),
          outputDir: z.string().optional().describe('Output dir'),
          type: z.enum(['docs', 'agents', 'both']).optional().describe('Scaffold type'),
          semantic: z.boolean().optional().describe('Use semantic analysis'),
          include: z.array(z.string()).optional().describe('Include globs'),
          exclude: z.array(z.string()).optional().describe('Exclude globs'),
          autoFill: z.boolean().optional().describe('Auto-fill'),
          skipContentGeneration: z.boolean().optional().describe('Skip content'),
          target: z.enum(['docs', 'agents', 'plans', 'all']).optional().describe('Target'),
          offset: z.number().optional().describe('Offset'),
          limit: z.number().optional().describe('Limit'),
          filePath: z.string().optional().describe('File path'),
          section: z.enum([
            'all', 'stack', 'structure', 'architecture', 'symbols',
            'symbols.classes', 'symbols.interfaces', 'symbols.functions',
            'symbols.types', 'symbols.enums', 'publicAPI', 'dependencies', 'stats',
            'keyFiles', 'navigation'
          ]).optional().describe('Map section'),
          contextType: z.enum(['documentation', 'playbook', 'plan', 'compact']).optional().describe('Context type'),
          targetFile: z.string().optional().describe('Target file'),
          options: z.object({
            useLSP: z.boolean().optional(),
            maxContextLength: z.number().optional(),
            includeDocumentation: z.boolean().optional(),
            includeSignatures: z.boolean().optional()
          }).optional().describe('Builder options'),
          planName: z.string().optional().describe('Plan name'),
          title: z.string().optional().describe('Title'),
          summary: z.string().optional().describe('Summary'),
        }
      }, wrap('context', async (params): Promise<MCPToolResponse> => {
        return handleContext(params as ContextParams, { repoPath: this.getRepoPath((params as ContextParams).repoPath), contextBuilder: this.contextBuilder });
      }));
      registeredCount++;
    }

    this.server.registerTool('workflow-init', {
      description: 'Initialize a PREVC workflow.',
      inputSchema: {
        name: z.string().describe('Workflow name'),
        description: z.string().optional().describe('Task summary'),
        scale: z.enum(['QUICK', 'SMALL', 'MEDIUM', 'LARGE']).optional().describe('Scale'),
        autonomous: z.boolean().optional().describe('Bypass gates'),
        require_plan: z.boolean().optional().describe('Require plan'),
        require_approval: z.boolean().optional().describe('Require approval'),
        archive_previous: z.boolean().optional().describe('Archive current workflow'),
        verbose: z.boolean().optional().describe('Verbose mode'),
        includeGuidance: z.boolean().optional().describe('Include guidance'),
        includeOrchestration: z.boolean().optional().describe('Include bundle'),
        includeLegacy: z.boolean().optional().describe('Legacy payload'),
        profile: z.enum(['standalone', 'planning', 'execution', 'codex', 'claude-code']).optional().describe('Client profile'),
      }
    }, wrap('workflow-init', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowInit(params as WorkflowInitParams, { repoPath: this.getRepoPath((params as WorkflowInitParams).repoPath) });
    }));
    registeredCount++;

    this.server.registerTool('workflow-status', {
      description: 'Get PREVC workflow status.',
      inputSchema: {
        revision: z.string().optional().describe('Last revision'),
        verbose: z.boolean().optional().describe('Verbose mode'),
        includeGuidance: z.boolean().optional().describe('Include guidance'),
        includeOrchestration: z.boolean().optional().describe('Include bundle'),
        includeLegacy: z.boolean().optional().describe('Legacy payload'),
        profile: z.enum(['standalone', 'planning', 'execution', 'codex', 'claude-code']).optional().describe('Client profile'),
      }
    }, wrap('workflow-status', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowStatus(params as WorkflowStatusParams, { repoPath: this.getRepoPath((params as WorkflowStatusParams).repoPath) });
    }));
    registeredCount++;

    this.server.registerTool('workflow-advance', {
      description: 'Advance the PREVC workflow to the next phase.',
      inputSchema: {
        outputs: z.array(z.string()).optional().describe('Artifacts'),
        force: z.boolean().optional().describe('Bypass gates'),
        verbose: z.boolean().optional().describe('Verbose mode'),
        includeGuidance: z.boolean().optional().describe('Include guidance'),
        includeOrchestration: z.boolean().optional().describe('Include bundle'),
        includeLegacy: z.boolean().optional().describe('Legacy payload'),
        profile: z.enum(['standalone', 'planning', 'execution', 'codex', 'claude-code']).optional().describe('Client profile'),
      }
    }, wrap('workflow-advance', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowAdvance(params as WorkflowAdvanceParams, { repoPath: this.getRepoPath((params as WorkflowAdvanceParams).repoPath) });
    }));
    registeredCount++;

    this.server.registerTool('workflow-manage', {
      description: 'Manage workflow handoffs, approvals, docs, and gates.',
      inputSchema: {
        action: z.enum(['handoff', 'collaborate', 'createDoc', 'getGates', 'approvePlan', 'setAutonomous']).describe('Action'),
        from: z.string().optional().describe('From agent'),
        to: z.string().optional().describe('To agent'),
        artifacts: z.array(z.string()).optional().describe('Artifacts'),
        topic: z.string().optional().describe('Topic'),
        participants: z.array(z.enum(PREVC_ROLES as unknown as [string, ...string[]])).optional().describe('Roles'),
        type: z.enum(['prd', 'tech-spec', 'architecture', 'adr', 'test-plan', 'changelog']).optional().describe('Doc type'),
        docName: z.string().optional().describe('Doc name'),
        planSlug: z.string().optional().describe('Plan slug'),
        approver: z.enum(PREVC_ROLES as unknown as [string, ...string[]]).optional().describe('Approver'),
        notes: z.string().optional().describe('Notes'),
        enabled: z.boolean().optional().describe('Enabled'),
        reason: z.string().optional().describe('Reason'),
        verbose: z.boolean().optional().describe('Verbose mode'),
        includeGuidance: z.boolean().optional().describe('Include guidance'),
        includeLegacy: z.boolean().optional().describe('Legacy payload'),
        profile: z.enum(['standalone', 'planning', 'execution', 'codex', 'claude-code']).optional().describe('Client profile'),
      }
    }, wrap('workflow-manage', async (params): Promise<MCPToolResponse> => {
      return handleWorkflowManage(params as WorkflowManageParams, { repoPath: this.getRepoPath((params as WorkflowManageParams).repoPath) });
    }));
    registeredCount++;

    if (this.hasTool('sync')) {
      this.server.registerTool('sync', {
        description: 'Sync docs, agents, skills, and rules with AI tools.',
        inputSchema: {
          action: z.enum(['exportRules', 'exportDocs', 'exportAgents', 'exportContext', 'exportSkills', 'reverseSync', 'importDocs', 'importAgents', 'importSkills']).describe('Action'),
          preset: z.string().optional().describe('Preset'),
          force: z.boolean().optional().describe('Overwrite'),
          dryRun: z.boolean().optional().describe('Preview only'),
          indexMode: z.enum(['readme', 'all']).optional().describe('Doc index'),
          mode: z.enum(['symlink', 'markdown']).optional().describe('Sync mode'),
          skipDocs: z.boolean().optional().describe('Skip docs'),
          skipAgents: z.boolean().optional().describe('Skip agents'),
          skipSkills: z.boolean().optional().describe('Skip skills'),
          skipRules: z.boolean().optional().describe('Skip rules'),
          docsIndexMode: z.enum(['readme', 'all']).optional().describe('Context doc index'),
          agentMode: z.enum(['symlink', 'markdown']).optional().describe('Agent mode'),
          includeBuiltInSkills: z.boolean().optional().describe('Include built-in skills'),
          includeBuiltIn: z.boolean().optional().describe('Include built-ins'),
          mergeStrategy: z.enum(['skip', 'overwrite', 'merge', 'rename']).optional().describe('Merge strategy'),
          autoDetect: z.boolean().optional().describe('Auto-detect'),
          addMetadata: z.boolean().optional().describe('Add metadata'),
          repoPath: z.string().optional().describe('Repo path'),
        }
      }, wrap('sync', async (params): Promise<MCPToolResponse> => {
        return handleSync(params as SyncParams, { repoPath: this.getRepoPath((params as SyncParams).repoPath) });
      }));
      registeredCount++;
    }

    this.server.registerTool('plan', {
      description: 'Track plans and PREVC execution state.',
      inputSchema: {
        action: z.enum(['link', 'getLinked', 'getDetails', 'getForPhase', 'updatePhase', 'recordDecision', 'updateStep', 'getStatus', 'syncMarkdown', 'commitPhase']).describe('Action'),
        planSlug: z.string().optional().describe('Plan slug'),
        phaseId: z.string().optional().describe('Phase id'),
        status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional().describe('Status'),
        phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional().describe('PREVC phase'),
        title: z.string().optional().describe('Title'),
        description: z.string().optional().describe('Description'),
        alternatives: z.array(z.string()).optional().describe('Alternatives'),
        stepIndex: z.number().optional().describe('Step index'),
        output: z.string().optional().describe('Output'),
        notes: z.string().optional().describe('Notes'),
        coAuthor: z.string().optional().describe('Co-author'),
        stagePatterns: z.array(z.string()).optional().describe('Stage patterns'),
        dryRun: z.boolean().optional().describe('Preview only'),
      }
    }, wrap('plan', async (params): Promise<MCPToolResponse> => {
      return handlePlan(params as PlanParams, { repoPath: this.getRepoPath() });
    }));
    registeredCount++;

    if (this.hasTool('agent')) {
      this.server.registerTool('agent', {
        description: 'Discover agents and orchestration sequences.',
        inputSchema: {
          action: z.enum(['discover', 'getInfo', 'orchestrate', 'getSequence', 'getDocs', 'getPhaseDocs', 'listTypes']).describe('Action'),
          verbose: z.boolean().optional().describe('Verbose mode'),
          includeDocs: z.boolean().optional().describe('Include docs'),
          agentType: z.string().optional().describe('Agent type'),
          task: z.string().optional().describe('Task'),
          phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional().describe('Phase'),
          role: z.enum(PREVC_ROLES as unknown as [string, ...string[]]).optional().describe('Role'),
          includeReview: z.boolean().optional().describe('Include review'),
          phases: z.array(z.enum(['P', 'R', 'E', 'V', 'C'])).optional().describe('Phase list'),
          agent: z.enum(AGENT_TYPES as unknown as [string, ...string[]]).optional().describe('Agent'),
        }
      }, wrap('agent', async (params): Promise<MCPToolResponse> => {
        return handleAgent(params as AgentParams, { repoPath: this.getRepoPath() });
      }));
      registeredCount++;
    }

    if (this.hasTool('skill')) {
      this.server.registerTool('skill', {
        description: 'List, read, scaffold, or export skills.',
        inputSchema: {
          action: z.enum(['list', 'getContent', 'getForPhase', 'scaffold', 'export', 'fill']).describe('Action'),
          skillSlug: z.string().optional().describe('Skill slug'),
          phase: z.enum(['P', 'R', 'E', 'V', 'C']).optional().describe('Phase'),
          skills: z.array(z.string()).optional().describe('Skills'),
          includeContent: z.boolean().optional().describe('Include content'),
          includeBuiltIn: z.boolean().optional().describe('Include built-ins'),
          preset: z.enum(['claude', 'gemini', 'codex', 'antigravity', 'all']).optional().describe('Preset'),
          force: z.boolean().optional().describe('Overwrite'),
        }
      }, wrap('skill', async (params): Promise<MCPToolResponse> => {
        return handleSkill(params as SkillParams, { repoPath: this.getRepoPath() });
      }));
      registeredCount++;
    }

    this.log(`Registered ${registeredCount} MCP tools for ${this.profile} profile`);
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
        description: 'Codebase context: documentation, playbook, plan, compact.',
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
        description: 'Read a repository file.',
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

    this.log('Registered base MCP resources');

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
        description: 'Current PREVC workflow status.',
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
                text: JSON.stringify({ error: 'No workflow found' })
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
              })
            }]
          };
        } catch (error) {
          return {
            contents: [{
              uri: 'workflow://status',
              mimeType: 'application/json',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }]
          };
        }
      }
    );

    this.server.registerResource(
      'workflow-guide',
      'workflow://guide/{topic}',
      {
        description: 'Workflow help topics: overview, profiles, workflow-init, workflow-status, workflow-advance, workflow-manage.',
        mimeType: 'text/markdown'
      },
      async (uri) => {
        const match = uri.pathname.match(/\/([^/]+)$/);
        const topic = (match?.[1] || 'overview') as HelpTopic;
        const safeTopic = (HELP_TOPICS as readonly string[]).includes(topic) ? topic : 'overview';

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/markdown',
            text: this.buildWorkflowGuide(safeTopic)
          }]
        };
      }
    );

    this.log('Registered workflow resources');
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

  private hasTool(toolName: string): boolean {
    return PROFILE_TOOLSETS[this.profile].has(toolName);
  }

  private buildWorkflowGuide(topic: HelpTopic): string {
    const intro = `# dotcontext Workflow Help\n\nProfile: \`${this.profile}\`\n`;

    switch (topic) {
      case 'profiles':
        return `${intro}
## Profiles

- \`standalone\`: full tool surface, including sync and onboarding helpers
- \`planning\`: trims sync, keeps planning/orchestration tools
- \`execution\`: lean PREVC loop for status, advance, manage, and plan updates

Set \`DOTCONTEXT_MCP_PROFILE\` or pass \`profile\` to the server constructor to switch profiles.`;
      case 'workflow-init':
        return `${intro}
## workflow-init

Use this after context scaffolding exists.

- Required: \`name\`
- Common options: \`description\`, \`scale\`, \`autonomous\`
- Next step: call \`workflow-status\` or \`workflow-advance\``;
      case 'workflow-status':
        return `${intro}
## workflow-status

Poll the active PREVC workflow.

- Use it to inspect the current phase and progress
- Read \`workflow://status\` when you want the resource form
- In execution mode this is part of the hot path`;
      case 'workflow-advance':
        return `${intro}
## workflow-advance

Moves the workflow to the next PREVC phase.

- Optional: \`outputs\` for artifacts from the current phase
- Optional: \`force\` to bypass gates
- If blocked, inspect gates with \`workflow-manage\``;
      case 'workflow-manage':
        return `${intro}
## workflow-manage

Use for handoffs, approvals, docs, and gate checks.

- \`handoff\`: move work between agents
- \`getGates\`: inspect blockers
- \`approvePlan\`: unlock review to execution
- \`setAutonomous\`: bypass gates temporarily`;
      case 'overview':
      default:
        return `${intro}
## Runtime Surface

Normal runtime payloads are meant to stay compact. Use these resources when you need extra guidance instead of relying on verbose tool responses.

- \`workflow://guide/profiles\`
- \`workflow://guide/workflow-init\`
- \`workflow://guide/workflow-status\`
- \`workflow://guide/workflow-advance\`
- \`workflow://guide/workflow-manage\``;
    }
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
