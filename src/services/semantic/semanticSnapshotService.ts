import { createHash } from 'crypto';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import * as path from 'path';

import { RepoStructure } from '../../types';
import { CodebaseMapGenerator } from '../../generators/documentation/codebaseMapGenerator';
import type {
  CodebaseMap,
  SemanticSnapshotMetadata,
} from '../../generators/documentation/codebaseMapGenerator';
import { FileMapper } from '../../utils/fileMapper';
import { CodebaseAnalyzer } from './codebaseAnalyzer';
import type { AnalyzerOptions, DetectedFunctionalPatterns, SemanticContext } from './types';
import { StackDetector } from '../stack/stackDetector';
import type { StackInfo } from '../stack/stackDetector';

export type SemanticSnapshotSection =
  | 'all'
  | 'meta'
  | 'stack'
  | 'structure'
  | 'architecture'
  | 'functionalPatterns'
  | 'dependencies'
  | 'stats'
  | 'keyFiles'
  | 'navigation';

type SnapshotFileSection = Exclude<SemanticSnapshotSection, 'all' | 'meta'>;

export interface SemanticSnapshotManifest extends SemanticSnapshotMetadata {
  sections: Record<SnapshotFileSection | 'summary', string>;
  publishedSummary: string;
}

export interface SemanticSnapshotWriteOptions {
  outputDir?: string;
  semantics?: SemanticContext;
  stackInfo?: StackInfo;
  functionalPatterns?: DetectedFunctionalPatterns;
  analyzerOptions?: AnalyzerOptions;
  repoFingerprint?: string;
}

export interface SemanticSnapshotWriteResult {
  summary: CodebaseMap;
  manifest: SemanticSnapshotManifest;
  snapshotDir: string;
  publishedSummaryPath: string;
}

export interface SemanticSnapshotReadOptions {
  outputDir?: string;
  allowStale?: boolean;
}

export interface SemanticSnapshotSectionResult {
  data: unknown;
  fresh: boolean;
  source: 'snapshot';
  path: string;
  manifest?: SemanticSnapshotManifest;
}

export type SemanticSnapshotRefreshReason = 'fresh' | 'stale' | 'missing';

export interface SemanticSnapshotEnsureSummaryResult {
  summary: CodebaseMap;
  fresh: true;
  source: 'snapshot';
  path: string;
  manifest?: SemanticSnapshotManifest;
  refreshed: boolean;
  refreshReason: SemanticSnapshotRefreshReason;
}

export interface SemanticSnapshotEnsureSectionResult extends SemanticSnapshotSectionResult {
  fresh: true;
  refreshed: boolean;
  refreshReason: SemanticSnapshotRefreshReason;
}

interface SnapshotArtifacts {
  summary: CodebaseMap;
  manifest: SemanticSnapshotManifest;
}

const SNAPSHOT_SCHEMA_VERSION = '2.0.0';
const SNAPSHOT_DIRNAME = path.join('cache', 'semantic');
const MANIFEST_FILENAME = 'manifest.json';
const SUMMARY_FILENAME = 'summary.json';
const VERSIONS_DIRNAME = 'versions';
const MAX_REFRESH_ATTEMPTS = 3;
const MAX_VERSION_HISTORY = 3;

const SECTION_FILENAMES: Record<SnapshotFileSection, string> = {
  stack: 'stack.json',
  structure: 'structure.json',
  architecture: 'architecture.json',
  functionalPatterns: 'functional-patterns.json',
  dependencies: 'dependencies.json',
  stats: 'stats.json',
  keyFiles: 'key-files.json',
  navigation: 'navigation.json',
};

