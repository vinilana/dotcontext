export {
  HostHarnessHookAdapter,
  createHostHarnessHookAdapter,
  type HostHookAdapterOptions,
  type HostHookMapper,
  type HostHookAdapterRuntime,
} from './hostHookAdapter';

export {
  normalizeToolEvent,
  type NormalizedToolEvent,
} from './toolEventNormalizer';

export {
  resolveHarnessHookFromHostEvent,
  type ResolveHarnessHookOptions,
} from './resolveHarnessHookFromHostEvent';

export {
  mapHostHookResponse,
  type HostHookOutput,
} from './mapHostHookResponse';

export {
  HOOK_DISPATCH_CLI,
  CLAUDE_CODE_HOOK_DISPATCH_COMMAND,
  CODEX_HOOK_DISPATCH_COMMAND,
  isDotcontextHookDispatchCommand,
  isCurrentDotcontextHookDispatchCommand,
} from './hookDispatchCommands';

export {
  ensureHookHarnessSession,
  getHookHarnessSessionId,
  saveHookHarnessSession,
  type HookSessionAdapter,
  type HookSessionBinding,
  type ShellHookSource,
} from './hookSessionStore';

export { extractHarnessSessionId } from './extractHarnessSessionId';
export { formatNavigationExcerpt } from './formatNavigationExcerpt';

export type {
  HarnessHookEvent,
  HarnessHookResponse,
  HarnessHookSource,
} from '../../harness';
