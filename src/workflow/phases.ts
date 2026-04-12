import { PrevcPhase, PhaseDefinition, PhaseStatus } from './types';
import {
  PREVC_PHASE_MODEL,
  PREVC_PHASE_SEQUENCE,
} from './registries/prevcModel';

/**
 * All PREVC phases in order
 */
export const PREVC_PHASE_ORDER: PrevcPhase[] = [...PREVC_PHASE_SEQUENCE];

/**
 * Complete definition of all PREVC phases
 */
export const PREVC_PHASES: Record<PrevcPhase, PhaseDefinition> = Object.fromEntries(
  PREVC_PHASE_ORDER.map((phase) => {
    const definition = PREVC_PHASE_MODEL[phase];
    return [phase, {
      name: definition.name,
      description: definition.description,
      roles: [...definition.roles],
      outputs: [...definition.outputs],
      optional: definition.optional,
      order: definition.order,
    }];
  })
) as Record<PrevcPhase, PhaseDefinition>;

/**
 * Phase display names (English - default)
 */
export const PHASE_NAMES: Record<PrevcPhase, string> = Object.fromEntries(
  PREVC_PHASE_ORDER.map((phase) => [phase, PREVC_PHASE_MODEL[phase].name])
) as Record<PrevcPhase, string>;

/**
 * Phase display names in English (alias for consistency)
 */
export const PHASE_NAMES_EN = PHASE_NAMES;

/**
 * Phase display names in Portuguese (for i18n)
 */
export const PHASE_NAMES_PT: Record<PrevcPhase, string> = Object.fromEntries(
  PREVC_PHASE_ORDER.map((phase) => [phase, PREVC_PHASE_MODEL[phase].namePt])
) as Record<PrevcPhase, string>;

/**
 * Get the definition for a specific phase
 */
export function getPhaseDefinition(phase: PrevcPhase): PhaseDefinition {
  return PREVC_PHASES[phase];
}

/**
 * Get the next phase in the workflow
 */
export function getNextPhase(currentPhase: PrevcPhase): PrevcPhase | null {
  const currentIndex = PREVC_PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= PREVC_PHASE_ORDER.length - 1) {
    return null;
  }
  return PREVC_PHASE_ORDER[currentIndex + 1];
}

/**
 * Get the next non-skipped phase for a workflow status snapshot.
 */
export function getNextActivePhase(
  currentPhase: PrevcPhase,
  phases: Partial<Record<PrevcPhase, Pick<PhaseStatus, 'status'>>>
): PrevcPhase | null {
  const currentIndex = PREVC_PHASE_ORDER.indexOf(currentPhase);

  for (let i = currentIndex + 1; i < PREVC_PHASE_ORDER.length; i++) {
    const phase = PREVC_PHASE_ORDER[i];
    if (phases[phase]?.status !== 'skipped') {
      return phase;
    }
  }

  return null;
}

/**
 * Get the previous phase in the workflow
 */
export function getPreviousPhase(currentPhase: PrevcPhase): PrevcPhase | null {
  const currentIndex = PREVC_PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex <= 0) {
    return null;
  }
  return PREVC_PHASE_ORDER[currentIndex - 1];
}

/**
 * Check if a phase is optional
 */
export function isPhaseOptional(phase: PrevcPhase): boolean {
  return PREVC_PHASES[phase]?.optional ?? false;
}

/**
 * Get all roles for a specific phase
 */
export function getRolesForPhase(phase: PrevcPhase): string[] {
  return PREVC_PHASES[phase]?.roles || [];
}

/**
 * Get all outputs for a specific phase
 */
export function getOutputsForPhase(phase: PrevcPhase): string[] {
  return PREVC_PHASES[phase]?.outputs || [];
}

/**
 * Check if a string is a valid PREVC phase
 */
export function isValidPhase(phase: string): phase is PrevcPhase {
  return PREVC_PHASE_ORDER.includes(phase as PrevcPhase);
}

/**
 * Get the phase order number (1-5)
 */
export function getPhaseOrder(phase: PrevcPhase): number {
  return PREVC_PHASES[phase]?.order ?? 0;
}
