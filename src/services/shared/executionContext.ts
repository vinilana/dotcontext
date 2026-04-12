/**
 * Shared execution helpers for non-interactive service contexts.
 *
 * These utilities are intentionally transport-agnostic and can be reused by
 * harness services, MCP adapters, or future runtime adapters.
 */

/**
 * Minimal UI interface for services that require UI dependencies.
 * Returns no-op functions for all UI operations in non-interactive contexts.
 */
export const minimalUI = {
  displayOutput: () => {},
  displaySuccess: () => {},
  displayError: () => {},
  displayInfo: () => {},
  displayWarning: () => {},
  displayWelcome: () => {},
  displayPrevcExplanation: () => {},
  displayStep: () => {},
  displayBox: () => {},
  startSpinner: () => {},
  stopSpinner: () => {},
  updateSpinner: () => {},
  prompt: async () => '',
  confirm: async () => true,
};

/**
 * Mock translation function for services that require i18n.
 */
export const mockTranslate = (key: string) => key;

/**
 * Neutral tool execution context for AI tools.
 */
export const toolExecutionContext = { toolCallId: '', messages: [] };
