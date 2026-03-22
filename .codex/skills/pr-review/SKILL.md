---
name: PR Review
description: Review pull requests against team standards and best practices
phases: [R, V]
---

# PR Review

Review pull requests for the `@dotcontext/cli` project against established patterns and quality standards.

## When to Use

- Reviewing a PR before merge
- Validating changes during the Review (R) or Validation (V) phases
- Checking that a PR meets the project's architectural and testing standards

## PR Review Process

### 1. Understand the Change Scope

Check which areas are affected:

```bash
# View changed files grouped by area
git diff main...HEAD --stat
```

Map changes to project layers:
- `src/services/mcp/` -- MCP server and gateway tools
- `src/services/<domain>/` -- Service layer business logic
- `src/generators/` -- Scaffold generation
- `src/workflow/` -- PREVC workflow system
- `src/utils/` -- Shared utilities
- `src/index.ts` -- CLI command definitions
- `.context/` -- Documentation and scaffolding content

### 2. Verify the Commit History

This project uses Conventional Commits:

```
<type>(<scope>): <description>
```

Check that:
- [ ] Each commit has a valid type (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`)
- [ ] Scope matches the primary area of change (see commit-message skill for scope list)
- [ ] Messages are in imperative mood ("add", not "added")
- [ ] Breaking changes use `!` suffix and `BREAKING CHANGE:` footer

### 3. Architecture Review

#### Service Layer Compliance
- [ ] New services follow the directory-per-service pattern under `src/services/`
- [ ] Services export through `index.ts` barrel files
- [ ] Constructor accepts options object; async init is a separate method
- [ ] Dependencies are injectable (like `contextBuilder` in `AIContextMCPServer`)

#### MCP Tool Changes
- [ ] Zod schemas have `.describe()` on every parameter
- [ ] Gateway handler covers all actions in the enum (no unreachable branches)
- [ ] Responses use `createJsonResponse`/`createErrorResponse` from `response.ts`
- [ ] New types exported through `gatewayTools.ts` barrel
- [ ] Total MCP tool count remains manageable (currently 9)
- [ ] Tool description strings include all action names for AI discovery

#### Generator Changes
- [ ] Generators use v2 frontmatter (`scaffoldVersion: "2.0.0"`)
- [ ] `force` flag is respected (skip existing when false)
- [ ] Result type includes generated/skipped counts
- [ ] Templates are in `templates/` subdirectory

#### Workflow Changes
- [ ] Phase transitions follow PREVC order
- [ ] Scale-dependent phases are correctly skipped
- [ ] Gate logic is enforced unless explicitly bypassed

### 4. Code Quality Checks

- [ ] No `any` types; use `unknown` + type guards
- [ ] No `console.log` in MCP server code (use `process.stderr.write`)
- [ ] File paths use `path.join()`/`path.resolve()`, never string concatenation
- [ ] Optional dependencies (tree-sitter) handled with graceful fallback
- [ ] Error messages are user-friendly (CLI) or structured JSON (MCP)

### 5. Testing Verification

```bash
# Run all tests
npm test

# Build check
npm run build
```

- [ ] New services have `.test.ts` files
- [ ] Tests mock external dependencies (`jest.mock()` for AI providers, fs)
- [ ] Temp directories used (`fs.mkdtemp`) and cleaned up (`afterEach`)
- [ ] Mock `CLIInterface` and `TranslateFn` provided where needed
- [ ] MCP handler tests call handler functions directly (not through transport)

### 6. i18n Completeness

- [ ] New user-facing strings added to both `en` and `pt-BR` in `src/utils/i18n.ts`
- [ ] Translation keys use dot notation (`commands.new.description`)
- [ ] CLI output uses `t()` function, not hardcoded strings

### 7. Documentation Impact

- [ ] `CHANGELOG.md` updated if the change is user-facing
- [ ] `README.md` updated if public CLI commands or MCP tools changed
- [ ] `.context/docs/` updated if architecture changed significantly
- [ ] MCP tool description strings updated if actions added/removed

## Common PR Issues

### Missing Barrel Exports
New types or handlers added in `src/services/mcp/gateway/*.ts` but not re-exported through `gateway/index.ts` and `gatewayTools.ts`.

### Inconsistent Error Handling
MCP handlers that throw instead of returning `createErrorResponse()`. CLI commands that swallow errors silently.

### Untested Edge Cases
- What happens when `.context/` directory does not exist?
- What happens when tree-sitter is not installed?
- What happens with empty or malformed frontmatter?
- What happens with relative vs. absolute paths?

### Breaking MCP Compatibility
Renaming or removing an MCP tool action without a migration path. Always add new actions alongside old ones, then deprecate.

## PR Description Template

When creating PRs for this project:

```markdown
## Summary
- What this PR does (1-3 bullet points)

## Changes
- List of key changes by file/area

## Test plan
- [ ] Unit tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual verification: `npx tsx src/index.ts <command>`
- [ ] MCP tool tested (if applicable)
```