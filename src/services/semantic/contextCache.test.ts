import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

import { ContextCache } from './contextCache';

describe('ContextCache', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-cache-test-'));
        // Create watched directories
        await fs.ensureDir(path.join(tempDir, 'src'));
        await fs.ensureDir(path.join(tempDir, '.context'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    describe('basic operations', () => {
        it('should return null for cache miss', async () => {
            const cache = new ContextCache();
            const result = await cache.get(tempDir, 'compact');
            expect(result).toBeNull();
        });

        it('should store and retrieve cached content', async () => {
            const cache = new ContextCache();
            const content = 'cached semantic context';

            await cache.set(tempDir, 'compact', content);
            const result = await cache.get(tempDir, 'compact');

            expect(result).toBe(content);
        });

        it('should cache different context types independently', async () => {
            const cache = new ContextCache();

            await cache.set(tempDir, 'compact', 'compact-content');
            await cache.set(tempDir, 'documentation', 'doc-content');

            expect(await cache.get(tempDir, 'compact')).toBe('compact-content');
            expect(await cache.get(tempDir, 'documentation')).toBe('doc-content');
        });

        it('should track cache size', async () => {
            const cache = new ContextCache();
            expect(cache.size).toBe(0);

            await cache.set(tempDir, 'compact', 'content');
            expect(cache.size).toBe(1);

            await cache.set(tempDir, 'documentation', 'content2');
            expect(cache.size).toBe(2);
        });
    });

    describe('TTL expiration', () => {
        it('should expire entries after TTL', async () => {
            // Create cache with very short TTL
            const cache = new ContextCache({ ttlMs: 50 });

            await cache.set(tempDir, 'compact', 'content');
            expect(await cache.get(tempDir, 'compact')).toBe('content');

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(await cache.get(tempDir, 'compact')).toBeNull();
        });

        it('should not expire entries before TTL', async () => {
            const cache = new ContextCache({ ttlMs: 5000 });

            await cache.set(tempDir, 'compact', 'content');
            expect(await cache.get(tempDir, 'compact')).toBe('content');
        });
    });

    describe('mtime invalidation', () => {
        it('should invalidate when watched directory changes', async () => {
            const cache = new ContextCache({ watchDirs: ['src'] });

            await cache.set(tempDir, 'compact', 'old-content');
            expect(await cache.get(tempDir, 'compact')).toBe('old-content');

            // Modify the src directory (change its mtime)
            await new Promise(resolve => setTimeout(resolve, 50));
            await fs.writeFile(path.join(tempDir, 'src', 'newfile.ts'), 'content');

            // Update directory mtime by creating a file
            const srcPath = path.join(tempDir, 'src');
            const now = new Date();
            await fs.utimes(srcPath, now, now);

            expect(await cache.get(tempDir, 'compact')).toBeNull();
        });
    });

    describe('invalidation and clearing', () => {
        it('should invalidate all entries for a repo', async () => {
            const cache = new ContextCache();

            await cache.set(tempDir, 'compact', 'c1');
            await cache.set(tempDir, 'documentation', 'c2');

            cache.invalidateRepo(tempDir);

            expect(await cache.get(tempDir, 'compact')).toBeNull();
            expect(await cache.get(tempDir, 'documentation')).toBeNull();
            expect(cache.size).toBe(0);
        });

        it('should clear all entries', async () => {
            const cache = new ContextCache();

            await cache.set(tempDir, 'compact', 'c1');
            await cache.set(tempDir, 'documentation', 'c2');

            cache.clear();

            expect(cache.size).toBe(0);
        });

        it('should not affect entries from other repos', async () => {
            const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), 'other-repo-'));
            await fs.ensureDir(path.join(otherDir, 'src'));

            const cache = new ContextCache();

            await cache.set(tempDir, 'compact', 'repo1');
            await cache.set(otherDir, 'compact', 'repo2');

            cache.invalidateRepo(tempDir);

            expect(await cache.get(tempDir, 'compact')).toBeNull();
            expect(await cache.get(otherDir, 'compact')).toBe('repo2');

            await fs.remove(otherDir);
        });
    });

    describe('overwrite behavior', () => {
        it('should overwrite existing entries', async () => {
            const cache = new ContextCache();

            await cache.set(tempDir, 'compact', 'old');
            await cache.set(tempDir, 'compact', 'new');

            expect(await cache.get(tempDir, 'compact')).toBe('new');
        });
    });

    describe('edge cases', () => {
        it('should handle repos with no watched directories', async () => {
            const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-'));
            const cache = new ContextCache({ watchDirs: ['nonexistent'] });

            await cache.set(emptyDir, 'compact', 'content');
            expect(await cache.get(emptyDir, 'compact')).toBe('content');

            await fs.remove(emptyDir);
        });

        it('should handle large content strings', async () => {
            const cache = new ContextCache();
            const largeContent = 'x'.repeat(100_000);

            await cache.set(tempDir, 'compact', largeContent);
            expect(await cache.get(tempDir, 'compact')).toBe(largeContent);
        });
    });
});
