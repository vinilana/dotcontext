import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  PHASE_NAMES_EN,
  createAgentRegistry,
  createSkillRegistry,
  documentLinker,
  type AgentStatus,
  type PhaseExecutionBundleData,
  type PhaseStatus,
  type PrevcPhase,
  type StatusType,
  type WorkflowSettings,
} from '../../../workflow';

export type ResponseMode = 'compact' | 'verbose';
export type MCPClientProfile =
  | 'standalone'
  | 'planning'
  | 'execution';

export interface ResponsePreferenceInput {
  verbose?: boolean;
  includeGuidance?: boolean;
  includeOrchestration?: boolean;
  includeLegacy?: boolean;
  profile?: string;
}

export interface ResolvedResponsePreferences {
  mode: ResponseMode;
  includeGuidance: boolean;
  includeOrchestration: boolean;
  includeLegacy: boolean;
  profile: MCPClientProfile;
}

export interface AgentManifestEntry {
  id: string;
  path: string;
  title?: string;
  description?: string;
  isCustom: boolean;
}

export interface SkillManifestEntry {
  id: string;
  path: string;
  name: string;
  description: string;
  phases: string[];
  isBuiltIn: boolean;
}

export interface ManifestSnapshot<T> {
  digest: string;
  items: T[];
}

export interface PhaseExecutionBundle extends PhaseExecutionBundleData {
  bundleId: string;
}

export interface CompactPhaseState {
  code: PrevcPhase;
  name: string;
  status: StatusType;
  startedAt?: string;
  completedAt?: string;
}

export interface CompactAgentState {
  id: string;
  status: StatusType;
  outputs?: string[];
}

export interface CompactWorkflowState {
  success: boolean;
  name: string;
  scale: string;
  profile?: MCPClientProfile;
  currentPhase: {
    code: PrevcPhase;
    name: string;
  };
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  isComplete: boolean;
  phases: CompactPhaseState[];
  activeAgents: CompactAgentState[];
  settings?: WorkflowSettings;
  gates?: {
    canAdvance: boolean;
    blockedBy?: string;
  };
  approval?: {
    planCreated: boolean;
    planApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  } | null;
  bundleId?: string;
  revision?: string;
}

interface CachedManifest<T> {
  key: string;
  snapshot: ManifestSnapshot<T>;
}

interface CachedBundle {
  key: string;
  bundle: PhaseExecutionBundle;
}

const AGENT_PATHS = ['.context/agents'];
const SKILL_PATHS = ['.context/skills', '.agents/skills'];

export function resolveResponsePreferences(
  input: ResponsePreferenceInput = {}
): ResolvedResponsePreferences {
  const mode: ResponseMode = input.verbose ? 'verbose' : 'compact';

  return {
    mode,
    includeGuidance: input.includeGuidance ?? mode === 'verbose',
    includeOrchestration: input.includeOrchestration ?? mode === 'verbose',
    includeLegacy: input.includeLegacy ?? false,
    profile: normalizeClientProfile(input.profile),
  };
}

export function normalizeClientProfile(profile?: string): MCPClientProfile {
  const normalized = profile?.trim().toLowerCase();

  switch (normalized) {
    case 'codex':
    case 'claude-code':
    case 'execution':
      return 'execution';
    case 'planning':
      return 'planning';
    case 'standalone':
    default:
      return 'standalone';
  }
}

export function createDigest(value: unknown): string {
  return crypto
    .createHash('sha1')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, 12);
}

export function compactPhaseStates(phases: Record<PrevcPhase, PhaseStatus>): CompactPhaseState[] {
  return (Object.entries(phases) as Array<[PrevcPhase, PhaseStatus]>)
    .filter(([, state]) => state.status !== 'skipped')
    .map(([code, state]) => ({
      code,
      name: PHASE_NAMES_EN[code],
      status: state.status,
      ...(state.started_at ? { startedAt: state.started_at } : {}),
      ...(state.completed_at ? { completedAt: state.completed_at } : {}),
    }));
}

export function compactActiveAgents(agents: Record<string, AgentStatus>): CompactAgentState[] {
  return Object.entries(agents)
    .filter(([, state]) => state.status === 'in_progress')
    .map(([id, state]) => ({
      id,
      status: state.status,
      ...(state.outputs?.length ? { outputs: state.outputs } : {}),
    }));
}

