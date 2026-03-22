import { tool } from 'ai';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ScaffoldPlanInputSchema, type ScaffoldPlanInput } from '../schemas';
import { PlanGenerator } from '../../../generators/plans/planGenerator';
import {
  StackDetector,
  classifyProject,
  getAgentsForProjectType,
  getDocsForProjectType,
} from '../../stack';

export const scaffoldPlanTool = tool({
  description: `Create a plan template in .context/plans/.
By default this returns a compact response with the plan path and next action.
Use includeContent/includeInstructions for compatibility clients that need inline payloads.`,
  inputSchema: ScaffoldPlanInputSchema,
  execute: async (input: ScaffoldPlanInput) => {
    const {
      planName,
      repoPath: customRepoPath,
      outputDir: customOutputDir,
      title,
      summary,
      semantic = true,
      autoFill = true,
      includeContent = false,
      includeInstructions = false,
    } = input;

    if (!customRepoPath) {
      throw new Error('repoPath is required for scaffoldPlan');
    }
    const repoPath = path.resolve(customRepoPath);
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.resolve(repoPath, '.context');

    try {
      // Detect project type for intelligent agent/doc filtering
      const stackDetector = new StackDetector();
      const stackInfo = await stackDetector.detect(repoPath);
      const classification = classifyProject(stackInfo);

      // Get filtered agents and docs based on project type
      const filteredAgents = getAgentsForProjectType(classification.primaryType);
      const filteredDocs = getDocsForProjectType(classification.primaryType);

      const planGenerator = new PlanGenerator();

      // When autoFill is true, enable semantic analysis for richer content
      const enableSemantic = autoFill && semantic;

      const result = await planGenerator.generatePlan({
        planName,
        outputDir,
        title,
        summary,
        force: true, // MCP calls should always overwrite (non-interactive)
        verbose: false,
        semantic: enableSemantic,
        projectPath: enableSemantic ? repoPath : undefined,
        selectedAgentTypes: filteredAgents,
        selectedDocKeys: filteredDocs,
      });

      const contextType = autoFill && semantic ? 'plan' : 'compact';
      const contextResource = `context://codebase/${contextType}`;
      const planContent = includeContent
        ? await fs.readFile(result.planPath, 'utf-8')
        : undefined;
      const fillInstructions = autoFill && includeInstructions
        ? buildPlanFillInstructions(planName, result.planPath, summary)
        : undefined;

      // Build response with consistent status signals (matching initializeContextTool pattern)
      const instruction = autoFill
        ? `Plan template created. Fill it with project-specific details via context({ action: "fillSingle", filePath: "${result.planPath}" }).`
        : 'Plan template created.';

      return {
        // Action signals (appear first for visibility)
        instruction,
        _warning: autoFill ? 'ACTION REQUIRED' : undefined,

        // Status signals
        status: autoFill ? 'incomplete' : 'success',
        complete: !autoFill,
        success: true,

        // Plan details
        planPath: result.planPath,
        planContent,
        contentIncluded: includeContent,
        guidanceIncluded: includeInstructions,
        contextType,
        contextResource,

        // Classification
        classification: {
          projectType: classification.primaryType,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        },

        // Fill instructions
        fillInstructions,

        // Next step guidance
        nextStep: autoFill ? {
          action: 'Call fillSingle to get plan-scoped context, then write the completed plan',
          example: `context({ action: "fillSingle", filePath: "${result.planPath}" })`,
        } : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * Build fill instructions for a plan file
 */
function buildPlanFillInstructions(planName: string, planPath: string, summary?: string): string {
  const lines: string[] = [];

  lines.push('# Plan Fill Instructions');
  lines.push('');
  lines.push(`A plan template has been created at: \`${planPath}\``);
  lines.push('');
  lines.push('You MUST now fill in the following sections with specific implementation details:');
  lines.push('');
  lines.push('## Required Sections to Fill');
  lines.push('');
  lines.push('### 1. Goal & Scope');
  lines.push('- Define the specific objective of this plan');
  lines.push('- List what is included and excluded from scope');
  if (summary) {
    lines.push(`- Initial summary provided: "${summary}"`);
  }
  lines.push('');
  lines.push('### 2. Phases');
  lines.push('- Break down the implementation into logical phases');
  lines.push('- Each phase should have:');
  lines.push('  - Clear objective');
  lines.push('  - Specific steps with owners (agent types)');
  lines.push('  - Deliverables and evidence of completion');
  lines.push('  - Git commit checkpoint message');
  lines.push('');
  lines.push('### 3. Agent Lineup');
  lines.push('- Assign specific agents to phases');
  lines.push('- Define focus areas for each agent');
  lines.push('');
  lines.push('### 4. Documentation Touchpoints');
  lines.push('- List which docs need to be updated');
  lines.push('- Specify which sections and why');
  lines.push('');
  lines.push('### 5. Success Criteria');
  lines.push('- Define measurable success criteria');
  lines.push('- Include testing and validation requirements');
  lines.push('');
  lines.push('## Action Required');
  lines.push('');
  lines.push('1. Read the generated plan template');
  lines.push('2. Fill in each section with specific, actionable content');
  lines.push('3. Write the completed plan back to the file');
  lines.push('');
  lines.push('DO NOT leave placeholder text. Each section must have concrete, implementation-ready content.');

  return lines.join('\n');
}
