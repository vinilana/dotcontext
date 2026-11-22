#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function extractChangelogSection(changelogContent, version) {
  const headerPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm');
  const startMatch = changelogContent.match(headerPattern);
  if (!startMatch) {
    throw new Error(`CHANGELOG.md is missing a section for version ${version} (expected "## [${version}]").`);
  }

  const startIndex = startMatch.index;
  const afterHeader = changelogContent.indexOf('\n', startIndex);
  const bodyStart = afterHeader === -1 ? changelogContent.length : afterHeader + 1;
  const nextSectionMatch = changelogContent.slice(bodyStart).match(/\n## \[/);
  const bodyEnd =
    nextSectionMatch && nextSectionMatch.index !== undefined
      ? bodyStart + nextSectionMatch.index
      : changelogContent.length;

  const body = changelogContent.slice(bodyStart, bodyEnd).trim();
  if (!body) {
    throw new Error(`CHANGELOG.md section for version ${version} is empty.`);
  }

  return body;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/extract-changelog-section.js <version>');
    process.exit(1);
  }

  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  const content = fs.readFileSync(changelogPath, 'utf8');
  const section = extractChangelogSection(content, version);
  process.stdout.write(`${section}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { extractChangelogSection };