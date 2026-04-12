import { PrevcRole, RoleDefinition } from './types';
import {
  PREVC_PHASE_SEQUENCE,
  PREVC_ROLE_MODEL,
  PREVC_ROLE_SEQUENCE,
} from './registries/prevcModel';

/**
 * Complete configuration for all PREVC roles
 */
export const ROLE_CONFIG: Record<PrevcRole, RoleDefinition> = Object.fromEntries(
  PREVC_ROLE_SEQUENCE.map((role) => {
    const definition = PREVC_ROLE_MODEL[role];
    const phase = definition.phases.length === 1
      ? definition.phases[0]
      : [...definition.phases];

    return [role, {
      phase,
      responsibilities: [...definition.responsibilities],
      outputs: [...definition.outputs],
      specialists: [...definition.specialists],
    }];
  })
) as Record<PrevcRole, RoleDefinition>;

/**
 * Get the configuration for a specific role
 */
export function getRoleConfig(role: PrevcRole): RoleDefinition {
  return ROLE_CONFIG[role];
}

/**
 * Get all roles that participate in a specific phase
 */
export function getRolesForPhase(phase: string): PrevcRole[] {
  return PREVC_ROLE_SEQUENCE.filter((role) =>
    PREVC_ROLE_MODEL[role].phases.includes(phase as (typeof PREVC_PHASE_SEQUENCE)[number])
  );
}

/**
 * Get all outputs for a specific role
 */
export function getOutputsForRole(role: PrevcRole): string[] {
  return ROLE_CONFIG[role]?.outputs || [];
}

/**
 * Get all responsibilities for a specific role
 */
export function getResponsibilitiesForRole(role: PrevcRole): string[] {
  return ROLE_CONFIG[role]?.responsibilities || [];
}
