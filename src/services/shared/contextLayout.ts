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
    id: 'harness-config-sensors',
    path: '.context/harness/sensors.json',
    classification: 'versioned',
    trackedInGit: true,
    description: 'Project sensor catalog generated at bootstrap and intended to be customized by the team.',
  },
  {
    id: 'harness-config-policy',
    path: '.context/harness/policy.json',
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
    id: 'workflow-runtime',
    path: '.context/workflow/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Local workflow execution state, bindings, and archives.',
  },
  {
    id: 'harness-sessions',
    path: '.context/harness/sessions/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Session records for local harness execution.',
  },
  {
    id: 'harness-traces',
    path: '.context/harness/traces/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Append-only execution traces and sensor runs.',
  },
  {
    id: 'harness-artifacts',
    path: '.context/harness/artifacts/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Artifacts captured during harness sessions.',
  },
  {
    id: 'harness-contracts',
    path: '.context/harness/contracts/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Task and handoff contracts associated with local execution state.',
  },
  {
    id: 'harness-workflows',
    path: '.context/harness/workflows/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Canonical workflow runtime state materialized during execution.',
  },
  {
    id: 'harness-replays',
    path: '.context/harness/replays/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Replay artifacts derived from session execution history.',
  },
  {
    id: 'harness-datasets',
    path: '.context/harness/datasets/**',
    classification: 'runtime',
    trackedInGit: false,
    description: 'Generated failure datasets and clustering output.',
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
