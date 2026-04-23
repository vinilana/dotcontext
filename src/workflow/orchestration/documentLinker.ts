import { PrevcPhase, PrevcRole } from '../types';
import { AgentType } from './agentOrchestrator';
import {
  PREVC_AGENT_DOCS,
  PREVC_DOC_GUIDES,
  PREVC_PHASE_MODEL,
  PREVC_PHASE_SEQUENCE,
  PREVC_ROLE_MODEL,
  PREVC_ROLE_SEQUENCE,
  type PrevcDocGuide,
  type PrevcDocType,
} from '../registries/prevcModel';

/**
 * Documentation types available in .context/docs/
 */
export type DocType = PrevcDocType;

/**
 * Document guide information
 */
export interface DocGuide extends PrevcDocGuide {}

/**
 * Standard documentation guides
 */
export const DOCUMENT_GUIDES: DocGuide[] = Object.values(PREVC_DOC_GUIDES);

/**
 * Mapping from agent types to relevant documentation
 */
export const AGENT_TO_DOCS: Record<AgentType, DocType[]> = Object.fromEntries(
  Object.entries(PREVC_AGENT_DOCS).map(([agent, docs]) => [agent, [...docs]])
) as Record<AgentType, DocType[]>;

/**
 * Mapping from PREVC phases to relevant documentation
 */
export const PHASE_TO_DOCS: Record<PrevcPhase, DocType[]> = Object.fromEntries(
  PREVC_PHASE_SEQUENCE.map((phase) => [phase, [...PREVC_PHASE_MODEL[phase].docs]])
) as Record<PrevcPhase, DocType[]>;

/**
 * Mapping from PREVC roles to relevant documentation
 */
export const ROLE_TO_DOCS: Record<PrevcRole, DocType[]> = Object.fromEntries(
  PREVC_ROLE_SEQUENCE.map((role) => [role, [...PREVC_ROLE_MODEL[role].docs]])
) as Record<PrevcRole, DocType[]>;

/**
 * Document Linker class
 */
export class DocumentLinker {
  /**
   * Get documentation guides for an agent type
   */
  getDocsForAgent(agent: AgentType): DocGuide[] {
    const docTypes = AGENT_TO_DOCS[agent] || [];
    return this.getGuidesByTypes(docTypes);
  }

  /**
   * Get documentation guides for a PREVC phase
   */
  getDocsForPhase(phase: PrevcPhase): DocGuide[] {
    const docTypes = PHASE_TO_DOCS[phase] || [];
    return this.getGuidesByTypes(docTypes);
  }

  /**
   * Get documentation guides for a PREVC role
   */
  getDocsForRole(role: PrevcRole): DocGuide[] {
    const docTypes = ROLE_TO_DOCS[role] || [];
    return this.getGuidesByTypes(docTypes);
  }

  /**
   * Get primary documentation for an agent (first in list)
   */
  getPrimaryDocForAgent(agent: AgentType): DocGuide | null {
    const docs = this.getDocsForAgent(agent);
    return docs.length > 0 ? docs[0] : null;
  }

  /**
   * Get all documentation guides
   */
  getAllDocs(): DocGuide[] {
    return [...DOCUMENT_GUIDES];
  }

  /**
   * Get a specific document guide by type
   */
  getDocByType(type: DocType): DocGuide | null {
    return DOCUMENT_GUIDES.find((doc) => doc.type === type) || null;
  }

  /**
   * Get documentation paths for an agent
   */
  getDocPathsForAgent(agent: AgentType): string[] {
    return this.getDocsForAgent(agent).map((doc) => doc.path);
  }

  /**
   * Get documentation paths for a phase
   */
  getDocPathsForPhase(phase: PrevcPhase): string[] {
    return this.getDocsForPhase(phase).map((doc) => doc.path);
  }

  /**
   * Get documentation paths for a role
   */
  getDocPathsForRole(role: PrevcRole): string[] {
    return this.getDocsForRole(role).map((doc) => doc.path);
  }

  /**
   * Get combined documentation for multiple agents
   */
  getDocsForAgents(agents: AgentType[]): DocGuide[] {
    const docTypes = new Set<DocType>();

    for (const agent of agents) {
      const types = AGENT_TO_DOCS[agent] || [];
      types.forEach((type) => docTypes.add(type));
    }

    return this.getGuidesByTypes(Array.from(docTypes));
  }

  /**
   * Get documentation relevant to a task description
   */
  getDocsForTask(taskDescription: string): DocGuide[] {
    const lowerTask = taskDescription.toLowerCase();
    const relevantDocs = new Set<DocType>();

    // Keyword matching
    if (lowerTask.includes('architect') || lowerTask.includes('design') || lowerTask.includes('structure')) {
      relevantDocs.add('architecture');
    }
    if (lowerTask.includes('api') || lowerTask.includes('endpoint')) {
      relevantDocs.add('api');
    }
    if (lowerTask.includes('test') || lowerTask.includes('coverage')) {
      relevantDocs.add('testing');
    }
    if (lowerTask.includes('security') || lowerTask.includes('auth')) {
      relevantDocs.add('security');
    }
    if (lowerTask.includes('deploy') || lowerTask.includes('release')) {
      relevantDocs.add('deployment');
    }
    if (lowerTask.includes('data') || lowerTask.includes('flow')) {
      relevantDocs.add('data-flow');
    }
    if (lowerTask.includes('document') || lowerTask.includes('readme')) {
      relevantDocs.add('readme');
    }
    if (lowerTask.includes('setup') || lowerTask.includes('start')) {
      relevantDocs.add('getting-started');
    }

    // Default to architecture if no matches
    if (relevantDocs.size === 0) {
      relevantDocs.add('architecture');
      relevantDocs.add('readme');
    }

    return this.getGuidesByTypes(Array.from(relevantDocs));
  }

  /**
   * Generate markdown links for agent documentation
   */
  generateAgentDocLinks(agent: AgentType): string {
    const docs = this.getDocsForAgent(agent);
    if (docs.length === 0) return '';

    const lines = ['## Relevant Documentation', ''];
    for (const doc of docs) {
      lines.push(`- [${doc.title}](${doc.path}) - ${doc.description}`);
    }
    return lines.join('\n');
  }

  /**
   * Generate markdown links for phase documentation
   */
  generatePhaseDocLinks(phase: PrevcPhase): string {
    const docs = this.getDocsForPhase(phase);
    if (docs.length === 0) return '';

    const lines = ['## Phase Documentation', ''];
    for (const doc of docs) {
      lines.push(`- [${doc.title}](${doc.path}) - ${doc.description}`);
    }
    return lines.join('\n');
  }

  /**
   * Helper to get guides by doc types
   */
  private getGuidesByTypes(types: DocType[]): DocGuide[] {
    return types
      .map((type) => PREVC_DOC_GUIDES[type])
      .filter((doc): doc is DocGuide => doc !== undefined);
  }
}

// Export singleton instance
export const documentLinker = new DocumentLinker();
