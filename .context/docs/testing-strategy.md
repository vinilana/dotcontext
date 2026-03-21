---
type: doc
name: testing-strategy
description: Test frameworks, patterns, coverage requirements, and quality gates
category: testing
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Testing Strategy

This document describes the test infrastructure, conventions, and quality expectations for the `@ai-coders/context` project.

## Test Types

### Unit tests

Unit tests validate individual functions, utilities, and service modules in isolation. They are the primary test type in this project.

**Examples of existing unit tests:**

- `src/utils/contentSanitizer.test.ts` -- content sanitization logic
- `src/utils/frontMatter.test.ts` -- YAML frontmatter parsing and serialization
- `src/utils/promptLoader.test.ts` -- prompt template loading
- `src/utils/versionChecker.test.ts` -- version comparison utilities

### Integration tests

Integration tests exercise larger slices of functionality, including CLI command execution and service orchestration.

**Examples:**

- `src/cli.test.ts` -- CLI command registration and execution
- `src/services/mcp/mcpServer.test.ts` -- MCP server registration and gateway behavior

## Framework & Configuration

| Setting              | Value                                        |
| -------------------- | -------------------------------------------- |
| Framework            | Jest 30.x                                    |
| TypeScript transform | ts-jest 29.x (`preset: 'ts-jest'`)           |
| Test environment     | Node                                         |
| Config file          | `jest.config.js`                             |

### File discovery

Jest is configured to find tests using two patterns:

- `**/__tests__/**/*.ts` -- tests inside `__tests__/` directories
- `**/?(*.)+(spec|test).ts` -- files ending in `.test.ts` or `.spec.ts`

All test roots are under `<rootDir>/src`. The `node_modules/` and `dist/` directories are excluded via `testPathIgnorePatterns`.

### Naming conventions

- Place unit tests alongside the source file: `src/utils/frontMatter.ts` -> `src/utils/frontMatter.test.ts`
- Use `.test.ts` for unit tests and `.integration.test.ts` for integration tests.
- Use `.spec.ts` when following a behavior-driven style (both are recognized).

## Running Tests

```bash
# Run the full test suite
npm test

# Run tests in watch mode (useful during development)
npx jest --watch

# Run a specific test file
npx jest src/utils/frontMatter.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="utils"

# Run with coverage report
npx jest --coverage
```

### Coverage configuration

Coverage is collected from all `src/**/*.ts` files, excluding:

- Declaration files (`*.d.ts`)
- Index barrel files (`**/index.ts`)

Reports are generated in three formats:

| Format | Output                  | Purpose                    |
| ------ | ----------------------- | -------------------------- |
| `text` | Terminal                | Quick local feedback       |
| `lcov` | `coverage/lcov.info`   | CI integration, tooling    |
| `html` | `coverage/` directory  | Browsable detailed report  |

## Quality Gates

### Before merging a pull request

1. **All tests pass**: `npm test` must exit with code 0.
2. **No regressions**: Existing tests must not be removed or weakened without justification.
3. **New code has tests**: Features and bug fixes should include corresponding tests.
4. **Build succeeds**: `npm run build` must compile without TypeScript errors (test files are excluded from the build via `tsconfig.json`).

### Recommended coverage targets

While there is no enforced coverage threshold at this time, contributors should aim for:

- Utility functions: high coverage (these are pure and easy to test)
- Service modules: moderate coverage, focusing on core logic paths
- CLI integration: at least smoke-test-level coverage for new commands

## Troubleshooting

### Common issues

**ts-jest transform errors**

If you see transform errors, ensure `ts-jest` is installed and the Jest config specifies the correct transform:

```js
transform: {
  '^.+\\.ts$': 'ts-jest',
}
```

**Module resolution failures**

The project uses `baseUrl: "./src"` and path aliases in `tsconfig.json`. If Jest cannot resolve an import, check that `moduleFileExtensions` includes `ts` and `js`, and that the path alias is correctly mapped if applicable.

**Tree-sitter optional dependency warnings**

`tree-sitter` and `tree-sitter-typescript` are optional dependencies used for semantic analysis. Tests that depend on them may skip gracefully if the native modules are not installed. These warnings are safe to ignore in most development scenarios.

**Slow test runs**

`ts-jest` compiles TypeScript on the fly. For faster iteration, use `--watch` mode which only re-runs affected tests, or target a specific file with `npx jest <path>`.

**Integration test failures**

Integration tests that exercise MCP or workflow flows may create temporary files or directories. Ensure your working directory is clean and that no stale `.context` artifacts interfere with test expectations.
