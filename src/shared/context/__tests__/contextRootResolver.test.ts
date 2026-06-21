/**
 * Unit tests for Simple Context Root Resolver
 *
 * Tests simple path resolution without complex detection strategies.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import {
  resolveContextPath,
  resolveSimpleContext,
  resolveContextRoot,
} from '../contextRootResolver';

describe('contextRootResolver', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `context-resolver-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.remove(testDir);
  });

  describe('resolveContextPath', () => {
    it('should resolve context path with absolute path', () => {
      // Act
      const result = resolveContextPath(testDir);

      // Assert
      expect(result).toBe(path.join(testDir, '.context'));
    });

    it('should resolve context path with relative path', () => {
      // Act
      const result = resolveContextPath('./myproject');

      // Assert
      expect(result).toContain('.context');
      expect(result).toMatch(/myproject[/\\]\.context/);
    });

    it('should resolve context path with cwd when no path provided', () => {
      // Act
      const result = resolveContextPath();

      // Assert
      expect(result).toBe(path.join(process.cwd(), '.context'));
    });
  });

  describe('resolveSimpleContext', () => {
    it('should detect .context exists', async () => {
      // Setup: Create .context directory
      const contextPath = path.join(testDir, '.context');
      await fs.ensureDir(contextPath);

      // Act
      const result = await resolveSimpleContext(testDir);

      // Assert
      expect(result.contextPath).toBe(contextPath);
      expect(result.projectRoot).toBe(testDir);
      expect(result.exists).toBe(true);
    });

    it('should detect .context does not exist', async () => {
      // Act
      const result = await resolveSimpleContext(testDir);

      // Assert
      expect(result.contextPath).toBe(path.join(testDir, '.context'));
      expect(result.projectRoot).toBe(testDir);
      expect(result.exists).toBe(false);
    });

    it('should use cwd when no path provided', async () => {
      // Act
      const result = await resolveSimpleContext();

      // Assert
      expect(result.projectRoot).toBe(process.cwd());
      expect(result.contextPath).toBe(path.join(process.cwd(), '.context'));
    });

    it('should resolve absolute paths correctly', async () => {
      // Setup: Create .context in testDir
      const contextPath = path.join(testDir, '.context');
      await fs.ensureDir(contextPath);

      // Act
      const result = await resolveSimpleContext(testDir);

      // Assert
      expect(path.isAbsolute(result.contextPath)).toBe(true);
      expect(path.isAbsolute(result.projectRoot)).toBe(true);
    });
  });

  describe('resolveContextRoot (backwards compatibility)', () => {
    it('should resolve context using startPath', async () => {
      // Setup: Create .context
      const contextPath = path.join(testDir, '.context');
      await fs.ensureDir(contextPath);

      // Act
      const result = await resolveContextRoot({
        startPath: testDir,
        validate: false,
      });

      // Assert
      expect(result.contextPath).toBe(contextPath);
      expect(result.projectRoot).toBe(testDir);
      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(true); // Simple: valid if exists
    });

    it('should use process.cwd() when no startPath provided', async () => {
      // Act
      const result = await resolveContextRoot();

      // Assert
      expect(result.projectRoot).toBe(process.cwd());
      expect(result.contextPath).toBe(path.join(process.cwd(), '.context'));
    });

    it('should detect non-existent context correctly', async () => {
      // Act (testDir exists but has no .context)
      const result = await resolveContextRoot({
        startPath: testDir,
        validate: false,
      });

      // Assert
      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false); // Simple: invalid if not exists
    });

    it('should mark context as valid when exists', async () => {
      // Setup
      const contextPath = path.join(testDir, '.context');
      await fs.ensureDir(contextPath);

      // Act
      const result = await resolveContextRoot({
        startPath: testDir,
      });

      // Assert
      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(true);
    });
  });
});
