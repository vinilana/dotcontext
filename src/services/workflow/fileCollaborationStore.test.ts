import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { CollaborationManager } from '../../workflow/collaboration';
import { FileCollaborationStore } from './fileCollaborationStore';

describe('FileCollaborationStore', () => {
  let tempDir: string;
  let contextPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-collaboration-store-'));
    contextPath = path.join(tempDir, '.context');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('keeps collaboration sessions durable across fresh manager instances', async () => {
    const firstManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const session = await firstManager.startSession('Architecture review', ['architect', 'developer']);

    firstManager.contribute(
      session.getId(),
      'architect',
      'I recommend extracting collaboration persistence into a file-backed store.'
    );

    const secondManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    secondManager.contribute(
      session.getId(),
      'developer',
      'We should keep the session durable across MCP calls.'
    );

    const synthesis = await secondManager.endSession(session.getId());
    const persisted = await fs.readJson(
      path.join(contextPath, 'workflow', 'collaboration-sessions.json')
    );

    expect(synthesis).not.toBeNull();
    expect(synthesis?.participants).toEqual(['architect', 'developer']);
    expect(synthesis?.contributions).toHaveLength(2);
    expect(synthesis?.contributions.map((contribution) => contribution.role)).toEqual([
      'architect',
      'developer',
    ]);
    expect(persisted.version).toBe(1);
    expect(persisted.sessions).toHaveLength(1);
    expect(persisted.sessions[0].id).toBe(session.getId());
    expect(persisted.sessions[0].status).toBe('concluded');
  });
});
