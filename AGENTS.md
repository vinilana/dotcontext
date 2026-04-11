# Dotcontext Agent Instructions

This repository exposes one runtime through three surfaces:

```text
cli -> harness <- mcp
```

Agents working in this repo should preserve that separation.

## Architectural Intent

- `cli` is the operator interface
- `harness` is the reusable execution runtime
- `mcp` is the transport adapter for AI tools

If a change affects reusable execution logic, prefer `src/services/harness`.
If a change affects protocol shape or request handling, prefer `src/services/mcp/gateway`.
If a change affects user-facing commands or installation flows, prefer `src/cli` and `src/services/cli`.

## Repository References

- `README.md` explains what dotcontext is and why it exists
- `docs/GUIDE.md` explains how to use it
- `ARCHITECTURE.md` explains how the harness works
- `CONTRIBUTING.md` explains contributor workflow
- `CHANGELOG.md` tracks release-facing changes

## Expected Validation

For code changes:

```bash
npm run build
npm test -- --runInBand
```

For packaging or release-surface changes:

```bash
npm run build:packages
npm run smoke:packages
```

## MCP Install Changes

If you touch `mcp:install`, keep these aligned:

- `src/services/cli/mcpInstallService.ts`
- `src/services/cli/mcpInstallService.test.ts`
- `README.md`
- `docs/GUIDE.md`
- `CHANGELOG.md`

Documentation must reflect the actual config written by the installer.
