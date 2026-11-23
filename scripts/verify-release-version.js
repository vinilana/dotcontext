#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const releaseSlugs = ['cli', 'harness', 'mcp', 'integrations', 'pi'];

function parseTagVersion(tag) {
  if (!tag) {
    throw new Error('Missing release tag.');
  }
  const normalized = tag.startsWith('refs/tags/') ? tag.slice('refs/tags/'.length) : tag;
  if (!normalized.startsWith('v')) {
    throw new Error(`Release tag must start with "v" (received "${normalized}").`);
  }
  const version = normalized.slice(1);
  if (!version) {
    throw new Error(`Release tag "${normalized}" does not contain a version.`);
  }
  return version;
}

function readBundleVersion(slug) {
  const packagePath = path.join(__dirname, '..', '.release', 'packages', slug, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Missing bundle at ${packagePath}. Run npm run build:packages first.`);
  }
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
}

function main() {
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
  const expectedVersion = parseTagVersion(tag);
  const rootVersion = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  ).version;

  if (rootVersion !== expectedVersion) {
    console.error(
      `Tag ${tag} targets version ${expectedVersion}, but package.json version is ${rootVersion}.`
    );
    process.exit(1);
  }

  const mismatches = [];
  for (const slug of releaseSlugs) {
    const bundleVersion = readBundleVersion(slug);
    if (bundleVersion !== expectedVersion) {
      mismatches.push(`${slug}: ${bundleVersion}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `Bundle versions do not match tag ${tag}:\n${mismatches.map((line) => `- ${line}`).join('\n')}`
    );
    process.exit(1);
  }

  console.log(`Release tag ${tag} matches package.json and all bundle versions (${expectedVersion}).`);
}

if (require.main === module) {
  main();
}

module.exports = { parseTagVersion };