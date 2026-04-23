import { PrevcPhase, PrevcRole } from '../types';
import { ROLE_TO_SPECIALISTS } from '../roles';
import {
  PREVC_PHASE_MODEL,
  PREVC_PHASE_SEQUENCE,
  PREVC_ROLE_MODEL,
  PREVC_ROLE_SEQUENCE,
} from '../registries/prevcModel';
import {
  BUILT_IN_AGENTS,
  type BuiltInAgentType,
} from '../agents/agentRegistry';

/**
 * Available agent types from the existing system
 */
export const AGENT_TYPES = BUILT_IN_AGENTS;

export type AgentType = BuiltInAgentType;

/**
 * Mapping from PREVC phases to relevant agent types
 */
export const PHASE_TO_AGENTS: Record<PrevcPhase, AgentType[]> = Object.fromEntries(
  PREVC_PHASE_SEQUENCE.map((phase) => [phase, [...PREVC_PHASE_MODEL[phase].recommendedAgents]])
) as Record<PrevcPhase, AgentType[]>;

/**
 * Mapping from PREVC roles to agent types
 */
export const ROLE_TO_AGENTS: Record<PrevcRole, AgentType[]> = Object.fromEntries(
  PREVC_ROLE_SEQUENCE.map((role) => [role, [...PREVC_ROLE_MODEL[role].agents]])
) as Record<PrevcRole, AgentType[]>;

/**
 * Task keywords to agent mapping for intelligent selection
 */
const TASK_KEYWORDS: Record<string, AgentType[]> = {
  // Architecture keywords
  architecture: ['architect-specialist'],
  design: ['architect-specialist', 'frontend-specialist'],
  system: ['architect-specialist', 'backend-specialist'],
  scalability: ['architect-specialist', 'performance-optimizer'],

  // Development keywords
  feature: ['feature-developer'],
  implement: ['feature-developer', 'backend-specialist'],
  build: ['feature-developer'],
  create: ['feature-developer'],

  // Bug/Fix keywords
  bug: ['bug-fixer'],
  fix: ['bug-fixer'],
  error: ['bug-fixer'],
  issue: ['bug-fixer'],

  // Testing keywords
  test: ['test-writer'],
  coverage: ['test-writer'],
  unit: ['test-writer'],
  integration: ['test-writer'],

  // Code quality keywords
  review: ['code-reviewer'],
  refactor: ['refactoring-specialist', 'code-reviewer'],
  clean: ['refactoring-specialist'],
  optimize: ['performance-optimizer', 'refactoring-specialist'],

  // Security keywords
  security: ['security-auditor'],
  vulnerability: ['security-auditor'],
  auth: ['security-auditor', 'backend-specialist'],
  permission: ['security-auditor'],

  // Performance keywords
  performance: ['performance-optimizer'],
  speed: ['performance-optimizer'],
  memory: ['performance-optimizer'],
  cache: ['performance-optimizer', 'backend-specialist'],

  // Documentation keywords
  document: ['documentation-writer'],
  readme: ['documentation-writer'],
  docs: ['documentation-writer'],

  // Backend keywords
  api: ['backend-specialist', 'documentation-writer'],
  server: ['backend-specialist'],
  endpoint: ['backend-specialist'],
  microservice: ['backend-specialist'],

  // Frontend keywords
  ui: ['frontend-specialist'],
  component: ['frontend-specialist'],
  style: ['frontend-specialist'],
  responsive: ['frontend-specialist'],

  // Database keywords
  database: ['database-specialist'],
  query: ['database-specialist'],
  migration: ['database-specialist'],
  schema: ['database-specialist'],

  // DevOps keywords
  deploy: ['devops-specialist'],
  ci: ['devops-specialist'],
  pipeline: ['devops-specialist'],
  docker: ['devops-specialist'],

  // Mobile keywords
  mobile: ['mobile-specialist'],
  ios: ['mobile-specialist'],
  android: ['mobile-specialist'],
  app: ['mobile-specialist', 'frontend-specialist'],
};

/**
 * Agent Orchestrator class
 */
export class AgentOrchestrator {
  /**
   * Get recommended agents for a PREVC phase
   */
  getAgentsForPhase(phase: PrevcPhase): AgentType[] {
    return PHASE_TO_AGENTS[phase] || [];
  }

