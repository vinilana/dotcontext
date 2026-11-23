const test = require('node:test');
const assert = require('node:assert/strict');
const { extractChangelogSection } = require('./extract-changelog-section');

test('extractChangelogSection returns the body for a matching version heading', () => {
  const content = [
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- pending',
    '',
    '## [1.2.3] - 2026-01-01',
    '',
    '### Fixed',
    '',
    '- shipped fix',
    '',
    '## [1.2.2] - 2025-12-01',
    '',
    '- older',
  ].join('\n');

  const section = extractChangelogSection(content, '1.2.3');
  assert.match(section, /shipped fix/);
  assert.doesNotMatch(section, /older/);
});

test('extractChangelogSection rejects missing versions', () => {
  assert.throws(() => extractChangelogSection('## [1.0.0]\n', '2.0.0'), /missing a section/);
});