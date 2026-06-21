/**
 * Auto-Advance Service
 *
 * Automatically detects when phase outputs are complete and advances the workflow.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import {
  PrevcPhase,
  PrevcStatus,
  getOutputsForPhase,
} from '../../domain/workflow';

export interface AutoAdvanceResult {
  shouldAdvance: boolean;
  reason?: string;
  detectedOutputs: string[];
  missingOutputs: string[];
}

/**
 * Expected outputs for each phase (file patterns)
 */
const PHASE_OUTPUT_PATTERNS: Record<PrevcPhase, string[]> = {
  P: [
    '**/PRD.md',
    '**/requirements*.md',
    '**/specs*.md',
    '**/user-stories*.md',
    '**/*planning*.md',
  ],
  R: [
    '**/architecture*.md',
    '**/design*.md',
    '**/ADR*.md',
    '**/tech-spec*.md',
    '**/*review*.md',
  ],
  E: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.py',
    '**/*.go',
    '**/*.rs',
    '**/*.java',
  ],
  V: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/test_*.py',
    '**/*_test.go',
    '**/tests/**',
    '**/__tests__/**',
  ],
  C: [
    '**/CHANGELOG*.md',
    '**/RELEASE*.md',
    '**/deployment*.md',
    '**/*confirmation*.md',
  ],
};

/**
 * Minimum number of new files to consider phase complete
 */
const PHASE_MIN_FILES: Record<PrevcPhase, number> = {
  P: 1,
  R: 1,
  E: 1,
  V: 1,
  C: 1,
};

export class AutoAdvanceDetector {
  private contextPath: string;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
    this.contextPath = path.join(this.repoPath, '.context');
  }

  /**
   * Check if the current phase should auto-advance
   */
  async checkAutoAdvance(
    currentPhase: PrevcPhase,
    status: PrevcStatus
  ): Promise<AutoAdvanceResult> {
    const result: AutoAdvanceResult = {
      shouldAdvance: false,
      detectedOutputs: [],
      missingOutputs: [],
    };

    const patterns = PHASE_OUTPUT_PATTERNS[currentPhase];
    const minFiles = PHASE_MIN_FILES[currentPhase];

    // Get phase start time
    const phaseStatus = status.phases[currentPhase];
    const phaseStartTime = phaseStatus?.started_at
      ? new Date(phaseStatus.started_at)
      : new Date(0);

    // Search for new files matching the patterns
    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, {
          cwd: this.repoPath,
          ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
          absolute: true,
        });

        for (const match of matches) {
          try {
            const stats = await fs.stat(match);
            // File was modified after phase started
            if (stats.mtime > phaseStartTime) {
              const relativePath = path.relative(this.repoPath, match);
              if (!result.detectedOutputs.includes(relativePath)) {
                result.detectedOutputs.push(relativePath);
              }
            }
          } catch {
            // File stat failed, skip
          }
        }
      } catch {
        // Glob failed, skip pattern
      }
    }

    // Check if we have enough outputs
    if (result.detectedOutputs.length >= minFiles) {
      result.shouldAdvance = true;
      result.reason = `Detected ${result.detectedOutputs.length} output(s) for phase ${currentPhase}`;
    } else {
      result.missingOutputs = this.getExpectedOutputTypes(currentPhase);
      result.reason = `Waiting for outputs: ${result.missingOutputs.join(', ')}`;
    }

    return result;
  }

  /**
   * Get human-readable expected output types for a phase
   */
  private getExpectedOutputTypes(phase: PrevcPhase): string[] {
    const outputMap: Record<PrevcPhase, string[]> = {
      P: ['PRD document', 'Requirements specification', 'User stories'],
      R: ['Architecture document', 'Design decisions', 'Technical spec'],
      E: ['Implementation code', 'Source files'],
      V: ['Test files', 'Test results'],
      C: ['Changelog', 'Release notes', 'Documentation updates'],
    };

    return outputMap[phase] || [];
  }

  /**
   * Watch for file changes and trigger callback when outputs detected
   */
  async watchForOutputs(
    currentPhase: PrevcPhase,
    status: PrevcStatus,
    onOutputsDetected: (outputs: string[]) => void,
    intervalMs: number = 5000
  ): Promise<() => void> {
    let running = true;
    let previousOutputs = new Set<string>();

    const check = async () => {
      if (!running) return;

      const result = await this.checkAutoAdvance(currentPhase, status);

      // Find new outputs
      const newOutputs = result.detectedOutputs.filter(
        (o) => !previousOutputs.has(o)
      );

      if (newOutputs.length > 0) {
        newOutputs.forEach((o) => previousOutputs.add(o));
        onOutputsDetected(newOutputs);
      }

      if (running) {
        setTimeout(check, intervalMs);
      }
    };

    // Start checking
    check();

    // Return stop function
    return () => {
      running = false;
    };
  }

  /**
   * Validate outputs for a phase
   */
  async validatePhaseOutputs(
    phase: PrevcPhase,
    outputs: string[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const output of outputs) {
      const fullPath = path.isAbsolute(output)
        ? output
        : path.join(this.repoPath, output);

      if (!(await fs.pathExists(fullPath))) {
        errors.push(`Output file not found: ${output}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export { AutoAdvanceDetector as default };
