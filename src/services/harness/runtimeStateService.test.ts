import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  HarnessRuntimeStateService,
} from './runtimeStateService';

describe('HarnessRuntimeStateService', () => {
  let tempDir: string;
  let service: HarnessRuntimeStateService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-runtime-'));
    service = new HarnessRuntimeStateService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('persists sessions, traces, artifacts, checkpoints, and resume state', async () => {
    const session = await service.createSession({
      name: 'feature-run',
      metadata: { source: 'test' },
    });

    const trace = await service.appendTrace(session.id, {
      level: 'info',
      event: 'task.started',
      message: 'Task started',
      data: { step: 1 },
    });

    const artifact = await service.addArtifact(session.id, {
      name: 'design-note',
      kind: 'text',
      content: 'hello world',
      metadata: { author: 'agent' },
    });

    const checkpointed = await service.checkpointSession(session.id, {
      note: 'after first pass',
      artifactIds: [artifact.id],
      pause: true,
      data: { stage: 'review' },
    });

    const resumed = await service.resumeSession(session.id);
    const completed = await service.completeSession(session.id, 'done');

    const storedSession = await service.getSession(session.id);
    const traces = await service.listTraces(session.id);
    const artifacts = await service.listArtifacts(session.id);

    expect(session.status).toBe('active');
    expect(trace.event).toBe('task.started');
    expect(artifact.name).toBe('design-note');
    expect(checkpointed.checkpoints).toHaveLength(1);
    expect(resumed.status).toBe('active');
    expect(completed.status).toBe('completed');
    expect(storedSession.status).toBe('completed');
    expect(storedSession.checkpointCount).toBe(1);
    expect(traces.map((entry) => entry.event)).toEqual([
      'session.created',
      'task.started',
      'artifact.added',
      'session.paused',
      'session.resumed',
      'session.completed',
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].content).toBe('hello world');

    const sessionFile = path.join(tempDir, '.context', 'harness', 'sessions', `${session.id}.json`);
    const traceFile = path.join(tempDir, '.context', 'harness', 'traces', `${session.id}.jsonl`);
    const artifactFile = path.join(tempDir, '.context', 'harness', 'artifacts', session.id);

    expect(await fs.pathExists(sessionFile)).toBe(true);
    expect(await fs.pathExists(traceFile)).toBe(true);
    expect(await fs.pathExists(artifactFile)).toBe(true);
  });

  it('lists sessions sorted by recency', async () => {
    const first = await service.createSession({ name: 'first' });
    await service.completeSession(first.id);
    const second = await service.createSession({ name: 'second' });

    const sessions = await service.listSessions();
    expect(sessions.map((item) => item.name)).toEqual(['second', 'first']);
  });

  it('rejects resuming completed sessions', async () => {
    const session = await service.createSession({ name: 'finished' });
    await service.completeSession(session.id);

    await expect(service.resumeSession(session.id)).rejects.toThrow('Cannot resume a completed session');
  });
});
