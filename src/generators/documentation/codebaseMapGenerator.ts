/**
 * Codebase Map Generator
 *
 * Generates a summary JSON file for the codebase structure, stack,
 * architecture, dependencies, and functional capabilities.
 *
 * Symbol payloads are intentionally excluded. Detailed symbol data belongs
 * to live semantic analysis, not persisted summary artifacts.
 */

import * as path from 'path';
import { RepoStructure } from '../../types';
import type { SemanticContext, DetectedFunctionalPatterns } from '../../services/semantic/types';
import type { StackInfo } from '../../services/stack/stackDetector';

// ============================================================================
// Types
// ============================================================================

export interface KeyFile {
  path: string;
  description: string;
  category: 'entrypoint' | 'config' | 'types' | 'service' | 'generator' | 'util';
}

export interface NavigationHints {
  tests: string;
  config: string[];
  types: string[];
  mainLogic: string[];
}

export interface SemanticSnapshotMetadata {
  schemaVersion: string;
  generatedAt: string;
  repoFingerprint: string;
  analyzer: {
    useLSP: boolean;
    includesSymbolPayload: false;
  };
}

export interface CodebaseMap {
  version: string;
  generated: string;
  meta?: SemanticSnapshotMetadata;

  stack: {
    primaryLanguage: string | null;
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    testFrameworks: string[];
    packageManager: string | null;
    isMonorepo: boolean;
    hasDocker: boolean;
    hasCI: boolean;
    nodeVersion?: string;
    runtimeEnvironment?: 'node' | 'browser' | 'both';
    hasBinField?: boolean;
    hasMainExport?: boolean;
    hasTypesField?: boolean;
    cliLibraries?: string[];
  };

  structure: {
    totalFiles: number;
    rootPath?: string;
    topDirectories: Array<{ name: string; fileCount: number; description?: string }>;
    languageDistribution: Array<{ extension: string; count: number }>;
  };

  architecture: {
    layers: Array<{
      name: string;
      description: string;
      directories: string[];
      symbolCount: number;
      dependsOn: string[];
    }>;
    patterns: Array<{
      name: string;
      confidence: number;
      description: string;
      occurrences: number;
    }>;
    entryPoints: string[];
    mainEntryPoints?: string[];
    moduleExports?: string[];
  };

  functionalPatterns: DetectedFunctionalPatterns;

  dependencies: {
    mostImported: Array<{ file: string; importedBy: number; description?: string }>;
  };

  stats: {
    totalFiles: number;
    totalSymbols: number;
    exportedSymbols: number;
    analysisTimeMs: number;
  };

  keyFiles?: KeyFile[];
  navigation?: NavigationHints;
}

export interface CodebaseMapOptions {
  maxDependencies?: number;
  maxKeyFiles?: number;
}

export function createEmptyFunctionalPatterns(): DetectedFunctionalPatterns {
  return {
    hasAuthPattern: false,
    hasDatabasePattern: false,
    hasApiPattern: false,
    hasCachePattern: false,
    hasQueuePattern: false,
    hasWebSocketPattern: false,
    hasLoggingPattern: false,
    hasValidationPattern: false,
    hasErrorHandlingPattern: false,
    hasTestingPattern: false,
    patterns: [],
  };
}

// ============================================================================
// Generator
// ============================================================================

