export const HOOK_DISPATCH_CLI = 'npx -y @dotcontext/cli@latest hook dispatch';

export const CLAUDE_CODE_HOOK_DISPATCH_COMMAND =
  `${HOOK_DISPATCH_CLI} --source claude-code`;

export const CODEX_HOOK_DISPATCH_COMMAND =
  `${HOOK_DISPATCH_CLI} --source codex`;

export function isDotcontextHookDispatchCommand(
  command: unknown,
  source: 'claude-code' | 'codex'
): boolean {
  if (typeof command !== 'string') {
    return false;
  }

  return command.includes('hook dispatch')
    && command.includes(`--source ${source}`);
}

export function isCurrentDotcontextHookDispatchCommand(
  command: unknown,
  source: 'claude-code' | 'codex'
): boolean {
  const expected = source === 'claude-code'
    ? CLAUDE_CODE_HOOK_DISPATCH_COMMAND
    : CODEX_HOOK_DISPATCH_COMMAND;

  return command === expected;
}
