/**
 * Validation functions for scaffold structures
 */

import { ScaffoldStructure } from './types';
import { SCAFFOLD_STRUCTURES } from './registry';

/**
 * Validate that a structure is well-formed
 */
export function validateStructure(structure: ScaffoldStructure): string[] {
  const errors: string[] = [];

  if (!structure.documentName) {
    errors.push('Missing documentName');
  }

  if (!structure.title) {
    errors.push('Missing title');
  }

  if (!structure.sections || structure.sections.length === 0) {
    errors.push('No sections defined');
  }

  const orders = new Set<number>();
  for (const section of structure.sections) {
    if (!section.heading) {
      errors.push(`Section ${section.order} missing heading`);
    }
    if (!section.guidance) {
      errors.push(`Section "${section.heading}" missing guidance`);
    }
    if (orders.has(section.order)) {
      errors.push(`Duplicate order ${section.order}`);
    }
    orders.add(section.order);
  }

  return errors;
}

/**
 * Validate all structures in the registry
 */
export function validateAllStructures(): Map<string, string[]> {
  const results = new Map<string, string[]>();

  for (const [name, structure] of Object.entries(SCAFFOLD_STRUCTURES)) {
    const errors = validateStructure(structure);
    if (errors.length > 0) {
      results.set(name, errors);
    }
  }

  return results;
}
