/**
 * Context Layout Registry
 *
 * Defines which `.context` paths are durable project knowledge and which are
 * local runtime state that should stay out of version control.
 */

export type ContextLayoutClassification = 'versioned' | 'local' | 'runtime';

export interface ContextLayoutEntry {
  id: string;
  path: string;
  classification: ContextLayoutClassification;
  trackedInGit: boolean;
  description: string;
}

export const CONTEXT_LAYOUT_REGISTRY: ContextLayoutEntry[] = [
  {
    id: 'docs',
    path: '.context/docs/**',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Durable project documentation and generated knowledge base content.',
  },
  {
    id: 'agents',
    path: '.context/agents/**',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Agent playbooks and role definitions maintained as project assets.',
  },
  {
    id: 'skills',
    path: '.context/skills/**',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Reusable skills and on-demand operating instructions.',
  },
  {
    id: 'plans',
    path: '.context/plans/**',
    classification: 'local',
    trackedInGit: false,
    description: 'Implementation plans kept as local working artifacts unless the team explicitly decides to version them.',
  },
  {
    id: 'config-sensors',
    path: '.context/config/sensors.json',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Project sensor catalog generated at bootstrap and intended to be customized by the team.',
  },
  {
    id: 'config-policy',
    path: '.context/config/policy.json',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Harness policy rules and approval constraints treated as project configuration.',
  },
  {
    id: 'context-config',
    path: '.context/config.json',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Context generation configuration persisted for repeatable scaffolding.',
  },
  {
    id: 'semantic-cache',
    path: '.context/cache/semantic/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Persisted semantic snapshot cache and versioned summary sections generated from the codebase.',
  },
  {
    id: 'runtime',
    path: '.context/runtime/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'All generated harness runtime state: sessions (records, traces, artifacts), workflow state and plan tracking, task contracts, and evaluations (replays, datasets).',
  },
  {
    id: 'archives',
    path: '.context/**/archive/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Archived local state and historical runtime artifacts.',
  },
];

export function getContextLayoutByClassification(
  classification: ContextLayoutClassification
): ContextLayoutEntry[] {
  return CONTEXT_LAYOUT_REGISTRY.filter((entry) => entry.classification === classification);
}

export function getUntrackedContextLayoutEntries(): ContextLayoutEntry[] {
  return CONTEXT_LAYOUT_REGISTRY.filter((entry) => !entry.trackedInGit);
}
