/**
 * Topic Detector Service
 *
 * Dynamically detects Q&A topics based on:
 * 1. Stack detection - Language, frameworks, build tools
 * 2. Project type - CLI, web API, library, mobile app, etc.
 * 3. Code patterns found - What's actually in the codebase
 */

import type { StackInfo } from '../stack/stackDetector';
import type { DetectedFunctionalPatterns } from '../../../../adapters/out/semantic/types';

/**
 * Q&A Topic definition
 */
export interface QATopic {
  slug: string;
  question: string;
  category: 'getting-started' | 'architecture' | 'features' | 'operations' | 'testing';
  priority: number;
}

/**
 * Topic detection result
 */
export interface TopicDetectionResult {
  topics: QATopic[];
  projectType: ProjectType;
  detectionReasons: Map<string, string[]>;
}

export type ProjectType =
  | 'cli'
  | 'web-api'
  | 'web-app'
  | 'library'
  | 'mobile-app'
  | 'desktop-app'
  | 'fullstack'
  | 'unknown';

/**
 * Detects Q&A topics based on stack and patterns
 */
export class TopicDetector {
  /**
   * Get Q&A topics for the given stack and patterns
   */
  detectTopics(
    stack: StackInfo,
    patterns: DetectedFunctionalPatterns
  ): TopicDetectionResult {
    const topics: QATopic[] = [];
    const detectionReasons = new Map<string, string[]>();
    const projectType = this.detectProjectType(stack);

    // Base topics for all projects
    topics.push({
      slug: 'getting-started',
      question: 'How do I set up and run this project?',
      category: 'getting-started',
      priority: 1,
    });

    topics.push({
      slug: 'project-structure',
      question: 'How is the codebase organized?',
      category: 'architecture',
      priority: 2,
    });

    // CLI-specific topics
    if (this.isCLI(stack)) {
      detectionReasons.set('cli-commands', [
        stack.hasBinField ? 'Package has bin field' : '',
        stack.cliLibraries?.length ? `Uses CLI libraries: ${stack.cliLibraries.join(', ')}` : '',
        stack.frameworks.includes('cli') ? 'CLI framework detected' : '',
      ].filter(Boolean));

      topics.push({
        slug: 'cli-commands',
        question: 'What commands are available?',
        category: 'features',
        priority: 3,
      });

      topics.push({
        slug: 'cli-arguments',
        question: 'How do I pass arguments and options?',
        category: 'features',
        priority: 4,
      });
    }

    // Web framework specific topics
    if (this.hasWebFramework(stack)) {
      detectionReasons.set('routing', [
        `Web framework detected: ${stack.frameworks.find((f) =>
          ['nextjs', 'nuxt', 'express', 'nestjs', 'fastify', 'koa', 'hapi'].includes(f)
        )}`,
      ]);

      topics.push({
        slug: 'routing',
        question: 'How does routing work?',
        category: 'architecture',
        priority: 5,
      });

      topics.push({
        slug: 'middleware',
        question: 'How does middleware work?',
        category: 'architecture',
        priority: 6,
      });
    }

    // Pattern-based topics

    // Authentication
    if (patterns.hasAuthPattern) {
      const authIndicators = patterns.patterns
        .find((p) => p.type === 'auth')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('authentication', authIndicators || ['Auth patterns detected']);

      topics.push({
        slug: 'authentication',
        question: 'How does authentication work?',
        category: 'features',
        priority: 7,
      });
    }

    // Database
    if (patterns.hasDatabasePattern) {
      const dbIndicators = patterns.patterns
        .find((p) => p.type === 'database')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('database', dbIndicators || ['Database patterns detected']);

      topics.push({
        slug: 'database',
        question: 'How is data stored and accessed?',
        category: 'features',
        priority: 8,
      });
    }

    // API endpoints
    if (patterns.hasApiPattern) {
      const apiIndicators = patterns.patterns
        .find((p) => p.type === 'api')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('api-endpoints', apiIndicators || ['API patterns detected']);

      topics.push({
        slug: 'api-endpoints',
        question: 'What API endpoints are available?',
        category: 'features',
        priority: 9,
      });
    }

    // Caching
    if (patterns.hasCachePattern) {
      const cacheIndicators = patterns.patterns
        .find((p) => p.type === 'cache')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('caching', cacheIndicators || ['Cache patterns detected']);

      topics.push({
        slug: 'caching',
        question: 'How does caching work?',
        category: 'operations',
        priority: 10,
      });
    }

    // Error handling
    if (patterns.hasErrorHandlingPattern) {
      const errorIndicators = patterns.patterns
        .find((p) => p.type === 'error-handling')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('error-handling', errorIndicators || ['Error handling patterns detected']);

      topics.push({
        slug: 'error-handling',
        question: 'How are errors handled?',
        category: 'operations',
        priority: 11,
      });
    }

    // Testing
    if (patterns.hasTestingPattern || stack.testFrameworks.length > 0) {
      const testIndicators = [
        ...stack.testFrameworks.map((f) => `Test framework: ${f}`),
        ...(patterns.patterns.find((p) => p.type === 'testing')?.indicators.slice(0, 2).map((i) => i.reason) || []),
      ];

      detectionReasons.set('testing', testIndicators);

      topics.push({
        slug: 'testing',
        question: 'How do I run and write tests?',
        category: 'testing',
        priority: 12,
      });
    }

    // Real-time features
    if (patterns.hasWebSocketPattern) {
      const wsIndicators = patterns.patterns
        .find((p) => p.type === 'websocket')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('realtime', wsIndicators || ['WebSocket patterns detected']);

      topics.push({
        slug: 'realtime',
        question: 'How do real-time features work?',
        category: 'features',
        priority: 13,
      });
    }

    // Background jobs
    if (patterns.hasQueuePattern) {
      const queueIndicators = patterns.patterns
        .find((p) => p.type === 'queue')
        ?.indicators.slice(0, 3)
        .map((i) => i.reason);

      detectionReasons.set('background-jobs', queueIndicators || ['Queue patterns detected']);

      topics.push({
        slug: 'background-jobs',
        question: 'How do background jobs work?',
        category: 'operations',
        priority: 14,
      });
    }

    // Library-specific topics
    if (projectType === 'library') {
      topics.push({
        slug: 'api-reference',
        question: 'What is the public API?',
        category: 'features',
        priority: 15,
      });

      topics.push({
        slug: 'installation',
        question: 'How do I install and import this library?',
        category: 'getting-started',
        priority: 2,
      });
    }

    // Frontend-specific topics
    if (this.hasFrontendFramework(stack)) {
      topics.push({
        slug: 'components',
        question: 'How are UI components organized?',
        category: 'architecture',
        priority: 16,
      });

      topics.push({
        slug: 'state-management',
        question: 'How is application state managed?',
        category: 'architecture',
        priority: 17,
      });
    }

    // DevOps topics
    if (stack.hasDocker || stack.hasCI) {
      topics.push({
        slug: 'deployment',
        question: 'How do I deploy this project?',
        category: 'operations',
        priority: 18,
      });
    }

    // Sort by priority
    topics.sort((a, b) => a.priority - b.priority);

    return {
      topics,
      projectType,
      detectionReasons,
    };
  }

