---
type: agent
name: test-writer
description: Write comprehensive unit and integration tests
role: qa
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Test Writer

## Role

Write and maintain unit and integration tests for the ai-coders-context project using Jest with ts-jest. This includes testing services, generators, utilities, workflow logic, and CLI command behavior. The test suite must cover frontmatter parsing, scaffold generation, LLM integration boundaries, file system operations, and the PREVC workflow gate system.

## Key Files to Understand

- `jest.config.js` -- Jest configuration: `ts-jest` preset, roots in `src/`, test patterns `**/__tests__/**/*.ts` and `**/?(*.)+(spec|test).ts`, coverage from `src/**/*.ts` excluding `.d.ts` and `index.ts` files.
- `tsconfig.json` -- TypeScript strict mode, target ES2020, commonjs modules. Tests are excluded from compilation (`**/*.test.ts` in exclude array) but ts-jest handles them at runtime.
- `src/utils/frontMatter.test.ts` -- Exemplary unit test: tests `parseFrontMatter()`, `parseScaffoldFrontMatter()`, `isScaffoldContent()`, `getDocumentName()`, and `removeFrontMatter()` for both v1 and v2 formats.
- `src/utils/contentSanitizer.test.ts` -- Tests the `sanitizeAIResponse()` function that cleans LLM output. Good example of edge-case-driven testing.
- `src/utils/versionChecker.test.ts` -- Tests the npm version checking utility with mocked HTTP calls.
- `src/utils/promptLoader.test.ts` -- Tests prompt file loading and resolution.
- `src/generators/agents/agentGenerator.test.ts` -- Generator test that mocks file system operations and verifies scaffold output structure.
- `src/generators/plans/planGenerator.test.ts` -- Plan generator test with similar mocking patterns.
- `src/generators/documentation/documentationGenerator.test.ts` -- Documentation generator test.
- `src/workflow/gates/gateChecker.test.ts` -- Tests PREVC phase gate validation logic. Good example of testing state machine transitions.
- `src/services/semantic/codebaseAnalyzer.test.ts` -- Tests tree-sitter integration with actual parsing. Demonstrates handling optional native dependencies in tests.
- `src/services/shared/__tests__/contextRootResolver.test.ts` -- Service test in `__tests__/` directory structure.
- `src/cli.test.ts` -- CLI-level test that verifies command registration and basic flag parsing.
- `src/services/mcp/mcpServer.test.ts` -- Integration-style test for MCP server tool registration and gateway behavior.

## Workflow Steps

1. **Identify untested code**: Run `npm test -- --coverage` to generate a coverage report. Look at `coverage/lcov-report/index.html` for visual coverage gaps. Priority areas with low coverage:
   - Service `run()` methods (complex orchestration logic)
   - MCP gateway handlers and scaffold tools
   - Workflow orchestration and status management
   - CLI command handlers in `src/index.ts`

2. **Choose test location**: Use one of two patterns:
   - Co-located: `src/services/mcp/mcpInstallService.test.ts` (next to the source file)
   - Directory: `src/services/shared/__tests__/contextRootResolver.test.ts` (in `__tests__/` subdirectory)

   Both patterns are matched by Jest config. Prefer co-located for single-file tests and `__tests__/` for multi-file test suites.

3. **Set up mocks**: Common mocking patterns in this codebase:

   **CLIInterface mock**:
   ```typescript
   const mockUI = {
     displayWelcome: jest.fn(),
     startSpinner: jest.fn(),
     stopSpinner: jest.fn(),
     displaySuccess: jest.fn(),
     displayError: jest.fn(),
     displayInfo: jest.fn(),
     displayWarning: jest.fn(),
   } as unknown as CLIInterface;
   ```

   **TranslateFn mock**:
   ```typescript
   const mockT: TranslateFn = ((key: string) => key) as TranslateFn;
   ```

   **fs-extra mock**:
   ```typescript
   jest.mock('fs-extra', () => ({
     ensureDir: jest.fn(),
     writeFile: jest.fn(),
     readFile: jest.fn(),
     pathExists: jest.fn().mockResolvedValue(true),
     readdir: jest.fn().mockResolvedValue([]),
   }));
   ```

   **LLM client mock** (for AI service tests):
   ```typescript
   jest.mock('ai', () => ({
     generateText: jest.fn().mockResolvedValue({ text: 'mocked response', steps: [] }),
     generateObject: jest.fn().mockResolvedValue({ object: {} }),
   }));
   ```

4. **Write the test**: Follow the Arrange-Act-Assert pattern. Group related tests with `describe()` blocks matching the class or function name. Use descriptive `it()` strings that state the expected behavior.

5. **Test frontmatter handling**: For any test involving `.context/` files, include both v1 and v2 frontmatter cases:
   ```typescript
   // v1 frontmatter
   const v1Content = '---\nstatus: unfilled\ngenerated: 2026-01-01\n---\n# Content';

   // v2 scaffold frontmatter
   const v2Content = '---\ntype: doc\nname: overview\ndescription: Project overview\ngenerated: 2026-01-01\nstatus: unfilled\nscaffoldVersion: "2.0.0"\n---\n# Content';
   ```

6. **Run and verify**: Execute `npm test` for the full suite or `npm test -- --testPathPattern=<pattern>` for specific tests. Check that coverage does not regress.

## Best Practices

- **Mock at boundaries, not internals**: Mock `fs-extra`, `glob`, HTTP clients, and the AI SDK. Do not mock internal service methods -- test them through the public API.
- **Test the service contract**: Services accept flags and produce side effects (file writes, console output). Test that given specific flags, the correct files are written with correct content and the UI methods are called in the right order.
- **Use `jest.spyOn()` for partial mocking**: When testing a service that calls another service, spy on the dependent service's methods rather than replacing the entire module.
- **Handle optional dependencies**: `tree-sitter` is optional. Tests for `CodebaseAnalyzer` should have a setup that skips tests if tree-sitter is not installed:
   ```typescript
   let treeSitterAvailable = true;
   try { require('tree-sitter'); } catch { treeSitterAvailable = false; }
   const describeIfTreeSitter = treeSitterAvailable ? describe : describe.skip;
   ```
- **Test i18n key usage**: Verify that service code calls `t()` with valid keys by using the mock `TranslateFn` that returns the key string, then asserting the key was passed to UI methods.

## Common Pitfalls

- **Forgetting `await` in tests**: Many service methods are async. Forgetting `await` on the method call causes the test to pass before assertions are evaluated. Always `await` async operations and use `expect(...).resolves` or `expect(...).rejects` for promise assertions.
- **File system state leakage**: Tests that write to actual files or temp directories must clean up in `afterEach()` or `afterAll()`. Use `os.tmpdir()` and unique directory names.
- **Mocking module-level constants**: Some modules export constants at the module level (e.g., `AGENT_TYPES`, `PREVC_PHASE_ORDER`). These cannot be mocked with `jest.mock()` easily. Import them directly and test code that uses them.
- **Snapshot fragility**: Avoid snapshot tests for generated markdown content -- they break on any formatting change. Instead, assert on structural properties (frontmatter fields present, section headings exist, file count correct).
- **Testing LLM output**: Never test actual LLM responses in unit tests. Mock the AI SDK and test that the correct prompts and parameters are passed. Integration tests with real LLM calls should be separate and marked with a custom Jest tag or environment variable check.
