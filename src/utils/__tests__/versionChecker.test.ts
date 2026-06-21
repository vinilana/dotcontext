import { checkForUpdates } from '../versionChecker';
import type { TranslateFn, TranslateParams } from '../i18n';

describe('versionChecker', () => {
  const ui = {
    displayInfo: jest.fn<void, [string, string]>()
  };

  const t: TranslateFn = (key: string, params?: TranslateParams) => {
    const context = (params ?? {}) as Record<string, string | number | undefined>;
    const latest = context.latest ?? '';
    const current = context.current ?? '';
    const command = context.command ?? '';
    switch (key) {
      case 'info.update.available.title':
        return 'Update available';
      case 'info.update.available.detail':
        return `Latest: ${latest}, current: ${current}, update with: ${command}`;
      default:
        return key;
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('informs the user when a newer version exists', async () => {
    await checkForUpdates({
      packageName: '@scope/test',
      currentVersion: '0.1.0',
      ui,
      t,
      fetcher: async (pkgName: string, timeoutMs: number) => {
        expect(pkgName).toBe('@scope/test');
        expect(timeoutMs).toBeGreaterThan(0);
        return '0.2.0';
      },
      updateCommand: 'npm i -g @scope/test',
      force: true
    });

    expect(ui.displayInfo).toHaveBeenCalledWith(
      'Update available',
      'Latest: 0.2.0, current: 0.1.0, update with: npm i -g @scope/test'
    );
  });

  it('does not notify when already on latest version', async () => {
    await checkForUpdates({
      packageName: 'pkg',
      currentVersion: '1.0.0',
      ui,
      t,
      fetcher: async (_packageName, _timeout) => '1.0.0',
      force: true
    });

    expect(ui.displayInfo).not.toHaveBeenCalled();
  });

  it('silently ignores registry failures', async () => {
    await expect(
      checkForUpdates({
        packageName: 'pkg',
        currentVersion: '1.0.0',
        ui,
        t,
        fetcher: async (_packageName, _timeout) => {
          throw new Error('network');
        },
        force: true
      })
    ).resolves.toBeUndefined();

    expect(ui.displayInfo).not.toHaveBeenCalled();
  });
});
