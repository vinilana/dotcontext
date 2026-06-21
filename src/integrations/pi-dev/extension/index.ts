import {
  createPiDevHookAdapter,
  extractHarnessSessionId,
  isTracedPiTool,
  mapPiResponse,
  type PiDevHookEvent,
} from '@dotcontext/integrations/pi-dev';

interface PiSendMessageOptions {
  triggerTurn?: boolean;
  deliverAs?: 'steer' | 'followUp' | 'nextTurn';
}

interface PiCustomMessage {
  customType: string;
  content: string;
  display?: boolean;
  details?: Record<string, unknown>;
}

interface PiSessionManager {
  getSessionFile(): string | undefined;
}

interface PiExtensionContext {
  cwd: string;
  sessionManager: PiSessionManager;
  ui: {
    notify(text: string, level: 'info' | 'warning' | 'error'): void;
  };
}

interface ExtensionAPI {
  on<T extends string>(
    type: T,
    handler: (event: Record<string, unknown>, ctx: PiExtensionContext) => Promise<void> | void
  ): void;
  sendMessage(message: PiCustomMessage, options?: PiSendMessageOptions): void | Promise<void>;
}

function getSessionLabel(ctx: PiExtensionContext): string {
  return ctx.sessionManager.getSessionFile() ?? 'pi-ephemeral';
}

function createAdapter(repoPath: string) {
  return createPiDevHookAdapter({ repoPath });
}

function isInitialized(response: Awaited<ReturnType<ReturnType<typeof createAdapter>['handle']>>): boolean {
  if (!response.ok || response.result.kind !== 'json') {
    return false;
  }

  const data = response.result.data;
  return typeof data === 'object'
    && data !== null
    && 'initialized' in data
    && Boolean((data as { initialized?: boolean }).initialized);
}

export default function dotcontextPiExtension(pi: ExtensionAPI): void {
  let harnessSessionId: string | undefined;

  pi.on('session_start', async (_event, ctx) => {
    const adapter = createAdapter(ctx.cwd);
    const sessionLabel = getSessionLabel(ctx);

    const sessionResponse = await adapter.handle({
      type: 'harness_create_session',
      cwd: ctx.cwd,
      sessionName: `pi:${sessionLabel}`,
    });
    harnessSessionId = extractHarnessSessionId(sessionResponse);

    const sessionStartEvent: PiDevHookEvent = {
      type: 'session_start',
      cwd: ctx.cwd,
      sessionId: harnessSessionId,
    };
    const checkResponse = await adapter.handle(sessionStartEvent);

    let navigationResponse;
    if (isInitialized(checkResponse)) {
      navigationResponse = await adapter.handle({
        type: 'session_start_navigation',
        cwd: ctx.cwd,
      });
    }

    const output = mapPiResponse(sessionStartEvent, checkResponse, {
      navigation: navigationResponse,
    });

    if (output.additionalContext) {
      await pi.sendMessage(
        {
          customType: 'dotcontext',
          content: output.additionalContext,
          display: false,
        },
        {
          deliverAs: 'nextTurn',
        }
      );
    }
  });

  pi.on('tool_execution_end', async (event, ctx) => {
    const toolName = typeof event.toolName === 'string' ? event.toolName : '';
    if (!isTracedPiTool(toolName) || !harnessSessionId) {
      return;
    }

    const adapter = createAdapter(ctx.cwd);
    try {
      await adapter.handle({
        type: 'tool_execution_end',
        cwd: ctx.cwd,
        sessionId: harnessSessionId,
        toolName,
        toolInput: event.args ?? event.input,
      });
    } catch {
      // Non-traced or malformed tool events are ignored.
    }
  });

  pi.on('agent_end', async (_event, ctx) => {
    const adapter = createAdapter(ctx.cwd);
    const agentEndEvent: PiDevHookEvent = {
      type: 'agent_end',
      cwd: ctx.cwd,
      sessionId: harnessSessionId,
    };
    const response = await adapter.handle(agentEndEvent);
    const output = mapPiResponse(agentEndEvent, response);

    if (output.notify) {
      ctx.ui.notify(output.notify, 'info');
    }
  });
}
