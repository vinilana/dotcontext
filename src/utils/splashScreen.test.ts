import * as os from 'os';
import * as path from 'path';

import {
  formatSplashDirectory,
  packageNameToDisplayName,
  renderSplashScreen,
} from './splashScreen';

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

describe('splashScreen', () => {
  it('humanizes scoped package names for the splash title', () => {
    expect(packageNameToDisplayName('@ai-coders/context')).toBe('AI Coders Context');
  });

  it('shortens home-directory paths with a tilde', () => {
    const directory = path.join(os.homedir(), 'workspace', 'ai-coders-context');
    expect(formatSplashDirectory(directory)).toBe('~/workspace/ai-coders-context');
  });

  it('renders a codex-style splash box with aligned rows', () => {
    const output = stripAnsi(renderSplashScreen({
      title: 'AI Coders CLI',
      version: '0.8.0',
      lines: [
        { label: 'model', value: 'gpt-5.4', note: 'default' },
        { label: 'directory', value: '~/workspace/ai-coders-context' },
      ],
    }));

    expect(output).toContain('AI Coders CLI');
    expect(output).toContain('model:');
    expect(output).toContain('directory:');
    expect(output).toContain('~/workspace/ai-coders-context');
    expect(output).toContain('╭');
    expect(output).toContain('╰');
  });
});
