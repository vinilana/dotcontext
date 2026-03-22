/**
 * Path Security Utilities
 *
 * Validates and sanitizes file paths to prevent path traversal attacks
 * in the MCP server. All file access through MCP tools should be validated
 * against the workspace root to prevent unauthorized access.
 *
 * Security patterns detected:
 * - `../` directory traversal
 * - URL-encoded traversal (%2e%2e%2f)
 * - Null byte injection (\0)
 * - Absolute paths outside workspace
 * - Windows drive letter paths outside workspace
 */

import * as path from 'path';

/**
 * Error thrown when a path traversal or unauthorized access attempt is detected.
 */
export class SecurityError extends Error {
    public readonly attemptedPath: string;
    public readonly workspaceRoot: string;

    constructor(message: string, attemptedPath: string, workspaceRoot: string) {
        super(message);
        this.name = 'SecurityError';
        this.attemptedPath = attemptedPath;
        this.workspaceRoot = workspaceRoot;
    }
}

/**
 * Validates that file paths remain within a trusted workspace boundary.
 *
 * Used by the MCP server to ensure AI agents cannot access files
 * outside the project directory via path traversal or other techniques.
 */
export class PathValidator {
    private readonly normalizedRoot: string;

    constructor(private readonly workspaceRoot: string) {
        this.normalizedRoot = path.resolve(workspaceRoot);
    }

    /**
     * Validate that a path resolves within the workspace boundary.
     *
     * @param inputPath - The path to validate (may be relative or absolute)
     * @returns The resolved, validated absolute path
     * @throws SecurityError if the path resolves outside the workspace
     */
    validatePath(inputPath: string): string {
        // 1. Check for null bytes (common injection technique)
        if (inputPath.includes('\0')) {
            throw new SecurityError(
                'Path contains null bytes',
                inputPath,
                this.normalizedRoot
            );
        }

        // 2. Check for URL-encoded traversal sequences
        if (this.hasUrlEncodedTraversal(inputPath)) {
            throw new SecurityError(
                'Path contains URL-encoded traversal sequences',
                inputPath,
                this.normalizedRoot
            );
        }

        // 3. Resolve the path against workspace root
        const resolved = path.resolve(this.normalizedRoot, inputPath);

        // 4. Verify the resolved path is within workspace
        if (!this.isWithinBoundary(resolved)) {
            throw new SecurityError(
                `Access denied: path resolves outside workspace boundary`,
                inputPath,
                this.normalizedRoot
            );
        }

        return resolved;
    }

    /**
     * Check if a path is within the workspace boundary.
     * Does not throw — returns a boolean.
     */
    isWithinBoundary(resolvedPath: string): boolean {
        const normalizedTarget = path.resolve(resolvedPath);
        return (
            normalizedTarget === this.normalizedRoot ||
            normalizedTarget.startsWith(this.normalizedRoot + path.sep)
        );
    }

    /**
     * Safely resolve a path, returning null instead of throwing on violations.
     */
    safeResolve(inputPath: string): string | null {
        try {
            return this.validatePath(inputPath);
        } catch {
            return null;
        }
    }

    /**
     * Check for URL-encoded directory traversal patterns.
     */
    private hasUrlEncodedTraversal(input: string): boolean {
        const patterns = [
            /%2e%2e[%2f%5c]/i, // ../  URL-encoded
            /%2e%2e$/i,         // .. at end URL-encoded
            /%252e/i,           // double-encoded dot
        ];
        return patterns.some(pattern => pattern.test(input));
    }
}
