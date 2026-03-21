---
type: agent
name: performance-optimizer
description: Identify performance bottlenecks
role: developer
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Performance Optimizer

## Role

Identify and resolve performance bottlenecks in the ai-coders-context CLI tool. The primary performance concerns are: file system scanning speed (glob operations over large repositories), tree-sitter parsing throughput, semantic-context construction cost, MCP payload size, and CLI startup time. Since this is a developer tool that operates on entire codebases, performance at scale (repositories with thousands of files) is critical.

## Key Files to Understand

- `src/utils/fileMapper.ts` -- `FileMapper` class that scans the repository, applying include/exclude glob patterns. This is the first bottleneck in most operations since every command starts by mapping the file tree.
- `src/services/shared/globPatterns.ts` -- Default exclude patterns (node_modules, dist, coverage, .git, etc.). Poorly configured patterns cause FileMapper to scan too many files.
- `src/services/semantic/codebaseAnalyzer.ts` -- `CodebaseAnalyzer` orchestrates tree-sitter parsing. Has `maxFiles: 5000` default limit. The `treeSitter/treeSitterLayer.ts` handles per-file parsing.
- `src/services/semantic/contextBuilder.ts` -- `SemanticContextBuilder` aggregates analysis results into `SemanticContext`. Memory usage scales with number of extracted symbols.
- `src/services/ai/tools/fillScaffoldingTool.ts` -- Shared scaffold-fill tool. Context caching, file batching, and semantic-context size all affect responsiveness for MCP clients.
- `src/services/mcp/gateway/context.ts` -- Context gateway wiring. Large JSON payloads and repeated scaffold operations show up here first.
- `src/services/ai/tools/` -- Code analysis tools provided to AI agents. Tool execution involves file I/O. Inefficient tool implementations slow down the entire agentic loop.
- `src/generators/documentation/codebaseMapGenerator.ts` -- Generates a structural map of the codebase. For large repos, this can be slow due to directory traversal.
- `src/services/quickSync/quickSyncService.ts` -- QuickSync provides a faster alternative to full sync. Understanding its optimizations helps when optimizing other services.
- `src/index.ts` -- CLI startup imports all services eagerly. Startup time is affected by import chain depth.

## Workflow Steps

1. **Profile the operation**: Identify which CLI command is slow. Run with `--verbose` flag and observe timing. Key operations to profile:
   - `context({ action: "init" })` -- File scanning + scaffold generation
   - `context({ action: "fill" })` / `fillSingle` -- Semantic context assembly per scaffold file
   - `ai-context sync` -- File discovery + symlink/reference creation
   - `ai-context report` -- File scanning + frontmatter parsing

2. **Measure file I/O**: FileMapper and glob operations are the most common bottleneck. Check:
   - Are exclude patterns in `globPatterns.ts` covering all irrelevant directories?
   - Is the `glob` package (v10) being called with `{ ignore }` option rather than post-filtering?
   - Are files being read multiple times? (frontmatter parsing reads file headers; fill reads full content)

3. **Analyze context size**: For scaffold fill operations, check:
   - Shared semantic context size returned by `fillScaffoldingTool`
   - Whether repeated `fillSingle` calls rebuild or bypass cached context
   - Whether a narrower `target` or lower `limit` would reduce MCP response size

4. **Check tree-sitter parsing**: `CodebaseAnalyzer` defaults to parsing up to 5000 files. For large repos:
   - Verify language filtering is applied early (only parse files matching requested languages).
   - Check if caching is enabled (`cacheEnabled: true` in options).
   - Consider whether the `useLSP` flag is enabled unnecessarily (LSP adds significant overhead).

5. **Implement the optimization**: Common strategies:
   - **Lazy imports**: Move heavy imports (tree-sitter, AI SDK) to dynamic `import()` inside the functions that need them, reducing startup time.
   - **Parallel processing**: Use `Promise.all()` for independent file operations where the MCP response model still stays bounded.
   - **Streaming**: Use `createReadStream` with readline (already used in `frontMatter.ts` for fast status detection) instead of full `fs.readFile()` where only headers are needed.
   - **Caching**: Cache parsed frontmatter, file maps, and semantic analysis results between commands.

6. **Verify with benchmarks**: Run before/after on a representative large repository. Measure wall-clock time and peak memory usage.

## Best Practices

- **Profile before optimizing**: Use `--verbose` output and `console.time()`/`console.timeEnd()` to identify actual bottlenecks rather than guessing.
- **Respect the `maxFiles` limit**: `CodebaseAnalyzer` has a 5000-file cap for good reason. Do not remove it; instead, improve filtering so the right 5000 files are analyzed.
- **Use streaming frontmatter reads**: `src/utils/frontMatter.ts` already has optimized first-line reading for fast status detection. Extend this pattern for any operation that only needs file metadata.
- **Token-efficient context**: When building context for LLM calls, use `serializeStructureForAI()` which produces a compact representation rather than sending full file contents.
- **Avoid synchronous fs calls**: The codebase uses `fs-extra` (async) consistently. Never introduce synchronous file operations (`fs.readFileSync`, etc.) as they block the event loop and degrade perceived CLI responsiveness.

## Common Pitfalls

- **Premature parallelization of scaffold work**: Running too many semantic-analysis tasks in parallel can spike memory and produce oversized MCP payloads. Use a concurrency limiter rather than unbounded `Promise.all()`.
- **Tree-sitter memory leaks**: Tree-sitter parsers hold native memory. If parsing thousands of files, ensure parsers are reused (not re-created per file) and that parse trees are released after symbol extraction.
- **Glob pattern order matters**: The `glob` package evaluates patterns in order. Put the most selective patterns first to short-circuit directory traversal early.
- **Over-caching stale data**: If implementing caching, include file modification timestamps or git commit hashes as cache keys. Stale caches cause incorrect scaffold content or missing files.
- **Ignoring the QuickSync model**: `QuickSyncService` already implements optimized file discovery. Before building custom optimizations for other services, study its approach to reuse patterns.
