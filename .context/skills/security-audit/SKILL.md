---
type: skill
name: Security Audit
description: Security review checklist for code and infrastructure
skillSlug: security-audit
phases: [R, V]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Security Audit

Security review checklist specific to the `@dotcontext/cli` CLI tool and MCP server.

## When to Use

- Reviewing code that handles API keys or credentials
- Adding a new AI provider integration
- Changing the MCP server's file access or path resolution
- Modifying the export/sync service that writes files
- Evaluating dependencies for vulnerabilities
- Before a release (especially major or minor versions)

## Threat Model

The `@dotcontext/cli` tool has a specific threat surface:

| Asset | Risk | Location |
|-------|------|----------|
| AI provider API keys | Exposure via logs, config files, or provider helpers | `src/services/ai/providerFactory.ts`, env vars |
| File system access | Path traversal, reading outside repo boundaries | `src/services/mcp/gateway/explore.ts`, `readFileTool.ts` |
| MCP server stdio | Command injection via tool parameters | `src/services/mcp/mcpServer.ts` |
| Generated scaffold content | Inclusion of secrets in `.context/` output | `src/services/ai/tools/`, `src/services/autoFill/`, `src/generators/` |
| User repository content | Unintended exposure via exported context | `src/services/export/`, `src/services/sync/` |
| Dependencies | Supply chain vulnerabilities | `package.json` |

## Security Checklist

### API Key Handling

- [ ] API keys are read from environment variables or CLI flags, never hardcoded
- [ ] Provider env access goes through `src/services/ai/providerFactory.ts` helpers
- [ ] Keys are never logged, even in verbose mode
- [ ] Keys are never written to scaffold files or `.context/` output
- [ ] Content sanitization (`src/utils/contentSanitizer.ts`) strips potential secrets from generated content
- [ ] `.env` files are in `.gitignore`

### File System Security

- [ ] File paths are resolved with `path.resolve()` before access
- [ ] Path traversal is prevented: no `../` sequences that escape the repo root
- [ ] `readFileTool.ts` validates paths are within the project boundary
- [ ] MCP explore tool's `read` action bounds access to the repo path
- [ ] Glob patterns in `list` and `search` actions respect exclude patterns
- [ ] Generated files are written only to the configured output directory (`.context/` by default)

### MCP Server Security

- [ ] All tool inputs are validated through Zod schemas before processing
- [ ] `repoPath` parameter is resolved and optionally cached, not used raw
- [ ] Error messages do not expose internal file paths or stack traces to the client
- [ ] Logging goes to `process.stderr`, not `process.stdout` (which is the MCP transport)
- [ ] No shell command execution from MCP tool parameters
- [ ] `wrapWithActionLogging` does not log sensitive parameter values

### Content Sanitization

The `contentSanitizer.ts` utility filters generated content:
- [ ] AI-generated content is sanitized before writing to scaffold files
- [ ] Patterns matching API keys, tokens, and passwords are detected
- [ ] File paths in generated docs do not expose absolute system paths
- [ ] MCP tool responses with file content strip sensitive markers

### Dependency Security

- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] `tree-sitter` and `tree-sitter-typescript` are optional dependencies (native binaries)
- [ ] AI SDK packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) are from official sources
- [ ] `@modelcontextprotocol/sdk` is from the official MCP organization
- [ ] No unnecessary runtime dependencies
- [ ] `axios` usage (if any) validates URLs and does not follow arbitrary redirects

### Export/Sync Security

- [ ] `exportRules` and `exportContext` actions do not include API keys in output
- [ ] `reverseSync` validates imported file content before writing to `.context/`
- [ ] Symlink mode in agent export does not create symlinks outside the repo
- [ ] Dry run mode (`dryRun: true`) never writes files

### Git Integration

- [ ] `gitService.ts` does not expose credentials
- [ ] Plan `commitPhase` action stages only files matching the provided patterns
- [ ] Default stage pattern is `[".context/**"]` -- not `["**"]`
- [ ] Commit messages do not contain sensitive information

## Audit Procedure

### Quick Audit (Before PR Merge)

1. Search for hardcoded strings that look like keys:
   - Patterns: `/[A-Za-z0-9]{32,}/`, `/sk-[a-zA-Z0-9]+/`, `/AKIA[A-Z0-9]{16}/`
2. Check that new file I/O uses `path.resolve()` or `path.join()`
3. Verify no `console.log()` in MCP server code paths
4. Check that error responses do not leak internal paths

### Full Audit (Before Release)

1. Run `npm audit` and address any high/critical findings
2. Review all files in `src/services/mcp/gateway/` for input validation
3. Check `src/utils/contentSanitizer.ts` for completeness of sanitization patterns
4. Review `src/services/ai/providerFactory.ts` and any prompt/default helpers for key handling
5. Verify `.gitignore` includes `.env`, `*.pem`, `credentials*`
6. Check that scaffold output in `.context/` does not contain repo-external paths
7. Review `src/services/ai/tools/` for file access boundaries
8. Test with a repo containing sensitive-looking strings to verify sanitization

## Vulnerability Response

If a security issue is found:

1. Do not commit details to public branches
2. Fix in a private branch or direct commit
3. Update `contentSanitizer.ts` if the issue involves generated content
4. Update Zod schemas if the issue involves input validation
5. Add a test case that verifies the fix
6. Document in CHANGELOG under `### Security`
