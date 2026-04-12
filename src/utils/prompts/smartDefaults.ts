import * as fs from 'fs';
import * as path from 'path';
import type { SmartDefaults } from './types';

/**
 * Detects smart defaults from environment and project structure
 */
export async function detectSmartDefaults(basePath?: string): Promise<SmartDefaults> {
  const repoPath = basePath || process.cwd();
  const outputDir = path.resolve(repoPath, '.context');

  // Check if scaffold exists
  const scaffoldExists = fs.existsSync(outputDir);

  // Detect languages from project files
  const detectedLanguages = await detectProjectLanguages(repoPath);

  return {
    repoPath,
    outputDir,
    scaffoldExists,
    detectedLanguages
  };
}

/**
 * Detects programming languages used in the project
 */
async function detectProjectLanguages(repoPath: string): Promise<string[]> {
  const languages: string[] = [];

  // Check for TypeScript
  if (
    fs.existsSync(path.join(repoPath, 'tsconfig.json')) ||
    fs.existsSync(path.join(repoPath, 'tsconfig.base.json'))
  ) {
    languages.push('typescript');
  }

  // Check for JavaScript (package.json without TypeScript)
  if (fs.existsSync(path.join(repoPath, 'package.json')) && !languages.includes('typescript')) {
    languages.push('javascript');
  }

  // Check for Python
  if (
    fs.existsSync(path.join(repoPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(repoPath, 'setup.py')) ||
    fs.existsSync(path.join(repoPath, 'requirements.txt'))
  ) {
    languages.push('python');
  }

  // Default to common languages if none detected
  if (languages.length === 0) {
    return ['typescript', 'javascript'];
  }

  return languages;
}
