import { tool } from 'ai';
import * as path from 'path';
import * as fs from 'fs-extra';
import { InitializeContextInputSchema, type InitializeContextInput, type RequiredAction } from '../schemas';
import { FileMapper } from '../../../utils/fileMapper';
import { DocumentationGenerator } from '../../../generators/documentation/documentationGenerator';
import { AgentGenerator } from '../../../generators/agents/agentGenerator';
import { SkillGenerator } from '../../../generators/skills/skillGenerator';
import {
  StackDetector,
  classifyProject,
  getAgentsForProjectType,
  getDocsForProjectType,
  getSkillsForProjectType,
  ProjectType,
  ProjectClassification,
} from '../../stack';
import { UPDATE_SCAFFOLD_PROMPT_FALLBACK } from '../../../prompts/defaults';
import { QAService } from '../../qa';
import { HarnessSensorCatalogService } from '../../harness/sensorCatalogService';
import { getUntrackedContextLayoutEntries } from '../../shared';
import { createSkillRegistry } from '../../../workflow/skills';
import { collectScaffoldFiles } from './scaffoldInventory';
import { ensureGitignorePatterns } from '../../../utils/gitignoreManager';

export const initializeContextTool = tool({
  description: `Initialize .context scaffolding and create template files.
When autoFill is true (default), returns semantic context and detailed fill instructions for each file.
The AI agent MUST then fill each generated file using the provided context and instructions.`,
  inputSchema: InitializeContextInputSchema,
  execute: async (input: InitializeContextInput) => {
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
      skipContentGeneration = true, // Default true to reduce response size
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
      // Validate repo path exists
      if (!await fs.pathExists(resolvedRepoPath)) {
        return {
          status: 'error',
          outputDir,
          error: `Repository path does not exist: ${resolvedRepoPath}`
        };
      }

      // Ensure output directory exists
      await fs.ensureDir(outputDir);

      const runtimeGitignorePatterns = getUntrackedContextLayoutEntries()
        .map((entry) => entry.path);
      const gitignoreUpdate = await ensureGitignorePatterns(
        resolvedRepoPath,
        runtimeGitignorePatterns,
        { header: '# dotcontext runtime state' }
      );

      // Persist user-provided exclude patterns for later use by fillSingle
      if (exclude.length > 0) {
        const configPath = path.join(outputDir, 'config.json');
        let existingConfig: Record<string, unknown> = {};
        if (await fs.pathExists(configPath)) {
          try { existingConfig = await fs.readJson(configPath); } catch { /* ignore */ }
        }
        existingConfig.exclude = exclude;
        await fs.writeJson(configPath, existingConfig, { spaces: 2 });
      }

      // Map repository structure
      const fileMapper = new FileMapper(exclude);
      const repoStructure = await fileMapper.mapRepository(resolvedRepoPath, include);

      // Detect stack and classify project type
      let classification: ProjectClassification | undefined;
      let projectType: ProjectType = 'unknown';

      if (!disableFiltering) {
        const stackDetector = new StackDetector();
        const stackInfo = await stackDetector.detect(resolvedRepoPath);

        // Use override if provided, otherwise classify from stack
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

      // Get filtered agents and docs based on project type
      const filteredAgents = disableFiltering ? undefined : getAgentsForProjectType(projectType);
      const filteredDocs = disableFiltering ? undefined : getDocsForProjectType(projectType);
      const filteredSkills = disableFiltering ? undefined : getSkillsForProjectType(projectType);

      let docsGenerated = 0;
      let agentsGenerated = 0;

      // Generate documentation scaffolding
      if (scaffoldDocs) {
        const docGenerator = new DocumentationGenerator();
        docsGenerated = await docGenerator.generateDocumentation(
          repoStructure,
          outputDir,
          { semantic, filteredDocs },
          false // verbose
        );
      }

      // Generate skills scaffolding (before agents so agents can reference skills)
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
          // Skills generation is optional, continue if it fails
        }
      }

      // After skills are generated, collect skill info for agents
      let availableSkills: { slug: string; name: string; description: string; phases: string[] }[] = [];
      if (generateSkills && skillsGenerated > 0) {
        try {
          const skillRegistry = createSkillRegistry(resolvedRepoPath);
          const discovered = await skillRegistry.discoverAll();
          availableSkills = discovered.all.map(s => ({
            slug: s.slug,
            name: s.metadata.name,
            description: s.metadata.description,
            phases: s.metadata.phases || [],
          }));
        } catch {
          // Skills info is optional for agents
        }
      }

      // Generate agent scaffolding
      if (scaffoldAgents) {
        const agentGenerator = new AgentGenerator();
        agentsGenerated = await agentGenerator.generateAgentPrompts(
          repoStructure,
          outputDir,
          { semantic, filteredAgents, availableSkills },
          false // verbose
        );
      }

      // Generate Q&A files
      let qaGenerated = 0;
      if (generateQA) {
        try {
          const qaService = new QAService();
          const qaResult = await qaService.generateFromCodebase(resolvedRepoPath);
          qaGenerated = qaResult.generated.length;
          await qaService.shutdown();
        } catch {
          // Q&A generation is optional, continue if it fails
        }
      }

      const sensorCatalogService = new HarnessSensorCatalogService({
        repoPath: resolvedRepoPath,
        contextPath: outputDir,
      });
      const sensorCatalog = await sensorCatalogService.bootstrap();
      const sensorsGenerated = sensorCatalog.sensors.length;
      const qaOutputDir = path.join(outputDir, 'docs', 'qa');
      const qaNote = qaGenerated > 0
        ? `Q&A docs are generated directly in ${qaOutputDir} and do not require fillSingleFile.`
        : undefined;

      // Build list of generated files with their types
      interface FileInfo {
        path: string;
        relativePath: string;
        type: 'doc' | 'agent' | 'skill';
        fillInstructions: string;
      }
      const generatedFiles: FileInfo[] = [];

      if (scaffoldDocs) {
        const docFiles = await collectScaffoldFiles(outputDir, 'docs');
        for (const file of docFiles.filter((entry) => path.basename(entry.path).toLowerCase() !== 'readme.md')) {
          generatedFiles.push({
            path: file.path,
            relativePath: file.relativePath,
            type: 'doc',
            fillInstructions: getDocFillInstructions(path.basename(file.path)),
          });
        }
      }
      if (scaffoldAgents) {
        const agentFiles = await collectScaffoldFiles(outputDir, 'agents');
        for (const file of agentFiles) {
          const agentType = file.documentName;
          generatedFiles.push({
            path: file.path,
            relativePath: file.relativePath,
            type: 'agent',
            fillInstructions: getAgentFillInstructions(agentType),
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
            fillInstructions: getSkillFillInstructions(file.documentName),
          });
        }
      }

      // Build requiredActions - always return lightweight info, LLM will use fillSingleFile for context
      const requiredActions: RequiredAction[] = [];

      if (autoFill && generatedFiles.length > 0) {
        for (let i = 0; i < generatedFiles.length; i++) {
          const file = generatedFiles[i];

          requiredActions.push({
            order: i + 1,
            actionType: 'WRITE_FILE',
            filePath: file.path,
            fileType: file.type,
            instructions: file.fillInstructions,
            status: 'pending',
          });
        }
      }

      // When skipContentGeneration is true, return response with clear incomplete signal
      if (skipContentGeneration) {
        const hasFilesToFill = generatedFiles.length > 0;

        // Build pendingWrites array (lightweight, without content)
        const pendingWrites: RequiredAction[] = generatedFiles.map((f, i) => ({
          order: i + 1,
          actionType: 'WRITE_FILE' as const,
          filePath: f.path,
          fileType: f.type,
          instructions: f.fillInstructions,
          status: 'pending' as const,
        }));

        // Build human-readable checklist
        const checklist = generatedFiles.map(f => `[ ] Fill ${f.relativePath}`);

        // Build instruction message
        const instruction = hasFilesToFill
          ? `IMPORTANT ACTION REQUIRED: Scaffolding created but ${generatedFiles.length} files need content.

You MUST fill each file with appropriate content based on the codebase.

DO THIS NOW:
${generatedFiles.slice(0, 5).map((f, i) => `${i + 1}. Read and fill: ${f.relativePath}`).join('\n')}${generatedFiles.length > 5 ? `\n... and ${generatedFiles.length - 5} more files` : ''}

Use fillSingleFile tool for each file to get AI-generated content suggestions.
After getting suggestions, write the content using the Write tool.

DO NOT say "initialization complete" until ALL files are filled.${qaNote ? `\n\nNote: ${qaNote}` : ''}`
          : undefined;

        return {
          // Immediate action signals (appear first in JSON)
          instruction,
          qaNote,
          _warning: hasFilesToFill ? 'INCOMPLETE - ACTION REQUIRED' : undefined,

          // Status signals
          status: hasFilesToFill ? 'incomplete' : 'success',
          complete: !hasFilesToFill,
          operationType: 'scaffold_only',

          // Fill instructions (the standard prompt for HOW to fill)
          fillInstructions: hasFilesToFill ? UPDATE_SCAFFOLD_PROMPT_FALLBACK : undefined,

          // Pending writes (files that need content)
          pendingWrites: hasFilesToFill ? pendingWrites : undefined,

          // Human-readable checklist
          checklist: hasFilesToFill ? checklist : undefined,

          // Next step guidance
          nextStep: hasFilesToFill ? {
            action: 'Call fillSingleFile for each file to get content, then Write to save',
            example: `fillSingleFile({ repoPath: "${resolvedRepoPath}", filePath: "${pendingWrites[0]?.filePath || ''}" })`,
          } : undefined,

          // Metadata
          _metadata: {
            docsGenerated,
            agentsGenerated,
            skillsGenerated,
            sensorsGenerated,
            qaGenerated,
            gitignoreUpdated: gitignoreUpdate.updated,
            gitignoreAddedPatterns: gitignoreUpdate.addedPatterns,
            outputDir,
            classification: classification ? {
              projectType: classification.primaryType,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            } : undefined,
          },

          // Legacy fields for backwards compatibility
          docsGenerated,
          agentsGenerated,
          skillsGenerated,
          sensorsGenerated,
          qaGenerated,
          gitignoreUpdated: gitignoreUpdate.updated,
          gitignoreAddedPatterns: gitignoreUpdate.addedPatterns,
          outputDir,
          classification: classification ? {
            projectType: classification.primaryType,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          } : undefined,
        };
      }

      // Full response (when skipContentGeneration is false - still directs to fillSingleFile)
      const hasActionsRequired = requiredActions.length > 0;

      // Build human-readable checklist
      const checklist = requiredActions.map(a => `[ ] Fill ${a.filePath}`);

      // Build instruction message
      const instruction = hasActionsRequired
        ? `IMPORTANT ACTION REQUIRED: Scaffolding created with ${requiredActions.length} files that need content.

You MUST fill each file with appropriate content based on the codebase.

DO THIS NOW:
${requiredActions.slice(0, 5).map((a, i) => `${i + 1}. Call fillSingleFile for: ${a.filePath}`).join('\n')}${requiredActions.length > 5 ? `\n... and ${requiredActions.length - 5} more files` : ''}

fillSingleFile returns semantic context and scaffold structure for intelligent content generation.
After generating content, write it using the Write tool.

DO NOT say "initialization complete" until ALL files are filled.${qaNote ? `\n\nNote: ${qaNote}` : ''}`
        : undefined;

      return {
        // Immediate action signals (appear first in JSON)
        instruction,
        qaNote,
        _warning: hasActionsRequired ? 'INCOMPLETE - ACTION REQUIRED' : undefined,

        // Status signals
        status: hasActionsRequired ? 'incomplete' : 'success',
        complete: !hasActionsRequired,
        operationType: 'initialize_and_fill',
        completionCriteria: hasActionsRequired
          ? 'Call fillSingleFile for each file, generate content using the returned context, then write to file'
          : undefined,

        // Fill instructions (the standard prompt for HOW to fill)
        fillInstructions: hasActionsRequired ? UPDATE_SCAFFOLD_PROMPT_FALLBACK : undefined,

        // Pending writes (files that need content)
        pendingWrites: hasActionsRequired ? requiredActions : undefined,

        // Legacy: requiredActions (kept for backwards compatibility)
        requiredActions: hasActionsRequired ? requiredActions : undefined,

        // Human-readable checklist
        checklist: hasActionsRequired ? checklist : undefined,

        // Explicit next step with example
        nextStep: hasActionsRequired ? {
          action: 'Call fillSingleFile for each file to get context, generate content, then Write to save',
          example: `fillSingleFile({ repoPath: "${resolvedRepoPath}", filePath: "${requiredActions[0]?.filePath || ''}" })`,
        } : undefined,

        // Metadata
        _metadata: {
          docsGenerated,
          agentsGenerated,
          skillsGenerated,
          sensorsGenerated,
          qaGenerated,
          gitignoreUpdated: gitignoreUpdate.updated,
          gitignoreAddedPatterns: gitignoreUpdate.addedPatterns,
          outputDir,
          classification: classification ? {
            projectType: classification.primaryType,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          } : undefined,
        },

        // Legacy fields for backwards compatibility
        docsGenerated,
        agentsGenerated,
        skillsGenerated,
        sensorsGenerated,
        qaGenerated,
        gitignoreUpdated: gitignoreUpdate.updated,
        gitignoreAddedPatterns: gitignoreUpdate.addedPatterns,
        outputDir,
        classification: classification ? {
          projectType: classification.primaryType,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        } : undefined,
      };
    } catch (error) {
      return {
        status: 'error',
        outputDir,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * Get fill instructions for a documentation file based on its name
 */
function getDocFillInstructions(fileName: string): string {
  const name = fileName.toLowerCase();

  if (name === 'architecture.md') {
    return `Fill this file with:
- High-level architecture overview
- Key components and their responsibilities
- Data flow between components
- Design patterns used
- Technology stack decisions and rationale`;
  }

  if (name === 'project-overview.md') {
    return `Fill this file with:
- Project purpose and goals
- Main features and capabilities
- Target users/audience
- Key dependencies and integrations
- Getting started guide`;
  }

  if (name === 'data-flow.md') {
    return `Fill this file with:
- Data models and schemas
- API endpoints and their purposes
- Data transformation pipelines
- State management approach
- External data sources and sinks`;
  }

  if (name === 'conventions.md') {
    return `Fill this file with:
- Code style and formatting rules
- Naming conventions
- File and folder organization
- Commit message format
- PR and review guidelines`;
  }

  return `Fill this documentation file with relevant content based on the codebase analysis. Focus on accuracy and usefulness for developers.`;
}

/**
 * Get fill instructions for an agent playbook based on agent type
 */
function getAgentFillInstructions(agentType: string): string {
  const type = agentType.toLowerCase();

  if (type.includes('code-reviewer')) {
    return `Fill this agent playbook with:
- Code review checklist specific to this codebase
- Common patterns to look for
- Security considerations
- Performance best practices
- Testing requirements`;
  }

  if (type.includes('bug-fixer')) {
    return `Fill this agent playbook with:
- Debugging workflow for this codebase
- Common bug patterns and fixes
- Logging and error handling conventions
- Test verification steps
- Rollback procedures`;
  }

  if (type.includes('feature-developer')) {
    return `Fill this agent playbook with:
- Feature development workflow
- Code organization patterns
- Integration points for new features
- Testing requirements for new code
- Documentation expectations`;
  }

  if (type.includes('test-writer')) {
    return `Fill this agent playbook with:
- Testing framework and conventions
- Test file organization
- Mocking strategies
- Coverage requirements
- CI/CD integration`;
  }

  return `Fill this agent playbook with:
- Role and responsibilities specific to this codebase
- Key files and components to understand
- Workflow steps for common tasks
- Best practices and conventions to follow
- Common pitfalls to avoid`;
}

function getSkillFillInstructions(skillSlug: string): string {
  return `Fill this skill with:
- A clear description of when the skill should be used
- Preconditions, assumptions, and constraints
- A practical execution workflow for the skill
- Project-specific commands, files, and patterns the agent should use
- Expected outputs or verification steps

Keep it concise, actionable, and tailored to this repository. Skill slug: ${skillSlug}`;
}
