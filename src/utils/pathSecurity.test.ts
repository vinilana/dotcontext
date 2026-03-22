import * as path from 'path';
import { PathValidator, SecurityError } from './pathSecurity';

describe('PathValidator', () => {
    // Use a normalized test root that works cross-platform
    const workspaceRoot = path.resolve('/workspace/project');
    let validator: PathValidator;

    beforeEach(() => {
        validator = new PathValidator(workspaceRoot);
    });

    describe('validatePath', () => {
        it('should allow paths within workspace', () => {
            const result = validator.validatePath('src/index.ts');
            expect(result).toBe(path.join(workspaceRoot, 'src', 'index.ts'));
        });

        it('should allow nested paths within workspace', () => {
            const result = validator.validatePath('src/services/fill/fillService.ts');
            expect(result).toBe(path.join(workspaceRoot, 'src', 'services', 'fill', 'fillService.ts'));
        });

        it('should allow workspace root itself', () => {
            const result = validator.validatePath('.');
            expect(result).toBe(workspaceRoot);
        });

        it('should block ../ directory traversal', () => {
            expect(() => validator.validatePath('../../../etc/passwd'))
                .toThrow(SecurityError);
        });

        it('should block ../ traversal to parent directories', () => {
            expect(() => validator.validatePath('../sibling-project/secrets.env'))
                .toThrow(SecurityError);
        });

        it('should block paths that escape via intermediate ../', () => {
            expect(() => validator.validatePath('src/../../outside/file.txt'))
                .toThrow(SecurityError);
        });

        it('should block null byte injection', () => {
            expect(() => validator.validatePath('src/file.ts\0.jpg'))
                .toThrow(SecurityError);
            expect(() => validator.validatePath('src/file.ts\0.jpg'))
                .toThrow('null bytes');
        });

        it('should block URL-encoded traversal (%2e%2e%2f)', () => {
            expect(() => validator.validatePath('%2e%2e%2fetc/passwd'))
                .toThrow(SecurityError);
            expect(() => validator.validatePath('%2e%2e%2fetc/passwd'))
                .toThrow('URL-encoded');
        });

        it('should block double URL-encoded traversal (%252e)', () => {
            expect(() => validator.validatePath('%252e%252e/etc/passwd'))
                .toThrow(SecurityError);
        });

        it('should block URL-encoded backslash traversal (%2e%2e%5c)', () => {
            expect(() => validator.validatePath('%2e%2e%5cwindows%5csystem32'))
                .toThrow(SecurityError);
        });
    });

    describe('isWithinBoundary', () => {
        it('should return true for path within boundary', () => {
            const filePath = path.join(workspaceRoot, 'src', 'file.ts');
            expect(validator.isWithinBoundary(filePath)).toBe(true);
        });

        it('should return true for workspace root itself', () => {
            expect(validator.isWithinBoundary(workspaceRoot)).toBe(true);
        });

        it('should return false for path outside boundary', () => {
            const outsidePath = path.resolve('/other/directory/file.ts');
            expect(validator.isWithinBoundary(outsidePath)).toBe(false);
        });

        it('should return false for parent directory', () => {
            const parentPath = path.resolve(workspaceRoot, '..');
            expect(validator.isWithinBoundary(parentPath)).toBe(false);
        });
    });

    describe('safeResolve', () => {
        it('should return resolved path for valid paths', () => {
            const result = validator.safeResolve('src/index.ts');
            expect(result).toBe(path.join(workspaceRoot, 'src', 'index.ts'));
        });

        it('should return null for traversal attempts', () => {
            expect(validator.safeResolve('../../../etc/passwd')).toBeNull();
        });

        it('should return null for null byte injection', () => {
            expect(validator.safeResolve('file\0.ts')).toBeNull();
        });
    });

    describe('SecurityError', () => {
        it('should include attempted path and workspace root', () => {
            try {
                validator.validatePath('../../../etc/passwd');
                fail('Should have thrown SecurityError');
            } catch (error) {
                expect(error).toBeInstanceOf(SecurityError);
                const securityError = error as SecurityError;
                expect(securityError.attemptedPath).toBe('../../../etc/passwd');
                expect(securityError.workspaceRoot).toBe(workspaceRoot);
                expect(securityError.name).toBe('SecurityError');
            }
        });
    });
});
