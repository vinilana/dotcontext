---
title: Contributing & development
description: Set up the dotcontext repo, run the four validation commands, keep docs in sync, and find your way around the source.
sidebar:
  order: 2
---

dotcontext is open source, and contributions are welcome — whether that is a bug fix, a new sensor heuristic, an extra MCP tool action, or just improving these docs. This page covers everything you need to work in the repository confidently: cloning and building, the validation commands that gate every change, the documentation hygiene we expect, and a map of where things live.

If you only want to *use* dotcontext, you do not need any of this — start at [Installation](/getting-started/installation/) instead. This page is for working **on** the runtime itself.

:::tip
Read [Architecture](/about/architecture/) first. It explains the `cli -> harness <- mcp` shape and the boundary rules that the codebase enforces, which makes the directory map below much easier to navigate.
:::

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | `>=20.0.0` | The CLI and harness target Node 20+. |
| npm | bundled with Node | The repo uses npm scripts for build, test, and packaging. |
| Git | any recent | For cloning and commits. |

## Clone and install

```bash
git clone https://github.com/vinilana/dotcontext.git
cd dotcontext
npm install
```

`npm install` pulls the full development stack (TypeScript, Jest, the AI SDKs, and the packaging scripts). After it finishes you are ready to build and test.

## Validation commands

Every change must pass the same four commands, in order. They are the contract: if these are green, your change is in good shape. Run them locally before opening a pull request.

```bash
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

Here is what each one does and why it matters.

### `npm run build`

Compiles the TypeScript sources to `dist/` — `dist/cli/`, `dist/harness/`, `dist/mcp/`, and `dist/shared/`, plus their `.d.ts` type definitions. This is the fastest signal: a clean build means types line up and the boundary imports resolve.

### `npm test -- --runInBand`

Runs the Jest test suite **synchronously**. The `--runInBand` flag forces tests to run in a single process rather than in parallel workers — many tests touch the filesystem (sessions, traces, contracts under `.context/runtime/`), so running them in band prevents the flakiness that parallel workers would cause.

:::note
Tests are colocated with the code they cover in `__tests__/` folders, not in a separate top-level test tree. When you add behavior, add or update the test next to it.
:::

### `npm run build:packages`

Builds the three isolated package bundles into `.release/packages/{cli,harness,mcp}` via `scripts/build-package-bundles.js`. This step is what proves the package boundaries actually hold:

- Copies `dist/` into each package root.
- Writes a package-specific `package.json` manifest for each surface — filtered dependencies, `exports`, and `bin` entries.
- Copies shared files (`LICENSE`, `README.md`).
- Generates bin shims for the executables (`dotcontext`, `dotcontext-mcp`).
- Copies the `prompts/` directory (CLI only).

### `npm run smoke:packages`

Runs `scripts/smoke-package-bundles.js` to validate the bundles you just built. It is a structural smoke test, not a runtime one, and it checks:

- Each manifest name matches the expected scope (`@dotcontext/cli`, `@dotcontext/harness`, `@dotcontext/mcp`) and the version matches root.
- The main entry exists (`dist/cli/index.js`, `dist/harness/index.js`, `dist/mcp/index.js`) and so do the `.d.ts` type files.
- The expected exports are present in each compiled index.
- Bin entries and local shims exist for CLI and MCP.
- **No legacy `dist/services/` folder** ships — this enforces the architecture (domain behavior must not leak into the transport surfaces).
- `README.md` and `LICENSE` are included; the `prompts/` directory is present for CLI.

:::caution
The "no `dist/services/`" check is intentional. If a package smoke test fails on it, you have probably moved domain behavior into `cli` or `mcp` instead of `harness`. See [Architecture](/about/architecture/) for the boundary rules.
:::

## The three packages

The monorepo publishes three independent packages off one shared version. Understanding which surface owns what keeps your change in the right place.

| Package | Role | Bin |
| --- | --- | --- |
| `@dotcontext/cli` | Operator-facing sync, import/export, MCP setup, reports, admin workflows. | `dotcontext` |
| `@dotcontext/harness` | Reusable runtime: domain rules, sessions, policies, sensors, contracts, replay, workflow state. | — |
| `@dotcontext/mcp` | Model Context Protocol transport adapter and installer for AI tools. | `dotcontext-mcp` |

All three are versioned together so they stay compatible. For the full export and packaging detail, see [Packaging & versioning](/reference/configuration/).

:::note
The root `package.json` only exposes the `dotcontext` bin. The `dotcontext-mcp` binary appears in the `.release/packages/mcp/` manifest produced by `build:packages` — the root CLI starts the server with `dotcontext mcp`, not a separate binary.
:::

## Documentation hygiene

Docs are part of the change, not an afterthought. When you touch any of the following, update the docs in the same pull request:

- product positioning
- MCP install behavior
- package boundaries
- workflow commands
- release / versioning guidance

At minimum, review these files in the repo when your change affects them:

| File | Covers |
| --- | --- |
| `README.md` | Product description and install guidance. |
| `website/src/content/docs/` | Usage flows (published at [dotcontext.dev](https://dotcontext.dev)). |
| `ARCHITECTURE.md` | Runtime and boundary diagrams. |
| `CONTRIBUTING.md` | Contributor process. |
| `CHANGELOG.md` | Release notes. |

If your change is user-visible, it almost certainly needs a matching update on this documentation site too — and remember that pages are bilingual: every English page under `src/content/docs/en/` has a Brazilian-Portuguese mirror under `src/content/docs/pt-br/` with the same structure.

## Where to start in the repo

The source is organized around the `cli -> harness <- mcp` shape. Keep domain behavior in the harness — do not move it into `cli` or `mcp`.

| Path | What lives here |
| --- | --- |
| `src/cli` | Operator-facing exports and CLI-oriented services. |
| `src/harness` | Reusable runtime exports (domain rules, sessions, sensors, policies, contracts, replay). |
| `src/mcp` | The MCP transport boundary. |
| `src/integrations` | Host hook adapters and install helpers (Claude Code, Codex, Pi). |
| `src/shared/fs/pathHelpers.ts` | Centralized path resolution — the single source of truth for `.context/` paths. |
| `scripts/build-package-bundles.js` | Package bundling. |
| `scripts/smoke-package-bundles.js` | Package smoke tests. |

A good first read is `ARCHITECTURE.md` for the boundary diagrams, then `README.md` for the product framing, then the [documentation site](/getting-started/quickstart/) for the usage flows you are about to change.

## Branching and commits

Work on a branch — do not commit directly to `main`. Keep commits focused, write clear messages, and make sure the four validation commands pass before you push.

Open your pull request against `main` on [GitHub](https://github.com/vinilana/dotcontext). Describe what changed, why, and which validation commands you ran.

## Next steps

- [Architecture](/about/architecture/) — the boundaries your change must respect.
- [Packaging & versioning](/reference/configuration/) — how the three packages are built and released.
- [CLI commands](/reference/cli-commands/) — the operator surface you may be extending.
- [MCP tools](/reference/mcp-tools/) — the tool actions exposed to AI clients.