const DIRECTORY_DESCRIPTIONS: Record<string, string> = {
  src: 'Source code root',
  services: 'Business logic and orchestration services',
  generators: 'Content and scaffold generation',
  utils: 'Shared utilities and helpers',
  types: 'TypeScript type definitions',
  tests: 'Test files and fixtures',
  __tests__: 'Unit and integration tests',
  components: 'UI components',
  hooks: 'React hooks',
  api: 'API endpoints and handlers',
  config: 'Configuration files',
  models: 'Data models and entities',
  controllers: 'Request handlers',
  middleware: 'Request/response middleware',
  routes: 'Route definitions',
  views: 'View templates',
  assets: 'Static assets (images, fonts)',
  styles: 'CSS/SCSS stylesheets',
  lib: 'Shared library code',
  core: 'Core application logic',
  shared: 'Shared code across modules',
  workflow: 'Workflow and orchestration',
  mcp: 'MCP server implementation',
  ai: 'AI/LLM integration',
  semantic: 'Semantic code analysis',
  plans: 'Development plans',
  agents: 'AI agent definitions',
  skills: 'Skill definitions',
  docs: 'Documentation files',
  scripts: 'Build and utility scripts',
  prompts: 'Prompt templates',
  public: 'Public static assets',
  dist: 'Build output directory',
  build: 'Build output directory',
  bin: 'CLI binaries and executables',
  test: 'Test files',
  spec: 'Test specifications',
  fixtures: 'Test fixtures and mock data',
  mocks: 'Mock implementations',
  pages: 'Page components (Next.js/Nuxt)',
  app: 'Application entry (Next.js app router)',
  store: 'State management',
  reducers: 'Redux reducers',
  actions: 'Redux actions',
  selectors: 'Redux selectors',
  contexts: 'React contexts',
  providers: 'Context providers',
  layouts: 'Layout components',
  templates: 'Template files',
  i18n: 'Internationalization',
  locales: 'Locale files',
  translations: 'Translation files',
};

