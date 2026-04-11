/**
 * Q&A Service
 *
 * Generates and manages Q&A content for the codebase.
 * Pre-answers common questions to reduce token usage during sessions.
 *
 * OPTIMIZATION: Uses a persisted semantic snapshot when available to avoid
 * re-analyzing the codebase.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { CodebaseAnalyzer } from '../semantic/codebaseAnalyzer';
import { SemanticSnapshotService } from '../semantic/semanticSnapshotService';
import { StackDetector, type StackInfo } from '../stack/stackDetector';
import { TopicDetector, type QATopic, type TopicDetectionResult } from './topicDetector';
import type { DetectedFunctionalPatterns } from '../semantic/types';
import type { CodebaseMap } from '../../generators/documentation/codebaseMapGenerator';

/**
 * Q&A Entry structure
 */
export interface QAEntry {
  slug: string;
  question: string;
  answer: string;
  category: string;
  generatedAt: string;
  relevantFiles: string[];
}

/**
 * Q&A Search result
 */
export interface QASearchResult {
  entry: QAEntry;
  score: number;
  matchReason: string;
}

/**
 * Q&A Generation result
 */
export interface QAGenerationResult {
  generated: QAEntry[];
  skipped: string[];
  topicDetection: TopicDetectionResult;
}

/**
 * Q&A Service for generating and searching Q&A content
 */
export class QAService {
  private analyzer: CodebaseAnalyzer;
  private stackDetector: StackDetector;
  private topicDetector: TopicDetector;
  private snapshotService: SemanticSnapshotService;

  constructor(options?: { useLSP?: boolean }) {
    this.analyzer = new CodebaseAnalyzer(options);
    this.stackDetector = new StackDetector();
    this.topicDetector = new TopicDetector();
    this.snapshotService = new SemanticSnapshotService();
  }

  /**
   * Generate Q&A from codebase analysis
   *
   * OPTIMIZATION: Uses a persisted semantic snapshot when available.
   * If the snapshot doesn't exist or is stale, falls back to full analysis.
   */
  async generateFromCodebase(repoPath: string): Promise<QAGenerationResult> {
    const absolutePath = path.resolve(repoPath);

    let stack: StackInfo;
    let patterns: DetectedFunctionalPatterns;

    try {
      const snapshot = await this.snapshotService.ensureFreshSummary(absolutePath);
      stack = this.convertMapStackToStackInfo(snapshot.summary);
      patterns = snapshot.summary.functionalPatterns;
    } catch {
      stack = await this.stackDetector.detect(absolutePath);
      patterns = await this.analyzer.detectFunctionalPatterns(absolutePath);
    }

    // Determine relevant topics
    const topicDetection = this.topicDetector.detectTopics(stack, patterns);

    // Generate Q&A for each topic
    const generated: QAEntry[] = [];
    const skipped: string[] = [];

    for (const topic of topicDetection.topics) {
      try {
        const entry = await this.generateQAForTopic(
          absolutePath,
          topic,
          stack,
          patterns,
          topicDetection
        );
        if (entry) {
          generated.push(entry);
        } else {
          skipped.push(topic.slug);
        }
      } catch {
        skipped.push(topic.slug);
      }
    }

    // Save generated Q&A
    await this.saveQAEntries(absolutePath, generated, topicDetection);

    return {
      generated,
      skipped,
      topicDetection,
    };
  }

  /**
   * Search Q&A entries for a query
   */
  async search(repoPath: string, query: string): Promise<QASearchResult[]> {
    const qaDir = path.join(repoPath, '.context', 'docs', 'qa');

    if (!(await fs.pathExists(qaDir))) {
      return [];
    }

    const results: QASearchResult[] = [];
    const files = await fs.readdir(qaDir);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'README.md') continue;

