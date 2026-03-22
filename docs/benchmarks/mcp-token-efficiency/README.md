# MCP Token Efficiency Report

Generated: 2026-03-22T06:10:43.006Z

## Scenario Summary

| Scenario | Current MCP (legacy) | Optimized MCP (compact) | Non-MCP fixture | Compact vs legacy | Compact vs non-MCP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Planning | 3508 | 311 | 523 | -91.1% | -40.5% |
| Workflow loop | 3464 | 366 | 441 | -89.4% | -17.0% |

## Tool Surface

| Profile | Registered tools | Notes |
| --- | ---: | --- |
| `standalone` | 10 | Full onboarding, planning, sync, workflow, and skills surface |
| `planning` | 9 | Drops `sync` but keeps planning and orchestration tools |
| `execution` | 6 | Keeps the hot path: workflow tools, `plan`, and `explore` |

## Payload Benchmarks

| Payload | Mode | Bytes | Chars | Est. tokens | Delta vs legacy |
| --- | --- | ---: | ---: | ---: | ---: |
| getCodebaseMap | compact | 388 | 388 | 97 | -31.2% |
| scaffoldPlan | compact | 853 | 853 | 214 | -93.6% |
| getCodebaseMap | legacy | 563 | 563 | 141 | baseline |
| scaffoldPlan | legacy | 13472 | 13466 | 3367 | baseline |
| workflow-init | compact | 510 | 510 | 128 | -90.1% |
| workflow-status | compact | 616 | 616 | 154 | -84.8% |
| workflow-advance | compact | 335 | 335 | 84 | -92.8% |
| workflow-status | notModified | 61 | 61 | 16 | -98.4% |
| workflow-init | legacy | 5149 | 5147 | 1287 | baseline |
| workflow-status | legacy | 4044 | 4044 | 1011 | baseline |
| workflow-advance | legacy | 4664 | 4664 | 1166 | baseline |

## Raw Payload Examples

- Compact and legacy payload examples are written to `docs/benchmarks/mcp-token-efficiency/`.
- `notModified-workflow-status.json` captures the cached polling path when a client sends the current `revision`.
- The non-MCP baseline remains a checked-in prompt fixture so the comparison stays repeatable without external tooling.