const KEY_FILE_PATTERNS: Array<{ pattern: RegExp; description: string; category: KeyFile['category'] }> = [
  { pattern: /^src\/index\.(ts|js)$/, description: 'Main library entry point', category: 'entrypoint' },
  { pattern: /^src\/main\.(ts|js)$/, description: 'Application entry point', category: 'entrypoint' },
  { pattern: /^src\/cli\.(ts|js)$/, description: 'CLI entry point', category: 'entrypoint' },
  { pattern: /^src\/server\.(ts|js)$/, description: 'Server entry point', category: 'entrypoint' },
  { pattern: /^src\/app\.(ts|js)$/, description: 'Application entry point', category: 'entrypoint' },
  { pattern: /^bin\//, description: 'CLI executable', category: 'entrypoint' },
  { pattern: /^index\.(ts|js)$/, description: 'Package entry point', category: 'entrypoint' },
  { pattern: /types?\.(ts|d\.ts)$/, description: 'Type definitions', category: 'types' },
  { pattern: /tsconfig.*\.json$/, description: 'TypeScript configuration', category: 'config' },
  { pattern: /^package\.json$/, description: 'Package manifest', category: 'config' },
  { pattern: /\.config\.(ts|js|mjs|cjs)$/, description: 'Tool configuration', category: 'config' },
  { pattern: /^\.env/, description: 'Environment variables', category: 'config' },
  { pattern: /Service\.(ts|js)$/, description: 'Service class', category: 'service' },
  { pattern: /Generator\.(ts|js)$/, description: 'Generator class', category: 'generator' },
  { pattern: /utils?\.(ts|js)$/, description: 'Utility functions', category: 'util' },
  { pattern: /helpers?\.(ts|js)$/, description: 'Helper functions', category: 'util' },
];

export class CodebaseMapGenerator {
  private readonly maxDependencies: number;
  private readonly maxKeyFiles: number;

  constructor(options: CodebaseMapOptions = {}) {
    this.maxDependencies = options.maxDependencies ?? 20;
    this.maxKeyFiles = options.maxKeyFiles ?? 30;
  }

  generate(
    repoStructure: RepoStructure,
    semantics?: SemanticContext,
    stackInfo?: StackInfo,
    functionalPatterns?: DetectedFunctionalPatterns,
    metadata?: SemanticSnapshotMetadata
  ): CodebaseMap {
    const architecture = this.buildArchitectureSection(repoStructure.rootPath, semantics);

    return {
      version: metadata?.schemaVersion ?? '2.0.0',
      generated: metadata?.generatedAt ?? new Date().toISOString(),
      ...(metadata ? { meta: metadata } : {}),
      stack: this.buildStackSection(stackInfo, repoStructure.rootPath),
      structure: this.buildStructureSection(repoStructure),
      architecture,
      functionalPatterns: functionalPatterns ?? createEmptyFunctionalPatterns(),
      dependencies: this.buildDependenciesSection(repoStructure.rootPath, semantics),
      stats: this.buildStatsSection(repoStructure, semantics),
      keyFiles: this.buildKeyFilesSection(repoStructure, semantics),
      navigation: this.buildNavigationSection(repoStructure, stackInfo),
    };
  }

  private buildStackSection(stackInfo?: StackInfo, repoRoot?: string): CodebaseMap['stack'] {
    if (!stackInfo) {
      return {
        primaryLanguage: null,
        languages: [],
        frameworks: [],
        buildTools: [],
        testFrameworks: [],
        packageManager: null,
        isMonorepo: false,
        hasDocker: false,
        hasCI: false,
      };
    }

    let nodeVersion: string | undefined;
    let runtimeEnvironment: 'node' | 'browser' | 'both' | undefined;

    if (repoRoot) {
      try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const fs = require('fs-extra');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = fs.readJsonSync(packageJsonPath);
          if (packageJson.engines?.node) {
            nodeVersion = packageJson.engines.node;
          }

          const hasBrowserField = !!packageJson.browser;
          const hasMainField = !!packageJson.main || !!packageJson.exports;
          const hasBinField = !!packageJson.bin;

          const isBrowserFramework = stackInfo.frameworks.some((framework) =>
            ['nextjs', 'nuxt', 'vue', 'angular', 'svelte', 'react', 'gatsby', 'astro'].includes(framework)
          );
          const isNodeFramework = stackInfo.frameworks.some((framework) =>
            ['nestjs', 'express', 'fastify', 'koa', 'hapi'].includes(framework)
          ) || hasBinField || stackInfo.frameworks.includes('cli');

          if (isBrowserFramework && isNodeFramework) {
            runtimeEnvironment = 'both';
          } else if (isBrowserFramework || hasBrowserField) {
            runtimeEnvironment = 'browser';
          } else if (isNodeFramework || hasMainField) {
            runtimeEnvironment = 'node';
          }
        }
      } catch {
        // Ignore errors reading package.json
      }
    }

    return {
      primaryLanguage: stackInfo.primaryLanguage,
      languages: stackInfo.languages,
      frameworks: stackInfo.frameworks,
      buildTools: stackInfo.buildTools,
      testFrameworks: stackInfo.testFrameworks,
      packageManager: stackInfo.packageManager,
      isMonorepo: stackInfo.isMonorepo,
      hasDocker: stackInfo.hasDocker,
      hasCI: stackInfo.hasCI,
      ...(nodeVersion && { nodeVersion }),
      ...(runtimeEnvironment && { runtimeEnvironment }),
      ...(typeof stackInfo.hasBinField === 'boolean' ? { hasBinField: stackInfo.hasBinField } : {}),
      ...(typeof stackInfo.hasMainExport === 'boolean' ? { hasMainExport: stackInfo.hasMainExport } : {}),
      ...(typeof stackInfo.hasTypesField === 'boolean' ? { hasTypesField: stackInfo.hasTypesField } : {}),
      ...(stackInfo.cliLibraries?.length ? { cliLibraries: stackInfo.cliLibraries } : {}),
    };
  }

  private buildStructureSection(repoStructure: RepoStructure): CodebaseMap['structure'] {
    const topDirectories = (repoStructure.topLevelDirectoryStats ?? [])
      .filter((stat) => {
        const hasFilesUnder = repoStructure.files.some((file) =>
          file.relativePath.startsWith(stat.name + '/') || file.relativePath.startsWith(stat.name + '\\')
        );
        const isDirectory = repoStructure.directories.some((directory) =>
          directory.relativePath === stat.name || path.basename(directory.relativePath) === stat.name
        );
        return hasFilesUnder || isDirectory || stat.fileCount > 1;
      })
      .map((stat) => ({
        name: stat.name,
        fileCount: stat.fileCount,
        description: this.getDirectoryDescription(stat.name),
      }));

    const extensionCounts = new Map<string, number>();
    for (const file of repoStructure.files) {
      const ext = path.extname(file.relativePath).toLowerCase();
      if (ext) {
        extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
      }
    }

    const languageDistribution = Array.from(extensionCounts.entries())
      .map(([extension, count]) => ({ extension, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalFiles: repoStructure.totalFiles,
      rootPath: '.',
      topDirectories,
      languageDistribution,
    };
  }

  private getDirectoryDescription(dirName: string): string {
    const lowerName = dirName.toLowerCase();
    if (DIRECTORY_DESCRIPTIONS[lowerName]) {
      return DIRECTORY_DESCRIPTIONS[lowerName];
    }

    for (const [key, desc] of Object.entries(DIRECTORY_DESCRIPTIONS)) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        return desc;
      }
    }

    if (lowerName.includes('test')) return 'Test files';
    if (lowerName.includes('spec')) return 'Test specifications';
    if (lowerName.endsWith('s') && !['utils', 'types', 'tests'].includes(lowerName)) {
      const singular = lowerName.slice(0, -1);
      return `${singular.charAt(0).toUpperCase() + singular.slice(1)} definitions`;
    }

    return 'Module directory';
  }

  private buildArchitectureSection(
    repoRoot: string,
    semantics?: SemanticContext
  ): CodebaseMap['architecture'] {
    if (!semantics) {
      return {
        layers: [],
        patterns: [],
        entryPoints: [],
        mainEntryPoints: [],
        moduleExports: [],
      };
    }

    const layers = semantics.architecture.layers.map((layer) => ({
      name: layer.name,
      description: layer.description,
      directories: layer.directories.map((directory) => this.relativePath(repoRoot, directory)),
      symbolCount: layer.symbols.length,
      dependsOn: layer.dependsOn,
    }));

    const patterns = semantics.architecture.patterns.map((pattern) => ({
      name: pattern.name,
      confidence: pattern.confidence,
      description: pattern.description,
      occurrences: pattern.locations.length,
    }));

    const allEntryPoints = semantics.architecture.entryPoints.map((entryPoint) =>
      this.relativePath(repoRoot, entryPoint)
    );
    const { mainEntryPoints, moduleExports } = this.categorizeEntryPoints(allEntryPoints);

    return {
      layers,
      patterns,
      entryPoints: allEntryPoints,
      mainEntryPoints,
      moduleExports,
    };
  }

  private categorizeEntryPoints(entryPoints: string[]): {
    mainEntryPoints: string[];
    moduleExports: string[];
  } {
    const mainEntryPoints: string[] = [];
    const moduleExports: string[] = [];

    const mainPatterns = [
      /^src\/index\.(ts|js)$/,
      /^index\.(ts|js)$/,
      /^src\/main\.(ts|js)$/,
      /^src\/cli\.(ts|js)$/,
      /^src\/server\.(ts|js)$/,
      /^src\/app\.(ts|js)$/,
      /^bin\//,
      /^cli\.(ts|js)$/,
      /^server\.(ts|js)$/,
      /^app\.(ts|js)$/,
      /^main\.(ts|js)$/,
    ];

    const barrelPatterns = [
      /\/index\.(ts|js)$/,
    ];

    for (const entryPoint of entryPoints) {
      const isMain = mainPatterns.some((pattern) => pattern.test(entryPoint));
      const isBarrel = barrelPatterns.some((pattern) => pattern.test(entryPoint)) && !isMain;

      if (isMain) {
        mainEntryPoints.push(entryPoint);
      } else if (isBarrel) {
        moduleExports.push(entryPoint);
      } else if (entryPoint.split('/').length <= 2) {
        mainEntryPoints.push(entryPoint);
      } else {
        moduleExports.push(entryPoint);
      }
    }

    return { mainEntryPoints, moduleExports };
  }

  private buildDependenciesSection(repoRoot: string, semantics?: SemanticContext): CodebaseMap['dependencies'] {
    if (!semantics) {
      return { mostImported: [] };
    }

    const importCounts: Array<{ file: string; importedBy: number; description?: string }> = [];

    for (const [file, importers] of semantics.dependencies.reverseGraph.entries()) {
      const relativePath = this.relativePath(repoRoot, file);
      importCounts.push({
        file: relativePath,
        importedBy: importers.length,
        description: this.inferFileDescription(relativePath),
      });
    }

    const mostImported = importCounts
      .sort((a, b) => b.importedBy - a.importedBy)
      .slice(0, this.maxDependencies);

    return { mostImported };
  }

  private inferFileDescription(filePath: string): string | undefined {
    const basename = path.basename(filePath, path.extname(filePath));
    const dirname = path.dirname(filePath);

    if (basename === 'index') {
      const parentDir = path.basename(dirname);
      if (parentDir && DIRECTORY_DESCRIPTIONS[parentDir.toLowerCase()]) {
        return `${parentDir} module exports`;
      }
      return 'Module exports';
    }

    if (basename === 'types' || basename === 'type') {
      return 'Type definitions';
    }

    if (basename.endsWith('Service')) {
      return `${basename.replace(/Service$/, '')} service`;
    }

    if (basename.endsWith('Generator')) {
      return `${basename.replace(/Generator$/, '')} generator`;
    }

    if (basename.endsWith('Utils') || basename.endsWith('Util')) {
      return 'Utility functions';
    }

    if (basename === 'constants' || basename === 'config') {
      return 'Configuration and constants';
    }

    const dirName = path.basename(dirname).toLowerCase();
    if (DIRECTORY_DESCRIPTIONS[dirName]) {
      return DIRECTORY_DESCRIPTIONS[dirName];
    }

    return undefined;
  }

  private buildStatsSection(repoStructure: RepoStructure, semantics?: SemanticContext): CodebaseMap['stats'] {
    if (!semantics) {
      return {
        totalFiles: repoStructure.totalFiles,
        totalSymbols: 0,
        exportedSymbols: 0,
        analysisTimeMs: 0,
      };
    }

    const allSymbols = [
      ...semantics.symbols.classes,
      ...semantics.symbols.interfaces,
      ...semantics.symbols.functions,
      ...semantics.symbols.types,
      ...semantics.symbols.enums,
    ];

    const exportedCount = allSymbols.filter((symbol) => symbol.exported).length;

    return {
      totalFiles: semantics.stats.totalFiles || repoStructure.totalFiles,
      totalSymbols: semantics.stats.totalSymbols,
      exportedSymbols: exportedCount,
      analysisTimeMs: semantics.stats.analysisTimeMs,
    };
  }

  private relativePath(repoRoot: string, filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.relative(repoRoot, filePath);
    }
    return filePath;
  }

  private buildKeyFilesSection(repoStructure: RepoStructure, semantics?: SemanticContext): KeyFile[] {
    const keyFiles: KeyFile[] = [];
    const seenPaths = new Set<string>();

    for (const file of repoStructure.files) {
      const relativePath = file.relativePath;
      for (const { pattern, description, category } of KEY_FILE_PATTERNS) {
        if (pattern.test(relativePath) && !seenPaths.has(relativePath)) {
          seenPaths.add(relativePath);
          keyFiles.push({
            path: relativePath,
            description: this.enhanceFileDescription(relativePath, description, semantics),
            category,
          });
          break;
        }
      }
    }

    if (semantics) {
      for (const entryPoint of semantics.architecture.entryPoints) {
        const relativePath = this.relativePath(repoStructure.rootPath, entryPoint);
        if (!seenPaths.has(relativePath)) {
          seenPaths.add(relativePath);
          keyFiles.push({
            path: relativePath,
            description: this.inferFileDescription(relativePath) || 'Entry point',
            category: this.inferCategory(relativePath),
          });
        }
      }
    }

    const categoryPriority: Record<string, number> = {
      entrypoint: 0,
      config: 1,
      types: 2,
      service: 3,
      generator: 4,
      util: 5,
    };

    return keyFiles
      .sort((a, b) => {
        const aPriority = categoryPriority[a.category] ?? 99;
        const bPriority = categoryPriority[b.category] ?? 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.path.localeCompare(b.path);
      })
      .slice(0, this.maxKeyFiles);
  }

  private enhanceFileDescription(
    filePath: string,
    defaultDescription: string,
    semantics?: SemanticContext
  ): string {
    if (!semantics) return defaultDescription;

    const allSymbols = [
      ...semantics.symbols.classes,
      ...semantics.symbols.interfaces,
      ...semantics.symbols.functions,
    ];

    const fileSymbols = allSymbols.filter((symbol) =>
      symbol.location.file.endsWith(filePath) || filePath.endsWith(path.basename(symbol.location.file))
    );

    if (fileSymbols.length > 0) {
      const mainSymbol = fileSymbols.find((symbol) => symbol.exported) || fileSymbols[0];
      if (mainSymbol.documentation) {
        const firstLine = mainSymbol.documentation.split('\n')[0].trim();
        if (firstLine.length > 0 && firstLine.length <= 100) {
          return firstLine;
        }
      }
    }

    return defaultDescription;
  }

  private inferCategory(filePath: string): KeyFile['category'] {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.includes('service')) return 'service';
    if (lowerPath.includes('generator')) return 'generator';
    if (lowerPath.includes('util') || lowerPath.includes('helper')) return 'util';
    if (lowerPath.includes('type') || lowerPath.endsWith('.d.ts')) return 'types';
    if (lowerPath.includes('config') || lowerPath.endsWith('.json')) return 'config';

    const basename = path.basename(filePath).toLowerCase();
    if (['index', 'main', 'cli', 'server', 'app'].some((name) => basename.startsWith(name))) {
      return 'entrypoint';
    }

    return 'util';
  }

  private buildNavigationSection(repoStructure: RepoStructure, stackInfo?: StackInfo): NavigationHints {
    const files = repoStructure.files.map((file) => file.relativePath);

    let testPattern = 'src/**/*.test.ts';
    if (files.some((file) => file.includes('__tests__'))) {
      testPattern = '**/__tests__/**/*.ts';
    } else if (files.some((file) => file.includes('.spec.'))) {
      testPattern = '**/*.spec.ts';
    } else if (files.some((file) => file.endsWith('.test.ts') || file.endsWith('.test.js'))) {
      testPattern = '**/*.test.{ts,js}';
    }

    const configPatterns = [
      'package.json',
      'tsconfig.json',
      'tsconfig.*.json',
      'jest.config.js',
      'jest.config.ts',
      'vitest.config.ts',
      '.eslintrc.js',
      '.eslintrc.json',
      'eslint.config.js',
      '.prettierrc',
      '.prettierrc.json',
      'vite.config.ts',
      'webpack.config.js',
      'next.config.js',
      'next.config.ts',
    ];

    const configFiles = configPatterns.filter((pattern) => {
      if (pattern.includes('*')) {
        return files.some((file) => {
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(file);
        });
      }
      return files.some((file) => file === pattern || file.endsWith('/' + pattern));
    });

    const typeFiles: string[] = [];
    for (const file of files) {
      if (
        file.endsWith('.d.ts') ||
        file.endsWith('/types.ts') ||
        file.endsWith('/types/index.ts') ||
        file === 'src/types.ts'
      ) {
        typeFiles.push(file);
      }
    }

    const mainLogicPatterns = ['src/services', 'src/core', 'src/lib', 'lib', 'src/modules'];
    const mainLogic = mainLogicPatterns.filter((pattern) =>
      files.some((file) => file.startsWith(pattern + '/'))
    );

    if (stackInfo?.frameworks.includes('nestjs') && !mainLogic.includes('src/modules')) {
      if (files.some((file) => file.startsWith('src/modules/'))) {
        mainLogic.push('src/modules');
      }
    }

    return {
      tests: testPattern,
      config: configFiles.slice(0, 10),
      types: typeFiles.slice(0, 10),
      mainLogic: mainLogic.length > 0 ? mainLogic : ['src'],
    };
  }
}
