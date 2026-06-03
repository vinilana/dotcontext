/**
 * Project Type Classifier
 *
 * Classifies projects into categories based on detected stack information.
 * Used to filter which agents, skills, and documentation are relevant.
 */

import { StackInfo } from './stackDetector';

export const PROJECT_TYPES = [
  'cli',
  'web-frontend',
  'web-backend',
  'full-stack',
  'mobile',
  'library',
  'monorepo',
  'desktop',
  'unknown',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ProjectClassification {
  primaryType: ProjectType;
  secondaryTypes: ProjectType[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
}

/**
 * Framework categories for project type detection.
 * Exported for testing and extensibility.
 */
export const FRAMEWORK_CATEGORIES = {
  frontend: [
    'react',
    'vue',
    'angular',
    'svelte',
    'nextjs',
    'nuxt',
    'gatsby',
    'remix',
    'astro',
    'solid',
    'qwik',
  ],
  backend: [
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
    'spring',
    'phoenix',
    'gin',
    'echo',
    'fiber',
  ],
  mobile: ['react-native', 'flutter', 'ionic', 'capacitor', 'expo'],
  desktop: ['electron', 'tauri', 'neutralino'],
  cli: [
    'commander',
    'yargs',
    'meow',
    'inquirer',
    'prompts',
    'chalk',
    'ora',
    'listr',
    'oclif',
    'clipanion',
    'cac',
    'arg',
  ],
  monorepo: ['lerna', 'nx', 'turborepo', 'pnpm-workspace', 'rush'],
} as const;

/** Confidence thresholds for classification */
const CONFIDENCE_THRESHOLDS = {
  high: 3, // 3+ reasons = high confidence
  medium: 1, // 1-2 reasons = medium confidence
} as const;

/**
 * Extended stack info with additional fields for classification
 */
export interface ExtendedStackInfo extends StackInfo {
  hasBinField?: boolean;
  hasMainExport?: boolean;
  hasTypesField?: boolean;
  cliLibraries?: string[];
}

/**
 * Helper to check if any framework matches a category (case-insensitive)
 */
function matchesCategory(frameworks: string[], category: readonly string[]): boolean {
  return frameworks.some((f) =>
    category.some((c) => f.toLowerCase().includes(c))
  );
}

/**
 * Helper to get matching frameworks from a category
 */
function getMatchingFrameworks(frameworks: string[], category: readonly string[]): string[] {
  return frameworks.filter((f) =>
    category.some((c) => f.toLowerCase().includes(c))
  );
}

/**
 * Classify a project based on its detected stack
 */
export function classifyProject(stack: StackInfo | ExtendedStackInfo): ProjectClassification {
  const reasoning: string[] = [];
  const detectedTypes: ProjectType[] = [];
  const extStack = stack as ExtendedStackInfo;

  // Check for monorepo first (can contain other types)
  const hasMonorepoTools = stack.isMonorepo ||
    stack.buildTools.some((t) => FRAMEWORK_CATEGORIES.monorepo.includes(t as typeof FRAMEWORK_CATEGORIES.monorepo[number]));
  if (hasMonorepoTools) {
    detectedTypes.push('monorepo');
    reasoning.push('Monorepo tools detected (lerna, nx, turborepo, or pnpm-workspace)');
  }

  // Check for mobile project
  const hasMobileFramework = matchesCategory(stack.frameworks, FRAMEWORK_CATEGORIES.mobile);
  if (hasMobileFramework) {
    detectedTypes.push('mobile');
    const matched = getMatchingFrameworks(stack.frameworks, FRAMEWORK_CATEGORIES.mobile);
    reasoning.push(`Mobile framework detected: ${matched.join(', ')}`);
  }

  // Check for desktop project
  const hasDesktopFramework = matchesCategory(stack.frameworks, FRAMEWORK_CATEGORIES.desktop);
  if (hasDesktopFramework) {
    detectedTypes.push('desktop');
    const matched = getMatchingFrameworks(stack.frameworks, FRAMEWORK_CATEGORIES.desktop);
    reasoning.push(`Desktop framework detected: ${matched.join(', ')}`);
  }

  // Check for frontend and backend frameworks
  const hasFrontendFramework = matchesCategory(stack.frameworks, FRAMEWORK_CATEGORIES.frontend);
  const hasBackendFramework = matchesCategory(stack.frameworks, FRAMEWORK_CATEGORIES.backend);

  // Determine web project type
  if (hasFrontendFramework && hasBackendFramework) {
    detectedTypes.push('full-stack');
    reasoning.push('Both frontend and backend frameworks detected');
  } else if (hasFrontendFramework) {
    detectedTypes.push('web-frontend');
    const matched = getMatchingFrameworks(stack.frameworks, FRAMEWORK_CATEGORIES.frontend);
    reasoning.push(`Frontend framework detected: ${matched.join(', ')}`);
  } else if (hasBackendFramework) {
    detectedTypes.push('web-backend');
    const matched = getMatchingFrameworks(stack.frameworks, FRAMEWORK_CATEGORIES.backend);
    reasoning.push(`Backend framework detected: ${matched.join(', ')}`);
  }

  // Check for CLI project
  const hasCLIIndicators =
    extStack.hasBinField ||
    (extStack.cliLibraries && extStack.cliLibraries.length > 0) ||
    stack.files.some((f) => f.match(/^(bin\/|cli\.(js|ts)$)/));

  if (hasCLIIndicators && !hasFrontendFramework && !hasMobileFramework) {
    detectedTypes.push('cli');
    if (extStack.hasBinField) {
      reasoning.push('package.json has bin field');
    }
    if (extStack.cliLibraries && extStack.cliLibraries.length > 0) {
      reasoning.push(`CLI libraries detected: ${extStack.cliLibraries.join(', ')}`);
    }
    if (stack.files.some((f) => f.match(/^(bin\/|cli\.(js|ts)$)/))) {
      reasoning.push('CLI entry files detected (bin/ or cli.js/ts)');
    }
  }

  // Check for library/package
  const isLibrary =
    extStack.hasMainExport &&
    !extStack.hasBinField &&
    !hasFrontendFramework &&
    !hasBackendFramework &&
    !hasMobileFramework;

  if (isLibrary) {
    detectedTypes.push('library');
    reasoning.push('Has main/exports field without bin, frontend, or backend indicators');
    if (extStack.hasTypesField) {
      reasoning.push('Has types/typings field (TypeScript library)');
    }
  }

  // Determine primary and secondary types based on priority
  const { primaryType, secondaryTypes } = prioritizeTypes(detectedTypes);

  // Determine confidence based on reasoning count
  const confidence = calculateConfidence(reasoning.length);

  // Add fallback reasoning if nothing detected
  if (primaryType === 'unknown') {
    reasoning.push('Unable to determine project type from detected stack');
    if (stack.primaryLanguage) {
      reasoning.push(`Primary language: ${stack.primaryLanguage}`);
    }
  }

  return { primaryType, secondaryTypes, confidence, reasoning };
}

/**
 * Type priority order for classification.
 * Higher priority types take precedence when multiple are detected.
 */
const TYPE_PRIORITY: readonly ProjectType[] = [
  'monorepo',
  'full-stack',
  'mobile',
  'desktop',
  'web-frontend',
  'web-backend',
  'cli',
  'library',
];

/**
 * Prioritize detected types and return primary + secondary
 */
function prioritizeTypes(detectedTypes: ProjectType[]): {
  primaryType: ProjectType;
  secondaryTypes: ProjectType[];
} {
  let primaryType: ProjectType = 'unknown';
  const secondaryTypes: ProjectType[] = [];

  for (const type of TYPE_PRIORITY) {
    if (detectedTypes.includes(type)) {
      if (primaryType === 'unknown') {
        primaryType = type;
      } else {
        secondaryTypes.push(type);
      }
    }
  }

  return { primaryType, secondaryTypes };
}

/**
 * Calculate confidence level based on reasoning count
 */
function calculateConfidence(reasoningCount: number): 'high' | 'medium' | 'low' {
  if (reasoningCount >= CONFIDENCE_THRESHOLDS.high) {
    return 'high';
  }
  if (reasoningCount >= CONFIDENCE_THRESHOLDS.medium) {
    return 'medium';
  }
  return 'low';
}

/**
 * Get CLI libraries from dependencies
 */
export function detectCLILibraries(dependencies: Record<string, string>): string[] {
  return FRAMEWORK_CATEGORIES.cli.filter((lib) => lib in dependencies);
}

/**
 * Check if package.json indicates a library
 */
export function isLibraryPackage(packageJson: {
  main?: string;
  exports?: unknown;
  bin?: unknown;
  types?: string;
  typings?: string;
}): { hasMain: boolean; hasBin: boolean; hasTypes: boolean } {
  return {
    hasMain: !!(packageJson.main || packageJson.exports),
    hasBin: !!packageJson.bin,
    hasTypes: !!(packageJson.types || packageJson.typings),
  };
}
