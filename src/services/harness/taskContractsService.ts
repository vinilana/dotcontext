/**
 * Harness Task Contracts Service
 *
 * Persists structured task and handoff contracts and evaluates whether a task
 * can be completed based on required sensors and artifacts.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { minimatch } from 'minimatch';
import { glob as globFn } from 'glob';
import type {
  HarnessArtifactRecord,
  HarnessRuntimeStatePort,
  HarnessTraceRecord,
} from './runtimeStateService';
import type { HarnessSensorRun } from './sensorsService';

/**
 * Structured artifact requirement.
 *
 * - `name`/`path`: exact match against `artifact.path || artifact.name`.
 * - `glob`: minimatch glob over `artifact.path || artifact.name`; needs at
 *   least `minMatches` matching artifacts (default 1).
 * - `file-count`: shorthand for `glob` with `minMatches = min`.
 *
 * For `glob` and `file-count`, setting `fromFilesystem: true` also scans the
 * project working tree (relative to `repoPath`) and unions filesystem hits
 * with recorded artifacts. This closes the case where a file exists in the
 * repo but no one called `recordArtifact`.
 */
export type RequiredArtifactSpec =
  | { kind: 'name'; name: string }
  | { kind: 'path'; path: string }
  | { kind: 'glob'; glob: string; minMatches?: number; fromFilesystem?: boolean }
  | { kind: 'file-count'; glob: string; min: number; fromFilesystem?: boolean };

export type RequiredArtifactInput = string | RequiredArtifactSpec;

function normalizeArtifactSpec(input: RequiredArtifactInput): RequiredArtifactSpec {
  if (typeof input === 'string') {
    return { kind: 'name', name: input };
  }
  return input;
}

function describeArtifactSpec(spec: RequiredArtifactSpec, gotCount?: number): string {
  switch (spec.kind) {
    case 'name':
      return spec.name;
    case 'path':
      return `path(${spec.path})`;
    case 'glob': {
      const min = spec.minMatches ?? 1;
      const got = gotCount ?? 0;
      return min > 1 || gotCount !== undefined
        ? `glob(${spec.glob}) min=${min} (got ${got})`
        : `glob(${spec.glob})`;
    }
    case 'file-count': {
      const got = gotCount ?? 0;
      return `file-count(${spec.glob}) min=${spec.min} (got ${got})`;
    }
  }
}

function matchesArtifactSpec(
  spec: RequiredArtifactSpec,
  artifacts: HarnessArtifactRecord[],
  filesystemPaths: string[] = []
): { matched: HarnessArtifactRecord[]; matchedPaths: string[]; satisfied: boolean } {
  switch (spec.kind) {
    case 'name': {
      const matched = artifacts.filter(
        (a) => (a.path || a.name) === spec.name || a.name === spec.name
      );
      return { matched, matchedPaths: [], satisfied: matched.length > 0 };
    }
    case 'path': {
      const matched = artifacts.filter((a) => (a.path || a.name) === spec.path);
      return { matched, matchedPaths: [], satisfied: matched.length > 0 };
    }
    case 'glob': {
      const min = spec.minMatches ?? 1;
      const matched = artifacts.filter((a) =>
        minimatch(a.path || a.name, spec.glob, { dot: true })
      );
      const recordedPaths = new Set(matched.map((a) => a.path || a.name));
      const fsExtras = filesystemPaths.filter((p) => !recordedPaths.has(p));
      return { matched, matchedPaths: fsExtras, satisfied: matched.length + fsExtras.length >= min };
    }
    case 'file-count': {
      const matched = artifacts.filter((a) =>
        minimatch(a.path || a.name, spec.glob, { dot: true })
      );
      const recordedPaths = new Set(matched.map((a) => a.path || a.name));
      const fsExtras = filesystemPaths.filter((p) => !recordedPaths.has(p));
      return { matched, matchedPaths: fsExtras, satisfied: matched.length + fsExtras.length >= spec.min };
    }
  }
}

const FILESYSTEM_SCAN_TIMEOUT_MS = 5_000;
const FILESYSTEM_SCAN_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

/**
 * Scan the working tree under `repoPath` for files matching `pattern`.
 * Returns repo-relative POSIX paths. Refuses to escape `repoPath`. On any
 * I/O failure or timeout, yields a sentinel error string in `errors` instead
 * of throwing — `evaluateTaskCompletion` surfaces it as a blockingFinding.
 */