  /**
   * Get recommended agents for a PREVC role
   */
  getAgentsForRole(role: PrevcRole): AgentType[] {
    return ROLE_TO_AGENTS[role] || [];
  }

  /**
   * Get primary agent for a role (first in the list)
   */
  getPrimaryAgentForRole(role: PrevcRole): AgentType | null {
    const agents = this.getAgentsForRole(role);
    return agents.length > 0 ? agents[0] : null;
  }

  /**
   * Select agents based on task description
   */
  selectAgentsByTask(taskDescription: string): AgentType[] {
    const lowerTask = taskDescription.toLowerCase();
    const matchedAgents = new Set<AgentType>();

    for (const [keyword, agents] of Object.entries(TASK_KEYWORDS)) {
      if (lowerTask.includes(keyword)) {
        agents.forEach((agent) => matchedAgents.add(agent));
      }
    }

    // If no matches, return a default set
    if (matchedAgents.size === 0) {
      return ['feature-developer', 'code-reviewer'];
    }

    return Array.from(matchedAgents);
  }

  /**
   * Get agent handoff sequence for a workflow
   * Returns ordered list of agents based on phase progression
   */
  getAgentHandoffSequence(phases: PrevcPhase[]): AgentType[] {
    const sequence: AgentType[] = [];
    const seen = new Set<AgentType>();

    for (const phase of phases) {
      const agents = this.getAgentsForPhase(phase);
      for (const agent of agents) {
        if (!seen.has(agent)) {
          sequence.push(agent);
          seen.add(agent);
        }
      }
    }

    return sequence;
  }

  /**
   * Get recommended agent sequence for a specific task
   */
  getTaskAgentSequence(
    taskDescription: string,
    includeReview: boolean = true
  ): AgentType[] {
    const primaryAgents = this.selectAgentsByTask(taskDescription);
    const sequence = [...primaryAgents];

    // Add test-writer if not already included
    if (!sequence.includes('test-writer')) {
      sequence.push('test-writer');
    }

    // Add code-reviewer for review if requested
    if (includeReview && !sequence.includes('code-reviewer')) {
      sequence.push('code-reviewer');
    }

    // Add documentation-writer at the end
    if (!sequence.includes('documentation-writer')) {
      sequence.push('documentation-writer');
    }

    return sequence;
  }

  /**
   * Map a specialist name to agent type
   */
  specialistToAgent(specialist: string): AgentType | null {
    // Direct mapping if it's already an agent type
    if (AGENT_TYPES.includes(specialist as AgentType)) {
      return specialist as AgentType;
    }

    // Check role mappings
    for (const [role, specialists] of Object.entries(ROLE_TO_SPECIALISTS)) {
      if (specialists.includes(specialist)) {
        const agents = ROLE_TO_AGENTS[role as PrevcRole];
        return agents.length > 0 ? agents[0] : null;
      }
    }

    return null;
  }

  /**
   * Get all available agent types
   */
  getAllAgentTypes(): AgentType[] {
    return [...AGENT_TYPES];
  }

  /**
   * Check if agent type is valid
   */
  isValidAgentType(type: string): type is AgentType {
    return AGENT_TYPES.includes(type as AgentType);
  }

  /**
   * Get agent description
   */
  getAgentDescription(agent: AgentType): string {
    const descriptions: Record<AgentType, string> = {
      'code-reviewer': 'Reviews code for quality, style, and best practices',
      'bug-fixer': 'Identifies and fixes bugs with targeted solutions',
      'feature-developer': 'Implements new features following architecture',
      'refactoring-specialist': 'Improves code structure and eliminates code smells',
      'test-writer': 'Creates comprehensive test suites',
      'documentation-writer': 'Writes and maintains documentation',
      'performance-optimizer': 'Identifies and resolves performance bottlenecks',
      'security-auditor': 'Audits code for security vulnerabilities',
      'backend-specialist': 'Develops server-side logic and APIs',
      'frontend-specialist': 'Builds user interfaces and interactions',
      'architect-specialist': 'Designs system architecture and patterns',
      'devops-specialist': 'Manages deployment and CI/CD pipelines',
      'database-specialist': 'Designs and optimizes database solutions',
      'mobile-specialist': 'Develops mobile applications',
    };

    return descriptions[agent] || 'Specialized development agent';
  }
}

// Export singleton instance
export const agentOrchestrator = new AgentOrchestrator();
