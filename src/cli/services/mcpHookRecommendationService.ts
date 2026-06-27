/**
 * MCP Hook Recommendation Service
 *
 * Pure CLI-boundary helpers for deciding whether an MCP install should
 * recommend companion lifecycle hooks. MCP installation itself remains
 * handled only by MCPInstallService.
 */

import type { HookHost } from './hookInstallService';
import type { MCPInstallation } from './mcpInstallService';

export type HookRecommendationMode = 'prompt' | 'install' | 'skip' | 'suggest';

export type HookRecommendationReason =
  | 'eligible'
  | 'hooks-disabled'
  | 'non-interactive'
  | 'no-eligible-targets'
  | 'fallback-all-without-detected-tools';

export type RecommendedHookFormat = 'json' | 'toml';

export type RecommendedHookSourceTool = 'claude' | 'codex' | 'pi';

export interface RecommendedHookTarget {
  host: HookHost;
  sourceTool: RecommendedHookSourceTool;
  displayName: string;
}

export interface GetRecommendedHookTargetsInput {
  /** Raw CLI-requested MCP tool, before interactive resolution. */
  requestedTool?: string;
  /** MCP tool selected for installation after prompt/default resolution. */
  selectedTool: string;
  /** Tools detected before MCP install; used to distinguish all-detected from all-fallback. */
  detectedTools?: string[];
  /** MCP install actions returned by MCPInstallService. */
  mcpInstallations: Array<Pick<MCPInstallation, 'tool'>>;
}

export interface GetMcpHookRecommendationDecisionInput extends GetRecommendedHookTargetsInput {
  isInteractive: boolean;
  withHooks?: boolean;
  noHooks?: boolean;
}

export interface MCPHookRecommendationDecision {
  mode: HookRecommendationMode;
  reason: HookRecommendationReason;
  /**
   * Eligible targets for prompt/install. Empty when the flow should only show
   * a manual suggestion, such as the "all" fallback with no detected tools.
   */
  targets: RecommendedHookTarget[];
  /**
   * Targets useful for manual next-step messaging. This is populated for
   * non-interactive suggestions and for the "all" fallback availability note.
   */
  suggestedTargets: RecommendedHookTarget[];
}

export interface MCPHookRecommendationOptionValidationInput {
  withHooks?: boolean;
  noHooks?: boolean;
  hookFormat?: string;
}

export interface BuildHookInstallCommandOptions {
  packageSpec?: string;
  global?: boolean;
  format?: RecommendedHookFormat;
}

export type GetRecommendedHookTargetsOptions = GetRecommendedHookTargetsInput;

const MCP_TOOL_HOOK_TARGETS: Record<RecommendedHookSourceTool, RecommendedHookTarget> = {
  claude: {
    host: 'claude-code',
    sourceTool: 'claude',
    displayName: 'Claude Code',
  },
  codex: {
    host: 'codex',
    sourceTool: 'codex',
    displayName: 'Codex CLI',
  },
  pi: {
    host: 'pi',
    sourceTool: 'pi',
    displayName: 'Pi',
  },
};

const HOOK_RECOMMENDATION_ORDER: RecommendedHookSourceTool[] = ['claude', 'codex', 'pi'];

function normalizeToolId(tool: string | undefined): string | undefined {
  const normalized = tool?.trim();
  return normalized ? normalized : undefined;
}

