---
type: doc
name: web-interface-architecture
description: Phase 1 architecture decisions and API/SSE contract for the new src/web harness adapter (dotcontext web dashboard)
category: architecture
generated: "2026-06-30"
status: filled
scaffoldVersion: "2.0.0"
---

# Web Interface Architecture (Phase 1)

This document is the Phase 1 deliverable for the [Web Interface plan](../plans/web-interface.md): it defines the `src/web` boundary contract and records the two architecture decisions (ADRs) required before implementation starts in Phase 3/4. No implementation code is introduced by this document.

## 1. Boundary Recap

`src/web` becomes a fifth boundary alongside `cli`, `harness`, `mcp`, and `integrations`:

```text
cli -> harness <- mcp
        ^
        |
       web
```

- `src/web` depends only on `src/harness` (application services), exactly like `src/mcp`.
- `src/web` never imports from `src/cli` or `src/mcp`.
- `src/web` introduces no new domain logic — every endpoint is a thin transport wrapper over an existing (or, where noted below, a small new) `src/harness/application` service.
- `web-ui/` (the React + Vite SPA, see ADR-2) is a separate npm project; it talks to `src/web` only over HTTP/SSE, never by importing TypeScript from `src/harness` or `src/web` directly.

## 2. ADR-1: Server Runtime

**Decision:** Plain `node:http` plus a small hand-written router living in `src/web` (e.g. `src/web/server.ts`, `src/web/router.ts`). No Express, Fastify, or similar framework dependency.

**Status:** Accepted (recorded on the plan via `plan.recordDecision`).

**Context:**
- The repository has zero HTTP framework dependencies today (see `package.json`); `src/mcp` is built directly on `@modelcontextprotocol/sdk` transport primitives without an extra web framework on top.
- `CLAUDE.md`/`AGENTS.md` favor keeping `harness` reusable and adapters thin; a full framework would add a large dependency surface for what is a handful of read-mostly JSON routes plus one SSE stream.
- The route set is small and stable (see contract in §4): exact-path and single-param routes (`/api/sessions/:id`, `/api/sessions/:id/traces`, etc.), which a ~100-150 line router can match without a framework.

**Decision detail:**
- `src/web/server.ts` exports `startWebServer(options: { repoPath: string; port?: number; host?: string })` that creates an `http.Server`, binds to `127.0.0.1` by default (never a remote interface unless explicitly overridden — see Risk Assessment in the plan), and delegates requests to the router.
- The router matches `(method, pathname)` against a small static table of route definitions (path template + handler), extracting `:param` segments itself; this mirrors the existing `src/mcp/gateway/*.ts` pattern of one handler module per resource area (`docs.ts`, `skills.ts`, `agents.ts`, `sessions.ts`, `workflow.ts`, `events.ts`).
- JSON responses use one envelope for the whole API: `{ "data": <payload> }` on success, `{ "error": { "message": string } }` with a non-2xx status on failure — this is a new, consistent envelope (existing harness services return ad hoc `{ success, ... }` shapes meant for MCP tool results, not for an HTTP API).
- Static asset serving (the built `web-ui/dist`) is a second, smaller responsibility of the same server: any request that doesn't match an `/api/*` route falls through to a static file handler, enabling SPA client-side routing via a catch-all `index.html` fallback.
- The runtime watcher (§4.6) needs a recursive, debounced file watcher across `.context/runtime/**`; plain `fs.watch({ recursive: true })` is not reliably available on Linux across supported Node versions, so `chokidar` is added as the one new dependency for `src/web` (devDependency of the watcher, declared in the root `package.json` since `src/web` ships inside `@dotcontext/cli`/`@dotcontext/harness`, not as a separate package).

**Alternatives considered:**
- *Express* — most familiar, but pulls in a sizeable dependency tree (body-parser, etc.) for a route count this small, and the project has otherwise stayed dependency-light (see `package.json`).
- *Fastify* — faster and schema-validated, but again a new dependency + plugin ecosystem disproportionate to ~10 routes, and would push validation logic into `src/web` that should arguably stay in `src/harness` if it ever needs to exist.
- *Plain `node:http` with no router abstraction at all* — rejected only because hand-matching ~10 paths inline in one file would get unreadable; a ~100 line internal router keeps it readable without adding a dependency.

## 3. ADR-2: Frontend Project Location

**Decision:** A sibling `web-ui/` directory at the repository root, with its own `package.json`, `vite.config.ts`, and `node_modules` — not `src/web/ui`.

