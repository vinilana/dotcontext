import {
  CODEX_HOOK_DISPATCH_COMMAND,
  isCurrentDotcontextHookDispatchCommand,
  isDotcontextHookDispatchCommand,
} from '../../shared/hookDispatchCommands';

export { CODEX_HOOK_DISPATCH_COMMAND };

export interface CodexHookCommandEntry {
  type: 'command';
  command: string;
}

export interface CodexHookMatcherEntry {
  matcher?: string;
  hooks: CodexHookCommandEntry[];
}

export type CodexHookTemplate = CodexHookMatcherEntry[];

export const CODEX_HOOK_TEMPLATES: Record<
  'SessionStart' | 'PostToolUse' | 'Stop',
  CodexHookTemplate
> = {
  SessionStart: [
    {
      matcher: '*',
      hooks: [{ type: 'command', command: CODEX_HOOK_DISPATCH_COMMAND }],
    },
  ],
  PostToolUse: [
    {
      matcher: '^Write$|^Edit$|^Bash$',
      hooks: [{ type: 'command', command: CODEX_HOOK_DISPATCH_COMMAND }],
    },
  ],
  Stop: [
    {
      matcher: '*',
      hooks: [{ type: 'command', command: CODEX_HOOK_DISPATCH_COMMAND }],
    },
  ],
};

export function buildCodexHooksFragment(): Record<string, CodexHookTemplate> {
  return {
    SessionStart: CODEX_HOOK_TEMPLATES.SessionStart,
    PostToolUse: CODEX_HOOK_TEMPLATES.PostToolUse,
    Stop: CODEX_HOOK_TEMPLATES.Stop,
  };
}

export function buildCodexHooksDocument(): { hooks: Record<string, CodexHookTemplate> } {
  return { hooks: buildCodexHooksFragment() };
}

export function isDotcontextCodexHookCommand(command: unknown): boolean {
  return isDotcontextHookDispatchCommand(command, 'codex');
}

export function isCurrentCodexHookCommand(command: unknown): boolean {
  return isCurrentDotcontextHookDispatchCommand(command, 'codex');
}

export function buildCodexTomlHookBlocks(): string {
  const lines: string[] = [
    '[features]',
    'hooks = true',
    '',
  ];

  for (const [eventName, entries] of Object.entries(CODEX_HOOK_TEMPLATES)) {
    for (const entry of entries) {
      lines.push(`[[hooks.${eventName}]]`);
      if (entry.matcher) {
        lines.push(`matcher = ${JSON.stringify(entry.matcher)}`);
      }
      for (const hook of entry.hooks) {
        lines.push(`command = ${JSON.stringify(hook.command)}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export const CODEX_HOOK_TRUST_REMINDER =
  'After install, run /hooks in Codex and trust project hooks when prompted.';
