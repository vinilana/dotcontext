import { ProjectScale } from '../types';
import { createInitialStatus } from './templates';
import {
  completeStatusPhaseTransition,
  markStatusPhaseComplete,
  transitionStatusToPhase,
} from './statusTransitions';

describe('statusTransitions', () => {
  it('transitions to a target phase and records execution history', () => {
    const status = createInitialStatus({
      name: 'transition-target',
      scale: ProjectScale.LARGE,
      phases: ['P', 'R', 'E', 'V', 'C'],
      roles: 'all',
    });

    transitionStatusToPhase(status, 'R', '2026-04-12T10:00:00.000Z');

    expect(status.project.current_phase).toBe('R');
    expect(status.phases.R.status).toBe('in_progress');
    expect(status.phases.R.started_at).toBe('2026-04-12T10:00:00.000Z');
    expect(status.execution?.history.at(-1)).toMatchObject({
      phase: 'R',
      action: 'started',
      timestamp: '2026-04-12T10:00:00.000Z',
    });
  });

  it('completes the current phase and skips disabled phases when advancing', () => {
    const status = createInitialStatus({
      name: 'skip-review',
      scale: ProjectScale.SMALL,
      phases: ['P', 'E', 'V'],
      roles: ['planner', 'developer', 'qa'],
    });

    const nextPhase = completeStatusPhaseTransition(
      status,
      ['plan.md'],
      '2026-04-12T11:00:00.000Z'
    );

    expect(nextPhase).toBe('E');
    expect(status.project.current_phase).toBe('E');
    expect(status.phases.P.outputs).toEqual([{ path: 'plan.md', status: 'filled' }]);
    expect(status.phases.E.status).toBe('in_progress');
    expect(status.execution?.history.map((entry) => `${entry.phase}:${entry.action}`)).toEqual([
      'P:completed',
      'E:started',
    ]);
  });

  it('marks a phase complete without advancing', () => {
    const status = createInitialStatus({
      name: 'mark-complete',
      scale: ProjectScale.MEDIUM,
      phases: ['P', 'R', 'E', 'V'],
      roles: ['planner', 'architect', 'developer', 'qa', 'reviewer'],
    });

    markStatusPhaseComplete(status, 'P', ['brief.md'], '2026-04-12T12:00:00.000Z');

    expect(status.project.current_phase).toBe('P');
    expect(status.phases.P).toMatchObject({
      status: 'completed',
      completed_at: '2026-04-12T12:00:00.000Z',
      outputs: [{ path: 'brief.md', status: 'filled' }],
    });
    expect(status.execution?.resume_context).toContain('concluída');
  });
});
