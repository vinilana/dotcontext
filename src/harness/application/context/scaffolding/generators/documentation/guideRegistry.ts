import { GuideMeta } from './templates/types';

export const DOCUMENT_GUIDES: GuideMeta[] = [
  {
    key: 'project-overview',
    title: 'Project Overview',
    file: 'project-overview.md',
    primaryInputs: 'Roadmap, README, stakeholder notes'
  },
  {
    key: 'architecture',
    title: 'Architecture Notes',
    file: 'architecture.md',
    primaryInputs: 'ADRs, service boundaries, dependency graphs'
  },
  {
    key: 'development-workflow',
    title: 'Development Workflow',
    file: 'development-workflow.md',
    primaryInputs: 'Branching rules, CI config, contributing guide'
  },
  {
    key: 'testing-strategy',
    title: 'Testing Strategy',
    file: 'testing-strategy.md',
    primaryInputs: 'Test configs, CI gates, known flaky suites'
  },
  {
    key: 'glossary',
    title: 'Glossary & Domain Concepts',
    file: 'glossary.md',
    primaryInputs: 'Business terminology, user personas, domain rules'
  },
  {
    key: 'data-flow',
    title: 'Data Flow & Integrations',
    file: 'data-flow.md',
    primaryInputs: 'System diagrams, integration specs, queue topics'
  },
  {
    key: 'security',
    title: 'Security & Compliance Notes',
    file: 'security.md',
    primaryInputs: 'Auth model, secrets management, compliance requirements'
  },
  {
    key: 'tooling',
    title: 'Tooling & Productivity Guide',
    file: 'tooling.md',
    primaryInputs: 'CLI scripts, IDE configs, automation workflows'
  }
];

export const DOCUMENT_GUIDE_KEYS = DOCUMENT_GUIDES.map(guide => guide.key);

export function getGuidesByKeys(keys?: string[]): GuideMeta[] {
  if (!keys || keys.length === 0) {
    return DOCUMENT_GUIDES;
  }

  const set = new Set(keys);
  const filtered = DOCUMENT_GUIDES.filter(guide => set.has(guide.key));
  return filtered.length > 0 ? filtered : DOCUMENT_GUIDES;
}

export function getDocFilesByKeys(keys?: string[]): Set<string> | undefined {
  if (!keys || keys.length === 0) {
    return undefined;
  }
  const files = DOCUMENT_GUIDES
    .filter(guide => keys.includes(guide.key))
    .map(guide => guide.file);
  return files.length ? new Set(files) : undefined;
}
