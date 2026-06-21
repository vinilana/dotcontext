# Dotcontext Repository Guide

This repository is the source for the dotcontext runtime and its operator/adaptor surfaces.

Current product shape:

```text
cli -> harness <- mcp
              <- integrations (host hooks / extensions)
```

## Source of Truth

Start here:

- `README.md` for product description and install guidance
- [dotcontext.dev](https://dotcontext.dev) (`docs/`) for usage guidance
- `ARCHITECTURE.md` for runtime and boundary diagrams
- `CHANGELOG.md` for release notes

## Working Boundaries

- `src/cli` contains operator-facing exports and CLI-oriented services (sync, MCP install, hook install, admin)
- `src/harness` contains reusable runtime exports — domain rules, application services, and adapters
- `src/mcp` contains the MCP transport boundary — server, gateway handlers, and schemas
- `src/integrations` contains host hook adapters for Claude Code, Codex CLI, and Pi

Do not move domain behavior into `cli`, `mcp`, or `integrations` if it belongs in `harness`. Integrations call the harness only — they never import `cli` or `mcp`.

## Current Priorities

The repository now supports:

- durable harness sessions
- sensors and backpressure
- task contracts and handoffs
- policy documents and policy evaluation
- replay and failure datasets
- host hook install for Claude Code, Codex CLI, and Pi
- local packaging for `cli`, `harness`, `mcp`, `integrations`, and `pi`

## Validation Commands

```bash
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

## Documentation Hygiene

When changing any of the following, keep docs in sync:

- product positioning
- MCP install behavior
- hook install behavior
- package boundaries
- workflow commands
- release/versioning guidance

At minimum, review:

- `README.md`
- `docs/src/content/docs/` (published at [dotcontext.dev](https://dotcontext.dev))
- `ARCHITECTURE.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
