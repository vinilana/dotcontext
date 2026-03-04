import { AIContextMCPHttpServer } from './mcpHttpServer';

describe('AIContextMCPHttpServer', () => {
  let server: AIContextMCPHttpServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('starts on an ephemeral port and rejects invalid non-session requests', async () => {
    server = new AIContextMCPHttpServer({
      host: '127.0.0.1',
      port: 0,
      endpointPath: '/mcp',
      verbose: false,
    });

    await server.start();
    const port = server.getPort();

    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const payload = await response.json() as {
      error?: { message?: string };
    };
    expect(payload.error?.message).toContain('No valid session ID provided');
  });

  it('returns JSON initialize response by default in HTTP mode', async () => {
    server = new AIContextMCPHttpServer({
      host: '127.0.0.1',
      port: 0,
      endpointPath: '/mcp',
      verbose: false,
    });

    await server.start();
    const port = server.getPort();

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('exposes root status endpoint', async () => {
    server = new AIContextMCPHttpServer({
      host: '127.0.0.1',
      port: 0,
      endpointPath: '/mcp',
      verbose: false,
    });

    await server.start();
    const port = server.getPort();

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      endpoint?: string;
      transport?: string;
      jsonResponse?: boolean;
      mode?: string;
    };
    expect(payload.endpoint).toBe('/mcp');
    expect(payload.transport).toBe('streamable-http');
    expect(payload.jsonResponse).toBe(true);
    expect(payload.mode).toBe('stateful');
  });

  it('supports stateless mode for remote/load-balanced clients', async () => {
    server = new AIContextMCPHttpServer({
      host: '127.0.0.1',
      port: 0,
      endpointPath: '/mcp',
      stateless: true,
      verbose: false,
    });

    await server.start();
    const port = server.getPort();
    const endpoint = `http://127.0.0.1:${port}/mcp`;

    const initializeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.headers.get('mcp-session-id')).toBeNull();
    await initializeResponse.text();

    const toolsResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(toolsResponse.status).toBe(200);
    const toolsBody = await toolsResponse.text();
    expect(toolsBody).toContain('"tools"');
  });
});
