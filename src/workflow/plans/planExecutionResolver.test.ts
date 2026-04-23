import { PlanExecutionResolver } from './planExecutionResolver';
import { LinkedPlan, PlanExecutionTracking, PlanReference } from './types';

describe('PlanExecutionResolver', () => {
  const ref: PlanReference = {
    slug: 'resolver-plan',
    path: 'plans/resolver-plan.md',
    title: 'Resolver Plan',
    linkedAt: '2026-04-12T10:00:00.000Z',
    status: 'active',
  };

  const documentPlan: LinkedPlan = {
    ref,
    decisions: [],
    risks: [],
    agents: ['planner', 'developer'],
    agentLineup: [{ type: 'planner' }, { type: 'developer' }],
    docs: ['README.md'],
    progress: 0,
    currentPhase: undefined,
    phases: [
      {
        id: 'phase-1',
        name: 'Discovery',
        prevcPhase: 'P',
        status: 'pending',
        steps: [
          { order: 1, description: 'Gather requirements', status: 'pending', outputs: ['requirements-summary'] },
          { order: 2, description: 'Align constraints', status: 'pending', outputs: ['constraint-matrix'] },
        ],
      },
      {
        id: 'phase-2',
        name: 'Implementation',
        prevcPhase: 'E',
        status: 'pending',
        steps: [
          { order: 1, description: 'Ship code', status: 'pending', outputs: ['code-changes'] },
        ],
      },
    ],
  };

  it('resolves linked plan execution state from tracking JSON', () => {
    const resolver = new PlanExecutionResolver();
    const tracking: PlanExecutionTracking = {
      planSlug: 'resolver-plan',
      linkedAt: '2026-04-12T10:00:00.000Z',
      progress: 0,
      approvalStatus: 'approved',
      approvedAt: '2026-04-12T10:05:00.000Z',
      approvedBy: 'architect',
      lastUpdated: '2026-04-12T10:10:00.000Z',
      decisions: [
        {
          id: 'dec-1',
          title: 'Use JSON tracking',
          description: 'Execution tracking is canonical',
          status: 'accepted',
          decidedAt: '2026-04-12T10:09:00.000Z',
        },
      ],
      phases: {
        'phase-1': {
          phaseId: 'phase-1',
          status: 'completed',
          startedAt: '2026-04-12T10:00:00.000Z',
          completedAt: '2026-04-12T10:06:00.000Z',
          steps: [
            {
              stepIndex: 1,
              description: 'Gather requirements',
              status: 'completed',
              completedAt: '2026-04-12T10:02:00.000Z',
              output: 'requirements-summary-v2',
            },
            {
              stepIndex: 2,
              description: 'Align constraints',
              status: 'completed',
              completedAt: '2026-04-12T10:06:00.000Z',
            },
          ],
        },
        'phase-2': {
          phaseId: 'phase-2',
          status: 'in_progress',
          startedAt: '2026-04-12T10:07:00.000Z',
          steps: [
            {
              stepIndex: 1,
              description: 'Ship code',
              status: 'in_progress',
              startedAt: '2026-04-12T10:08:00.000Z',
            },
          ],
        },
      },
    };

    const resolved = resolver.resolve(documentPlan, tracking);

    expect(resolved.progress).toBe(67);
    expect(resolved.currentPhase).toBe('phase-2');
    expect(resolved.ref).toMatchObject({
      approval_status: 'approved',
      approved_at: '2026-04-12T10:05:00.000Z',
      approved_by: 'architect',
    });
    expect(resolved.decisions).toEqual(tracking.decisions);
    expect(resolved.phases[0].status).toBe('completed');
    expect(resolved.phases[0].steps[0]).toMatchObject({
      status: 'completed',
      outputs: ['requirements-summary', 'requirements-summary-v2'],
      completedAt: '2026-04-12T10:02:00.000Z',
    });
    expect(resolved.phases[1].status).toBe('in_progress');
  });

  it('calculates step progress against document steps instead of only tracked steps', () => {
    const resolver = new PlanExecutionResolver();
    const tracking: PlanExecutionTracking = {
      planSlug: 'resolver-plan',
      linkedAt: '2026-04-12T10:00:00.000Z',
      progress: 100,
      lastUpdated: '2026-04-12T10:10:00.000Z',
      decisions: [],
      phases: {
        'phase-1': {
          phaseId: 'phase-1',
          status: 'in_progress',
          startedAt: '2026-04-12T10:00:00.000Z',
          steps: [
            {
              stepIndex: 1,
              description: 'Gather requirements',
              status: 'completed',
              completedAt: '2026-04-12T10:02:00.000Z',
            },
          ],
        },
      },
    };

    expect(resolver.calculateProgress(documentPlan, tracking)).toBe(33);
  });
});
