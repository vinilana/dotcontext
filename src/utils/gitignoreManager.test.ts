import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

import { GitIgnoreManager } from './gitignoreManager';

describe('GitIgnoreManager', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-test-'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    describe('default patterns', () => {
        it('should ignore node_modules by default', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('node_modules')).toBe(true);
            expect(manager.shouldIgnore('node_modules/package/index.js')).toBe(true);
        });

        it('should ignore .git by default', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('.git')).toBe(true);
            expect(manager.shouldIgnore('.git/objects/abc')).toBe(true);
        });

        it('should ignore dist and build by default', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('dist')).toBe(true);
            expect(manager.shouldIgnore('build')).toBe(true);
        });

        it('should not ignore src files by default', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('src/index.ts')).toBe(false);
            expect(manager.shouldIgnore('README.md')).toBe(false);
        });

        it('should allow disabling defaults', async () => {
            const manager = new GitIgnoreManager({ useDefaults: false });
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('node_modules')).toBe(false);
        });
    });

    describe('loading .gitignore', () => {
        it('should load patterns from .gitignore file', async () => {
            await fs.writeFile(path.join(tempDir, '.gitignore'), 'coverage/\n*.swp\n');
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('coverage/lcov.info')).toBe(true);
            expect(manager.shouldIgnore('file.swp')).toBe(true);
            expect(manager.shouldIgnore('src/app.ts')).toBe(false);
        });

        it('should handle .gitignore with comments and empty lines', async () => {
            await fs.writeFile(
                path.join(tempDir, '.gitignore'),
                '# This is a comment\n\n.cache/\n\n# Another comment\n*.bak\n'
            );
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('.cache/data')).toBe(true);
            expect(manager.shouldIgnore('file.bak')).toBe(true);
        });

        it('should respect negation patterns', async () => {
            await fs.writeFile(
                path.join(tempDir, '.gitignore'),
                '*.log\n!important.log\n'
            );
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('debug.log')).toBe(true);
            expect(manager.shouldIgnore('important.log')).toBe(false);
        });

        it('should handle missing .gitignore gracefully', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            // Should still work with defaults
            expect(manager.shouldIgnore('node_modules')).toBe(true);
            expect(manager.shouldIgnore('src/index.ts')).toBe(false);
        });

        it('should handle .gitignore with Windows-style line endings', async () => {
            await fs.writeFile(path.join(tempDir, '.gitignore'), '.next/\r\ncoverage/\r\n');
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('.next/static/bundle.js')).toBe(true);
            expect(manager.shouldIgnore('coverage/lcov.info')).toBe(true);
        });

        it('should handle directory patterns', async () => {
            await fs.writeFile(
                path.join(tempDir, '.gitignore'),
                '__pycache__/\n.venv/\n.idea/\n'
            );
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('__pycache__/module.pyc')).toBe(true);
            expect(manager.shouldIgnore('.venv/lib/python3.10/site.py')).toBe(true);
            expect(manager.shouldIgnore('.idea/workspace.xml')).toBe(true);
        });
    });

    describe('extra patterns', () => {
        it('should apply extra patterns from options', async () => {
            const manager = new GitIgnoreManager({ extraPatterns: ['*.custom'] });
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('file.custom')).toBe(true);
            expect(manager.shouldIgnore('file.ts')).toBe(false);
        });
    });

    describe('caching', () => {
        it('should return consistent results for repeated lookups', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            const result1 = manager.shouldIgnore('node_modules/express/index.js');
            const result2 = manager.shouldIgnore('node_modules/express/index.js');

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should handle cache clearing', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            manager.shouldIgnore('test.ts');
            manager.clearCache();

            // Should still work after cache clear
            expect(manager.shouldIgnore('test.ts')).toBe(false);
        });
    });

    describe('filterPaths', () => {
        it('should filter out ignored paths', async () => {
            await fs.writeFile(path.join(tempDir, '.gitignore'), 'coverage/\n');
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            const input = [
                'src/index.ts',
                'coverage/lcov.info',
                'node_modules/express/index.js',
                'README.md'
            ];

            const filtered = manager.filterPaths(input);

            expect(filtered).toEqual(['src/index.ts', 'README.md']);
        });
    });

    describe('cross-platform path handling', () => {
        it('should normalize backslashes to forward slashes', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('node_modules\\express\\index.js')).toBe(true);
        });

        it('should not ignore empty or root paths', async () => {
            const manager = new GitIgnoreManager();
            await manager.loadFromRepo(tempDir);

            expect(manager.shouldIgnore('')).toBe(false);
            expect(manager.shouldIgnore('.')).toBe(false);
        });
    });

    describe('reload', () => {
        it('should correctly reload when called multiple times', async () => {
            const manager = new GitIgnoreManager();

            // First load without .gitignore
            await manager.loadFromRepo(tempDir);
            expect(manager.shouldIgnore('coverage/lcov.info')).toBe(false);

            // Create .gitignore and reload
            await fs.writeFile(path.join(tempDir, '.gitignore'), 'coverage/\n');
            await manager.loadFromRepo(tempDir);
            expect(manager.shouldIgnore('coverage/lcov.info')).toBe(true);
        });
    });
});
