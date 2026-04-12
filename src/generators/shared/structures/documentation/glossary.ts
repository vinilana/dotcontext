import { ScaffoldStructure } from '../types';

export const glossaryStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'glossary',
  title: 'Glossary & Domain Concepts',
  description: 'Project terminology, type definitions, domain entities, and business rules',
  tone: 'technical',
  audience: 'mixed',
  sections: [
    {
      heading: 'Glossary & Domain Concepts',
      order: 1,
      contentType: 'prose',
      guidance: 'List project-specific terminology, acronyms, domain entities, and user personas.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document defines project-specific terminology, concepts, and domain knowledge.

Use this as a reference when encountering unfamiliar terms in the codebase or documentation.`,
    },
    {
      heading: 'Type Definitions',
      order: 2,
      contentType: 'list',
      guidance: 'List exported type definitions and interfaces with links to their locations.',
      required: true,
      headingLevel: 2,
      defaultContent: `Key type definitions in this project:

- **[TypeName]** — [Description] (\`src/types/path.ts\`)

Document the main shared types here and link to their source files.`,
    },
    {
      heading: 'Enumerations',
      order: 3,
      contentType: 'list',
      guidance: 'List exported enums with links to their locations.',
      required: true,
      headingLevel: 2,
      defaultContent: `Enums defined in this project:

- **[EnumName]** — [Description] (\`src/types/path.ts\`)

Document the main enums here and link to their source files.`,
    },
    {
      heading: 'Core Terms',
      order: 4,
      contentType: 'list',
      guidance: 'Define key terms, their relevance, and where they surface in the codebase.',
      required: true,
      headingLevel: 2,
      defaultContent: `**[Term]**: [Definition and context]

Add project-specific terminology here as the codebase evolves.`,
    },
    {
      heading: 'Acronyms & Abbreviations',
      order: 5,
      contentType: 'list',
      guidance: 'Expand abbreviations and note associated services or APIs.',
      required: false,
      headingLevel: 2,
      defaultContent: `| Acronym | Expansion | Context |
|---------|-----------|---------|
| API | Application Programming Interface | External/internal interfaces |
| CLI | Command Line Interface | User interaction |`,
    },
    {
      heading: 'Personas / Actors',
      order: 6,
      contentType: 'prose',
      guidance: 'Describe user goals, key workflows, and pain points addressed by the system.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'Domain Rules & Invariants',
      order: 7,
      contentType: 'prose',
      guidance: 'Capture business rules, validation constraints, or compliance requirements. Note region/localization nuances.',
      required: false,
      headingLevel: 2,
    },
  ],
  linkTo: ['project-overview.md'],
};
