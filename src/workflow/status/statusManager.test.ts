import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { ProjectScale } from '../types';
import { getDefaultSettings } from '../gates';
import { PrevcStatusManager } from './statusManager';
import { HarnessWorkflowStateService } from '../../services/harness/workflowStateService';

describe('PrevcStatusManager canonical persistence', () => {
  let tempDir: string;
  let contextPath: string;
  let manager: PrevcStatusManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prevc-status-'));
    contextPath = path.join(tempDir, '.context');
    manager = new PrevcStatusManager(contextPath, new HarnessWorkflowStateService({ contextPath }));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('stores canonical PREVC state under .context/harness/workflows without creating status.yaml', async () => {
    const created = await manager.create({
      name: 'canonical-alpha',
      scale: ProjectScale.SMALL,
    });

    const canonicalPath = path.join(contextPath, 'harness', 'workflows', 'prevc.json');
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

  it('migrates legacy status.yaml into canonical harness workflow state on load', async () => {
    const projectionPath = path.join(contextPath, 'workflow', 'status.yaml');
    await fs.ensureDir(path.dirname(projectionPath));
    await fs.writeFile(projectionPath, [
      'project:',
      '  name: "legacy-alpha"',
      '  scale: SMALL',
      '  started: "2026-04-11T00:00:00.000Z"',
      '  current_phase: P',
      '',
      'phases:',
      '  P:',
      '    status: in_progress',
      '    started_at: "2026-04-11T00:00:00.000Z"',
      '  R:',
      '    status: pending',
      '  E:',
      '    status: pending',
      '  V:',
      '    status: pending',
      '  C:',
      '    status: pending',
      '',
    ].join('\n'), 'utf-8');

    const loaded = await manager.load();
    const canonicalPath = path.join(contextPath, 'harness', 'workflows', 'prevc.json');

    expect(loaded.project.name).toBe('legacy-alpha');
    expect(await fs.pathExists(canonicalPath)).toBe(true);
    expect(await fs.pathExists(projectionPath)).toBe(false);

    const canonical = await fs.readJson(canonicalPath);
    expect(canonical.status.project.name).toBe('legacy-alpha');
    expect(canonical.status.project.current_phase).toBe('P');
  });
});
