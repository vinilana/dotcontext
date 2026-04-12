/**
 * CLI service exports.
 *
 * These services belong to the operator-facing CLI boundary.
 */

export {
  MCPInstallService,
  type MCPInstallServiceDependencies,
  type MCPInstallOptions,
  type MCPInstallResult,
  type MCPInstallation,
} from './mcpInstallService';

export {
  StateDetector,
  default as DefaultStateDetector,
  type ProjectState,
  type StateDetectionResult,
  type StateDetectorOptions,
} from './stateDetector';
