/**
 * CLI Shared Dependencies
 *
 * Centralizes dependencies shared across all CLI command modules.
 * This avoids passing individual parameters to each command registrar
 * and provides a single interface for command modules to depend on.
 */

import type { Command } from 'commander';
import type { CLIInterface } from '../utils/cliUI';
import type { TranslateFn } from '../utils/i18n';

/**
 * Dependencies shared across all CLI command registration functions.
 */
export interface CLIDependencies {
    /** Commander program instance */
    program: Command;
    /** CLI interface for user-facing output */
    ui: CLIInterface;
    /** Translation function for i18n */
    t: TranslateFn;
    /** Package version string */
    version: string;
    /** Default LLM model identifier */
    defaultModel: string;
}
