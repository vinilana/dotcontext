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
- [dotcontext.dev](https://dotcontext.dev) (`website/`) for usage guidance
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
- `website/src/content/docs/` (installation, guides, reference)
- `CHANGELOG.md`
- `src/cli/services/mcpInstallService.ts`
- `src/cli/services/__tests__/mcpInstallService.test.ts`

The installer is the source of truth for supported clients and config formats. Documentation should describe what the installer actually writes, not what we hope clients support.

## Hook Install Changes

If you change `hook install`, `hook dispatch`, or `hook uninstall`, update all of the following together:

- `README.md`
- `website/src/content/docs/` (installation, guides, reference)
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
- For local packaging validation, use:

```bash
npm run release:packages:patch
```

This prepares local release bundles under `.release/packages/` and `.release/releases/<version>`.

### Publishing split packages

`release:packages:*` does not publish anything to npm. Publishing the split packages is a separate step.

1. Build and validate the package bundles:

```bash
npm run build:packages
npm run smoke:packages
```

2. Publish from the generated bundle directory for each package you intend to release:

```bash
cd .release/packages/cli
npm publish --access public

cd ../harness
npm publish --access public

cd ../mcp
npm publish --access public

cd ../integrations
npm publish --access public

cd ../pi
npm publish --access public
```

3. If npm 2FA is enabled for publishes, pass the current OTP:

```bash
npm publish --access public --otp=<code>
```

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
- Run `npm publish --dry-run --access public` first if you want to inspect the tarball before the real publish.

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
