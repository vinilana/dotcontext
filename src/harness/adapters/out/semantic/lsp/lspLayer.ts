/**
 * LSP Layer - Language Server Protocol integration for semantic analysis
 *
 * Provides deeper semantic understanding through LSP servers.
 * This layer is lazily initialized and optional.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {
  TypeInfo,
  ReferenceLocation,
  LSPServerConfig,
  SupportedLanguage,
  LANGUAGE_EXTENSIONS,
} from '../types';

interface LSPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const LSP_SERVER_CONFIGS: Record<string, LSPServerConfig> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['tsconfig.json', 'package.json'],
  },
  javascript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['package.json', 'jsconfig.json'],
  },
  python: {
    command: 'pylsp',
    args: [],
    rootPatterns: ['setup.py', 'pyproject.toml', 'requirements.txt', 'setup.cfg'],
  },
};

const REQUEST_TIMEOUT_MS = 10000;

export class LSPLayer {
  private servers: Map<string, ChildProcess> = new Map();
  private messageId: number = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private initialized: Map<string, boolean> = new Map();
  private buffers: Map<string, string> = new Map();

  private detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = path.extname(filePath);
    return LANGUAGE_EXTENSIONS[ext] || null;
  }

  private getServerConfig(language: string): LSPServerConfig | null {
    return LSP_SERVER_CONFIGS[language] || null;
  }

  async ensureServer(language: string, projectPath: string): Promise<boolean> {
    if (this.initialized.get(language)) {
      return true;
    }

    const config = this.getServerConfig(language);
    if (!config) {
      return false;
    }

    try {
      // Wrap spawn in a promise to properly handle ENOENT and other spawn errors
      const serverProcess = await new Promise<ChildProcess>((resolve, reject) => {
        const proc = spawn(config.command, config.args, {
          cwd: projectPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        // Handle spawn errors (e.g., command not found)
        proc.on('error', (error) => {
          reject(error);
        });

        // Give spawn a moment to fail or succeed
        // If no error within a short time, assume spawn succeeded
        setTimeout(() => {
          if (proc.pid) {
            resolve(proc);
          } else {
            reject(new Error(`Failed to spawn ${config.command}`));
          }
        }, 100);
      });

      this.servers.set(language, serverProcess);
      this.buffers.set(language, '');

      // Setup message handling
      serverProcess.stdout?.on('data', (data: Buffer) => {
        this.handleServerData(language, data);
      });

      serverProcess.stderr?.on('data', () => {
        // Silently ignore stderr - LSP servers may output diagnostics
      });

      // Re-attach error handler for runtime errors (after spawn)
      serverProcess.on('error', () => {
        // Silently cleanup on error
        this.cleanup(language);
      });

      serverProcess.on('exit', () => {
        this.cleanup(language);
      });

      // Initialize the server
      await this.sendRequest(language, 'initialize', {
        processId: process.pid,
        rootUri: `file://${projectPath}`,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            references: {},
            implementation: {},
          },
        },
      });

      this.sendNotification(language, 'initialized', {});
      this.initialized.set(language, true);

      return true;
    } catch {
      // LSP server not available - this is expected if the language server isn't installed
      // Silently return false and fall back to non-LSP analysis
      return false;
    }
  }

  private handleServerData(language: string, data: Buffer): void {
    let buffer = (this.buffers.get(language) || '') + data.toString();

    while (true) {
      const headerMatch = buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = headerMatch.index! + headerMatch[0].length;

      if (buffer.length < headerEnd + contentLength) break;

      const content = buffer.slice(headerEnd, headerEnd + contentLength);
      buffer = buffer.slice(headerEnd + contentLength);

      try {
        const message: LSPMessage = JSON.parse(content);
        this.handleMessage(message);
      } catch {
        // Silently ignore malformed messages
      }
    }

    this.buffers.set(language, buffer);
  }

  private handleMessage(message: LSPMessage): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private sendRequest(language: string, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.sendMessage(language, message);
    });
  }

  private sendNotification(language: string, method: string, params: unknown): void {
    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(language, message);
  }

  private sendMessage(language: string, message: LSPMessage): void {
    const server = this.servers.get(language);
    if (!server?.stdin?.writable) return;

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    try {
      server.stdin.write(header + content);
    } catch {
      // Silently ignore send failures
    }
  }

  private cleanup(language: string): void {
    this.servers.delete(language);
    this.initialized.delete(language);
    this.buffers.delete(language);

    // Reject all pending requests for this language
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`LSP server ${language} disconnected`));
      this.pendingRequests.delete(id);
    }
  }

  async getTypeInfo(
    filePath: string,
    line: number,
    column: number,
    projectPath: string
  ): Promise<TypeInfo | null> {
    const language = this.detectLanguage(filePath);
    if (!language) return null;

    const serverReady = await this.ensureServer(language, projectPath);
    if (!serverReady) return null;

    try {
      const result = await this.sendRequest(language, 'textDocument/hover', {
        textDocument: { uri: `file://${filePath}` },
        position: { line: line - 1, character: column },
      });

      if (result && typeof result === 'object' && 'contents' in result) {
        return this.parseHoverResult((result as { contents: unknown }).contents);
      }
    } catch {
      // LSP request failed - return null to fall back to non-LSP analysis
    }

    return null;
  }

  async findReferences(
    filePath: string,
    line: number,
    column: number,
    projectPath: string
  ): Promise<ReferenceLocation[]> {
    const language = this.detectLanguage(filePath);
    if (!language) return [];

    const serverReady = await this.ensureServer(language, projectPath);
    if (!serverReady) return [];

    try {
      const result = await this.sendRequest(language, 'textDocument/references', {
        textDocument: { uri: `file://${filePath}` },
        position: { line: line - 1, character: column },
        context: { includeDeclaration: true },
      });

      if (Array.isArray(result)) {
        return result.map((ref: { uri: string; range: { start: { line: number; character: number } } }) => ({
          file: ref.uri.replace('file://', ''),
          line: ref.range.start.line + 1,
          column: ref.range.start.character,
        }));
      }
    } catch {
      // LSP request failed - return empty array
    }

    return [];
  }

  async getDefinition(
    filePath: string,
    line: number,
    column: number,
    projectPath: string
  ): Promise<ReferenceLocation | null> {
    const language = this.detectLanguage(filePath);
    if (!language) return null;

    const serverReady = await this.ensureServer(language, projectPath);
    if (!serverReady) return null;

    try {
      const result = await this.sendRequest(language, 'textDocument/definition', {
        textDocument: { uri: `file://${filePath}` },
        position: { line: line - 1, character: column },
      });

      if (Array.isArray(result) && result.length > 0) {
        const def = result[0] as { uri: string; range: { start: { line: number; character: number } } };
        return {
          file: def.uri.replace('file://', ''),
          line: def.range.start.line + 1,
          column: def.range.start.character,
        };
      }
    } catch {
      // LSP request failed - return null
    }

    return null;
  }

  async findImplementations(
    filePath: string,
    line: number,
    column: number,
    projectPath: string
  ): Promise<ReferenceLocation[]> {
    const language = this.detectLanguage(filePath);
    if (!language) return [];

    const serverReady = await this.ensureServer(language, projectPath);
    if (!serverReady) return [];

    try {
      const result = await this.sendRequest(language, 'textDocument/implementation', {
        textDocument: { uri: `file://${filePath}` },
        position: { line: line - 1, character: column },
      });

      if (Array.isArray(result)) {
        return result.map((impl: { uri: string; range: { start: { line: number; character: number } } }) => ({
          file: impl.uri.replace('file://', ''),
          line: impl.range.start.line + 1,
          column: impl.range.start.character,
        }));
      }
    } catch {
      // LSP request failed - return empty array
    }

    return [];
  }

  private parseHoverResult(contents: unknown): TypeInfo {
    let text = '';

    if (typeof contents === 'string') {
      text = contents;
    } else if (Array.isArray(contents)) {
      text = contents
        .map((c) => (typeof c === 'string' ? c : (c as { value?: string }).value || ''))
        .join('\n');
    } else if (contents && typeof contents === 'object') {
      text = (contents as { value?: string }).value || '';
    }

    // Extract type from markdown code blocks
    const codeMatch = text.match(/```\w*\n?([\s\S]*?)\n?```/);
    const typeText = codeMatch ? codeMatch[1] : text;

    return {
      name: typeText.split('\n')[0] || 'unknown',
      fullType: typeText,
      documentation: text.replace(/```[\s\S]*?```/g, '').trim() || undefined,
    };
  }

  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const [language] of this.servers) {
      shutdownPromises.push(
        (async () => {
          try {
            await this.sendRequest(language, 'shutdown', null);
            this.sendNotification(language, 'exit', null);
          } catch {
            // Ignore shutdown errors
          }
          this.cleanup(language);
        })()
      );
    }

    await Promise.all(shutdownPromises);
  }

  isServerAvailable(language: string): boolean {
    return this.initialized.get(language) === true;
  }

  getAvailableLanguages(): string[] {
    return Object.keys(LSP_SERVER_CONFIGS);
  }
}
