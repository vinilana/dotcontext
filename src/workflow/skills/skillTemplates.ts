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

/**
 * Convert a SkillDefaultContent object into formatted markdown
 */
function contentToMarkdown(title: string, content: SkillDefaultContent): string {
  let md = `# ${title}\n\n`;
  if (content.whenToUse) {
    md += `## When to Use\n${content.whenToUse}\n\n`;
  }
  if (content.instructions) {
    md += `## Instructions\n${content.instructions}\n\n`;
  }
  if (content.examples) {
    md += `## Examples\n${content.examples}\n\n`;
  }
  if (content.guidelines) {
    md += `## Guidelines\n${content.guidelines}`;
  }
  return md;
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
  return {
    description: 'Generate commit messages following conventional commits with scope detection',
    content: contentToMarkdown('Commit Message Generator', commitMessageContent),
  };
}

function createPrReviewSkill(): SkillTemplate {
  return {
    description: 'Review pull requests against team standards and best practices',
    content: contentToMarkdown('Pull Request Review', prReviewContent),
  };
}

function createCodeReviewSkill(): SkillTemplate {
  return {
    description: 'Review code quality, patterns, and best practices',
    content: contentToMarkdown('Code Review', codeReviewContent),
  };
}

function createTestGenerationSkill(): SkillTemplate {
  return {
    description: 'Generate comprehensive test cases for code',
    content: contentToMarkdown('Test Generation', testGenerationContent),
  };
}

function createDocumentationSkill(): SkillTemplate {
  return {
    description: 'Generate and update technical documentation',
    content: contentToMarkdown('Documentation Generator', documentationContent),
  };
}

function createRefactoringSkill(): SkillTemplate {
  return {
    description: 'Safe code refactoring with step-by-step approach',
    content: contentToMarkdown('Refactoring Guide', refactoringContent),
  };
}

function createBugInvestigationSkill(): SkillTemplate {
  return {
    description: 'Systematic bug investigation and root cause analysis',
    content: contentToMarkdown('Bug Investigation', bugInvestigationContent),
  };
}

function createFeatureBreakdownSkill(): SkillTemplate {
  return {
    description: 'Break down features into implementable tasks',
    content: contentToMarkdown('Feature Breakdown', featureBreakdownContent),
  };
}

function createApiDesignSkill(): SkillTemplate {
  return {
    description: 'Design RESTful APIs following best practices',
    content: contentToMarkdown('API Design', apiDesignContent),
  };
}

function createSecurityAuditSkill(): SkillTemplate {
  return {
    description: 'Security review checklist for code and infrastructure',
    content: contentToMarkdown('Security Audit', securityAuditContent),
  };
}
