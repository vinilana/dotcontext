/**
 * Import Presets
 *
 * Rule and agent source definitions for import/detection services.
 * Derived from the unified tool registry with some legacy naming for backward compatibility.
 */

import type { RuleSource } from './types';
import { getRulesImportSources, getAgentsImportSources } from '../shared';

/**
 * Build rule sources from the unified tool registry
 * Maintains legacy naming for backward compatibility
 */
function buildRuleSources(): RuleSource[] {
  const registrySources = getRulesImportSources();

  // Add generic AI rules files (not in registry)
  const genericSource: RuleSource = {
    name: 'generic',
    paths: ['AI_RULES.md', 'CODING_RULES.md', 'AI_INSTRUCTIONS.md', 'CLAUDE.md', 'AGENTS.md'],
    patterns: ['**/AI_RULES.md', '**/CODING_RULES.md', '**/AI_INSTRUCTIONS.md', '**/CLAUDE.md', '**/AGENTS.md'],
    description: 'Generic AI coding rules files'
  };

  return [...registrySources, genericSource];
}

/**
 * Build agent sources from the unified tool registry
 */
function buildAgentSources(): RuleSource[] {
  return getAgentsImportSources();
}

/**
 * Rule sources for import/detection (derived from tool registry)
 */
export const RULE_SOURCES: RuleSource[] = buildRuleSources();

/**
 * Agent sources for import/detection (derived from tool registry)
 */
export const AGENT_SOURCES: RuleSource[] = buildAgentSources();

export function getRuleSourceByName(name: string): RuleSource | undefined {
  return RULE_SOURCES.find(s => s.name === name);
}

export function getAgentSourceByName(name: string): RuleSource | undefined {
  return AGENT_SOURCES.find(s => s.name === name);
}

export function getAllRuleSourceNames(): string[] {
  return RULE_SOURCES.map(s => s.name);
}

export function getAllAgentSourceNames(): string[] {
  return AGENT_SOURCES.map(s => s.name);
}
