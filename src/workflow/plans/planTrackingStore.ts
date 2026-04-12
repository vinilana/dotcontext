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
      return this.migrate(planSlug, data);
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
      return this.migrate(planSlug, data);
    } catch {
      return null;
    }
  }

  async save(planSlug: string, tracking: PlanExecutionTracking): Promise<void> {
    const trackingFile = this.getTrackingFile(planSlug);
    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');
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

  private migrate(planSlug: string, data: unknown): PlanExecutionTracking | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }

    const tracking = data as Partial<PlanExecutionTracking> & {
      phases?: Record<string, { status: string; updatedAt?: string } | PlanPhaseTracking>;
    };

    if (!tracking.phases || typeof tracking.phases !== 'object') {
      const now = new Date().toISOString();
      return {
        planSlug,
        progress: tracking.progress || 0,
        phases: {},
        decisions: tracking.decisions || [],
        lastUpdated: tracking.lastUpdated || now,
      };
    }

    const migratedPhases: Record<string, PlanPhaseTracking> = {};
    let needsMigration = false;

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

    return {
      planSlug: tracking.planSlug || planSlug,
      progress: tracking.progress || 0,
      approvalStatus: tracking.approvalStatus,
      approvedAt: tracking.approvedAt,
      approvedBy: tracking.approvedBy,
      phases: migratedPhases,
      decisions: tracking.decisions || [],
      lastUpdated: tracking.lastUpdated || new Date().toISOString(),
    };
  }
}
