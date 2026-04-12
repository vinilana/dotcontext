import * as fs from 'fs-extra';
import * as path from 'path';

import { PlanLinkerParser } from './planLinkerParser';
import { PlanExecutionTracking, PlanReference, WorkflowPlans } from './types';

export class PlanIndexProjector {
  constructor(
    private readonly contextPath: string,
    private readonly workflowPath: string,
    private readonly plansPath: string,
    private readonly parser: PlanLinkerParser,
    private readonly loadTrackings: () => Promise<PlanExecutionTracking[]>
  ) {}

  async loadIndex(): Promise<WorkflowPlans | null> {
    const plansFile = path.join(this.workflowPath, 'plans.json');

    if (!await fs.pathExists(plansFile)) {
      return null;
    }

    try {
      return await fs.readJson(plansFile);
    } catch {
      return null;
    }
  }

  async refreshIndex(): Promise<WorkflowPlans> {
    const trackingRecords = await this.loadTrackings();
    const refs = await Promise.all(trackingRecords.map((tracking) => this.toPlanReference(tracking)));

    const active = refs
      .filter((ref) => ref.status !== 'completed')
      .sort(this.compareReferencesByLinkedAt);
    const completed = refs
      .filter((ref) => ref.status === 'completed')
      .sort(this.compareReferencesByLinkedAt);

    const index: WorkflowPlans = {
      active,
      completed,
      primary: active[0]?.slug || completed[0]?.slug,
    };

    await fs.ensureDir(this.workflowPath);
    await fs.writeJson(path.join(this.workflowPath, 'plans.json'), index, { spaces: 2 });
    return index;
  }

  private async toPlanReference(tracking: PlanExecutionTracking): Promise<PlanReference> {
    const planPath = path.join(this.plansPath, `${tracking.planSlug}.md`);
    let title = tracking.planSlug;
    let summary: string | undefined;

    if (await fs.pathExists(planPath)) {
      const content = await fs.readFile(planPath, 'utf-8');
      const parsed = this.parser.parsePlanFile(content, tracking.planSlug);
      title = parsed.title;
      summary = parsed.summary;
    } else {
      const fallbackPath = path.relative(this.contextPath, planPath).replace(/\\/g, '/');
      return {
        slug: tracking.planSlug,
        path: fallbackPath,
        title,
        summary,
        linkedAt: tracking.linkedAt,
        status: this.inferPlanStatus(tracking),
        approval_status: tracking.approvalStatus,
        approved_at: tracking.approvedAt,
        approved_by: tracking.approvedBy,
      };
    }

    return {
      slug: tracking.planSlug,
      path: path.relative(this.contextPath, planPath).replace(/\\/g, '/'),
      title,
      summary,
      linkedAt: tracking.linkedAt,
      status: this.inferPlanStatus(tracking),
      approval_status: tracking.approvalStatus,
      approved_at: tracking.approvedAt,
      approved_by: tracking.approvedBy,
    };
  }

  private inferPlanStatus(tracking: PlanExecutionTracking): PlanReference['status'] {
    const phases = Object.values(tracking.phases);
    const isComplete = phases.length > 0 && phases.every((phase) => phase.status === 'completed');
    return isComplete ? 'completed' : 'active';
  }

  private compareReferencesByLinkedAt(a: PlanReference, b: PlanReference): number {
    return a.linkedAt.localeCompare(b.linkedAt);
  }
}
