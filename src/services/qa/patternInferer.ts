/**
 * Pattern Inferer
 *
 * Backward-compatible adapter for persisted codebase summaries.
 * Functional patterns are now stored directly in the summary artifact.
 */

import type { CodebaseMap } from '../../generators/documentation/codebaseMapGenerator';
import type { DetectedFunctionalPatterns } from '../semantic/types';
import { createEmptyFunctionalPatterns } from '../../generators/documentation/codebaseMapGenerator';

export class PatternInferer {
  inferFromMap(map: CodebaseMap): DetectedFunctionalPatterns {
    return map.functionalPatterns ?? createEmptyFunctionalPatterns();
  }
}
