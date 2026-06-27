export type HookBashClassification =
  | 'test'
  | 'build'
  | 'lint'
  | 'inspection'
  | 'migration'
  | 'destructive';

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ').toLowerCase();
}

function commandMatches(command: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(command));
}

export function extractBashCommand(toolInput: unknown): string | undefined {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    return undefined;
  }

  const command = (toolInput as { command?: unknown }).command;
  return typeof command === 'string' && command.trim().length > 0
    ? command
    : undefined;
}

export function classifyBashCommand(command: string | undefined): HookBashClassification | undefined {
  if (!command) {
    return undefined;
  }

  const normalized = normalizeCommand(command);

  if (commandMatches(normalized, [
    /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b/,
    /\brm\s+(?=[^;&|]*-(?:r|-recursive)\b)(?=[^;&|]*-(?:f|-force)\b)/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\s+-[^\s]*f/,
    /\bterraform\s+destroy\b/,
    /\bkubectl\s+delete\b/,
    /\bdrop\s+database\b/,
  ])) {
    return 'destructive';
  }

  if (commandMatches(normalized, [
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/,
    /\b(jest|vitest|mocha|playwright\s+test|pytest|rspec)\b/,
    /\bgo\s+test\b/,
    /\bcargo\s+test\b/,
  ])) {
    return 'test';
  }

  if (commandMatches(normalized, [
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b/,
    /\btsc\b/,
    /\b(next|vite|webpack|rollup)\s+build\b/,
    /\bgo\s+build\b/,
    /\bcargo\s+build\b/,
  ])) {
    return 'build';
  }

  if (commandMatches(normalized, [
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?lint\b/,
    /\b(eslint|biome|ruff|flake8|pylint|rubocop)\b/,
  ])) {
    return 'lint';
  }

  if (commandMatches(normalized, [
    /\b(prisma|knex|sequelize)\s+.*\bmigrate\b/,
    /\brails\s+db:migrate\b/,
    /\balembic\s+upgrade\b/,
    /\bdjango-admin\s+migrate\b/,
    /\bmanage\.py\s+migrate\b/,
  ])) {
    return 'migration';
  }

  if (commandMatches(normalized, [
    /\bgit\s+(status|diff|show|log)\b/,
    /\b(rg|grep|find|ls|pwd)\b/,
    /\bcat\b/,
    /\bsed\s+-n\b/,
  ])) {
    return 'inspection';
  }

  return undefined;
}

export function buildHookTraceData(toolName: string | undefined, toolInput: unknown): Record<string, unknown> {
  const data: Record<string, unknown> = { tool_input: toolInput };
  if (toolName?.trim().toLowerCase() !== 'bash') {
    return data;
  }

  const classification = classifyBashCommand(extractBashCommand(toolInput));
  if (classification) {
    data.classification = classification;
  }

  return data;
}
