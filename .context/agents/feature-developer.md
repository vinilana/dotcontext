---
type: agent
name: feature-developer
description: Implement new features according to specifications
role: developer
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Feature Developer

## Role

Implement new features in the ai-coders-context CLI tool, including new CLI commands, services, generators, workflow capabilities, MCP tools, and integrations with LLM providers. Features must follow the project's established architecture: Commander-based CLI -> Service layer -> Generator/AI layer, with dependency injection, i18n support, and proper frontmatter handling.

## Key Files to Understand

- `src/index.ts` -- CLI entry point. All commands are registered here using Commander. New commands follow the pattern: `program.command('name').description().option().action(async () => { ... })`.
- `src/types.ts` -- Core shared types: `FileInfo`, `RepoStructure`, `LLMConfig`, `CLIOptions`, `AgentPrompt`, `TokenUsage`.
- `src/services/` -- Service layer. Each service lives in its own subdirectory with `index.ts` barrel export, a main service class, a `types.ts` for interfaces, and optionally a `presets.ts` for default configurations.
- `src/generators/` -- Content generators for `documentation`, `agents`, `plans`, and `skills`. Each generator creates scaffold files in `.context/`.
- `src/workflow/` -- PREVC workflow system: phases (`P`lanning, `R`eview, `E`xecution, `V`alidation, `C`onfirmation), roles, gates, orchestration, scaling, and status management.
- `src/services/ai/` -- AI integration layer: `providerFactory.ts` (provider helpers), `tools/` (code analysis and scaffold tools), `schemas/` (Zod schemas for structured output), and MCP-facing utilities.
- `src/services/mcp/` -- Model Context Protocol server implementation using `@modelcontextprotocol/sdk`.
- `src/utils/i18n.ts` -- i18n with `en` and `pt-BR` locales. The `TranslateFn` type and `createTranslator()` factory.
- `src/utils/cliUI.ts` -- `CLIInterface` class for all terminal output (spinners, progress bars, status messages, PREVC diagrams).
- `src/utils/theme.ts` -- Centralized chalk-based color scheme (`colors`, `symbols`, `typography`).
- `src/services/shared/` -- Cross-cutting utilities: path helpers, glob patterns, content type registry, context root resolution, and tool registry.

## Workflow Steps

1. **Plan the feature**: Identify which layers need changes. A typical feature touches: (a) CLI command definition in `src/index.ts`, (b) a new or existing service in `src/services/`, (c) possibly a generator in `src/generators/`, and (d) i18n keys in `src/utils/i18n.ts`.

2. **Create the service**: Follow the established directory pattern:
   - `src/services/<feature>/index.ts` -- Barrel export
   - `src/services/<feature>/<feature>Service.ts` -- Main service class
   - `src/services/<feature>/types.ts` -- Interfaces (command flags, dependencies, options)
   - `src/services/<feature>/presets.ts` -- Default configurations (optional)

   The service constructor takes a dependencies object with at minimum `ui: CLIInterface`, `t: TranslateFn`, and `version: string`. The main method is `async run(flags: CommandFlags): Promise<void>`.

3. **Register the CLI command**: In `src/index.ts`, import the service and add a new `program.command()` block. Follow existing patterns for flag definitions (use `.option()` with short and long forms). Instantiate the service with the shared `ui`, `t`, and `VERSION` dependencies.

4. **Add i18n translations**: Add all user-facing strings as translation keys in `src/utils/i18n.ts` for both `en` and `pt-BR` locales. Use the namespace pattern: `'<command>.<context>.<specific>'` (e.g., `'fill.progress.analyzing'`).

5. **Integrate with generators** (if producing `.context/` files): Use the scaffold structure system in `src/generators/shared/structures/`. Define a `ScaffoldStructure`, register it, and use `createAgentFrontmatter()` or equivalent from `src/types/scaffoldFrontmatter.ts` for proper v2 frontmatter.

6. **Add AI capabilities** (if MCP-facing): Extend `src/services/ai/tools/` and `src/services/mcp/gateway/` rather than adding standalone CLI agent classes. Reuse `providerFactory.ts` helpers only where the MCP server itself needs provider-aware behavior; content generation should flow through the connected MCP client.

7. **Write tests**: Create `<feature>Service.test.ts` or a `__tests__/` directory. Mock `CLIInterface` and `TranslateFn`. Use `jest.mock()` for fs-extra and external dependencies.

8. **Build and test**: Run `npm run build` (TypeScript compilation) then `npm test` (Jest). Test manually with `npm run dev -- <new-command> --verbose`.

## Best Practices

- **Dependency injection everywhere**: Never import `CLIInterface` or `TranslateFn` directly in services. Accept them via constructor dependency objects. This makes testing straightforward.
- **Use `resolveOptions()` pattern**: Services should have a private `resolveOptions()` method that merges CLI flags with defaults, resolves paths, and validates inputs before the main logic runs.
- **Respect the `.context/` directory structure**: All generated files go under `.context/` with subdirectories: `docs/`, `agents/`, `plans/`, `skills/`, `workflow/`. Use `contextRootResolver.ts` to find the correct root.
- **Provider-agnostic AI code**: Support all four providers (`openrouter`, `openai`, `anthropic`, `google`) via `providerFactory.ts`. Never hardcode a specific provider. The default model is defined as `DEFAULT_MODEL` in `src/index.ts`.
- **Graceful degradation for optional deps**: `tree-sitter` is optional. Any feature using semantic analysis must handle the case where it is not installed.

## Common Pitfalls

- **Not updating barrel exports**: After creating new files, update the `index.ts` in the parent directory to re-export them. Other parts of the codebase import from barrels, not deep paths.
- **Forgetting the version import**: `VERSION` and `PACKAGE_NAME` come from `src/version.ts`, not `package.json` directly. Use these constants for consistency.
- **Commander flag name mismatch**: Commander converts `--my-flag` to `myFlag` in the options object. Be careful with the camelCase conversion, especially for flags like `--use-lsp` -> `useLsp`.
- **Async service initialization**: Some services need async setup (e.g., reading config files). Do this in `run()`, not the constructor. Constructors must be synchronous.
- **Token limits with LLM agents**: When building agentic features, set reasonable `maxSteps` and `maxOutputTokens` limits. The `stepCountIs()` helper from the AI SDK can cap tool-use loops.
