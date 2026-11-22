#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const bundlesRoot = path.join(__dirname, '..', '.release', 'packages');

/** Publish order: harness first, then packages that depend on scoped siblings last. */
const packages = [
  { slug: 'harness', name: '@dotcontext/harness' },
  { slug: 'cli', name: '@dotcontext/cli' },
  { slug: 'mcp', name: '@dotcontext/mcp' },
  { slug: 'integrations', name: '@dotcontext/integrations' },
  { slug: 'pi', name: '@dotcontext/pi' },
];

function viewPublishedVersion(packageName, version) {
  try {
    return execFileSync('npm', ['view', `${packageName}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function publishBundle(packageName, slug, version) {
  const bundleDir = path.join(bundlesRoot, slug);
  const manifestPath = path.join(bundleDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing bundle for ${packageName} at ${bundleDir}.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== version) {
    throw new Error(`${packageName} bundle version is ${manifest.version}, expected ${version}.`);
  }

  const published = viewPublishedVersion(packageName, version);
  if (published === version) {
    console.log(`skip ${packageName}@${version} (already on npm)`);
    return 'skipped';
  }

  const args = ['publish', '--access', 'public'];
  if (process.env.DRY_RUN === '1') {
    args.push('--dry-run');
  } else if (process.env.NPM_PROVENANCE === '1') {
    args.push('--provenance');
  }

  console.log(`${process.env.DRY_RUN === '1' ? 'dry-run ' : ''}publish ${packageName}@${version}`);
  execFileSync('npm', args, {
    cwd: bundleDir,
    stdio: 'inherit',
    env: process.env,
  });
  return 'published';
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/publish-package-bundles.js <version>');
    process.exit(1);
  }

  if (!process.env.DRY_RUN && !process.env.NODE_AUTH_TOKEN) {
    console.error(
      'NODE_AUTH_TOKEN is not set. Configure the NPM_TOKEN repository secret for publish steps.'
    );
    process.exit(1);
  }

  const results = [];
  for (const pkg of packages) {
    results.push({ ...pkg, outcome: publishBundle(pkg.name, pkg.slug, version) });
  }

  const published = results.filter((entry) => entry.outcome === 'published').length;
  const skipped = results.filter((entry) => entry.outcome === 'skipped').length;
  console.log(`Done. published=${published} skipped=${skipped} total=${results.length}`);
}

if (require.main === module) {
  main();
}

module.exports = { packages, publishBundle, viewPublishedVersion };