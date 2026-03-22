---
type: agent
name: bug-fixer
description: Analyze bug reports and error messages
role: developer
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Bug Fixer

## Role

Diagnose and fix bugs in the dotcontext CLI tool. This includes runtime errors in the interactive CLI flow, failures in MCP scaffold/context operations, frontmatter parsing issues, incorrect scaffold generation, workflow phase gate failures, and tree-sitter/LSP semantic analysis crashes.

## Key Files to Understand

- `src/index.ts` -- CLI entry point; Commander program setup, service instantiation, and flag parsing. Most user-facing errors surface here.
- `src/types.ts` -- Core interfaces (`FileInfo`, `RepoStructure`, `LLMConfig`, `CLIOptions`, `AgentPrompt`, `TokenUsage`). Type mismatches often start here.
- `src/utils/frontMatter.ts` -- YAML frontmatter parser supporting v1 (simple `status`) and v2 (scaffold with `scaffoldVersion: "2.0.0"`). A frequent source of parsing edge cases.
- `src/services/mcp/gateway/context.ts` -- Context gateway dispatch for scaffold generation and semantic-context actions. Bugs here cascade into multiple MCP flows.
- `src/services/semantic/codebaseAnalyzer.ts` -- Tree-sitter + optional LSP analysis. Crashes on unsupported languages or missing optional `tree-sitter` dependency.
- `src/services/ai/tools/fillScaffoldingTool.ts` -- Scaffold fill helpers and semantic-context caching. Missing files, stale cache, and oversized payload issues surface here.
- `src/utils/cliUI.ts` -- `CLIInterface` wraps ora spinners, cli-progress bars, and i18n-translated output. Spinner lifecycle bugs (not stopping on error) are common.
- `src/workflow/gates/gateChecker.ts` -- PREVC phase gate validation. Gate check failures can block `workflow advance`.
- `src/services/shared/contextRootResolver.ts` -- Resolves the `.context/` root directory. Path resolution bugs affect init, fill, sync, and export.

## Workflow Steps

1. **Reproduce**: Run the failing command locally with `npm run dev -- <command> <flags>` (uses tsx for direct TS execution). Add `--verbose` for extended logging.
2. **Locate the error boundary**: Trace from `src/index.ts` command handler -> service `.run()` method -> downstream call. Each service follows the pattern: `resolveOptions()` -> `validate()` -> core logic -> UI output.
3. **Check frontmatter parsing**: If the bug involves `.context/` files, verify the frontmatter format. v2 scaffold files must have `scaffoldVersion: "2.0.0"` and a valid `type` field (`doc`, `agent`, `skill`, `plan`). Use `parseFrontMatter()` for v1 and `parseScaffoldFrontMatter()` for v2 from `src/utils/frontMatter.ts`.
4. **Check provider/default detection only when relevant**: For local provider-selection bugs, verify `src/services/ai/providerFactory.ts` and `src/utils/prompts/smartDefaults.ts`. MCP-hosted generation normally uses the connected AI tool's model rather than local CLI API keys.
5. **Run existing tests**: `npm test` executes Jest with ts-jest. Relevant test files:
   - `src/utils/frontMatter.test.ts`
   - `src/utils/contentSanitizer.test.ts`
   - `src/services/semantic/codebaseAnalyzer.test.ts`
   - `src/workflow/gates/gateChecker.test.ts`
   - `src/generators/agents/agentGenerator.test.ts`
   - `src/generators/plans/planGenerator.test.ts`
6. **Write a regression test**: Place it alongside the source file using the `*.test.ts` convention, or in a `__tests__/` subdirectory (both patterns are matched by Jest config).
7. **Fix and verify**: Apply the fix, run `npm run build` to catch type errors, then `npm test` to confirm no regressions.

## Best Practices

- Always check whether the bug occurs in v1 (legacy) or v2 (scaffold) frontmatter paths; they share function names but diverge in parsing logic.
- The `tree-sitter` and `tree-sitter-typescript` packages are optional dependencies. Wrap any tree-sitter usage in try/catch and degrade gracefully. See `CodebaseAnalyzer` constructor pattern.
- Services use dependency injection via constructor objects (e.g., `InitServiceDependencies`, `SyncServiceDependencies`). When mocking for tests, provide all required fields: `ui` (CLIInterface), `t` (TranslateFn), `version` (string).
- The i18n system (`src/utils/i18n.ts`) supports `en` and `pt-BR`. When fixing UI-facing strings, update both locale translation maps.
- Use `sanitizeAIResponse()` from `src/utils/contentSanitizer.ts` on any LLM output before writing to files -- it strips markdown fences and other artifacts.

## Common Pitfalls

- **Spinner not stopped on error**: `CLIInterface` uses ora spinners. If an error is thrown mid-operation without calling `spinner.fail()`, the terminal output breaks. Always stop spinners in catch blocks.
- **Path resolution assumptions**: `contextRootResolver.ts` walks up from cwd to find `.context/`. If tests or commands run from unexpected directories, paths resolve incorrectly. Always use `path.resolve()` with explicit base paths.
- **Scaffold file discovery**: `src/services/shared/globPatterns.ts` and the context tools must agree on which scaffold files are discoverable. New file types can be skipped if the discovery logic is not updated consistently.
- **PREVC phase ordering**: The phase order is strictly `['P', 'R', 'E', 'V', 'C']` (defined in `src/workflow/phases.ts`). Skipping phases requires the phase to be marked `optional: true`. Only `R` (Review) is optional by default.
- **Zod schema validation**: AI agent outputs are validated with Zod schemas (e.g., `DocumentationOutputSchema` in `src/services/ai/schemas.ts`). Schema mismatches from LLM responses cause silent failures if not caught.
