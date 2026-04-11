/**
 * Harness Skills Service
 *
 * Transport-agnostic skill discovery, export, and fill orchestration logic.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { VERSION } from '../../version';
import { PHASE_NAMES_EN, type PrevcPhase } from '../../workflow';
import { getOrBuildContext } from '../ai/tools';
import { minimalUI, mockTranslate } from '../shared';

export interface HarnessSkillsServiceOptions {
  repoPath: string;
}

function getSkillFillInstructions(skillSlug: string): string {
  const instructions: Record<string, string> = {
    'commit-message': `Fill this skill with:
- Commit message format conventions for this project
- Examples of good commit messages from the codebase
- Branch naming conventions if applicable
- Semantic versioning guidelines`,
    'pr-review': `Fill this skill with:
- PR review checklist specific to this codebase
- Code quality standards to check
- Testing requirements before merge
- Documentation expectations`,
    'code-review': `Fill this skill with:
- Code review guidelines for this project
- Common patterns to look for
- Security and performance considerations
- Style and convention checks`,
    'test-generation': `Fill this skill with:
- Testing framework and conventions used
- Test file organization patterns
- Mocking strategies for this codebase
- Coverage requirements`,
    'documentation': `Fill this skill with:
- Documentation standards for this project
- JSDoc/TSDoc conventions
- README structure expectations
- API documentation guidelines`,
    'refactoring': `Fill this skill with:
- Refactoring patterns common in this codebase
- Code smell detection guidelines
- Safe refactoring procedures
- Testing requirements after refactoring`,
    'bug-investigation': `Fill this skill with:
- Debugging workflow for this codebase
- Common bug patterns and their fixes
- Logging and error handling conventions
- Test verification steps`,
    'feature-breakdown': `Fill this skill with:
- Feature decomposition approach
- Task estimation guidelines
- Dependency identification process
- Integration points to consider`,
    'api-design': `Fill this skill with:
- API design patterns used in this project
- Endpoint naming conventions
- Request/response format standards
- Versioning and deprecation policies`,
    'security-audit': `Fill this skill with:
- Security checklist for this codebase
- Common vulnerabilities to check
- Authentication/authorization patterns
- Data validation requirements`,
  };

  return instructions[skillSlug] || `Fill this skill with project-specific content for ${skillSlug}:
- Identify relevant patterns from the codebase
- Include specific examples from the project
- Add conventions and best practices
- Reference important files and components`;
}

function buildSkillFillPrompt(
  skills: Array<{
    skillPath: string;
    skillSlug: string;
    skillName: string;
    description: string;
    instructions: string;
  }>,
  semanticContext?: string
): string {
  const lines: string[] = [];
  lines.push('# Skill Fill Instructions', '', 'You MUST fill each of the following skill files with codebase-specific content.', '');

  if (semanticContext) {
    lines.push('## Codebase Context', '', 'Use this semantic context to understand the codebase:', '', '```');
    lines.push(semanticContext.length > 6000 ? semanticContext.substring(0, 6000) + '\n...(truncated)' : semanticContext);
    lines.push('```', '');
  }

  lines.push('## Skills to Fill', '');

  for (const skill of skills) {
    lines.push(`### ${skill.skillName} (${skill.skillSlug})`);
    lines.push(`**Path:** \`${skill.skillPath}\``);
    if (skill.description) lines.push(`**Description:** ${skill.description}`);
    lines.push('', '**Fill Instructions:**', skill.instructions, '');
  }

  lines.push(
    '## Action Required',
    '',
    'For each skill listed above:',
    '1. Read the current skill template',
    '2. Generate codebase-specific content based on the instructions and context',
    '3. Write the filled content to the skill file',
    '',
    'Each skill should be personalized with:',
    '- Specific examples from this codebase',
    '- Project-specific conventions and patterns',
    '- References to relevant files and components',
    '',
    'DO NOT leave placeholder text. Each skill must have meaningful, project-specific content.'
  );

  return lines.join('\n');
}

export class HarnessSkillsService {
  constructor(private readonly options: HarnessSkillsServiceOptions) {}

  private get repoPath(): string {
    return this.options.repoPath || process.cwd();
  }

  private getRegistry() {
    const { createSkillRegistry, BUILT_IN_SKILLS } = require('../../workflow/skills');
    return { createSkillRegistry, BUILT_IN_SKILLS };
  }

  async list(includeContent?: boolean): Promise<Record<string, unknown>> {
    const { createSkillRegistry } = this.getRegistry();
    const registry = createSkillRegistry(this.repoPath);
    const discovered = await registry.discoverAll();

    const format = (skill: any) => ({
      slug: skill.slug,
      name: skill.metadata.name,
      description: skill.metadata.description,
      phases: skill.metadata.phases || [],
      isBuiltIn: skill.isBuiltIn,
      ...(includeContent ? { content: skill.content } : {}),
    });

    return {
      success: true,
      totalSkills: discovered.all.length,
      builtInCount: discovered.builtIn.length,
      customCount: discovered.custom.length,
      skills: {
        builtIn: discovered.builtIn.map(format),
        custom: discovered.custom.map(format),
      },
    };
  }

  async getContent(skillSlug: string): Promise<Record<string, unknown>> {
    const { createSkillRegistry, BUILT_IN_SKILLS } = this.getRegistry();
    const registry = createSkillRegistry(this.repoPath);
    const content = await registry.getSkillContent(skillSlug);

    if (!content) {
      return {
        success: false,
        error: `Skill not found: ${skillSlug}`,
        availableSkills: BUILT_IN_SKILLS,
      };
    }

    const skill = await registry.getSkillMetadata(skillSlug);
    return {
      success: true,
      skill: {
        slug: skillSlug,
        name: skill?.metadata.name,
        description: skill?.metadata.description,
        phases: skill?.metadata.phases,
        isBuiltIn: skill?.isBuiltIn,
      },
      content,
    };
  }

  async getForPhase(phase: PrevcPhase): Promise<Record<string, unknown>> {
    const { createSkillRegistry } = this.getRegistry();
    const registry = createSkillRegistry(this.repoPath);
    const skills = await registry.getSkillsForPhase(phase);

    return {
      success: true,
      phase,
      phaseName: PHASE_NAMES_EN[phase],
      skills: skills.map((s: any) => ({
        slug: s.slug,
        name: s.metadata.name,
        description: s.metadata.description,
        isBuiltIn: s.isBuiltIn,
      })),
      count: skills.length,
    };
  }

  async scaffold(params: {
    skills?: string[];
    includeBuiltIn?: boolean;
  }): Promise<Record<string, unknown>> {
    const { createSkillGenerator } = require('../../generators/skills');
    const generator = createSkillGenerator({ repoPath: this.repoPath });
    const result = await generator.generate({ skills: params.skills, force: params.includeBuiltIn });

    return {
      success: true,
      skillsDir: result.skillsDir,
      generated: result.generatedSkills,
      skipped: result.skippedSkills,
      indexPath: result.indexPath,
    };
  }

  async export(params: {
    preset?: 'claude' | 'gemini' | 'codex' | 'antigravity' | 'all';
    includeBuiltIn?: boolean;
  }): Promise<Record<string, unknown>> {
    const { SkillExportService } = require('../export/skillExportService');
    const exportService = new SkillExportService({
      ui: minimalUI,
      t: mockTranslate,
      version: VERSION,
    });

    const result = await exportService.run(this.repoPath, {
      preset: params.preset,
      includeBuiltIn: params.includeBuiltIn,
      force: false,
    });

    return {
      success: result.filesCreated > 0,
      targets: result.targets,
      skillsExported: result.skillsExported,
      filesCreated: result.filesCreated,
      filesSkipped: result.filesSkipped,
    };
  }

  async fill(params: {
    skills?: string[];
    includeBuiltIn?: boolean;
  }): Promise<Record<string, unknown>> {
    const { createSkillRegistry } = this.getRegistry();
    const registry = createSkillRegistry(this.repoPath);
    const skillsDir = path.join(this.repoPath, '.context', 'skills');

    if (!await fs.pathExists(skillsDir)) {
      return {
        success: false,
        error: 'Skills directory does not exist. Run skill({ action: "scaffold" }) first.',
        skillsDir,
      };
    }

    const discovered = await registry.discoverAll();
    let skillsToFill = discovered.all;

    if (params.skills && params.skills.length > 0) {
      skillsToFill = skillsToFill.filter((s: { slug: string }) => params.skills!.includes(s.slug));
    }

    if (!params.includeBuiltIn) {
      skillsToFill = skillsToFill.filter((s: { path: string }) => {
        if (!fs.existsSync(s.path)) return true;
        const content = fs.readFileSync(s.path, 'utf-8');
        return content.includes('<!-- TODO') || content.includes('[PLACEHOLDER]') || content.length < 500;
      });
    }

    if (skillsToFill.length === 0) {
      return {
        success: true,
        message: 'No skills need filling. Use includeBuiltIn: true to refill existing skills.',
        skillsDir,
      };
    }

    let semanticContext: string | undefined;
    try {
      semanticContext = await getOrBuildContext(this.repoPath);
    } catch {
      semanticContext = undefined;
    }

    const fillInstructions = skillsToFill.map((skill: { path: string; slug: string; metadata: { name?: string; description?: string }; isBuiltIn: boolean }) => ({
      skillPath: skill.path,
      skillSlug: skill.slug,
      skillName: skill.metadata.name || skill.slug,
      description: skill.metadata.description || '',
      isBuiltIn: skill.isBuiltIn,
      instructions: getSkillFillInstructions(skill.slug),
    }));

    return {
      success: true,
      skillsToFill: fillInstructions,
      semanticContext,
      fillPrompt: buildSkillFillPrompt(fillInstructions, semanticContext),
      instructions: 'IMPORTANT: You MUST now fill each skill file using the semantic context and fill instructions provided. Write the content to each skillPath.',
    };
  }
}
