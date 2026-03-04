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
});
