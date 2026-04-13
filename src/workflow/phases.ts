/**
 * PREVC Workflow Phases
 *
 * Defines the five phases of the PREVC workflow:
 * P - Planning
 * R - Review
 * E - Execution
 * V - Validation
 * C - Confirmation
 */

import { PrevcPhase, PhaseDefinition } from './types';

/**
 * All PREVC phases in order
 */
export const PREVC_PHASE_ORDER: PrevcPhase[] = ['P', 'R', 'E', 'V', 'C'];

/**
 * Complete definition of all PREVC phases
 */
export const PREVC_PHASES: Record<PrevcPhase, PhaseDefinition> = {
  P: {
    name: 'Planning',
    description: 'Discovery, requirements and specifications',
    roles: ['planner', 'designer'],
    outputs: ['prd', 'tech-spec', 'requirements', 'wireframes'],
    optional: false,
    order: 1,
  },
  R: {
    name: 'Review',
    description: 'Architecture, technical decisions and design review',
    roles: ['architect', 'designer'],
    outputs: ['architecture', 'adr', 'design-spec'],
    optional: true, // Depends on scale
    order: 2,
  },
  E: {
    name: 'Execution',
    description: 'Implementation and development',
    roles: ['developer'],
    outputs: ['code', 'unit-tests'],
    optional: false,
    order: 3,
  },
  V: {
    name: 'Validation',
    description: 'Tests, QA and code review',
    roles: ['qa', 'reviewer'],
    outputs: ['test-report', 'review-comments', 'approval'],
    optional: false,
    order: 4,
  },
  C: {
    name: 'Confirmation',
    description: 'Documentation, deploy and handoff',
    roles: ['documenter'],
    outputs: ['documentation', 'changelog', 'deploy'],
    optional: true, // Depends on scale
    order: 5,
  },
};

/**
 * Phase display names (English - default)
 */
export const PHASE_NAMES: Record<PrevcPhase, string> = {
  P: 'Planning',
  R: 'Review',
  E: 'Execution',
  V: 'Validation',
  C: 'Confirmation',
};

/**
 * Phase display names in English (alias for consistency)
 */
export const PHASE_NAMES_EN = PHASE_NAMES;

/**
 * Phase display names in Portuguese (for i18n)
 */
export const PHASE_NAMES_PT: Record<PrevcPhase, string> = {
  P: 'Planejamento',
  R: 'Revisão',
  E: 'Execução',
  V: 'Validação',
  C: 'Confirmação',
};

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