class ExecutionStateCache {
  private agentManifestCache = new Map<string, CachedManifest<AgentManifestEntry>>();
  private skillManifestCache = new Map<string, CachedManifest<SkillManifestEntry>>();
  private bundleCache = new Map<string, CachedBundle>();
  private revisionCache = new Map<string, string>();

  async getAgentManifest(repoPath: string): Promise<ManifestSnapshot<AgentManifestEntry>> {
    const key = await this.buildPathKey(repoPath, AGENT_PATHS);
    const cached = this.agentManifestCache.get(repoPath);
    if (cached?.key === key) {
      return cached.snapshot;
    }

    const registry = createAgentRegistry(repoPath);
    const discovered = await registry.discoverAll();
    const items = discovered.all.map((agent) => ({
      id: agent.type,
      path: agent.path,
      title: agent.title,
      description: agent.description,
      isCustom: agent.isCustom,
    }));
    const snapshot = {
      digest: createDigest(items),
      items,
    };

    this.agentManifestCache.set(repoPath, { key, snapshot });
    return snapshot;
  }

  async getSkillManifest(repoPath: string): Promise<ManifestSnapshot<SkillManifestEntry>> {
    const key = await this.buildPathKey(repoPath, SKILL_PATHS);
    const cached = this.skillManifestCache.get(repoPath);
    if (cached?.key === key) {
      return cached.snapshot;
    }

    const registry = createSkillRegistry(repoPath);
    const discovered = await registry.discoverAll();
    const items = discovered.all.map((skill) => ({
      id: skill.slug,
      path: skill.path,
      name: skill.metadata.name,
      description: skill.metadata.description,
      phases: skill.metadata.phases ?? [],
      isBuiltIn: skill.isBuiltIn,
    }));
    const snapshot = {
      digest: createDigest(items),
      items,
    };

    this.skillManifestCache.set(repoPath, { key, snapshot });
    return snapshot;
  }

  async getPhaseBundle(
    repoPath: string,
    phase: PrevcPhase,
    load: () => Promise<PhaseExecutionBundleData>
  ): Promise<PhaseExecutionBundle> {
    const [agents, skills] = await Promise.all([
      this.getAgentManifest(repoPath),
      this.getSkillManifest(repoPath),
    ]);
    const key = `${path.resolve(repoPath)}:${phase}:${agents.digest}:${skills.digest}`;
    const cached = this.bundleCache.get(key);
    if (cached) {
      return cached.bundle;
    }

    const data = await load();
    const bundle: PhaseExecutionBundle = {
      ...data,
      bundleId: createDigest({
        phase,
        agents: data.agentIds,
        skills: data.skillIds,
        docs: data.docRefs,
        nextAction: data.nextAction,
        agentsDigest: agents.digest,
        skillsDigest: skills.digest,
      }),
    };

    this.bundleCache.set(key, { key, bundle });
    return bundle;
  }

  getRevision(repoPath: string, state: CompactWorkflowState): string {
    const key = `${path.resolve(repoPath)}:${createDigest(state)}`;
    const cached = this.revisionCache.get(key);
    if (cached) {
      return cached;
    }

    const revision = createDigest(state);
    this.revisionCache.set(key, revision);
    return revision;
  }

  private async buildPathKey(repoPath: string, relativePaths: string[]): Promise<string> {
    const mtimes = await Promise.all(relativePaths.map(async (relativePath) => {
      const targetPath = path.join(repoPath, relativePath);
      try {
        const stat = await fs.stat(targetPath);
        return `${relativePath}:${Math.floor(stat.mtimeMs)}`;
      } catch {
        return `${relativePath}:0`;
      }
    }));

    return mtimes.join('|');
  }
}

export const executionStateCache = new ExecutionStateCache();

export function createHelpResourceRef(topic: string): string {
  const normalized = topic.trim().toLowerCase();
  const mappedTopic = {
    init: 'workflow-init',
    status: 'workflow-status',
    advance: 'workflow-advance',
    manage: 'workflow-manage',
    gates: 'workflow-manage',
    planning: 'overview',
    scaffolding: 'overview',
  }[normalized] || normalized;

  return `workflow://guide/${mappedTopic}`;
}

export function createPhaseDocRefs(phase: PrevcPhase): string[] {
  return documentLinker.getDocPathsForPhase(phase);
}