  /**
   * Detect project type based on stack
   */
  private detectProjectType(stack: StackInfo): ProjectType {
    // CLI detection
    if (this.isCLI(stack)) {
      return 'cli';
    }

    // Mobile app detection
    if (
      stack.frameworks.some((f) =>
        ['react-native', 'flutter', 'capacitor', 'ionic', 'android-native', 'ios-native'].includes(f)
      )
    ) {
      return 'mobile-app';
    }

    // Desktop app detection
    if (stack.frameworks.some((f) => ['electron', 'tauri', 'neutralino'].includes(f))) {
      return 'desktop-app';
    }

    // Fullstack detection (has both frontend and backend indicators)
    const hasFrontend = this.hasFrontendFramework(stack);
    const hasBackend = stack.frameworks.some((f) =>
      ['express', 'fastify', 'nestjs', 'koa', 'hapi', 'django', 'rails', 'laravel'].includes(f)
    );

    if (hasFrontend && hasBackend) {
      return 'fullstack';
    }

    // Web app (frontend only)
    if (hasFrontend) {
      return 'web-app';
    }

    // Web API (backend only)
    if (hasBackend) {
      return 'web-api';
    }

    // Library detection
    if (stack.hasMainExport || stack.hasTypesField) {
      return 'library';
    }

    return 'unknown';
  }

  /**
   * Check if the project is a CLI
   */
  private isCLI(stack: StackInfo): boolean {
    return (
      Boolean(stack.hasBinField) ||
      Boolean(stack.cliLibraries?.length) ||
      stack.frameworks.includes('cli')
    );
  }

  /**
   * Check if the project has a web framework
   */
  private hasWebFramework(stack: StackInfo): boolean {
    return stack.frameworks.some((f) =>
      [
        'nextjs',
        'nuxt',
        'express',
        'nestjs',
        'fastify',
        'koa',
        'hapi',
        'django',
        'flask',
        'fastapi',
        'rails',
        'laravel',
        'phoenix',
      ].includes(f)
    );
  }

  /**
   * Check if the project has a frontend framework
   */
  private hasFrontendFramework(stack: StackInfo): boolean {
    return stack.frameworks.some((f) =>
      ['nextjs', 'nuxt', 'angular', 'vue', 'svelte', 'gatsby', 'remix', 'astro'].includes(f)
    );
  }
}
