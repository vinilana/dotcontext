---
type: doc
name: harness-split-foundation
description: Detailed explanation of the first internal split between the CLI boundary and the harness runtime
category: architecture
generated: 2026-04-10
status: filled
scaffoldVersion: "2.0.0"
---

# Harness Split Foundation

This document explains the first structural changes made on branch `feat/harness-split-foundation`, why they matter, and how they move dotcontext toward a real harness engineering product model.

The short version is:

- the codebase now has an explicit `cli` boundary and an explicit `harness` boundary,
- the codebase now also has an explicit `mcp` boundary, so transport is modeled separately from domain,
- CLI-only concerns were moved away from the MCP runtime surface,
- core logic for `agent`, `plan`, `context`, and `skill` is now being extracted into harness services,
- the repository can now generate package bundles for `cli`, `harness`, and `mcp` in `.release/packages`,
- compatibility shims were kept in place so the refactor does not force a big-bang migration,
- and the package now exposes subpath entrypoints that prepare the future split between `dotcontext/cli`, `dotcontext/harness`, and a dedicated MCP adapter surface.

This is a foundation release, not the final split.

## Why This Change Was Needed

Before this refactor, the repository already contained two distinct product shapes:

1. An operator-facing CLI centered on [src/index.ts](/home/aicoders/workspace/ai-coders-context/src/index.ts)
2. A reusable runtime centered on [src/services/mcp/mcpServer.ts](/home/aicoders/workspace/ai-coders-context/src/services/mcp/mcpServer.ts), [src/services/workflow/workflowService.ts](/home/aicoders/workspace/ai-coders-context/src/services/workflow/workflowService.ts), and [src/workflow](/home/aicoders/workspace/ai-coders-context/src/workflow)

Those concerns were still mixed in the import graph and in the mental model of the codebase. In practice, that made the MCP runtime look like a feature of the CLI package instead of a reusable harness layer.

The goal of this iteration was not to rename packages yet. The goal was to make the internal architecture match the intended product direction first.

## What Changed

## 1. New Explicit Entry Boundaries

Three explicit entry modules now exist:

- [src/cli/index.ts](/home/aicoders/workspace/ai-coders-context/src/cli/index.ts)
- [src/harness/index.ts](/home/aicoders/workspace/ai-coders-context/src/harness/index.ts)
- [src/mcp/index.ts](/home/aicoders/workspace/ai-coders-context/src/mcp/index.ts)

These modules create a clear distinction between:

- `cli`: operator-facing commands, local workflows, installation, sync, reporting
- `harness`: reusable runtime primitives and domain services
- `mcp`: Model Context Protocol adapter surface over the harness

This matters because it creates a stable import boundary inside the monolith before turning it into separate packages.

### Current intent of each boundary

| Boundary | Purpose | Examples |
| --- | --- | --- |
| `src/cli` | Thin operator surface | `MCPInstallService`, `StateDetector`, sync/import/export/report flows |
| `src/harness` | Reusable runtime surface | workflow service, harness services, orchestration types |
| `src/mcp` | Protocol adapter surface | `AIContextMCPServer`, `startMCPServer`, gateway handlers |

## 2. `src/index.ts` Now Depends on the Boundaries

The main CLI entrypoint in [src/index.ts](/home/aicoders/workspace/ai-coders-context/src/index.ts) was updated so it no longer reaches directly into as many deep service paths.

Instead, it now imports from:

- [src/cli/index.ts](/home/aicoders/workspace/ai-coders-context/src/cli/index.ts)
- [src/harness/index.ts](/home/aicoders/workspace/ai-coders-context/src/harness/index.ts)
- [src/mcp/index.ts](/home/aicoders/workspace/ai-coders-context/src/mcp/index.ts)

That is a small-looking change with large architectural impact:

- it makes the command layer consume a defined surface instead of internal details,
- it gives future package extraction a natural seam,
- and it reduces the chance that CLI code will keep accumulating harness-domain logic by accident.

## 3. `MCPInstallService` Was Reclassified as CLI Concern

The implementation of `MCPInstallService` was moved semantically to:

- [src/services/cli/mcpInstallService.ts](/home/aicoders/workspace/ai-coders-context/src/services/cli/mcpInstallService.ts)

