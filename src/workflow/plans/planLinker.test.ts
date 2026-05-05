import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { createPlanLinker } from './planLinker';

describe('PlanLinker tracking migration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-linker-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('preserves step shape when updatePhase touches legacy tracking', async () => {
    const linker = createPlanLinker(tempDir, undefined, false);
    const planSlug = 'legacy-plan';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);
    const trackingPath = path.join(
      tempDir,
      '.context',
      'workflow',
      'plan-tracking',
      `${planSlug}.json`,
    );

    await fs.ensureDir(path.dirname(planPath));
    await fs.writeFile(
      planPath,
      [
        '# Legacy Plan',
        '',
        '### Phase 1 - Validation',
        '',
        '1. Confirm syncMarkdown works',
        '',
      ].join('\n'),
      'utf-8',
    );

    await linker.linkPlan(planSlug);

    await fs.ensureDir(path.dirname(trackingPath));
    await fs.writeJson(
      trackingPath,
      {
        phases: {
          'phase-1': {
            status: 'completed',
            updatedAt: '2026-05-05T00:00:00.000Z',
          },
        },
        progress: 100,
      },
      { spaces: 2 },
    );

    await expect(
      linker.updatePlanPhase(planSlug, 'phase-1', 'completed'),
    ).resolves.toBe(true);
    await expect(linker.syncPlanMarkdown(planSlug)).resolves.toBe(true);

    const tracking = await fs.readJson(trackingPath);
    expect(tracking.phases['phase-1'].steps).toEqual([]);
    expect(tracking.lastUpdated).toEqual(expect.any(String));

    const syncedPlan = await fs.readFile(planPath, 'utf-8');
    expect(syncedPlan).toContain('## Execution History');
    expect(syncedPlan).not.toContain('Last updated: undefined');
  });
});
