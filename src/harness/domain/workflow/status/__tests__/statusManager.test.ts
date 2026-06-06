import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { ProjectScale } from '../../types';
import { getDefaultSettings } from '../../gates';
import { PrevcStatusManager } from '../statusManager';
import { HarnessWorkflowStateService } from '../../../../adapters/out/workflowState/workflowStateService';

describe('PrevcStatusManager canonical persistence', () => {
  let tempDir: string;
  let contextPath: string;
  let manager: PrevcStatusManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prevc-status-'));
    contextPath = path.join(tempDir, '.context');
    manager = new PrevcStatusManager(new HarnessWorkflowStateService({ contextPath }));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('stores canonical PREVC state under .context/runtime/workflows', async () => {
    const created = await manager.create({
      name: 'canonical-alpha',
      scale: ProjectScale.SMALL,
    });

    const canonicalPath = path.join(contextPath, 'runtime', 'workflows', 'prevc.json');
    const projectionPath = path.join(contextPath, 'workflow', 'status.yaml');

    expect(created.project.name).toBe('canonical-alpha');
    expect(created.project.settings).toEqual(getDefaultSettings(ProjectScale.SMALL));
    expect(created.roles).toMatchObject({
      planner: { status: 'pending' },
      developer: { status: 'pending' },
      qa: { status: 'pending' },
    });
    expect(created.execution?.history).toHaveLength(3);
    expect(await fs.pathExists(canonicalPath)).toBe(true);
    expect(await fs.pathExists(projectionPath)).toBe(false);

    const canonical = await fs.readJson(canonicalPath);
    expect(canonical.workflowType).toBe('prevc');
    expect(canonical.status.project.name).toBe('canonical-alpha');
  });
});
