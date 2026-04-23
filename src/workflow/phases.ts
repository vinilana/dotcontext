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
 * Keyword-based mapping from plan-local phase names to PREVC phases.
 * Lives here (not in plans/*) so plan tooling stays a consumer of phase definitions.
 */
export const PLAN_PHASE_TO_PREVC: Record<string, PrevcPhase> = {
  discovery: 'P',
  alignment: 'P',
  review: 'R',
  architecture: 'R',
  implementation: 'E',
  build: 'E',
  validation: 'V',
  testing: 'V',
  handoff: 'C',
  deployment: 'C',
};

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

/**
 * Minimal shape we need to decide whether a phase is active.
 *
 * We intentionally keep this structural (not importing `PrevcStatus`) so
 * `phases.ts` stays leaf-level and can be consumed anywhere.
 */
export interface PhaseStatusMap {
  [phase: string]: { status: string } | undefined;
}

/**
 * Return the next non-skipped phase after `currentPhase`, or `null` if
 * there are no more active phases.
 *
 * Unlike `getNextPhase`, this consults the workflow status to skip over
 * phases marked `skipped`. Throws with context when the status is missing
 * an entry for any phase in `PREVC_PHASE_ORDER` — that is a data
 * corruption bug we want to surface loudly rather than silently return
 * null.
 */
export function getNextActivePhase(
  currentPhase: PrevcPhase,
  phases: PhaseStatusMap
): PrevcPhase | null {
  const currentIndex = PREVC_PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex < 0) {
    throw new Error(
      `getNextActivePhase: unknown current phase "${currentPhase}". ` +
        `Expected one of ${PREVC_PHASE_ORDER.join(', ')}.`
    );
  }

  for (let i = currentIndex + 1; i < PREVC_PHASE_ORDER.length; i++) {
    const phase = PREVC_PHASE_ORDER[i];
    const entry = phases[phase];
    if (!entry || typeof entry.status !== 'string') {
      throw new Error(
        `getNextActivePhase: status is missing a valid entry for phase "${phase}". ` +
          `This indicates a corrupted workflow status document.`
      );
    }
    if (entry.status !== 'skipped') {
      return phase;
    }
  }

  return null;
}
