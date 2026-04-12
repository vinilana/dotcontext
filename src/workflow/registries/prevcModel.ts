import type { PhaseDefinition, PrevcPhase, PrevcRole } from '../types';
import type { BuiltInAgentType } from '../agents/agentRegistry';

export type PrevcDocType =
  | 'architecture'
  | 'data-flow'
  | 'glossary'
  | 'api'
  | 'getting-started'
  | 'deployment'
  | 'security'
  | 'testing'
  | 'contributing'
  | 'readme';

export interface PrevcPhaseModel extends PhaseDefinition {
  namePt: string;
  recommendedAgents: BuiltInAgentType[];
  docs: PrevcDocType[];
}

export interface PrevcRoleModel {
  phases: PrevcPhase[];
  displayName: string;
  displayNamePt: string;
  responsibilities: string[];
  outputs: string[];
  agents: BuiltInAgentType[];
  specialists: BuiltInAgentType[];
  docs: PrevcDocType[];
}

export interface PrevcDocGuide {
  type: PrevcDocType;
  path: string;
  title: string;
  description: string;
}

export const PREVC_PHASE_SEQUENCE = ['P', 'R', 'E', 'V', 'C'] as const satisfies readonly PrevcPhase[];
export const PREVC_ROLE_SEQUENCE = [
  'planner',
  'designer',
  'architect',
  'developer',
  'qa',
  'reviewer',
  'documenter',
  'solo-dev',
] as const satisfies readonly PrevcRole[];

export const PREVC_PHASE_MODEL: Record<PrevcPhase, PrevcPhaseModel> = {
  P: {
    name: 'Planning',
    namePt: 'Planejamento',
    description: 'Discovery, requirements and specifications',
    roles: ['planner', 'designer'],
    outputs: ['prd', 'tech-spec', 'requirements', 'wireframes'],
    optional: false,
    order: 1,
    recommendedAgents: ['architect-specialist', 'documentation-writer', 'frontend-specialist'],
    docs: ['architecture', 'glossary', 'readme'],
  },
  R: {
    name: 'Review',
    namePt: 'Revisão',
    description: 'Architecture, technical decisions and design review',
    roles: ['architect', 'designer'],
    outputs: ['architecture', 'adr', 'design-spec'],
    optional: true,
    order: 2,
    recommendedAgents: ['architect-specialist', 'code-reviewer', 'security-auditor'],
    docs: ['architecture', 'security', 'data-flow'],
  },
  E: {
    name: 'Execution',
    namePt: 'Execução',
    description: 'Implementation and development',
    roles: ['developer'],
    outputs: ['code', 'unit-tests'],
    optional: false,
    order: 3,
    recommendedAgents: [
      'feature-developer',
      'backend-specialist',
      'frontend-specialist',
      'database-specialist',
      'mobile-specialist',
      'bug-fixer',
    ],
    docs: ['architecture', 'api', 'data-flow', 'getting-started'],
  },
  V: {
    name: 'Validation',
    namePt: 'Validação',
    description: 'Tests, QA and code review',
    roles: ['qa', 'reviewer'],
    outputs: ['test-report', 'review-comments', 'approval'],
    optional: false,
    order: 4,
    recommendedAgents: [
      'test-writer',
      'code-reviewer',
      'security-auditor',
      'performance-optimizer',
    ],
    docs: ['testing', 'security', 'api'],
  },
  C: {
    name: 'Confirmation',
    namePt: 'Confirmação',
    description: 'Documentation, deploy and handoff',
    roles: ['documenter'],
    outputs: ['documentation', 'changelog', 'deploy'],
    optional: true,
    order: 5,
    recommendedAgents: ['documentation-writer', 'devops-specialist'],
    docs: ['deployment', 'readme', 'contributing'],
  },
};

