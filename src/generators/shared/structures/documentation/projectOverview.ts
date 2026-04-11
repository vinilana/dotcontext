import { ScaffoldStructure } from '../types';

export const projectOverviewStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'project-overview',
  title: 'Project Overview',
  description: 'High-level overview of the project, its purpose, and key components',
  tone: 'conversational',
  audience: 'mixed',
  sections: [
    {
      heading: 'Project Overview',
      order: 1,
      contentType: 'prose',
      guidance: 'Summarize in 2-3 sentences what problem this project solves and who benefits from it. Focus on the value proposition.',
      required: true,
      headingLevel: 2,
      defaultContent: `This project provides [describe main functionality]. It helps [target users] to [key benefit].

The codebase is organized to support [main use case] with a focus on [key qualities like maintainability, performance, etc.].`,
    },
    {
      heading: 'Codebase Reference',
      order: 2,
      contentType: 'prose',
      guidance: 'Add a callout pointing to codebase-map.json for generated stack, architecture layers, key files, and dependency hotspots.',
      exampleContent: '> **Generated Summary**: For stack details, architecture layers, key files, and dependency hotspots, see [`codebase-map.json`](./codebase-map.json).',
      required: true,
      headingLevel: 2,
      defaultContent: `> **Generated Summary**: For stack details, architecture layers, key files, and dependency hotspots, see [\`codebase-map.json\`](./codebase-map.json).`,
    },
    {
      heading: 'Quick Facts',
      order: 3,
      contentType: 'list',
      guidance: 'List root directory path, primary languages, and key entry points. Reference codebase-map.json for the generated summary.',
      exampleContent: '- Root: `/path/to/repo`\n- Languages: TypeScript, Python\n- Entry: `src/index.ts`\n- Generated summary: [`codebase-map.json`](./codebase-map.json)',
      required: true,
      headingLevel: 2,
      defaultContent: `- **Root**: \`./\`
- **Primary Language**: [Language] ([X] files)
- **Entry Point**: \`src/index.ts\` or \`src/main.ts\`
- **Generated Summary**: [\`codebase-map.json\`](./codebase-map.json)`,
    },
    {
      heading: 'Entry Points',
      order: 4,
      contentType: 'list',
      guidance: 'List main entry points with links (CLI, server, library exports). Use markdown links with line numbers.',
      required: true,
      headingLevel: 2,
      defaultContent: `- **Main Entry**: \`src/index.ts\` - Primary module exports
- **CLI**: \`src/cli.ts\` - Command-line interface (if applicable)
- **Server**: \`src/server.ts\` - HTTP server entry (if applicable)`,
    },
    {
      heading: 'Key Exports',
      order: 5,
      contentType: 'list',
      guidance: 'Summarize the main public entry points and exported surfaces. Do not rely on codebase-map.json for a full symbol inventory.',
      required: true,
      headingLevel: 2,
      defaultContent: `Key public APIs:
- [List main exported classes/functions]`,
    },
    {
      heading: 'File Structure & Code Organization',
      order: 6,
      contentType: 'list',
      guidance: 'List top-level directories with brief descriptions of their purpose.',
      exampleContent: '- `src/` — TypeScript source files and CLI entrypoints.\n- `tests/` — Automated tests and fixtures.',
      required: true,
      headingLevel: 2,
      defaultContent: `- \`src/\` — Source code and main application logic
- \`tests/\` or \`__tests__/\` — Test files and fixtures
- \`dist/\` or \`build/\` — Compiled output (gitignored)
- \`docs/\` — Documentation files
- \`scripts/\` — Build and utility scripts`,
    },
    {
      heading: 'Technology Stack Summary',
      order: 7,
      contentType: 'prose',
      guidance: 'Outline primary runtimes, languages, and platforms in use. Note build tooling, linting, and formatting infrastructure.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Runtime**: Node.js

**Language**: TypeScript/JavaScript

**Build Tools**:
- TypeScript compiler (tsc) or bundler (esbuild, webpack, etc.)
- Package manager: npm/yarn/pnpm

**Code Quality**:
- Linting: ESLint
- Formatting: Prettier
- Type checking: TypeScript strict mode`,
    },
    {
      heading: 'Core Framework Stack',
      order: 8,
      contentType: 'prose',
      guidance: 'Document core frameworks per layer (backend, frontend, data, messaging). Mention architectural patterns enforced by these frameworks.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'UI & Interaction Libraries',
      order: 9,
      contentType: 'prose',
      guidance: 'List UI kits, CLI interaction helpers, or design system dependencies. Note theming, accessibility, or localization considerations.',
      required: false,
      headingLevel: 2,
    },
    {
      heading: 'Development Tools Overview',
      order: 10,
      contentType: 'prose',
      guidance: 'Highlight essential CLIs, scripts, or developer environments. Link to Tooling guide for deeper setup.',
      required: false,
      headingLevel: 2,
      defaultContent: `See [Tooling](./tooling.md) for detailed development environment setup.

**Essential Commands**:
- \`npm install\` — Install dependencies
- \`npm run build\` — Build the project
- \`npm run test\` — Run tests
- \`npm run dev\` — Start development mode`,
    },
    {
      heading: 'Getting Started Checklist',
      order: 11,
      contentType: 'checklist',
      guidance: 'Provide numbered steps to get a new developer productive. Include install, run, and verify steps.',
      exampleContent: '1. Install dependencies with `npm install`.\n2. Explore the CLI by running `npm run dev`.\n3. Review Development Workflow for day-to-day tasks.',
      required: true,
      headingLevel: 2,
      defaultContent: `1. Clone the repository
2. Install dependencies: \`npm install\`
3. Copy environment template: \`cp .env.example .env\` (if applicable)
4. Run tests to verify setup: \`npm run test\`
5. Start development: \`npm run dev\`
6. Review [Development Workflow](./development-workflow.md) for day-to-day tasks`,
    },
    {
      heading: 'Next Steps',
      order: 12,
      contentType: 'prose',
      guidance: 'Capture product positioning, key stakeholders, and links to external documentation or product specs.',
      required: false,
      headingLevel: 2,
      defaultContent: `- Review [Architecture](./architecture.md) for system design details
- See [Development Workflow](./development-workflow.md) for contribution guidelines
- Check [Testing Strategy](./testing-strategy.md) for quality requirements`,
    },
  ],
  linkTo: ['architecture.md', 'development-workflow.md', 'tooling.md', 'codebase-map.json'],
};
