---
type: skill
name: Code Review
description: Review code quality, patterns, and best practices
skillSlug: code-review
phases: [R, V]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Code Review

Guidelines for reviewing code changes in the `@dotcontext/cli` project.

## When to Use

- Reviewing a pull request or diff
- Validating code during the Review (R) or Validation (V) phases of the PREVC workflow
- Checking a new service, generator, or utility for adherence to project patterns
- Evaluating MCP gateway handler implementations

## Project Standards

### TypeScript Configuration

- Target: ES2020, Module: CommonJS
- Strict mode enabled (`"strict": true`)
- Declarations and source maps generated
- Path alias: `@generators/agents/*` maps to `src/generators/agents/*`

### Code Organization Patterns

**Service Layer** (22 services in `src/services/`):
- Each service lives in its own directory under `src/services/`
- Exports through `index.ts` barrel files
- Constructor takes an options object or required config
- Methods are async where I/O is involved
- Example: `FillService`, `WorkflowService`, `AIContextMCPServer`

**Generators** (`src/generators/`):
- Separate generators for docs, agents, plans, skills
- Accept options objects, return typed result objects (e.g., `SkillGeneratorResult`)
- Use frontmatter serialization from `src/types/scaffoldFrontmatter.ts`

**Utilities** (`src/utils/`):
- Pure functions or thin wrappers: `frontMatter.ts`, `contentSanitizer.ts`, `gitService.ts`
- CLI UI abstraction: `cliUI.ts` with `CLIInterface` type
- i18n: `i18n.ts` with `TranslateFn` type and `en`/`pt-BR` locale support

**MCP Gateway Handlers** (`src/services/mcp/gateway/`):
- One file per gateway: `explore.ts`, `context.ts`, `sync.ts`, etc.
- Exports: handler function, params type, options type, action type
- Uses `createJsonResponse`/`createErrorResponse`/`createTextResponse` from `response.ts`
- Barrel re-export through `index.ts` and `gatewayTools.ts`

### Review Checklist

#### Architecture

- [ ] New code follows the service/generator/util separation
- [ ] No direct file I/O in generators -- delegate to services or `fs-extra`
- [ ] MCP handlers do not use `console.log` (use `process.stderr.write` for debug output)
- [ ] `repoPath` is never hardcoded; always resolved through options or `getRepoPath()`

#### TypeScript Quality

- [ ] No `any` types (use `unknown` + type guards where needed)
- [ ] Exported interfaces/types for all public APIs
- [ ] Async functions return typed Promises, not implicit `any`
- [ ] Optional dependencies (tree-sitter) have graceful fallbacks

#### Error Handling

- [ ] MCP gateway handlers return `createErrorResponse()` rather than throwing
- [ ] CLI commands catch errors and display via `chalk`/`ora` with user-friendly messages
- [ ] File operations use `fs-extra` methods which handle missing directories

#### Naming Conventions

- [ ] Files: camelCase (`fillService.ts`, `codebaseAnalyzer.ts`)
- [ ] Classes: PascalCase (`SkillGenerator`, `SemanticContextBuilder`)
- [ ] Interfaces: PascalCase, often with `I`-free naming (`SkillMetadata`, not `ISkillMetadata`)
- [ ] Constants: UPPER_SNAKE_CASE (`BUILT_IN_SKILLS`, `PREVC_PHASE_ORDER`)
- [ ] MCP tools: kebab-case (`workflow-init`, `workflow-status`)

#### Testing

- [ ] New services have corresponding `.test.ts` files
- [ ] Tests use `jest.mock()` for external dependencies (AI providers, file system)
- [ ] Temp directories created with `fs.mkdtemp()` and cleaned up in `afterEach`
- [ ] Mock `CLIInterface` and `TranslateFn` for service tests (see `fillService.test.ts`)

#### Frontmatter

- [ ] New scaffold files use v2 format with `scaffoldVersion: "2.0.0"`
- [ ] `status` field is set correctly (`unfilled` for new, `filled` after content generation)
- [ ] Type-specific fields present (`skillSlug` for skills, `agentType` for agents, etc.)

#### i18n

- [ ] New user-facing strings added to both `en` and `pt-BR` in `src/utils/i18n.ts`
- [ ] Translation keys follow dot-notation: `'commands.fill.description'`
- [ ] CLI output uses `t()` function, not hardcoded strings

## Instructions

### Reviewing a Service Change

1. Check the service's public interface -- does it follow the options-object constructor pattern?
2. Verify barrel exports in `index.ts` are updated
3. Check for proper error handling (try/catch with typed errors)
4. Ensure no side effects in constructors (async init should be a separate method)
5. Look for dependency injection points (e.g., `AIContextMCPServer` accepts `contextBuilder` for testing)

### Reviewing an MCP Tool Change

1. Verify Zod schema has `.describe()` on every param with action prefix
2. Check that the handler switch covers all actions in the enum
3. Confirm responses use `createJsonResponse`/`createErrorResponse` consistently
4. Verify new types are re-exported through `gatewayTools.ts`
5. Check that `repoPath` uses the caching mechanism via `getRepoPath()`

### Reviewing a Generator Change

1. Check output paths are constructed with `path.join(repoPath, outputDir, ...)`
2. Verify `force` flag is respected (skip existing files when `false`)
3. Ensure frontmatter is generated via `createSkillFrontmatter`/`serializeFrontmatter` from `scaffoldFrontmatter.ts`
4. Check that the result type includes all relevant counts (generated, skipped, etc.)

### Reviewing a Workflow Change

1. Verify phase transitions follow PREVC order (P -> R -> E -> V -> C)
2. Check scale-dependent phase inclusion (QUICK: E+V only, SMALL: P+E+V, MEDIUM: P+R+E+V, LARGE: all)
3. Ensure gate checks are enforced unless `autonomous` or `force` is true
4. Verify workflow status file is written to `.context/workflow/`
