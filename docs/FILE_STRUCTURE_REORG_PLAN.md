# File Structure Reorganization Plan

## Decision

`src/services` will not exist in the target architecture.

The repository should read as a hexagonal runtime with clear inbound adapters, core harness modules, outbound adapters, and pure shared utilities:

```text
src/
  bin/
    dotcontext.ts

  cli/
    adapters/in/
    commands/
    services/
    ui/
    index.ts

  mcp/
    adapters/in/
    server/
    gateway/
    logging/
    resources/
    index.ts

  integrations/
    claude-code/
    codex/
    pi-dev/
    shared/
    index.ts

  harness/
    domain/
    application/
    ports/
      in/
      out/
    adapters/
      out/
    index.ts

  shared/
    context/
    fs/
    registry/
    system/
    index.ts
```

The architecture sentence stays:

```text
cli -> harness <- mcp
integrations -> harness
harness -> ports -> outbound adapters
```

## Rules

- New code must not import from `src/services`.
- `src/services` must not be kept as a permanent compatibility folder.
- Existing implementations must move to their owning architectural area.
- Compatibility for published consumers should be handled through package exports, release notes, or a short-lived migration branch, not by keeping `src/services` in the source tree.
- Tests should enforce the boundary after the move.

## Target Mapping

| Current area | Target area |
| --- | --- |
| `src/services/cli` | `src/cli/services` |
| `src/services/mcp` | `src/mcp` |
| `src/services/harness/*ActionService*` | `src/harness/application/actions` |
| `src/services/harness/*Workflow*` | `src/harness/application/workflow` |
| `src/services/harness/*Context*` | `src/harness/application/context` |
| `src/services/harness/*Sync*` | `src/harness/application/exchange` |
| `src/services/harness/runtimeStateService.ts` | `src/harness/adapters/out/runtimeState` |
| `src/services/harness/workflowStateService.ts` | `src/harness/adapters/out/workflowState` |
| `src/services/harness/sensors*` | domain model in `src/harness/domain/sensors`, execution in `src/harness/application`, shell adapters in `src/harness/adapters/out/sensors` |
| `src/services/workflow` | `src/harness/application/workflow` plus pure PREVC pieces in `src/harness/domain/workflow` |
| `src/workflow` | `src/harness/domain/workflow` or `src/harness/application/workflow` depending on dependency direction |
| `src/services/semantic` | `src/harness/adapters/out/semantic` plus shared semantic types in `src/shared/context` |
| `src/services/import` | `src/harness/application/exchange/import` |
| `src/services/export` | `src/harness/application/exchange/export` |
| `src/services/sync` | `src/harness/application/exchange/sync` |
| `src/services/reverseSync` | `src/harness/application/exchange/reverseSync` |
| `src/services/quickSync` | `src/harness/application/exchange/quickSync` |
| `src/services/shared` | `src/shared` |
| `src/generators` | `src/harness/application/context/scaffolding` or `src/harness/application/agents|skills|workflow` |

## Migration Phases

### Phase 1: Freeze Old Path

- Add an architecture test that fails when new non-shim code imports `src/services`.
- Update documentation and contributor guidance to stop naming `src/services` as a valid destination.
- Keep the build green before moving implementation files.

### Phase 2: Move Inbound Adapters

- Move all CLI implementation into `src/cli`.
- Move all MCP implementation into `src/mcp`.
- Keep `src/bin/dotcontext.ts` as the executable entrypoint.
- Ensure CLI and MCP call harness application APIs instead of sharing protocol-specific logic.

### Phase 3: Move Harness Application

- Move transport-neutral action services into `src/harness/application/actions`.
- Move workflow orchestration into `src/harness/application/workflow`.
- Move context use cases into `src/harness/application/context`.
- Move exchange flows into `src/harness/application/exchange`.
- Move agent and skill use cases into `src/harness/application/agents` and `src/harness/application/skills`.

### Phase 4: Move Domain

- Move PREVC phases, roles, gates, policies, contracts, sensors model, and plan invariants into `src/harness/domain`.
- Domain modules must not import CLI, MCP, integrations, filesystem adapters, or shell adapters.

### Phase 5: Move Outbound Adapters

- Move filesystem state stores, git adapters, shell runners, semantic analyzers, cache stores, and sensor runners into `src/harness/adapters/out`.
- Define or refine ports in `src/harness/ports/out` before wiring concrete adapters.

### Phase 6: Move Shared Utilities

- Move pure path, registry, context layout, and system helpers into `src/shared`.
- `src/shared` must not import `src/harness`, `src/cli`, `src/mcp`, or `src/integrations`.

### Phase 7: Delete `src/services`

- Remove all remaining files under `src/services`.
- Remove old tests that only verified legacy paths.
- Update any package scripts, build scripts, smoke tests, and docs still referencing `src/services`.
- Run the full validation suite.

## Validation

Required checks:

```bash
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

Architecture checks should additionally verify:

- `src/services` does not exist.
- `src/harness/domain` imports only domain-safe modules.
- `src/harness/application` does not import `src/cli`, `src/mcp`, or `src/integrations`.
- `src/mcp` does not import CLI modules.
- `src/cli` does not import MCP modules.
- `src/integrations` depends on harness APIs only, not CLI or MCP internals.
- `src/shared` stays dependency-light and does not import application or adapter layers.

## Acceptance Criteria

- A developer can understand the source tree without knowing legacy history.
- There is one obvious place for each responsibility.
- `cli -> harness <- mcp` remains true in code and tests.
- Claude Code, Codex, and pi.dev hook integrations remain host adapters over the same harness runtime.
- No source file lives under `src/services`.
