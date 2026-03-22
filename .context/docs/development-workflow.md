---
type: doc
name: development-workflow
description: Day-to-day engineering processes, branching, and contribution guidelines
category: workflow
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Development Workflow

This document covers the day-to-day engineering processes for contributing to `@dotcontext/cli`, including branching conventions, local development setup, release procedures, and code review expectations.

## Branching & Releases

### Branch naming

All work branches fork from `main`. Use descriptive prefixes:

| Prefix        | Purpose                          | Example                              |
| ------------- | -------------------------------- | ------------------------------------ |
| `feature/`    | New functionality                | `feature/mcp-tool-support`           |
| `fix/`        | Bug fixes                        | `fix/auto-fill`                      |
| `chore/`      | Maintenance, docs, refactoring   | `chore/improve-documentation-for-usage` |
| `release/`    | Release preparation              | `release/0.7.1`                      |

### Merge strategy

- Feature and fix branches merge into `main` via pull request.
- Release branches are created from `main`, finalized with a version bump, then merged back.
- Squash merges are preferred for feature branches to keep history clean.

### Versioning

The project follows [semantic versioning](https://semver.org/):

- **Patch** (0.7.x): bug fixes, documentation updates, non-breaking tweaks.
- **Minor** (0.x.0): new features, new CLI commands, non-breaking additions.
- **Major** (x.0.0): breaking changes to CLI interface, configuration format, or public APIs.

### Release scripts

```bash
npm run release          # Bump patch, build, publish to npm
npm run release:minor    # Bump minor, build, publish to npm
npm run release:major    # Bump major, build, publish to npm
```

Each release script runs `npm version <level>` (which triggers the `version` script to rebuild) followed by `npm publish --access public`. The `prepublishOnly` hook ensures a fresh build before every publish.

### Changelog

Update `CHANGELOG.md` before each release with a summary of changes, referencing relevant pull requests.

## Local Development

### Prerequisites

- Node.js >= 20.0.0
- npm (ships with Node)
- Git

### Setup

```bash
git clone https://github.com/vinilana/ai-coders-context.git
cd ai-coders-context
npm install
```

### Common commands

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Run CLI from source using tsx (fast, no build step) |
| `npm run build`   | Compile TypeScript to `dist/` via tsc             |
| `npm start`       | Run the compiled CLI from `dist/index.js`         |
| `npm test`        | Run the full Jest test suite                      |

### Development loop

1. Create a branch from `main` following the naming conventions above.
2. Make changes in `src/`.
3. Test interactively with `npm run dev -- <command>` (e.g., `npm run dev -- workflow --help`).
4. Run `npm test` to verify nothing is broken.
5. Run `npm run build` to confirm the TypeScript compiles cleanly.
6. Commit, push, and open a pull request against `main`.

### Environment variables

The CLI supports locale overrides via `DOTCONTEXT_LANG` (`en` or `pt-BR`).

For AI-generated filling or refresh, install MCP with `npx dotcontext mcp:install` and use your connected AI tool instead of standalone CLI commands.

Use a `.env` file in the project root (loaded via dotenv). Do not commit `.env` files.

## Code Review Expectations

### What reviewers look for

- **Correctness**: Does the change do what it claims? Are edge cases handled?
- **Type safety**: TypeScript strict mode is enabled. No `any` casts without justification.
- **Test coverage**: New features should include tests. Bug fixes should include a regression test when feasible.
- **CLI UX**: Interactive prompts (inquirer), spinners (ora), and colored output (chalk) should be consistent with existing patterns.
- **i18n**: User-facing strings should go through the i18n utility (`src/utils/i18n.ts`) for both English and Portuguese (pt-BR).
- **No secrets**: Ensure API keys, tokens, and credentials are never committed.

### Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] `npm test` passes locally
- [ ] `npm run build` succeeds without errors
- [ ] New/changed user-facing strings are internationalized
- [ ] CHANGELOG entry drafted (for non-trivial changes)
- [ ] PR description explains the "why" behind the change
