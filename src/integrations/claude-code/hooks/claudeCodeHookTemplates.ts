import {
  CLAUDE_CODE_HOOK_DISPATCH_COMMAND,
  isCurrentDotcontextHookDispatchCommand,
  isDotcontextHookDispatchCommand,
} from '../../shared/hookDispatchCommands';

export { CLAUDE_CODE_HOOK_DISPATCH_COMMAND };

export interface ClaudeCodeHookCommandEntry {
  type: 'command';
  command: string;
}

export interface ClaudeCodeHookMatcherEntry {
  matcher?: string;
  hooks: ClaudeCodeHookCommandEntry[];
}

export type ClaudeCodeHookTemplate = ClaudeCodeHookMatcherEntry[];

export const CLAUDE_CODE_HOOK_TEMPLATES: Record<
  'SessionStart' | 'PostToolUse' | 'Stop',
  ClaudeCodeHookTemplate
> = {
  SessionStart: [
    {
      matcher: '*',
      hooks: [{ type: 'command', command: CLAUDE_CODE_HOOK_DISPATCH_COMMAND }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit|Bash',
      hooks: [{ type: 'command', command: CLAUDE_CODE_HOOK_DISPATCH_COMMAND }],
    },
  ],
  Stop: [
    {
      hooks: [{ type: 'command', command: CLAUDE_CODE_HOOK_DISPATCH_COMMAND }],
    },
  ],
};

export function buildClaudeCodeHooksFragment(): Record<string, ClaudeCodeHookTemplate> {
  return {
    SessionStart: CLAUDE_CODE_HOOK_TEMPLATES.SessionStart,
    PostToolUse: CLAUDE_CODE_HOOK_TEMPLATES.PostToolUse,
    Stop: CLAUDE_CODE_HOOK_TEMPLATES.Stop,
  };
}

export function isDotcontextClaudeCodeHookCommand(command: unknown): boolean {
  return isDotcontextHookDispatchCommand(command, 'claude-code');
}

export function isCurrentClaudeCodeHookCommand(command: unknown): boolean {
  return isCurrentDotcontextHookDispatchCommand(command, 'claude-code');
}
