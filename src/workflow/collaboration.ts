/**
 * PREVC Collaboration Mode
 *
 * Enables multi-role collaboration for complex decisions,
 * brainstorming, or cross-functional analysis.
 */

import {
  PrevcRole,
  Contribution,
  CollaborationStatus,
  CollaborationSynthesis,
} from './types';
import { ROLE_DISPLAY_NAMES } from './roles';
import { getRoleConfig } from './prevcConfig';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

type CollaborationSessionLifecycle = CollaborationStatus['status'];

export interface CollaborationSessionRecord {
  id: string;
  topic: string;
  participants: PrevcRole[];
  contributions: Array<{
    role: PrevcRole;
    message: string;
    timestamp: string;
  }>;
  status: CollaborationSessionLifecycle;
  startedAt: string;
}

export interface CollaborationSessionStore {
  loadSessions(): CollaborationSessionRecord[];
  saveSessions(sessions: CollaborationSessionRecord[]): void;
}

class InMemoryCollaborationSessionStore implements CollaborationSessionStore {
  private sessions: CollaborationSessionRecord[] = [];

  loadSessions(): CollaborationSessionRecord[] {
    return this.sessions.map((session) => ({
      ...session,
      participants: [...session.participants],
      contributions: session.contributions.map((contribution) => ({ ...contribution })),
    }));
  }

  saveSessions(sessions: CollaborationSessionRecord[]): void {
    this.sessions = sessions.map((session) => ({
      ...session,
      participants: [...session.participants],
      contributions: session.contributions.map((contribution) => ({ ...contribution })),
    }));
  }
}

interface CollaborationSessionState {
  id: string;
  topic: string;
  activeRoles: PrevcRole[];
  contributions: Contribution[];
  status: CollaborationSessionLifecycle;
  startedAt: Date;
}

/**
 * Collaboration Session
 *
 * Manages a multi-role collaboration session.
 */
export class CollaborationSession {
  private id: string;
  private topic: string;
  private activeRoles: PrevcRole[];
  private contributions: Contribution[];
  private status: CollaborationSessionLifecycle;
  private startedAt: Date;

  constructor(
    topic: string,
    participants?: PrevcRole[],
    state?: CollaborationSessionState
  ) {
    this.id = state?.id ?? generateSessionId();
    this.topic = state?.topic ?? topic;
    this.activeRoles = state?.activeRoles ?? participants ?? [];
    this.contributions = state?.contributions ?? [];
    this.status = state?.status ?? 'active';
    this.startedAt = state?.startedAt ?? new Date();
  }

  static fromRecord(record: CollaborationSessionRecord): CollaborationSession {
    return new CollaborationSession(record.topic, record.participants, {
      id: record.id,
      topic: record.topic,
      activeRoles: [...record.participants],
      contributions: record.contributions.map((contribution) => ({
        role: contribution.role,
        message: contribution.message,
        timestamp: new Date(contribution.timestamp),
      })),
      status: record.status,
      startedAt: new Date(record.startedAt),
    });
  }

  toRecord(): CollaborationSessionRecord {
    return {
      id: this.id,
      topic: this.topic,
      participants: [...this.activeRoles],
      contributions: this.contributions.map((contribution) => ({
        role: contribution.role,
        message: contribution.message,
        timestamp: contribution.timestamp.toISOString(),
      })),
      status: this.status,
      startedAt: this.startedAt.toISOString(),
    };
  }

  /**
   * Get the session ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Start a new collaboration session
   */
  async start(
    topic: string,
    participants?: PrevcRole[]
  ): Promise<CollaborationStatus> {
    this.topic = topic;
    this.activeRoles = participants || (await this.selectRelevantRoles(topic));
    this.status = 'active';
    this.startedAt = new Date();
    this.contributions = [];

    return this.getStatus();
  }

  /**
   * Get the current session status
   */
  getStatus(): CollaborationStatus {
    return {
      id: this.id,
      topic: this.topic,
      participants: this.activeRoles,
      started: this.startedAt,
      status: this.status,
    };
  }

