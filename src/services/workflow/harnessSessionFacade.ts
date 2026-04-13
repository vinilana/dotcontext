/**
 * HarnessSessionFacade
 *
 * Owns the harness runtime/sensor/task/policy/workflow-state services and
 * the session-lifecycle methods that previously lived on `WorkflowService`.
 *
 * The facade is deliberately stateful (holds service instances, registers
 * default sensors on construction) so `WorkflowService` can delegate
 * session operations without re-wiring dependencies at each call site.
 *
 * Services are intentionally exposed via readonly fields — callers like
 * `WorkflowService.advance` and `WorkflowService.handoff` need direct
 * access to `taskContractsService`/`runtimeStateService` to keep the
 * workflow-level composition small and avoid a proliferation of trivial
 * pass-through methods on the facade.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  HarnessRuntimeStateService,
  HarnessSensorCatalogService,
  HarnessSensorsService,
  HarnessTaskContractsService,
  HarnessPolicyService,
  HarnessWorkflowStateService,
  type HarnessArtifactKind,
  type HarnessSensorDefinition,
  type HarnessSensorRun,
  type HarnessSessionRecord,
  type HarnessTaskContract,
  type HarnessHandoffContract,
  type WorkflowHarnessBinding,
} from '../harness';

const exec = promisify(execCallback);

export interface WorkflowHarnessStatus {
  binding: WorkflowHarnessBinding;
  session: HarnessSessionRecord;
  availableSensors: Array<Pick<HarnessSensorDefinition, 'id' | 'name' | 'description'>>;
  sensorRuns: HarnessSensorRun[];
  taskContracts: HarnessTaskContract[];
  handoffs: HarnessHandoffContract[];
  policyRules: number;
  completionCheck: {
    blocked: boolean;
    reasons: string[];
    taskCompletion: {
      canComplete: boolean;
      missingSensors: string[];
      missingArtifacts: string[];
      blockingFindings: string[];
    } | null;
  };
}

export interface HarnessSessionFacadeOptions {
  repoPath: string;
  contextPath: string;
}

export class HarnessSessionFacade {
  readonly runtimeStateService: HarnessRuntimeStateService;
  readonly sensorCatalogService: HarnessSensorCatalogService;
  readonly sensorsService: HarnessSensorsService;
  readonly taskContractsService: HarnessTaskContractsService;
  readonly policyService: HarnessPolicyService;
  readonly workflowStateService: HarnessWorkflowStateService;
  private readonly repoPath: string;

  constructor(options: HarnessSessionFacadeOptions) {
    this.repoPath = options.repoPath;
    this.runtimeStateService = new HarnessRuntimeStateService({ repoPath: options.repoPath });
    this.sensorCatalogService = new HarnessSensorCatalogService({
      repoPath: options.repoPath,
      contextPath: options.contextPath,
    });
    this.sensorsService = new HarnessSensorsService({ stateService: this.runtimeStateService });
    this.taskContractsService = new HarnessTaskContractsService({
      repoPath: options.repoPath,
      stateService: this.runtimeStateService,
    });
    this.policyService = new HarnessPolicyService({ repoPath: options.repoPath });
    this.workflowStateService = new HarnessWorkflowStateService({ contextPath: options.contextPath });
    this.registerDefaultSensors();
  }

  listAvailableSensors(): Array<Pick<HarnessSensorDefinition, 'id' | 'name' | 'description'>> {
    return this.sensorsService.listSensors().map((sensor) => ({
      id: sensor.id,
      name: sensor.name,
      description: sensor.description,
    }));
  }

  async ensureHarnessSession(
    workflowName: string,
    description?: string
  ): Promise<WorkflowHarnessBinding> {
    const existing = await this.loadHarnessBinding();
    if (existing && existing.workflowName === workflowName) {
      try {
        await this.runtimeStateService.getSession(existing.sessionId);
        return existing;
      } catch {
        // Session was removed or became unreadable. Recreate below.
      }
    }

    const session = await this.runtimeStateService.createSession({
      name: workflowName,
      metadata: {
        workflow: true,
        description,
      },
    });

    const binding: WorkflowHarnessBinding = {
      workflowName,
      sessionId: session.id,
      createdAt: new Date().toISOString(),
      updatedAt: session.updatedAt,
    };

    await this.saveHarnessBinding(binding);
    return binding;
  }

  loadHarnessBinding(): Promise<WorkflowHarnessBinding | null> {
    return this.workflowStateService.getBinding();
  }

  saveHarnessBinding(binding: WorkflowHarnessBinding): Promise<void> {
    return this.workflowStateService.saveBinding(binding);
  }

  async getHarnessStatus(workflowName: string): Promise<WorkflowHarnessStatus> {
    const binding = await this.ensureHarnessSession(workflowName);

    const session = await this.runtimeStateService.getSession(binding.sessionId);
    const allSensorRuns = await this.sensorsService.getSessionSensorRuns(binding.sessionId);
    const policyRules = await this.policyService.listRules();
    const latestRuns = new Map<string, HarnessSensorRun>();
    for (const run of allSensorRuns) {
      const current = latestRuns.get(run.sensorId);
      if (!current || current.createdAt < run.createdAt) {
        latestRuns.set(run.sensorId, run);
      }
    }
    const sensorRuns = Array.from(latestRuns.values()).sort((a, b) =>
      a.sensorId.localeCompare(b.sensorId)
    );
    const taskContracts = (await this.taskContractsService.listTaskContracts()).filter(
      (contract) => contract.sessionId === binding.sessionId
    );
    const handoffs = (await this.taskContractsService.listHandoffContracts()).filter(
      (handoff) => handoff.sessionId === binding.sessionId
    );
    const activeTask = binding.activeTaskId
      ? taskContracts.find((contract) => contract.id === binding.activeTaskId) ?? null
      : null;
    const taskCompletion = activeTask
      ? await this.taskContractsService.evaluateTaskCompletion(activeTask.id, binding.sessionId)
      : null;
    const backpressure = this.sensorsService.evaluateBackpressure(sensorRuns, {
      requireEvidence: true,
    });
    const reasons = [
      ...backpressure.reasons,
      ...(taskCompletion?.blockingFindings || []),
    ];

    return {
      binding,
      session,
      availableSensors: this.listAvailableSensors(),
      sensorRuns,
      taskContracts,
      handoffs,
      policyRules: policyRules.length,
      completionCheck: {
        blocked: reasons.length > 0,
        reasons,
        taskCompletion: taskCompletion
          ? {
              canComplete: taskCompletion.canComplete,
              missingSensors: taskCompletion.missingSensors,
              missingArtifacts: taskCompletion.missingArtifacts,
              blockingFindings: taskCompletion.blockingFindings,
            }
          : null,
      },
    };
  }

  async checkpointHarnessSession(
    binding: WorkflowHarnessBinding,
    opts: { note?: string; data?: unknown; artifactIds?: string[]; pause?: boolean }
  ): Promise<{ binding: WorkflowHarnessBinding; session: HarnessSessionRecord }> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'checkpoint',
      risk: opts.pause ? 'high' : 'medium',
      metadata: {
        note: opts.note,
        pause: Boolean(opts.pause),
        artifactCount: opts.artifactIds?.length ?? 0,
      },
    });
    const session = await this.runtimeStateService.checkpointSession(binding.sessionId, opts);
    binding.updatedAt = session.updatedAt;
    await this.saveHarnessBinding(binding);
    return { binding, session };
  }

  async recordHarnessArtifact(
    binding: WorkflowHarnessBinding,
    input: {
      name: string;
      kind?: HarnessArtifactKind;
      content?: unknown;
      path?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'recordArtifact',
      paths: input.path ? [input.path] : [input.name],
      risk: input.path?.includes('secret') ? 'critical' : 'medium',
      metadata: input.metadata,
    });
    const artifact = await this.runtimeStateService.addArtifact(binding.sessionId, input);
    binding.updatedAt = artifact.createdAt;
    await this.saveHarnessBinding(binding);
    return artifact;
  }

  async defineHarnessTask(
    binding: WorkflowHarnessBinding,
    input: {
      title: string;
      description?: string;
      owner?: string;
      inputs?: string[];
      expectedOutputs?: string[];
      acceptanceCriteria?: string[];
      requiredSensors?: string[];
      requiredArtifacts?: import('../harness').RequiredArtifactInput[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<HarnessTaskContract> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'defineTask',
      risk: input.requiredSensors?.includes('deploy') ? 'high' : 'medium',
      metadata: {
        ...input.metadata,
        title: input.title,
      },
    });
    const contract = await this.taskContractsService.createTaskContract({
      ...input,
      sessionId: binding.sessionId,
      status: 'ready',
    });

    binding.activeTaskId = contract.id;
    binding.updatedAt = contract.updatedAt;
    await this.saveHarnessBinding(binding);
    return contract;
  }

  async runHarnessSensors(
    binding: WorkflowHarnessBinding,
    sensorIds: string[],
    metadata?: Record<string, unknown>
  ) {
    const runs: HarnessSensorRun[] = [];

    for (const sensorId of sensorIds) {
      await this.policyService.authorize({
        tool: 'workflow',
        action: 'runSensors',
        risk: sensorId === 'deploy' ? 'high' : 'medium',
        metadata,
      });
      runs.push(
        await this.sensorsService.runSensor(sensorId, {
          sessionId: binding.sessionId,
          contractId: binding.activeTaskId,
          metadata,
        })
      );
    }

    return {
      runs,
      backpressure: this.sensorsService.evaluateBackpressure(runs, { requireEvidence: true }),
    };
  }

  private registerDefaultSensors(): void {
    const definitions = this.sensorCatalogService.resolveEffectiveSensorsSync();

    for (const definition of definitions) {
      if (this.sensorsService.getSensor(definition.id)) {
        continue;
      }

      this.sensorsService.registerSensor({
        id: definition.id,
        name: definition.name,
        severity: definition.severity,
        blocking: definition.severity === 'critical',
        execute: async () => {
          if (definition.script) {
            const hasScript = await this.hasPackageScript(definition.script);
            if (!hasScript) {
              return {
                status: definition.severity === 'warning' ? 'skipped' : 'blocked',
                summary: `Script not available: ${definition.script}`,
                evidence: [`Missing package.json script: ${definition.script}`],
              };
            }
          }

          return this.executeShellSensor(definition.command, definition.name);
        },
      });
    }
  }

  private async hasPackageScript(scriptName: string): Promise<boolean> {
    const packageJsonPath = path.join(this.repoPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      return false;
    }

    const packageJson = (await fs.readJson(packageJsonPath)) as {
      scripts?: Record<string, string>;
    };
    return Boolean(packageJson.scripts?.[scriptName]);
  }

  private async executeShellSensor(command: string, name: string) {
    try {
      const { stdout, stderr } = await exec(command, {
        cwd: this.repoPath,
        timeout: 300000,
      });

      return {
        status: 'passed' as const,
        summary: `${name} passed`,
        evidence: [this.trimEvidence(stdout), this.trimEvidence(stderr)].filter(Boolean) as string[],
        output: {
          command,
        },
      };
    } catch (error: any) {
      return {
        status: 'failed' as const,
        summary: `${name} failed`,
        evidence: [
          this.trimEvidence(error?.stdout),
          this.trimEvidence(error?.stderr || error?.message),
        ].filter(Boolean) as string[],
        details: {
          command,
          exitCode: typeof error?.code === 'number' ? error.code : undefined,
        },
      };
    }
  }

  private trimEvidence(value?: string, maxLength: number = 2000): string | null {
    if (!value) {
      return null;
    }

    return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated]` : value;
  }
}
