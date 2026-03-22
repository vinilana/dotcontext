# MCP Token Efficiency

Generated on 2026-03-22 with:

```bash
npm run build
node scripts/benchmark-mcp-efficiency.js
```

This report summarizes the compact-first MCP contract now implemented in this repository. The canonical raw payload examples and machine-readable benchmark summary live in [`docs/benchmarks/mcp-token-efficiency/`](./benchmarks/mcp-token-efficiency/).

## Profiles

| Profile | Tools | Delta vs `standalone` | Recommended use |
| --- | ---: | ---: | --- |
| `standalone` | 10 | 0 | Broad discovery, onboarding, and mixed workflows |
| `planning` | 9 | -1 | Planning-heavy sessions that do not need `sync` |
| `execution` | 6 | -4 | Tight PREVC execution loops with minimal tool tax |

Aliases:

- `codex` -> `execution`
- `claude-code` -> `execution`

## Scenario Summary

| Scenario | Current MCP (legacy) | Optimized MCP (compact) | Non-MCP fixture | Compact vs legacy | Compact vs non-MCP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Planning | 3508 | 311 | 523 | -91.1% | -40.5% |
| Workflow loop | 3464 | 366 | 441 | -89.4% | -17.0% |

Token estimates use a simple `chars / 4` heuristic so the report stays easy to reproduce locally.

## Interpretation

- Planning keeps the MCP advantage: the compact planning path is about 91% smaller than the compatibility payload and about 40% smaller than the checked-in non-MCP planning fixture.
- Workflow execution becomes materially smaller: the compact PREVC loop is about 89% smaller than the compatibility payload and about 17% smaller than the checked-in non-MCP execution fixture.
- The `execution` profile removes four tools from the default surface relative to `standalone`, lowering the static MCP catalog cost before any workflow interaction begins.
- `workflow-status` polling benefits from `revision` and `notModified`, so steady-state status checks no longer resend full orchestration guidance by default.

## Interface Notes

- Server profile selection is controlled by `DOTCONTEXT_MCP_PROFILE`.
- Workflow handlers default to compact responses and expose `verbose`, `includeGuidance`, and `includeLegacy`.
- `workflow-status` also supports `revision`, `notModified`, and `includeOrchestration`.
- `context` supports `verbose`, `includeGuidance`, and `includeContent`.
- Help resources are available at `workflow://guide/{topic}` for:
  - `overview`
  - `profiles`
  - `workflow-init`
  - `workflow-status`
  - `workflow-advance`
  - `workflow-manage`

## Evidence

- Raw payload examples: [`docs/benchmarks/mcp-token-efficiency/`](./benchmarks/mcp-token-efficiency/)
- Machine-readable summary: [`docs/benchmarks/mcp-token-efficiency/summary.json`](./benchmarks/mcp-token-efficiency/summary.json)
