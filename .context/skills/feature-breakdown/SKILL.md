---
type: skill
name: Feature Breakdown
description: Break down features into implementable tasks
skillSlug: feature-breakdown
phases: [P]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Feature Breakdown

Break down features into concrete, implementable tasks within the `@dotcontext/cli` architecture.

## When to Use

- Starting the Planning (P) phase of a PREVC workflow
- Scoping a new CLI command, MCP tool, or service
- Creating a plan document in `.context/plans/`
- Estimating complexity to choose the right workflow scale (QUICK/SMALL/MEDIUM/LARGE)

## Instructions

### 1. Classify the Feature Scope

Determine which layers of the codebase are involved:

| Layer | Directory | Examples |
|-------|-----------|----------|
| CLI | `src/index.ts` | New command, new flag, output format change |
| Service | `src/services/<domain>/` | New business logic, data processing |
| Generator | `src/generators/` | New scaffold type, template changes |
| MCP | `src/services/mcp/` | New tool, new gateway action, schema change |
| Workflow | `src/workflow/` | Phase logic, gate rules, skill/agent integration |
| Utils | `src/utils/` | New utility function, i18n keys, CLI UI changes |
| Types | `src/types/`, `src/types.ts` | New interfaces, frontmatter types |

### 2. Determine the Workflow Scale

Use these criteria to set the `scale` when calling `workflow-init`:

| Scale | Criteria | Typical Feature |
|-------|----------|-----------------|
| QUICK | Single file, no design decisions | Fix typo, update translation key |
| SMALL | 2-5 files, straightforward logic | Add a flag to existing CLI command |
| MEDIUM | Multiple services, design decisions needed | New MCP gateway action with service |
| LARGE | New subsystem, cross-cutting concerns | New generator type, new AI provider |

### 3. Identify the Task Breakdown Pattern

Most features in this project follow one of these patterns:

#### Pattern A: New MCP Gateway Action
1. Define the action in the Zod schema (`mcpServer.ts`)
2. Add handler logic in the gateway file (`src/services/mcp/gateway/<tool>.ts`)
3. Create or extend the backing service (`src/services/<domain>/`)
4. Update type exports in `gatewayTools.ts` and `gateway/index.ts`
5. Add tests for the handler
6. Update MCP tool description string

#### Pattern B: New CLI Command
1. Define the command with Commander in `src/index.ts`
2. Create the service in `src/services/<name>/`
3. Add i18n keys to `src/utils/i18n.ts` (both `en` and `pt-BR`)
4. Wire CLI options to service calls
5. Add CLI output via `CLIInterface` from `src/utils/cliUI.ts`
6. Write tests

#### Pattern C: New Generator/Scaffold Type
1. Create generator class in `src/generators/<type>/`
2. Define templates in `src/generators/<type>/templates/`
3. Add frontmatter type to `src/types/scaffoldFrontmatter.ts`
4. Integrate with `InitService` for scaffold creation
5. Integrate with `FillService` for AI content generation
6. Add to MCP context gateway if applicable
7. Write generator tests

#### Pattern D: New Workflow Feature
1. Update types in `src/workflow/types.ts`
2. Modify phase/gate logic in `src/workflow/`
3. Update `WorkflowService` in `src/services/workflow/`
4. Update MCP workflow tools if user-facing
5. Write tests for phase transitions

### 4. Create the Plan Document

Use the MCP tool or create manually:

```bash
# Via MCP
context({ action: 'scaffoldPlan', planName: 'my-feature', title: 'My Feature', summary: 'What it does' })

# Manual creation in .context/plans/my-feature.md
```

Structure each phase with concrete steps:

```markdown
## Phases

### P - Planning
- [ ] Define requirements and acceptance criteria
- [ ] Identify affected services and files
- [ ] Choose workflow scale

### R - Review (for MEDIUM/LARGE)
- [ ] Review architecture impact
- [ ] Document design decisions as ADRs
- [ ] Get plan approval

### E - Execution
- [ ] Implement service logic in src/services/<domain>/
- [ ] Add MCP gateway handler (if applicable)
- [ ] Update CLI integration (if applicable)
- [ ] Add i18n keys for new user-facing strings
- [ ] Update type exports

### V - Validation
- [ ] Write unit tests with jest.mock() for externals
- [ ] Run full test suite: npm test
- [ ] Manual CLI verification: npx tsx src/index.ts <command>
- [ ] TypeScript compilation check: npm run build

### C - Confirmation (for LARGE)
- [ ] Update CHANGELOG.md
- [ ] Update relevant .context/ documentation
- [ ] Update README if public API changed
```

### 5. Identify Dependencies and Risks

Common dependencies to flag:
- **AI provider changes**: Require testing with actual API keys (not just mocks)
- **tree-sitter changes**: Optional dependency -- test with and without it installed
- **MCP protocol changes**: Must maintain backward compatibility with existing clients
- **Frontmatter format changes**: Must handle both v1 and v2 formats
- **i18n additions**: Both locales must be updated simultaneously

### 6. Link the Plan to the Workflow

After creating the plan, link it to the active workflow:

```
plan({ action: 'link', planSlug: 'my-feature' })
```

This enables phase tracking and the `commitPhase` action for git integration.

## Example: Breaking Down "Add Caching to Semantic Analysis"

**Scale**: MEDIUM (multiple files, design decision on cache strategy)

**Tasks**:
1. P: Define cache invalidation strategy (file mtime vs. content hash)
2. P: Decide cache storage location (`.context/.cache/` vs. temp dir)
3. R: Review impact on `CodebaseAnalyzer` and `SemanticContextBuilder`
4. E: Add cache layer to `src/services/semantic/codebaseAnalyzer.ts`
5. E: Add cache config to `AnalyzerOptions` type
6. E: Wire cache option through MCP `context({ action: 'buildSemantic' })` params
7. V: Test cache hit/miss with `codebaseAnalyzer.test.ts`
8. V: Test that `cacheEnabled: false` bypasses cache
9. V: Manual test with large repo to verify performance improvement

**Files affected**: `src/services/semantic/codebaseAnalyzer.ts`, `src/services/semantic/types.ts`, `src/services/mcp/gateway/context.ts`, `src/services/mcp/mcpServer.ts`
