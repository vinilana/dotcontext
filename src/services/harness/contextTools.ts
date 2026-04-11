import * as fs from 'fs-extra';
import { glob } from 'glob';
import * as path from 'path';
import { TreeSitterLayer } from '../semantic/treeSitter/treeSitterLayer';
import { SemanticContextBuilder } from '../semantic/contextBuilder';
import { DEFAULT_EXCLUDE_PATTERNS } from '../semantic/types';
import { FileMapper } from '../../utils/fileMapper';
import { needsFill } from '../../utils/frontMatter';
import { getScaffoldStructure, serializeStructureForAI } from '../../generators/shared/scaffoldStructures';
import { DocumentationGenerator } from '../../generators/documentation/documentationGenerator';
import type { CodebaseMap } from '../../generators/documentation';
import { AgentGenerator } from '../../generators/agents/agentGenerator';
import { SkillGenerator } from '../../generators/skills/skillGenerator';
import { PlanGenerator } from '../../generators/plans/planGenerator';
import {
  StackDetector,
  classifyProject,
  getAgentsForProjectType,
  getDocsForProjectType,
  getSkillsForProjectType,
  type ProjectType,
  type ProjectClassification,
} from '../stack';
import { QAService } from '../qa';
import { HarnessPolicyService } from './policyService';
import { HarnessSensorCatalogService } from './sensorCatalogService';
import { getUntrackedContextLayoutEntries } from '../shared';
import { createSkillRegistry } from '../../workflow/skills';
import { ensureGitignorePatterns } from '../../utils/gitignoreManager';

type ToolContext = unknown;

interface InternalTool<TInput, TOutput> {
  description: string;
  execute(input: TInput, context?: ToolContext): Promise<TOutput>;
}

function createInternalTool<TInput, TOutput>(
  description: string,
  execute: (input: TInput, context?: ToolContext) => Promise<TOutput>
): InternalTool<TInput, TOutput> {
  return { description, execute };
}

type ScaffoldTarget = 'docs' | 'agents' | 'skills' | 'plans' | 'sensors' | 'all';
type ScaffoldFileType = 'doc' | 'agent' | 'skill' | 'plan' | 'sensor';

interface ScaffoldFileInfo {
  path: string;
  relativePath: string;
  type: ScaffoldFileType;
  documentName: string;
}

