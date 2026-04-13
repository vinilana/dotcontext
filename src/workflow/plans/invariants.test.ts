import { assertPhaseStatusConverges } from './invariants';
import { WorkflowStateDesyncError } from '../errors';
import type { PrevcStatus, StatusType } from '../types';
import type { PlanExecutionTracking } from './executionTypes';

function makeStatus(phases: Record<string, StatusType>): PrevcStatus {
  return {
    project: { name: 'x', scale: 1, current_phase: 'P', started: '' },
    phases: Object.fromEntries(
      Object.entries(phases).map(([id, status]) => [
        id,
        { status, role: null, started_at: null, completed_at: null, outputs: [] },
      ])
    ),
    roles: {},
  } as unknown as PrevcStatus;
}

function makeTracking(phases: Record<string, StatusType>): PlanExecutionTracking {
  return {
    planSlug: 'plan-x',
    linkedAt: '2026-04-13T00:00:00Z',
    progress: 0,
    phases: Object.fromEntries(
      Object.entries(phases).map(([id, status]) => [
        id,
        { phaseId: id, status, steps: [] },
      ])
    ),
    decisions: [],
    lastUpdated: '2026-04-13T00:00:00Z',
  };
}

describe('assertPhaseStatusConverges', () => {
  it('passes when tracking is null', () => {
    const status = makeStatus({ P: 'completed' });
    expect(() => assertPhaseStatusConverges(null, status)).not.toThrow();
  });

  it('passes when tracking and status agree on every overlapping phase id', () => {
    const tracking = makeTracking({ P: 'completed', R: 'in_progress' });
    const status = makeStatus({ P: 'completed', R: 'in_progress', E: 'pending' });
    expect(() => assertPhaseStatusConverges(tracking, status)).not.toThrow();
  });

  it('passes when tracking and status use disjoint id namespaces', () => {
    const tracking = makeTracking({ 'phase-1': 'completed' });
    const status = makeStatus({ P: 'in_progress' });
    expect(() => assertPhaseStatusConverges(tracking, status)).not.toThrow();
  });

  it('throws with phase id and both values when any phase diverges', () => {
    const tracking = makeTracking({ P: 'completed', R: 'in_progress' });
    const status = makeStatus({ P: 'in_progress', R: 'in_progress' });

    let caught: unknown;
    try {
      assertPhaseStatusConverges(tracking, status);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(WorkflowStateDesyncError);
    const err = caught as WorkflowStateDesyncError;
    expect(err.divergences).toEqual([
      { phaseId: 'P', trackingStatus: 'completed', statusStatus: 'in_progress' },
    ]);
    expect(err.message).toContain('P');
    expect(err.message).toContain('completed');
    expect(err.message).toContain('in_progress');
    expect(err.planSlug).toBe('plan-x');
  });

  it('reports every divergent phase', () => {
    const tracking = makeTracking({ P: 'completed', R: 'completed' });
    const status = makeStatus({ P: 'in_progress', R: 'pending' });

    try {
      assertPhaseStatusConverges(tracking, status);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowStateDesyncError);
      expect((err as WorkflowStateDesyncError).divergences).toHaveLength(2);
    }
  });
});
