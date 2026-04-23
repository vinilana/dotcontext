import {
  ExecutionAction,
  ExecutionHistory,
  ExecutionHistoryEntry,
  PrevcPhase,
  PrevcStatus,
} from '../types';
import { generateResumeContext } from './templates';

interface StepContext {
  planPhase?: string;
  stepIndex?: number;
  stepDescription?: string;
}

interface HistoryEntryOptions {
  phase?: PrevcPhase;
  action?: ExecutionAction;
  stepContext?: StepContext;
}

export function ensureExecutionHistory(
  status: PrevcStatus,
  now: string
): ExecutionHistory {
  if (!status.execution) {
    status.execution = {
      history: [],
      last_activity: now,
      resume_context: '',
    };
  }

  return status.execution;
}

export function appendExecutionHistoryEntry(
  status: PrevcStatus,
  entry: Omit<ExecutionHistoryEntry, 'timestamp'>,
  now: string = new Date().toISOString(),
  options: HistoryEntryOptions = {}
): ExecutionHistoryEntry {
  const execution = ensureExecutionHistory(status, now);
  const fullEntry: ExecutionHistoryEntry = {
    ...entry,
    timestamp: now,
  };

  execution.history.push(fullEntry);
  execution.last_activity = now;
  execution.resume_context = generateResumeContext(
    options.phase ?? entry.phase,
    options.action ?? entry.action,
    options.stepContext
  );

  return fullEntry;
}
