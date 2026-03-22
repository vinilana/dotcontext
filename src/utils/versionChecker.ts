import axios from 'axios';
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
  const response = await axios.get<{ version?: string }>(url, { timeout: timeoutMs });
  if (!response.data?.version) {
    throw new Error('missing-version');
  }
  return response.data.version;
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