  /**
   * Add a contribution from a role
   */
  contribute(role: PrevcRole, message: string): void {
    if (!this.activeRoles.includes(role)) {
      throw new Error(
        `Role ${role} is not a participant in this session`
      );
    }

    if (this.status !== 'active') {
      throw new Error('Cannot contribute to a session that is not active');
    }

    this.contributions.push({
      role,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Get all contributions
   */
  getContributions(): Contribution[] {
    return [...this.contributions];
  }

  /**
   * Get contributions by role
   */
  getContributionsByRole(role: PrevcRole): Contribution[] {
    return this.contributions.filter((c) => c.role === role);
  }

  /**
   * Synthesize the discussion into decisions and recommendations
   */
  async synthesize(): Promise<CollaborationSynthesis> {
    this.status = 'synthesizing';

    const decisions = await this.extractDecisions();
    const recommendations = await this.generateRecommendations();

    this.status = 'concluded';

    return {
      topic: this.topic,
      participants: this.activeRoles,
      contributions: this.contributions,
      decisions,
      recommendations,
    };
  }

  /**
   * Extract decisions from contributions
   */
  private async extractDecisions(): Promise<string[]> {
    const decisions: string[] = [];

    // Look for decision keywords in contributions
    const decisionKeywords = [
      'decidimos',
      'decided',
      'conclusão',
      'conclusion',
      'definimos',
      'defined',
      'escolhemos',
      'chose',
      'optamos',
      'opted',
    ];

    for (const contribution of this.contributions) {
      const lowerMessage = contribution.message.toLowerCase();
      for (const keyword of decisionKeywords) {
        if (lowerMessage.includes(keyword)) {
          decisions.push(
            `[${ROLE_DISPLAY_NAMES[contribution.role]}]: ${contribution.message}`
          );
          break;
        }
      }
    }

    return decisions;
  }

  /**
   * Generate recommendations based on contributions
   */
  private async generateRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    // Look for recommendation keywords
    const recommendationKeywords = [
      'recomendo',
      'recommend',
      'sugiro',
      'suggest',
      'devemos',
      'should',
      'melhor',
      'better',
      'ideal',
    ];

    for (const contribution of this.contributions) {
      const lowerMessage = contribution.message.toLowerCase();
      for (const keyword of recommendationKeywords) {
        if (lowerMessage.includes(keyword)) {
          recommendations.push(
            `[${ROLE_DISPLAY_NAMES[contribution.role]}]: ${contribution.message}`
          );
          break;
        }
      }
    }

    // Add role-specific recommendations based on their expertise
    for (const role of this.activeRoles) {
      const config = getRoleConfig(role);
      if (config && config.responsibilities.length > 0) {
        recommendations.push(
          `Consider ${ROLE_DISPLAY_NAMES[role]}'s expertise in: ${config.responsibilities[0]}`
        );
      }
    }

    return recommendations;
  }

  /**
   * Select relevant roles based on the topic
   */
  private async selectRelevantRoles(topic: string): Promise<PrevcRole[]> {
    const lowerTopic = topic.toLowerCase();

    // Architecture/Design topics
    if (
      lowerTopic.includes('arquitetura') ||
      lowerTopic.includes('architecture') ||
      lowerTopic.includes('design')
    ) {
      return ['architect', 'developer', 'designer'];
    }

    // Testing/Quality topics
    if (
      lowerTopic.includes('teste') ||
      lowerTopic.includes('test') ||
      lowerTopic.includes('qualidade') ||
      lowerTopic.includes('quality')
    ) {
      return ['qa', 'reviewer', 'developer'];
    }

    // Planning/Requirements topics
    if (
      lowerTopic.includes('requisito') ||
      lowerTopic.includes('requirement') ||
      lowerTopic.includes('planejamento') ||
      lowerTopic.includes('planning')
    ) {
      return ['planner', 'architect', 'designer'];
    }

    // Documentation topics
    if (
      lowerTopic.includes('documentação') ||
      lowerTopic.includes('documentation') ||
      lowerTopic.includes('docs')
    ) {
      return ['documenter', 'developer', 'planner'];
    }

    // Security topics
    if (
      lowerTopic.includes('segurança') ||
      lowerTopic.includes('security')
    ) {
      return ['qa', 'architect', 'reviewer'];
    }

    // Performance topics
    if (
      lowerTopic.includes('performance') ||
      lowerTopic.includes('desempenho')
    ) {
      return ['qa', 'developer', 'architect'];
    }

    // Default: core team
    return ['planner', 'architect', 'developer'];
  }

  /**
   * Get session duration in minutes
   */
  getDurationMinutes(): number {
    const now = new Date();
    const diffMs = now.getTime() - this.startedAt.getTime();
    return Math.round(diffMs / 60000);
  }

  /**
   * Get participant names for display
   */
  getParticipantNames(): string[] {
    return this.activeRoles.map((role) => ROLE_DISPLAY_NAMES[role]);
  }

  /**
   * Check if a role is a participant
   */
  isParticipant(role: PrevcRole): boolean {
    return this.activeRoles.includes(role);
  }

  /**
   * Add a participant to the session
   */
  addParticipant(role: PrevcRole): void {
    if (!this.activeRoles.includes(role)) {
      this.activeRoles.push(role);
    }
  }

  /**
   * Remove a participant from the session
   */
  removeParticipant(role: PrevcRole): void {
    this.activeRoles = this.activeRoles.filter((r) => r !== role);
  }
}

/**
 * Collaboration Manager
 *
 * Manages multiple collaboration sessions.
 */
export class CollaborationManager {
  private readonly store: CollaborationSessionStore;
  private sessions: Map<string, CollaborationSession> = new Map();

  constructor(store: CollaborationSessionStore = new InMemoryCollaborationSessionStore()) {
    this.store = store;
    for (const record of this.store.loadSessions()) {
      const session = CollaborationSession.fromRecord(record);
      this.sessions.set(session.getId(), session);
    }
  }

  private persistSessions(): void {
    this.store.saveSessions(
      Array.from(this.sessions.values()).map((session) => session.toRecord())
    );
  }

  /**
   * Create a new collaboration session
   */
  createSession(topic: string, participants?: PrevcRole[]): CollaborationSession {
    const session = new CollaborationSession(topic, participants);
    this.sessions.set(session.getId(), session);
    this.persistSessions();
    return session;
  }

  /**
   * Start and persist a new collaboration session
   */
  async startSession(
    topic: string,
    participants?: PrevcRole[]
  ): Promise<CollaborationSession> {
    const session = new CollaborationSession(topic, participants);
    await session.start(topic, participants);
    this.sessions.set(session.getId(), session);
    this.persistSessions();
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): CollaborationSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Add a persisted contribution to a collaboration session
   */
  contribute(id: string, role: PrevcRole, message: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.contribute(role, message);
    this.persistSessions();
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.getStatus().status === 'active'
    );
  }

  /**
   * End a session
   */
  async endSession(id: string): Promise<CollaborationSynthesis | null> {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }

    const synthesis = await session.synthesize();
    this.persistSessions();
    return synthesis;
  }

  /**
   * Clear all concluded sessions
   */
  clearConcludedSessions(): void {
    for (const [id, session] of this.sessions) {
      if (session.getStatus().status === 'concluded') {
        this.sessions.delete(id);
      }
    }
    this.persistSessions();
  }
}
