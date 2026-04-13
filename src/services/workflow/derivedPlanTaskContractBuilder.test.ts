/**
 * Tests for DerivedPlanTaskContractBuilder — specifically that execution
 * evidence requirements declared on a plan phase flow into the derived
 * contract, and that a conservative default is applied when they are absent.
 */

import { DerivedPlanTaskContractBuilder } from './derivedPlanTaskContractBuilder';
import type { LinkedPlan, PlanPhase } from '../../workflow/plans';

function makePlan(phases: PlanPhase[]): LinkedPlan {
  return {
    ref: {
      slug: 'test-plan',
      path: 'plans/test-plan.md',
      title: 'Test Plan',
      linkedAt: '2026-04-13T00:00:00.000Z',
      status: 'active',
    },
    phases,
    decisions: [],
    risks: [],
    agents: [],
    agentLineup: [],
    docs: [],
    progress: 0,
  };
}

describe('DerivedPlanTaskContractBuilder', () => {
  const builder = new DerivedPlanTaskContractBuilder();

  it('propagates required_sensors and required_artifacts from plan phase requirements', () => {
    const plan = makePlan([
      {
        id: 'phase-2',
        name: 'Implementation',
        prevcPhase: 'E',
        steps: [],
        status: 'pending',
        requirements: {
          requiredSensors: ['tests', 'typecheck'],
          requiredArtifacts: ['handoff-summary'],
        },
      },
    ]);

    const input = builder.build(plan, 'E');

    expect(input.requiredSensors).toEqual(['tests', 'typecheck']);
    expect(input.requiredArtifacts).toEqual(['handoff-summary']);
    expect(input.metadata.requirementsSource).toBe('plan-frontmatter');
  });

  it('applies conservative default ["tests"] for phase E when plan omits requirements', () => {
    const plan = makePlan([
      {
        id: 'phase-2',
        name: 'Implementation',
        prevcPhase: 'E',
        steps: [],
        status: 'pending',
      },
    ]);

    const input = builder.build(plan, 'E');

    expect(input.requiredSensors).toEqual(['tests']);
    expect(input.requiredArtifacts).toEqual([]);
    expect(input.metadata.requirementsSource).toBe('phase-defaults');
  });

  it('applies conservative default ["tests","lint"] for phase V when plan omits requirements', () => {
    const plan = makePlan([
      {
        id: 'phase-3',
        name: 'Validation',
        prevcPhase: 'V',
        steps: [],
        status: 'pending',
      },
    ]);

    const input = builder.build(plan, 'V');

    expect(input.requiredSensors).toEqual(['tests', 'lint']);
    expect(input.metadata.requirementsSource).toBe('phase-defaults');
  });

  it('applies no defaults for phases P/R/C so declared requirements (or none) are honored', () => {
    const plan = makePlan([
      {
        id: 'phase-1',
        name: 'Planning',
        prevcPhase: 'P',
        steps: [],
        status: 'pending',
      },
    ]);

    const input = builder.build(plan, 'P');

    expect(input.requiredSensors).toEqual([]);
    expect(input.requiredArtifacts).toEqual([]);
    expect(input.metadata.requirementsSource).toBe('none');
  });

  it('merges requirements across multiple plan phases targeting the same PREVC phase', () => {
    const plan = makePlan([
      {
        id: 'phase-2a',
        name: 'Impl A',
        prevcPhase: 'E',
        steps: [],
        status: 'pending',
        requirements: { requiredSensors: ['tests'], requiredArtifacts: [] },
      },
      {
        id: 'phase-2b',
        name: 'Impl B',
        prevcPhase: 'E',
        steps: [],
        status: 'pending',
        requirements: { requiredSensors: ['typecheck'], requiredArtifacts: ['diff.md'] },
      },
    ]);

    const input = builder.build(plan, 'E');

    expect(input.requiredSensors.sort()).toEqual(['tests', 'typecheck']);
    expect(input.requiredArtifacts).toEqual(['diff.md']);
    expect(input.metadata.requirementsSource).toBe('plan-frontmatter');
  });
});
