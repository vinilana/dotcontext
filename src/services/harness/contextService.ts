/**
 * Harness Context Service
 *
 * Transport-agnostic context, semantic analysis, and scaffold orchestration logic.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import {
  checkScaffoldingTool,
  initializeContextTool,
  scaffoldPlanTool,
  fillScaffoldingTool,
  listFilesToFillTool,
  fillSingleFileTool,
  getCodebaseMapTool,
} from './contextTools';
import { SemanticContextBuilder, type ContextFormat } from '../semantic/contextBuilder';
import { CodebaseAnalyzer } from '../semantic/codebaseAnalyzer';
import { QAService } from '../qa';
import {
  getContextLayoutByClassification,
  toolExecutionContext,
  type ContextLayoutEntry,
} from '../shared';
import { HarnessWorkflowStateService } from './workflowStateService';

export interface HarnessContextServiceOptions {
  repoPath: string;
  contextBuilder: SemanticContextBuilder;
}

export interface HarnessContextInitResult {
  result: Record<string, unknown>;
  scaffold: {
    filesGenerated?: number;
    pendingFiles?: string[];
    repoPath?: string;
    enhancementPrompt?: string;
    nextSteps?: string[];
  } | null;
}

export interface HarnessContextPlanScaffoldResult {
  result: Record<string, unknown>;
  scaffold: {
    filesGenerated?: number;
    pendingFiles?: string[];
    repoPath?: string;
  } | null;
}

export interface HarnessBootstrapStatusResult {
  success: true;
  repoPath: string;
  outputDir: string;
  layout: {
    versioned: ContextLayoutEntry[];
    local: ContextLayoutEntry[];
    runtime: ContextLayoutEntry[];
  };
  scaffold: {
    initialized: boolean;
    docs: boolean;
    agents: boolean;
    skills: boolean;
    sensors: boolean;
    plans: boolean;
    qa: boolean;
  };
  runtime: {
    workflow: boolean;
    harness: boolean;
    harnessBinding: boolean;
    sessionCount: number;
    traceCount: number;
    artifactSessionCount: number;
  };
  readiness: {
    scaffoldReady: boolean;
    skillsReady: boolean;
    sensorsReady: boolean;
    workflowReady: boolean;
    harnessReady: boolean;
    configurationReady: boolean;
    runtimeReady: boolean;
    complete: boolean;
  };
  nextSteps: string[];
}

export class HarnessContextService {
  constructor(private readonly options: HarnessContextServiceOptions) {}

  private get repoPath(): string {
    return this.options.repoPath;
  }

  async check(repoPath?: string): Promise<unknown> {
    return checkScaffoldingTool.execute!(
      { repoPath: repoPath || this.repoPath },
      toolExecutionContext
    );
  }

  async bootstrapStatus(repoPath?: string): Promise<HarnessBootstrapStatusResult> {
    const resolvedRepoPath = path.resolve(repoPath || this.repoPath);
    const outputDir = path.join(resolvedRepoPath, '.context');
    const scaffoldStatus = await this.check(resolvedRepoPath) as Record<string, unknown>;
    const workflowStateService = new HarnessWorkflowStateService({ contextPath: outputDir });

    const harnessDir = path.join(outputDir, 'harness');
    const qaDir = path.join(outputDir, 'docs', 'qa');
    const sessionsDir = path.join(harnessDir, 'sessions');
    const tracesDir = path.join(harnessDir, 'traces');
    const artifactsDir = path.join(harnessDir, 'artifacts');

    const [qa, workflowActive, harnessBinding, sessionCount, traceCount, artifactSessionCount] = await Promise.all([
      fs.pathExists(qaDir).then((exists) => exists ? fs.readdir(qaDir).then((entries) => entries.some((entry) => entry.endsWith('.md') && entry.toLowerCase() !== 'readme.md')) : false),
      workflowStateService.exists(),
      workflowStateService.getBinding().then((binding) => Boolean(binding)),
      fs.pathExists(sessionsDir).then((exists) => exists ? fs.readdir(sessionsDir).then((entries) => entries.filter((entry) => entry.endsWith('.json')).length) : 0),
      fs.pathExists(tracesDir).then((exists) => exists ? fs.readdir(tracesDir).then((entries) => entries.filter((entry) => entry.endsWith('.jsonl')).length) : 0),
      fs.pathExists(artifactsDir).then((exists) => exists ? fs.readdir(artifactsDir).then((entries) => entries.length) : 0),
    ]);

    const scaffold = {
      initialized: Boolean(scaffoldStatus.initialized),
      docs: Boolean(scaffoldStatus.docs),
      agents: Boolean(scaffoldStatus.agents),
      skills: Boolean(scaffoldStatus.skills),
      sensors: Boolean(scaffoldStatus.sensors),
      plans: Boolean(scaffoldStatus.plans),
      qa,
    };

    const runtime = {
      workflow: Boolean(scaffoldStatus.workflow) || workflowActive,
      harness: Boolean(scaffoldStatus.harness),
      harnessBinding,
      sessionCount,
      traceCount,
      artifactSessionCount,
    };

    const readiness = {
      scaffoldReady: scaffold.initialized && (scaffold.docs || scaffold.agents || scaffold.skills || scaffold.plans),
      skillsReady: scaffold.skills,
      sensorsReady: scaffold.sensors,
      workflowReady: runtime.workflow,
      harnessReady: runtime.harness && (runtime.harnessBinding || runtime.sessionCount > 0),
      configurationReady: false,
      runtimeReady: false,
      complete: false,
    };
    readiness.configurationReady = readiness.scaffoldReady && readiness.skillsReady && readiness.sensorsReady;
    readiness.runtimeReady = readiness.workflowReady && readiness.harnessReady;
    readiness.complete = readiness.configurationReady && readiness.runtimeReady;

    const nextSteps: string[] = [];
    if (!scaffold.initialized) {
      nextSteps.push('Run context init to scaffold .context assets.');
    } else {
      if (!scaffold.skills) {
        nextSteps.push('Regenerate or create .context/skills so skills are available to agents.');
      }
      if (!scaffold.sensors) {
        nextSteps.push('Regenerate or create .context/harness/sensors.json so quality sensors are customizable.');
      }
      if (!runtime.workflow) {
        nextSteps.push('Run workflow-init to create .context/workflow and enable PREVC execution.');
      }
      if (runtime.workflow && !runtime.harnessBinding) {
        nextSteps.push('Create or refresh the workflow harness binding so workflow and harness stay connected.');
      }
      if (!runtime.harness) {
        nextSteps.push('Run a workflow or harness action to materialize .context/harness runtime state.');
      }
    }
    if (nextSteps.length === 0) {
      nextSteps.push('Bootstrap is complete. The repository has scaffolded context, workflow state, and active harness runtime artifacts.');
    }

    return {
      success: true,
      repoPath: resolvedRepoPath,
      outputDir,
      layout: {
        versioned: getContextLayoutByClassification('versioned'),
        local: getContextLayoutByClassification('local'),
        runtime: getContextLayoutByClassification('runtime'),
      },
      scaffold,
      runtime,
      readiness,
      nextSteps,
    };
  }

  async init(params: {
    repoPath?: string;
    type?: 'docs' | 'agents' | 'both';
    outputDir?: string;
    semantic?: boolean;
    include?: string[];
    exclude?: string[];
    autoFill?: boolean;
    skipContentGeneration?: boolean;
    generateQA?: boolean;
  }): Promise<HarnessContextInitResult> {
    const repoPath = params.repoPath || this.repoPath;
    const result = await initializeContextTool.execute!(
      {
        repoPath,
        type: params.type,
        outputDir: params.outputDir,
        semantic: params.semantic,
        include: params.include,
        exclude: params.exclude,
        autoFill: params.autoFill,
        skipContentGeneration: params.skipContentGeneration,
        generateQA: params.generateQA,
      },
      toolExecutionContext
    ) as Record<string, unknown>;

    const pendingWrites = result.pendingWrites as Array<{ filePath: string }> | undefined;
    if (pendingWrites && pendingWrites.length > 0) {
      return {
        result,
        scaffold: {
          filesGenerated: pendingWrites.length,
          pendingFiles: pendingWrites.map(p => p.filePath),
          repoPath,
          enhancementPrompt: `SCAFFOLDING CREATED - CONTENT REQUIRED

NEXT ACTIONS REQUIRED:
1. Fill scaffold files with content using fillSingle for each pending file
2. Initialize a PREVC workflow to enable structured development

WORKFLOW:
Step 1: Use context with action "fillSingle" for each file in pendingFiles array
Step 2: Use workflow-init with name parameter to create workflow (creates .context/workflow/)

Skip workflow-init ONLY if making trivial changes (typos, single-line edits).`,
          nextSteps: [
            'REQUIRED: Call context with action "fillSingle" for each file in pendingFiles',
            'RECOMMENDED: Call workflow-init with name parameter after filling files',
            'OPTIONAL: Skip workflow-init only for trivial changes (typos, single edits)'
          ],
        },
      };
    }

    return {
      result,
      scaffold: {
        enhancementPrompt: `✓ SCAFFOLDING READY

RECOMMENDED NEXT ACTION:
Initialize a PREVC workflow to enable structured development.

Use workflow-init with name parameter to create workflow structure.
This creates .context/workflow/ and enables phase-gated execution (Plan → Review → Execute → Verify → Complete).

Skip ONLY for trivial changes (typos, single-line edits).`,
        nextSteps: [
          'RECOMMENDED: Call workflow-init with name parameter to enable PREVC phases',
          'OPTIONAL: Skip workflow-init only for trivial changes'
        ],
      },
    };
  }

  async fill(params: {
    repoPath?: string;
    outputDir?: string;
    target?: 'docs' | 'agents' | 'skills' | 'plans' | 'all';
    offset?: number;
    limit?: number;
  }): Promise<unknown> {
    return fillScaffoldingTool.execute!(
      {
        repoPath: params.repoPath || this.repoPath,
        outputDir: params.outputDir,
        target: params.target,
        offset: params.offset,
        limit: params.limit
      },
      toolExecutionContext
    );
  }

  async fillSingle(params: { repoPath?: string; filePath: string }): Promise<unknown> {
    return fillSingleFileTool.execute!(
      { repoPath: params.repoPath || this.repoPath, filePath: params.filePath },
      toolExecutionContext
    );
  }

  async listToFill(params: {
    repoPath?: string;
    outputDir?: string;
    target?: 'docs' | 'agents' | 'skills' | 'plans' | 'all';
  }): Promise<unknown> {
    return listFilesToFillTool.execute!(
      {
        repoPath: params.repoPath || this.repoPath,
        outputDir: params.outputDir,
        target: params.target
      },
      toolExecutionContext
    );
  }

  async getMap(params: { repoPath?: string; section?: string }): Promise<unknown> {
    return getCodebaseMapTool.execute!(
      {
        repoPath: params.repoPath || this.repoPath,
        section: params.section as any
      },
      toolExecutionContext
    );
  }

  async buildSemantic(params: {
    repoPath?: string;
    contextType?: 'documentation' | 'playbook' | 'plan' | 'compact';
    targetFile?: string;
    options?: {
      useLSP?: boolean;
      maxContextLength?: number;
      includeDocumentation?: boolean;
      includeSignatures?: boolean;
    };
  }): Promise<string> {
    const repoPath = params.repoPath || this.repoPath;
    const isLocalBuilder = !!params.options;
    const builder = isLocalBuilder
      ? new SemanticContextBuilder(params.options)
      : this.options.contextBuilder;

    try {
      const contextType = (params.contextType || 'compact') as ContextFormat;

      switch (contextType) {
        case 'documentation':
          return await builder.buildDocumentationContext(repoPath, params.targetFile);
        case 'playbook':
          return await builder.buildPlaybookContext(repoPath, params.targetFile || 'generic');
        case 'plan':
          return await builder.buildPlanContext(repoPath, params.targetFile);
        case 'compact':
        default:
          return await builder.buildCompactContext(repoPath);
      }
    } finally {
      if (isLocalBuilder) {
        await builder.shutdown();
      }
    }
  }

  async scaffoldPlan(params: {
    planName: string;
    repoPath?: string;
    outputDir?: string;
    title?: string;
    summary?: string;
    semantic?: boolean;
    autoFill?: boolean;
  }): Promise<HarnessContextPlanScaffoldResult> {
    const repoPath = params.repoPath || this.repoPath;
    const result = await scaffoldPlanTool.execute!(
      {
        planName: params.planName,
        repoPath,
        outputDir: params.outputDir,
        title: params.title,
        summary: params.summary,
        semantic: params.semantic,
        autoFill: params.autoFill
      },
      toolExecutionContext
    ) as Record<string, unknown>;

    const planPath = result.planPath as string | undefined;
    return {
      result,
      scaffold: result.success && planPath
        ? {
            filesGenerated: 1,
            pendingFiles: [planPath],
            repoPath,
          }
        : null,
    };
  }

  async searchQA(params: {
    repoPath?: string;
    query: string;
    options?: {
      useLSP?: boolean;
      maxContextLength?: number;
      includeDocumentation?: boolean;
      includeSignatures?: boolean;
    };
  }): Promise<Record<string, unknown>> {
    const qaService = new QAService(params.options);
    try {
      const results = await qaService.search(params.repoPath || this.repoPath, params.query);
      return {
        query: params.query,
        results,
        count: results.length,
      };
    } finally {
      await qaService.shutdown();
    }
  }

  async generateQA(params: {
    repoPath?: string;
    options?: {
      useLSP?: boolean;
      maxContextLength?: number;
      includeDocumentation?: boolean;
      includeSignatures?: boolean;
    };
  }): Promise<Record<string, unknown>> {
    const qaService = new QAService(params.options);
    try {
      const result = await qaService.generateFromCodebase(params.repoPath || this.repoPath);
      return {
        generated: result.generated.length,
        skipped: result.skipped,
        projectType: result.topicDetection.projectType,
        topics: result.topicDetection.topics.map((t) => t.slug),
        files: result.generated.map((e) => `${e.slug}.md`),
      };
    } finally {
      await qaService.shutdown();
    }
  }

  async getFlow(params: {
    repoPath?: string;
    entryFile: string;
    entryFunction?: string;
    options?: {
      useLSP?: boolean;
      maxContextLength?: number;
      includeDocumentation?: boolean;
      includeSignatures?: boolean;
    };
  }): Promise<Record<string, unknown>> {
    const analyzer = new CodebaseAnalyzer(params.options);
    try {
      const flow = await analyzer.traceFlow(
        params.repoPath || this.repoPath,
        params.entryFile,
        params.entryFunction
      );
      return {
        entryPoint: flow.entryPoint,
        nodeCount: flow.nodes.length,
        edgeCount: flow.edges.length,
        mermaid: flow.mermaidDiagram,
        nodes: flow.nodes.slice(0, 20),
        edges: flow.edges.slice(0, 30),
      };
    } finally {
      await analyzer.shutdown();
    }
  }

  async detectPatterns(params: {
    repoPath?: string;
    options?: {
      useLSP?: boolean;
      maxContextLength?: number;
      includeDocumentation?: boolean;
      includeSignatures?: boolean;
    };
  }): Promise<Record<string, unknown>> {
    const analyzer = new CodebaseAnalyzer(params.options);
    try {
      const patterns = await analyzer.detectFunctionalPatterns(params.repoPath || this.repoPath);
      return {
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
      };
    } finally {
      await analyzer.shutdown();
    }
  }
}
