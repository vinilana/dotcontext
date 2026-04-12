import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { CollaborationManager } from './collaboration';
import { FileCollaborationStore } from '../services/workflow/fileCollaborationStore';

describe('CollaborationManager persistence', () => {
  let tempDir: string;
  let contextPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-collab-'));
    contextPath = path.join(tempDir, '.context');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('reloads active sessions from the file store across manager instances', async () => {
    const firstManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const session = await firstManager.startSession('architecture review');

    firstManager.contribute(
      session.getId(),
      'architect',
      'We decided to use ports and adapters for workflow persistence.'
    );

    const reloadedManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const restoredSession = reloadedManager.getSession(session.getId());

    expect(restoredSession).toBeDefined();
    expect(restoredSession?.getStatus()).toMatchObject({
      id: session.getId(),
      topic: 'architecture review',
      status: 'active',
      participants: ['architect', 'developer', 'designer'],
    });
    expect(restoredSession?.getContributions()).toHaveLength(1);
    expect(restoredSession?.getContributions()[0]).toMatchObject({
      role: 'architect',
      message: 'We decided to use ports and adapters for workflow persistence.',
    });
  });

  it('persists concluded state so later service instances can resume the synthesis outcome', async () => {
    const firstManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const session = await firstManager.startSession('testing strategy', ['qa', 'reviewer']);
    firstManager.contribute(session.getId(), 'qa', 'We recommend adding contract tests first.');

    const synthesis = await firstManager.endSession(session.getId());
    expect(
      synthesis?.recommendations.some((recommendation) =>
        recommendation.includes('We recommend adding contract tests first.')
      )
    ).toBe(true);

    const reloadedManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    expect(reloadedManager.getSession(session.getId())?.getStatus().status).toBe('concluded');
  });
});
