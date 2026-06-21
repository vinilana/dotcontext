# Dotcontext Agent Instructions

This repository exposes one runtime through four surfaces:

```text
cli -> harness <- mcp
              <- integrations (host hooks / extensions)
```

Agents working in this repo should preserve that separation.

## Architectural Intent

- `cli` is the operator interface
- `harness` is the reusable execution runtime
- `mcp` is the transport adapter for AI tools
- `integrations` is the host hook and extension layer (Claude Code, Codex CLI, Pi)

If a change affects reusable execution logic, prefer `src/harness/application`.
If a change affects reusable domain rules, prefer `src/harness/domain`.
If a change affects protocol shape or request handling, prefer `src/mcp/gateway`.
If a change affects user-facing commands or installation flows, prefer `src/cli`.
If a change affects host event mapping or hook templates, prefer `src/integrations`.
Do not add new code under `src/services`; that directory is not part of the target architecture.

## Repository References

- `README.md` explains what dotcontext is and why it exists
- [dotcontext.dev](https://dotcontext.dev) (source in `docs/`) explains how to use it
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

- `src/cli/services/mcpInstallService.ts`
- `src/cli/services/mcpInstallService.test.ts`
- `README.md`
- `docs/src/content/docs/` (published at [dotcontext.dev](https://dotcontext.dev))
- `CHANGELOG.md`

Documentation must reflect the actual config written by the installer.

## Hook Install Changes

If you touch `hook install`, keep these aligned:

- `src/cli/services/hookInstallService.ts`
- `src/cli/services/hookDispatchService.ts`
- `src/cli/services/__tests__/hookInstallService.test.ts`
- `src/integrations/claude-code/`, `src/integrations/codex/`, `src/integrations/pi-dev/`
- `README.md`
- `docs/src/content/docs/` (installation and hooks guides)
- `CHANGELOG.md`

Documentation must reflect the actual config written by the hook installer and the Pi extension install path.
