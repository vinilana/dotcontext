import * as fs from 'fs-extra';
import * as path from 'path';
import {
  PlanDecision,
  PlanExecutionTracking,
  PlanPhaseTracking,
  StepExecution,
} from './types';
import { StatusType } from '../types';

export class PlanTrackingStore {
  constructor(private readonly workflowPath: string) {}

  getTrackingFile(planSlug: string): string {
    return path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);
  }

  createEmpty(planSlug: string, now: string = new Date().toISOString()): PlanExecutionTracking {
    return {
      planSlug,
      linkedAt: now,
      progress: 0,
      phases: {},
      decisions: [],
      lastUpdated: now,
    };
  }

  async load(planSlug: string): Promise<PlanExecutionTracking | null> {
    const trackingFile = this.getTrackingFile(planSlug);

    if (!await fs.pathExists(trackingFile)) {
      return null;
    }

    try {
      const content = await fs.readFile(trackingFile, 'utf-8');
      const data = JSON.parse(content);
      const migrated = this.migrate(planSlug, data);
      if (!migrated) {
        return null;
      }

      if (migrated.needsMigration) {
        await this.save(planSlug, migrated.tracking);
      }

      return migrated.tracking;
    } catch {
      return null;
    }
  }

  loadSync(planSlug: string): PlanExecutionTracking | null {
    const trackingFile = this.getTrackingFile(planSlug);

    if (!fs.existsSync(trackingFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(trackingFile, 'utf-8');
      const data = JSON.parse(content);
      const migrated = this.migrate(planSlug, data);
      if (!migrated) {
        return null;
      }

      if (migrated.needsMigration) {
        fs.writeFileSync(trackingFile, JSON.stringify(migrated.tracking, null, 2), 'utf-8');
      }

      return migrated.tracking;
    } catch {
      return null;
    }
  }

  async save(planSlug: string, tracking: PlanExecutionTracking): Promise<void> {
    const trackingFile = this.getTrackingFile(planSlug);
    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');
  }

  async loadAll(): Promise<PlanExecutionTracking[]> {
    const slugs = await this.listTrackedPlanSlugs();
    const records = await Promise.all(slugs.map((slug) => this.load(slug)));
    return records.filter((record): record is PlanExecutionTracking => record !== null);
  }

  async listTrackedPlanSlugs(): Promise<string[]> {
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');

    if (!await fs.pathExists(trackingDir)) {
      return [];
    }

    const entries = await fs.readdir(trackingDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.slice(0, -5));
  }

  ensurePhase(tracking: PlanExecutionTracking, phaseId: string, now: string): PlanPhaseTracking {
    if (!tracking.phases[phaseId]) {
      tracking.phases[phaseId] = {
        phaseId,
        status: 'in_progress',
        startedAt: now,
        steps: [],
      };
    }

    return tracking.phases[phaseId];
  }

  ensureStep(
    tracking: PlanExecutionTracking,
    phaseId: string,
    stepIndex: number,
    description: string,
    now: string
  ): StepExecution {
    const phase = this.ensurePhase(tracking, phaseId, now);
    let step = phase.steps.find((s) => s.stepIndex === stepIndex);

    if (!step) {
      step = {
        stepIndex,
        description,
        status: 'pending',
      };
      phase.steps.push(step);
    }

    return step;
  }

  calculateStepProgress(tracking: PlanExecutionTracking): number {
    let totalSteps = 0;
    let completedSteps = 0;

    for (const phase of Object.values(tracking.phases)) {
      totalSteps += phase.steps.length;
      completedSteps += phase.steps.filter(s => s.status === 'completed').length;
    }

    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }

  recordDecision(
    tracking: PlanExecutionTracking,
    decision: Omit<PlanDecision, 'id' | 'decidedAt'>,
    now: string = new Date().toISOString()
  ): PlanDecision {
    const fullDecision: PlanDecision = {
      ...decision,
      id: `dec-${Date.now()}`,
      decidedAt: now,
    };

    tracking.decisions.push(fullDecision);
    tracking.lastUpdated = now;
    return fullDecision;
  }

  applyApproval(
    tracking: PlanExecutionTracking,
    approval: {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      approvedBy?: string;
    },
    now: string = approval.approvedAt || new Date().toISOString()
  ): void {
    tracking.approvalStatus = approval.approvalStatus;
    tracking.approvedAt = approval.approvedAt;
    tracking.approvedBy = approval.approvedBy;
    tracking.lastUpdated = now;
  }

  recordPhaseCommit(
    tracking: PlanExecutionTracking,
    phaseId: string,
    commitInfo: {
      hash: string;
      shortHash: string;
      committedBy?: string;
    },
    now: string = new Date().toISOString()
  ): boolean {
    const phase = tracking.phases[phaseId];
    if (!phase) {
      return false;
    }

    phase.commitHash = commitInfo.hash;
    phase.commitShortHash = commitInfo.shortHash;
    phase.committedAt = now;
    if (commitInfo.committedBy) {
      phase.committedBy = commitInfo.committedBy;
    }

    tracking.lastUpdated = now;
    return true;
  }

  private migrate(planSlug: string, data: unknown): { tracking: PlanExecutionTracking; needsMigration: boolean } | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }

    const tracking = data as Partial<PlanExecutionTracking> & {
      phases?: Record<string, { status: string; updatedAt?: string } | PlanPhaseTracking>;
    };
    let needsMigration = false;

    if (!tracking.phases || typeof tracking.phases !== 'object') {
      const now = new Date().toISOString();
      return {
        needsMigration: true,
        tracking: {
          planSlug,
          linkedAt: tracking.linkedAt || now,
          progress: tracking.progress || 0,
          phases: {},
          decisions: tracking.decisions || [],
          lastUpdated: tracking.lastUpdated || now,
        },
      };
    }

    const migratedPhases: Record<string, PlanPhaseTracking> = {};

    for (const [phaseId, phaseData] of Object.entries(tracking.phases)) {
      if (phaseData && typeof phaseData === 'object' && 'steps' in phaseData) {
        migratedPhases[phaseId] = phaseData as PlanPhaseTracking;
        continue;
      }

      const simplePhase = phaseData as { status: StatusType; updatedAt?: string };
      migratedPhases[phaseId] = {
        phaseId,
        status: simplePhase.status,
        startedAt: simplePhase.updatedAt,
        completedAt: simplePhase.status === 'completed' ? simplePhase.updatedAt : undefined,
        steps: [],
      };
      needsMigration = true;
    }

    if (!tracking.linkedAt) {
      needsMigration = true;
    }

    return {
      needsMigration,
      tracking: {
        planSlug: tracking.planSlug || planSlug,
        linkedAt: tracking.linkedAt || new Date().toISOString(),
        progress: tracking.progress || 0,
        phases: migratedPhases,
        approvalStatus: tracking.approvalStatus,
        approvedAt: tracking.approvedAt,
        approvedBy: tracking.approvedBy,
        decisions: tracking.decisions || [],
        lastUpdated: tracking.lastUpdated || new Date().toISOString(),
      },
    };
  }
}
