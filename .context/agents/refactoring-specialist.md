---
type: agent
name: refactoring-specialist
description: Identify code smells and improvement opportunities
role: developer
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Refactoring Specialist

## Role

Identify code smells, architectural inconsistencies, and improvement opportunities in the dotcontext codebase. Refactoring targets include: reducing coupling between services, standardizing patterns across generators, consolidating duplicated logic into shared utilities, improving type safety, and simplifying the service dependency injection model.

## Key Files to Understand

- `src/index.ts` -- CLI entry point. Currently houses all command registration and service instantiation inline. A primary refactoring candidate for command registration extraction.
- `src/services/mcp/gateway/context.ts` -- Consolidates multiple scaffold and semantic-context actions behind one gateway. It is a high-impact refactoring surface because multiple MCP flows converge here.
- `src/generators/agents/agentGenerator.ts` -- Second most imported (13 dependents). Contains the `AGENT_PHASES` mapping, agent generation logic, and semantic context integration. Consider extracting the phase mapping to the workflow module.
- `src/services/shared/` -- Shared utilities directory with path helpers, glob patterns, content type registry, context root resolution, UI helpers, and tool registry. Some services duplicate logic that could be centralized here.
- `src/generators/shared/` -- Shared generator code including `scaffoldStructures.ts`, `generatorUtils.ts`, `contextGenerator.ts`, and the `structures/` registry. The structures system is well-designed but some generators bypass it.
- `src/workflow/` -- PREVC workflow module with phases, roles, gates, orchestration, scaling, status management, and skills. Internal cohesion is good but the API surface to external consumers could be cleaner.
- `src/services/ai/providerFactory.ts` -- AI provider abstraction. Four providers (openrouter, openai, anthropic, google) with similar setup patterns that could benefit from a strategy pattern.
- `src/utils/frontMatter.ts` -- Handles both v1 and v2 frontmatter formats. The dual-format support adds complexity; consider a unified parser with format auto-detection.
- `src/types.ts` -- Global types file. Some interfaces here are only used by specific services and could be co-located.
- `src/services/init/initService.ts`, `src/services/sync/syncService.ts`, `src/services/workflow/workflowService.ts` -- Strong reference implementations for the current service pattern.

## Workflow Steps

1. **Audit the dependency graph**: Identify high fan-in (many importers) and high fan-out (many imports) modules. Key metrics:
   - `handleContext` and `fillScaffoldingTool`: high fan-in around MCP scaffolding flows
   - `AgentGenerator`: 13 importers -- the `AGENT_PHASES` constant could live in `src/workflow/` instead
   - `InitService`: 9 importers

2. **Identify pattern violations**: The standard service pattern is:
   - `Constructor(dependencies: ServiceDependencies)` -> `resolveOptions(flags)` -> `validate()` -> `execute()` -> UI feedback
   - Find services that deviate: missing dependency injection, direct console.log instead of `ui.*`, hardcoded paths instead of using `contextRootResolver`, or synchronous operations where async is expected.

3. **Find duplicated logic**: Common duplication areas:
   - Frontmatter reading/writing across services (should all use `src/utils/frontMatter.ts`)
   - Glob pattern assembly (should all use `src/services/shared/globPatterns.ts`)
   - Provider/default-model detection (should consistently use `src/services/ai/providerFactory.ts` and `src/utils/prompts/smartDefaults.ts`)
   - File discovery patterns (scanning `.context/` subdirectories)

4. **Plan the refactoring**: For each identified improvement:
   - Assess the blast radius (how many files change)
   - Determine if it can be done incrementally (extract interface first, then migrate callers)
   - Check test coverage of affected code before refactoring

5. **Execute incrementally**: Make one structural change at a time. After each change:
   - Run `npm run build` to verify type safety
   - Run `npm test` to verify behavior
   - Verify barrel exports in `index.ts` files are updated

6. **Update scaffolds and structures**: If refactoring changes public APIs of services or generators, update the corresponding scaffold structures in `src/generators/shared/structures/` and templates so future MCP `context({ action: "init" })` runs produce correct scaffolds.

## Best Practices

- **Extract, don't rewrite**: Move existing code into better locations rather than rewriting from scratch. This preserves tested behavior.
- **Maintain barrel exports**: Every directory's `index.ts` must be updated when files are added, removed, or renamed. External consumers import from barrels.
- **Keep the dependency injection contract**: Services accept `{ ui, t, version, ... }` in constructors. When extracting sub-services, give them their own dependency interface rather than passing the parent's full dependency object.
- **Use TypeScript's type system**: When splitting interfaces, use `Pick<>`, `Omit<>`, and intersection types to derive sub-interfaces from existing ones. This keeps types DRY and ensures compatibility.
- **Preserve the PREVC model**: The workflow phases (Planning, Review, Execution, Validation, Confirmation) and roles (planner, designer, architect, developer, qa, reviewer, documenter, solo-dev) are core architectural concepts. Refactoring should make these clearer, not obscure them.

## Common Pitfalls

- **Breaking circular dependencies**: The codebase has some circular import risks between `generators/agents` <-> `services/autoFill` <-> `services/stack`. Use dependency inversion (interfaces in shared modules) to break cycles rather than restructuring entire directories.
- **Over-abstracting the AI layer**: The four LLM providers have genuinely different capabilities (tool calling support, structured output, streaming). Do not force them into an overly uniform interface that hides important differences.
- **Losing i18n coverage**: When moving user-facing code between files, ensure translation key usage (`t('key')`) follows the code. Orphaned translation keys and missing translations are hard to detect.
- **Scaffold version compatibility**: The codebase supports both v1 and v2 frontmatter. Refactoring frontmatter handling must preserve backward compatibility -- users have existing `.context/` directories with v1 files.
- **Large PRs**: Resist the temptation to refactor everything at once. Each refactoring PR should touch one concern (e.g., "extract command registration from index.ts" or "consolidate glob pattern handling"). This makes review feasible and rollback safe.
