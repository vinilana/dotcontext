/**
 * GitIgnoreManager - Loads and applies .gitignore rules for file filtering.
 *
 * Uses the `ignore` library for spec-compliant .gitignore pattern matching.
 * Caches lookup results via Map for O(1) repeat lookups.
 * Gracefully falls back to empty rules if no .gitignore exists.
 *
 * @see https://github.com/kaelzhang/node-ignore
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import ignore, { type Ignore } from 'ignore';

/**
 * Default patterns that should always be excluded, regardless of .gitignore content.
 * These match the original hardcoded excludes from FileMapper.
 */
const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '*.log',
  '.env*',
  '*.tmp',
  '.DS_Store',
] as const;

export interface GitIgnoreManagerOptions {
  /** Extra patterns to add on top of .gitignore + defaults */
  extraPatterns?: string[];
  /** Whether to include default exclude patterns (default: true) */
  useDefaults?: boolean;
}

export class GitIgnoreManager {
  private ignoreInstance: Ignore;
  private readonly resultCache = new Map<string, boolean>();
  private loaded = false;

  constructor(private readonly options: GitIgnoreManagerOptions = {}) {
    this.ignoreInstance = ignore();
    this.applyDefaults();
  }

  /**
   * Load .gitignore rules from the given repository root.
   * Safe to call multiple times — resets and reloads each time.
   *
   * @param repoPath - Absolute path to the repository root
   */
  async loadFromRepo(repoPath: string): Promise<void> {
    // Reset for fresh load
    this.ignoreInstance = ignore();
    this.resultCache.clear();
    this.loaded = false;

    // 1. Apply default patterns
    this.applyDefaults();

    // 2. Load .gitignore from repo root
    const gitignorePath = path.join(repoPath, '.gitignore');
    try {
      const exists = await fs.pathExists(gitignorePath);
      if (exists) {
        const content = await fs.readFile(gitignorePath, 'utf-8');
        const patterns = this.parseGitignore(content);
        if (patterns.length > 0) {
          this.ignoreInstance.add(patterns);
        }
      }
    } catch {
      // .gitignore not readable — continue with defaults only
    }

    // 3. Apply extra patterns from options
    if (this.options.extraPatterns && this.options.extraPatterns.length > 0) {
      this.ignoreInstance.add(this.options.extraPatterns);
    }

    this.loaded = true;
  }

  /**
   * Check if a path should be ignored.
   *
   * @param relativePath - Path relative to the repository root (forward slashes)
   * @returns true if the path should be ignored
   */
  shouldIgnore(relativePath: string): boolean {
    // Normalize to forward slashes for cross-platform consistency
    const normalized = relativePath.replace(/\\/g, '/');

    // Empty or root path should not be ignored
    if (!normalized || normalized === '.' || normalized === '/') {
      return false;
    }

    // Check cache first
    const cached = this.resultCache.get(normalized);
    if (cached !== undefined) {
      return cached;
    }

    const result = this.ignoreInstance.ignores(normalized);
    this.resultCache.set(normalized, result);
    return result;
  }

  /**
   * Filter an array of relative paths, returning only non-ignored ones.
   *
   * @param relativePaths - Array of paths relative to repo root
   * @returns Filtered array of non-ignored paths
   */
  filterPaths(relativePaths: string[]): string[] {
    return relativePaths.filter(p => !this.shouldIgnore(p));
  }

  /**
   * Get all patterns currently loaded (for debugging/logging).
   */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Clear the result cache. Useful after adding new patterns.
   */
  clearCache(): void {
    this.resultCache.clear();
  }

  /**
   * Parse .gitignore content into an array of patterns.
   * Strips comments and empty lines.
   */
  private parseGitignore(content: string): string[] {
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  }

  /**
   * Apply default exclusion patterns.
   */
  private applyDefaults(): void {
    if (this.options.useDefaults !== false) {
      this.ignoreInstance.add([...DEFAULT_EXCLUDE_PATTERNS]);
    }
  }
}
