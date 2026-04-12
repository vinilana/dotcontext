/**
 * Built-in Skill Templates
 *
 * Separated from SkillRegistry to follow Single Responsibility Principle.
 * Each template contains description and markdown content for a built-in skill.
 *
 * Content is derived from the canonical skill definitions in
 * src/generators/shared/structures/skills/definitions.ts to maintain
 * a single source of truth.
 */

import { BuiltInSkillType } from './types';
import {
  SkillDefaultContent,
} from '../../generators/shared/structures/skills/factory';
import {
  commitMessageContent,
  prReviewContent,
  codeReviewContent,
  testGenerationContent,
  documentationContent,
  refactoringContent,
  bugInvestigationContent,
  featureBreakdownContent,
  apiDesignContent,
  securityAuditContent,
} from '../../generators/shared/structures/skills/definitions';

export interface SkillTemplate {
  description: string;
  content: string;
}

function contentToMarkdown(title: string, overview: string, content: SkillDefaultContent): string {
  let md = `# ${title}\n\n${overview}.\n\n`;
  if (content.instructions) {
    md += `## Workflow\n${content.instructions}\n\n`;
  }
  if (content.examples) {
    md += `## Examples\n${content.examples}\n\n`;
  }
  if (content.guidelines) {
    md += `## Quality Bar\n${content.guidelines}\n\n`;
  }
  md += `## Resource Strategy
- Add \`scripts/\` only when the task is fragile, repetitive, or benefits from deterministic execution.
- Add \`references/\` only when details are too large or too variant-specific to keep in \`SKILL.md\`.
- Add \`assets/\` only for files that will be consumed in the final output.
- Keep extra docs out of the skill folder; prefer \`SKILL.md\` plus only the resources that materially help.`;
  return md;
}

function extractTriggerBullets(whenToUse?: string): string[] {
  if (!whenToUse) {
    return [];
  }

  return whenToUse
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-'))
    .map(line => line.replace(/^-+\s*/, '').replace(/\.$/, '').trim())
    .filter(Boolean);
}

function joinNaturalLanguage(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function buildTemplateDescription(baseDescription: string, content: SkillDefaultContent): string {
  const triggers = extractTriggerBullets(content.whenToUse);
  if (triggers.length === 0) {
    return baseDescription;
  }

  return `${baseDescription}. Use when ${joinNaturalLanguage(triggers)}`;
}

/**
 * Get all built-in skill templates
 */
export function getBuiltInSkillTemplates(): Record<BuiltInSkillType, SkillTemplate> {
  return {
    'commit-message': createCommitMessageSkill(),
    'pr-review': createPrReviewSkill(),
    'code-review': createCodeReviewSkill(),
    'test-generation': createTestGenerationSkill(),
    'documentation': createDocumentationSkill(),
    'refactoring': createRefactoringSkill(),
    'bug-investigation': createBugInvestigationSkill(),
    'feature-breakdown': createFeatureBreakdownSkill(),
    'api-design': createApiDesignSkill(),
    'security-audit': createSecurityAuditSkill(),
  };
}

function createCommitMessageSkill(): SkillTemplate {
  const overview = 'Use this skill to turn a concrete set of staged changes into a clean conventional commit message';
  return {
    description: buildTemplateDescription('Generate commit messages that follow conventional commits and repository scope conventions', commitMessageContent),
    content: contentToMarkdown('Commit Message', overview, commitMessageContent),
  };
}

function createPrReviewSkill(): SkillTemplate {
  const overview = 'Use this skill to review a pull request against the repository quality bar and leave actionable feedback';
  return {
    description: buildTemplateDescription('Review pull requests against team standards and best practices', prReviewContent),
    content: contentToMarkdown('Pull Request Review', overview, prReviewContent),
  };
}

function createCodeReviewSkill(): SkillTemplate {
  const overview = 'Use this skill to inspect code for correctness, maintainability, and higher-order risks before changes move forward';
  return {
    description: buildTemplateDescription('Review code quality, patterns, and best practices', codeReviewContent),
    content: contentToMarkdown('Code Review', overview, codeReviewContent),
  };
}

function createTestGenerationSkill(): SkillTemplate {
  const overview = 'Use this skill to produce tests that cover behavior, regressions, and the repository testing conventions';
  return {
    description: buildTemplateDescription('Generate comprehensive test cases for code', testGenerationContent),
    content: contentToMarkdown('Test Generation', overview, testGenerationContent),
  };
}

function createDocumentationSkill(): SkillTemplate {
  const overview = 'Use this skill to create or update technical documentation that matches the current code and the target audience';
  return {
    description: buildTemplateDescription('Generate and update technical documentation', documentationContent),
    content: contentToMarkdown('Documentation', overview, documentationContent),
  };
}

function createRefactoringSkill(): SkillTemplate {
  const overview = 'Use this skill to improve structure without changing behavior, keeping the work incremental and test-backed';
  return {
    description: buildTemplateDescription('Refactor code safely with a step-by-step approach', refactoringContent),
    content: contentToMarkdown('Refactoring', overview, refactoringContent),
  };
}

function createBugInvestigationSkill(): SkillTemplate {
  const overview = 'Use this skill to reproduce a bug, narrow the failure surface, and document a defensible root cause';
  return {
    description: buildTemplateDescription('Investigate bugs systematically and perform root cause analysis', bugInvestigationContent),
    content: contentToMarkdown('Bug Investigation', overview, bugInvestigationContent),
  };
}

function createFeatureBreakdownSkill(): SkillTemplate {
  const overview = 'Use this skill to decompose a feature into small, testable tasks with explicit dependencies and acceptance criteria';
  return {
    description: buildTemplateDescription('Break down features into implementable tasks', featureBreakdownContent),
    content: contentToMarkdown('Feature Breakdown', overview, featureBreakdownContent),
  };
}

function createApiDesignSkill(): SkillTemplate {
  const overview = 'Use this skill to design API resources, payloads, and failure modes with consistent conventions';
  return {
    description: buildTemplateDescription('Design RESTful APIs following best practices', apiDesignContent),
    content: contentToMarkdown('API Design', overview, apiDesignContent),
  };
}

function createSecurityAuditSkill(): SkillTemplate {
  const overview = 'Use this skill to review code and integrations for security weaknesses and rank the findings by severity';
  return {
    description: buildTemplateDescription('Review code and infrastructure for security weaknesses', securityAuditContent),
    content: contentToMarkdown('Security Audit', overview, securityAuditContent),
  };
}
