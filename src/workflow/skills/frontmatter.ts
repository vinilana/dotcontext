/**
 * Skill Frontmatter Utilities
 *
 * Shared utilities for generating and parsing SKILL.md frontmatter.
 * Follows DRY principle by centralizing frontmatter logic.
 */

import { SkillMetadata } from './types';
import { PrevcPhase } from '../types';

/**
 * Generate YAML frontmatter string from metadata
 */
export function generateFrontmatter(metadata: SkillMetadata, slug?: string): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${slug ?? metadata.name}`);
  lines.push(`description: ${metadata.description}`);

  if (metadata.phases && metadata.phases.length > 0) {
    lines.push(`phases: [${metadata.phases.join(', ')}]`);
  }

  if (metadata.mode !== undefined) {
    lines.push(`mode: ${metadata.mode}`);
  }

  if (metadata.disableModelInvocation !== undefined) {
    lines.push(`disable-model-invocation: ${metadata.disableModelInvocation}`);
  }

  lines.push('---');

  return lines.join('\n');
}

/**
 * Generate portable skill frontmatter for exported AI-tool skills.
 * Keep only the fields understood by external skill runtimes.
 */
export function generatePortableFrontmatter(name: string, description: string): string {
  return ['---', `name: ${name}`, `description: ${description}`, '---'].join('\n');
}

/**
 * Wrap content with frontmatter
 */
export function wrapWithFrontmatter(metadata: SkillMetadata, content: string, slug?: string): string {
  const result = `${generateFrontmatter(metadata, slug)}\n\n${content}`;
  return result.endsWith('\n') ? result : `${result}\n`;
}

/**
 * Wrap content with portable frontmatter for exported AI-tool skills.
 */
export function wrapWithPortableFrontmatter(name: string, description: string, content: string): string {
  const result = `${generatePortableFrontmatter(name, description)}\n\n${content}`;
  return result.endsWith('\n') ? result : `${result}\n`;
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const defaultMetadata: SkillMetadata = {
    name: '',
    description: '',
  };

  if (!content.startsWith('---')) {
    return { metadata: defaultMetadata, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { metadata: defaultMetadata, body: content };
  }

  const frontmatterRaw = content.substring(3, endIndex).trim();
  const body = content.substring(endIndex + 3).trim();

  const metadata: SkillMetadata = { ...defaultMetadata };

  for (const line of frontmatterRaw.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    switch (key) {
      case 'name':
        metadata.name = stripQuotes(value);
        break;
      case 'description':
        metadata.description = stripQuotes(value);
        break;
      case 'mode':
        metadata.mode = value === 'true';
        break;
      case 'disable-model-invocation':
      case 'disableModelInvocation':
        metadata.disableModelInvocation = value === 'true';
        break;
      case 'phases':
        metadata.phases = parsePhaseArray(value);
        break;
    }
  }

  return { metadata, body };
}

/**
 * Strip surrounding quotes from a string
 */
function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

/**
 * Parse phases array from frontmatter value
 */
function parsePhaseArray(value: string): PrevcPhase[] {
  const match = value.match(/\[(.*)\]/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((p) => p.trim().replace(/["']/g, ''))
    .filter((p): p is PrevcPhase => ['P', 'R', 'E', 'V', 'C'].includes(p));
}
