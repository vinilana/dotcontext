import { ScaffoldStructure } from '../types';

export const toolingStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'tooling',
  title: 'Tooling & Productivity Guide',
  description: 'Scripts, IDE settings, automation, and developer productivity tips',
  tone: 'instructional',
  audience: 'developers',
  sections: [
    {
      heading: 'Tooling & Productivity Guide',
      order: 1,
      contentType: 'prose',
      guidance: 'Collect the scripts, automation, and editor settings that keep contributors efficient.',
      required: true,
      headingLevel: 2,
      defaultContent: `This guide covers the tools, scripts, and configurations that make development efficient.

Following these setup recommendations ensures a consistent development experience across the team.`,
    },
    {
      heading: 'Required Tooling',
      order: 2,
      contentType: 'list',
      guidance: 'List tools with installation instructions, version requirements, and what they power.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Runtime**:
- Node.js (v18+ recommended)
- npm / yarn / pnpm

**Version Management** (recommended):
- [nvm](https://github.com/nvm-sh/nvm) for Node.js version management
- \`.nvmrc\` file specifies project Node version

**Installation**:
\`\`\`bash
# Using nvm (recommended)
nvm install
nvm use

# Install dependencies
npm install
\`\`\``,
    },
    {
      heading: 'Recommended Automation',
      order: 3,
      contentType: 'prose',
      guidance: 'Document pre-commit hooks, linting/formatting commands, code generators, or scaffolding scripts. Include shortcuts or watch modes.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Pre-commit Hooks**:
The project uses [husky](https://typicode.github.io/husky/) for git hooks:
- Pre-commit: Runs linting and type checking
- Commit message: Validates commit message format

**Code Quality Commands**:
\`\`\`bash
npm run lint          # Check code style
npm run lint:fix      # Auto-fix style issues
npm run format        # Format code with Prettier
npm run typecheck     # TypeScript type checking
\`\`\`

**Watch Mode**:
\`\`\`bash
npm run dev           # Development with hot reload
npm run test:watch    # Tests in watch mode
\`\`\``,
    },
    {
      heading: 'IDE / Editor Setup',
      order: 4,
      contentType: 'list',
      guidance: 'List extensions or plugins that catch issues early. Share snippets, templates, or workspace settings.',
      required: false,
      headingLevel: 2,
      defaultContent: `**VS Code Recommended Extensions**:
- ESLint — Inline linting
- Prettier — Code formatting
- TypeScript + JavaScript Language Features — IntelliSense
- Error Lens — Inline error highlighting

**Workspace Settings**:
The \`.vscode/\` folder contains shared settings:
- \`settings.json\` — Editor configuration
- \`extensions.json\` — Recommended extensions
- \`launch.json\` — Debug configurations`,
    },
    {
      heading: 'Productivity Tips',
      order: 5,
      contentType: 'prose',
      guidance: 'Document terminal aliases, container workflows, or local emulators. Link to shared scripts or dotfiles.',
      required: false,
      headingLevel: 2,
      defaultContent: `**Useful Aliases**:
\`\`\`bash
alias nr='npm run'
alias nrd='npm run dev'
alias nrt='npm run test'
\`\`\`

**Quick Commands**:
- \`npm run build && npm run test\` — Full verification before PR
- \`npm run clean\` — Clear build artifacts and caches`,
    },
  ],
  linkTo: ['development-workflow.md'],
};
