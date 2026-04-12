/**
 * PREVC Status Manager
 *
 * Manages canonical PREVC workflow state stored in harness runtime state.
 * Legacy status.yaml files are migrated on read but no longer written.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import {
  PrevcStatus,
  PrevcPhase,
  PrevcRole,
  PhaseUpdate,
  RoleUpdate,
  AgentUpdate,
  ProjectScale,
  PhaseStatus,
  RoleStatus,
  AgentStatus,
  WorkflowSettings,
  PlanApproval,
  ExecutionHistory,
  ExecutionHistoryEntry,
  ExecutionAction,
} from '../types';
import { PREVC_PHASE_ORDER, getNextActivePhase } from '../phases';
import { getScaleRoute } from '../scaling';
import { createInitialStatus, generateResumeContext } from './templates';
import { getDefaultSettings } from '../gates';
import type { WorkflowStatePort } from './workflowStatePort';

/**
 * PREVC Status Manager
 *
 * Handles reading and writing canonical workflow state, with optional legacy migration.
 */
export class PrevcStatusManager {
  private contextPath: string;
  private workflowState: WorkflowStatePort;
  private cachedStatus: PrevcStatus | null = null;

  constructor(contextPath: string, workflowState: WorkflowStatePort) {
    this.contextPath = contextPath;
    this.workflowState = workflowState;
  }

  private get legacyStatusPath(): string {
    return path.join(this.contextPath, 'workflow', 'status.yaml');
  }

  /**
   * Check if a workflow status file exists
   */
  async exists(): Promise<boolean> {
    return (await this.workflowState.exists()) || fs.pathExists(this.legacyStatusPath);
  }

  /**
   * Load the workflow status from disk
   */
  async load(): Promise<PrevcStatus> {
    const hasCanonicalState = await this.workflowState.exists();
    const hasLegacyProjection = await fs.pathExists(this.legacyStatusPath);

    if (!hasCanonicalState && !hasLegacyProjection) {
      throw new Error('Workflow status not found. Run "workflow init" first.');
    }

    let status: PrevcStatus;
    if (hasCanonicalState) {
      status = await this.workflowState.load();
    } else {
      const content = await fs.readFile(this.legacyStatusPath, 'utf-8');
      status = this.parseYaml(content);
    }

    status = this.migrateStatus(status);
    await this.persistCanonical(status);
    if (hasLegacyProjection) {
      await fs.remove(this.legacyStatusPath);
    }
    this.cachedStatus = status;
    return this.cachedStatus;
  }

  /**
   * Load status synchronously (for use in orchestrator)
   */
  loadSync(): PrevcStatus {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }

    const hasCanonicalState = fs.existsSync(path.join(this.contextPath, 'harness', 'workflows', 'prevc.json'));
    const hasLegacyProjection = fs.existsSync(this.legacyStatusPath);

    if (!hasCanonicalState && !hasLegacyProjection) {
      throw new Error('Workflow status not found. Run "workflow init" first.');
    }

    let status: PrevcStatus;
    if (hasCanonicalState) {
      status = this.workflowState.loadSync();
    } else {
      const content = fs.readFileSync(this.legacyStatusPath, 'utf-8');
      status = this.parseYaml(content);
    }