The old file remains as a compatibility shim:

- [src/services/mcp/mcpInstallService.ts](/home/aicoders/workspace/ai-coders-context/src/services/mcp/mcpInstallService.ts)

### Why this matters

`MCPInstallService` configures editor and tool clients so they can point to the MCP server. That is an operator/install concern, not part of the harness runtime itself.

Leaving it under `services/mcp` suggested the wrong ownership model:

- as if client installation were part of the runtime,
- as if the harness were defined by transport bootstrapping,
- and as if MCP transport and local UX were the same subsystem.

By moving it under `services/cli`, the code now reflects the intended product model:

- `dotcontext/cli` installs and operates
- `dotcontext/harness` runs the harness

## 4. `StateDetector` Was Reclassified as CLI Concern

The implementation of `StateDetector` was moved semantically to:

- [src/services/cli/stateDetector.ts](/home/aicoders/workspace/ai-coders-context/src/services/cli/stateDetector.ts)

The old file remains as a compatibility shim:

- [src/services/state/stateDetector.ts](/home/aicoders/workspace/ai-coders-context/src/services/state/stateDetector.ts)

### Why this matters

`StateDetector` is used to drive local UX and operator workflows:

- detect whether `.context` exists,
- detect whether scaffolding is unfilled,
- detect whether docs are outdated for local prompts and menus.

That is useful, but it is not core harness runtime logic. It is a local operational sensor used by the CLI layer.

Moving it clarifies that not every useful sensor belongs inside the reusable harness core. Some sensors exist only to support local operator experience.

## 5. `services/mcp` Was Tightened Around Adapter Concerns

The file [src/services/mcp/index.ts](/home/aicoders/workspace/ai-coders-context/src/services/mcp/index.ts) was updated to focus on MCP transport adapter exports only.

It no longer re-exports `MCPInstallService`.

The file [src/services/mcp/README.md](/home/aicoders/workspace/ai-coders-context/src/services/mcp/README.md) was also updated to say explicitly that this directory is about the MCP adapter surface, not CLI install/setup concerns and not the center of the domain model.

This is important because the codebase needs a clean answer to the question:

"What is the harness runtime?"  
and separately:  
"What helps a user operate that runtime locally?"  
and also:  
"What protocol exposes that runtime to external agents?"

## 6. Package Subpath Exports Were Added

[package.json](/home/aicoders/workspace/ai-coders-context/package.json) now exposes:

- `"./cli": "./dist/cli/index.js"`
- `"./harness": "./dist/harness/index.js"`
- `"./mcp": "./dist/mcp/index.js"`

The package is still `@dotcontext/cli`, but it now has internal subpath exports that model the future product split and the adapter/runtime separation.

This gives us three benefits:

1. It creates a package-level contract before the package split happens.
2. It lets internal and future external consumers target the right surface intentionally.
3. It reduces migration risk because the conceptual split can stabilize before publish-time restructuring.

## 7. Harness Services Were Introduced

The first transport-agnostic harness services now exist under:

- [src/services/harness/agentsService.ts](/home/aicoders/workspace/ai-coders-context/src/services/harness/agentsService.ts)
- [src/services/harness/plansService.ts](/home/aicoders/workspace/ai-coders-context/src/services/harness/plansService.ts)
- [src/services/harness/contextService.ts](/home/aicoders/workspace/ai-coders-context/src/services/harness/contextService.ts)
- [src/services/harness/skillsService.ts](/home/aicoders/workspace/ai-coders-context/src/services/harness/skillsService.ts)

These services now hold the application logic that was previously embedded directly in MCP gateway handlers.

This means the MCP gateway is starting to behave like a real adapter:

- request comes in,
- gateway translates params,
- harness service executes domain logic,
- gateway formats the response.

That is a major step toward a true harness architecture.

## 8. Shared Execution Helpers Were Neutralized

Non-interactive helpers such as:

- `minimalUI`
- `mockTranslate`
- neutral tool execution context

were moved into [src/services/shared/executionContext.ts](/home/aicoders/workspace/ai-coders-context/src/services/shared/executionContext.ts).

