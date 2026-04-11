/**
 * Harness Task Contracts Service
 *
 * Persists structured task and handoff contracts and evaluates whether a task
 * can be completed based on required sensors and artifacts.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  HarnessArtifactRecord,
  HarnessRuntimeStateService,
  HarnessTraceRecord,
} from './runtimeStateService';
import type { HarnessSensorRun } from './sensorsService';

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
  requiredArtifacts: string[];
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
  stateService: HarnessRuntimeStateService;
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
    requiredArtifacts?: string[];
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
    await this.options.stateService.appendTrace(contract.sessionId ?? '__global__', {
      level: 'info',
      event: 'task.contract.created',
      message: `Task contract created: ${contract.title}`,
      data: { contract },
    });

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
    await this.options.stateService.appendTrace(contract.sessionId ?? '__global__', {
      level: 'info',
      event: 'handoff.contract.created',
      message: `${contract.from} -> ${contract.to}`,
      data: { contract },
    });

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
    const artifacts = sessionId ? await this.options.stateService.listArtifacts(sessionId) : [];

    const matchedSensorRuns = contract.requiredSensors
      .map((sensorId) => sensorRuns.find((run) => run.sensorId === sensorId))
      .filter((run): run is HarnessSensorRun => Boolean(run))
      .filter((run) => run.status === 'passed');
    const missingSensors = contract.requiredSensors.filter(
      (sensorId) => !matchedSensorRuns.some((run) => run.sensorId === sensorId)
    );

    const artifactPaths = new Set([
      ...artifacts.map((artifact) => artifact.path || artifact.name),
    ]);
    const missingArtifacts = contract.requiredArtifacts.filter((artifactPath) => !artifactPaths.has(artifactPath));
    const matchedArtifacts = artifacts.filter(
      (artifact) => contract.requiredArtifacts.includes(artifact.path || artifact.name)
    );

    const blockingFindings: string[] = [];
    if (missingSensors.length > 0) {
      blockingFindings.push(`Missing required sensors: ${missingSensors.join(', ')}`);
    }
    if (missingArtifacts.length > 0) {
      blockingFindings.push(`Missing required artifacts: ${missingArtifacts.join(', ')}`);
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
