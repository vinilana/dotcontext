import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server as HTTPServer } from 'node:net';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AIContextMCPServer, type MCPServerOptions } from './mcpServer';

type JsonRpcError = {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
  };
  id: null;
};

export interface MCPHttpServerOptions extends MCPServerOptions {
  host?: string;
  port?: number;
  endpointPath?: string;
}

export class AIContextMCPHttpServer {
  private options: Required<Pick<MCPHttpServerOptions, 'host' | 'port' | 'endpointPath'>> & MCPServerOptions;
  private app = createMcpExpressApp();
  private httpServer: HTTPServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private sessionServers = new Map<string, AIContextMCPServer>();

  constructor(options: MCPHttpServerOptions = {}) {
    this.options = {
      host: options.host || '127.0.0.1',
      port: options.port ?? 3000,
      endpointPath: this.normalizePath(options.endpointPath || '/mcp'),
      repoPath: options.repoPath,
      name: options.name,
      verbose: options.verbose,
      contextBuilder: options.contextBuilder,
    };

    this.app = createMcpExpressApp({ host: this.options.host });
    this.registerRoutes();
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const server = this.app.listen(this.options.port, this.options.host, () => {
        this.httpServer = server;
        resolve();
      });

      server.on('error', (error: Error) => reject(error));
    });

    this.log(
      `MCP Streamable HTTP server listening on http://${this.options.host}:${this.getPort()}${this.options.endpointPath}`
    );
  }

  async stop(): Promise<void> {
    for (const [sessionId, transport] of this.transports.entries()) {
      try {
        transport.onclose = undefined;
        await transport.close();
      } catch (error) {
        this.log(`Failed to close transport for session ${sessionId}: ${String(error)}`);
      }
    }

    for (const [sessionId, server] of this.sessionServers.entries()) {
      try {
        await server.stop();
      } catch (error) {
        this.log(`Failed to close MCP server for session ${sessionId}: ${String(error)}`);
      }
    }

    this.transports.clear();
    this.sessionServers.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      this.httpServer = null;
    }

    this.log('MCP Streamable HTTP server stopped');
  }

  getPort(): number {
    if (!this.httpServer) {
      return this.options.port;
    }

    const address = this.httpServer.address();
    if (!address || typeof address === 'string') {
      return this.options.port;
    }

    return (address as AddressInfo).port;
  }

  private registerRoutes(): void {
    this.app.all(this.options.endpointPath, async (req: any, res: any) => {
      try {
        const sessionId = this.getHeaderValue(req.headers['mcp-session-id']);

        if (sessionId) {
          const existingTransport = this.transports.get(sessionId);
          if (!existingTransport) {
            this.sendJsonRpcError(res, 404, 'Session not found for provided mcp-session-id');
            return;
          }

          await existingTransport.handleRequest(req, res, req.body);
          return;
        }

        if (req.method === 'POST' && isInitializeRequest(req.body)) {
          await this.handleInitializeRequest(req, res);
          return;
        }

        this.sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
      } catch (error) {
        this.log(`Error handling Streamable HTTP request: ${String(error)}`);
        if (!res.headersSent) {
          this.sendJsonRpcError(res, 500, 'Internal server error');
        }
      }
    });
  }

  private async handleInitializeRequest(req: any, res: any): Promise<void> {
    let sessionServer: AIContextMCPServer | null = null;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports.set(sessionId, transport);
        if (sessionServer) {
          this.sessionServers.set(sessionId, sessionServer);
        }
        this.log(`Session initialized: ${sessionId}`);
      },
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) {
        this.log(`Session closed: ${sessionId}`);
        void this.cleanupSession(sessionId);
      }
    };

    sessionServer = new AIContextMCPServer({
      repoPath: this.options.repoPath,
      name: this.options.name,
      verbose: this.options.verbose,
      contextBuilder: this.options.contextBuilder,
    });

    await sessionServer.connectTransport(transport);
    await transport.handleRequest(req, res, req.body);

    if (!transport.sessionId) {
      await sessionServer.stop();
    }
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    this.transports.delete(sessionId);
    const sessionServer = this.sessionServers.get(sessionId);
    if (sessionServer) {
      this.sessionServers.delete(sessionId);
      await sessionServer.stop();
    }
  }

  private normalizePath(endpointPath: string): string {
    if (!endpointPath.startsWith('/')) {
      return `/${endpointPath}`;
    }
    return endpointPath;
  }

  private getHeaderValue(value: string | string[] | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return Array.isArray(value) ? value[0] : value;
  }

  private sendJsonRpcError(res: any, statusCode: number, message: string): void {
    const payload: JsonRpcError = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message,
      },
      id: null,
    };

    res.status(statusCode).json(payload);
  }

  private log(message: string): void {
    if (this.options.verbose) {
      process.stderr.write(`[mcp:http] ${message}\n`);
    }
  }
}

export async function startMCPHttpServer(
  options: MCPHttpServerOptions = {}
): Promise<AIContextMCPHttpServer> {
  const server = new AIContextMCPHttpServer(options);
  await server.start();
  return server;
}
