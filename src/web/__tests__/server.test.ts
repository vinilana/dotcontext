import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';

import { startWebServer, type WebServerHandle } from '../server';
import { HarnessRuntimeStateService } from '../../harness';

interface JsonResponse<T = unknown> {
  status: number;
  body: T;
}

function getJson<T = unknown>(url: string): Promise<JsonResponse<T>> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

describe('startWebServer', () => {
  let tempDir: string;
  let handle: WebServerHandle;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-server-'));

    await fs.ensureDir(path.join(tempDir, '.context', 'docs'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'docs', 'project-overview.md'),
      '---\ntype: docs\nname: project-overview\ndescription: Overview doc\nstatus: filled\ngenerated: "2026-06-30"\nscaffoldVersion: "2.0.0"\n---\n\n# Project Overview\n\nHello world.\n'
    );

    // Binds an ephemeral port (`port: 0`) so parallel test runs never collide.
    handle = await startWebServer({ repoPath: tempDir, port: 0 });
  });

  afterAll(async () => {
    await handle.stop();
    await fs.remove(tempDir);
  });

  it('binds to localhost by default', () => {
    expect(handle.host).toBe('127.0.0.1');
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`);
  });

  it('GET /api/docs lists docs discovered under .context/docs', async () => {
    const response = await getJson<{ data: Array<{ name: string; title: string }> }>(
      `${handle.url}/api/docs`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ name: 'project-overview', title: 'Project Overview' }),
    ]);
  });

  it('GET /api/docs/:name returns the doc content envelope', async () => {
    const response = await getJson<{ data: { name: string; content: string } }>(
      `${handle.url}/api/docs/project-overview`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('project-overview');
    expect(response.body.data.content).toContain('Hello world.');
  });

  it('GET /api/docs/:name returns a 404 error envelope for a missing doc', async () => {
    const response = await getJson<{ error: { message: string } }>(
      `${handle.url}/api/docs/does-not-exist`
    );

    expect(response.status).toBe(404);
    expect(response.body.error.message).toMatch(/not found/i);
  });

  it('GET /api/sessions reflects sessions written via the harness runtime state service', async () => {
    const runtimeState = new HarnessRuntimeStateService({ repoPath: tempDir });
    const session = await runtimeState.createSession({ name: 'web-route-test' });

    const response = await getJson<{ data: Array<{ id: string }> }>(`${handle.url}/api/sessions`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((entry) => entry.id)).toContain(session.id);
  });

  it('GET /api/workflow/status reports no workflow when none has been initialized', async () => {
    const response = await getJson<{ data: { status: unknown; summary: unknown } }>(
      `${handle.url}/api/workflow/status`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ status: null, summary: null });
  });

  it('returns 404 for an unmatched /api/* path instead of falling through to static serving', async () => {
    const response = await getJson(`${handle.url}/api/nope`);
    expect(response.status).toBe(404);
  });

  it('streams an SSE "hello" event on GET /api/events', async () => {
    const event = await new Promise<{ event: string; data: string }>((resolve, reject) => {
      const req = http.get(`${handle.url}/api/events`, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf-8');
          const match = buffer.match(/event: (\w+)\ndata: (.+)\n\n/);
          if (match) {
            req.destroy();
            resolve({ event: match[1], data: match[2] });
          }
        });
        res.on('error', reject);
      });
      req.on('error', () => {
        // Destroying the request after resolving triggers a benign socket
        // error on some Node versions; only reject if we never resolved.
      });
    });

    expect(event.event).toBe('hello');
    expect(() => JSON.parse(event.data)).not.toThrow();
  });
});