export const PREVC_ROLE_MODEL: Record<PrevcRole, PrevcRoleModel> = {
  planner: {
    phases: ['P'],
    displayName: 'Planner',
    displayNamePt: 'Planejador',
    responsibilities: [
      'Conduct discovery and requirements gathering',
      'Create specifications and project scope',
      'Define acceptance criteria',
      'Generate PRD or Tech Spec',
      'Identify risks and dependencies',
    ],
    outputs: ['prd', 'tech-spec', 'requirements'],
    agents: ['architect-specialist', 'documentation-writer'],
    specialists: [],
    docs: ['architecture', 'glossary', 'readme'],
  },
  designer: {
    phases: ['P', 'R'],
    displayName: 'Designer',
    displayNamePt: 'Designer',
    responsibilities: [
      'Create wireframes and prototypes',
      'Define design system and components',
      'Ensure accessibility and usability',
      'Document UI/UX patterns',
      'Validate user flows',
    ],
    outputs: ['wireframes', 'design-spec', 'ui-components'],
    agents: ['frontend-specialist'],
    specialists: ['frontend-specialist'],
    docs: ['architecture', 'getting-started'],
  },
  architect: {
    phases: ['R'],
    displayName: 'Architect',
    displayNamePt: 'Arquiteto',
    responsibilities: [
      'Define system architecture',
      'Create ADRs (Architecture Decision Records)',
      'Choose technologies and patterns',
      'Ensure scalability and maintainability',
      'Review technical impact of decisions',
    ],
    outputs: ['architecture', 'adr', 'tech-decisions'],
    agents: ['architect-specialist', 'backend-specialist', 'database-specialist'],
    specialists: ['architect-specialist'],
    docs: ['architecture', 'data-flow', 'security', 'deployment'],
  },
  developer: {
    phases: ['E'],
    displayName: 'Developer',
    displayNamePt: 'Desenvolvedor',
    responsibilities: [
      'Implement code according to specifications',
      'Follow defined patterns and architecture',
      'Create basic unit tests',
      'Document code when necessary',
      'Solve technical problems',
    ],
    outputs: ['code', 'unit-tests'],
    agents: [
      'feature-developer',
      'bug-fixer',
      'backend-specialist',
      'frontend-specialist',
      'mobile-specialist',
      'database-specialist',
    ],
    specialists: [
      'feature-developer',
      'bug-fixer',
      'backend-specialist',
      'frontend-specialist',
      'mobile-specialist',
    ],
    docs: ['architecture', 'api', 'data-flow', 'getting-started'],
  },
  qa: {
    phases: ['V'],
    displayName: 'QA Engineer',
    displayNamePt: 'QA',
    responsibilities: [
      'Create and execute integration tests',
      'Validate security and performance',
      'Ensure quality gates',
      'Report and track bugs',
      'Validate acceptance criteria',
    ],
    outputs: ['test-report', 'qa-approval', 'bug-report'],
    agents: ['test-writer', 'security-auditor', 'performance-optimizer'],
    specialists: ['test-writer', 'security-auditor', 'performance-optimizer'],
    docs: ['testing', 'security', 'api'],
  },
  reviewer: {
    phases: ['V'],
    displayName: 'Reviewer',
    displayNamePt: 'Revisor',
    responsibilities: [
      'Review code and architecture',
      'Ensure compliance with standards',
      'Suggest improvements and optimizations',
      'Validate best practices',
      'Approve or request changes',
    ],
    outputs: ['review-comments', 'approval'],
    agents: ['code-reviewer', 'security-auditor'],
    specialists: ['code-reviewer'],
    docs: ['architecture', 'contributing', 'glossary'],
  },
  documenter: {
    phases: ['C'],
    displayName: 'Documenter',
    displayNamePt: 'Documentador',
    responsibilities: [
      'Create technical documentation',
      'Update README and APIs',
      'Prepare handoff to production',
      'Generate changelog and release notes',
      'Document important decisions',
    ],
    outputs: ['documentation', 'changelog', 'readme'],
    agents: ['documentation-writer'],
    specialists: ['documentation-writer'],
    docs: ['readme', 'glossary', 'architecture', 'api', 'contributing'],
  },
  'solo-dev': {
    phases: ['P', 'R', 'E', 'V', 'C'],
    displayName: 'Solo Dev',
    displayNamePt: 'Solo Dev',
    responsibilities: [
      'Execute complete flow for small tasks',
      'Bug fixes and quick refactorings',
      'Low complexity features',
      'Maintenance of existing code',
      'Adjustments and specific tweaks',
    ],
    outputs: ['code', 'tests', 'docs'],
    agents: [
      'refactoring-specialist',
      'bug-fixer',
      'feature-developer',
      'test-writer',
      'documentation-writer',
    ],
    specialists: ['refactoring-specialist', 'bug-fixer'],
    docs: ['architecture', 'api', 'testing', 'readme'],
  },
};

