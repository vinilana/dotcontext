export {
  ClaudeCodeHarnessHookAdapter,
  createClaudeCodeHookAdapter,
  type ClaudeCodeHookEvent,
  type ClaudeCodeHookResponse,
  type ClaudeCodeHookAdapterOptions,
} from './hooks/createClaudeCodeHookAdapter';

export {
  mapClaudeCodeEvent,
  type ClaudeCodeHookInput,
} from './hooks/mapClaudeCodeEvent';

export {
  mapClaudeCodeResponse,
  type ClaudeCodeHookOutput,
} from './hooks/mapClaudeCodeResponse';

export {
  CLAUDE_CODE_HOOK_TEMPLATES,
  CLAUDE_CODE_HOOK_DISPATCH_COMMAND,
  buildClaudeCodeHooksFragment,
  type ClaudeCodeHookTemplate,
} from './hooks/claudeCodeHookTemplates';

export {
  installClaudeCodeHooks,
  previewClaudeCodeHooks,
  type ClaudeCodeHookInstallOptions,
  type ClaudeCodeHookInstallResult,
} from './install/claudeCodeHookInstallService';
