import { ProjectScale } from '../types';
import { parseLegacyStatusYaml } from '../legacy/statusYaml';

describe('parseLegacyStatusYaml', () => {
  it('parses legacy workflow projections into canonical PREVC state', () => {
    const parsed = parseLegacyStatusYaml([
      'project:',
      '  name: "legacy-parser"',
      '  scale: ENTERPRISE',
      '  started: "2026-04-10T00:00:00.000Z"',
      '  current_phase: E',
      '',
      'phases:',
      '  P:',
      '    status: completed',
      '    started_at: "2026-04-10T00:00:00.000Z"',
      '    completed_at: "2026-04-10T01:00:00.000Z"',
      '  R:',
      '    status: skipped',
      '    reason: "small route"',
      '  E:',
      '    status: in_progress',
      '',
      'agents:',
      '  developer:',
      '    status: completed',
      '    started_at: "2026-04-10T02:00:00.000Z"',
      '    completed_at: "2026-04-10T03:00:00.000Z"',
      '    outputs: ["src/a.ts", "src/b.ts"]',
      '',
      'roles:',
      '  planner:',
      '    status: completed',
      '    phase: P',
      '    current_task: "Define scope"',
      '',
      'settings:',
      '  autonomous_mode: false',
      '  require_plan: true',
      '  require_approval: false',
      '',
      'approval:',
      '  plan_created: true',
      '  plan_approved: false',
      '  approved_by: ""',
      '',
      'execution:',
      '  last_activity: "2026-04-10T03:00:00.000Z"',
      '  resume_context: "Continuar execucao"',
    ].join('\n'));

    expect(parsed.project.name).toBe('legacy-parser');
    expect(parsed.project.scale).toBe(ProjectScale.LARGE);
    expect(parsed.project.current_phase).toBe('E');
    expect(parsed.phases.P.completed_at).toBe('2026-04-10T01:00:00.000Z');
    expect(parsed.phases.R.status).toBe('skipped');
    expect(parsed.phases.R.reason).toBe('small route');
    expect(parsed.agents.developer.outputs).toEqual(['src/a.ts', 'src/b.ts']);
    expect(parsed.roles.planner?.current_task).toBe('Define scope');
    expect(parsed.project.settings).toEqual({
      autonomous_mode: false,
      require_plan: true,
      require_approval: false,
    });
    expect(parsed.approval).toEqual({
      plan_created: true,
      plan_approved: false,
      approved_by: undefined,
    });
    expect(parsed.execution?.resume_context).toBe('Continuar execucao');
  });
});
