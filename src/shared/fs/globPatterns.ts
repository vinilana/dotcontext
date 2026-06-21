/**
 * Shared Glob Patterns
 *
 * Common glob patterns and utilities used across file detection services.
 * Centralizes ignore patterns to avoid duplication.
 */

import { glob, type GlobOptions } from 'glob';

/**
 * Common directories to ignore in all glob operations
 */
export const COMMON_IGNORES = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'vendor/**',
  '__pycache__/**',
  '.next/**',
  '.nuxt/**',
  'coverage/**',
  '.cache/**',
  'tmp/**',
  '.tmp/**',
] as const;

/**
 * Common source code extensions
 */
export const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'pyw',
  'go',
  'rs',
  'java', 'kt', 'scala',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'dart',
  'vue', 'svelte',
] as const;

/**
 * Common documentation extensions
 */
export const DOC_EXTENSIONS = ['md', 'mdx', 'txt', 'rst'] as const;

/**
 * Common config file patterns
 */
export const CONFIG_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
] as const;

/**
 * Options for globFiles function
 */
export interface GlobFilesOptions {
  absolute?: boolean;
  nodir?: boolean;
  additionalIgnores?: string[];
  includeHidden?: boolean;
}

/**
 * Find files matching a glob pattern with common ignores
 */
export async function globFiles(
  pattern: string,
  cwd: string,
  options: GlobFilesOptions = {}
): Promise<string[]> {
  const {
    absolute = true,
    nodir = true,
    additionalIgnores = [],
    includeHidden = false,
  } = options;

  const ignore = [...COMMON_IGNORES, ...additionalIgnores];

  const globOptions: GlobOptions = {
    cwd,
    absolute,
    nodir,
    ignore,
    dot: includeHidden,
  };

  const results = await glob(pattern, globOptions);
  return results.map(r => String(r));
}

/**
 * Find files with multiple patterns
 */
export async function globMultiple(
  patterns: string[],
  cwd: string,
  options: GlobFilesOptions = {}
): Promise<string[]> {
  const results = await Promise.all(
    patterns.map((pattern) => globFiles(pattern, cwd, options))
  );

  // Deduplicate results
  return [...new Set(results.flat())];
}

/**
 * Build a glob pattern for specific extensions
 */
export function buildExtensionPattern(extensions: readonly string[]): string {
  if (extensions.length === 1) {
    return `**/*.${extensions[0]}`;
  }
  return `**/*.{${extensions.join(',')}}`;
}

/**
 * Check if a file should be ignored
 */
export function shouldIgnore(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return COMMON_IGNORES.some((pattern) => {
    const cleanPattern = pattern.replace('/**', '');
    return normalizedPath.includes(cleanPattern);
  });
}