This matters because harness services should not depend on files living under `mcp/gateway`. The domain layer must not import utilities from the adapter layer.

## 9. Boundary Tests Were Added

Two small tests were added:

- [src/cli/index.test.ts](/home/aicoders/workspace/ai-coders-context/src/cli/index.test.ts)
- [src/harness/index.test.ts](/home/aicoders/workspace/ai-coders-context/src/harness/index.test.ts)
- [src/mcp/index.test.ts](/home/aicoders/workspace/ai-coders-context/src/mcp/index.test.ts)

These are not deep behavior tests. They are contract tests for the new public surfaces.

That matters because once a boundary is introduced, it becomes part of the architecture. The tests make sure the intended surfaces stay visible and do not silently collapse back into ad hoc imports.

## 10. Package Bundle Preparation Was Added

The repository can now generate package-shaped bundle directories with:

```bash
npm run build:packages
```

This produces:

- `.release/packages/cli`
- `.release/packages/harness`
- `.release/packages/mcp`

Each bundle now includes the generated `dist/` tree, package metadata, `LICENSE`, package-specific `README.md`, and the CLI bundle also includes `prompts/`.

The MCP adapter also has a dedicated executable entrypoint in [src/mcp/bin.ts](/home/aicoders/workspace/ai-coders-context/src/mcp/bin.ts), which prepares the future `@dotcontext/mcp` package to ship as a real runnable adapter instead of only as a library surface.

This is still a preparation step, not the final multi-package publication workflow, but it closes the gap between architecture and package artifacts.

## 11. Planning and Agent Artifacts Were Added

The transformation is also documented in `.context`:

- [dotcontext-harness-engineering-transformation.md](/home/aicoders/workspace/ai-coders-context/.context/plans/dotcontext-harness-engineering-transformation.md)
- [agents README](/home/aicoders/workspace/ai-coders-context/.context/agents/README.md)

And the following specialized playbooks were added:

- [agent-systems-designer.md](/home/aicoders/workspace/ai-coders-context/.context/agents/agent-systems-designer.md)
- [cli-experience-architect.md](/home/aicoders/workspace/ai-coders-context/.context/agents/cli-experience-architect.md)
- [harness-platform-architect.md](/home/aicoders/workspace/ai-coders-context/.context/agents/harness-platform-architect.md)
- [workflow-orchestration-engineer.md](/home/aicoders/workspace/ai-coders-context/.context/agents/workflow-orchestration-engineer.md)
- [harness-quality-auditor.md](/home/aicoders/workspace/ai-coders-context/.context/agents/harness-quality-auditor.md)
- [migration-release-manager.md](/home/aicoders/workspace/ai-coders-context/.context/agents/migration-release-manager.md)

These are not runtime changes, but they are still part of harness engineering: they formalize the control-plane thinking and make the transformation process itself more machine-readable and repeatable.

## Backward Compatibility Strategy

This iteration intentionally avoided a breaking rewrite.

The old import paths still exist as shims:

- [src/services/mcp/mcpInstallService.ts](/home/aicoders/workspace/ai-coders-context/src/services/mcp/mcpInstallService.ts)
- [src/services/state/stateDetector.ts](/home/aicoders/workspace/ai-coders-context/src/services/state/stateDetector.ts)

That means the code can evolve in stages:

1. Move ownership semantically
2. Preserve old paths temporarily
3. Migrate callers incrementally
4. Remove the shims only when the new boundaries are stable

This is deliberate. A package split done without this intermediate stage would create unnecessary churn and increase regression risk.

## How This Aligns With Harness Engineering

This refactor is aligned with harness engineering in several ways.

## 1. It Separates the Operator Layer From the Runtime Layer

Harness engineering is not just "having an MCP server." It is the discipline of shaping the environment around agents so that runtime behavior, constraints, tooling, and feedback loops are explicit and governable.

The new split reflects that:

- `cli` is the operator-facing outer shell
- `harness` is the reusable runtime substrate
- `mcp` is the transport adapter over that substrate

That is much closer to the real harness mental model than a single mixed command package.

## 2. It Makes the Outer Harness More Explicit

The explicit `cli` boundary represents the local operator harness:

- install flows,
- diagnostics,
- local status detection,
- sync/import/export assistance.