      try {
        const content = await fs.readFile(path.join(qaDir, file), 'utf-8');
        const entry = this.parseQAEntry(content, file);

        if (!entry) continue;

        // Calculate relevance score
        const { score, reason } = this.calculateRelevance(entry, queryLower, queryWords);

        if (score > 0) {
          results.push({
            entry,
            score,
            matchReason: reason,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, 10);
  }

  /**
   * Get all Q&A entries
   */
  async getAll(repoPath: string): Promise<QAEntry[]> {
    const qaDir = path.join(repoPath, '.context', 'docs', 'qa');

    if (!(await fs.pathExists(qaDir))) {
      return [];
    }

    const entries: QAEntry[] = [];
    const files = await fs.readdir(qaDir);

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'README.md') continue;

      try {
        const content = await fs.readFile(path.join(qaDir, file), 'utf-8');
        const entry = this.parseQAEntry(content, file);
        if (entry) {
          entries.push(entry);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return entries;
  }

  /**
   * Get a specific Q&A entry by slug
   */
  async getBySlug(repoPath: string, slug: string): Promise<QAEntry | null> {
    const qaFile = path.join(repoPath, '.context', 'docs', 'qa', `${slug}.md`);

    if (!(await fs.pathExists(qaFile))) {
      return null;
    }

    try {
      const content = await fs.readFile(qaFile, 'utf-8');
      return this.parseQAEntry(content, `${slug}.md`);
    } catch {
      return null;
    }
  }

  /**
   * Generate Q&A entry for a specific topic
   */
  private async generateQAForTopic(
    repoPath: string,
    topic: QATopic,
    stack: StackInfo,
    patterns: DetectedFunctionalPatterns,
    topicResult: TopicDetectionResult
  ): Promise<QAEntry | null> {
    const relevantFiles: string[] = [];
    let answer = '';

    switch (topic.slug) {
      case 'getting-started':
        answer = this.generateGettingStartedAnswer(stack, repoPath);
        break;

      case 'project-structure':
        answer = await this.generateProjectStructureAnswer(repoPath, stack);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['src/', 'lib/', 'app/'])));
        break;

      case 'cli-commands':
        answer = this.generateCLICommandsAnswer(stack);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['bin/', 'cli', 'commands/'])));
        break;

      case 'cli-arguments':
        answer = this.generateCLIArgumentsAnswer(stack);
        break;

      case 'routing':
        answer = await this.generateRoutingAnswer(repoPath, stack, patterns);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['routes/', 'api/', 'pages/'])));
        break;

      case 'middleware':
        answer = await this.generateMiddlewareAnswer(repoPath, patterns);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['middleware/', 'middlewares/'])));
        break;

      case 'authentication':
        answer = this.generateAuthAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'auth', repoPath));
        break;

      case 'database':
        answer = this.generateDatabaseAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'database', repoPath));
        break;

      case 'api-endpoints':
        answer = await this.generateAPIEndpointsAnswer(repoPath, patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'api', repoPath));
        break;

      case 'testing':
        answer = this.generateTestingAnswer(stack, patterns);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['test/', 'tests/', '__tests__/', '*.test.', '*.spec.'])));
        break;

      case 'error-handling':
        answer = this.generateErrorHandlingAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'error-handling', repoPath));
        break;

      case 'caching':
        answer = this.generateCachingAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'cache', repoPath));
        break;

      case 'realtime':
        answer = this.generateRealtimeAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'websocket', repoPath));
        break;

      case 'background-jobs':
        answer = this.generateBackgroundJobsAnswer(patterns);
        relevantFiles.push(...this.getPatternFiles(patterns, 'queue', repoPath));
        break;

      case 'deployment':
        answer = this.generateDeploymentAnswer(stack);
        relevantFiles.push(...(await this.findRelevantFiles(repoPath, ['Dockerfile', 'docker-compose', '.github/workflows/'])));
        break;

      default:
        return null;
    }

    if (!answer) return null;

    return {
      slug: topic.slug,
      question: topic.question,
      answer,
      category: topic.category,
      generatedAt: new Date().toISOString(),
      relevantFiles: [...new Set(relevantFiles)].slice(0, 10),
    };
  }

  // Answer generation methods

  private generateGettingStartedAnswer(stack: StackInfo, repoPath: string): string {
    const lines: string[] = [];

    lines.push('## Getting Started\n');

    // Prerequisites
    lines.push('### Prerequisites\n');
    if (stack.primaryLanguage === 'typescript' || stack.primaryLanguage === 'javascript') {
      lines.push('- Node.js (LTS version recommended)');
      if (stack.packageManager) {
        lines.push(`- ${stack.packageManager}`);
      }
    } else if (stack.primaryLanguage === 'python') {
      lines.push('- Python 3.8+');
      if (stack.packageManager === 'poetry') {
        lines.push('- Poetry');
      } else if (stack.packageManager === 'pipenv') {
        lines.push('- Pipenv');
      }
    }
    lines.push('');

    // Installation
    lines.push('### Installation\n');
    lines.push('```bash');
    lines.push('# Clone the repository');
    lines.push('git clone <repository-url>');
    lines.push(`cd ${path.basename(repoPath)}`);
    lines.push('');

    // Install dependencies
    if (stack.packageManager === 'yarn') {
      lines.push('# Install dependencies');
      lines.push('yarn install');
    } else if (stack.packageManager === 'pnpm') {
      lines.push('# Install dependencies');
      lines.push('pnpm install');
    } else if (stack.packageManager === 'bun') {
      lines.push('# Install dependencies');
      lines.push('bun install');
    } else if (stack.primaryLanguage === 'typescript' || stack.primaryLanguage === 'javascript') {
      lines.push('# Install dependencies');
      lines.push('npm install');
    } else if (stack.packageManager === 'poetry') {
      lines.push('# Install dependencies');
      lines.push('poetry install');
    } else if (stack.packageManager === 'pipenv') {
      lines.push('# Install dependencies');
      lines.push('pipenv install');
    } else if (stack.primaryLanguage === 'python') {
      lines.push('# Install dependencies');
      lines.push('pip install -r requirements.txt');
    }
    lines.push('```\n');

    // Running
    lines.push('### Running\n');
    lines.push('```bash');
    if (stack.buildTools.includes('vite')) {
      lines.push('# Development');
      lines.push('npm run dev');
    } else if (stack.frameworks.includes('nextjs')) {
      lines.push('# Development');
      lines.push('npm run dev');
    } else if (stack.frameworks.includes('express') || stack.frameworks.includes('nestjs') || stack.frameworks.includes('fastify')) {
      lines.push('# Development');
      lines.push('npm run dev');
      lines.push('');
      lines.push('# Production');
      lines.push('npm run build && npm start');
    } else {
      lines.push('# See package.json for available scripts');
      lines.push('npm run <script-name>');
    }
    lines.push('```');

    return lines.join('\n');
  }

  private async generateProjectStructureAnswer(repoPath: string, stack: StackInfo): Promise<string> {
    const lines: string[] = [];
    lines.push('## Project Structure\n');

    // Try to read actual directory structure
    try {
      const entries = await fs.readdir(repoPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => e.name)
        .slice(0, 15);

      if (dirs.length > 0) {
        lines.push('```');
        for (const dir of dirs) {
          lines.push(`${dir}/`);
        }
        lines.push('```\n');
      }
    } catch {
      // Ignore errors
    }

    // Add framework-specific structure hints
    if (stack.frameworks.includes('nextjs')) {
      lines.push('### Next.js Structure\n');
      lines.push('- `app/` or `pages/` - Routes and pages');
      lines.push('- `components/` - Reusable UI components');
      lines.push('- `lib/` - Utility functions');
      lines.push('- `public/` - Static assets');
    } else if (stack.frameworks.includes('nestjs')) {
      lines.push('### NestJS Structure\n');
      lines.push('- `src/` - Source code');
      lines.push('  - `modules/` - Feature modules');
      lines.push('  - `common/` - Shared code');
      lines.push('  - `main.ts` - Application entry');
    } else if (stack.frameworks.includes('express')) {
      lines.push('### Express Structure\n');
      lines.push('- `src/` - Source code');
      lines.push('- `routes/` - Route handlers');
      lines.push('- `middleware/` - Express middleware');
      lines.push('- `controllers/` - Request handlers');
    }

    return lines.join('\n');
  }

  private generateCLICommandsAnswer(stack: StackInfo): string {
    const lines: string[] = [];
    lines.push('## CLI Commands\n');

    if (stack.cliLibraries?.includes('commander')) {
      lines.push('This CLI is built with Commander.js.\n');
      lines.push('Run `<command> --help` to see available commands and options.\n');
    } else if (stack.cliLibraries?.includes('yargs')) {
      lines.push('This CLI is built with Yargs.\n');
      lines.push('Run `<command> --help` to see available commands and options.\n');
    } else if (stack.cliLibraries?.includes('oclif')) {
      lines.push('This CLI is built with oclif.\n');
      lines.push('Run `<command> help` to see available commands.\n');
    }

    lines.push('### Common Commands\n');
    lines.push('See the documentation or source code for specific commands.');

    return lines.join('\n');
  }

  private generateCLIArgumentsAnswer(stack: StackInfo): string {
    const lines: string[] = [];
    lines.push('## CLI Arguments and Options\n');

    if (stack.cliLibraries?.includes('commander')) {
      lines.push('### Commander.js Pattern\n');
      lines.push('```bash');
      lines.push('command [options] <required-arg> [optional-arg]');
      lines.push('```\n');
      lines.push('- Options: `--flag` or `-f`');
      lines.push('- Option with value: `--name <value>`');
    } else if (stack.cliLibraries?.includes('yargs')) {
      lines.push('### Yargs Pattern\n');
      lines.push('```bash');
      lines.push('command <positional> --flag --option=value');
      lines.push('```');
    }

    return lines.join('\n');
  }

  private async generateRoutingAnswer(
    repoPath: string,
    stack: StackInfo,
    patterns: DetectedFunctionalPatterns
  ): Promise<string> {
    const lines: string[] = [];
    lines.push('## Routing\n');

    if (stack.frameworks.includes('nextjs')) {
      lines.push('### Next.js App Router\n');
      lines.push('Routes are defined by the folder structure in `app/`:\n');
      lines.push('- `app/page.tsx` → `/`');
      lines.push('- `app/about/page.tsx` → `/about`');
      lines.push('- `app/blog/[slug]/page.tsx` → `/blog/:slug`');
    } else if (stack.frameworks.includes('express') || stack.frameworks.includes('fastify')) {
      lines.push(`### ${stack.frameworks.includes('express') ? 'Express' : 'Fastify'} Routing\n`);
      lines.push('Routes are typically defined in route files:\n');
      lines.push('```typescript');
      lines.push('router.get(\'/path\', handler);');
      lines.push('router.post(\'/path\', handler);');
      lines.push('```');
    } else if (stack.frameworks.includes('nestjs')) {
      lines.push('### NestJS Routing\n');
      lines.push('Routes are defined using decorators:\n');
      lines.push('```typescript');
      lines.push('@Controller(\'users\')');
      lines.push('class UsersController {');
      lines.push('  @Get()');
      lines.push('  findAll() { }');
      lines.push('}');
      lines.push('```');
    }

    // Add API pattern indicators
    if (patterns.hasApiPattern) {
      const apiIndicators = patterns.patterns.find((p) => p.type === 'api')?.indicators;
      if (apiIndicators?.length) {
        lines.push('\n### Detected Route Files\n');
        for (const ind of apiIndicators.slice(0, 5)) {
          if (ind.file) {
            lines.push(`- \`${path.relative(repoPath, ind.file)}\``);
          }
        }
      }
    }

    return lines.join('\n');
  }

  private async generateMiddlewareAnswer(
    repoPath: string,
    patterns: DetectedFunctionalPatterns
  ): Promise<string> {
    const lines: string[] = [];
    lines.push('## Middleware\n');
    lines.push('Middleware functions process requests before they reach route handlers.\n');

    if (patterns.hasAuthPattern) {
      lines.push('### Authentication Middleware');
      lines.push('The codebase includes authentication middleware.');
    }

    if (patterns.hasValidationPattern) {
      lines.push('\n### Validation Middleware');
      lines.push('Request validation is implemented using middleware.');
    }

    if (patterns.hasLoggingPattern) {
      lines.push('\n### Logging Middleware');
      lines.push('Request logging is handled by middleware.');
    }

    return lines.join('\n');
  }

  private generateAuthAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Authentication\n');

    const authPattern = patterns.patterns.find((p) => p.type === 'auth');
    if (!authPattern) {
      lines.push('Authentication patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of authPattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private generateDatabaseAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Database\n');

    const dbPattern = patterns.patterns.find((p) => p.type === 'database');
    if (!dbPattern) {
      lines.push('Database patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of dbPattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private async generateAPIEndpointsAnswer(
    repoPath: string,
    patterns: DetectedFunctionalPatterns
  ): Promise<string> {
    const lines: string[] = [];
    lines.push('## API Endpoints\n');

    const apiPattern = patterns.patterns.find((p) => p.type === 'api');
    if (!apiPattern) {
      lines.push('API patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Detected API Files\n');
    for (const ind of apiPattern.indicators.slice(0, 8)) {
      if (ind.file) {
        lines.push(`- \`${path.relative(repoPath, ind.file)}\` - ${ind.reason}`);
      }
    }

    return lines.join('\n');
  }

  private generateTestingAnswer(stack: StackInfo, patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Testing\n');

    if (stack.testFrameworks.length > 0) {
      lines.push(`### Test Frameworks: ${stack.testFrameworks.join(', ')}\n`);
    }

    lines.push('### Running Tests\n');
    lines.push('```bash');
    if (stack.testFrameworks.includes('jest')) {
      lines.push('npm test');
      lines.push('npm test -- --watch');
      lines.push('npm test -- --coverage');
    } else if (stack.testFrameworks.includes('vitest')) {
      lines.push('npm test');
      lines.push('npm test -- --watch');
    } else if (stack.testFrameworks.includes('pytest')) {
      lines.push('pytest');
      lines.push('pytest --cov');
    } else {
      lines.push('npm test');
    }
    lines.push('```');

    return lines.join('\n');
  }

  private generateErrorHandlingAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Error Handling\n');

    const errorPattern = patterns.patterns.find((p) => p.type === 'error-handling');
    if (!errorPattern) {
      lines.push('Error handling patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of errorPattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private generateCachingAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Caching\n');

    const cachePattern = patterns.patterns.find((p) => p.type === 'cache');
    if (!cachePattern) {
      lines.push('Caching patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of cachePattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private generateRealtimeAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Real-time Features\n');

    const wsPattern = patterns.patterns.find((p) => p.type === 'websocket');
    if (!wsPattern) {
      lines.push('WebSocket patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of wsPattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private generateBackgroundJobsAnswer(patterns: DetectedFunctionalPatterns): string {
    const lines: string[] = [];
    lines.push('## Background Jobs\n');

    const queuePattern = patterns.patterns.find((p) => p.type === 'queue');
    if (!queuePattern) {
      lines.push('Queue/job patterns detected in the codebase.');
      return lines.join('\n');
    }

    lines.push('### Implementation Details\n');
    for (const ind of queuePattern.indicators.slice(0, 5)) {
      lines.push(`- ${ind.reason}`);
    }

    return lines.join('\n');
  }

  private generateDeploymentAnswer(stack: StackInfo): string {
    const lines: string[] = [];
    lines.push('## Deployment\n');

    if (stack.hasDocker) {
      lines.push('### Docker\n');
      lines.push('This project includes Docker configuration.\n');
      lines.push('```bash');
      lines.push('docker build -t app .');
      lines.push('docker run -p 3000:3000 app');
      lines.push('```\n');
    }

    if (stack.hasCI) {
      lines.push('### CI/CD\n');
      lines.push('CI/CD pipelines are configured for this project.');
      lines.push('Check `.github/workflows/` or equivalent for pipeline configuration.');
    }

    return lines.join('\n');
  }

  // Helper methods

  private getPatternFiles(patterns: DetectedFunctionalPatterns, type: string, repoPath: string): string[] {
    const pattern = patterns.patterns.find((p) => p.type === type);
    if (!pattern) return [];
    return pattern.indicators
      .filter((i) => i.file)
      .map((i) => path.relative(repoPath, i.file))
      .slice(0, 5);
  }

  private async findRelevantFiles(repoPath: string, patterns: string[]): Promise<string[]> {
    const results: string[] = [];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__pycache__', 'vendor'];

    try {
      const entries = await fs.readdir(repoPath, { withFileTypes: true, recursive: true });

      for (const entry of entries) {
        const relativePath = path.relative(repoPath, path.join(entry.parentPath || '', entry.name));

        // Skip excluded directories
        if (excludeDirs.some((dir) => relativePath.startsWith(dir + path.sep) || relativePath === dir)) {
          continue;
        }

        for (const pattern of patterns) {
          if (relativePath.includes(pattern)) {
            results.push(relativePath);
            break;
          }
        }

        if (results.length >= 10) break;
      }
    } catch {
      // Ignore errors
    }

    return results;
  }

  private async saveQAEntries(
    repoPath: string,
    entries: QAEntry[],
    topicResult: TopicDetectionResult
  ): Promise<void> {
    const qaDir = path.join(repoPath, '.context', 'docs', 'qa');
    await fs.ensureDir(qaDir);

    // Save individual entries
    for (const entry of entries) {
      const content = this.formatQAEntry(entry);
      await fs.writeFile(path.join(qaDir, `${entry.slug}.md`), content);
    }

    // Generate README index
    const readme = this.generateQAReadme(entries, topicResult);
    await fs.writeFile(path.join(qaDir, 'README.md'), readme);
  }

  private formatQAEntry(entry: QAEntry): string {
    const lines: string[] = [];

    lines.push('---');
    lines.push(`slug: ${entry.slug}`);
    lines.push(`category: ${entry.category}`);
    lines.push(`generatedAt: ${entry.generatedAt}`);
    if (entry.relevantFiles.length > 0) {
      lines.push(`relevantFiles:`);
      for (const file of entry.relevantFiles) {
        lines.push(`  - ${file}`);
      }
    }
    lines.push('---\n');

    lines.push(`# ${entry.question}\n`);
    lines.push(entry.answer);

    return lines.join('\n');
  }

  private generateQAReadme(entries: QAEntry[], topicResult: TopicDetectionResult): string {
    const lines: string[] = [];

    lines.push('# Q&A Index\n');
    lines.push(`Project type: **${topicResult.projectType}**\n`);
    lines.push(`Generated: ${new Date().toISOString()}\n`);

    // Group by category
    const byCategory = new Map<string, QAEntry[]>();
    for (const entry of entries) {
      if (!byCategory.has(entry.category)) {
        byCategory.set(entry.category, []);
      }
      byCategory.get(entry.category)!.push(entry);
    }

    for (const [category, catEntries] of byCategory) {
      lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}\n`);
      for (const entry of catEntries) {
        lines.push(`- [${entry.question}](./${entry.slug}.md)`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private parseQAEntry(content: string, filename: string): QAEntry | null {
    try {
      const slug = filename.replace('.md', '');

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let category = 'general';
      let generatedAt = '';
      const relevantFiles: string[] = [];

      if (frontmatterMatch) {
        const fm = frontmatterMatch[1];
        const categoryMatch = fm.match(/category:\s*(.+)/);
        if (categoryMatch) category = categoryMatch[1].trim();

        const dateMatch = fm.match(/generatedAt:\s*(.+)/);
        if (dateMatch) generatedAt = dateMatch[1].trim();

        const filesMatch = fm.match(/relevantFiles:\n([\s\S]*?)(?=\n\w|$)/);
        if (filesMatch) {
          const files = filesMatch[1].match(/- (.+)/g);
          if (files) {
            relevantFiles.push(...files.map((f) => f.replace('- ', '').trim()));
          }
        }
      }

      // Parse question from first heading
      const questionMatch = content.match(/^#\s+(.+)/m);
      const question = questionMatch ? questionMatch[1] : slug;

      // Get answer (everything after the first heading)
      const answerStart = content.indexOf('\n', content.indexOf('# '));
      const answer = answerStart > 0 ? content.slice(answerStart).trim() : '';

      return {
        slug,
        question,
        answer,
        category,
        generatedAt,
        relevantFiles,
      };
    } catch {
      return null;
    }
  }

  private calculateRelevance(
    entry: QAEntry,
    queryLower: string,
    queryWords: string[]
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    // Exact slug match
    if (entry.slug.toLowerCase().includes(queryLower.replace(/\s+/g, '-'))) {
      score += 10;
      reasons.push('slug match');
    }

    // Question match
    const questionLower = entry.question.toLowerCase();
    if (questionLower.includes(queryLower)) {
      score += 8;
      reasons.push('question match');
    }

    // Word matches in question
    for (const word of queryWords) {
      if (questionLower.includes(word)) {
        score += 2;
        reasons.push(`word "${word}" in question`);
      }
    }

    // Answer match
    const answerLower = entry.answer.toLowerCase();
    for (const word of queryWords) {
      if (answerLower.includes(word)) {
        score += 1;
        reasons.push(`word "${word}" in answer`);
      }
    }

    // Category match
    if (entry.category.toLowerCase().includes(queryLower)) {
      score += 3;
      reasons.push('category match');
    }

    return {
      score,
      reason: reasons.slice(0, 3).join(', ') || 'partial match',
    };
  }

  /**
   * Convert persisted summary stack section to StackInfo format
   */
  private convertMapStackToStackInfo(map: CodebaseMap): StackInfo {
    return {
      primaryLanguage: map.stack.primaryLanguage,
      languages: map.stack.languages,
      frameworks: map.stack.frameworks,
      buildTools: map.stack.buildTools,
      testFrameworks: map.stack.testFrameworks,
      packageManager: map.stack.packageManager,
      isMonorepo: map.stack.isMonorepo,
      hasDocker: map.stack.hasDocker,
      hasCI: map.stack.hasCI,
      files: [],
      hasBinField: map.stack.hasBinField,
      cliLibraries: map.stack.cliLibraries || [],
      hasMainExport: map.stack.hasMainExport,
      hasTypesField: map.stack.hasTypesField,
    };
  }

  /**
   * Shutdown analyzer resources
   */
  async shutdown(): Promise<void> {
    await this.analyzer.shutdown();
  }
}
