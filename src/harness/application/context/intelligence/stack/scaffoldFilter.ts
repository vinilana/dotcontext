/**
 * Scaffold Filter
 *
 * Provides filtering logic to determine which agents, docs, and skills
 * are relevant for each project type.
 *
 * Design: Uses a "core + extras" pattern for maintainability.
 * Core items are always included; extras are added per project type.
 */

import { ProjectType, PROJECT_TYPES } from './projectTypeClassifier';
import { AgentType, AGENT_TYPES } from '../../scaffolding/generators/agents/agentTypes';
import { DOCUMENT_GUIDE_KEYS } from '../../scaffolding/generators/documentation/guideRegistry';
import { BuiltInSkillType, BUILT_IN_SKILLS } from '../../../../domain/workflow/skills/types';

/**
 * Core agents that are always included regardless of project type
 */
export const CORE_AGENTS: readonly AgentType[] = [
  'code-reviewer',
  'bug-fixer',
  'feature-developer',
  'refactoring-specialist',
  'test-writer',
  'documentation-writer',
  'performance-optimizer',
] as const;

/**
 * Core documentation that is always included
 */
export const CORE_DOCS: readonly string[] = [
  'project-overview',
  'development-workflow',
  'testing-strategy',
  'tooling',
] as const;

/**
 * Core skills that are always included
 */
export const CORE_SKILLS: readonly BuiltInSkillType[] = [
  'commit-message',
  'pr-review',
  'code-review',
  'test-generation',
  'documentation',
  'refactoring',
  'bug-investigation',
] as const;

/**
 * Extra agents to include for specific project types (beyond core)
 */
const EXTRA_AGENTS_BY_TYPE: Record<ProjectType, readonly AgentType[]> = {
  cli: [],
  'web-frontend': ['security-auditor', 'frontend-specialist', 'architect-specialist', 'devops-specialist'],
  'web-backend': ['security-auditor', 'backend-specialist', 'architect-specialist', 'devops-specialist', 'database-specialist'],
  'full-stack': ['security-auditor', 'backend-specialist', 'frontend-specialist', 'architect-specialist', 'devops-specialist', 'database-specialist'],
  mobile: ['security-auditor', 'architect-specialist', 'devops-specialist', 'mobile-specialist'],
  library: [],
  monorepo: ['security-auditor', 'backend-specialist', 'frontend-specialist', 'architect-specialist', 'devops-specialist', 'database-specialist', 'mobile-specialist'],
  desktop: ['security-auditor', 'frontend-specialist', 'architect-specialist', 'devops-specialist'],
  unknown: ['security-auditor', 'backend-specialist', 'frontend-specialist', 'architect-specialist', 'devops-specialist', 'database-specialist', 'mobile-specialist'],
};

/**
 * Extra docs to include for specific project types (beyond core)
 */
const EXTRA_DOCS_BY_TYPE: Record<ProjectType, readonly string[]> = {
  cli: [],
  'web-frontend': ['architecture', 'glossary', 'security'],
  'web-backend': ['architecture', 'glossary', 'data-flow', 'security'],
  'full-stack': ['architecture', 'glossary', 'data-flow', 'security'],
  mobile: ['architecture', 'glossary', 'security'],
  library: [],
  monorepo: ['architecture', 'glossary', 'data-flow', 'security'],
  desktop: ['architecture', 'glossary', 'security'],
  unknown: ['architecture', 'glossary', 'data-flow', 'security'],
};

/**
 * Extra skills to include for specific project types (beyond core)
 */
const EXTRA_SKILLS_BY_TYPE: Record<ProjectType, readonly BuiltInSkillType[]> = {
  cli: [],
  'web-frontend': ['feature-breakdown', 'security-audit'],
  'web-backend': ['feature-breakdown', 'api-design', 'security-audit'],
  'full-stack': ['feature-breakdown', 'api-design', 'security-audit'],
  mobile: ['feature-breakdown', 'security-audit'],
  library: ['api-design'],
  monorepo: ['feature-breakdown', 'api-design', 'security-audit'],
  desktop: ['feature-breakdown', 'security-audit'],
  unknown: ['feature-breakdown', 'api-design', 'security-audit'],
};

// Build filter matrices from core + extras (for backward compatibility with existing exports)
function buildAgentMatrix(): Record<ProjectType, Record<AgentType, boolean>> {
  const matrix = {} as Record<ProjectType, Record<AgentType, boolean>>;

  for (const projectType of PROJECT_TYPES) {
    const included = new Set([...CORE_AGENTS, ...EXTRA_AGENTS_BY_TYPE[projectType]]);
    matrix[projectType] = {} as Record<AgentType, boolean>;

    for (const agent of AGENT_TYPES) {
      matrix[projectType][agent] = included.has(agent);
    }
  }

  return matrix;
}

