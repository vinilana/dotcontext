import { ScaffoldStructure } from '../types';

const SEMANTIC_SNAPSHOT_GUIDANCE =
  'Use `context({ action: "getMap", section: "all" })` to inspect the generated semantic snapshot for stack, architecture, key files, and dependency hotspots.';

export const architectureStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'architecture',
  title: 'Architecture Notes',
  description: 'System architecture, layers, patterns, and design decisions',
  tone: 'technical',
  audience: 'architects',
  sections: [
    {
      heading: 'Architecture Notes',
      order: 1,
      contentType: 'prose',
      guidance: 'Describe how the system is assembled and why the current design exists.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document describes the system architecture, design patterns, and key technical decisions.

${SEMANTIC_SNAPSHOT_GUIDANCE}`,
    },
    {
      heading: 'System Architecture Overview',
      order: 2,
      contentType: 'prose',
      guidance: 'Summarize the top-level topology (monolith, modular service, microservices) and deployment model. Highlight how requests traverse the system and where control pivots between layers.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Architecture Style**: [Monolith / Modular Monolith / Microservices]

**Key Components**:
- **Entry Layer**: Handles incoming requests (CLI, HTTP, etc.)
- **Service Layer**: Core business logic and orchestration
- **Data Layer**: Persistence and external service integration

**Request Flow**:
1. Request enters through entry point
2. Routed to appropriate service handler
3. Service processes and returns response`,
    },
    {
      heading: 'Architectural Layers',
      order: 3,
      contentType: 'list',
      guidance: 'List architecture layers with their purpose and key directories. Reference the semantic snapshot for generated architecture and dependency summaries.',
      exampleContent: '- **Services**: Core business logic (`src/services/`)\n- **Generators**: Content generation (`src/generators/`)\n\n> Use `context({ action: "getMap", section: "all" })` for generated architecture and dependency summaries.',
      required: true,
      headingLevel: 2,
      defaultContent: `- **Entry Points**: Application entry and initialization (\`src/\`)
- **Services**: Core business logic (\`src/services/\`)
- **Models/Types**: Data structures and type definitions (\`src/types/\`)
- **Utilities**: Shared helper functions (\`src/utils/\`)

> Use \`context({ action: "getMap", section: "all" })\` for generated architecture and dependency summaries.`,
    },
    {
      heading: 'Detected Design Patterns',
      order: 4,
      contentType: 'table',
      guidance: 'Table with Pattern, Confidence, Locations, and Description columns. Link to actual implementations.',
      exampleContent: '| Pattern | Confidence | Locations | Description |\n|---------|------------|-----------|-------------|\n| Factory | 85% | `LLMClientFactory` | Creates LLM client instances |',
      required: true,
      headingLevel: 2,
      defaultContent: `| Pattern | Locations | Description |
|---------|-----------|-------------|
| [Pattern Name] | \`src/path/\` | [Brief description] |

*Update this table as patterns are identified in the codebase.*`,
    },
    {
      heading: 'Entry Points',
      order: 5,
      contentType: 'list',
      guidance: 'List entry points with markdown links to the actual files.',
      required: true,
      headingLevel: 2,
      defaultContent: `- [\`src/index.ts\`](../src/index.ts) — Main module entry
- [\`src/cli.ts\`](../src/cli.ts) — CLI entry point (if applicable)`,
    },
    {
      heading: 'Public API',
      order: 6,
      contentType: 'table',
      guidance: 'Table of exported symbols with Symbol, Type, and Location columns.',
      required: true,
      headingLevel: 2,
      defaultContent: `| Symbol | Type | Location |
|--------|------|----------|
| [ExportName] | class/function/type | \`src/path.ts\` |
`,
    },
    {
      heading: 'Internal System Boundaries',
      order: 7,
      contentType: 'prose',
      guidance: 'Document seams between domains, bounded contexts, or service ownership. Note data ownership, synchronization strategies, and shared contract enforcement.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'External Service Dependencies',
      order: 8,
      contentType: 'list',
      guidance: 'List SaaS platforms, third-party APIs, or infrastructure services. Describe authentication methods, rate limits, and failure considerations.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'Key Decisions & Trade-offs',
      order: 9,
      contentType: 'prose',
      guidance: 'Summarize architectural decisions, experiments, or ADR outcomes. Explain why selected approaches won over alternatives.',
      required: false,
      headingLevel: 2,
      defaultContent: `Document key architectural decisions here. Consider creating Architecture Decision Records (ADRs) for significant choices.

**Template**:
- **Decision**: [What was decided]
- **Context**: [Why this decision was needed]
- **Alternatives**: [What else was considered]
- **Consequences**: [Impact of this decision]`,
    },
    {
      heading: 'Diagrams',
      order: 10,
      contentType: 'diagram',
      guidance: 'Link architectural diagrams or add mermaid definitions showing system components and their relationships.',
      required: false,
      headingLevel: 2,
      defaultContent: `\`\`\`mermaid
graph TD
    A[Entry Point] --> B[Service Layer]
    B --> C[Data Layer]
    B --> D[External Services]
\`\`\`

*Replace with actual system architecture diagram.*`,
    },
    {
      heading: 'Risks & Constraints',
      order: 11,
      contentType: 'prose',
      guidance: 'Document performance constraints, scaling considerations, or external system assumptions.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'Top Directories Snapshot',
      order: 12,
      contentType: 'list',
      guidance: 'List top directories with approximate file counts.',
      required: true,
      headingLevel: 2,
      defaultContent: `- \`src/\` — Source code
- \`tests/\` — Test files
- \`docs/\` — Documentation

*Use \`context({ action: "getMap", section: "stats" })\` for detailed file counts.*`,
    },
    {
      heading: 'Related Resources',
      order: 13,
      contentType: 'list',
      guidance: 'Link to Project Overview and other relevant documentation.',
      required: true,
      headingLevel: 2,
      defaultContent: `- [Project Overview](./project-overview.md)
- [Data Flow](./data-flow.md) (if applicable)
- Semantic snapshot via \`context({ action: "getMap", section: "all" })\``,
    },
  ],
  linkTo: ['project-overview.md', 'data-flow.md'],
};
