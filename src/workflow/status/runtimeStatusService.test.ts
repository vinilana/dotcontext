import { createInitialStatus } from './templates';
import { PrevcStatusRuntimeService } from './runtimeStatusService';
import { ProjectScale, type PrevcStatus } from '../types';
import { getDefaultSettings } from '../gates';

describe('PrevcStatusRuntimeService', () => {
  it('normalizes legacy-shaped status in place', () => {
    const runtime = new PrevcStatusRuntimeService();
    const legacyStatus: any = createInitialStatus({
      name: 'legacy-shape',
      scale: ProjectScale.SMALL,
      phases: ['P', 'E', 'V'],
      roles: ['planner', 'developer', 'qa'],
    });

    delete legacyStatus.project.settings;
    delete legacyStatus.agents;
    delete legacyStatus.approval;
    delete legacyStatus.execution;

    const status = legacyStatus as PrevcStatus;

    const normalized = runtime.normalizeLoadedStatus(status);

    expect(normalized.changed).toBe(true);
    expect(normalized.status.project.settings).toEqual(getDefaultSettings(ProjectScale.SMALL));
    expect(normalized.status.agents).toEqual({});
    expect(normalized.status.approval?.plan_created).toBe(false);
    expect(normalized.status.execution?.history).toHaveLength(3);
  });

  it('completes the current phase and advances to the next active phase', () => {
    const runtime = new PrevcStatusRuntimeService();
    const status = createInitialStatus({
      name: 'transition-test',
      scale: ProjectScale.LARGE,
      phases: ['P', 'R', 'E', 'V', 'C'],
      roles: 'all',
    });

    const nextPhase = runtime.completePhaseTransition(status, ['output.md'], '2026-04-11T00:00:00.000Z');

    expect(nextPhase).toBe('R');
    expect(status.project.current_phase).toBe('R');
    expect(status.phases.P.status).toBe('completed');
    expect(status.phases.P.outputs).toEqual([{ path: 'output.md', status: 'filled' }]);
    expect(status.phases.R.status).toBe('in_progress');
  });
});
