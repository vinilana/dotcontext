import { gt } from 'semver';

import type { CLIInterface } from './cliUI';
import type { TranslateFn } from './i18n';

interface VersionCheckOptions {
  packageName: string;
  currentVersion: string;
  ui: Pick<CLIInterface, 'displayInfo'>;
  t: TranslateFn;
  registryTimeoutMs?: number;
  fetcher?: (packageName: string, timeoutMs: number) => Promise<string>;
  updateCommand?: string;
  force?: boolean;
}

const DEFAULT_TIMEOUT_MS = 2000;

const DISABLE_ENV_FLAGS = ['DOTCONTEXT_DISABLE_UPDATE_CHECK', 'NO_UPDATE_NOTIFIER'];

async function fetchLatestVersion(packageName: string, timeoutMs: number): Promise<string> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { version?: string };
    if (!data?.version) {
      throw new Error('missing-version');
    }

    return data.version;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkForUpdates(options: VersionCheckOptions): Promise<void> {
  const {
    packageName,
    currentVersion,
    ui,
    t,
    registryTimeoutMs = DEFAULT_TIMEOUT_MS,
    fetcher,
    updateCommand,
    force = false
  } = options;

  if (!force) {
    if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
      return;
    }

    for (const envFlag of DISABLE_ENV_FLAGS) {
      const value = process.env[envFlag];
      if (typeof value === 'string' && value.toLowerCase() !== 'false') {
        return;
      }
    }
  }

  try {
    const latestVersion = await (fetcher
      ? fetcher(packageName, registryTimeoutMs)
      : fetchLatestVersion(packageName, registryTimeoutMs));

    if (gt(latestVersion, currentVersion)) {
      const command = updateCommand ?? `npm install -g ${packageName}`;
      ui.displayInfo(
        t('info.update.available.title'),
        t('info.update.available.detail', {
          latest: latestVersion,
          current: currentVersion,
          command
        })
      );
    }
  } catch (error) {
    // Swallow errors silently; update hints should never block the CLI.
  }
}
