# Contributing to dotcontext

Dotcontext is now organized around an explicit runtime split:

```text
cli -> harness <- mcp
              <- integrations (host hooks / extensions)
```

If you change behavior, keep that boundary intact:

- `cli` is the operator-facing surface
- `harness` is the reusable runtime/domain layer
- `mcp` is the transport adapter over the harness
- `integrations` is the host hook and extension layer (Claude Code, Codex CLI, Pi)

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
- [dotcontext.dev](https://dotcontext.dev) (`docs/`) for usage guidance
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
- `docs/src/content/docs/` (installation, guides, reference)
- `CHANGELOG.md`
- `src/cli/services/mcpInstallService.ts`
- `src/cli/services/__tests__/mcpInstallService.test.ts`

The installer is the source of truth for supported clients and config formats. Documentation should describe what the installer actually writes, not what we hope clients support.

## Hook Install Changes

If you change `hook install`, `hook dispatch`, or `hook uninstall`, update all of the following together:

- `README.md`
- `docs/src/content/docs/` (installation, guides, reference)
- `CHANGELOG.md`
- `src/cli/services/hookInstallService.ts`
- `src/cli/services/hookDispatchService.ts`
- `src/cli/services/__tests__/hookInstallService.test.ts`
- `src/integrations/claude-code/`, `src/integrations/codex/`, `src/integrations/pi-dev/`

Supported hook hosts (v1): `claude-code`, `codex`, `pi`. Pi uses the npm extension `@dotcontext/pi` rather than shell dispatch.

The hook installer is the source of truth for supported hosts and config shapes. Document what the installer writes and what users must do after install (for example, trusting Codex project hooks via `/hooks`).

## Release Expectations

- Do not bump `package.json` version in feature PRs unless the change is explicitly part of release preparation.
- Keep `CHANGELOG.md` aligned with the intended release line.
- Every shipped version needs a `CHANGELOG.md` section headed `## [<version>]` (for example `## [1.2.0] - YYYY-MM-DD`). The Release workflow uses that section for the GitHub Release body.

### Preparing a release locally

Bump the root `package.json` version, update `CHANGELOG.md`, then validate bundles:

```bash
npm run release:packages:patch
```

This runs `build:packages`, `smoke:packages`, and copies bundles to `.release/releases/<version>`.

### Automated release (preferred)

Pushing a tag that matches the root version (for example `v1.2.0` when `package.json` is `1.2.0`) runs [`.github/workflows/release.yml`](./.github/workflows/release.yml). The workflow:

1. Builds and smoke-tests all five bundles.
2. Asserts the tag matches `package.json` and every bundle version under `.release/packages/`.
3. Publishes `@dotcontext/harness`, `@dotcontext/cli`, `@dotcontext/mcp`, `@dotcontext/integrations`, and `@dotcontext/pi` in dependency order using the `NPM_TOKEN` secret.
4. Skips any package version that is already on npm so reruns stay safe.
5. Opens a GitHub Release for the tag with notes from the matching `CHANGELOG.md` section.

`workflow_dispatch` on the same workflow performs the build, smoke, and `npm publish --dry-run` checks only; it does not publish or create a GitHub Release.

Repository setup (maintainers):

- Store an npm **Automation** token with publish access to the `@dotcontext` scope in the `NPM_TOKEN` Actions secret, **or** configure [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers) for each package to trust `vinilana/dotcontext` and this workflow file.
- Prefer Trusted Publishers together with `--provenance` (the workflow enables provenance on tag pushes). If provenance must be disabled temporarily, set job env `NPM_PROVENANCE: '0'`.
- `npm publish --dry-run` does not prove registry auth; rely on the real publish step (or a manual token check) before tagging.

### Manual publish (fallback)

If Actions cannot publish, build locally and publish from each bundle directory in order: `harness`, `cli`, `mcp`, `integrations`, `pi`.

```bash
npm run build:packages
npm run smoke:packages
node scripts/publish-package-bundles.js "$(node -p "require('./package.json').version")"
```

For a one-off manual publish you still need a valid `NODE_AUTH_TOKEN` in the environment. If npm 2FA blocks automation tokens, use a one-time OTP on each `npm publish` as before.

Useful verification commands:

```bash
npm view @dotcontext/cli version
npm view @dotcontext/harness version
npm view @dotcontext/mcp version
npm view @dotcontext/integrations version
npm view @dotcontext/pi version
```

Notes:

- Publish from `.release/packages/<slug>`, not from the repo root.
- `@dotcontext/mcp` is a separately published package. If it is missing from npm, `npx @dotcontext/mcp install` will fail with a registry `404`.
- `@dotcontext/integrations` is for extension authors and host hook mappers; `@dotcontext/pi` is the Pi npm extension package.

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
