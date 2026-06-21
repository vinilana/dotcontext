/**
 * Plan structure definition
 */

import { ScaffoldStructure } from '../types';

export const planStructure: ScaffoldStructure = {
  fileType: 'plan',
  documentName: 'implementation-plan',
  title: 'Implementation Plan',
  description: 'Detailed implementation plan for a feature or task',
  tone: 'instructional',
  audience: 'developers',
  sections: [
    {
      heading: 'Overview',
      order: 1,
      contentType: 'prose',
      guidance: 'Summarize the goal and scope of this implementation plan.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Codebase Context',
      order: 2,
      contentType: 'prose',
      guidance: 'Describe the relevant parts of the codebase, architecture layers, and key components.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Implementation Phases',
      order: 3,
      contentType: 'list',
      guidance: 'Break down implementation into phases mapped to PREVC (Planning, Review, Execution, Validation, Confirmation).',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Agent Assignments',
      order: 4,
      contentType: 'list',
      guidance: 'List which agents are responsible for which phases.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Documentation Updates',
      order: 5,
      contentType: 'list',
      guidance: 'List documentation files that need to be updated.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'Risks & Mitigations',
      order: 6,
      contentType: 'list',
      guidance: 'Identify potential risks and mitigation strategies.',
      required: false,
      headingLevel: 2,
    },
  ],
};