function uniqueToolIds(tools: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const tool of tools) {
    const normalized = normalizeToolId(tool);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function cloneTarget(target: RecommendedHookTarget): RecommendedHookTarget {
  return { ...target };
}

function targetForTool(tool: string | undefined): RecommendedHookTarget | undefined {
  const normalized = normalizeToolId(tool);
  if (!normalized) {
    return undefined;
  }

  return MCP_TOOL_HOOK_TARGETS[normalized as RecommendedHookSourceTool]
    ? cloneTarget(MCP_TOOL_HOOK_TARGETS[normalized as RecommendedHookSourceTool])
    : undefined;
}

function targetsForTools(tools: string[]): RecommendedHookTarget[] {
  const seenHosts = new Set<HookHost>();
  const targets: RecommendedHookTarget[] = [];

  for (const tool of tools) {
    const target = targetForTool(tool);
    if (!target || seenHosts.has(target.host)) {
      continue;
    }

    seenHosts.add(target.host);
    targets.push(target);
  }

  return targets;
}

export function getAvailableRecommendedHookTargets(): RecommendedHookTarget[] {
  return HOOK_RECOMMENDATION_ORDER.map((tool) => cloneTarget(MCP_TOOL_HOOK_TARGETS[tool]));
}

export function getHookCapableMcpToolIds(): RecommendedHookSourceTool[] {
  return [...HOOK_RECOMMENDATION_ORDER];
}

export function getHookHostForMcpTool(tool: string): HookHost | undefined {
  return targetForTool(tool)?.host;
}

export function getHookHostDisplayName(host: HookHost): string {
  const target = getAvailableRecommendedHookTargets().find((candidate) => candidate.host === host);
  return target?.displayName ?? host;
}

export function buildHookInstallCommand(
  host: HookHost,
  options: BuildHookInstallCommandOptions = {}
): string {
  const packageSpec = options.packageSpec ?? '@dotcontext/cli@latest';
  const args = ['npx', '-y', packageSpec, 'hook', 'install', host];

  if (options.global) {
    args.push('--global');
  }

  if (host === 'codex' && options.format) {
    args.push('--format', options.format);
  }

  return args.join(' ');
}

export function isHookRecommendationEligibleMcpTool(tool: string): boolean {
  return targetForTool(tool) !== undefined;
}

export function getRecommendedHookTargetForMcpTool(
  tool: string
): RecommendedHookTarget | undefined {
  return targetForTool(tool);
}

export function isMcpInstallAllFallback(input: GetRecommendedHookTargetsInput): boolean {
  const selectedTool = normalizeToolId(input.selectedTool) ?? normalizeToolId(input.requestedTool);
  return (
    selectedTool === 'all' &&
    uniqueToolIds(input.detectedTools ?? []).length === 0 &&
    input.mcpInstallations.length > 0
  );
}

export function getRecommendedHookTargets(
  input: GetRecommendedHookTargetsInput
): RecommendedHookTarget[] {
  const selectedTool = normalizeToolId(input.selectedTool) ?? normalizeToolId(input.requestedTool);
  const attemptedTools = uniqueToolIds(
    input.mcpInstallations.map((installation) => installation.tool)
  );
  if (!selectedTool || attemptedTools.length === 0) {
    return [];
  }

  const attemptedToolSet = new Set(attemptedTools);
  const candidateTools = selectedTool === 'all'
    ? uniqueToolIds(input.detectedTools ?? []).filter((tool) => attemptedToolSet.has(tool))
    : [selectedTool].filter((tool) => attemptedToolSet.has(tool));

  return targetsForTools(candidateTools);
}

export function getMcpHookSuggestionTargets(
  input: GetRecommendedHookTargetsInput
): RecommendedHookTarget[] {
  const targets = getRecommendedHookTargets(input);
  if (targets.length > 0) {
    return targets;
  }

  return isMcpInstallAllFallback(input) ? getAvailableRecommendedHookTargets() : [];
}

export function getMcpHookRecommendationDecision(
  input: GetMcpHookRecommendationDecisionInput
): MCPHookRecommendationDecision {
  validateMcpHookRecommendationOptions(input);

  const targets = getRecommendedHookTargets(input);

  if (input.noHooks) {
    return {
      mode: 'skip',
      reason: 'hooks-disabled',
      targets: [],
      suggestedTargets: [],
    };
  }

  if (isMcpInstallAllFallback(input)) {
    return {
      mode: 'suggest',
      reason: 'fallback-all-without-detected-tools',
      targets: [],
      suggestedTargets: getAvailableRecommendedHookTargets(),
    };
  }

  if (targets.length === 0) {
    return {
      mode: 'skip',
      reason: 'no-eligible-targets',
      targets: [],
      suggestedTargets: [],
    };
  }

  if (input.withHooks) {
    return {
      mode: 'install',
      reason: 'eligible',
      targets,
      suggestedTargets: [],
    };
  }

  if (input.isInteractive) {
    return {
      mode: 'prompt',
      reason: 'eligible',
      targets,
      suggestedTargets: [],
    };
  }

  return {
    mode: 'suggest',
    reason: 'non-interactive',
    targets,
    suggestedTargets: targets.map(cloneTarget),
  };
}

export function parseRecommendedHookFormat(hookFormat?: string): RecommendedHookFormat {
  if (hookFormat === undefined) {
    return 'json';
  }

  if (hookFormat === 'json' || hookFormat === 'toml') {
    return hookFormat;
  }

  throw new Error('Invalid --hook-format value. Expected "json" or "toml".');
}

export function validateMcpHookRecommendationOptions(
  input: MCPHookRecommendationOptionValidationInput
): void {
  if (input.withHooks && input.noHooks) {
    throw new Error('Cannot use --with-hooks and --no-hooks together.');
  }

  parseRecommendedHookFormat(input.hookFormat);
}
