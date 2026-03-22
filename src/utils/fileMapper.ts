import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { FileInfo, RepoStructure, TopLevelDirectoryStats } from '../types';
import { GitIgnoreManager } from './gitignoreManager';

export class FileMapper {
  private excludePatterns: string[] = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '*.log',
    '.env*',
    '*.tmp',
    '**/.DS_Store'
  ];

  private readonly gitIgnoreManager: GitIgnoreManager;

  constructor(customExcludes: string[] = []) {
    this.excludePatterns = [...this.excludePatterns, ...customExcludes];
    this.gitIgnoreManager = new GitIgnoreManager({ extraPatterns: customExcludes });
  }

  async mapRepository(repoPath: string, includePatterns?: string[]): Promise<RepoStructure> {
    const absolutePath = path.resolve(repoPath);

    if (!await fs.pathExists(absolutePath)) {
      throw new Error(`Repository path does not exist: ${absolutePath}`);
    }

    // Load .gitignore patterns for additional filtering
    await this.gitIgnoreManager.loadFromRepo(absolutePath);

    const patterns = includePatterns || ['**/*'];
    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: absolutePath,
        ignore: this.excludePatterns,
        dot: false,
        absolute: false
      });
      allFiles.push(...files);
    }

    // Apply .gitignore filtering on top of glob excludes
    const filteredFiles = this.gitIgnoreManager.filterPaths(allFiles);

    const uniqueFiles = [...new Set(filteredFiles)];
    const fileInfos: FileInfo[] = [];
    const directories: FileInfo[] = [];
    let totalSize = 0;
    const topLevelStats = new Map<string, { fileCount: number; totalSize: number }>();
    const concurrency = 32;

    for (let index = 0; index < uniqueFiles.length; index += concurrency) {
      const slice = uniqueFiles.slice(index, index + concurrency);
      await Promise.all(
        slice.map(async relativePath => {
          const fullPath = path.join(absolutePath, relativePath);
          const stats = await fs.stat(fullPath);
          const info: FileInfo = {
            path: fullPath,
            relativePath,
            extension: path.extname(relativePath),
            size: stats.size,
            type: stats.isDirectory() ? 'directory' : 'file'
          };

          const topLevelSegment = this.extractTopLevelSegment(relativePath);
          if (topLevelSegment) {
            const current = topLevelStats.get(topLevelSegment) ?? { fileCount: 0, totalSize: 0 };
            if (!stats.isDirectory()) {
              current.fileCount += 1;
              current.totalSize += stats.size;
            }
            topLevelStats.set(topLevelSegment, current);
          }

          if (stats.isDirectory()) {
            directories.push(info);
          } else {
            fileInfos.push(info);
            totalSize += stats.size;
          }

        })
      );
    }

    const topLevelDirectoryStats: TopLevelDirectoryStats[] = Array.from(topLevelStats.entries())
      .map(([name, stats]) => ({ name, fileCount: stats.fileCount, totalSize: stats.totalSize }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      rootPath: absolutePath,
      files: fileInfos,
      directories,
      totalFiles: fileInfos.length,
      totalSize,
      topLevelDirectoryStats
    };
  }

  async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  getFilesByExtension(files: FileInfo[], extension: string): FileInfo[] {
    return files.filter(file => file.extension === extension);
  }

  isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.css', '.scss', '.sass', '.html', '.xml', '.json', '.yaml', '.yml',
      '.md', '.txt', '.sql', '.sh', '.bat', '.ps1', '.php', '.rb', '.go',
      '.rs', '.swift', '.kt', '.scala', '.r', '.m', '.pl', '.lua', '.vim',
      '.dockerfile', '.gitignore', '.env'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext) || !ext;
  }

  private extractTopLevelSegment(relativePath: string): string | null {
    const parts = relativePath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[0] : null;
  }
}
