/**
 * Tool Detector
 *
 * High-level detector that identifies which AI tools are present
 * and aggregates results from rules, agents, and skills detectors.
 */

import type { ToolPresence, ToolDetectionResult, SkillFileInfo } from './types';
import type { RuleFileInfo } from '../import/types';
import { RulesDetector } from '../import/rulesDetector';
import { AgentsDetector } from '../import/agentsDetector';
import { SkillsDetector } from './skillsDetector';
import {
  ALL_TOOL_IDS,
  TOOL_DISPLAY_NAMES,
  TOOL_CAPABILITIES,
  getToolIdFromPath,
  getToolDisplayName,
} from './presets';

export class ToolDetector {
  private rulesDetector: RulesDetector;
  private agentsDetector: AgentsDetector;
  private skillsDetector: SkillsDetector;

  constructor() {
    this.rulesDetector = new RulesDetector();
    this.agentsDetector = new AgentsDetector();
    this.skillsDetector = new SkillsDetector();
  }

  /**
   * Detect all AI tools present in the repository
   * Returns a high-level summary grouped by tool
   */
  async detect(repoPath: string): Promise<ToolDetectionResult> {
    // Run all detectors in parallel
    const [rulesResult, agentsResult, skillsResult] = await Promise.all([
      this.rulesDetector.detectRules(repoPath, true),
      this.agentsDetector.detectAgents(repoPath, true),
      this.skillsDetector.detectSkills(repoPath, true),
    ]);

    // Group results by tool
    const tools = this.groupByTool(
      rulesResult.files,
      agentsResult.files,
      skillsResult.files
    );

    // Calculate summary
    const summary = {
      toolsFound: tools.filter((t) => t.detected).length,
      totalRules: rulesResult.files.length,
      totalAgents: agentsResult.files.length,
      totalSkills: skillsResult.files.length,
      totalFiles:
        rulesResult.files.length + agentsResult.files.length + skillsResult.files.length,
    };

    return { tools, summary };
  }

  /**
   * Get detection for a specific tool
   */
  async detectTool(repoPath: string, toolId: string): Promise<ToolPresence | null> {
    const result = await this.detect(repoPath);
    return result.tools.find((t) => t.id === toolId) || null;
  }

  /**
   * Group detected files by their source tool
   */
  private groupByTool(
    rules: RuleFileInfo[],
    agents: RuleFileInfo[],
    skills: SkillFileInfo[]
  ): ToolPresence[] {
    // Initialize tool presence map with all known tools
    const toolMap = new Map<string, ToolPresence>();

    for (const toolId of ALL_TOOL_IDS) {
      const capabilities = TOOL_CAPABILITIES[toolId] || {
        rules: false,
        agents: false,
        skills: false,
      };

      toolMap.set(toolId, {
        id: toolId,
        displayName: getToolDisplayName(toolId),
        detected: false,
        paths: {
          rules: [],
          agents: [],
          skills: [],
        },
        counts: {
          rules: 0,
          agents: 0,
          skills: 0,
          total: 0,
        },
      });
    }

    // Group rules by tool
    for (const rule of rules) {
      const toolId = this.getToolIdForRule(rule);
      const tool = toolMap.get(toolId);
      if (tool) {
        tool.paths.rules.push(rule.relativePath);
        tool.counts.rules++;
        tool.counts.total++;
        tool.detected = true;
      }
    }

    // Group agents by tool
    for (const agent of agents) {
      const toolId = getToolIdFromPath(agent.relativePath);
      const tool = toolMap.get(toolId);
      if (tool) {
        tool.paths.agents.push(agent.relativePath);
        tool.counts.agents++;
        tool.counts.total++;
        tool.detected = true;
      }
    }

    // Group skills by tool
    for (const skill of skills) {
      const toolId = skill.sourceTool;
      const tool = toolMap.get(toolId);
      if (tool) {
        tool.paths.skills.push(skill.relativePath);
        tool.counts.skills++;
        tool.counts.total++;
        tool.detected = true;
      }
    }

    // Return sorted by detection status (detected first), then by name
    return Array.from(toolMap.values()).sort((a, b) => {
      if (a.detected !== b.detected) {
        return a.detected ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }

  /**
   * Determine tool ID for a rule file
   * Uses the rule type and path to identify the tool
   */
  private getToolIdForRule(rule: RuleFileInfo): string {
    // First try to get tool from path
    const toolFromPath = getToolIdFromPath(rule.relativePath);
    if (toolFromPath !== 'unknown') {
      return toolFromPath;
    }

    // Fall back to rule type mapping
    const typeToTool: Record<string, string> = {
      cursorrules: 'cursor',
      'claude-memory': 'claude',
      'github-copilot': 'github',
      windsurfrules: 'windsurf',
      clinerules: 'cline',
      continue: 'continue',
      aider: 'aider',
      codex: 'codex',
      gemini: 'gemini',
      antigravity: 'antigravity',
      trae: 'trae',
      zed: 'zed',
      generic: 'unknown',
    };

    return typeToTool[rule.type] || 'unknown';
  }
}

/**
 * Format detection result for display
 */
export function formatDetectionSummary(result: ToolDetectionResult): string {
  const lines: string[] = [];

  lines.push('Detected AI Tools:');
  lines.push('');

  for (const tool of result.tools) {
    if (tool.detected) {
      const parts: string[] = [];
      if (tool.counts.rules > 0) parts.push(`${tool.counts.rules} rules`);
      if (tool.counts.agents > 0) parts.push(`${tool.counts.agents} agents`);
      if (tool.counts.skills > 0) parts.push(`${tool.counts.skills} skills`);

      lines.push(`  ✓ ${tool.displayName} (${parts.join(', ')})`);
    } else {
      lines.push(`  ○ ${tool.displayName} (not found)`);
    }
  }

  lines.push('');
  lines.push(
    `Total: ${result.summary.toolsFound} tools, ${result.summary.totalFiles} files`
  );

  return lines.join('\n');
}
