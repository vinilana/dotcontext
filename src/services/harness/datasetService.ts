import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { HarnessRuntimeStateService, type HarnessRuntimeStatePort } from './runtimeStateService';
import { HarnessReplayService, type HarnessReplayRecord } from './replayService';
import { HarnessSensorsService } from './sensorsService';
import { HarnessTaskContractsService } from './taskContractsService';

export type HarnessFailureKind = 'sensor' | 'task' | 'session' | 'trace';

export interface HarnessFailureRecord {
  id: string;
  kind: HarnessFailureKind;
  sessionId: string;
  replayId: string;
  signature: string;
  message: string;
  severity: 'warning' | 'critical';
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessFailureCluster {
  signature: string;
  count: number;
  sessionIds: string[];
  exampleMessages: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface HarnessFailureDataset {
  id: string;
  createdAt: string;
  repoPath: string;
  sessionCount: number;
  replayCount: number;
  failureCount: number;
  clusterCount: number;
  failures: HarnessFailureRecord[];
  clusters: HarnessFailureCluster[];
}

export interface HarnessDatasetServiceOptions {
  repoPath: string;
  dependencies?: Partial<HarnessDatasetDependencies>;
}

export interface BuildHarnessDatasetOptions {
  sessionIds?: string[];
  includeSuccessfulSessions?: boolean;
}

export interface HarnessDatasetDependencies {
  stateService: HarnessRuntimeStatePort;
  replayService: Pick<HarnessReplayService, 'buildReplay'>;
  taskContractsService: Pick<HarnessTaskContractsService, 'evaluateTaskCompletion'>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSignature(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, ':uuid')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSensorFailures(replay: HarnessReplayRecord): HarnessFailureRecord[] {
  return replay.sensorRuns
    .filter(run => run.status === 'failed' || run.status === 'blocked')
    .map(run => ({
      id: randomUUID(),
      kind: 'sensor' as const,
      sessionId: replay.sessionId,
      replayId: replay.id,
      signature: normalizeSignature(`sensor:${run.sensorId}:${run.summary}`),
      message: run.summary,
      severity: run.blocking ? 'critical' : 'warning',
      createdAt: run.createdAt,
      metadata: {
        sensorId: run.sensorId,
        status: run.status,
        blocking: run.blocking,
      },
    }));
}

async function buildTaskFailures(
  replay: HarnessReplayRecord,
  taskContractsService: Pick<HarnessTaskContractsService, 'evaluateTaskCompletion'>
): Promise<HarnessFailureRecord[]> {
  const taskFailures: HarnessFailureRecord[] = [];

  for (const task of replay.tasks.filter(item => item.sessionId === replay.sessionId)) {
    const result = await taskContractsService.evaluateTaskCompletion(task.id, replay.sessionId);
    if (result.canComplete) {
      continue;
    }

    taskFailures.push({
      id: randomUUID(),
      kind: 'task',
      sessionId: replay.sessionId,
      replayId: replay.id,
      signature: normalizeSignature(`task:${result.missingSensors.join(',')}:${result.missingArtifacts.join(',')}`),
      message: result.blockingFindings.join('; ') || `Task contract blocked: ${task.title}`,
      severity: 'critical',
      createdAt: task.updatedAt,
      metadata: {
        taskId: task.id,
        missingSensors: result.missingSensors,
        missingArtifacts: result.missingArtifacts,
        blockingFindings: result.blockingFindings,
      },
    });
  }

  return taskFailures;
}

function buildSessionFailure(replay: HarnessReplayRecord): HarnessFailureRecord[] {
  if (replay.session.status !== 'failed') {
    return [];
  }

  const lastErrorTrace = [...replay.traces].reverse().find(trace => trace.level === 'error' || trace.event.includes('failed'));
  const message = lastErrorTrace?.message || `Session failed: ${replay.session.name}`;

  return [{
    id: randomUUID(),
    kind: 'session',
    sessionId: replay.sessionId,
    replayId: replay.id,
    signature: normalizeSignature(`session:${message}`),
    message,
    severity: 'critical',
    createdAt: replay.session.failedAt || replay.session.updatedAt,
    metadata: {
      status: replay.session.status,
      lastErrorTrace: lastErrorTrace?.event ?? null,
    },
  }];
}

function buildTraceFailures(replay: HarnessReplayRecord): HarnessFailureRecord[] {
  return replay.traces
    .filter(trace => trace.event !== 'sensor.run')
    .filter(trace => trace.level === 'error' || /failed|blocked/i.test(trace.event) || /failed|blocked/i.test(trace.message))
    .map(trace => ({
      id: randomUUID(),
      kind: 'trace' as const,
      sessionId: replay.sessionId,
      replayId: replay.id,
      signature: normalizeSignature(`trace:${trace.event}:${trace.message}`),
      message: trace.message,
      severity: 'warning' as const,
      createdAt: trace.createdAt,
      metadata: {
        event: trace.event,
        level: trace.level,
      },
    }));
}

function clusterFailures(failures: HarnessFailureRecord[]): HarnessFailureCluster[] {
  const clusterMap = new Map<string, HarnessFailureCluster>();

  for (const failure of failures) {
    const existing = clusterMap.get(failure.signature);
    if (!existing) {
      clusterMap.set(failure.signature, {
        signature: failure.signature,
        count: 1,
        sessionIds: [failure.sessionId],
        exampleMessages: [failure.message],
        firstSeenAt: failure.createdAt,
        lastSeenAt: failure.createdAt,
      });
      continue;
    }

    existing.count += 1;
    if (!existing.sessionIds.includes(failure.sessionId)) {
      existing.sessionIds.push(failure.sessionId);
    }
    if (existing.exampleMessages.length < 3) {
      existing.exampleMessages.push(failure.message);
    }
    if (failure.createdAt < existing.firstSeenAt) {
      existing.firstSeenAt = failure.createdAt;
    }
    if (failure.createdAt > existing.lastSeenAt) {
      existing.lastSeenAt = failure.createdAt;
    }
  }

  return [...clusterMap.values()].sort((left, right) => right.count - left.count || left.signature.localeCompare(right.signature));
}

export class HarnessDatasetService {
  private readonly stateService: HarnessDatasetDependencies['stateService'];
  private readonly replayService: HarnessDatasetDependencies['replayService'];
  private readonly taskContractsService: HarnessDatasetDependencies['taskContractsService'];

  constructor(private readonly options: HarnessDatasetServiceOptions) {
    const stateService = options.dependencies?.stateService
      ?? new HarnessRuntimeStateService({ repoPath: options.repoPath });
    const replayService = options.dependencies?.replayService
      ?? new HarnessReplayService({
        repoPath: options.repoPath,
        dependencies: {
          stateService,
          sensorsService: new HarnessSensorsService({ stateService }),
          contractsService: new HarnessTaskContractsService({
            repoPath: options.repoPath,
            stateService,
          }),
        },
      });
    const taskContractsService = options.dependencies?.taskContractsService
      ?? new HarnessTaskContractsService({
        repoPath: options.repoPath,
        stateService,
      });

    this.stateService = stateService;
    this.replayService = replayService;
    this.taskContractsService = taskContractsService;
  }

  private get repoPath(): string {
    return path.resolve(this.options.repoPath);
  }

  private get datasetsPath(): string {
    return path.join(this.repoPath, '.context', 'harness', 'datasets');
  }

  private datasetFile(datasetId: string): string {
    return path.join(this.datasetsPath, `${datasetId}.json`);
  }

  private async ensureLayout(): Promise<void> {
    await fs.ensureDir(this.datasetsPath);
  }

  async buildFailureDataset(options: BuildHarnessDatasetOptions = {}): Promise<HarnessFailureDataset> {
    const sessions = options.sessionIds?.length
      ? await Promise.all(options.sessionIds.map(sessionId => this.stateService.getSession(sessionId)))
      : await this.stateService.listSessions();

    const selectedSessions = options.includeSuccessfulSessions
      ? sessions
      : sessions.filter(session => session.status !== 'completed');

    const replays = await Promise.all(selectedSessions.map(session => this.replayService.buildReplay(session.id, { includePayloads: false })));
    const sensorFailures = replays.flatMap(replay => buildSensorFailures(replay));
    const taskFailures: HarnessFailureRecord[] = [];
    for (const replay of replays) {
      taskFailures.push(...await buildTaskFailures(replay, this.taskContractsService));
    }
    const sessionFailures = replays.flatMap(replay => buildSessionFailure(replay));
    const traceFailures = replays.flatMap(replay => buildTraceFailures(replay));

    const failures = [...sensorFailures, ...taskFailures, ...sessionFailures, ...traceFailures];
    const clusters = clusterFailures(failures);
    const dataset: HarnessFailureDataset = {
      id: randomUUID(),
      createdAt: nowIso(),
      repoPath: this.repoPath,
      sessionCount: selectedSessions.length,
      replayCount: replays.length,
      failureCount: failures.length,
      clusterCount: clusters.length,
      failures,
      clusters,
    };

    await this.ensureLayout();
    await fs.writeJson(this.datasetFile(dataset.id), dataset, { spaces: 2 });
    return dataset;
  }

  async listDatasets(): Promise<HarnessFailureDataset[]> {
    await this.ensureLayout();
    const entries = await fs.readdir(this.datasetsPath);
    const datasets = await Promise.all(
      entries
        .filter(entry => entry.endsWith('.json'))
        .map(async entry => fs.readJson(path.join(this.datasetsPath, entry)) as Promise<HarnessFailureDataset>)
    );

    return datasets.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getDataset(datasetId: string): Promise<HarnessFailureDataset> {
    const filePath = this.datasetFile(datasetId);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    return fs.readJson(filePath) as Promise<HarnessFailureDataset>;
  }

  async getFailureClusters(datasetId: string): Promise<HarnessFailureCluster[]> {
    const dataset = await this.getDataset(datasetId);
    return dataset.clusters;
  }
}
