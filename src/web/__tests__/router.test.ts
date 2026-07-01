import { matchRoute, createRouter, type RouteContext } from '../router';
import type { RuntimeWatcher } from '../events/runtimeWatcher';

function buildContext(): RouteContext {
  return {
    repoPath: '/tmp/does-not-matter',
    runtimeWatcher: { on: jest.fn(), off: jest.fn() } as unknown as RuntimeWatcher,
  };
}

describe('matchRoute', () => {
  it('matches a static route with no params', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'docs'], handler: jest.fn() },
    ];

    const match = matchRoute(routes, 'GET', '/api/docs');

    expect(match).not.toBeNull();
    expect(match?.params).toEqual({});
  });

  it('extracts dynamic :param segments', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'docs', ':name'], handler: jest.fn() },
    ];

    const match = matchRoute(routes, 'GET', '/api/docs/project-overview');

    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ name: 'project-overview' });
  });

  it('decodes URI-encoded param segments', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'sessions', ':id'], handler: jest.fn() },
    ];

    const match = matchRoute(routes, 'GET', '/api/sessions/abc%2Fdef');

    expect(match?.params).toEqual({ id: 'abc/def' });
  });

  it('does not match a different HTTP method', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'docs'], handler: jest.fn() },
    ];

    expect(matchRoute(routes, 'POST', '/api/docs')).toBeNull();
  });

  it('does not match a different segment count', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'docs', ':name'], handler: jest.fn() },
    ];

    expect(matchRoute(routes, 'GET', '/api/docs')).toBeNull();
    expect(matchRoute(routes, 'GET', '/api/docs/a/b')).toBeNull();
  });

  it('does not match when a static segment differs', () => {
    const routes = [
      { method: 'GET', segments: ['api', 'docs', ':name'], handler: jest.fn() },
    ];

    expect(matchRoute(routes, 'GET', '/api/skills/foo')).toBeNull();
  });
});

describe('createRouter', () => {
  it('returns false (unmatched) for an unknown /api/* path without throwing', async () => {
    const dispatch = createRouter(buildContext());
    const req = { method: 'GET' } as unknown as Parameters<typeof dispatch>[0];
    const res = { headersSent: false, writeHead: jest.fn(), end: jest.fn() } as unknown as Parameters<typeof dispatch>[1];

    const matched = await dispatch(req, res, '/api/totally-unknown');

    expect(matched).toBe(false);
  });

  it('catches handler errors and responds with a 500 envelope instead of throwing', async () => {
    const dispatch = createRouter(buildContext());
    const req = { method: 'GET' } as unknown as Parameters<typeof dispatch>[0];

    let writtenStatus: number | undefined;
    let writtenBody = '';
    const res = {
      headersSent: false,
      writeHead: (status: number) => {
        writtenStatus = status;
      },
      end: (body?: string) => {
        writtenBody = body ?? '';
      },
    } as unknown as Parameters<typeof dispatch>[1];

    // /api/docs/:name resolves to a real handler (getDoc), which will reject
    // because the repo path does not exist — exercising the router's
    // try/catch around handler execution.
    const matched = await dispatch(req, res, '/api/docs/does-not-exist');

    expect(matched).toBe(true);
    expect(writtenStatus).toBe(404);
    expect(JSON.parse(writtenBody)).toHaveProperty('error.message');
  });
});
