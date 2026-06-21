export const sessionStartFixture = {
  session_id: 'abc123',
  transcript_path: '~/.claude/projects/example/session.jsonl',
  cwd: '/tmp/dotcontext-repo',
  permission_mode: 'default',
  hook_event_name: 'SessionStart',
  source: 'startup',
} as const;

export const postToolUseWriteFixture = {
  session_id: 'abc123',
  cwd: '/tmp/dotcontext-repo',
  hook_event_name: 'PostToolUse',
  tool_name: 'Write',
  tool_input: {
    file_path: '/tmp/dotcontext-repo/README.md',
    content: '# Example',
  },
  tool_response: {
    filePath: '/tmp/dotcontext-repo/README.md',
    success: true,
  },
} as const;

export const stopFixture = {
  session_id: 'abc123',
  cwd: '/tmp/dotcontext-repo',
  hook_event_name: 'Stop',
} as const;

export const codexSessionStartFixture = {
  ...sessionStartFixture,
  hook_event_name: 'SessionStart',
} as const;

export const codexPostToolUseFixture = {
  ...postToolUseWriteFixture,
  tool_name: 'Edit',
} as const;

export const codexStopFixture = {
  ...stopFixture,
} as const;