interface RequiredAction {
  order: number;
  actionType: 'WRITE_FILE' | 'CALL_TOOL' | 'VERIFY';
  filePath: string;
  fileType: ScaffoldFileType;
  instructions: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

async function collectScaffoldFiles(
  outputDir: string,
  target: ScaffoldTarget = 'all'
): Promise<ScaffoldFileInfo[]> {
  const files: ScaffoldFileInfo[] = [];

  if (target === 'all' || target === 'docs') {
    const docsDir = path.join(outputDir, 'docs');
    if (await fs.pathExists(docsDir)) {
      const docFiles = await glob('**/*.md', { cwd: docsDir, nodir: true });
      for (const file of docFiles.sort()) {
        const filePath = path.join(docsDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
          relativePath: path.join('docs', file),
          type: 'doc',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  if (target === 'all' || target === 'agents') {
    const agentsDir = path.join(outputDir, 'agents');
    if (await fs.pathExists(agentsDir)) {
      const agentFiles = await glob('**/*.md', { cwd: agentsDir, nodir: true });
      for (const file of agentFiles.sort()) {
        const filePath = path.join(agentsDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
          relativePath: path.join('agents', file),
          type: 'agent',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  if (target === 'all' || target === 'skills') {
    const skillsDir = path.join(outputDir, 'skills');
    if (await fs.pathExists(skillsDir)) {
      const skillFiles = await glob('**/SKILL.md', { cwd: skillsDir, nodir: true });
      for (const file of skillFiles.sort()) {
        const skillPath = path.join(skillsDir, file);
        if (!await needsFill(skillPath)) continue;
        const segments = file.split(path.sep);

        files.push({
          path: skillPath,
          relativePath: path.join('skills', file),
          type: 'skill',
          documentName: segments[0],
        });
      }
    }
  }

  if (target === 'all' || target === 'plans') {
    const plansDir = path.join(outputDir, 'plans');
    if (await fs.pathExists(plansDir)) {
      const planFiles = await glob('**/*.md', { cwd: plansDir, nodir: true });
      for (const file of planFiles.sort()) {
        const filePath = path.join(plansDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
          relativePath: path.join('plans', file),
          type: 'plan',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  if (target === 'all' || target === 'sensors') {
    const sensorsPath = path.join(outputDir, 'harness', 'sensors.json');
    if (await fs.pathExists(sensorsPath) && await sensorCatalogNeedsFill(sensorsPath)) {
      files.push({
        path: sensorsPath,
        relativePath: path.join('harness', 'sensors.json'),
        type: 'sensor',
        documentName: 'sensors',
      });
    }
  }

  return files;
}

function resolveScaffoldFileInfo(outputDir: string, filePath: string): ScaffoldFileInfo {
  const resolvedOutputDir = path.resolve(outputDir);
  const resolvedFilePath = path.resolve(filePath);
  const relativePath = path.relative(resolvedOutputDir, resolvedFilePath);
  const segments = relativePath.split(path.sep);

  if (segments[0] === 'skills' && segments.length >= 3 && segments[2] === 'SKILL.md') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'skill',
      documentName: segments[1],
    };
  }

  if (segments[0] === 'agents') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'agent',
      documentName: path.basename(resolvedFilePath, '.md'),
    };
  }

  if (segments[0] === 'plans') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'plan',
      documentName: path.basename(resolvedFilePath, '.md'),
    };
  }

  if (segments[0] === 'harness' && segments[1] === 'sensors.json') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'sensor',
      documentName: 'sensors',
    };
  }

  return {
    path: resolvedFilePath,
    relativePath,
    type: 'doc',
    documentName: path.basename(resolvedFilePath, '.md'),
  };
}

function getDocFillInstructions(fileName: string): string {
  return `Fill ${fileName} with repository-specific documentation. Use concrete paths, conventions, and examples from this codebase instead of placeholders.`;
}

function getAgentFillInstructions(agentType: string): string {
  return `Fill the ${agentType} playbook with concrete responsibilities, relevant files, workflows, and quality checks used in this repository.`;
}

function getSkillFillInstructions(skillSlug: string): string {
  return `Fill the ${skillSlug} skill with project-specific guidance, examples, and references to real files and conventions from this repository.`;
}

function getSensorFillInstructions(): string {
  return 'Review .context/harness/sensors.json and rewrite it as a project-specific sensor catalog. Keep the JSON schema valid, keep version at 1, set source to "manual", preserve stack metadata, and keep only commands that make sense for this repository.';
}

async function sensorCatalogNeedsFill(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readJson(filePath) as { source?: string };
    return content.source !== 'manual';
  } catch {
    return false;
  }
}

async function hasContent(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function hasSkillContent(skillsDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      const stat = await fs.stat(skillDir).catch(() => null);
      if (!stat?.isDirectory()) continue;
      if (await fs.pathExists(path.join(skillDir, 'SKILL.md'))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function hasHarnessRuntimeContent(harnessDir: string): Promise<boolean> {
  const runtimeEntries = ['sessions', 'traces', 'artifacts', 'contracts', 'workflows', 'replays', 'datasets'];
  for (const entry of runtimeEntries) {
    if (await hasContent(path.join(harnessDir, entry))) {
      return true;
    }
  }
  return false;
}

let treeSitterInstance: TreeSitterLayer | null = null;

function getTreeSitterLayer(): TreeSitterLayer {
  if (!treeSitterInstance) {
    treeSitterInstance = new TreeSitterLayer();
  }
  return treeSitterInstance;
}

let sharedContextBuilder: SemanticContextBuilder | null = null;
let cachedContext: { repoPath: string; context: string } | null = null;

export async function getOrBuildContext(repoPath: string): Promise<string> {
  if (cachedContext && cachedContext.repoPath === repoPath) {
    return cachedContext.context;
  }

  if (sharedContextBuilder) {
    await sharedContextBuilder.shutdown();
    sharedContextBuilder = null;
  }

  let builderOptions: { exclude?: string[] } = {};
  const configPath = path.join(repoPath, '.context', 'config.json');
  if (await fs.pathExists(configPath)) {
    try {
      const config = await fs.readJson(configPath);
      if (Array.isArray(config.exclude) && config.exclude.length > 0) {
        builderOptions = {
          exclude: [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...config.exclude])]
        };
      }
    } catch {
      // Ignore malformed config and fall back to defaults.
    }
  }

  sharedContextBuilder = new SemanticContextBuilder(builderOptions);
  const context = await sharedContextBuilder.buildDocumentationContext(repoPath);
  cachedContext = { repoPath, context };
  return context;
}

export async function cleanupSharedContext(): Promise<void> {
  if (sharedContextBuilder) {
    await sharedContextBuilder.shutdown();
    sharedContextBuilder = null;
  }
  cachedContext = null;
}

export const readFileTool = createInternalTool<
  { filePath: string; encoding?: 'utf-8' | 'ascii' | 'binary' },
  { success: boolean; content?: string; path: string; size?: number; error?: string }
>(
  'Read the contents of a file from the filesystem',
  async (input) => {
    const { filePath, encoding = 'utf-8' } = input;
    try {
      const content = await fs.readFile(filePath, encoding as BufferEncoding);
      return {
        success: true,
        content,
        path: filePath,
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        path: filePath
      };
    }
  }
);

export const listFilesTool = createInternalTool<
  { pattern: string; cwd?: string; ignore?: string[] },
  { success: boolean; files?: string[]; count?: number; pattern: string; error?: string }
>(
  'List files matching a glob pattern in the repository',
  async (input) => {
    const { pattern, cwd, ignore } = input;
    try {
      const files = await glob(pattern, {
        cwd: cwd || process.cwd(),
        ignore: ignore || ['node_modules/**', '.git/**', 'dist/**'],
        absolute: false
      });
      return {
        success: true,
        files,
        count: files.length,
        pattern
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        pattern
      };
    }
  }
);

export const analyzeSymbolsTool = createInternalTool<
  { filePath: string; symbolTypes?: Array<'class' | 'interface' | 'function' | 'type' | 'enum'> },
  Record<string, unknown>
>(
  'Analyze symbols in a source file',
  async (input) => {
    const { filePath, symbolTypes } = input;
    try {
      const treeSitter = getTreeSitterLayer();
      const analysis = await treeSitter.analyzeFile(filePath);
      let symbols = analysis.symbols;
      if (symbolTypes && symbolTypes.length > 0) {
        symbols = symbols.filter((symbol) =>
          symbolTypes.includes(symbol.kind as 'class' | 'interface' | 'function' | 'type' | 'enum')
        );
      }

      return {
        success: true,
        filePath,
        language: analysis.language,
        symbols: symbols.map((symbol) => ({
          name: symbol.name,
          kind: symbol.kind,
          line: symbol.location.line,
          exported: symbol.exported,
          documentation: symbol.documentation
        })),
        imports: analysis.imports.map((imp) => ({
          source: imp.source,
          specifiers: imp.specifiers
        })),
        exports: analysis.exports.map((exp) => ({
          name: exp.name,
          isDefault: exp.isDefault
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        filePath
      };
    }
  }
);

export const getFileStructureTool = createInternalTool<
  { rootPath: string; maxDepth?: number; includePatterns?: string[] },
  Record<string, unknown>
>(
  'Get the directory structure and file listing of a repository',
  async (input) => {
    const { rootPath, maxDepth = 3, includePatterns } = input;
    try {
      const mapper = new FileMapper([]);
      const structure = await mapper.mapRepository(rootPath, includePatterns || undefined);

      const filterByDepth = (relativePath: string): boolean => relativePath.split('/').length <= maxDepth;

      return {
        success: true,
        rootPath: structure.rootPath,
        totalFiles: structure.totalFiles,
        totalSize: structure.totalSize,
        topLevelDirs: structure.topLevelDirectoryStats.map((dir) => ({
          name: dir.name,
          fileCount: dir.fileCount
        })),
        files: structure.files
          .filter((file) => filterByDepth(file.relativePath))
          .slice(0, 200)
          .map((file) => ({
            path: file.relativePath,
            extension: file.extension,
            size: file.size
          }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rootPath
      };
    }
  }
);

export const searchCodeTool = createInternalTool<
  { pattern: string; fileGlob?: string; maxResults?: number; cwd?: string },
  Record<string, unknown>
>(
  'Search for code patterns across files using regex',
  async (input) => {
    const { pattern, fileGlob, maxResults = 50, cwd } = input;
    try {
      const files = await glob(fileGlob || '**/*.{ts,tsx,js,jsx,py,go,rs,java}', {
        cwd: cwd || process.cwd(),
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
        absolute: true
      });

      const regex = new RegExp(pattern, 'gm');
      const matches: Array<{ file: string; line: number; match: string; context: string }> = [];

      for (const file of files) {
        if (matches.length >= maxResults) break;

        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let index = 0; index < lines.length && matches.length < maxResults; index++) {
            if (regex.test(lines[index])) {
              matches.push({
                file: path.relative(cwd || process.cwd(), file),
                line: index + 1,
                match: lines[index].trim().slice(0, 200),
                context: lines.slice(Math.max(0, index - 1), index + 2).join('\n').slice(0, 500)
              });
            }
            regex.lastIndex = 0;
          }
        } catch {
          // Skip unreadable files.
        }
      }

      return {
        success: true,
        pattern,
        matches,
        totalMatches: matches.length,
        truncated: matches.length >= maxResults
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        pattern
      };
    }
  }
);

export const checkScaffoldingTool = createInternalTool<
  { repoPath?: string },
  Record<string, unknown>
>(
  'Check if .context scaffolding exists and return granular status',
  async (input) => {
    if (!input.repoPath) {
      throw new Error('repoPath is required for checkScaffolding');
    }

    const outputDir = path.resolve(input.repoPath, '.context');
    try {
      const sensorsPath = path.join(outputDir, 'harness', 'sensors.json');
      const [initialized, docs, agents, skills, plans, workflow, harness, sensors] = await Promise.all([
        fs.pathExists(outputDir),
        fs.pathExists(path.join(outputDir, 'docs')).then((exists) => exists ? hasContent(path.join(outputDir, 'docs')) : false),
        fs.pathExists(path.join(outputDir, 'agents')).then((exists) => exists ? hasContent(path.join(outputDir, 'agents')) : false),
        fs.pathExists(path.join(outputDir, 'skills')).then((exists) => exists ? hasSkillContent(path.join(outputDir, 'skills')) : false),
        fs.pathExists(path.join(outputDir, 'plans')).then((exists) => exists ? hasContent(path.join(outputDir, 'plans')) : false),
        fs.pathExists(path.join(outputDir, 'workflow')).then((exists) => exists ? hasContent(path.join(outputDir, 'workflow')) : false),
        fs.pathExists(path.join(outputDir, 'harness')).then((exists) => exists ? hasHarnessRuntimeContent(path.join(outputDir, 'harness')) : false),
        fs.pathExists(sensorsPath)
      ]);

      return {
        initialized,
        docs,
        agents,
        skills,
        plans,
        workflow,
        harness,
        sensors,
        outputDir
      };
    } catch (error) {
      return {
        initialized: false,
        docs: false,
        agents: false,
        skills: false,
        plans: false,
        workflow: false,
        harness: false,
        sensors: false,
        outputDir,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const initializeContextTool = createInternalTool<
  {
    repoPath: string;
    type?: 'docs' | 'agents' | 'both';
    outputDir?: string;
    semantic?: boolean;
    include?: string[];
    exclude?: string[];
    projectType?: ProjectType;
    disableFiltering?: boolean;
    autoFill?: boolean;
    skipContentGeneration?: boolean;
    generateQA?: boolean;
    generateSkills?: boolean;
  },
  Record<string, unknown>
>(
  'Initialize .context scaffolding and create template files',
  async (input) => {
    const {
      repoPath,
      type = 'both',
      outputDir: customOutputDir,
      semantic = true,
      include,
      exclude = [],
      projectType: overrideProjectType,
      disableFiltering = false,
      autoFill = true,
      skipContentGeneration = true,
      generateQA = true,
      generateSkills = true,
    } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');
    const scaffoldDocs = type === 'docs' || type === 'both';
    const scaffoldAgents = type === 'agents' || type === 'both';

    try {
      if (!await fs.pathExists(resolvedRepoPath)) {
        return {
          success: false,
          status: 'error',
          outputDir,
          error: `Repository path does not exist: ${resolvedRepoPath}`
        };
      }

      await fs.ensureDir(outputDir);

      const runtimeGitignorePatterns = getUntrackedContextLayoutEntries().map((entry) => entry.path);
      await ensureGitignorePatterns(resolvedRepoPath, runtimeGitignorePatterns, {
        header: '# dotcontext runtime state'
      });

      if (exclude.length > 0) {
        const configPath = path.join(outputDir, 'config.json');
        let existingConfig: Record<string, unknown> = {};
        if (await fs.pathExists(configPath)) {
          try {
            existingConfig = await fs.readJson(configPath);
          } catch {
            existingConfig = {};
          }
        }
        existingConfig.exclude = exclude;
        await fs.writeJson(configPath, existingConfig, { spaces: 2 });
      }

      const fileMapper = new FileMapper(exclude);
      const repoStructure = await fileMapper.mapRepository(resolvedRepoPath, include);

      let classification: ProjectClassification | undefined;
      let projectType: ProjectType = 'unknown';

      if (!disableFiltering) {
        const stackDetector = new StackDetector();
        const stackInfo = await stackDetector.detect(resolvedRepoPath);
        if (overrideProjectType) {
          projectType = overrideProjectType;
          classification = {
            primaryType: overrideProjectType,
            secondaryTypes: [],
            confidence: 'high',
            reasoning: ['Project type manually specified'],
          };
        } else {
          classification = classifyProject(stackInfo);
          projectType = classification.primaryType;
        }
      }

      const filteredAgents = disableFiltering ? undefined : getAgentsForProjectType(projectType);
      const filteredDocs = disableFiltering ? undefined : getDocsForProjectType(projectType);
      const filteredSkills = disableFiltering ? undefined : getSkillsForProjectType(projectType);

      let docsGenerated = 0;
      if (scaffoldDocs) {
        const docGenerator = new DocumentationGenerator();
        docsGenerated = await docGenerator.generateDocumentation(
          repoStructure,
          outputDir,
          { semantic, filteredDocs },
          false
        );
      }

      let skillsGenerated = 0;
      if (generateSkills) {
        try {
          const skillGenerator = new SkillGenerator({
            repoPath: resolvedRepoPath,
            outputDir: path.relative(resolvedRepoPath, outputDir),
          });
          const skillResult = await skillGenerator.generate({
            skills: filteredSkills,
            force: false,
          });
          skillsGenerated = skillResult.generatedSkills.length;
        } catch {
          skillsGenerated = 0;
        }
      }

      let availableSkills: Array<{ slug: string; name: string; description: string; phases: string[] }> = [];
      if (generateSkills && skillsGenerated > 0) {
        try {
          const registry = createSkillRegistry(resolvedRepoPath);
          const discovered = await registry.discoverAll();
          availableSkills = discovered.all.map((skill) => ({
            slug: skill.slug,
            name: skill.metadata.name,
            description: skill.metadata.description,
            phases: skill.metadata.phases || [],
          }));
        } catch {
          availableSkills = [];
        }
      }

      let agentsGenerated = 0;
      if (scaffoldAgents) {
        const agentGenerator = new AgentGenerator();
        agentsGenerated = await agentGenerator.generateAgentPrompts(
          repoStructure,
          outputDir,
          { semantic, filteredAgents, availableSkills },
          false
        );
      }

      let qaGenerated = 0;
      if (generateQA) {
        try {
          const qaService = new QAService();
          const qaResult = await qaService.generateFromCodebase(resolvedRepoPath);
          qaGenerated = qaResult.generated.length;
          await qaService.shutdown();
        } catch {
          qaGenerated = 0;
        }
      }

      const sensorCatalogService = new HarnessSensorCatalogService({
        repoPath: resolvedRepoPath,
        contextPath: outputDir,
      });
      const sensorCatalog = await sensorCatalogService.bootstrap();
      const sensorsGenerated = sensorCatalog.sensors.length;
      const sensorsPath = sensorCatalogService.configPath;

      const policyService = new HarnessPolicyService({ repoPath: resolvedRepoPath });
      const policyPath = path.join(outputDir, 'harness', 'policy.json');
      let policyGenerated = false;
      if (!await fs.pathExists(policyPath)) {
        await policyService.savePolicy(await policyService.createBootstrapPolicy());
        policyGenerated = true;
      }

      const generatedFiles: Array<{ path: string; relativePath: string; type: ScaffoldFileType; instructions: string }> = [];

      if (scaffoldDocs) {
        const docFiles = await collectScaffoldFiles(outputDir, 'docs');
        for (const file of docFiles.filter((entry) => path.basename(entry.path).toLowerCase() !== 'readme.md')) {
          generatedFiles.push({
            path: file.path,
            relativePath: file.relativePath,
            type: 'doc',
            instructions: getDocFillInstructions(path.basename(file.path))
          });
        }
      }

      if (scaffoldAgents) {
        const agentFiles = await collectScaffoldFiles(outputDir, 'agents');
        for (const file of agentFiles) {
          generatedFiles.push({
            path: file.path,
            relativePath: file.relativePath,
            type: 'agent',
            instructions: getAgentFillInstructions(file.documentName)
          });
        }
      }

      if (generateSkills) {
        const skillFiles = await collectScaffoldFiles(outputDir, 'skills');
        for (const file of skillFiles) {
          generatedFiles.push({
            path: file.path,
            relativePath: file.relativePath,
            type: 'skill',
            instructions: getSkillFillInstructions(file.documentName)
          });
        }
      }

      if (autoFill && await sensorCatalogNeedsFill(sensorsPath)) {
        generatedFiles.push({
          path: sensorsPath,
          relativePath: path.relative(outputDir, sensorsPath),
          type: 'sensor',
          instructions: getSensorFillInstructions()
        });
      }

      const pendingWrites: RequiredAction[] = autoFill
        ? generatedFiles.map((file, index) => ({
            order: index + 1,
            actionType: 'WRITE_FILE',
            filePath: file.path,
            fileType: file.type,
            instructions: file.instructions,
            status: 'pending'
          }))
        : [];

      const codebaseContext = autoFill && !skipContentGeneration
        ? await getOrBuildContext(resolvedRepoPath).catch(() => undefined)
        : undefined;

      const qaOutputDir = path.join(outputDir, 'docs', 'qa');
      const checklist = [
        ...pendingWrites.map((item) => `[ ] Fill ${path.relative(resolvedRepoPath, item.filePath)}`),
        sensorsGenerated > 0
          ? (await sensorCatalogNeedsFill(sensorsPath)
              ? `[ ] Customize harness sensors in ${path.relative(resolvedRepoPath, sensorsPath)}`
              : `[x] Loaded ${sensorsGenerated} project-specific harness sensors`)
          : '[ ] Generate harness sensors',
        policyGenerated ? '[x] Created harness bootstrap policy' : '[x] Reused existing harness bootstrap policy',
        qaGenerated > 0 ? `[x] Generated ${qaGenerated} Q&A docs in ${qaOutputDir}` : '[ ] Generate Q&A docs',
      ];

      return {
        success: true,
        status: pendingWrites.length > 0 ? 'incomplete' : 'success',
        complete: pendingWrites.length === 0,
        instruction: pendingWrites.length > 0
          ? 'Scaffolding created. Fill each pending file with context-aware content before reporting completion.'
          : 'Scaffolding created successfully.',
        outputDir,
        docsGenerated,
        agentsGenerated,
        skillsGenerated,
        qaGenerated,
        pendingWrites,
        requiredActions: pendingWrites,
        checklist,
        codebaseContext,
        classification: classification
          ? {
              projectType: classification.primaryType,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            }
          : undefined,
        _metadata: {
          docsGenerated,
          agentsGenerated,
          skillsGenerated,
          qaGenerated,
          outputDir,
          classification: classification
            ? {
                projectType: classification.primaryType,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
              }
            : undefined,
        },
        nextStep: pendingWrites.length > 0
          ? {
              action: 'Call fillSingle for each pending file and then write the generated content.',
              example: pendingWrites[0]
                ? `context({ action: "fillSingle", filePath: "${pendingWrites[0].filePath}" })`
                : undefined
            }
          : undefined
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        complete: false,
        outputDir,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const scaffoldPlanTool = createInternalTool<
  {
    planName: string;
    repoPath?: string;
    outputDir?: string;
    title?: string;
    summary?: string;
    semantic?: boolean;
    autoFill?: boolean;
  },
  Record<string, unknown>
>(
  'Create a plan template in .context/plans/',
  async (input) => {
    const {
      planName,
      repoPath,
      outputDir: customOutputDir,
      title,
      summary,
      semantic = true,
      autoFill = true,
    } = input;

    if (!repoPath) {
      throw new Error('repoPath is required for scaffoldPlan');
    }

    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');

    try {
      const stackDetector = new StackDetector();
      const stackInfo = await stackDetector.detect(resolvedRepoPath);
      const classification = classifyProject(stackInfo);

      const filteredAgents = getAgentsForProjectType(classification.primaryType);
      const filteredDocs = getDocsForProjectType(classification.primaryType);

      const planGenerator = new PlanGenerator();
      const enableSemantic = autoFill && semantic;
      const result = await planGenerator.generatePlan({
        planName,
        outputDir,
        title,
        summary,
        force: true,
        verbose: false,
        semantic: enableSemantic,
        projectPath: enableSemantic ? resolvedRepoPath : undefined,
        selectedAgentTypes: filteredAgents,
        selectedDocKeys: filteredDocs,
      });

      const planContent = await fs.readFile(result.planPath, 'utf-8');
      return {
        success: true,
        status: autoFill ? 'incomplete' : 'success',
        complete: !autoFill,
        instruction: autoFill
          ? 'Plan scaffold created. Fill it with concrete phases, responsibilities, and acceptance criteria.'
          : 'Plan scaffold created successfully.',
        planPath: result.planPath,
        planContent,
        classification: {
          projectType: classification.primaryType,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        },
        nextStep: autoFill
          ? {
              action: 'Call fillSingle with the generated plan path.',
              example: `context({ action: "fillSingle", filePath: "${result.planPath}" })`,
            }
          : undefined
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        complete: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const listFilesToFillTool = createInternalTool<
  { repoPath: string; outputDir?: string; target?: ScaffoldTarget },
  Record<string, unknown>
>(
  'List scaffold files that still need to be filled',
  async (input) => {
    const { repoPath, outputDir: customOutputDir, target = 'all' } = input;
    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');

    try {
      if (!await fs.pathExists(outputDir)) {
        return {
          success: false,
          error: `Scaffold directory does not exist: ${outputDir}. Run context init first.`
        };
      }

      const files = await collectScaffoldFiles(outputDir, target);
      return {
        success: true,
        files,
        totalCount: files.length,
        instructions: `Found ${files.length} files to fill. Call fillSingle for each file path.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const fillSingleFileTool = createInternalTool<
  { repoPath: string; filePath: string },
  Record<string, unknown>
>(
  'Build semantic context for filling a single scaffold file',
  async (input) => {
    const resolvedRepoPath = path.resolve(input.repoPath);
    const resolvedFilePath = path.resolve(input.filePath);

    try {
      if (!await fs.pathExists(resolvedFilePath)) {
        return {
          success: false,
          error: `File does not exist: ${resolvedFilePath}`
        };
      }

      const semanticContext = await getOrBuildContext(resolvedRepoPath);
      const currentContent = await fs.readFile(resolvedFilePath, 'utf-8');
      const fileInfo = resolveScaffoldFileInfo(path.join(resolvedRepoPath, '.context'), resolvedFilePath);
      const structure = fileInfo.type === 'sensor'
        ? undefined
        : getScaffoldStructure(fileInfo.documentName);

      if (fileInfo.type === 'sensor') {
        const sensorCatalogService = new HarnessSensorCatalogService({
          repoPath: resolvedRepoPath,
          contextPath: path.join(resolvedRepoPath, '.context'),
        });
        const currentCatalog = await sensorCatalogService.load();

        return {
          success: true,
          filePath: resolvedFilePath,
          fileType: fileInfo.type,
          documentName: fileInfo.documentName,
          semanticContext,
          currentContent,
          currentCatalog,
          instructions: `Use semanticContext and currentContent to rewrite ${resolvedFilePath} as a complete JSON sensor catalog tailored to this repository. Keep version at 1, set source to "manual", preserve stack metadata, and keep only relevant sensors with real commands for this project.`
        };
      }

      return {
        success: true,
        filePath: resolvedFilePath,
        fileType: fileInfo.type,
        documentName: fileInfo.documentName,
        semanticContext,
        scaffoldStructure: structure ? serializeStructureForAI(structure) : undefined,
        currentContent,
        instructions: `Use semanticContext and scaffoldStructure to generate complete markdown content for ${resolvedFilePath}. Write repository-specific content without placeholders.`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const fillScaffoldingTool = createInternalTool<
  { repoPath: string; outputDir?: string; target?: ScaffoldTarget; offset?: number; limit?: number },
  Record<string, unknown>
>(
  'Build semantic context for filling scaffold files',
  async (input) => {
    const {
      repoPath,
      outputDir: customOutputDir,
      target = 'all',
      offset = 0,
      limit = 3,
    } = input;

    const resolvedRepoPath = path.resolve(repoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(resolvedRepoPath, '.context');

    try {
      if (!await fs.pathExists(resolvedRepoPath)) {
        return {
          success: false,
          error: `Repository path does not exist: ${resolvedRepoPath}`
        };
      }

      if (!await fs.pathExists(outputDir)) {
        return {
          success: false,
          error: `Scaffold directory does not exist: ${outputDir}. Run context init first.`
        };
      }

      const semanticContext = await getOrBuildContext(resolvedRepoPath);
      const allFiles = await collectScaffoldFiles(outputDir, target);
      const effectiveLimit = limit === 0 ? allFiles.length : limit;
      const paginatedFiles = allFiles.slice(offset, offset + effectiveLimit);

      const files = await Promise.all(
        paginatedFiles.map(async (fileInfo) => {
          const currentContent = await fs.readFile(fileInfo.path, 'utf-8');
          const structure = fileInfo.type === 'sensor'
            ? undefined
            : getScaffoldStructure(fileInfo.documentName);
          return {
            path: fileInfo.path,
            relativePath: fileInfo.relativePath,
            type: fileInfo.type,
            documentName: fileInfo.documentName,
            fillInstructions: fileInfo.type === 'sensor' ? getSensorFillInstructions() : undefined,
            scaffoldStructure: structure ? serializeStructureForAI(structure) : undefined,
            currentContent
          };
        })
      );

      return {
        success: true,
        semanticContext,
        files,
        totalCount: allFiles.length,
        offset,
        limit: effectiveLimit,
        hasMore: offset + effectiveLimit < allFiles.length,
        instructions: 'Generate content for each file using the shared semanticContext and each file-specific scaffoldStructure, then write the result back to the file path.'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

function extractCodebaseMapSection(map: CodebaseMap, section: string): unknown {
  switch (section) {
    case 'all':
      return map;
    case 'stack':
      return map.stack;
    case 'structure':
      return map.structure;
    case 'architecture':
      return map.architecture;
    case 'symbols':
      return map.symbols;
    case 'symbols.classes':
      return map.symbols.classes;
    case 'symbols.interfaces':
      return map.symbols.interfaces;
    case 'symbols.functions':
      return map.symbols.functions;
    case 'symbols.types':
      return map.symbols.types;
    case 'symbols.enums':
      return map.symbols.enums;
    case 'publicAPI':
      return map.publicAPI;
    case 'dependencies':
      return map.dependencies;
    case 'stats':
      return map.stats;
    case 'keyFiles':
      return map.keyFiles ?? [];
    case 'navigation':
      return map.navigation ?? {};
    default:
      return map;
  }
}

export const getCodebaseMapTool = createInternalTool<
  { repoPath?: string; section?: string },
  Record<string, unknown>
>(
  'Get codebase map data from .context/docs/codebase-map.json',
  async (input) => {
    if (!input.repoPath) {
      throw new Error('repoPath is required for getCodebaseMap');
    }

    const section = input.section || 'all';
    try {
      const mapPath = path.join(input.repoPath, '.context', 'docs', 'codebase-map.json');
      if (!await fs.pathExists(mapPath)) {
        return {
          success: false,
          section,
          error: `Codebase map not found at ${mapPath}. Initialize context with semantic analysis first.`
        };
      }

      const codebaseMap = await fs.readJson(mapPath) as CodebaseMap;
      return {
        success: true,
        section,
        data: extractCodebaseMapSection(codebaseMap, section),
        mapPath
      };
    } catch (error) {
      return {
        success: false,
        section,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const TOOL_NAMES = [
  'readFile',
  'listFiles',
  'analyzeSymbols',
  'getFileStructure',
  'searchCode',
  'checkScaffolding',
  'initializeContext',
  'scaffoldPlan',
  'fillScaffolding',
  'listFilesToFill',
  'fillSingleFile',
  'getCodebaseMap'
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
