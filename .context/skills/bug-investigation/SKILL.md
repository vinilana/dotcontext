---
type: skill
name: Bug Investigation
description: Systematic bug investigation and root cause analysis
skillSlug: bug-investigation
phases: [E, V]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Bug Investigation

Systematic approach to investigating and fixing bugs in the `@dotcontext/cli` CLI tool.

## When to Use

- A CLI command (`workflow`, `sync`, `mcp`, etc.) produces incorrect output or crashes
- An MCP tool returns an error or unexpected response
- Semantic analysis (tree-sitter / LSP) fails on certain codebases
- Scaffold generation produces malformed frontmatter or missing content
- Workflow phase transitions behave incorrectly
- Tests fail unexpectedly after changes

## Project-Specific Investigation Surfaces

| Area | Key Files | Common Issues |
|------|-----------|---------------|
| CLI commands | `src/index.ts`, `src/services/*/index.ts` | Commander option parsing, missing args |
| MCP server | `src/services/mcp/mcpServer.ts`, `src/services/mcp/gateway/*.ts` | repoPath resolution, Zod validation failures |
| Scaffold generation | `src/generators/*/`, `src/types/scaffoldFrontmatter.ts` | Frontmatter parsing, file path resolution |
| Scaffold fill via MCP | `src/services/ai/tools/fillScaffoldingTool.ts`, `src/services/mcp/gateway/context.ts` | Missing files, stale context, oversized responses |
| Semantic analysis | `src/services/semantic/codebaseAnalyzer.ts`, `src/services/semantic/treeSitter/` | tree-sitter optional dep missing, parse failures |
| Workflow | `src/workflow/`, `src/services/workflow/workflowService.ts` | Phase transition logic, gate checking |
| i18n | `src/utils/i18n.ts` | Missing translation keys, locale detection |
| Frontmatter | `src/utils/frontMatter.ts` | v1 vs v2 format confusion, status detection |

## Instructions

### 1. Reproduce the Bug

Run the CLI in dev mode to reproduce:

```bash
# Direct execution via tsx
npx tsx src/index.ts workflow --help

# For MCP-related bugs, capture stderr output
npx tsx src/index.ts mcp --verbose 2>mcp-debug.log
```

For MCP tool bugs, test the gateway handler directly in a script or test file rather than through the full MCP transport.

### 2. Identify the Service Layer

Trace the call path from the CLI command or MCP tool to the responsible service:

```
CLI command (src/index.ts)
  -> Service (src/services/<domain>/)
    -> Generator (src/generators/) or Util (src/utils/)
```

For MCP:
```
MCP tool (mcpServer.ts registerGatewayTools)
  -> Gateway handler (src/services/mcp/gateway/<tool>.ts)
    -> Service (src/services/<domain>/)
```

### 3. Check Known Fragile Points

- **Optional dependencies**: `tree-sitter` and `tree-sitter-typescript` are in `optionalDependencies`. Code must handle their absence gracefully. Check `src/services/semantic/treeSitter/treeSitterLayer.ts`.
- **repoPath resolution**: The MCP server has a 4-level priority: explicit param > cached path > initial path > `process.cwd()`. Bugs often arise from incorrect path resolution. See `getRepoPath()` in `mcpServer.ts`.
- **Frontmatter parsing**: Two formats exist (v1 simple, v2 scaffold). Check `src/utils/frontMatter.ts` and `isScaffoldFrontmatter()`.
- **Provider/default detection**: Local model defaults are derived from `src/services/ai/providerFactory.ts` and `src/utils/prompts/smartDefaults.ts`. MCP-hosted generation usually relies on the connected tool's model.
- **File path handling**: Always use `path.resolve()` or `path.join()`. Watch for relative vs. absolute path confusion, especially in `contextBuilder.ts`.

### 4. Use Existing Tests as Reference

Run the relevant test suite to see what is expected:

```bash
# Run all tests
npm test

# Run specific test file
npx jest src/services/mcp/mcpServer.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="mcp"
```

Key test files:
- `src/services/mcp/mcpServer.test.ts` -- MCP server instantiation
- `src/services/mcp/mcpServer.test.ts` -- MCP tool registration and dispatch
- `src/services/semantic/codebaseAnalyzer.test.ts` -- Semantic analysis
- `src/utils/frontMatter.test.ts` -- Frontmatter parsing
- `src/utils/contentSanitizer.test.ts` -- Content sanitization
- `src/workflow/gates/gateChecker.test.ts` -- Workflow gate logic

### 5. Isolate with Logging

The project uses `ora` for spinners and `chalk` for colored output. For debugging:
- CLI: Pass `--verbose` flag to enable detailed logging
- MCP: The `log()` method writes to `process.stderr` when `verbose: true`
- Services: Add temporary `console.error()` calls (never `console.log()` in MCP mode)

### 6. Fix and Verify

After identifying root cause:

1. Write a failing test that demonstrates the bug
2. Apply the fix in the appropriate service/util
3. Run the full test suite: `npm test`
4. Run the CLI manually to verify end-to-end: `npx tsx src/index.ts <command>`
5. Check TypeScript compilation: `npm run build`

## Common Bug Patterns

### "Cannot find module" at Runtime
- Check if the import uses the `@generators/agents/*` path alias (defined in `tsconfig.json`)
- Ensure the file is not excluded from compilation by `tsconfig.json`

### MCP Tool Returns Unexpected Error
- Check Zod schema validation in `mcpServer.ts` -- params may not match the schema
- Check the gateway handler's switch statement for unhandled actions
- Verify `repoPath` resolves to a directory with `.context/` scaffolding

### Frontmatter Status Not Detected
- v2 scaffold files use `scaffoldVersion: "2.0.0"` and `status: unfilled|filled`
- Ensure `isScaffoldFrontmatter()` check happens before v1 fallback
- Check for BOM or encoding issues in the file header

### Workflow Phase Transition Fails
- Check gate configuration in `src/workflow/gates/`
- Verify scale-dependent phase skipping (QUICK skips P and R)
- Check `src/workflow/prevcConfig.ts` for scale definitions

### MCP Scaffold Fill Produces Empty or Placeholder Guidance
- Verify `fillSingleFileTool` can read the scaffold and build semantic context
- Check scaffold structure registration via `getScaffoldStructure()`
- Confirm `SemanticContextBuilder` is returning project-specific content
- Check response size and cached-context invalidation behavior
