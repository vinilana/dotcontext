import { ScaffoldStructure } from '../types';

export const developmentWorkflowStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'development-workflow',
  title: 'Development Workflow',
  description: 'Day-to-day engineering processes, branching, and contribution guidelines',
  tone: 'instructional',
  audience: 'developers',
  sections: [
    {
      heading: 'Development Workflow',
      order: 1,
      contentType: 'prose',
      guidance: 'Outline the day-to-day engineering process for this repository.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document outlines the day-to-day engineering process for contributing to this repository.

Following these guidelines ensures consistent code quality and smooth collaboration across the team.`,
    },
    {
      heading: 'Branching & Releases',
      order: 2,
      contentType: 'list',
      guidance: 'Describe the branching model (trunk-based, Git Flow, etc.). Note release cadence and tagging conventions.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Branching Model**: Feature branches off \`main\`

- \`main\` — Production-ready code, always deployable
- \`feature/*\` — New features and enhancements
- \`fix/*\` — Bug fixes
- \`chore/*\` — Maintenance and tooling updates

**Release Process**:
1. Features are developed in branches
2. PRs require review and passing CI
3. Merged PRs are deployed automatically (or tagged for release)

**Versioning**: Semantic versioning (semver) - MAJOR.MINOR.PATCH`,
    },
    {
      heading: 'Local Development',
      order: 3,
      contentType: 'list',
      guidance: 'Commands to install dependencies, run locally, and build for distribution. Use code blocks for commands.',
      exampleContent: '- Install: `npm install`\n- Run: `npm run dev`\n- Build: `npm run build`',
      required: true,
      headingLevel: 2,
      defaultContent: `**Setup**:
\`\`\`bash
# Clone and install
git clone <repository-url>
cd <project-name>
npm install
\`\`\`

**Daily Commands**:
- \`npm run dev\` — Start development server/watch mode
- \`npm run build\` — Build for production
- \`npm run test\` — Run test suite
- \`npm run lint\` — Check code style

**Before Committing**:
\`\`\`bash
npm run lint && npm run test && npm run build
\`\`\``,
    },
    {
      heading: 'Code Review Expectations',
      order: 4,
      contentType: 'prose',
      guidance: 'Summarize review checklists and required approvals. Reference AGENTS.md for agent collaboration tips.',
      required: true,
      headingLevel: 2,
      defaultContent: `**PR Requirements**:
- Clear description of changes and motivation
- Tests for new functionality
- Documentation updates for API changes
- Passing CI checks

**Review Checklist**:
- [ ] Code follows project conventions
- [ ] Tests cover the changes adequately
- [ ] No security vulnerabilities introduced
- [ ] Documentation is updated
- [ ] Commit messages follow conventions

**Approval**: At least one approving review required before merge.

See [AGENTS.md](../../AGENTS.md) for AI assistant collaboration guidelines.`,
    },
    {
      heading: 'Onboarding Tasks',
      order: 5,
      contentType: 'prose',
      guidance: 'Point newcomers to first issues or starter tickets. Link to internal runbooks or dashboards.',
      required: false,
      headingLevel: 2,
      defaultContent: `**First Steps for New Contributors**:
1. Read the [Project Overview](./project-overview.md)
2. Set up local development environment
3. Run the test suite to verify setup
4. Look for issues labeled \`good-first-issue\` or \`help-wanted\`

**Helpful Resources**:
- [Architecture Notes](./architecture.md) — System design overview
- [Testing Strategy](./testing-strategy.md) — How to write tests
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines`,
    },
  ],
  linkTo: ['testing-strategy.md', 'tooling.md'],
};
