import { colors } from '../theme';
import type { TranslateFn } from '../i18n';
import type { ConfigSummary } from './types';

/**
 * Displays a compact configuration summary before execution
 */
export function displayConfigSummary(summary: ConfigSummary, _t: TranslateFn): void {
  // Line 1: operation | repo | provider (model)
  const parts: string[] = [];
  parts.push(summary.operation);
  if (summary.repoPath) parts.push(`${_t('configSummary.repo')}: ${summary.repoPath}`);
  if (summary.provider) {
    const providerInfo = summary.model
      ? `${summary.provider} (${summary.model})`
      : summary.provider;
    parts.push(`${_t('configSummary.provider')}: ${providerInfo}`);
  }
  console.log(`  ${colors.secondary(_t('configSummary.config'))} ${parts.join(' | ')}`);

  // Line 2: options (if any)
  if (summary.options && Object.keys(summary.options).length > 0) {
    const optParts: string[] = [];
    for (const [key, value] of Object.entries(summary.options)) {
      const displayValue =
        typeof value === 'boolean'
          ? value ? _t('configSummary.yes') : _t('configSummary.no')
          : Array.isArray(value)
            ? value.join(', ')
            : String(value);
      optParts.push(`${key}=${displayValue}`);
    }
    console.log(`  ${colors.secondary(_t('configSummary.options'))} ${optParts.join(', ')}`);
  }
}
