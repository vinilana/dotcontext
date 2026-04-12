/**
 * @deprecated Import from ../cli/mcpInstallService instead.
 *
 * This shim preserves the previous path while the codebase is being split
 * into CLI-facing and harness-facing boundaries.
 */

export {
  MCPInstallService,
  type MCPInstallServiceDependencies,
  type MCPInstallOptions,
  type MCPInstallResult,
  type MCPInstallation,
} from '../cli/mcpInstallService';
