import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessExecutionService } from './executionService';
import { HarnessReplayService } from './replayService';

describe('HarnessReplayService', () => {
  let tempDir: string;
  let execution: HarnessExecutionService;
  let service: HarnessReplayService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-replay-'));
    execution = new HarnessExecutionService({ repoPath: tempDir });
    service = new HarnessReplayService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('builds a replay without persisting it', async () => {
    const session = await execution.createSession({ name: 'transient-replay' });
    await execution.appendTrace(session.id, {
      level: 'info',
      event: 'custom.step',
      message: 'Step one',
    });

    const replay = await service.buildReplay(session.id);

    expect(replay.sessionId).toBe(session.id);
    expect(replay.eventCount).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'replays', `${replay.id}.json`))).toBe(false);
    expect(await service.listReplays({ sessionId: session.id })).toHaveLength(0);
  });

  it('replays a session into a durable ordered event log', async () => {
    const session = await execution.createSession({ name: 'replay-run' });
    await execution.appendTrace(session.id, {
      level: 'info',
      event: 'custom.step',
      message: 'Step one',
    });
    await execution.addArtifact(session.id, {
      name: 'evidence.txt',
      kind: 'file',
      path: 'evidence.txt',
    });
    await execution.checkpointSession(session.id, { note: 'checkpoint' });

    const replay = await service.replaySession(session.id);
    const list = await service.listReplays({ sessionId: session.id });

    expect(replay.eventCount).toBeGreaterThanOrEqual(4);
    expect(replay.events.map(event => event.source)).toContain('checkpoint');
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe(session.id);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'replays', `${replay.id}.json`))).toBe(true);
  });
});
