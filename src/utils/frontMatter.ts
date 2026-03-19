/**
 * YAML Front Matter utilities for status detection
 *
 * Allows instant detection of unfilled files by reading only the first line.
 * Supports both v1 (simple) and v2 (scaffold) frontmatter formats.
 */

import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import type { ScaffoldFrontmatter, ScaffoldFileType, ScaffoldStatus } from '../types/scaffoldFrontmatter';

/**
 * Legacy v1 frontmatter (simple status tracking)
 */
export interface FrontMatter {
  status?: 'unfilled' | 'filled';
  generated?: string;
  [key: string]: string | undefined;
}

/**
 * Parsed v2 scaffold frontmatter
 */
export interface ParsedScaffoldFrontmatter {
  type: ScaffoldFileType;
  name: string;
  description: string;
  generated: string;
  status: ScaffoldStatus;
  scaffoldVersion: '2.0.0';
  // Type-specific fields
  category?: string;
  agentType?: string;
  skillSlug?: string;
  planSlug?: string;
  phases?: string[];
  mode?: boolean;
  disableModelInvocation?: boolean;
  summary?: string;
  agents?: Array<{ type: string; role: string }>;
  docs?: string[];
}

/**
 * Check if frontmatter is v2 scaffold format
 */
export function isScaffoldFrontmatter(fm: FrontMatter | ParsedScaffoldFrontmatter): fm is ParsedScaffoldFrontmatter {
  return 'scaffoldVersion' in fm && fm.scaffoldVersion === '2.0.0';
}

const FRONT_MATTER_DELIMITER = '---';

/**
 * Check if a file needs to be filled by reading only the frontmatter block.
 * Searches for 'status: unfilled' only within the YAML frontmatter (between --- delimiters),
 * not in the document body where example code might contain the same string.
 */
export async function needsFill(filePath: string): Promise<boolean> {
  try {
    const { readFile } = await import('fs-extra');
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
      return false;
    }

    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === FRONT_MATTER_DELIMITER) {
        break; // End of frontmatter
      }
      if (trimmed.includes('status: unfilled')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Read only the first N lines of a file efficiently
 */
async function readFirstLines(filePath: string, n: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    const stream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length >= n) {
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
  });
}

/**
 * Parse YAML front matter from content string
 */
export function parseFrontMatter(content: string): { frontMatter: FrontMatter | null; body: string } {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    return { frontMatter: null, body: content };
  }

  const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FRONT_MATTER_DELIMITER);

  if (endIndex === -1) {
    return { frontMatter: null, body: content };
  }

  const frontMatterLines = lines.slice(1, endIndex);
  const frontMatter: FrontMatter = {};

  for (const line of frontMatterLines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      frontMatter[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n+/, '');

  return { frontMatter, body };
}

/**
 * Add front matter to content
 */
