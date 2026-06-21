import { StatusType } from '../types';
import {
  LinkedPlan,
  PlanExecutionTracking,
  PlanPhase,
  PlanPhaseTracking,
  PlanStep,
  StepExecution,
} from './types';

export class PlanExecutionResolver {
  resolve(documentPlan: LinkedPlan, tracking?: PlanExecutionTracking | null): LinkedPlan {
    if (!tracking) {
      return {
        ...documentPlan,
        progress: 0,
        currentPhase: undefined,
      };
    }

    const phases = documentPlan.phases.map((phase) => this.resolvePhase(phase, tracking.phases[phase.id]));
    const currentPhase = phases.find((phase) => phase.status === 'in_progress')?.id;

    return {
      ...documentPlan,
      ref: {
        ...documentPlan.ref,
        approval_status: tracking.approvalStatus ?? documentPlan.ref.approval_status,
        approved_at: tracking.approvedAt ?? documentPlan.ref.approved_at,
        approved_by: tracking.approvedBy ?? documentPlan.ref.approved_by,
      },
      decisions: tracking.decisions.length > 0 ? tracking.decisions : documentPlan.decisions,
      phases,
      progress: this.calculateProgress(documentPlan, tracking),
      currentPhase,
    };
  }

  calculateProgress(documentPlan: LinkedPlan | null, tracking: PlanExecutionTracking): number {
    const documentPhases = documentPlan?.phases ?? [];
    const trackedPhaseMap = tracking.phases;

    const stepProgress = this.calculateStepProgress(documentPhases, trackedPhaseMap);
    if (stepProgress !== null) {
      return stepProgress;
    }

    const phaseProgress = this.calculatePhaseProgress(documentPhases, trackedPhaseMap);
    if (phaseProgress !== null) {
      return phaseProgress;
    }

    const trackedPhases = Object.values(trackedPhaseMap);
    if (trackedPhases.length > 0) {
      const completedTrackedPhases = trackedPhases.filter((phase) => phase.status === 'completed').length;
      return Math.round((completedTrackedPhases / trackedPhases.length) * 100);
    }

    return tracking.progress;
  }

  private resolvePhase(phase: PlanPhase, trackedPhase?: PlanPhaseTracking): PlanPhase {
    const trackedSteps = new Map((trackedPhase?.steps ?? []).map((step) => [step.stepIndex, step]));
    const steps = phase.steps.map((step) => {
      const trackedStep = trackedSteps.get(step.order);
      return trackedStep ? this.resolveStep(step, trackedStep) : step;
    });

    for (const trackedStep of trackedPhase?.steps ?? []) {
      if (!steps.some((step) => step.order === trackedStep.stepIndex)) {
        steps.push(this.toTrackedPlanStep(trackedStep));
      }
    }

    return {
      ...phase,
      status: trackedPhase?.status ?? this.inferPhaseStatusFromSteps(steps, phase.status),
      startedAt: trackedPhase?.startedAt ?? phase.startedAt,
      completedAt: trackedPhase?.completedAt ?? phase.completedAt,
      steps: steps.sort((a, b) => a.order - b.order),
    };
  }

  private resolveStep(step: PlanStep, trackedStep: StepExecution): PlanStep {
    const mergedDeliverables = this.mergeUniqueStrings(step.deliverables, trackedStep.deliverables);
    const mergedOutputs = trackedStep.output
      ? this.mergeUniqueStrings(step.outputs, [...(trackedStep.deliverables ?? []), trackedStep.output])
      : this.mergeUniqueStrings(step.outputs, trackedStep.deliverables);

    return {
      ...step,
      deliverables: mergedDeliverables.length > 0 ? mergedDeliverables : step.deliverables,
      outputs: mergedOutputs.length > 0 ? mergedOutputs : step.outputs,
      status: trackedStep.status,
      completedAt: trackedStep.completedAt,
    };
  }

  private toTrackedPlanStep(trackedStep: StepExecution): PlanStep {
    const outputs = trackedStep.output
      ? this.mergeUniqueStrings(trackedStep.deliverables, [trackedStep.output])
      : trackedStep.deliverables;

    return {
      order: trackedStep.stepIndex,
      description: trackedStep.description,
      deliverables: trackedStep.deliverables,
      outputs,
      status: trackedStep.status,
      completedAt: trackedStep.completedAt,
    };
  }

  private inferPhaseStatusFromSteps(steps: PlanStep[], fallback: StatusType): StatusType {
    if (steps.length === 0) {
      return fallback;
    }
    if (steps.every((step) => step.status === 'completed')) {
      return 'completed';
    }
    if (steps.some((step) => step.status === 'in_progress' || step.status === 'completed')) {
      return 'in_progress';
    }
    return fallback;
  }

  private calculateStepProgress(
    documentPhases: PlanPhase[],
    trackedPhaseMap: Record<string, PlanPhaseTracking>
  ): number | null {
    let totalSteps = 0;
    let completedSteps = 0;
    let hasAnyStepShape = false;

    for (const phase of documentPhases) {
      const trackedPhase = trackedPhaseMap[phase.id];
      const documentSteps = phase.steps;
      const trackedSteps = trackedPhase?.steps ?? [];

      if (documentSteps.length > 0 || trackedSteps.length > 0) {
        hasAnyStepShape = true;
      }

      if (documentSteps.length > 0) {
        const trackedByIndex = new Map(trackedSteps.map((step) => [step.stepIndex, step]));
        totalSteps += documentSteps.length;
        completedSteps += documentSteps.filter((step) => trackedByIndex.get(step.order)?.status === 'completed').length;
        continue;
      }

      totalSteps += trackedSteps.length;
      completedSteps += trackedSteps.filter((step) => step.status === 'completed').length;
    }

    for (const [phaseId, trackedPhase] of Object.entries(trackedPhaseMap)) {
      if (documentPhases.some((phase) => phase.id === phaseId)) {
        continue;
      }

      if (trackedPhase.steps.length > 0) {
        hasAnyStepShape = true;
        totalSteps += trackedPhase.steps.length;
        completedSteps += trackedPhase.steps.filter((step) => step.status === 'completed').length;
      }
    }

    if (!hasAnyStepShape || totalSteps === 0) {
      return null;
    }

    return Math.round((completedSteps / totalSteps) * 100);
  }

  private calculatePhaseProgress(
    documentPhases: PlanPhase[],
    trackedPhaseMap: Record<string, PlanPhaseTracking>
  ): number | null {
    if (documentPhases.length === 0) {
      return null;
    }

    const completedPhases = documentPhases.filter((phase) => trackedPhaseMap[phase.id]?.status === 'completed').length;
    return Math.round((completedPhases / documentPhases.length) * 100);
  }

  private mergeUniqueStrings(...groups: Array<string[] | undefined>): string[] {
    return [...new Set(groups.flatMap((group) => group ?? []).map((value) => value.trim()).filter(Boolean))];
  }
}