function buildDocsMatrix(): Record<ProjectType, Record<string, boolean>> {
  const matrix = {} as Record<ProjectType, Record<string, boolean>>;

  for (const projectType of PROJECT_TYPES) {
    const included = new Set([...CORE_DOCS, ...EXTRA_DOCS_BY_TYPE[projectType]]);
    matrix[projectType] = {} as Record<string, boolean>;

    for (const doc of DOCUMENT_GUIDE_KEYS) {
      matrix[projectType][doc] = included.has(doc);
    }
  }

  return matrix;
}

function buildSkillsMatrix(): Record<ProjectType, Record<BuiltInSkillType, boolean>> {
  const matrix = {} as Record<ProjectType, Record<BuiltInSkillType, boolean>>;

  for (const projectType of PROJECT_TYPES) {
    const included = new Set([...CORE_SKILLS, ...EXTRA_SKILLS_BY_TYPE[projectType]]);
    matrix[projectType] = {} as Record<BuiltInSkillType, boolean>;

    for (const skill of BUILT_IN_SKILLS) {
      matrix[projectType][skill] = included.has(skill);
    }
  }

  return matrix;
}

/**
 * Agent filtering matrix - which agents are relevant for each project type
 * Built from CORE_AGENTS + EXTRA_AGENTS_BY_TYPE for maintainability
 */
export const AGENT_FILTER_MATRIX = buildAgentMatrix();

/**
 * Documentation filtering matrix - which docs are relevant for each project type
 * Built from CORE_DOCS + EXTRA_DOCS_BY_TYPE for maintainability
 */
export const DOCS_FILTER_MATRIX = buildDocsMatrix();

/**
 * Skills filtering matrix - which skills are relevant for each project type
 * Built from CORE_SKILLS + EXTRA_SKILLS_BY_TYPE for maintainability
 */
export const SKILLS_FILTER_MATRIX = buildSkillsMatrix();

/**
 * Get filtered list of agents for a project type
 * Uses core + extras pattern for efficiency
 */
export function getAgentsForProjectType(projectType: ProjectType): AgentType[] {
  const extras = EXTRA_AGENTS_BY_TYPE[projectType] ?? [];
  return [...CORE_AGENTS, ...extras] as AgentType[];
}

/**
 * Get filtered list of documentation keys for a project type
 * Uses core + extras pattern for efficiency
 */
export function getDocsForProjectType(projectType: ProjectType): string[] {
  const extras = EXTRA_DOCS_BY_TYPE[projectType] ?? [];
  return [...CORE_DOCS, ...extras];
}

/**
 * Get filtered list of skills for a project type
 * Uses core + extras pattern for efficiency
 */
export function getSkillsForProjectType(projectType: ProjectType): BuiltInSkillType[] {
  const extras = EXTRA_SKILLS_BY_TYPE[projectType] ?? [];
  return [...CORE_SKILLS, ...extras] as BuiltInSkillType[];
}

/**
 * Get all scaffolds filtered by project type
 */
export function getFilteredScaffolds(projectType: ProjectType): {
  agents: AgentType[];
  docs: string[];
  skills: BuiltInSkillType[];
} {
  return {
    agents: getAgentsForProjectType(projectType),
    docs: getDocsForProjectType(projectType),
    skills: getSkillsForProjectType(projectType),
  };
}

/**
 * Check if a specific agent should be included for a project type
 */
export function shouldIncludeAgent(projectType: ProjectType, agent: AgentType): boolean {
  const included = new Set(getAgentsForProjectType(projectType));
  return included.has(agent);
}

/**
 * Check if a specific doc should be included for a project type
 */
export function shouldIncludeDoc(projectType: ProjectType, doc: string): boolean {
  const included = new Set(getDocsForProjectType(projectType));
  return included.has(doc);
}

/**
 * Check if a specific skill should be included for a project type
 */
export function shouldIncludeSkill(projectType: ProjectType, skill: BuiltInSkillType): boolean {
  const included = new Set(getSkillsForProjectType(projectType));
  return included.has(skill);
}

/**
 * Validation: Ensure all project types have entries in extras maps.
 * Called at module load time to catch configuration errors early.
 */
function validateConfiguration(): void {
  for (const projectType of PROJECT_TYPES) {
    if (!(projectType in EXTRA_AGENTS_BY_TYPE)) {
      throw new Error(`Missing EXTRA_AGENTS_BY_TYPE entry for project type: ${projectType}`);
    }
    if (!(projectType in EXTRA_DOCS_BY_TYPE)) {
      throw new Error(`Missing EXTRA_DOCS_BY_TYPE entry for project type: ${projectType}`);
    }
    if (!(projectType in EXTRA_SKILLS_BY_TYPE)) {
      throw new Error(`Missing EXTRA_SKILLS_BY_TYPE entry for project type: ${projectType}`);
    }
  }
}

// Validate configuration at module load time
validateConfiguration();
