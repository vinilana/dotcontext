/**
 * Agent Registry
 *
 * Centralized registry for built-in and custom agents.
 * Single source of truth for agent types and discovery.
 */

import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Built-in agent types available in the system
 */
export const BUILT_IN_AGENTS = [
  'code-reviewer',
  'bug-fixer',
  'feature-developer',
  'refactoring-specialist',
  'test-writer',
  'documentation-writer',
  'performance-optimizer',
  'security-auditor',
  'backend-specialist',
  'frontend-specialist',
  'architect-specialist',
  'devops-specialist',
  'database-specialist',
  'mobile-specialist',
] as const;

export type BuiltInAgentType = (typeof BUILT_IN_AGENTS)[number];

/**
 * Agent metadata extracted from playbook
 */
export interface AgentMetadata {
  type: string;
  path: string;
  isCustom: boolean;
  exists: boolean;
  title?: string;
  description?: string;
}

/**
 * Agent discovery result
 */
export interface DiscoveredAgents {
  all: AgentMetadata[];
  builtIn: AgentMetadata[];
  custom: AgentMetadata[];
}

/**
 * Check if an agent type is built-in
 */
export function isBuiltInAgent(agentType: string): agentType is BuiltInAgentType {
  return BUILT_IN_AGENTS.includes(agentType as BuiltInAgentType);
}

/**
 * Agent Registry class
 *
 * Handles discovery and metadata extraction for both
 * built-in and custom agents.
 */
export class AgentRegistry {
  private agentsPath: string;
  private cache: Map<string, AgentMetadata> = new Map();

  constructor(repoPath: string) {
    this.agentsPath = path.join(repoPath, '.context', 'agents');
  }

  /**
   * Discover all available agents (built-in + custom)
   */
  async discoverAll(): Promise<DiscoveredAgents> {
    const builtIn = await this.discoverBuiltIn();
    const custom = await this.discoverCustom();

    return {
      all: [...builtIn, ...custom],
      builtIn,
      custom,
    };
  }

  /**
   * Discover built-in agents
   */
  async discoverBuiltIn(): Promise<AgentMetadata[]> {
    const agents: AgentMetadata[] = [];

    for (const agentType of BUILT_IN_AGENTS) {
      const metadata = await this.getAgentMetadata(agentType);
      agents.push(metadata);
    }

    return agents;
  }

  /**
   * Discover custom agents from .context/agents/
   */
  async discoverCustom(): Promise<AgentMetadata[]> {
    const agents: AgentMetadata[] = [];

    if (!await fs.pathExists(this.agentsPath)) {
      return agents;
    }

    const files = await fs.readdir(this.agentsPath);

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'README.md') {
        continue;
      }

      const agentType = file.replace('.md', '');

      // Skip if it's a built-in agent
      if (isBuiltInAgent(agentType)) {
        continue;
      }

      const metadata = await this.getAgentMetadata(agentType);
      agents.push(metadata);
    }

    return agents;
  }

  /**
   * Get metadata for a specific agent
   */
  async getAgentMetadata(agentType: string): Promise<AgentMetadata> {
    // Check cache first
    const cached = this.cache.get(agentType);
    if (cached) {
      return cached;
    }

    const agentPath = path.join(this.agentsPath, `${agentType}.md`);
    const exists = await fs.pathExists(agentPath);
    const isCustom = !isBuiltInAgent(agentType);

    const metadata: AgentMetadata = {
      type: agentType,
      path: `agents/${agentType}.md`,
      isCustom,
      exists,
    };

    // Extract title and description if file exists
    if (exists) {
      const extracted = await this.extractMetadataFromFile(agentPath);
      metadata.title = extracted.title;
      metadata.description = extracted.description;
    }

    // Cache the result
    this.cache.set(agentType, metadata);

    return metadata;
  }

  /**
   * Check if an agent exists
   */
  async agentExists(agentType: string): Promise<boolean> {
    const agentPath = path.join(this.agentsPath, `${agentType}.md`);
    return fs.pathExists(agentPath);
  }

  /**
   * Get agent playbook content
   */
  async getPlaybookContent(agentType: string): Promise<string | null> {
    const agentPath = path.join(this.agentsPath, `${agentType}.md`);

    if (!await fs.pathExists(agentPath)) {
      return null;
    }

    return fs.readFile(agentPath, 'utf-8');
  }

  /**
   * Clear the metadata cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Extract metadata from agent playbook file
   */
  private async extractMetadataFromFile(
    filePath: string
  ): Promise<{ title?: string; description?: string }> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const descMatch = content.match(/^>\s*(.+)$/m);

      return {
        title: titleMatch?.[1],
        description: descMatch?.[1],
      };
    } catch {
      return {};
    }
  }
}

/**
 * Create an AgentRegistry instance
 */
export function createAgentRegistry(repoPath: string): AgentRegistry {
  return new AgentRegistry(repoPath);
}