const FINGERPRINT_IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.context/**',
  'vendor/**',
  '__pycache__/**',
];

const FINGERPRINT_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'tsconfig.build.json',
  'jest.config.js',
  'jest.config.ts',
  'vitest.config.ts',
  'vite.config.ts',
  'webpack.config.js',
  'next.config.js',
  'next.config.ts',
  'nest-cli.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
  '.nvmrc',
  '.node-version',
]);

const FINGERPRINT_CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
]);

export class SemanticSnapshotService {
  private static readonly inFlightRefreshes = new Map<string, Promise<SemanticSnapshotWriteResult>>();

  async captureRepoFingerprint(repoPath: string): Promise<string> {
    return this.computeRepoFingerprint(repoPath);
  }

  async writeSnapshot(
    repoStructure: RepoStructure,
    options: SemanticSnapshotWriteOptions = {}
  ): Promise<SemanticSnapshotWriteResult> {
    const outputDir = this.resolveOutputDir(repoStructure.rootPath, options.outputDir);
    const snapshotDir = this.getSnapshotDir(outputDir);
    const publishedSummaryPath = path.join(outputDir, 'docs', 'codebase-map.json');

    const repoFingerprint =
      options.repoFingerprint ?? await this.computeRepoFingerprint(repoStructure.rootPath);

    const artifacts = await this.buildSnapshotArtifacts(repoStructure, {
      ...options,
      repoFingerprint,
    });
    const manifest = await this.publishSnapshotArtifacts({
      outputDir,
      snapshotDir,
      publishedSummaryPath,
      artifacts,
    });

    return {
      summary: artifacts.summary,
      manifest,
      snapshotDir,
      publishedSummaryPath,
    };
  }

  async ensureFreshSummary(
    repoPath: string,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<SemanticSnapshotEnsureSummaryResult> {
    const current = await this.inspectSummary(repoPath, options);
    if (current?.fresh) {
      return {
        summary: current.summary,
        fresh: true,
        source: 'snapshot',
        path: current.path,
        manifest: current.manifest,
        refreshed: false,
        refreshReason: 'fresh',
      };
    }

    const refreshed = await this.refreshSnapshot(repoPath, options);
    return {
      summary: refreshed.summary,
      fresh: true,
      source: 'snapshot',
      path: path.join(refreshed.snapshotDir, refreshed.manifest.sections.summary),
      manifest: refreshed.manifest,
      refreshed: true,
      refreshReason: current ? 'stale' : 'missing',
    };
  }

  async ensureFreshSection(
    repoPath: string,
    section: SemanticSnapshotSection,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<SemanticSnapshotEnsureSectionResult> {
    const current = await this.inspectSection(repoPath, section, options);
    if (current?.fresh) {
      return {
        ...current,
        fresh: true,
        refreshed: false,
        refreshReason: 'fresh',
      };
    }

    const refreshed = await this.refreshSnapshot(repoPath, options);
    const result = this.buildSectionResult(refreshed, section);
    return {
      ...result,
      fresh: true,
      refreshed: true,
      refreshReason: current ? 'stale' : 'missing',
    };
  }

  async readSummary(
    repoPath: string,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<{
    summary: CodebaseMap;
    fresh: boolean;
    source: 'snapshot';
    path: string;
    manifest?: SemanticSnapshotManifest;
  } | null> {
    const current = await this.inspectSummary(repoPath, options);
    if (!current) {
      return null;
    }

    if (options.allowStale === false && !current.fresh) {
      return null;
    }

    return current;
  }

  async readSection(
    repoPath: string,
    section: SemanticSnapshotSection,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<SemanticSnapshotSectionResult | null> {
    const current = await this.inspectSection(repoPath, section, options);
    if (!current) {
      return null;
    }

    if (options.allowStale === false && !current.fresh) {
      return null;
    }

    return current;
  }

  private async refreshSnapshot(
    repoPath: string,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<SemanticSnapshotWriteResult> {
    const outputDir = this.resolveOutputDir(repoPath, options.outputDir);
    const refreshKey = `${path.resolve(repoPath).toLowerCase()}::${path.resolve(outputDir).toLowerCase()}`;
    const existing = SemanticSnapshotService.inFlightRefreshes.get(refreshKey);
    if (existing) {
      return existing;
    }

    const refreshPromise = (async () => {
      const fileMapper = new FileMapper();
      const snapshotDir = this.getSnapshotDir(outputDir);
      const publishedSummaryPath = path.join(outputDir, 'docs', 'codebase-map.json');

      for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
        const repoFingerprint = await this.computeRepoFingerprint(repoPath);
        const repoStructure = await fileMapper.mapRepository(repoPath);
        const artifacts = await this.buildSnapshotArtifacts(repoStructure, {
          outputDir,
          repoFingerprint,
        });
        const currentFingerprint = await this.computeRepoFingerprint(repoPath);

        if (currentFingerprint !== repoFingerprint) {
          continue;
        }

        const manifest = await this.publishSnapshotArtifacts({
          outputDir,
          snapshotDir,
          publishedSummaryPath,
          artifacts,
        });
        const publishedFingerprint = await this.computeRepoFingerprint(repoPath);

        if (publishedFingerprint !== repoFingerprint) {
          continue;
        }

        return {
          summary: artifacts.summary,
          manifest,
          snapshotDir,
          publishedSummaryPath,
        };
      }

      throw new Error(
        `Semantic snapshot refresh could not stabilize for ${repoPath}; repository changed during refresh.`
      );
    })();

    SemanticSnapshotService.inFlightRefreshes.set(refreshKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      SemanticSnapshotService.inFlightRefreshes.delete(refreshKey);
    }
  }

  private async inspectSummary(
    repoPath: string,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<{
    summary: CodebaseMap;
    fresh: boolean;
    source: 'snapshot';
    path: string;
    manifest?: SemanticSnapshotManifest;
  } | null> {
    const outputDir = this.resolveOutputDir(repoPath, options.outputDir);
    const snapshotDir = this.getSnapshotDir(outputDir);
    const manifestPath = path.join(snapshotDir, MANIFEST_FILENAME);

    if (!(await fs.pathExists(manifestPath))) {
      return null;
    }

    const manifest = await fs.readJson(manifestPath) as SemanticSnapshotManifest;
    const summaryPath = path.join(snapshotDir, manifest.sections.summary);
    if (!(await fs.pathExists(summaryPath))) {
      return null;
    }

    const fresh = await this.isFresh(repoPath, manifest.repoFingerprint);
    if (options.allowStale === false && !fresh) {
      return null;
    }

    const summary = await fs.readJson(summaryPath) as CodebaseMap;
    return {
      summary,
      fresh,
      source: 'snapshot',
      path: summaryPath,
      manifest,
    };
  }

  private async inspectSection(
    repoPath: string,
    section: SemanticSnapshotSection,
    options: SemanticSnapshotReadOptions = {}
  ): Promise<SemanticSnapshotSectionResult | null> {
    const outputDir = this.resolveOutputDir(repoPath, options.outputDir);
    const snapshotDir = this.getSnapshotDir(outputDir);
    const manifestPath = path.join(snapshotDir, MANIFEST_FILENAME);

    if (!(await fs.pathExists(manifestPath))) {
      return null;
    }

    const manifest = await fs.readJson(manifestPath) as SemanticSnapshotManifest;
    const fresh = await this.isFresh(repoPath, manifest.repoFingerprint);
    if (options.allowStale === false && !fresh) {
      return null;
    }

    return await this.buildSectionResultFromManifest(snapshotDir, manifest, section, fresh);
  }

  private async buildSnapshotArtifacts(
    repoStructure: RepoStructure,
    options: SemanticSnapshotWriteOptions = {}
  ): Promise<SnapshotArtifacts> {
    let analyzer: CodebaseAnalyzer | null = null;
    let semantics = options.semantics;
    let functionalPatterns = options.functionalPatterns;
    let stackInfo = options.stackInfo;

    try {
      if (!semantics || !functionalPatterns) {
        analyzer = new CodebaseAnalyzer(options.analyzerOptions);
      }

      if (!semantics) {
        semantics = await analyzer!.analyze(repoStructure.rootPath);
      }

      if (!functionalPatterns) {
        functionalPatterns = await analyzer!.detectFunctionalPatterns(repoStructure.rootPath);
      }

      if (!stackInfo) {
        const stackDetector = new StackDetector();
        stackInfo = await stackDetector.detect(repoStructure.rootPath);
      }
    } finally {
      if (analyzer) {
        await analyzer.shutdown();
      }
    }

    const metadata: SemanticSnapshotMetadata = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      repoFingerprint:
        options.repoFingerprint ?? await this.computeRepoFingerprint(repoStructure.rootPath),
      analyzer: {
        useLSP: !!options.analyzerOptions?.useLSP,
        includesSymbolPayload: false,
      },
    };

    const generator = new CodebaseMapGenerator();
    const summary = generator.generate(
      repoStructure,
      semantics,
      stackInfo,
      functionalPatterns,
      metadata
    );

    const manifest: SemanticSnapshotManifest = {
      ...metadata,
      sections: {
        summary: SUMMARY_FILENAME,
        stack: SECTION_FILENAMES.stack,
        structure: SECTION_FILENAMES.structure,
        architecture: SECTION_FILENAMES.architecture,
        functionalPatterns: SECTION_FILENAMES.functionalPatterns,
        dependencies: SECTION_FILENAMES.dependencies,
        stats: SECTION_FILENAMES.stats,
        keyFiles: SECTION_FILENAMES.keyFiles,
        navigation: SECTION_FILENAMES.navigation,
      },
      publishedSummary: path.join('docs', 'codebase-map.json'),
    };

    return { summary, manifest };
  }

  private async publishSnapshotArtifacts(params: {
    outputDir: string;
    snapshotDir: string;
    publishedSummaryPath: string;
    artifacts: SnapshotArtifacts;
  }): Promise<SemanticSnapshotManifest> {
    const { outputDir, snapshotDir, publishedSummaryPath, artifacts } = params;
    const tempSummaryPath = `${publishedSummaryPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempManifestPath = path.join(
      snapshotDir,
      `${MANIFEST_FILENAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    const versionId = this.createVersionId();
    const versionDir = path.join(snapshotDir, VERSIONS_DIRNAME, versionId);
    const versionPrefix = path.posix.join(VERSIONS_DIRNAME, versionId);
    const manifest = this.buildPublishedManifest(artifacts.manifest, versionPrefix);

    await fs.ensureDir(outputDir);
    await fs.ensureDir(snapshotDir);
    await fs.ensureDir(path.dirname(publishedSummaryPath));
    await fs.ensureDir(path.dirname(versionDir));
    await fs.remove(versionDir);
    await fs.ensureDir(versionDir);

    try {
      const sectionData = this.getSectionData(artifacts.summary);
      await fs.writeJson(path.join(versionDir, SUMMARY_FILENAME), artifacts.summary, { spaces: 2 });
      await Promise.all(
        Object.entries(SECTION_FILENAMES).map(([section, filename]) =>
          fs.writeJson(path.join(versionDir, filename), sectionData[section as SnapshotFileSection], {
            spaces: 2,
          })
        )
      );
      await fs.writeJson(tempSummaryPath, artifacts.summary, { spaces: 2 });
      await fs.writeJson(tempManifestPath, manifest, { spaces: 2 });

      await this.promoteFile(tempSummaryPath, publishedSummaryPath);
      await this.promoteFile(tempManifestPath, path.join(snapshotDir, MANIFEST_FILENAME));
    } catch (error) {
      await fs.remove(tempSummaryPath);
      await fs.remove(tempManifestPath);
      await fs.remove(versionDir);
      throw error;
    }

    void this.pruneSnapshotVersions(snapshotDir).catch(() => {
      // Snapshot version pruning is best-effort; stale versions are harmless.
    });

    return manifest;
  }

  private buildSectionResult(
    snapshot: SemanticSnapshotWriteResult,
    section: SemanticSnapshotSection
  ): SemanticSnapshotSectionResult {
    if (section === 'meta') {
      return {
        data: snapshot.manifest,
        fresh: true,
        source: 'snapshot',
        path: path.join(snapshot.snapshotDir, MANIFEST_FILENAME),
        manifest: snapshot.manifest,
      };
    }

    const relativeFile = section === 'all'
      ? snapshot.manifest.sections.summary
      : snapshot.manifest.sections[section as SnapshotFileSection];

    return {
      data: this.extractSectionData(snapshot.summary, section),
      fresh: true,
      source: 'snapshot',
      path: path.join(snapshot.snapshotDir, relativeFile),
      manifest: snapshot.manifest,
    };
  }

  private async buildSectionResultFromManifest(
    snapshotDir: string,
    manifest: SemanticSnapshotManifest,
    section: SemanticSnapshotSection,
    fresh: boolean
  ): Promise<SemanticSnapshotSectionResult | null> {
    if (section === 'meta') {
      return {
        data: manifest,
        fresh,
        source: 'snapshot',
        path: path.join(snapshotDir, MANIFEST_FILENAME),
        manifest,
      };
    }

    const relativeFile = section === 'all'
      ? manifest.sections.summary
      : manifest.sections[section as SnapshotFileSection];
    const sectionPath = path.join(snapshotDir, relativeFile);

    if (!(await fs.pathExists(sectionPath))) {
      return null;
    }

    return {
      data: await fs.readJson(sectionPath),
      fresh,
      source: 'snapshot',
      path: sectionPath,
      manifest,
    };
  }

  private extractSectionData(map: CodebaseMap, section: SemanticSnapshotSection): unknown {
    switch (section) {
      case 'all':
        return map;
      case 'meta':
        return map.meta ?? null;
      case 'stack':
        return map.stack;
      case 'structure':
        return map.structure;
      case 'architecture':
        return map.architecture;
      case 'functionalPatterns':
        return map.functionalPatterns;
      case 'dependencies':
        return map.dependencies;
      case 'stats':
        return map.stats;
      case 'keyFiles':
        return map.keyFiles ?? [];
      case 'navigation':
        return map.navigation ?? {};
    }
  }

  private getSectionData(summary: CodebaseMap): Record<SnapshotFileSection, unknown> {
    return {
      stack: summary.stack,
      structure: summary.structure,
      architecture: summary.architecture,
      functionalPatterns: summary.functionalPatterns,
      dependencies: summary.dependencies,
      stats: summary.stats,
      keyFiles: summary.keyFiles ?? [],
      navigation: summary.navigation ?? {},
    };
  }

  private async replaceFile(targetPath: string, sourcePath: string): Promise<void> {
    const backupPath = `${targetPath}.bak-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetExists = await fs.pathExists(targetPath);

    if (targetExists) {
      await fs.rename(targetPath, backupPath);
    }

    try {
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      if (targetExists && await fs.pathExists(backupPath)) {
        await fs.rename(backupPath, targetPath);
      }
      throw error;
    }

    if (targetExists) {
      await fs.remove(backupPath);
    }
  }

  private async promoteFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      await fs.rename(sourcePath, targetPath);
    } catch {
      await this.replaceFile(targetPath, sourcePath);
    }
  }

  private getSnapshotDir(outputDir: string): string {
    return path.join(outputDir, SNAPSHOT_DIRNAME);
  }

  private buildPublishedManifest(
    manifest: SemanticSnapshotManifest,
    versionPrefix: string
  ): SemanticSnapshotManifest {
    return {
      ...manifest,
      sections: {
        summary: path.posix.join(versionPrefix, SUMMARY_FILENAME),
        stack: path.posix.join(versionPrefix, SECTION_FILENAMES.stack),
        structure: path.posix.join(versionPrefix, SECTION_FILENAMES.structure),
        architecture: path.posix.join(versionPrefix, SECTION_FILENAMES.architecture),
        functionalPatterns: path.posix.join(versionPrefix, SECTION_FILENAMES.functionalPatterns),
        dependencies: path.posix.join(versionPrefix, SECTION_FILENAMES.dependencies),
        stats: path.posix.join(versionPrefix, SECTION_FILENAMES.stats),
        keyFiles: path.posix.join(versionPrefix, SECTION_FILENAMES.keyFiles),
        navigation: path.posix.join(versionPrefix, SECTION_FILENAMES.navigation),
      },
    };
  }

  private createVersionId(): string {
    return `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
  }

  private async pruneSnapshotVersions(snapshotDir: string): Promise<void> {
    const versionsDir = path.join(snapshotDir, VERSIONS_DIRNAME);
    if (!(await fs.pathExists(versionsDir))) {
      return;
    }

    const entries = await fs.readdir(versionsDir);
    const versions = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(versionsDir, entry);
        const stats = await fs.stat(absolutePath);
        return stats.isDirectory()
          ? { entry, absolutePath, mtimeMs: stats.mtimeMs }
          : null;
      })
    );

    const staleVersions = versions
      .filter((entry): entry is { entry: string; absolutePath: string; mtimeMs: number } => entry !== null)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(MAX_VERSION_HISTORY);

    await Promise.all(staleVersions.map((entry) => fs.remove(entry.absolutePath)));
  }

  private resolveOutputDir(repoPath: string, outputDir?: string): string {
    return outputDir
      ? path.resolve(outputDir)
      : path.resolve(repoPath, '.context');
  }

  private async isFresh(repoPath: string, expectedFingerprint: string): Promise<boolean> {
    return expectedFingerprint === await this.computeRepoFingerprint(repoPath);
  }

  private async computeRepoFingerprint(repoPath: string): Promise<string> {
    const files = await glob('**/*', {
      cwd: repoPath,
      nodir: true,
      dot: true,
      ignore: FINGERPRINT_IGNORE_PATTERNS,
    });

    const relevantFiles = files
      .filter((filePath) => this.isFingerprintRelevant(filePath))
      .sort();

    const hash = createHash('sha1');
    for (const relativePath of relevantFiles) {
      const absolutePath = path.join(repoPath, relativePath);
      try {
        hash.update(`${relativePath}\0`);
        hash.update(await fs.readFile(absolutePath));
        hash.update('\0');
      } catch {
        hash.update(`${relativePath}:missing\n`);
      }
    }

    return hash.digest('hex');
  }

  private isFingerprintRelevant(relativePath: string): boolean {
    if (FINGERPRINT_ROOT_FILES.has(relativePath)) {
      return true;
    }

    const topLevel = relativePath.split('/')[0];
    if (['src', 'lib', 'bin', 'app', 'packages', 'scripts'].includes(topLevel)) {
      return true;
    }

    return FINGERPRINT_CODE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
  }
}
