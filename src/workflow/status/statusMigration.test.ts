import { ProjectScale } from '../types';
import { migrateLegacyStatus } from './statusMigration';
import { createInitialStatus } from './templates';

describe('migrateLegacyStatus', () => {
  it('hydrates settings, approval, execution and agents for partially initialized status', () => {
    const status: any = createInitialStatus({
      name: 'hydration-test',
      scale: ProjectScale.SMALL,
      phases: ['P', 'E', 'V'],
      roles: ['planner', 'developer', 'qa'],
    });
    status.project.started = '2026-04-10T00:00:00.000Z';
    status.phases.P.started_at = '2026-04-10T00:00:00.000Z';

    delete status.project.settings;
    delete status.agents;
    delete status.approval;
    delete status.execution;

    const migrated = migrateLegacyStatus(status, '2026-04-12T00:00:00.000Z');

    expect(migrated.project.settings).toEqual({
      autonomous_mode: false,
      require_plan: true,
      require_approval: false,
    });
    expect(migrated.agents).toEqual({});
    expect(migrated.approval).toMatchObject({
      plan_created: false,
      plan_approved: false,
    });
    expect(migrated.execution?.history.map((entry) => `${entry.phase}:${entry.action}`)).toEqual([
      'P:started',
      'R:phase_skipped',
      'C:phase_skipped',
    ]);
    expect(migrated.execution?.resume_context).toContain('Fase P');
  });

  it('auto-approves migrated workflows that are already past review', () => {
    const status = createInitialStatus({
      name: 'post-review',
      scale: ProjectScale.MEDIUM,
      phases: ['P', 'R', 'E', 'V'],
      roles: ['planner', 'architect', 'developer', 'qa', 'reviewer'],
    });

    status.project.current_phase = 'E';
    status.phases.P = {
      status: 'completed',
      started_at: '2026-04-10T00:00:00.000Z',
      completed_at: '2026-04-10T01:00:00.000Z',
    };
    status.phases.R = {
      status: 'completed',
      started_at: '2026-04-10T01:00:00.000Z',
      completed_at: '2026-04-10T02:00:00.000Z',
    };
    delete status.approval;
    delete status.execution;

    const migrated = migrateLegacyStatus(status, '2026-04-12T00:00:00.000Z');

    expect(migrated.approval).toMatchObject({
      plan_approved: true,
      approved_by: 'system-migration',
      approved_at: '2026-04-12T00:00:00.000Z',
    });
    expect(migrated.execution?.history.map((entry) => `${entry.phase}:${entry.action}`)).toEqual([
      'P:started',
      'P:completed',
      'R:started',
      'R:completed',
      'C:phase_skipped',
    ]);
  });
});
