# MCP Tools Reference

dotcontext now exposes a compact-first MCP contract. The default path is optimized for repeated workflow execution, while verbose and legacy payloads remain available when a client needs more teaching text or backward-compatible structure.

## Server Profiles

Select the server surface with `DOTCONTEXT_MCP_PROFILE`.

| Profile | Tools | Use case |
| --- | --- | --- |
| `standalone` | `explore`, `context`, workflow tools, `sync`, `plan`, `agent`, `skill` | Broad discovery and onboarding |
| `planning` | `standalone` minus `sync` | Planning and context generation |
| `execution` | `explore`, workflow tools, `plan` | Tight PREVC execution loops |

Aliases:

- `codex` -> `execution`
- `claude-code` -> `execution`

Example:

```bash
DOTCONTEXT_MCP_PROFILE=execution npx dotcontext mcp
```

## Compact vs Verbose

Default behavior is compact:

- JSON is serialized without pretty-print indentation
- Workflow handlers return state-first payloads with `bundleId`, `revision`, and the next action
- Planning helpers keep inline content optional instead of returning full plan bodies by default

Verbose/help behavior is opt-in:

- `verbose`
- `includeGuidance`
- `includeLegacy`
- `includeOrchestration` where supported
- `includeContent` for planning/context payloads

## Workflow Surface

| Tool | Compact default | Opt-in expansions |
| --- | --- | --- |
| `workflow-init` | `currentPhase`, `settings`, `startWith`, `bundleId`, `revision` | `verbose`, `includeGuidance`, `includeLegacy` |
| `workflow-status` | compact phase summary, active agents, gate summary, `bundleId`, `revision` | `verbose`, `includeGuidance`, `includeLegacy`, `includeOrchestration` |
| `workflow-status` polling | `revision` + `notModified: true` when unchanged | `includeOrchestration` if a client wants the phase bundle |
| `workflow-advance` | next phase state, `startWith`, `bundleId`, `revision` | `verbose`, `includeGuidance`, `includeLegacy` |
| `workflow-manage` | state deltas and revisions | `verbose`, `includeGuidance`, `includeLegacy` |

## Planning Surface

`context` still supports scaffolding and planning, but planning-heavy payloads are leaner by default.

Key flags:

- `verbose`
- `includeGuidance`
- `includeContent`

Current planning behavior:

- `getMap` defaults to `section: "architecture"` and treats `section: "all"` as explicit opt-in
- `scaffoldPlan` is compact by default
- `fillSingle` and `fill` use narrower context types for plans and batch fills
- Planning responses expose reusable `contextResource` references instead of forcing inline blobs

## Help Resources

Long guidance now lives in resources instead of riding in every workflow response.

Available resource topics:

- `workflow://guide/overview`
- `workflow://guide/profiles`
- `workflow://guide/workflow-init`
- `workflow://guide/workflow-status`
- `workflow://guide/workflow-advance`
- `workflow://guide/workflow-manage`

Related codebase context resources:

- `context://codebase/documentation`
- `context://codebase/playbook`
- `context://codebase/plan`
- `context://codebase/compact`

## Recommended Defaults

- Use `standalone` when the client is still discovering dotcontext or needs the full tool catalog.
- Use `planning` when the session is primarily about context generation and plan authoring.
- Use `execution` for Codex, Claude Code, or any loop that repeatedly calls `workflow-status`, `plan`, and `workflow-advance`.

## Benchmarking

Run the benchmark harness with:

```bash
npm run build
node scripts/benchmark-mcp-efficiency.js
```

Current snapshot:

| Scenario | Compact est. tokens | Compatibility est. tokens | Non-MCP fixture | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Planning flow | 311 | 3508 | 523 | -91.1% vs compatibility / -40.5% vs non-MCP |
| Workflow loop | 366 | 3464 | 441 | -89.4% vs compatibility / -17.0% vs non-MCP |

Full benchmark notes, fixture definitions, and raw payload examples live in [docs/benchmarks/mcp-token-efficiency/README.md](../../../docs/benchmarks/mcp-token-efficiency/README.md). The cached polling path is captured in [docs/benchmarks/mcp-token-efficiency/notModified-workflow-status.json](../../../docs/benchmarks/mcp-token-efficiency/notModified-workflow-status.json).
