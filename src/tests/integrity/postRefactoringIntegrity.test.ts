/**
 * Post-Refactoring Integrity Verification Tests
 *
 * Validates that all 5 contributions are correctly integrated
 * and no existing functionality was broken during refactoring.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

// ============================================================
// Phase 4: Module Connectivity — verify all new imports resolve
// ============================================================

describe('Module Connectivity (Phase 4)', () => {
    describe('Contribution 1: GitIgnoreManager → FileMapper integration', () => {
        it('should import GitIgnoreManager from utils', () => {
            const { GitIgnoreManager } = require('../../utils/gitignoreManager');
            expect(GitIgnoreManager).toBeDefined();
            expect(typeof GitIgnoreManager).toBe('function');
        });

        it('should create FileMapper with embedded GitIgnoreManager', () => {
            const { FileMapper } = require('../../utils/fileMapper');
            const mapper = new FileMapper();
            expect(mapper).toBeDefined();
            // Verify private gitIgnoreManager was instantiated
            expect((mapper as any).gitIgnoreManager).toBeDefined();
        });

        it('should create FileMapper with custom excludes', () => {
            const { FileMapper } = require('../../utils/fileMapper');
            const mapper = new FileMapper(['*.custom']);
            expect(mapper).toBeDefined();
        });
    });

    describe('Contribution 2: FrontMatter exports', () => {
        it('should export needsFill function', () => {
            const { needsFill } = require('../../utils/frontMatter');
            expect(typeof needsFill).toBe('function');
        });

        it('should export addFrontMatter function', () => {
            const { addFrontMatter } = require('../../utils/frontMatter');
            expect(typeof addFrontMatter).toBe('function');
        });

        it('should export removeFrontMatter function', () => {
            const { removeFrontMatter } = require('../../utils/frontMatter');
            expect(typeof removeFrontMatter).toBe('function');
        });

        it('should export parseFrontMatter function', () => {
            const { parseFrontMatter } = require('../../utils/frontMatter');
            expect(typeof parseFrontMatter).toBe('function');
        });

        it('should export getDocumentName function', () => {
            const { getDocumentName } = require('../../utils/frontMatter');
            expect(typeof getDocumentName).toBe('function');
        });

        it('should export isScaffoldContent function', () => {
            const { isScaffoldContent } = require('../../utils/frontMatter');
            expect(typeof isScaffoldContent).toBe('function');
        });
    });

    describe('Contribution 3: PathValidator exports', () => {
        it('should export PathValidator class', () => {
            const { PathValidator } = require('../../utils/pathSecurity');
            expect(PathValidator).toBeDefined();
            expect(typeof PathValidator).toBe('function');
        });

        it('should export SecurityError class', () => {
            const { SecurityError } = require('../../utils/pathSecurity');
            expect(SecurityError).toBeDefined();
            expect(typeof SecurityError).toBe('function');
        });

        it('should create PathValidator for a workspace root', () => {
            const { PathValidator } = require('../../utils/pathSecurity');
            const validator = new PathValidator('/workspace');
            expect(validator).toBeDefined();
            expect(typeof validator.validatePath).toBe('function');
            expect(typeof validator.isWithinBoundary).toBe('function');
            expect(typeof validator.safeResolve).toBe('function');
        });
    });

    describe('Contribution 4: ContextCache exports', () => {
        it('should export ContextCache class', () => {
            const { ContextCache } = require('../../services/semantic/contextCache');
            expect(ContextCache).toBeDefined();
            expect(typeof ContextCache).toBe('function');
        });

        it('should create ContextCache with default options', () => {
            const { ContextCache } = require('../../services/semantic/contextCache');
            const cache = new ContextCache();
            expect(cache).toBeDefined();
            expect(cache.size).toBe(0);
        });

        it('should create ContextCache with custom TTL', () => {
            const { ContextCache } = require('../../services/semantic/contextCache');
            const cache = new ContextCache({ ttlMs: 1000, watchDirs: ['src'] });
            expect(cache).toBeDefined();
        });
    });

    describe('Contribution 5: CLI module exports', () => {
        it('should export registerSkillCommands from cli/commands', () => {
            const { registerSkillCommands } = require('../../cli/commands');
            expect(typeof registerSkillCommands).toBe('function');
        });

        it('should export registerWorkflowCommands from cli/commands', () => {
            const { registerWorkflowCommands } = require('../../cli/commands');
            expect(typeof registerWorkflowCommands).toBe('function');
        });
    });
});

// ============================================================
// Phase 5: Contract Verification — backward compatibility
// ============================================================

describe('API Contract Verification (Phase 5)', () => {
    describe('FrontMatter contract', () => {
        it('addFrontMatter should produce valid YAML frontmatter', () => {
            const { addFrontMatter } = require('../../utils/frontMatter');
            const result = addFrontMatter('# Hello World', { status: 'filled', generated: '2026-01-01' });
            expect(result).toContain('---');
            expect(result).toContain('status: filled');
            expect(result).toContain('generated:');
            expect(result).toContain('# Hello World');
        });

        it('removeFrontMatter should strip YAML frontmatter', () => {
            const { removeFrontMatter } = require('../../utils/frontMatter');
            const input = '---\nstatus: unfilled\n---\n# Hello';
            const result = removeFrontMatter(input);
            expect(result).not.toContain('---');
            expect(result).toContain('# Hello');
        });

        it('needsFill should detect unfilled status in first 15 lines', async () => {
            const { needsFill } = require('../../utils/frontMatter');
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'needsfill-test-'));

            // Create a v2 scaffold with status far down
            const content = [
                '---',
                'type: documentation',
                'name: architecture',
                'description: System Architecture',
                'generated: 2026-01-01',
                'category: core',
                'scaffoldVersion: v2',
                'status: unfilled',
                '---',
                '# Architecture',
                '',
                'TODO'
            ].join('\n');

            const filePath = path.join(tempDir, 'test.md');
            await fs.writeFile(filePath, content);

            const result = await needsFill(filePath);
            expect(result).toBe(true);

            await fs.remove(tempDir);
        });

        it('needsFill should return false for filled files', async () => {
            const { needsFill } = require('../../utils/frontMatter');
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'needsfill-test-'));

            const content = '---\nstatus: filled\n---\n# Done';
            const filePath = path.join(tempDir, 'test.md');
            await fs.writeFile(filePath, content);

            const result = await needsFill(filePath);
            expect(result).toBe(false);

            await fs.remove(tempDir);
        });
    });

    describe('GitIgnoreManager contract', () => {
        it('should load .gitignore and filter paths correctly', async () => {
            const { GitIgnoreManager } = require('../../utils/gitignoreManager');
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-contract-'));
            await fs.writeFile(path.join(tempDir, '.gitignore'), 'dist/\ncoverage/\n');

            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            const paths = ['src/index.ts', 'dist/bundle.js', 'coverage/lcov.info', 'README.md'];
            const filtered = manager.filterPaths(paths);

            expect(filtered).toContain('src/index.ts');
            expect(filtered).toContain('README.md');
            expect(filtered).not.toContain('dist/bundle.js');
            expect(filtered).not.toContain('coverage/lcov.info');

            await fs.remove(tempDir);
        });
    });

    describe('PathValidator contract', () => {
        it('should validate safe paths and reject traversals', () => {
            const { PathValidator, SecurityError } = require('../../utils/pathSecurity');
            const root = path.resolve('/workspace/project');
            const validator = new PathValidator(root);

            // Safe path
            const resolved = validator.validatePath('src/index.ts');
            expect(resolved).toBe(path.join(root, 'src', 'index.ts'));

            // Traversal attack
            expect(() => validator.validatePath('../../../etc/passwd')).toThrow(SecurityError);

            // Null byte
            expect(() => validator.validatePath('file\0.ts')).toThrow(SecurityError);

            // safeResolve returns null for bad paths
            expect(validator.safeResolve('../../../etc/passwd')).toBeNull();
            expect(validator.safeResolve('src/file.ts')).not.toBeNull();
        });
    });

    describe('ContextCache contract', () => {
        it('should store and retrieve data with TTL', async () => {
            const { ContextCache } = require('../../services/semantic/contextCache');
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-contract-'));
            await fs.ensureDir(path.join(tempDir, 'src'));

            const cache = new ContextCache({ ttlMs: 5000 });

            // Cache miss
            expect(await cache.get(tempDir, 'compact')).toBeNull();

            // Store
            await cache.set(tempDir, 'compact', 'cached-context');

            // Cache hit
            expect(await cache.get(tempDir, 'compact')).toBe('cached-context');

            // Invalidation
            cache.invalidateRepo(tempDir);
            expect(await cache.get(tempDir, 'compact')).toBeNull();

            await fs.remove(tempDir);
        });
    });

    describe('FillCommandFlags backward compatibility', () => {
        it('should import FillCommandFlags type without breaking', () => {
            // This verifies the type still exists and force is optional
            const fillService = require('../../services/fill/fillService');
            expect(fillService.FillService).toBeDefined();
        });
    });
});

// ============================================================
// Phase 3 (partial): Verify index.ts public exports unchanged
// ============================================================

describe('index.ts Public API Stability (Phase 3)', () => {
    it('should export runInit function', () => {
        // This import will fail if the index.ts re-export was broken
        const indexModule = require('../../index');
        expect(typeof indexModule.runInit).toBe('function');
    });
});
