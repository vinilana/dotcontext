/**
 * PREVC Workflow Roles
 *
 * Defines the available roles in the PREVC workflow system
 * and their mapping to existing agent types.
 */

import { PrevcRole } from './types';
import { ROLE_CONFIG } from './prevcConfig';

/**
 * All available PREVC roles
 */
export const PREVC_ROLES = [
  'planner', // P: Discovery, requirements, specifications
  'designer', // P/R: UX, design systems, wireframes
  'architect', // R: ADRs, technical decisions, blueprints
  'developer', // E: Implementation, coding
  'qa', // V: Tests, quality gates
  'reviewer', // V: Code review, standards
  'documenter', // C: Documentation, handoff
  'solo-dev', // P→C: Full quick flow
] as const;

/**
 * Mapping from PREVC roles to existing agent types (specialists).
 *
 * Derived from the canonical `ROLE_CONFIG` in `prevcConfig.ts` so there
 * is a single source of truth for `role -> specialists`. Historically
 * this map diverged slightly (e.g. omitted `database-specialist` and
 * `devops-specialist` under `developer`); we now prefer the canonical
 * list from `ROLE_CONFIG`.
 *
 * @deprecated Use `ROLE_TO_AGENTS` from orchestration/agentOrchestrator
 * or read `ROLE_CONFIG[role].specialists` directly.
 */
export const ROLE_TO_SPECIALISTS: Record<PrevcRole, string[]> = Object.fromEntries(
  (Object.keys(ROLE_CONFIG) as PrevcRole[]).map((role) => [
    role,
    [...ROLE_CONFIG[role].specialists],
  ])
) as Record<PrevcRole, string[]>;

/**
 * Mapping from existing agent types to PREVC roles
 * @deprecated Use agent-based tracking instead of role-based.
 * This mapping is kept for backward compatibility.
 */
export const SPECIALIST_TO_ROLE: Record<string, PrevcRole> = {
  'frontend-specialist': 'designer',
  'architect-specialist': 'architect',
  'feature-developer': 'developer',
  'bug-fixer': 'developer',
  'backend-specialist': 'developer',
  'mobile-specialist': 'developer',
  'test-writer': 'qa',
  'security-auditor': 'qa',
  'performance-optimizer': 'qa',
  'code-reviewer': 'reviewer',
  'documentation-writer': 'documenter',
  'refactoring-specialist': 'solo-dev',
  'database-specialist': 'developer',
  'devops-specialist': 'developer',
};

/**
 * Role display names (English)
 */
export const ROLE_DISPLAY_NAMES: Record<PrevcRole, string> = {
  planner: 'Planner',
  designer: 'Designer',
  architect: 'Architect',
  developer: 'Developer',
  qa: 'QA Engineer',
  reviewer: 'Reviewer',
  documenter: 'Documenter',
  'solo-dev': 'Solo Dev',
};

/**
 * Role display names in English (alias for consistency)
 */
export const ROLE_DISPLAY_NAMES_EN = ROLE_DISPLAY_NAMES;

/**
 * Role display names in Portuguese (for i18n)
 */
export const ROLE_DISPLAY_NAMES_PT: Record<PrevcRole, string> = {
  planner: 'Planejador',
  designer: 'Designer',
  architect: 'Arquiteto',
  developer: 'Desenvolvedor',
  qa: 'QA',
  reviewer: 'Revisor',
  documenter: 'Documentador',
  'solo-dev': 'Solo Dev',
};

/**
 * Check if a string is a valid PREVC role
 */
export function isValidRole(role: string): role is PrevcRole {
  return PREVC_ROLES.includes(role as PrevcRole);
}

/**
 * Get the PREVC role for an existing agent type
 * @deprecated Use agent-based tracking instead of role-based.
 */
export function getRoleForSpecialist(specialist: string): PrevcRole | null {
  return SPECIALIST_TO_ROLE[specialist] || null;
}

/**
 * Get all specialists for a PREVC role
 * @deprecated Use ROLE_TO_AGENTS from orchestration/agentOrchestrator instead.
 */
export function getSpecialistsForRole(role: PrevcRole): string[] {
  return ROLE_TO_SPECIALISTS[role] || [];
}