async function scanFilesystem(
  repoPath: string,
  pattern: string
): Promise<{ paths: string[]; errors: string[] }> {
  const root = path.resolve(repoPath);
  try {
    const result = await Promise.race([
      globFn(pattern, {
        cwd: root,
        nodir: true,
        dot: true,
        ignore: FILESYSTEM_SCAN_IGNORE,
        absolute: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`filesystem scan timeout after ${FILESYSTEM_SCAN_TIMEOUT_MS}ms`)), FILESYSTEM_SCAN_TIMEOUT_MS)
      ),
    ]);

    const safe: string[] = [];
    for (const rel of result) {
      const normalized = rel.split(path.sep).join('/');
      const abs = path.resolve(root, rel);
      if (abs === root || !abs.startsWith(root + path.sep)) {
        continue;
      }
      safe.push(normalized);
    }
    return { paths: safe, errors: [] };
  } catch (err: any) {
    return { paths: [], errors: [`filesystem scan failed for ${pattern}: ${err?.message ?? String(err)}`] };
  }
}

export type HarnessTaskContractStatus =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed';

export interface HarnessTaskContract {
  id: string;
  title: string;
  description?: string;
  sessionId?: string;
  owner?: string;
  status: HarnessTaskContractStatus;
  inputs: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  requiredSensors: string[];
  /**
   * Required artifacts for task completion. Strings are interpreted as
   * `{ kind: 'name', name }` for backwards compatibility; structured specs
   * support glob and file-count matching. See `RequiredArtifactSpec`.
   */
  requiredArtifacts: RequiredArtifactInput[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessHandoffContract {
  id: string;
  from: string;
  to: string;
  sessionId?: string;
  taskId?: string;
  artifacts: string[];
  evidence: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessTaskCompletionResult {
  taskId: string;
  sessionId?: string;
  canComplete: boolean;
  missingSensors: string[];
  missingArtifacts: string[];
  blockingFindings: string[];
  matchedSensorRuns: HarnessSensorRun[];
  matchedArtifacts: HarnessArtifactRecord[];
}

export interface HarnessTaskContractsServiceOptions {
  repoPath: string;
  stateService: HarnessRuntimeStatePort;
}

export class HarnessTaskContractsService {
  constructor(private readonly options: HarnessTaskContractsServiceOptions) {}

  private get contractsPath(): string {
    return path.join(path.resolve(this.options.repoPath), '.context', 'harness', 'contracts');
  }

  private get tasksPath(): string {
    return path.join(this.contractsPath, 'tasks');
  }

  private get handoffsPath(): string {
    return path.join(this.contractsPath, 'handoffs');
  }

  private async ensureLayout(): Promise<void> {
    await Promise.all([
      fs.ensureDir(this.tasksPath),
      fs.ensureDir(this.handoffsPath),
    ]);
  }

  private async taskFile(taskId: string): Promise<string> {
    await this.ensureLayout();
    return path.join(this.tasksPath, `${taskId}.json`);
  }

  private async handoffFile(handoffId: string): Promise<string> {
    await this.ensureLayout();
    return path.join(this.handoffsPath, `${handoffId}.json`);
  }

  async createTaskContract(input: {
    title: string;
    description?: string;
    sessionId?: string;
    owner?: string;
    inputs?: string[];
    expectedOutputs?: string[];
    acceptanceCriteria?: string[];
    requiredSensors?: string[];
    requiredArtifacts?: RequiredArtifactInput[];
    status?: HarnessTaskContractStatus;
    metadata?: Record<string, unknown>;
  }): Promise<HarnessTaskContract> {
    const now = new Date().toISOString();
    const contract: HarnessTaskContract = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      sessionId: input.sessionId,
      owner: input.owner,
      status: input.status ?? 'draft',
      inputs: input.inputs ?? [],
      expectedOutputs: input.expectedOutputs ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      requiredSensors: input.requiredSensors ?? [],
      requiredArtifacts: input.requiredArtifacts ?? [],
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    const filePath = await this.taskFile(contract.id);
    await fs.writeJson(filePath, contract, { spaces: 2 });
    if (contract.sessionId) {
      await this.options.stateService.appendTrace(contract.sessionId, {
        level: 'info',
        event: 'task.contract.created',
        message: `Task contract created: ${contract.title}`,
        data: { contract },
      });
    }

    return contract;
  }

  async listTaskContracts(): Promise<HarnessTaskContract[]> {
    await this.ensureLayout();
    const files = await fs.readdir(this.tasksPath);
    const contracts = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => fs.readJson(path.join(this.tasksPath, file)) as Promise<HarnessTaskContract>)
    );

    return contracts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTaskContract(taskId: string): Promise<HarnessTaskContract | null> {
    const filePath = await this.taskFile(taskId);
    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    return fs.readJson(filePath) as Promise<HarnessTaskContract>;
  }

  async updateTaskContract(
    taskId: string,
    patch: Partial<Omit<HarnessTaskContract, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<HarnessTaskContract> {
    const contract = await this.getTaskContract(taskId);
    if (!contract) {
      throw new Error(`Task contract not found: ${taskId}`);
    }

    const updated: HarnessTaskContract = {
      ...contract,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeJson(await this.taskFile(taskId), updated, { spaces: 2 });
    return updated;
  }

  async createHandoffContract(input: {
    from: string;
    to: string;
    sessionId?: string;
    taskId?: string;
    artifacts?: string[];
    evidence?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<HarnessHandoffContract> {
    const contract: HarnessHandoffContract = {
      id: randomUUID(),
      from: input.from,
      to: input.to,
      sessionId: input.sessionId,
      taskId: input.taskId,
      artifacts: input.artifacts ?? [],
      evidence: input.evidence ?? [],
      createdAt: new Date().toISOString(),
      metadata: input.metadata,
    };

    const filePath = await this.handoffFile(contract.id);
    await fs.writeJson(filePath, contract, { spaces: 2 });
    if (contract.sessionId) {
      await this.options.stateService.appendTrace(contract.sessionId, {
        level: 'info',
        event: 'handoff.contract.created',
        message: `${contract.from} -> ${contract.to}`,
        data: { contract },
      });
    }

    return contract;
  }

  async listHandoffContracts(): Promise<HarnessHandoffContract[]> {
    await this.ensureLayout();
    const files = await fs.readdir(this.handoffsPath);
    const contracts = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => fs.readJson(path.join(this.handoffsPath, file)) as Promise<HarnessHandoffContract>)
    );

    return contracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async evaluateTaskCompletion(taskId: string, sessionId?: string): Promise<HarnessTaskCompletionResult> {
    const contract = await this.getTaskContract(taskId);
    if (!contract) {
      throw new Error(`Task contract not found: ${taskId}`);
    }

    const traces: HarnessTraceRecord[] = sessionId ? await this.options.stateService.listTraces(sessionId) : [];
    const sensorRuns = traces
      .filter((trace) => trace.event === 'sensor.run' && trace.data?.run)
      .map((trace) => trace.data!.run as HarnessSensorRun);
    const latestRunsBySensor = new Map<string, HarnessSensorRun>();
    for (const run of sensorRuns) {
      const current = latestRunsBySensor.get(run.sensorId);
      if (!current || current.createdAt < run.createdAt) {
        latestRunsBySensor.set(run.sensorId, run);
      }
    }
    const artifacts = sessionId ? await this.options.stateService.listArtifacts(sessionId) : [];

    const matchedSensorRuns = contract.requiredSensors
      .map((sensorId) => latestRunsBySensor.get(sensorId))
      .filter((run): run is HarnessSensorRun => Boolean(run))
      .filter((run) => run.status === 'passed');
    const missingSensors = contract.requiredSensors.filter(
      (sensorId) => !matchedSensorRuns.some((run) => run.sensorId === sensorId)
    );

    const specs = contract.requiredArtifacts.map(normalizeArtifactSpec);
    const matchedArtifactSet = new Set<HarnessArtifactRecord>();
    const missingArtifacts: string[] = [];
    const scanErrors: string[] = [];
    for (const spec of specs) {
      let filesystemPaths: string[] = [];
      const wantsFs =
        (spec.kind === 'glob' || spec.kind === 'file-count') && spec.fromFilesystem === true;
      if (wantsFs) {
        const pattern = spec.kind === 'glob' ? spec.glob : spec.glob;
        const scan = await scanFilesystem(this.options.repoPath, pattern);
        filesystemPaths = scan.paths;
        scanErrors.push(...scan.errors);
      }

      const { matched, matchedPaths, satisfied } = matchesArtifactSpec(spec, artifacts, filesystemPaths);
      for (const a of matched) {
        matchedArtifactSet.add(a);
      }
      if (!satisfied) {
        missingArtifacts.push(describeArtifactSpec(spec, matched.length + matchedPaths.length));
      }
    }
    const matchedArtifacts = Array.from(matchedArtifactSet);

    const blockingFindings: string[] = [];
    if (missingSensors.length > 0) {
      blockingFindings.push(`Missing required sensors: ${missingSensors.join(', ')}`);
    }
    if (missingArtifacts.length > 0) {
      blockingFindings.push(`Missing required artifacts: ${missingArtifacts.join(', ')}`);
    }
    if (scanErrors.length > 0) {
      blockingFindings.push(...scanErrors);
    }

    return {
      taskId,
      sessionId,
      canComplete: blockingFindings.length === 0,
      missingSensors,
      missingArtifacts,
      blockingFindings,
      matchedSensorRuns,
      matchedArtifacts,
    };
  }
}
