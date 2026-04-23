/**
 * Plan scaffold auto-detection.
 *
 * Inspects a repository and proposes per-PREVC-phase requirement defaults
 * the plan author can keep, edit, or remove. The function is pure with
 * respect to its inputs (only reads the filesystem), and never overwrites
 * existing requirements declared by the author — the scaffold writer is
 * responsible for merging only the absent fields.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type { PrevcPhase } from '../types';
import type { PlanPhaseRequirements } from './types';

export type PhaseRequirementSuggestions = Partial<Record<PrevcPhase, PlanPhaseRequirements>>;

interface DetectedFeatures {
  hasI18n: boolean;
  hasTestScript: boolean;
  hasTsconfig: boolean;
  hasEslint: boolean;
}

async function dirHasJson(dir: string): Promise<boolean> {
  if (!(await fs.pathExists(dir))) return false;
  try {
    const entries = await fs.readdir(dir);
    return entries.some((e) => e.toLowerCase().endsWith('.json'));
  } catch {
    return false;
  }
}

async function hasTestScript(repoPath: string): Promise<boolean> {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!(await fs.pathExists(pkgPath))) return false;
  try {
    const pkg = (await fs.readJson(pkgPath)) as { scripts?: Record<string, string> };
    const test = pkg.scripts?.test;
    if (!test) return false;
    // npm init generates a placeholder script; treat it as no real test.
    if (/no test specified/i.test(test)) return false;
    return true;
  } catch {
    return false;
  }
}

async function hasEslintConfig(repoPath: string): Promise<boolean> {
  const candidates = [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
  ];
  for (const name of candidates) {
    if (await fs.pathExists(path.join(repoPath, name))) return true;
  }
  // Also accept `eslintConfig` key in package.json.
  const pkgPath = path.join(repoPath, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = (await fs.readJson(pkgPath)) as Record<string, unknown>;
      if (pkg.eslintConfig && typeof pkg.eslintConfig === 'object') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function detectFeatures(repoPath: string): Promise<DetectedFeatures> {
  const [hasI18n, hasTestScriptResult, hasTsconfig, hasEslint] = await Promise.all([
    (async () =>
      (await dirHasJson(path.join(repoPath, 'locales'))) ||
      (await dirHasJson(path.join(repoPath, 'i18n'))))(),
    hasTestScript(repoPath),
    fs.pathExists(path.join(repoPath, 'tsconfig.json')),
    hasEslintConfig(repoPath),
  ]);
  return {
    hasI18n,
    hasTestScript: hasTestScriptResult,
    hasTsconfig,
    hasEslint,
  };
}

/**
 * Build per-phase requirement suggestions for a repo. Only PREVC phases with
 * at least one suggestion are present in the result; an empty object means
 * "no suggestions, leave the scaffold as-is".
 */
export async function suggestPhaseRequirements(
  repoPath: string
): Promise<PhaseRequirementSuggestions> {
  const features = await detectFeatures(repoPath);
  const suggestions: PhaseRequirementSuggestions = {};

  const ePhase: PlanPhaseRequirements = { requiredSensors: [], requiredArtifacts: [] };
  const vPhase: PlanPhaseRequirements = { requiredSensors: [], requiredArtifacts: [] };

  if (features.hasI18n) {
    ePhase.requiredSensors.push('i18n-coverage');
  }
  if (features.hasTestScript) {
    vPhase.requiredSensors.push('tests-passing');
  }
  if (features.hasTsconfig) {
    vPhase.requiredSensors.push('typecheck-clean');
  }
  if (features.hasEslint) {
    vPhase.requiredSensors.push('lint');
  }

  if (ePhase.requiredSensors.length > 0 || ePhase.requiredArtifacts.length > 0) {
    suggestions.E = ePhase;
  }
  if (vPhase.requiredSensors.length > 0 || vPhase.requiredArtifacts.length > 0) {
    suggestions.V = vPhase;
  }

  return suggestions;
}

/**
 * Merge a scaffold's per-phase requirements with detected suggestions. The
 * scaffold is the source of truth — we only fill in `required_sensors` for a
 * phase if the scaffold did not already declare any. Artifacts follow the
 * same rule. Returns the merged shape; never mutates inputs.
 */
export function mergeSuggestionsIntoPhases<
  T extends {
    prevc: PrevcPhase;
    required_sensors?: string[];
    required_artifacts?: unknown[];
  }
>(phases: T[], suggestions: PhaseRequirementSuggestions): T[] {
  return phases.map((phase) => {
    const sug = suggestions[phase.prevc];
    if (!sug) return phase;
    const next: T = { ...phase };
    if ((!next.required_sensors || next.required_sensors.length === 0) && sug.requiredSensors.length > 0) {
      next.required_sensors = [...sug.requiredSensors];
    }
    if ((!next.required_artifacts || next.required_artifacts.length === 0) && sug.requiredArtifacts.length > 0) {
      next.required_artifacts = [...sug.requiredArtifacts] as T['required_artifacts'];
    }
    return next;
  });
}
