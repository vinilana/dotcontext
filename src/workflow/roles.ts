import { PrevcRole } from './types';
import {
  PREVC_ROLE_MODEL,
  PREVC_ROLE_SEQUENCE,
} from './registries/prevcModel';

/**
 * All available PREVC roles
 */
export const PREVC_ROLES = PREVC_ROLE_SEQUENCE;

/**
 * Mapping from PREVC roles to existing agent types (specialists)
 * @deprecated Use ROLE_TO_AGENTS from orchestration/agentOrchestrator instead.
 * This mapping is kept for backward compatibility.
 */
export const ROLE_TO_SPECIALISTS: Record<PrevcRole, string[]> = Object.fromEntries(
  PREVC_ROLES.map((role) => [role, [...PREVC_ROLE_MODEL[role].specialists]])
) as Record<PrevcRole, string[]>;

/**
 * Mapping from existing agent types to PREVC roles
 * @deprecated Use agent-based tracking instead of role-based.
 * This mapping is kept for backward compatibility.
 */
export const SPECIALIST_TO_ROLE: Record<string, PrevcRole> = Object.fromEntries(
  PREVC_ROLES.flatMap((role) =>
    PREVC_ROLE_MODEL[role].specialists.map((specialist) => [specialist, role] as const)
  )
) as Record<string, PrevcRole>;

/**
 * Role display names (English)
 */
export const ROLE_DISPLAY_NAMES: Record<PrevcRole, string> = Object.fromEntries(
  PREVC_ROLES.map((role) => [role, PREVC_ROLE_MODEL[role].displayName])
) as Record<PrevcRole, string>;

/**
 * Role display names in English (alias for consistency)
 */
export const ROLE_DISPLAY_NAMES_EN = ROLE_DISPLAY_NAMES;

/**
 * Role display names in Portuguese (for i18n)
 */
export const ROLE_DISPLAY_NAMES_PT: Record<PrevcRole, string> = Object.fromEntries(
  PREVC_ROLES.map((role) => [role, PREVC_ROLE_MODEL[role].displayNamePt])
) as Record<PrevcRole, string>;

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
