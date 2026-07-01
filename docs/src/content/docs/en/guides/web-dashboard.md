---
title: Web dashboard
description: Run the local dotcontext browser dashboard, use Vite during development, and package the built UI with the CLI.
sidebar:
  order: 8
---

The dotcontext web dashboard is a local, read-only browser UI over the harness runtime. It shows docs, skills, agents, sessions, traces, artifacts, checkpoints, linked plans, and PREVC workflow status while CLI, MCP, or hook sessions are running.

## Run from the installed CLI

```bash
npx -y @dotcontext/cli@latest web
```

By default, `dotcontext web` binds to `127.0.0.1:4317`, serves the bundled React UI, starts the REST + SSE API, and opens the browser. Use `--no-open` when running in a terminal-only environment.

```bash
dotcontext web --no-open
dotcontext web --port 4399 --no-open
```

::: caution
The dashboard has no authentication. It binds to `127.0.0.1` by default. Only pass `--host` for a trusted local network.
:::

## Development mode

When working in the dotcontext repository, use Vite for the UI and the source CLI for the API:

```bash
npm install
npm --prefix web-ui install
npm run dev:web
```

This starts:

| Process | URL | Purpose |
| --- | --- | --- |
| `dotcontext web --api-only --no-open` | `http://127.0.0.1:4317` | REST + SSE API |
| Vite | `http://localhost:5173` | React UI with HMR |

Open the Vite URL. Vite proxies `/api/*` and `/api/events` to the API process.

To run the processes separately:

```bash
npm run dev:web-api
npm run dev:web-ui
```

If the API runs on a different port:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4399 npm run dev:web-ui
```

## Local production build

Build the static UI and serve it through the compiled CLI:

```bash
npm run build:web-ui
npm run build
node dist/index.js web --no-open
```

Package validation also rebuilds and copies `web-ui/dist` into the CLI bundle:

```bash
npm run build:packages
npm run smoke:packages
```

`smoke:packages` verifies that `.release/packages/cli/web-ui/dist/index.html` exists, so the installed `@dotcontext/cli` package can run `dotcontext web` without the source `web-ui/` project.

## API surface

The dashboard API is mounted under `/api`:

| Area | Routes |
| --- | --- |
| Docs | `/api/docs`, `/api/docs/:name` |
| Skills | `/api/skills`, `/api/skills/:slug` |
| Agents | `/api/agents`, `/api/agents/:type` |
| Sessions | `/api/sessions`, `/api/sessions/:id`, `/traces`, `/artifacts`, `/checkpoints` |
| Workflow | `/api/workflow/status`, `/guide`, `/plans`, `/plans/:slug`, `/harness` |
| Events | `/api/events` |

`/api/events` is an SSE stream. The UI treats every event as a signal to refetch the current REST data; the event payload is not authoritative state.
