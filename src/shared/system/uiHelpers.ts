/**
 * Shared UI Helpers
 *
 * Common UI interaction patterns used across services.
 * Reduces duplication of spinner and summary display logic.
 */

import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import type { OperationResult } from './types';
import { typography } from '../../utils/theme';

/**
 * Status types for spinner updates
 */
export type SpinnerStatus = 'success' | 'fail' | 'warn' | 'info';

/**
 * Execute an async operation with spinner feedback
 */
export async function withSpinner<T>(
  ui: CLIInterface,
  message: string,
  fn: () => Promise<T>,
  options?: {
    successMessage?: string;
    failMessage?: string;
    successStatus?: SpinnerStatus;
    failStatus?: SpinnerStatus;
  }
): Promise<{ result: T | null; success: boolean; error?: Error }> {
  const {
    successMessage,
    failMessage,
    successStatus = 'success',
    failStatus = 'fail',
  } = options || {};

  ui.startSpinner(message);

  try {
    const result = await fn();

    if (successMessage) {
      ui.updateSpinner(successMessage, successStatus);
    }

    ui.stopSpinner();
    return { result, success: true };
  } catch (error) {
    if (failMessage) {
      ui.updateSpinner(failMessage, failStatus);
    }

    ui.stopSpinner();
    return {
      result: null,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Display operation summary with consistent formatting
 */
export function displayOperationSummary(
  result: OperationResult,
  options?: {
    title?: string;
    dryRun?: boolean;
    showErrors?: boolean;
    labels?: {
      created?: string;
      skipped?: string;
      failed?: string;
    };
  }
): void {
  const {
    title = 'Summary',
    dryRun = false,
    showErrors = true,
    labels = {},
  } = options || {};

  const {
    created = dryRun ? 'Would create' : 'Created',
    skipped = 'Skipped',
    failed = 'Failed',
  } = labels;

  console.log('');
  console.log(typography.header(title));
  console.log(typography.labeledValue(created, String(result.filesCreated)));
  console.log(typography.labeledValue(skipped, String(result.filesSkipped)));
  console.log(typography.labeledValue(failed, String(result.filesFailed)));

  if (showErrors && result.errors.length > 0) {
    console.log('');
    console.log(typography.header('Errors'));
    for (const { file, error } of result.errors) {
      console.log(typography.labeledValue(file, error));
    }
  }
}

/**
 * Display a visual progress bar
 */
export function displayProgressBar(
  current: number,
  total: number,
  options?: {
    width?: number;
    label?: string;
    showPercentage?: boolean;
  }
): string {
  const { width = 40, label, showPercentage = true } = options || {};

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const filledWidth = Math.round((current / total) * width);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);
  const bar = `${filled}${empty}`;

  let output = bar;
  if (showPercentage) {
    output += ` ${percentage}%`;
  }
  if (label) {
    output += ` (${label})`;
  }

  return output;
}

/**
 * Display a visual phase indicator
 */
export function displayPhaseIndicator(
  phases: Array<{ id: string; status: 'completed' | 'in_progress' | 'pending' | 'skipped' }>,
  options?: {
    currentLabel?: string;
    symbols?: {
      completed?: string;
      inProgress?: string;
      pending?: string;
      skipped?: string;
    };
  }
): string {
  const { currentLabel, symbols = {} } = options || {};

  const {
    completed = '[x]',
    inProgress = '[>]',
    pending = '[ ]',
    skipped = '[-]',
  } = symbols;

  const symbolMap = {
    completed,
    in_progress: inProgress,
    pending,
    skipped,
  };

  const parts = phases.map((phase) => {
    const symbol = symbolMap[phase.status] || pending;
    return `${symbol} ${phase.id}`;
  });

  let output = parts.join(' → ');

  if (currentLabel) {
    output += `\n${' '.repeat(10)}^ ${currentLabel}`;
  }

  return output;
}

/**
 * Create a box with content
 */
export function createBox(
  content: string[],
  options?: {
    width?: number;
    title?: string;
    padding?: number;
  }
): string {
  const { width = 50, title, padding = 1 } = options || {};

  const innerWidth = width - 2;
  const padStr = ' '.repeat(padding);

  const lines: string[] = [];

  // Top border
  if (title) {
    const titlePadded = ` ${title} `;
    const remainingWidth = innerWidth - titlePadded.length;
    const leftWidth = Math.floor(remainingWidth / 2);
    const rightWidth = remainingWidth - leftWidth;
    lines.push(`╭${'─'.repeat(leftWidth)}${titlePadded}${'─'.repeat(rightWidth)}╮`);
  } else {
    lines.push(`╭${'─'.repeat(innerWidth)}╮`);
  }

  // Content
  for (const line of content) {
    const contentWidth = innerWidth - padding * 2;
    const paddedLine = line.slice(0, contentWidth).padEnd(contentWidth);
    lines.push(`│${padStr}${paddedLine}${padStr}│`);
  }

  // Bottom border
  lines.push(`╰${'─'.repeat(innerWidth)}╯`);

  return lines.join('\n');
}
