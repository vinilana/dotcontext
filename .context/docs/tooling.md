---
type: doc
name: tooling
description: Scripts, IDE settings, automation, and developer productivity tips
category: tooling
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Tooling & Productivity Guide

This document covers the scripts, tools, IDE configuration, and productivity practices used in the `@ai-coders/context` project.

## Required Tooling

| Tool            | Version     | Purpose                                          |
| --------------- | ----------- | ------------------------------------------------ |
| Node.js         | >= 20.0.0   | Runtime for the CLI and all scripts               |
| npm             | (bundled)   | Package management and script execution           |
| TypeScript      | 5.x         | Language (strict mode, ES2020 target, CommonJS)   |
| tsx             | 4.x         | Fast TypeScript execution for development         |
| Git             | any recent  | Version control                                   |

### Optional tooling

| Tool                      | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| tree-sitter (native)      | Semantic code analysis (optional dependency) |
| tree-sitter-typescript    | TypeScript grammar for tree-sitter          |

## npm Scripts Reference

All scripts are defined in `package.json`:

| Script              | Command                                           | Description                              |
| ------------------- | ------------------------------------------------- | ---------------------------------------- |
| `dev`               | `tsx src/index.ts`                                | Run CLI from source (no build step)       |
| `build`             | `tsc`                                             | Compile TypeScript to `dist/`             |
| `start`             | `node dist/index.js`                              | Run compiled CLI                          |
| `test`              | `jest`                                            | Run the full test suite                   |
| `prepublishOnly`    | `npm run build`                                   | Ensure a fresh build before publish       |
| `version`           | `npm run build`                                   | Rebuild on version bump                   |
| `release`           | `npm version patch && npm publish --access public`| Patch release to npm                      |
| `release:minor`     | `npm version minor && npm publish --access public`| Minor release to npm                      |
| `release:major`     | `npm version major && npm publish --access public`| Major release to npm                      |

## Recommended Automation

### Build and test workflow

A typical development cycle:

```bash
# 1. Start development (auto-reloads not built-in; re-run as needed)
npm run dev -- --help

# 2. Run tests after changes
npm test

# 3. Verify production build
npm run build && npm start -- --help
```

### Release workflow

```bash
# 1. Ensure main is up to date
git checkout main && git pull

# 2. Create a release branch
git checkout -b release/0.8.0

# 3. Update CHANGELOG.md

# 4. Run the release script (bumps version, builds, publishes)
npm run release:minor

# 5. Push tags and branch, then merge to main
git push --follow-tags
```

### Pre-commit checks

While the project does not currently enforce pre-commit hooks, the following manual checks are recommended before every commit:

```bash
npm test && npm run build
```

Consider adding [husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) if the team wants automated pre-commit enforcement.

## IDE Setup

### VS Code (recommended)

**Suggested extensions:**

- **TypeScript** -- built-in, ensure workspace TypeScript version matches (`5.x`)
- **ESLint** -- if a linter config is added in the future
- **Jest Runner** -- run individual tests from the editor
- **Prettier** -- consistent formatting (configure to match project style)

**Recommended `settings.json` overrides:**

```jsonc
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "jest.jestCommandLine": "npx jest"
}
```

### Other editors

- **WebStorm/IntelliJ**: TypeScript support is built-in. Configure the Jest run configuration to use the project's `jest.config.js`.
- **Vim/Neovim**: Use `coc-tsserver` or `nvim-lspconfig` with `ts_ls` for TypeScript language support. Run tests via terminal.

## TypeScript Configuration Highlights

Key `tsconfig.json` settings that affect the development experience:

| Setting                        | Value        | Impact                                     |
| ------------------------------ | ------------ | ------------------------------------------ |
| `strict`                       | `true`       | Full strict type checking enabled           |
| `target`                       | `ES2020`     | Modern JS features available                |
| `module`                       | `commonjs`   | Compatible with Node.js require()           |
| `declaration` / `declarationMap` | `true`     | Type declarations emitted for consumers     |
| `sourceMap`                    | `true`       | Enables debugger source mapping             |
| `baseUrl`                      | `./src`      | Short imports from src root                 |
| `paths`                        | configured   | `@generators/agents/*` alias available      |

Test files (`**/*.test.ts`) are excluded from the build output but included in the IDE's type checking.

## Productivity Tips

1. **Use `npm run dev` for fast iteration.** The `tsx` runner executes TypeScript directly without a build step, making the feedback loop much faster than `build` + `start`.

2. **Target specific tests.** Instead of running the full suite, use `npx jest <file>` or `npx jest --watch` to focus on what you are changing.

3. **Leverage the `--help` flag.** Every CLI command supports `--help` for discoverability: `npm run dev -- workflow --help`.

4. **Use MCP for context creation and AI generation.** Standalone CLI generation is no longer supported. Install MCP with `npx @ai-coders/context mcp:install` and use your AI tool to create, fill, or refresh context.

5. **Read the generated context.** After initializing context through MCP, browse `.context/docs/` and `.context/agents/` to understand what the tool produces -- this helps when working on generators and templates.

6. **Check `codebase-map.json` for navigation.** The file at `.context/docs/codebase-map.json` provides a structural overview of the entire codebase, useful for orienting yourself in unfamiliar areas.

7. **Debug with source maps.** Since `sourceMap: true` is configured, you can attach a Node.js debugger to the compiled output and step through the original TypeScript source.
