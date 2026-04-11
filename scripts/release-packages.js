#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(repoRoot, '.release');
const bundlesRoot = path.join(releaseRoot, 'packages');
const releasesRoot = path.join(releaseRoot, 'releases');
const rootPackagePath = path.join(repoRoot, 'package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

function run(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveVersion(input) {
  const current = rootPackage.version;
  const next = input || 'patch';

  if (['patch', 'minor', 'major'].includes(next)) {
    const inc = semver.inc(current, next);
    assert(inc, `Unable to calculate next version from ${current} using ${next}`);
    return inc;
  }

  assert(semver.valid(next), `Invalid version: ${next}`);
  return next;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rewriteBundleVersion(bundleDir, version) {
  const packagePath = path.join(bundleDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function buildRelease(version) {
  assert(fs.existsSync(bundlesRoot), 'Bundle directory does not exist. Run build:packages first.');

  const releaseDir = path.join(releasesRoot, version);
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  for (const slug of ['cli', 'harness', 'mcp']) {
    const sourceDir = path.join(bundlesRoot, slug);
    const targetDir = path.join(releaseDir, slug);
    assert(fs.existsSync(sourceDir), `Missing bundle: ${slug}`);
    copyDir(sourceDir, targetDir);
    rewriteBundleVersion(targetDir, version);
  }

  const manifest = {
    version,
    rootVersion: rootPackage.version,
    createdAt: new Date().toISOString(),
    packages: ['cli', 'harness', 'mcp'].map((slug) => ({
      slug,
      path: `./${slug}`,
    })),
  };

  fs.writeFileSync(
    path.join(releaseDir, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  return releaseDir;
}

function main() {
  const arg = process.argv[2];
  const version = resolveVersion(arg);

  run('npm', ['run', 'build:packages']);
  run('npm', ['run', 'smoke:packages']);

  const releaseDir = buildRelease(version);
  console.log(`Prepared local release ${version} in ${releaseDir}`);
}

main();
