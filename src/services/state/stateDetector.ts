/**
 * @deprecated Import from ../cli/stateDetector instead.
 *
 * This shim preserves the previous path while the codebase is being split
 * into CLI-facing and harness-facing boundaries.
 */

export {
  StateDetector,
  default,
  type ProjectState,
  type StateDetectionResult,
  type StateDetectorOptions,
} from '../cli/stateDetector';