    status = this.migrateStatus(status);
    this.cachedStatus = status;
    return this.cachedStatus;
  }

  /**
   * Save the workflow status to disk
   */
  async save(status: PrevcStatus): Promise<void> {
    await this.persistCanonical(status);
    this.cachedStatus = status;
  }

  async remove(): Promise<void> {
    await this.workflowState.remove();
    if (await fs.pathExists(this.legacyStatusPath)) {
      await fs.remove(this.legacyStatusPath);
    }
    this.cachedStatus = null;
  }

  async archive(name: string): Promise<void> {
    await this.workflowState.archive(name);
    if (await fs.pathExists(this.legacyStatusPath)) {
      const archiveDir = path.join(this.contextPath, 'workflow', 'archive');
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.ensureDir(archiveDir);
      await fs.move(this.legacyStatusPath, path.join(archiveDir, `${safeName}-${timestamp}.legacy-status.yaml`));
    }
    this.cachedStatus = null;
  }

  private async persistCanonical(status: PrevcStatus): Promise<void> {
    await this.workflowState.save(status);
    if (await fs.pathExists(this.legacyStatusPath)) {
      await fs.remove(this.legacyStatusPath);
    }
  }

  private ensureExecutionHistory(status: PrevcStatus, now: string): ExecutionHistory {
    if (!status.execution) {
      status.execution = {
        history: [],
        last_activity: now,
        resume_context: '',
      };
    }

    return status.execution;
  }

  private getNextPhaseForStatus(status: PrevcStatus): PrevcPhase | null {
    return getNextActivePhase(status.project.current_phase, status.phases);
  }

  /**
   * Create a new workflow status
   */
  async create(options: {
    name: string;
    scale: ProjectScale;
    phases?: PrevcPhase[];
    roles?: PrevcRole[] | 'all';
  }): Promise<PrevcStatus> {
    const route = getScaleRoute(options.scale);
    const phases = options.phases || route.phases;
    const roles = options.roles || route.roles;

    const status = createInitialStatus({
      name: options.name,
      scale: options.scale,
      phases,
      roles,
    });

    await this.save(status);
    return status;
  }

  /**
   * Update a phase's status
   */
  async updatePhase(phase: PrevcPhase, update: PhaseUpdate): Promise<void> {
    const status = await this.load();

    status.phases[phase] = {
      ...status.phases[phase],
      ...update,
    };

    await this.save(status);
  }

  /**
   * Update a role's status
   * @deprecated Use updateAgent instead
   */
  async updateRole(role: PrevcRole, update: RoleUpdate): Promise<void> {
    const status = await this.load();

    if (!status.roles[role]) {
      status.roles[role] = {};
    }

    status.roles[role] = {
      ...status.roles[role],
      ...update,
    };

    await this.save(status);
  }

  /**
   * Update an agent's status (replaces updateRole)
   */
  async updateAgent(agentName: string, update: AgentUpdate): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    // Initialize agents if not present
    if (!status.agents) {
      status.agents = {};
    }

    const existingAgent = status.agents[agentName];

    // Build agent status
    const agentStatus: AgentStatus = {
      status: update.status ?? existingAgent?.status ?? 'pending',
      started_at: existingAgent?.started_at,
      completed_at: existingAgent?.completed_at,
      outputs: update.outputs ?? existingAgent?.outputs,
    };

    // Track timestamps based on status changes
    if (update.status === 'in_progress' && !existingAgent?.started_at) {
      agentStatus.started_at = now;
    }
    if (update.status === 'completed' && !existingAgent?.completed_at) {
      agentStatus.completed_at = now;
    }

    status.agents[agentName] = agentStatus;

    await this.save(status);
  }

  /**
   * Transition to a new phase
   */
  async transitionToPhase(phase: PrevcPhase): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    // Update current phase
    status.project.current_phase = phase;

    // Mark new phase as in_progress
    status.phases[phase] = {
      ...status.phases[phase],
      status: 'in_progress',
      started_at: now,
    };

    // Add history entry
    const execution = this.ensureExecutionHistory(status, now);
    execution.history.push({
      timestamp: now,
      phase,
      action: 'started',
    });
    execution.last_activity = now;
    execution.resume_context = generateResumeContext(phase, 'started');

    await this.save(status);
  }

  /**
   * Mark a phase as complete
   */
  async markPhaseComplete(
    phase: PrevcPhase,
    outputs?: string[]
  ): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    const phaseStatus: PhaseStatus = {
      ...status.phases[phase],
      status: 'completed',
      completed_at: now,
    };

    if (outputs) {
      phaseStatus.outputs = outputs.map((p) => ({ path: p, status: 'filled' }));
    }

    status.phases[phase] = phaseStatus;

    // Add history entry
    const execution = this.ensureExecutionHistory(status, now);
    execution.history.push({
      timestamp: now,
      phase,
      action: 'completed',
    });
    execution.last_activity = now;
    execution.resume_context = generateResumeContext(phase, 'completed');

    await this.save(status);
  }

  async completePhaseTransition(outputs?: string[]): Promise<PrevcPhase | null> {
    const status = await this.load();
    const now = new Date().toISOString();
    const currentPhase = status.project.current_phase;
    const nextPhase = this.getNextPhaseForStatus(status);

    status.phases[currentPhase] = {
      ...status.phases[currentPhase],
      status: 'completed',
      completed_at: now,
      ...(outputs ? { outputs: outputs.map((outputPath) => ({ path: outputPath, status: 'filled' })) } : {}),
    };

    const execution = this.ensureExecutionHistory(status, now);
    execution.history.push({
      timestamp: now,
      phase: currentPhase,
      action: 'completed',
    });

    if (nextPhase) {
      status.project.current_phase = nextPhase;
      status.phases[nextPhase] = {
        ...status.phases[nextPhase],
        status: 'in_progress',
        started_at: status.phases[nextPhase].started_at || now,
      };
      execution.history.push({
        timestamp: now,
        phase: nextPhase,
        action: 'started',
      });
      execution.resume_context = generateResumeContext(nextPhase, 'started');
    } else {
      execution.resume_context = generateResumeContext(currentPhase, 'completed');
    }

    execution.last_activity = now;

    await this.save(status);
    return nextPhase;
  }

  /**
   * Get the current phase
   */
  async getCurrentPhase(): Promise<PrevcPhase> {
    const status = await this.load();
    return status.project.current_phase;
  }

  /**
   * Get the active role (if any)
   */
  async getActiveRole(): Promise<PrevcRole | null> {
    const status = await this.load();

    for (const [role, roleStatus] of Object.entries(status.roles)) {
      if ((roleStatus as RoleStatus).status === 'in_progress') {
        return role as PrevcRole;
      }
    }

    return null;
  }

  /**
   * Get the next phase that should be executed
   */
  async getNextPhase(): Promise<PrevcPhase | null> {
    const status = await this.load();
    return this.getNextPhaseForStatus(status);
  }

  /**
   * Check if the workflow is complete
   */
  async isComplete(): Promise<boolean> {
    const status = await this.load();

    for (const phase of PREVC_PHASE_ORDER) {
      const phaseStatus = status.phases[phase];
      if (
        phaseStatus.status !== 'completed' &&
        phaseStatus.status !== 'skipped'
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Set workflow settings
   */
  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    const status = await this.load();
    const defaults = getDefaultSettings(status.project.scale);

    const currentSettings = status.project.settings || defaults;
    const newSettings: WorkflowSettings = {
      autonomous_mode: settings.autonomous_mode ?? currentSettings.autonomous_mode,
      require_plan: settings.require_plan ?? currentSettings.require_plan,
      require_approval: settings.require_approval ?? currentSettings.require_approval,
    };

    status.project.settings = newSettings;
    await this.save(status);
    return newSettings;
  }

  /**
   * Get workflow settings (with defaults applied)
   */
  async getSettings(): Promise<WorkflowSettings> {
    const status = await this.load();
    const defaults = getDefaultSettings(status.project.scale);
    return status.project.settings || defaults;
  }

  /**
   * Mark that a plan has been created/linked
   */
  async markPlanCreated(planSlug: string): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    if (!status.approval) {
      status.approval = {
        plan_created: false,
        plan_approved: false,
      };
    }

    status.approval.plan_created = true;
    status.project.plan = planSlug;

    // Add history entry
    if (!status.execution) {
      status.execution = {
        history: [],
        last_activity: now,
        resume_context: '',
      };
    }
    status.execution.history.push({
      timestamp: now,
      phase: status.project.current_phase,
      action: 'plan_linked',
      plan: planSlug,
    });
    status.execution.last_activity = now;
    status.execution.resume_context = generateResumeContext(status.project.current_phase, 'plan_linked');

    await this.save(status);
  }

  /**
   * Approve the plan
   */
  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    const status = await this.load();
    const now = new Date().toISOString();

    if (!status.approval) {
      status.approval = {
        plan_created: false,
        plan_approved: false,
      };
    }

    status.approval.plan_approved = true;
    status.approval.approved_by = approver;
    status.approval.approved_at = now;
    if (notes) {
      status.approval.approval_notes = notes;
    }

    // Add history entry
    if (!status.execution) {
      status.execution = {
        history: [],
        last_activity: now,
        resume_context: '',
      };
    }
    status.execution.history.push({
      timestamp: now,
      phase: status.project.current_phase,
      action: 'plan_approved',
      approved_by: String(approver),
    });
    status.execution.last_activity = now;
    status.execution.resume_context = generateResumeContext(status.project.current_phase, 'plan_approved');

    await this.save(status);
    return status.approval;
  }

  /**
   * Get approval status
   */
  async getApproval(): Promise<PlanApproval | undefined> {
    const status = await this.load();
    return status.approval;
  }

  /**
   * Add an entry to the execution history
   */
  async addHistoryEntry(entry: Omit<ExecutionHistoryEntry, 'timestamp'>): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    // Ensure execution exists
    if (!status.execution) {
      status.execution = {
        history: [],
        last_activity: now,
        resume_context: '',
      };
    }

    // Add new entry
    const fullEntry: ExecutionHistoryEntry = {
      ...entry,
      timestamp: now,
    };
    status.execution.history.push(fullEntry);
    status.execution.last_activity = now;
    status.execution.resume_context = generateResumeContext(entry.phase, entry.action);

    await this.save(status);
  }

  /**
   * Add a step-level entry to the execution history (breadcrumb trail)
   */
  async addStepHistoryEntry(entry: {
    action: 'step_started' | 'step_completed' | 'step_skipped';
    plan: string;
    planPhase: string;
    stepIndex: number;
    stepDescription?: string;
    output?: string;
    notes?: string;
  }): Promise<void> {
    const status = await this.load();
    const now = new Date().toISOString();

    // Ensure execution exists
    if (!status.execution) {
      status.execution = {
        history: [],
        last_activity: now,
        resume_context: '',
      };
    }

    // Add new step entry
    const fullEntry: ExecutionHistoryEntry = {
      timestamp: now,
      phase: status.project.current_phase,
      action: entry.action,
      plan: entry.plan,
      planPhase: entry.planPhase,
      stepIndex: entry.stepIndex,
      stepDescription: entry.stepDescription,
      output: entry.output,
      notes: entry.notes,
    };
    status.execution.history.push(fullEntry);
    status.execution.last_activity = now;
    status.execution.resume_context = generateResumeContext(
      status.project.current_phase,
      entry.action,
      { planPhase: entry.planPhase, stepIndex: entry.stepIndex, stepDescription: entry.stepDescription }
    );

    await this.save(status);
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(): Promise<ExecutionHistory | undefined> {
    const status = await this.load();
    return status.execution;
  }

  /**
   * Apply migration logic for existing workflows
   * - Add default settings based on scale
   * - Initialize approval tracking based on current state
   * - Initialize execution history for old workflows
   * - Initialize agents object for old workflows
   */
  private migrateStatus(status: PrevcStatus): PrevcStatus {
    // Add default settings if missing
    if (!status.project.settings) {
      status.project.settings = getDefaultSettings(status.project.scale);
    }

    // Initialize agents if missing (migration from old workflows)
    if (!status.agents) {
      status.agents = {};
    }

    // Initialize approval tracking if missing
    if (!status.approval) {
      const hasPlan = Boolean(status.project.plan || (status.project.plans && status.project.plans.length > 0));
      const isPastReview = ['E', 'V', 'C'].includes(status.project.current_phase) ||
        status.phases['R'].status === 'completed';

      status.approval = {
        plan_created: hasPlan,
        // Auto-approve if already past R phase (grandfather clause)
        plan_approved: isPastReview,
        approved_by: isPastReview ? 'system-migration' : undefined,
        approved_at: isPastReview ? new Date().toISOString() : undefined,
      };
    }

    // Initialize execution history if missing (migration from old workflows)
    if (!status.execution) {
      const now = new Date().toISOString();
      const currentPhase = status.project.current_phase;
      const history: ExecutionHistoryEntry[] = [];

      // Reconstruct history from phase data
      for (const phase of PREVC_PHASE_ORDER) {
        const phaseStatus = status.phases[phase];
        if (phaseStatus.started_at) {
          history.push({
            timestamp: phaseStatus.started_at,
            phase,
            action: 'started',
          });
        }
        if (phaseStatus.completed_at) {
          history.push({
            timestamp: phaseStatus.completed_at,
            phase,
            action: 'completed',
          });
        }
        if (phaseStatus.status === 'skipped') {
          history.push({
            timestamp: now,
            phase,
            action: 'phase_skipped',
          });
        }
      }

      // Sort by timestamp
      history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Determine resume context based on current state
      let resumeContext = generateResumeContext(currentPhase, 'started');
      if (status.approval?.plan_approved) {
        resumeContext = generateResumeContext(currentPhase, 'plan_approved');
      } else if (status.approval?.plan_created) {
        resumeContext = generateResumeContext(currentPhase, 'plan_linked');
      }

      status.execution = {
        history: history.length > 0 ? history : [{
          timestamp: status.project.started || now,
          phase: currentPhase,
          action: 'started',
          description: 'Migrated from legacy workflow',
        }],
        last_activity: history.length > 0 ? history[history.length - 1].timestamp : now,
        resume_context: resumeContext,
      };
    }

    return status;
  }

  /**
   * Parse YAML content to PrevcStatus object
   * Simple implementation for the specific format
   */
  private parseYaml(content: string): PrevcStatus {
    // Basic YAML parsing - for production, use a proper YAML library
    const lines = content.split('\n');
    const result: PrevcStatus = {
      project: {
        name: '',
        scale: ProjectScale.MEDIUM,
        started: new Date().toISOString(),
        current_phase: 'P',
      },
      phases: {
        P: { status: 'pending' },
        R: { status: 'pending' },
        E: { status: 'pending' },
        V: { status: 'pending' },
        C: { status: 'pending' },
      },
      agents: {},
      roles: {},
    };

    let currentSection = '';
    let currentPhase = '';
    let currentRole = '';
    let currentAgent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (line.startsWith('project:')) {
        currentSection = 'project';
      } else if (line.startsWith('phases:')) {
        currentSection = 'phases';
      } else if (line.startsWith('agents:')) {
        currentSection = 'agents';
      } else if (line.startsWith('roles:')) {
        currentSection = 'roles';
      } else if (line.startsWith('settings:')) {
        currentSection = 'settings';
      } else if (line.startsWith('approval:')) {
        currentSection = 'approval';
      } else if (line.startsWith('execution:')) {
        currentSection = 'execution';
      } else if (currentSection === 'project' && line.startsWith('  ')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (key === 'name') result.project.name = value;
        if (key === 'scale') {
          const scaleMap: Record<string, ProjectScale> = {
            QUICK: ProjectScale.QUICK,
            SMALL: ProjectScale.SMALL,
            MEDIUM: ProjectScale.MEDIUM,
            LARGE: ProjectScale.LARGE,
            ENTERPRISE: ProjectScale.LARGE, // Legacy migration - map to LARGE
          };
          result.project.scale = scaleMap[value] ?? ProjectScale.MEDIUM;
        }
        if (key === 'started') result.project.started = value;
        if (key === 'current_phase')
          result.project.current_phase = value as PrevcPhase;
      } else if (currentSection === 'phases') {
        if (line.match(/^  [PREVC]:/)) {
          currentPhase = trimmed.replace(':', '') as PrevcPhase;
        } else if (currentPhase && line.startsWith('    ')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
          if (key === 'status') {
            result.phases[currentPhase as PrevcPhase].status = value as
              | 'pending'
              | 'in_progress'
              | 'completed'
              | 'skipped';
          }
          if (key === 'started_at') {
            result.phases[currentPhase as PrevcPhase].started_at = value;
          }
          if (key === 'completed_at') {
            result.phases[currentPhase as PrevcPhase].completed_at = value;
          }
          if (key === 'reason') {
            result.phases[currentPhase as PrevcPhase].reason = value;
          }
        }
      } else if (currentSection === 'agents') {
        if (line.match(/^  [a-z-]+:/)) {
          currentAgent = trimmed.replace(':', '');
          result.agents[currentAgent] = { status: 'pending' };
        } else if (currentAgent && line.startsWith('    ')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
          const agentStatus = result.agents[currentAgent] || { status: 'pending' };
          if (key === 'status') {
            agentStatus.status = value as
              | 'pending'
              | 'in_progress'
              | 'completed'
              | 'skipped';
          }
          if (key === 'started_at') {
            agentStatus.started_at = value;
          }
          if (key === 'completed_at') {
            agentStatus.completed_at = value;
          }
          // Parse outputs array (simplified - single line format: [a, b, c])
          if (key === 'outputs') {
            const outputsMatch = value.match(/^\[(.*)\]$/);
            if (outputsMatch) {
              agentStatus.outputs = outputsMatch[1]
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(s => s);
            }
          }
          result.agents[currentAgent] = agentStatus;
        }
      } else if (currentSection === 'roles') {
        if (line.match(/^  [a-z-]+:/)) {
          currentRole = trimmed.replace(':', '') as PrevcRole;
          result.roles[currentRole as PrevcRole] = {};
        } else if (currentRole && line.startsWith('    ')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
          const roleStatus = result.roles[currentRole as PrevcRole] || {};
          if (key === 'status') {
            roleStatus.status = value as
              | 'pending'
              | 'in_progress'
              | 'completed'
              | 'skipped';
          }
          if (key === 'phase') {
            roleStatus.phase = value as PrevcPhase;
          }
          if (key === 'last_active') {
            roleStatus.last_active = value;
          }
          if (key === 'current_task') {
            roleStatus.current_task = value;
          }
          result.roles[currentRole as PrevcRole] = roleStatus;
        }
      } else if (currentSection === 'settings' && line.startsWith('  ')) {
        if (!result.project.settings) {
          result.project.settings = {
            autonomous_mode: false,
            require_plan: true,
            require_approval: true,
          };
        }
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (key === 'autonomous_mode') {
          result.project.settings.autonomous_mode = value === 'true';
        }
        if (key === 'require_plan') {
          result.project.settings.require_plan = value === 'true';
        }
        if (key === 'require_approval') {
          result.project.settings.require_approval = value === 'true';
        }
      } else if (currentSection === 'approval' && line.startsWith('  ')) {
        if (!result.approval) {
          result.approval = {
            plan_created: false,
            plan_approved: false,
          };
        }
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (key === 'plan_created') {
          result.approval.plan_created = value === 'true';
        }
        if (key === 'plan_approved') {
          result.approval.plan_approved = value === 'true';
        }
        if (key === 'approved_by') {
          result.approval.approved_by = value || undefined;
        }
        if (key === 'approved_at') {
          result.approval.approved_at = value || undefined;
        }
        if (key === 'approval_notes') {
          result.approval.approval_notes = value || undefined;
        }
      } else if (currentSection === 'execution' && line.startsWith('  ')) {
        if (!result.execution) {
          result.execution = {
            history: [],
            last_activity: '',
            resume_context: '',
          };
        }
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (key === 'last_activity') {
          result.execution.last_activity = value;
        }
        if (key === 'resume_context') {
          result.execution.resume_context = value;
        }
        // Note: history parsing is simplified - for complex arrays, use a YAML library
        // History entries are primarily written by the system, not manually edited
      }
    }

    return result;
  }

  /**
   * Serialize PrevcStatus object to YAML string
   */
  private serializeYaml(status: PrevcStatus): string {
    const lines: string[] = [];

    // Project section
    lines.push('project:');
    lines.push(`  name: "${status.project.name}"`);
    const scaleName =
      typeof status.project.scale === 'number'
        ? ProjectScale[status.project.scale]
        : status.project.scale;
    lines.push(`  scale: ${scaleName}`);
    lines.push(`  started: "${status.project.started}"`);
    lines.push(`  current_phase: ${status.project.current_phase}`);
    lines.push('');

    // Phases section
    lines.push('phases:');
    for (const phase of PREVC_PHASE_ORDER) {
      const phaseStatus = status.phases[phase];
      lines.push(`  ${phase}:`);
      lines.push(`    status: ${phaseStatus.status}`);
      if (phaseStatus.started_at) {
        lines.push(`    started_at: "${phaseStatus.started_at}"`);
      }
      if (phaseStatus.completed_at) {
        lines.push(`    completed_at: "${phaseStatus.completed_at}"`);
      }
      if (phaseStatus.role) {
        lines.push(`    role: ${phaseStatus.role}`);
      }
      if (phaseStatus.current_task) {
        lines.push(`    current_task: "${phaseStatus.current_task}"`);
      }
      if (phaseStatus.reason) {
        lines.push(`    reason: "${phaseStatus.reason}"`);
      }
      if (phaseStatus.outputs && phaseStatus.outputs.length > 0) {
        lines.push('    outputs:');
        for (const output of phaseStatus.outputs) {
          lines.push(`      - path: "${output.path}"`);
          lines.push(`        status: ${output.status}`);
        }
      }
    }
    lines.push('');

    // Agents section (replaces roles as primary tracking)
    const agentsWithData: Array<[string, AgentStatus]> = [];
    if (status.agents) {
      for (const [agentName, agentStatus] of Object.entries(status.agents)) {
        if (agentStatus) {
          agentsWithData.push([agentName, agentStatus]);
        }
      }
    }
    if (agentsWithData.length > 0) {
      lines.push('agents:');
      for (const [agentName, agentStatus] of agentsWithData) {
        lines.push(`  ${agentName}:`);
        lines.push(`    status: ${agentStatus.status}`);
        if (agentStatus.started_at) {
          lines.push(`    started_at: "${agentStatus.started_at}"`);
        }
        if (agentStatus.completed_at) {
          lines.push(`    completed_at: "${agentStatus.completed_at}"`);
        }
        if (agentStatus.outputs && agentStatus.outputs.length > 0) {
          lines.push(`    outputs: [${agentStatus.outputs.map((o) => `"${o}"`).join(', ')}]`);
        }
      }
      lines.push('');
    }

    // Roles section (legacy - kept for backward compatibility)
    const rolesWithData: Array<[string, RoleStatus]> = [];
    if (status.roles) {
      for (const [role, roleStatus] of Object.entries(status.roles)) {
        if (roleStatus && Object.keys(roleStatus).length > 0) {
          rolesWithData.push([role, roleStatus]);
        }
      }
    }
    if (rolesWithData.length > 0) {
      lines.push('roles:');
      for (const [role, roleStatus] of rolesWithData) {
        lines.push(`  ${role}:`);
        if (roleStatus.status) {
          lines.push(`    status: ${roleStatus.status}`);
        }
        if (roleStatus.phase) {
          lines.push(`    phase: ${roleStatus.phase}`);
        }
        if (roleStatus.last_active) {
          lines.push(`    last_active: "${roleStatus.last_active}"`);
        }
        if (roleStatus.current_task) {
          lines.push(`    current_task: "${roleStatus.current_task}"`);
        }
        if (roleStatus.outputs && roleStatus.outputs.length > 0) {
          lines.push(`    outputs: [${roleStatus.outputs.map((o) => `"${o}"`).join(', ')}]`);
        }
      }
      lines.push('');
    }

    // Execution section (new - replaces roles as primary tracking)
    if (status.execution && status.execution.history.length > 0) {
      lines.push('execution:');
      lines.push('  history:');
      for (const entry of status.execution.history) {
        lines.push(`    - timestamp: "${entry.timestamp}"`);
        lines.push(`      phase: ${entry.phase}`);
        lines.push(`      action: ${entry.action}`);
        if (entry.plan) {
          lines.push(`      plan: "${entry.plan}"`);
        }
        if (entry.approved_by) {
          lines.push(`      approved_by: "${entry.approved_by}"`);
        }
        if (entry.description) {
          lines.push(`      description: "${entry.description}"`);
        }
        // Step-level breadcrumb fields
        if (entry.planPhase) {
          lines.push(`      planPhase: "${entry.planPhase}"`);
        }
        if (entry.stepIndex !== undefined) {
          lines.push(`      stepIndex: ${entry.stepIndex}`);
        }
        if (entry.stepDescription) {
          lines.push(`      stepDescription: "${entry.stepDescription}"`);
        }
        if (entry.output) {
          lines.push(`      output: "${entry.output}"`);
        }
        if (entry.notes) {
          lines.push(`      notes: "${entry.notes}"`);
        }
      }
      lines.push(`  last_activity: "${status.execution.last_activity}"`);
      lines.push(`  resume_context: "${status.execution.resume_context}"`);
      lines.push('');
    }

    // Settings section
    const defaultSettings = getDefaultSettings(status.project.scale);
    const settings = status.project.settings;
    const shouldWriteSettings = settings
      && (
        settings.autonomous_mode !== defaultSettings.autonomous_mode ||
        settings.require_plan !== defaultSettings.require_plan ||
        settings.require_approval !== defaultSettings.require_approval
      );
    if (shouldWriteSettings && settings) {
      lines.push('settings:');
      lines.push(`  autonomous_mode: ${settings.autonomous_mode}`);
      lines.push(`  require_plan: ${settings.require_plan}`);
      lines.push(`  require_approval: ${settings.require_approval}`);
      lines.push('');
    }

    // Approval section
    const approval = status.approval;
    const shouldWriteApproval = approval && (
      approval.plan_created ||
      approval.plan_approved ||
      Boolean(approval.approved_by) ||
      Boolean(approval.approved_at) ||
      Boolean(approval.approval_notes)
    );
    if (shouldWriteApproval && approval) {
      lines.push('approval:');
      lines.push(`  plan_created: ${approval.plan_created}`);
      lines.push(`  plan_approved: ${approval.plan_approved}`);
      if (approval.approved_by) {
        lines.push(`  approved_by: "${approval.approved_by}"`);
      }
      if (approval.approved_at) {
        lines.push(`  approved_at: "${approval.approved_at}"`);
      }
      if (approval.approval_notes) {
        lines.push(`  approval_notes: "${approval.approval_notes}"`);
      }
      lines.push('');
    }

    return lines.join('\n') + '\n';
  }
}
