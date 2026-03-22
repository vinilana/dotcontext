import chalk from 'chalk';

/**
 * Professional CLI theme with two-tone color palette
 * Inspired by Vercel CLI and Stripe CLI
 */

// Color palette - subtle two-tone system
export const colors = {
  // Primary: White/Bright for emphasis
  primary: chalk.white,
  primaryBold: chalk.bold.white,

  // Secondary: Gray/Dim for supporting text
  secondary: chalk.gray,
  secondaryDim: chalk.dim,

  // Accent: Used sparingly for key highlights
  accent: chalk.cyan,

  // Status colors
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
} as const;

// Unicode symbols replacing emojis
export const symbols = {
  // Status indicators
  success: '\u2713',      // ✓ checkmark
  error: '\u2717',        // ✗ X mark
  warning: '!',           // exclamation
  info: '\u2022',         // • bullet

  // Navigation/Structure
  pointer: '\u25B8',      // ▸ right-pointing triangle
  bullet: '\u2022',       // • bullet
  dash: '\u2500',         // ─ horizontal line
  pipe: '\u2502',         // │ vertical line
  corner: '\u2514',       // └ corner

  // Progress/Activity
  pending: '\u25CB',      // ○ empty circle
  active: '\u25CF',       // ● filled circle

  // Agent types
  documentation: '\u25A0', // ■ filled square
  playbook: '\u25A1',      // □ empty square
  plan: '\u25C6',          // ◆ diamond
  fill: '\u2726',          // ✦ four-pointed star
  skill: '\u2605',         // ★ star
  tool: '\u25B6',          // ▶ play triangle
} as const;

// Typography helper functions
export const typography = {
  // Headers
  header: (text: string): string => colors.primaryBold(text),
  subheader: (text: string): string => colors.secondary(text),

  // Labels and values (with consistent width support)
  label: (text: string): string => colors.secondary(`${text}:`),
  value: (text: string): string => colors.primary(text),

  // Labeled line with padding
  labeledValue: (label: string, value: string, labelWidth = 12): string => {
    const paddedLabel = label.padEnd(labelWidth);
    return `  ${colors.secondary(paddedLabel)} ${colors.primary(value)}`;
  },

  // Status messages
  success: (text: string): string =>
    `${colors.success(symbols.success)} ${colors.primary(text)}`,

  error: (text: string): string =>
    `${colors.error(symbols.error)} ${colors.primary(text)}`,

  warning: (text: string): string =>
    `${colors.warning(symbols.warning)} ${colors.primary(text)}`,

  info: (text: string): string =>
    `${colors.accent(symbols.info)} ${colors.primary(text)}`,

  // Separator line
  separator: (width = 50): string => colors.secondaryDim(symbols.dash.repeat(width)),

  // Tree structure
  treePipe: (): string => colors.secondary(`  ${symbols.pipe} `),
  treeCorner: (): string => colors.secondary(`  ${symbols.corner} `),
  treeItem: (text: string): string => `${typography.treePipe()}${colors.secondary(text)}`,
  treeLastItem: (text: string): string => `${typography.treeCorner()}${text}`,
} as const;

// Inquirer prompt theme configuration
// Compatible with @inquirer/core Theme interface
export const promptTheme = {
  prefix: {
    idle: colors.accent(symbols.pointer),
    done: colors.success(symbols.success),
  },
  style: {
    answer: (text: string) => colors.primary(text),
    message: (text: string, _status: string) => colors.primary(text),
    error: (text: string) => colors.error(text),
    defaultAnswer: (text: string) => colors.secondaryDim(text),
    help: (text: string) => colors.secondaryDim(text),
    highlight: (text: string) => colors.accent(text),
    key: (text: string) => colors.accent(text),
  },
  icon: {
    cursor: colors.accent(symbols.pointer),
  },
};