export const PREVC_AGENT_DOCS: Record<BuiltInAgentType, PrevcDocType[]> = {
  'code-reviewer': ['architecture', 'contributing', 'glossary'],
  'bug-fixer': ['architecture', 'data-flow', 'testing'],
  'feature-developer': ['architecture', 'data-flow', 'api', 'getting-started'],
  'refactoring-specialist': ['architecture', 'glossary', 'contributing'],
  'test-writer': ['testing', 'architecture', 'api'],
  'documentation-writer': ['readme', 'glossary', 'architecture', 'api'],
  'performance-optimizer': ['architecture', 'data-flow', 'deployment'],
  'security-auditor': ['security', 'architecture', 'api'],
  'backend-specialist': ['architecture', 'api', 'data-flow', 'deployment'],
  'frontend-specialist': ['architecture', 'data-flow', 'getting-started'],
  'architect-specialist': ['architecture', 'data-flow', 'security', 'deployment'],
  'devops-specialist': ['deployment', 'security', 'testing'],
  'database-specialist': ['architecture', 'data-flow', 'glossary'],
  'mobile-specialist': ['architecture', 'api', 'getting-started'],
};

export const PREVC_DOC_GUIDES: Record<PrevcDocType, PrevcDocGuide> = {
  architecture: {
    type: 'architecture',
    path: '.context/docs/harness-split-foundation.md',
    title: 'Harness Split Foundation',
    description: 'Architecture baseline for the cli, harness, and mcp split.',
  },
  'data-flow': {
    type: 'data-flow',
    path: '.context/docs/project-overview.md',
    title: 'Project Overview',
    description: 'Repository surfaces, package layout, and execution flow.',
  },
  glossary: {
    type: 'glossary',
    path: '.context/docs/qa/project-structure.md',
    title: 'Project Structure Q&A',
    description: 'Glossary-like orientation for repository structure and terms.',
  },
  api: {
    type: 'api',
    path: '.context/docs/tooling.md',
    title: 'Tooling & Productivity',
    description: 'CLI and workflow tooling references for operator-facing surfaces.',
  },
  'getting-started': {
    type: 'getting-started',
    path: '.context/docs/qa/getting-started.md',
    title: 'Getting Started Q&A',
    description: 'Fast-start guidance for working in this repository.',
  },
  deployment: {
    type: 'deployment',
    path: '.context/docs/tooling.md',
    title: 'Tooling & Productivity',
    description: 'Operational scripts and automation touchpoints used for release work.',
  },
  security: {
    type: 'security',
    path: '.context/docs/development-workflow.md',
    title: 'Development Workflow',
    description: 'Process guidance covering review, CI, and safe change flow.',
  },
  testing: {
    type: 'testing',
    path: '.context/docs/testing-strategy.md',
    title: 'Testing Strategy',
    description: 'Testing expectations, suite shape, and validation workflow.',
  },
  contributing: {
    type: 'contributing',
    path: '.context/docs/development-workflow.md',
    title: 'Development Workflow',
    description: 'Contribution flow, branching expectations, and collaboration rules.',
  },
  readme: {
    type: 'readme',
    path: '.context/docs/README.md',
    title: 'Documentation Index',
    description: 'Index of the repository knowledge base and supporting guides.',
  },
};

export const PREVC_SKILL_PHASES = {
  'commit-message': ['E', 'C'],
  'pr-review': ['R', 'V'],
  'code-review': ['R', 'V'],
  'test-generation': ['E', 'V'],
  documentation: ['P', 'C'],
  refactoring: ['E'],
  'bug-investigation': ['E', 'V'],
  'feature-breakdown': ['P'],
  'api-design': ['P', 'R'],
  'security-audit': ['R', 'V'],
} as const satisfies Record<string, readonly PrevcPhase[]>;