**Status:** Accepted (recorded on the plan via `plan.recordDecision`).

**Context:**
- The repository already has a precedent for this: `docs/` is a fully independent Astro + Starlight project at the repo root (`docs/package.json`, own `astro` toolchain), not nested inside `src/`.
- The root `tsconfig.json`/`jest.config.js`/`npm run build` pipeline targets Node/CLI output (`tsc` only); Vite/React needs a browser-targeted `tsconfig`, JSX support, and a completely different bundler. Nesting it under `src/web/ui` risks it being picked up by `tsc`'s root build or `npm run build:packages`' package-bundle step, which currently assumes everything under `src/` compiles with the single root `tsc` config.
- Keeping `web-ui/` self-contained means its dependencies (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, a markdown renderer) never enter the dependency tree of the published `@dotcontext/cli`/`@dotcontext/harness`/`@dotcontext/mcp` packages — only the *build output* (`web-ui/dist`) is consumed at runtime, copied/served by `src/web`.

**Decision detail:**
- `web-ui/` ships a `dev` script (Vite dev server with a proxy to the `src/web` API port) and a `build` script (`vite build` → `web-ui/dist`).
- A new root script, `npm run build:web-ui` (`cd web-ui && npm install && npm run build`), is added in Phase 4 so `web-ui/dist` exists before `src/web`'s static handler needs it; it is not part of `npm run build` (the Node/CLI build) to avoid forcing every contributor to install browser tooling.
- `src/web`'s static file handler reads from `web-ui/dist` at runtime; it does not import any `web-ui` TypeScript source. The `dotcontext web` CLI command (Phase 3) documents that `web-ui/dist` must exist (built via `npm run build:web-ui`) before `dotcontext web` serves the production build; a `--dev` flag (or equivalent) instead proxies to a separately-running `vite dev` process during development.
- Packaging: `web-ui/dist` is treated as a build artifact bundled into the `@dotcontext/cli` package's `files` (similar to how `dist/**/*` is already listed in `package.json`), resolved during Phase 6 alongside the "future `@dotcontext/web` package" follow-up already tracked on the plan.

**Alternatives considered:**
- *`src/web/ui` (nested TypeScript source)* — rejected: would require either a second `tsconfig` scoped to that subtree (fragile, easy to misconfigure) or polluting the root `tsconfig`/`jest.config.js` with browser globals and JSX, both of which add real risk to the existing single-`tsc`-build pipeline described in `ARCHITECTURE.md`.
- *A full separate package/repo for `web-ui`* — rejected for now as premature; the plan's own follow-up list already flags "bundled in `@dotcontext/cli` vs. a future `@dotcontext/web` package" as an open question for Phase 6, so the simplest viable structure (sibling directory, not yet its own publishable package) is chosen for Phase 1-4.

## 4. API + SSE Contract

All routes are mounted under `/api`. Every handler is implemented in `src/web/routes/*.ts` and calls into the listed `src/harness/application` service — no new business logic, only request parsing + response shaping. Response envelope: `{ "data": <payload> }` (200) or `{ "error": { "message": string } }` (4xx/5xx).

### 4.1 Docs — `GET /api/docs`, `GET /api/docs/:name`

| Route | Harness service call | Response `data` |
| --- | --- | --- |
| `GET /api/docs` | **New, small** `HarnessDocsService.list()` (Phase 3 addition, mirrors `HarnessSkillsService.list()`; no equivalent currently exists for `.context/docs/*.md`) | `Array<{ name: string; title: string; description?: string; category?: string; status: 'filled' \| 'unfilled' }>` |
| `GET /api/docs/:name` | `HarnessDocsService.getContent(name)` | `{ name: string; frontMatter: object; content: string }` |

This is the one place Phase 1 identifies a genuinely new (but tiny, read-only) service: today only `skillsService.list()`/`getContent()` exist for skills; docs have no equivalent listing service. `HarnessDocsService` should be added under `src/harness/application/docs/` in Phase 3, following the exact shape of `HarnessSkillsService`.

### 4.2 Skills — `GET /api/skills`, `GET /api/skills/:slug`

| Route | Harness service call | Response `data` |
| --- | --- | --- |
| `GET /api/skills?content=true` | `HarnessSkillActionService.execute({ action: 'list', includeContent })` (`HarnessSkillsService.list`) | `{ success, skills: Array<{ slug, name, description, phases, isBuiltIn, content? }> }` |
| `GET /api/skills/:slug` | `HarnessSkillActionService.execute({ action: 'getContent', skillSlug })` | Skill content payload |