The explicit `harness` boundary represents the reusable runtime harness:

- context scaffolding,
- workflow management,
- orchestration,
- harness services.

The explicit `mcp` boundary represents the transport adapter:

- MCP server lifecycle,
- gateway registration,
- request/response translation.

Harness engineering improves when those two layers are visible and reasoned about separately.

## 3. It Reduces Coupling Between Transport and Domain Logic

One of the goals in the broader plan is to make MCP an adapter, not the product itself.

This change now goes further than the first foundation pass:

- the runtime now has a named harness-facing entrypoint,
- the transport now has a separate MCP-facing entrypoint,
- CLI-side install/setup no longer masquerades as MCP runtime logic,
- and core `agent`, `plan`, `context`, and `skill` logic has started moving into transport-agnostic harness services.

The split is also no longer only conceptual, because the repository can emit package-shaped artifacts for all three boundaries.

That is consistent with harness engineering because a good harness must survive changes in transport, toolchain, and model behavior.

## 4. It Treats Compatibility as a Runtime Constraint, Not an Afterthought

Harness engineering values reliable systems over clever rewrites. The shim approach reflects that mindset.

Instead of forcing immediate breakage:

- old paths still resolve,
- behavior remains stable,
- the architecture can improve incrementally under test,
- and package-shaped outputs can be exercised before changing publication strategy.

This is the same design instinct used in good harnesses generally: constrain change, preserve observability, and avoid destabilizing the system while it is being improved.

## 5. It Improves Agent Readability of the Codebase

For human developers and coding agents alike, explicit boundaries reduce ambiguity.

Before:

- an agent reading `services/mcp` could reasonably infer that install/configuration and runtime were one concern.

After:

- the code states more clearly what belongs to operator UX,
- what belongs to harness runtime,
- and which files are temporary compatibility glue.

That is directly relevant to harness engineering because the harness itself must be legible to the agents that work within it.

## 6. It Supports “Build to Delete” Rather Than Big-Bang Architecture

This version does not pretend to know the final package shape in full detail. Instead, it introduces seams:

- subpath exports,
- explicit boundaries,
- compatibility shims,
- boundary tests,
- and local package bundle generation.

That is a strong harness-engineering move because it keeps the system adaptable as model behavior, transport assumptions, and product priorities evolve.

## What This Version Does Not Do Yet

This foundation is intentionally incomplete. It does not yet:

- extract every remaining gateway into harness services,
- create a fully transport-agnostic harness core beneath every adapter path,
- rename or publish a separate `dotcontext/harness` package,
- rename or publish a separate `dotcontext/mcp` package,
- automate real versioning and publish workflows for the generated package bundles,
- introduce first-class guides, sensors, evaluations, traces, or replay artifacts as runtime concepts,
- or redefine PREVC as one harness strategy among several.

Those remain part of the next phases described in the transformation plan.

## Validation

The code changes associated with this foundation were validated with:

```bash
npm run build
npm test -- --runInBand
npm run build:packages
```

At the time of this stage completion, the full suite passed with 21 test suites and 210 tests, and the package bundle pipeline generated all three bundles successfully.

## Recommended Next Steps

The next technically coherent steps are:

1. Decide which current workflow concepts are permanent harness primitives and which are PREVC-specific policy.
2. Introduce a clearer internal module map for sessions, guides, sensors, plans, agents, and evaluations.
3. Design the real publish/version workflow for `@dotcontext/cli`, `@dotcontext/harness`, and `@dotcontext/mcp`.
4. Keep shrinking the CLI so it orchestrates the harness instead of owning more domain behavior.
5. Remove compatibility shims only after the new import surfaces are stable and internal callers are migrated.

## Summary

This version did not change the external story dramatically yet. What it changed was the architecture’s truthfulness.

The codebase now says, more clearly than before:

- there is a CLI boundary,
- there is a harness boundary,
- there is an MCP adapter boundary,
- installation is not the runtime,
- local status sensing is not the same thing as reusable harness logic,
- adapter helpers do not belong inside the domain layer,
- and the future package split can happen on top of explicit seams instead of ad hoc imports.

That is exactly the right kind of first move for a harness engineering transformation.
