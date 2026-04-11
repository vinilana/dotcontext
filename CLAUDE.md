# Dotcontext Repository Guide

This repository is the source for the dotcontext runtime and its operator/adaptor surfaces.

Current product shape:

```text
cli -> harness <- mcp
```

## Source of Truth

Start here:

- `README.md` for product description and install guidance
- `docs/GUIDE.md` for usage flows
- `ARCHITECTURE.md` for runtime and boundary diagrams
- `CHANGELOG.md` for release notes

## Working Boundaries

- `src/cli` contains operator-facing exports and CLI-oriented services
- `src/harness` contains reusable runtime exports
- `src/mcp` contains the MCP transport boundary
- `src/services/harness` contains transport-agnostic harness logic
- `src/services/mcp/gateway` contains MCP handlers and schemas
- `src/services/workflow` contains PREVC workflow integration

Do not move domain behavior into `cli` or `mcp` if it belongs in `harness`.

## Current Priorities

The repository now supports:

- durable harness sessions
- sensors and backpressure
- task contracts and handoffs
- policy documents and policy evaluation
- replay and failure datasets
- local packaging for `cli`, `harness`, and `mcp`

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
- package boundaries
- workflow commands
- release/versioning guidance

At minimum, review:

- `README.md`
- `docs/GUIDE.md`
- `ARCHITECTURE.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
