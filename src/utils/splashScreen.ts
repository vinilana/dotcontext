import * as os from 'os';
import * as path from 'path';
import boxen from 'boxen';

import { colors } from './theme';

export interface SplashScreenLine {
  label: string;
  value: string;
  note?: string;
}

export interface SplashScreenOptions {
  title: string;
  version: string;
  lines: SplashScreenLine[];
}

export function renderSplashScreen(options: SplashScreenOptions): string {
  const title = `${colors.accent('>_')} ${colors.primaryBold(options.title)} ${colors.secondary(`(v${options.version})`)}`;
  const labelWidth = options.lines.reduce((max, line) => Math.max(max, `${line.label}:`.length), 0);

  const content = [
    title,
    '',
    ...options.lines.map(line => formatLine(line, labelWidth)),
  ].join('\n');

  return boxen(content, {
    borderStyle: 'round',
    borderColor: 'gray',
    padding: {
      top: 0,
      bottom: 0,
      left: 1,
      right: 1,
    },
  });
}

export function packageNameToDisplayName(packageName: string): string {
  return packageName
    .replace(/^@/, '')
    .replace(/\//g, ' ')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.toLowerCase() === 'ai'
      ? 'AI'
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSplashDirectory(directory: string, maxLength = 48): string {
  const homeDirectory = os.homedir();
  const resolved = path.resolve(directory);
  const withTilde = resolved === homeDirectory
    ? '~'
    : resolved.startsWith(`${homeDirectory}${path.sep}`)
      ? `~${path.sep}${path.relative(homeDirectory, resolved)}`
      : resolved;

  return truncateMiddle(withTilde, maxLength);
}

function formatLine(line: SplashScreenLine, labelWidth: number): string {
  const label = colors.secondary(`${line.label}:`.padEnd(labelWidth + 2));
  const value = colors.primary(line.value);

  if (!line.note) {
    return `${label}${value}`;
  }

  return `${label}${value}  ${colors.secondaryDim(line.note)}`;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength || maxLength < 8) {
    return value;
  }

  const visibleChars = maxLength - 3;
  const prefixLength = Math.ceil(visibleChars / 2);
  const suffixLength = Math.floor(visibleChars / 2);

  return `${value.slice(0, prefixLength)}...${value.slice(value.length - suffixLength)}`;
}
