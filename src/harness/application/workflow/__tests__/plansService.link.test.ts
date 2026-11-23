import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessPlansService } from '../plansService';
import { WorkflowService } from '../workflowService';

function scaffoldStylePlanFixture(requiredSensorsYaml: string): string {
  return [
    '---',
    'type: plan',
    'name: link-atomic',
    'description: Plan for link regression',
    `generated: ${JSON.stringify('2026-04-12')}`,
    'status: filled',
    'scaffoldVersion: "2.0.0"',
    'planSlug: "link-atomic"',
    'phases:',
    '  - id: "phase-1"',
    '    name: "Planning"',
    '    prevc: "P"',
    '  - id: "phase-2"',
    '    name: "Implementation"',
    '    prevc: "E"',
    requiredSensorsYaml,
    '    steps:',
    '      - order: 1',
    '        description: "Implement"',
    '---',
    '',
    '# Link Atomic',
    '',
  ].join('\n');
}

describe('HarnessPlansService.link', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plans-service-link-'));
    await fs.writeJson(
      path.join(tempDir, 'package.json'),
      { name: 'plans-service-link', version: '1.0.0' },
      { spaces: 2 }
    );
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('accepts required_sensors on E phases when scaffold frontmatter uses unquoted generated dates', async () => {
    const plansDir = path.join(tempDir, '.context', 'plans');
    await fs.ensureDir(plansDir);
    await fs.writeFile(
      path.join(plansDir, 'link-atomic.md'),
      [
        '---',
        'type: plan',
        'name: link-atomic',
        'description: Plan for link regression',
        'generated: 2026-04-12',
        'status: filled',
        'scaffoldVersion: "2.0.0"',
        'planSlug: link-atomic',
        'phases:',
        '  - id: phase-1',
        '    name: Planning',
        '    prevc: P',
        '  - id: phase-2',
        '    name: Implementation',
        '    prevc: E',
        '    required_sensors: [verify]',
        '    steps:',
        '      - order: 1',
        '        description: Implement',
        '---',
        '',
        '# Link Atomic',
        '',
      ].join('\n'),
      'utf-8'
    );

    await new WorkflowService(tempDir).init({ name: 'link-atomic', scale: 'MEDIUM' });
    const result = await new HarnessPlansService({ repoPath: tempDir }).link('link-atomic');

    expect(result.success).toBe(true);
  });

  it.each([
    ['inline array', '    required_sensors: [verify]'],
    ['block list', '    required_sensors:\n      - verify'],
    ['inline quoted array', '    required_sensors: ["verify"]'],
  ])('accepts required_sensors in %s form', async (_label, sensorsYaml) => {
    const plansDir = path.join(tempDir, '.context', 'plans');
    await fs.ensureDir(plansDir);
    await fs.writeFile(
      path.join(plansDir, 'link-atomic.md'),
      scaffoldStylePlanFixture(sensorsYaml),
      'utf-8'
    );

    await new WorkflowService(tempDir).init({ name: 'link-atomic', scale: 'MEDIUM' });
    const result = await new HarnessPlansService({ repoPath: tempDir }).link('link-atomic');
    expect(result.success).toBe(true);
  });

  it('does not register plan tracking when link validation fails', async () => {
    const plansDir = path.join(tempDir, '.context', 'plans');
    const workflowDir = path.join(tempDir, '.context', 'runtime', 'workflows');
    await fs.ensureDir(plansDir);
    await fs.writeFile(
      path.join(plansDir, 'missing-sensors.md'),
      [
        '---',
        'type: plan',
        'name: missing-sensors',
        'description: Plan for link regression',
        'generated: 2026-04-12',
        'status: filled',
        'scaffoldVersion: "2.0.0"',
        'planSlug: missing-sensors',
        'phases:',
        '  - id: phase-1',
        '    name: Planning',
        '    prevc: P',
        '  - id: phase-2',
        '    name: Implementation',
        '    prevc: E',
        '    steps:',
        '      - order: 1',
        '        description: Implement',
        '---',
        '',
        '# Missing Sensors',
        '',
      ].join('\n'),
      'utf-8'
    );

    await new WorkflowService(tempDir).init({ name: 'missing-sensors', scale: 'MEDIUM' });
    const plans = new HarnessPlansService({ repoPath: tempDir });

    await expect(plans.link('missing-sensors')).rejects.toThrow(/required_sensors/);

    const trackingPath = path.join(workflowDir, 'plan-tracking', 'missing-sensors.json');
    const plansIndexPath = path.join(workflowDir, 'plans.json');
    expect(await fs.pathExists(trackingPath)).toBe(false);
    if (await fs.pathExists(plansIndexPath)) {
      const index = await fs.readJson(plansIndexPath);
      const slugs = [...index.active, ...index.completed].map((entry: { slug: string }) => entry.slug);
      expect(slugs).not.toContain('missing-sensors');
    }
  });
});