/**
 * PREVC Scale-Adaptive Routing
 *
 * Determines which phases and roles are needed based on project scale.
 */

import { ProjectScale, PrevcPhase, PrevcRole, ScaleRoute, ProjectContext } from './types';

/**
 * Scale route configurations
 * Defines which phases, roles, and documents are required for each scale level.
 */
export const SCALE_ROUTES: Record<ProjectScale, ScaleRoute> = {
  [ProjectScale.QUICK]: {
    phases: ['E', 'V'],
    roles: ['solo-dev'],
    documents: ['code'],
    skipReview: true,
  },
  [ProjectScale.SMALL]: {
    phases: ['P', 'E', 'V'],
    roles: ['planner', 'developer', 'qa'],
    documents: ['tech-spec', 'code', 'test-report'],
  },
  [ProjectScale.MEDIUM]: {
    phases: ['P', 'R', 'E', 'V'],
    roles: ['planner', 'architect', 'developer', 'qa', 'reviewer'],
    documents: ['prd', 'architecture', 'code', 'test-report', 'review'],
  },
  [ProjectScale.LARGE]: {
    phases: ['P', 'R', 'E', 'V', 'C'],
    roles: 'all',
    documents: ['prd', 'architecture', 'code', 'test-report', 'documentation', 'adr'],
  },
};

/**
 * Keywords that indicate a bug fix
 */
const BUG_FIX_KEYWORDS = [
  'fix',
  'bug',
  'hotfix',
  'patch',
  'correção',
  'corrigir',
  'erro',
  'issue',
  'problema',
];

/**
 * Keywords that indicate a simple feature
 */
const SIMPLE_FEATURE_KEYWORDS = [
  'add',
  'adicionar',
  'simple',
  'simples',
  'pequeno',
  'small',
  'minor',
  'tweak',
  'ajuste',
];

/**
 * Keywords that indicate security/compliance requirements
 */
const SECURITY_KEYWORDS = [
  'security',
  'segurança',
  'compliance',
  'audit',
  'auditoria',
  'gdpr',
  'lgpd',
  'pci',
  'hipaa',
  'soc2',
];

/**
 * Keywords that indicate documentation is needed
 */
const DOCUMENTATION_KEYWORDS = [
  'document',
  'documentar',
  'docs',
  'readme',
  'api',
  'public',
  'externa',
  'external',
];

/**
 * Check if description indicates a bug fix
 */
function isBugFix(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return BUG_FIX_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Check if description indicates a simple feature
 */
function isSimpleFeature(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return SIMPLE_FEATURE_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Check if description indicates security/compliance requirements
 */
function requiresSecurityAudit(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return SECURITY_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Check if description indicates documentation is needed
 */
function requiresDocumentation(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return DOCUMENTATION_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Detect the appropriate project scale based on context
 */
export function detectProjectScale(context: ProjectContext): ProjectScale {
  const { description, files = [], complexity, hasCompliance } = context;

  // QUICK: Bug fixes, small refactorings
  if (isBugFix(description) || (files.length <= 3 && !hasCompliance)) {
    return ProjectScale.QUICK;
  }

  // SMALL: Simple features, no new architecture
  if (isSimpleFeature(description) && files.length <= 10) {
    return ProjectScale.SMALL;
  }

  // LARGE: Multiple modules, documentation needed, compliance/security
  if (
    files.length > 30 ||
    requiresDocumentation(description) ||
    complexity === 'high' ||
    hasCompliance ||
    requiresSecurityAudit(description)
  ) {
    return ProjectScale.LARGE;
  }

  // MEDIUM: Default for regular features
  return ProjectScale.MEDIUM;
}

/**
 * Get the scale route for a specific scale level
 */
export function getScaleRoute(scale: ProjectScale): ScaleRoute {
  return SCALE_ROUTES[scale];
}

/**
 * Get the phases required for a specific scale
 */
export function getPhasesForScale(scale: ProjectScale): PrevcPhase[] {
  return SCALE_ROUTES[scale].phases;
}

/**
 * Get the roles required for a specific scale
 */
export function getRolesForScale(scale: ProjectScale): PrevcRole[] | 'all' {
  return SCALE_ROUTES[scale].roles;
}

/**
 * Check if a phase is required for a specific scale
 */
export function isPhaseRequiredForScale(
  phase: PrevcPhase,
  scale: ProjectScale
): boolean {
  return SCALE_ROUTES[scale].phases.includes(phase);
}

/**
 * Get scale name for display
 */
export function getScaleName(scale: ProjectScale): string {
  const names: Record<ProjectScale, string> = {
    [ProjectScale.QUICK]: 'Quick',
    [ProjectScale.SMALL]: 'Small',
    [ProjectScale.MEDIUM]: 'Medium',
    [ProjectScale.LARGE]: 'Large',
  };
  return names[scale];
}

/**
 * Get scale from string name
 */
export function getScaleFromName(name: string): ProjectScale | null {
  const nameMap: Record<string, ProjectScale> = {
    quick: ProjectScale.QUICK,
    small: ProjectScale.SMALL,
    medium: ProjectScale.MEDIUM,
    large: ProjectScale.LARGE,
  };
  return nameMap[name.toLowerCase()] ?? null;
}

/**
 * Get estimated time for a scale level
 */
export function getEstimatedTime(scale: ProjectScale): string {
  const times: Record<ProjectScale, string> = {
    [ProjectScale.QUICK]: '~5 min',
    [ProjectScale.SMALL]: '~15 min',
    [ProjectScale.MEDIUM]: '~30 min',
    [ProjectScale.LARGE]: '~1+ hours',
  };
  return times[scale];
}
