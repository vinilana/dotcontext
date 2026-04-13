import { getPhaseDefinition } from '../../workflow/phases';
import type { LinkedPlan, PlanPhase, PlanStep } from '../../workflow/plans';
import type { PrevcPhase } from '../../workflow/types';
import type { HarnessTaskContract } from '../harness';

export interface DerivedTaskContractInput {
  title: string;
  description?: string;
  owner?: string;
  inputs: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  requiredSensors: string[];
  requiredArtifacts: string[];
  metadata: Record<string, unknown>;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    )
  );
}

/**
 * Builds `HarnessTaskContract` inputs derived from a linked plan + PREVC phase.
 * Pure: no I/O, no service dependencies.
 */
export class DerivedPlanTaskContractBuilder {
  build(plan: LinkedPlan, phase: PrevcPhase): DerivedTaskContractInput {
    const matchingPlanPhases = plan.phases.filter(
      (planPhase) => planPhase.prevcPhase === phase
    );
    const phaseDefinition = getPhaseDefinition(phase);
    const flattenedSteps = matchingPlanPhases.flatMap((planPhase) => planPhase.steps);
    const explicitOutputs = [
      ...matchingPlanPhases.flatMap((planPhase) => planPhase.deliverables ?? []),
      ...flattenedSteps.flatMap((step) => step.outputs || step.deliverables || []),
    ];
    const expectedOutputs = uniqueStrings(
      explicitOutputs.length > 0 ? explicitOutputs : phaseDefinition.outputs
    );
    const acceptanceCriteria = uniqueStrings(
      flattenedSteps.length > 0
        ? flattenedSteps.map((step) => step.description)
        : matchingPlanPhases.length > 0
          ? matchingPlanPhases.map(
              (planPhase) => planPhase.summary || `Complete ${planPhase.name}`
            )
          : [`Complete ${phaseDefinition.name}`]
    );
    const owners = uniqueStrings(
      flattenedSteps
        .map((step) => step.assignee)
        .filter(
          (assignee): assignee is string =>
            typeof assignee === 'string' && assignee.trim().length > 0
        )
    );
    const owner = owners.length === 1 ? owners[0] : phaseDefinition.roles[0];
    const title = this.buildTitle(plan, phase, matchingPlanPhases);
    const description = this.buildDescription(
      plan,
      phase,
      matchingPlanPhases,
      flattenedSteps,
      expectedOutputs
    );

    return {
      title,
      description,
      owner,
      inputs: plan.docs.map((doc) => `docs/${doc}`),
      expectedOutputs,
      acceptanceCriteria,
      requiredSensors: [],
      requiredArtifacts: [],
      metadata: {
        source: 'workflow.plan',
        planSlug: plan.ref.slug,
        prevcPhase: phase,
        planPhaseIds: matchingPlanPhases.map((planPhase) => planPhase.id),
        planPhaseNames: matchingPlanPhases.map((planPhase) => planPhase.name),
        planPhaseSummaries: matchingPlanPhases
          .map((planPhase) => planPhase.summary)
          .filter(Boolean),
        derivedFrom:
          matchingPlanPhases.length > 0 ? 'linked-plan' : 'workflow-phase-defaults',
      },
    };
  }

  isSameDerivedTask(
    activeTask: HarnessTaskContract | null | undefined,
    planSlug: string,
    phase: PrevcPhase
  ): activeTask is HarnessTaskContract {
    return Boolean(
      activeTask &&
        activeTask.metadata?.source === 'workflow.plan' &&
        activeTask.metadata?.planSlug === planSlug &&
        activeTask.metadata?.prevcPhase === phase
    );
  }

  private buildTitle(
    plan: LinkedPlan,
    phase: PrevcPhase,
    matchingPlanPhases: PlanPhase[]
  ): string {
    if (matchingPlanPhases.length === 1) {
      return `${plan.ref.title}: ${matchingPlanPhases[0].name}`;
    }
    if (matchingPlanPhases.length > 1) {
      return `${plan.ref.title}: ${getPhaseDefinition(phase).name} (${matchingPlanPhases.length} plan phases)`;
    }
    return `${plan.ref.title}: ${getPhaseDefinition(phase).name}`;
  }

  private buildDescription(
    plan: LinkedPlan,
    phase: PrevcPhase,
    matchingPlanPhases: PlanPhase[],
    flattenedSteps: PlanStep[],
    expectedOutputs: string[]
  ): string {
    const lines = [
      `Derived from linked plan "${plan.ref.slug}" for PREVC phase ${phase} (${getPhaseDefinition(phase).name}).`,
    ];
    if (matchingPlanPhases.length > 0) {
      lines.push(
        `Plan phases: ${matchingPlanPhases.map((planPhase) => planPhase.name).join(', ')}.`
      );
    }
    const summaries = matchingPlanPhases
      .map((planPhase) => planPhase.summary)
      .filter(
        (summary): summary is string =>
          typeof summary === 'string' && summary.trim().length > 0
      );
    if (summaries.length > 0) {
      lines.push(`Phase objectives: ${summaries.join(' ')}.`);
    }
    if (flattenedSteps.length > 0) {
      lines.push(
        `Key steps: ${flattenedSteps.map((step) => step.description).join('; ')}.`
      );
    }
    if (expectedOutputs.length > 0) {
      lines.push(`Expected outputs: ${expectedOutputs.join(', ')}.`);
    }
    return lines.join(' ');
  }
}
