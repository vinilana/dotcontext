/**
 * Reverse Sync Presets
 *
 * Configuration for skill sources and tool mappings.
 * Derived from the unified tool registry.
 */

import type { RuleSource } from '../import/types';
import {
  getSkillsImportSources,
  getDirectoryPrefixMap,
  getDisplayNameMap,
  getCapabilitiesMap,
  getAllToolIds,
  getToolIdFromPath as registryGetToolIdFromPath,
  getToolDisplayName as registryGetToolDisplayName,
  getToolCapabilities as registryGetToolCapabilities,
  ToolCapabilities,
} from '../../../../shared';

// ============================================================================
// Skill Sources (derived from tool registry)
// ============================================================================

/**
 * Sources for skill detection (derived from tool registry)
 */
export const SKILL_SOURCES: RuleSource[] = getSkillsImportSources();

// ============================================================================
// Tool Name Mappings (derived from tool registry)
// ============================================================================

/**
 * Map directory prefixes to canonical tool identifiers (derived from tool registry)
 */
export const TOOL_NAME_MAP: Record<string, string> = getDirectoryPrefixMap();

/**
 * Human-readable display names for AI tools (derived from tool registry)
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = getDisplayNameMap();

/**
 * Tool capabilities - which content types each tool supports (derived from tool registry)
 */
export const TOOL_CAPABILITIES: Record<string, ToolCapabilities> = getCapabilitiesMap();

/**
 * All known tool identifiers (derived from tool registry)
 */
export const ALL_TOOL_IDS = getAllToolIds();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a skill source by name
 */
export function getSkillSourceByName(name: string): RuleSource | undefined {
  return SKILL_SOURCES.find((s) => s.name === name);
}

/**
 * Get all skill source names
 */
export function getAllSkillSourceNames(): string[] {
  return SKILL_SOURCES.map((s) => s.name);
}

/**
 * Extract tool ID from a file path (delegates to tool registry)
 * @param filePath - Relative or absolute path
 * @returns Tool ID or 'unknown' if not recognized
 */
export function getToolIdFromPath(filePath: string): string {
  return registryGetToolIdFromPath(filePath);
}

/**
 * Get display name for a tool ID (delegates to tool registry)
 */
export function getToolDisplayName(toolId: string): string {
  return registryGetToolDisplayName(toolId);
}

/**
 * Get tool capabilities (delegates to tool registry)
 */
export function getToolCapabilities(toolId: string): ToolCapabilities {
  return registryGetToolCapabilities(toolId);
}
