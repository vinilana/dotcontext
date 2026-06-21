import * as fs from 'fs-extra';
import * as path from 'path';

import { getContextRootPath } from '../../shared/context';
import type { HarnessHookResponse } from '../../harness';

import { extractHarnessSessionId } from './extractHarnessSessionId';

export type ShellHookSource = 'claude-code' | 'codex';

export interface HookSessionBinding {
  harnessSessionId: string;
  hostSessionId: string;
  source: ShellHookSource;
  repoPath: string;
  createdAt: string;
  updatedAt: string;
}

interface HookSessionStoreDocument {
  bindings: Record<string, Record<string, HookSessionBinding>>;
}

export interface HookSessionAdapter {
  handle(event: {
    tool: 'harness';
    params: {
      action: 'createSession';
      name: string;
      metadata?: Record<string, unknown>;
    };
    source?: string;
  }): Promise<HarnessHookResponse>;
}

function storeKey(source: ShellHookSource, hostSessionId: string): string {
  return `${source}:${hostSessionId}`;
}

async function getStorePath(repoPath: string): Promise<string> {
  const contextRoot = await getContextRootPath(repoPath);
  return path.join(contextRoot, 'runtime', 'hooks', 'host-sessions.json');
}

async function readStore(repoPath: string): Promise<HookSessionStoreDocument> {
  const storePath = await getStorePath(repoPath);
  if (!await fs.pathExists(storePath)) {
    return { bindings: {} };
  }

  try {
    const document = await fs.readJson(storePath) as HookSessionStoreDocument;
    if (!document.bindings || typeof document.bindings !== 'object') {
      return { bindings: {} };
    }
    return document;
  } catch {
    return { bindings: {} };
  }
}

async function writeStore(repoPath: string, document: HookSessionStoreDocument): Promise<void> {
  const storePath = await getStorePath(repoPath);
  await fs.ensureDir(path.dirname(storePath));
  await fs.writeJson(storePath, document, { spaces: 2 });
}

export async function getHookHarnessSessionId(options: {
  repoPath: string;
  source: ShellHookSource;
  hostSessionId: string;
}): Promise<string | undefined> {
  const document = await readStore(options.repoPath);
  const binding = document.bindings[options.source]?.[options.hostSessionId];
  return binding?.harnessSessionId;
}

export async function saveHookHarnessSession(binding: HookSessionBinding): Promise<void> {
  const document = await readStore(binding.repoPath);
  const sourceBindings = document.bindings[binding.source] ?? {};
  sourceBindings[binding.hostSessionId] = binding;
  document.bindings[binding.source] = sourceBindings;
  await writeStore(binding.repoPath, document);
}

export async function ensureHookHarnessSession(
  adapter: HookSessionAdapter,
  options: {
    repoPath: string;
    source: ShellHookSource;
    hostSessionId: string;
  }
): Promise<string> {
  const existing = await getHookHarnessSessionId(options);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const response = await adapter.handle({
    tool: 'harness',
    params: {
      action: 'createSession',
      name: `hook:${options.source}:${options.hostSessionId.slice(0, 12)}`,
      metadata: {
        host: options.source,
        hostSessionId: options.hostSessionId,
      },
    },
    source: options.source,
  });

  const harnessSessionId = extractHarnessSessionId(response);
  if (!response.ok || !harnessSessionId) {
    const message = !response.ok ? response.error.message : 'Harness session id missing from createSession response';
    throw new Error(message);
  }

  await saveHookHarnessSession({
    harnessSessionId,
    hostSessionId: options.hostSessionId,
    source: options.source,
    repoPath: options.repoPath,
    createdAt: now,
    updatedAt: now,
  });

  return harnessSessionId;
}

export function hookSessionStoreKey(source: ShellHookSource, hostSessionId: string): string {
  return storeKey(source, hostSessionId);
}
