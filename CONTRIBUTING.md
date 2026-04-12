# Contributing to dotcontext

Dotcontext is now organized around an explicit runtime split:

```text
cli -> harness <- mcp
```

If you change behavior, keep that boundary intact:

- `cli` is the operator-facing surface
- `harness` is the reusable runtime/domain layer
- `mcp` is the transport adapter over the harness

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/dotcontext.git
cd dotcontext
npm install
npm run build
npm test -- --runInBand
```

Useful commands:

```bash
npm run dev
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

## Contribution Expectations

1. Create your branch from `main`.
2. Keep the change scoped. Do not mix refactors, product changes, and release edits in one PR unless they are tightly coupled.
3. Add or update tests when behavior changes.
4. Update docs when commands, package surfaces, workflows, or MCP install behavior change.
5. Run `npm run build` and `npm test -- --runInBand` before opening a PR.
6. If the change affects packaging, also run `npm run build:packages` and `npm run smoke:packages`.

## Documentation Expectations

The public docs that matter most are:

- `README.md` for product positioning and install guidance
- `docs/GUIDE.md` for usage guidance
- `ARCHITECTURE.md` for runtime and boundary explanations
- `CHANGELOG.md` for release notes

Contributor and agent-facing instructions live in:

- `CONTRIBUTING.md`
- `CLAUDE.md`
- `AGENTS.md`

If you update one of these areas, check the adjacent docs for drift.

## MCP Install Changes

If you change `mcp:install`, update all of the following together:

- `README.md`
- `docs/GUIDE.md`
- `CHANGELOG.md`
- `src/services/cli/mcpInstallService.ts`
- `src/services/cli/mcpInstallService.test.ts`

The installer is the source of truth for supported clients and config formats. Documentation should describe what the installer actually writes, not what we hope clients support.

## Release Expectations

- Do not bump `package.json` version in feature PRs unless the change is explicitly part of release preparation.
- Keep `CHANGELOG.md` aligned with the intended release line.
- For local packaging validation, use:

```bash
npm run release:packages:patch
```

This prepares a local release bundle under `.release/releases/<version>`.

## Pull Requests

A good PR should include:

- a clear problem statement
- the chosen approach
- risks or compatibility notes
- validation performed

When relevant, include file references or screenshots of updated docs.

## Bugs and Issues

Use GitHub issues for bugs and feature requests. A useful bug report includes:

- what you tried
- expected behavior
- actual behavior
- reproduction steps
- environment details

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
