---
name: Refactoring
description: Safe code refactoring with step-by-step approach
phases: [E]
---

# Refactoring

Safe, systematic refactoring procedures for the `@dotcontext/cli` codebase.

## When to Use

- Extracting logic into a new service or utility
- Consolidating duplicate code across services or generators
- Restructuring MCP gateway handlers
- Improving type safety or removing `any` usage
- Simplifying complex functions (high cyclomatic complexity)
- Migrating between patterns (e.g., callback to async/await)

## Pre-Refactoring Checklist

Before starting any refactoring:

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Create a branch or ensure changes can be reverted
- [ ] Identify all callers of the code being refactored (use grep or IDE references)

## Common Refactoring Scenarios

### Extracting a New Service

The project follows a directory-per-service pattern. To extract logic into a new service:

1. Create `src/services/<name>/` directory
2. Create the service class:

```typescript
// src/services/cache/cacheService.ts
export interface CacheServiceOptions {
  repoPath: string;
  cacheDir?: string;
}

export class CacheService {
  private readonly repoPath: string;
  private readonly cacheDir: string;

  constructor(options: CacheServiceOptions) {
    this.repoPath = options.repoPath;
    this.cacheDir = options.cacheDir || '.context/.cache';
  }

  async get(key: string): Promise<string | null> { /* ... */ }
  async set(key: string, value: string): Promise<void> { /* ... */ }
}
```

3. Create `src/services/<name>/index.ts` barrel:

```typescript
export { CacheService, CacheServiceOptions } from './cacheService';
```

4. Update callers to import from the new service
5. Write tests in `src/services/<name>/cacheService.test.ts`

### Splitting a Large Gateway Handler

Gateway handlers in `src/services/mcp/gateway/` can grow large. To split:

1. Identify action groups that share logic
2. Extract helper functions within the same file first
3. If helpers grow, extract into a separate utility or service
4. Keep the main handler function as a thin dispatcher:

```typescript
export async function handleContext(params: ContextParams, options: ContextOptions): Promise<MCPToolResponse> {
  switch (params.action) {
    case 'check': return handleCheck(options);
    case 'init': return handleInit(params, options);
    // Each case delegates to a focused function
  }
}
```

### Improving Type Safety

Common type improvements:

1. **Replace `any` with `unknown`**: Then add type guards:
```typescript
// Before
function process(data: any) { return data.value; }

// After
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data shape');
}
```

2. **Add discriminated unions** for action-based params:
```typescript
type ContextParams =
  | { action: 'check'; repoPath?: string }
  | { action: 'init'; repoPath?: string; type?: string }
  | { action: 'fill'; repoPath?: string; target?: string };
```

3. **Extract interface from implementation**: When a class has grown, extract its public interface for dependency injection (pattern used by `AIContextMCPServer` with `contextBuilder`).

### Consolidating Duplicate Logic

Common duplication spots in this project:

- **Path resolution**: Multiple services resolve `repoPath` + `outputDir`. Extract to `src/services/shared/`.
- **Frontmatter parsing**: Used in generators, fill service, and MCP tools. Centralized in `src/utils/frontMatter.ts`.
- **File listing with glob**: Used in semantic analysis, generators, and export. Check `src/services/shared/` for existing utilities.
- **Error response creation**: MCP handlers should all use `createErrorResponse()` from `response.ts`.

### Updating Barrel Exports

When moving or renaming files, update the export chain:

```
src/services/mcp/gateway/<file>.ts  -- implementation
  -> src/services/mcp/gateway/index.ts  -- gateway barrel
    -> src/services/mcp/gatewayTools.ts  -- compatibility barrel
      -> src/services/mcp/mcpServer.ts  -- consumer
```

## Step-by-Step Refactoring Process

1. **Identify**: Find the code smell (large function, duplication, poor typing)
2. **Plan**: Determine the target structure and list affected files
3. **Test**: Ensure existing tests pass and cover the code being changed
4. **Extract**: Move code to the new location, keeping the old code as a thin wrapper
5. **Redirect**: Update all callers to use the new location
6. **Remove**: Delete the old wrapper once all callers are redirected
7. **Verify**: Run `npm test` and `npm run build`
8. **Commit**: Use `refactor(<scope>):` prefix

## Refactoring Safety Rails

### Tests as Safety Net
- Never refactor code that lacks tests. Write tests first.
- Run `npx jest --testPathPattern="<area>"` after each step.

### Preserve Public APIs
- MCP tool names and schemas are public API. Do not rename tools or remove actions without a deprecation strategy.
- CLI command names and flags are public API.
- Barrel export paths are consumed by other modules. Keep backward-compatible re-exports.

### TypeScript Compiler as Guard
- `npm run build` will catch broken imports, type mismatches, and missing exports.
- Enable `noUnusedLocals` temporarily to find dead code after extraction.

### Small Commits
- Commit after each logical step (extract, redirect, remove).
- This makes it easy to bisect if something breaks.

## Anti-Patterns to Watch For

- **Big bang refactors**: Changing everything at once. Prefer incremental changes.
- **Refactoring while adding features**: Do one or the other per commit.
- **Changing test behavior during refactoring**: Refactoring should not change test expectations.
- **Forgetting barrel exports**: New file locations need updated export chains.
- **Breaking MCP backward compatibility**: Clients depend on stable tool names and schemas.