### 4.3 Agents — `GET /api/agents`, `GET /api/agents/:type`

| Route | Harness service call | Response `data` |
| --- | --- | --- |
| `GET /api/agents` | `HarnessAgentActionService.execute({ action: 'discover' })` | `{ success, totalAgents, builtInCount, customCount, agents: { builtIn, custom } }` |
| `GET /api/agents/:type` | `HarnessAgentActionService.execute({ action: 'getInfo', agentType })` + `execute({ action: 'getDocs', agent })` | `{ info, docs }` |

### 4.4 Sessions — `GET /api/sessions`, `GET /api/sessions/:id`, `.../traces`, `.../artifacts`, `.../checkpoints`

Backed directly by `HarnessRuntimeStateService` (constructed once per `src/web` process with `{ repoPath }`):

| Route | Harness service call | Response `data` |
| --- | --- | --- |
| `GET /api/sessions` | `runtimeStateService.listSessions()` | `HarnessSessionRecord[]` |
| `GET /api/sessions/:id` | `runtimeStateService.getSession(id)` | `HarnessSessionRecord` |
| `GET /api/sessions/:id/traces` | `runtimeStateService.listTraces(id)` | `HarnessTraceRecord[]` |
| `GET /api/sessions/:id/artifacts` | `runtimeStateService.listArtifacts(id)` | `HarnessArtifactRecord[]` |
| `GET /api/sessions/:id/checkpoints` | `runtimeStateService.listCheckpoints(id)` | `HarnessSessionCheckpoint[]` |

These are read-only in Phase 1-5; no write routes (create/checkpoint/append) are exposed over HTTP for the initial dashboard scope.

### 4.5 Workflow — `GET /api/workflow/status`, `GET /api/workflow/guide`, `GET /api/workflow/plans`, `GET /api/workflow/plans/:slug`, `GET /api/workflow/harness`

| Route | Harness service call | Response `data` |
| --- | --- | --- |
| `GET /api/workflow/status` | `WorkflowService.getStatus()` + `WorkflowService.getSummary()` | `{ status: PrevcStatus; summary: WorkflowSummary }` |
| `GET /api/workflow/guide` | `WorkflowGuideService.guide({ intent: 'session_start' })` | `WorkflowGuideResult` (phase, next steps, recommended skills) |
| `GET /api/workflow/plans` | `HarnessPlansService.getLinked()` | `{ success, plans: { active, completed } }` |
| `GET /api/workflow/plans/:slug` | `HarnessPlansService.getDetails(slug)` | Linked plan phases/steps/decisions |
| `GET /api/workflow/harness` | `HarnessSessionFacade.getHarnessStatus(workflowName)` | `WorkflowHarnessStatus` (binding, session, sensor runs, task contracts, handoffs, completion check) — this is the primary feed for the "current harness session" panel called out in the plan's success signal |

### 4.6 Live Updates — `GET /api/events` (SSE)

- `text/event-stream` response; on connect, immediately emits a `hello` event with the current server timestamp.
- A `chokidar` watcher (see ADR-1) observes `.context/runtime/**` (sessions, workflows, contracts, evaluations) with `awaitWriteFinish` debouncing (~300ms) and emits a `runtime-change` event per debounced batch: `{ "paths": string[] }` (repo-relative paths that changed).
- The payload is intentionally coarse — it tells the client *something* under `.context/runtime` changed, not which specific resource. Per the plan's risk mitigation, the frontend must treat any event (and reconnect) as "refetch the active view's REST data," never trust the SSE payload as authoritative state. This keeps `src/web` from having to reconstruct fine-grained diffs.
- One watcher instance is shared across all connected SSE clients; each client gets its own `http.ServerResponse` kept open and written to, cleaned up on `close`.

### 4.7 Error & Security Notes

- All routes are `GET` only in this phase (read-only dashboard). Any future write route (e.g. plan approval) must go through `HarnessPolicyService.authorize(...)` exactly like the MCP gateway does, and is out of scope for Phases 3-4 unless explicitly added back into this contract.
- Default bind address is `127.0.0.1`; binding elsewhere requires an explicit `--host` flag and should log a warning, per the plan's risk assessment ("no auth, localhost-only" is the default security posture).
