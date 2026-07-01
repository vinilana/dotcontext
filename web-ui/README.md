# dotcontext Web UI

React + Vite dashboard for the local `src/web` API. It renders `.context` docs, skills, agents, sessions, traces, artifacts, checkpoints, and PREVC workflow state.

## Development

From the repository root:

```bash
npm install
npm --prefix web-ui install
npm run dev:web
```

This starts:

- `dotcontext web --api-only --no-open` on `http://127.0.0.1:4317`
- Vite on `http://localhost:5173`

Open the Vite URL for HMR. Vite proxies `/api/*` and `/api/events` to the dotcontext web API. If the API port changes, set `VITE_API_PROXY_TARGET`.

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4399 npm run dev:web-ui
```

You can also run the pieces separately:

```bash
npm run dev:web-api
npm run dev:web-ui
```

## Production Build

Build the static SPA:

```bash
npm run build:web-ui
```

Then serve it through the CLI:

```bash
npm run build
node dist/index.js web --no-open
```

For an installed package, run:

```bash
dotcontext web
```

The published `@dotcontext/cli` package includes `web-ui/dist`, so installed users do not need Vite or the `web-ui` source tree.

## Validation

Useful checks while changing the dashboard:

```bash
npm --prefix web-ui run build
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

`build:packages` rebuilds `web-ui/dist` and copies it into `.release/packages/cli/web-ui/dist`. `smoke:packages` verifies that bundle before release.
