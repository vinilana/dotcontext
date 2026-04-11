import { ScaffoldStructure } from '../types';

export const dataFlowStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'data-flow',
  title: 'Data Flow & Integrations',
  description: 'How data moves through the system and external integrations',
  tone: 'technical',
  audience: 'architects',
  sections: [
    {
      heading: 'Data Flow & Integrations',
      order: 1,
      contentType: 'prose',
      guidance: 'Explain how data enters, moves through, and exits the system, including interactions with external services.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document describes how data flows through the system, including internal processing and external integrations.

Understanding data flow helps with debugging, performance optimization, and maintaining system reliability.`,
    },
    {
      heading: 'Module Dependencies',
      order: 2,
      contentType: 'list',
      guidance: 'List cross-module dependencies showing which modules depend on which.',
      exampleContent: '- **src/** → `utils`, `config`\n- **services/** → `utils`',
      required: true,
      headingLevel: 2,
      defaultContent: `Module dependency overview:

- **Entry Layer** → Services, Utils
- **Services** → Data Access, External APIs
- **Data Access** → Database, Cache

*See [\`codebase-map.json\`](./codebase-map.json) for generated dependency hotspots and architecture summaries.*`,
    },
    {
      heading: 'Service Layer',
      order: 3,
      contentType: 'list',
      guidance: 'List service classes with links to their implementations.',
      required: true,
      headingLevel: 2,
      defaultContent: `Key services in the system:

- **[ServiceName]** — [Purpose] (\`src/services/path.ts\`)

Capture the main service modules here with links to their implementations.`,
    },
    {
      heading: 'High-level Flow',
      order: 4,
      contentType: 'prose',
      guidance: 'Summarize the primary pipeline from input to output. Reference diagrams or embed Mermaid definitions.',
      required: true,
      headingLevel: 2,
      defaultContent: `\`\`\`mermaid
flowchart LR
    A[Input] --> B[Processing]
    B --> C[Storage]
    B --> D[Output]
\`\`\`

**Data Flow Steps**:
1. Data enters through entry points (API, CLI, etc.)
2. Services process and transform data
3. Results are stored and/or returned to caller

*Replace with actual system data flow.*`,
    },
    {
      heading: 'Internal Movement',
      order: 5,
      contentType: 'prose',
      guidance: 'Describe how modules collaborate (queues, events, RPC calls, shared databases).',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'External Integrations',
      order: 6,
      contentType: 'list',
      guidance: 'Document each integration with purpose, authentication, payload shapes, and retry strategy.',
      required: false,
      headingLevel: 2,
      defaultContent: `**External Services**:

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| [Service] | [Purpose] | [API Key/OAuth/etc.] |

*Document error handling and retry strategies for each integration.*`,
    },
    {
      heading: 'Observability & Failure Modes',
      order: 7,
      contentType: 'prose',
      guidance: 'Describe metrics, traces, or logs that monitor the flow. Note backoff, dead-letter, or compensating actions.',
      required: false,
      headingLevel: 2,
    },
  ],
  linkTo: ['architecture.md'],
};