export function addFrontMatter(content: string, frontMatter: FrontMatter): string {
  const lines = [FRONT_MATTER_DELIMITER];

  for (const [key, value] of Object.entries(frontMatter)) {
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(FRONT_MATTER_DELIMITER);
  lines.push('');

  return lines.join('\n') + content;
}

/**
 * Remove front matter from content (used after filling)
 */
export function removeFrontMatter(content: string): string {
  const { body } = parseFrontMatter(content);
  return body;
}

/**
 * Check if content has front matter
 */
export function hasFrontMatter(content: string): boolean {
  return content.trimStart().startsWith(FRONT_MATTER_DELIMITER);
}

/**
 * Create standard unfilled front matter
 */
export function createUnfilledFrontMatter(): FrontMatter {
  return {
    status: 'unfilled',
    generated: new Date().toISOString().split('T')[0]
  };
}

/**
 * Get all unfilled files in a directory
 */
export async function getUnfilledFiles(contextDir: string): Promise<string[]> {
  const { glob } = await import('glob');
  const files = await glob(`${contextDir}/**/*.md`);

  const results = await Promise.all(
    files.map(async (file) => ({
      file,
      unfilled: await needsFill(file)
    }))
  );

  return results.filter(r => r.unfilled).map(r => r.file);
}

/**
 * Count filled vs unfilled files
 */
export async function getFilledStats(contextDir: string): Promise<{
  total: number;
  filled: number;
  unfilled: number;
  files: { path: string; filled: boolean }[];
}> {
  const { glob } = await import('glob');
  const files = await glob(`${contextDir}/**/*.md`);

  const results = await Promise.all(
    files.map(async (file) => ({
      path: file,
      filled: !(await needsFill(file))
    }))
  );

  return {
    total: results.length,
    filled: results.filter(r => r.filled).length,
    unfilled: results.filter(r => !r.filled).length,
    files: results
  };
}

/**
 * Parse scaffold frontmatter with support for arrays and nested objects
 */
export function parseScaffoldFrontMatter(content: string): {
  frontMatter: ParsedScaffoldFrontmatter | null;
  body: string;
} {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    return { frontMatter: null, body: content };
  }

  const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FRONT_MATTER_DELIMITER);

  if (endIndex === -1) {
    return { frontMatter: null, body: content };
  }

  const frontMatterLines = lines.slice(1, endIndex);
  const frontMatter: Record<string, unknown> = {};

  let i = 0;
  while (i < frontMatterLines.length) {
    const line = frontMatterLines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Check for key: value pattern
    const simpleMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (simpleMatch) {
      const [, key, value] = simpleMatch;
      const normalizedKey = key.replace(/-/g, '_'); // normalize kebab-case to snake_case

      // Handle inline arrays [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        frontMatter[normalizedKey] = arrayContent.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      // Handle boolean
      else if (value === 'true' || value === 'false') {
        frontMatter[normalizedKey] = value === 'true';
      }
      // Handle quoted string
      else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        frontMatter[normalizedKey] = value.slice(1, -1);
      }
      // Handle nested array (value is empty, next lines start with -)
      else if (!value && i + 1 < frontMatterLines.length && frontMatterLines[i + 1]?.trim().startsWith('-')) {
        const nestedArray: unknown[] = [];
        i++;

        while (i < frontMatterLines.length) {
          const nestedLine = frontMatterLines[i];
          if (!nestedLine.trim().startsWith('-') && !nestedLine.startsWith('  ')) {
            break;
          }

          const itemMatch = nestedLine.match(/^\s*-\s*(.*)$/);
          if (itemMatch) {
            const itemValue = itemMatch[1].trim();

            // Check if this is a nested object (key: value on same line)
            const objectMatch = itemValue.match(/^(\w+):\s*["']?(.*)["']?$/);
            if (objectMatch) {
              // Start of nested object
              const nestedObj: Record<string, string> = {};
              nestedObj[objectMatch[1]] = objectMatch[2].replace(/^["']|["']$/g, '');
              i++;

              // Read additional properties of the nested object
              while (i < frontMatterLines.length) {
                const propLine = frontMatterLines[i];
                const propMatch = propLine.match(/^\s+(\w+):\s*["']?(.*)["']?$/);
                if (propMatch && !propLine.trim().startsWith('-')) {
                  nestedObj[propMatch[1]] = propMatch[2].replace(/^["']|["']$/g, '');
                  i++;
                } else {
                  break;
                }
              }
              nestedArray.push(nestedObj);
              continue;
            } else {
              // Simple array item
              nestedArray.push(itemValue.replace(/^["']|["']$/g, ''));
            }
          }
          i++;
        }

        frontMatter[normalizedKey] = nestedArray;
        continue;
      }
      // Handle simple string
      else {
        frontMatter[normalizedKey] = value;
      }
    }
    i++;
  }

  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n+/, '');

  // Validate required scaffold fields
  if (!frontMatter.scaffoldVersion || frontMatter.scaffoldVersion !== '2.0.0') {
    return { frontMatter: null, body: content };
  }

  return {
    frontMatter: frontMatter as unknown as ParsedScaffoldFrontmatter,
    body,
  };
}

/**
 * Get the document name from frontmatter (works for both v1 and v2)
 */
export function getDocumentName(content: string): string | null {
  // Try v2 first
  const { frontMatter: scaffoldFm } = parseScaffoldFrontMatter(content);
  if (scaffoldFm && scaffoldFm.name) {
    return scaffoldFm.name;
  }

  // Fall back to v1
  const { frontMatter } = parseFrontMatter(content);
  if (frontMatter && frontMatter.name) {
    return frontMatter.name;
  }

  return null;
}

/**
 * Check if content is v2 scaffold format
 */
export function isScaffoldContent(content: string): boolean {
  const { frontMatter } = parseScaffoldFrontMatter(content);
  return frontMatter !== null;
}
