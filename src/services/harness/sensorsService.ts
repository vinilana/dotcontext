/**
 * Harness Sensors Service
 *
 * Registers and executes quality sensors, then persists the run as a trace
 * entry in the shared harness runtime state.
 */

import { randomUUID } from 'crypto';
import type {
  AppendTraceInput,
  HarnessRuntimeStateService,
  HarnessTraceRecord,
} from './runtimeStateService';

export type HarnessSensorSeverity = 'info' | 'warning' | 'critical';
export type HarnessSensorStatus = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface HarnessSensorExecutionInput {
  sessionId: string;
  contractId?: string;
  context?: unknown;
  metadata?: Record<string, unknown>;
}

export interface HarnessSensorExecutionResult {
  status: HarnessSensorStatus;
  summary: string;
  evidence?: string[];
  output?: unknown;
  details?: Record<string, unknown>;
}

export interface HarnessSensorDefinition {
  id: string;
  name: string;
  description?: string;
  severity?: HarnessSensorSeverity;
  blocking?: boolean;
  execute: (input: HarnessSensorExecutionInput) => Promise<HarnessSensorExecutionResult> | HarnessSensorExecutionResult;
}

export interface HarnessSensorRun extends HarnessSensorExecutionResult {
  id: string;
  sensorId: string;
  sessionId: string;
  contractId?: string;
  severity: HarnessSensorSeverity;
  blocking: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessBackpressurePolicy {
  blockOnWarnings?: boolean;
  requireEvidence?: boolean;
}

export interface HarnessBackpressureResult {
  blocked: boolean;
  reasons: string[];
  blockingRuns: HarnessSensorRun[];
}

export interface HarnessSensorsServiceOptions {
  stateService: HarnessRuntimeStateService;
}

export class HarnessSensorsService {
  private readonly definitions = new Map<string, HarnessSensorDefinition>();

  constructor(private readonly options: HarnessSensorsServiceOptions) {}

  registerSensor(definition: HarnessSensorDefinition): HarnessSensorDefinition {
    this.definitions.set(definition.id, definition);
    return definition;
  }

  listSensors(): HarnessSensorDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getSensor(sensorId: string): HarnessSensorDefinition | undefined {
    return this.definitions.get(sensorId);
  }

  async runSensor(
    sensorId: string,
    input: HarnessSensorExecutionInput
  ): Promise<HarnessSensorRun> {
    const definition = this.getSensor(sensorId);
    if (!definition) {
      throw new Error(`Sensor not found: ${sensorId}`);
    }

    const createdAt = new Date().toISOString();
    const result = await definition.execute(input);
    const severity = definition.severity ?? 'critical';
    const run: HarnessSensorRun = {
      id: randomUUID(),
      sensorId,
      sessionId: input.sessionId,
      contractId: input.contractId,
      severity,
      blocking: definition.blocking ?? severity === 'critical',
      createdAt,
      status: result.status,
      summary: result.summary,
      evidence: result.evidence,
      output: result.output,
      details: result.details,
      metadata: input.metadata,
    };

    const traceInput: AppendTraceInput = {
      level: result.status === 'passed' ? 'info' : result.status === 'skipped' ? 'debug' : result.status === 'blocked' ? 'warn' : severity === 'critical' ? 'error' : 'warn',
      event: 'sensor.run',
      message: `${definition.name}: ${result.summary}`,
      data: { run },
    };

    await this.options.stateService.appendTrace(input.sessionId, traceInput);
    return run;
  }

  async getSessionSensorRuns(sessionId: string): Promise<HarnessSensorRun[]> {
    const traces = await this.options.stateService.listTraces(sessionId);
    return traces
      .filter((trace) => trace.event === 'sensor.run' && trace.data?.run)
      .map((trace) => trace.data!.run as HarnessSensorRun);
  }

  evaluateBackpressure(
    runs: HarnessSensorRun[],
    policy: HarnessBackpressurePolicy = {}
  ): HarnessBackpressureResult {
    const blockingRuns = runs.filter((run) => {
      if (run.status === 'blocked') {
        return true;
      }
      if (run.status === 'failed' && run.blocking) {
        return true;
      }
      if (policy.blockOnWarnings && run.severity === 'warning' && run.status !== 'passed') {
        return true;
      }
      if (policy.requireEvidence && run.status !== 'passed' && (!run.evidence || run.evidence.length === 0)) {
        return true;
      }
      return false;
    });

    return {
      blocked: blockingRuns.length > 0,
      reasons: blockingRuns.map((run) => `${run.sensorId}: ${run.summary}`),
      blockingRuns,
    };
  }
}

