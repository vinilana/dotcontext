import { execSync } from 'child_process';
import * as path from 'path';

describe('CLI Commands', () => {
  const cliPath = path.join(__dirname, '../dist/index.js');
  
  beforeAll(() => {
    // Build the project before running tests
    execSync('npm run build', { stdio: 'pipe' });
  });

  describe('Main CLI', () => {
    it('should display help when --help flag is used', () => {
      const output = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
      expect(output).toContain('Scaffold documentation and agent playbooks');
      expect(output).toContain('Commands:');
      expect(output).toContain('init');
      expect(output).toContain('fill');
      expect(output).toContain('plan');
    });

    it('should display version when --version flag is used', () => {
      const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' });
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should render the splash preview command', () => {
      const output = execSync(
        `FORCE_COLOR=0 node ${cliPath} preview-splash --title "AI Coders CLI" --model gpt-5.4 --directory ${process.cwd()}`,
        { encoding: 'utf8' }
      );

      expect(output).toContain('AI Coders CLI');
      expect(output).toContain('model:');
      expect(output).toContain('directory:');
    });
  });

  describe('init command', () => {
    it('should display help for init command', () => {
      const output = execSync(`node ${cliPath} init --help`, { encoding: 'utf8' });
      expect(output).toContain('Generate docs and agent scaffolding');
      expect(output).toContain('"docs", "agents", or "both"');
      expect(output).toContain('[type]');
      expect(output).toContain('(default)');
      [
        '-o, --output <dir>',
        '--exclude <patterns...>',
        '--include <patterns...>',
        '-v, --verbose'
      ].forEach(option => expect(output).toContain(option));
    });
  });

  describe('fill command', () => {
    it('should display help for fill command', () => {
      const output = execSync(`node ${cliPath} fill --help`, { encoding: 'utf8' });
      expect(output).toContain('Use an LLM to fill generated docs and agent playbooks');
      [
        '-o, --output <dir>',
        '-k, --api-key <key>',
        '-m, --model <model>',
        '-p, --provider <provider>',
        '--base-url <url>',
        '--prompt <file>',
        '--limit <number>',
        '--exclude <patterns...>',
        '--include <patterns...>',
        '-v, --verbose'
      ].forEach(option => expect(output).toContain(option));
    });
  });

  describe('plan command', () => {
    it('should display help for plan command', () => {
      const output = execSync(`node ${cliPath} plan --help`, { encoding: 'utf8' });
      expect(output).toContain('Create a development plan that links documentation and agent playbooks');
      [
        '-o, --output <dir>',
        '--title <title>',
        '--summary <text>',
        '-f, --force',
        '--fill',
        '-r, --repo <path>',
        '-k, --api-key <key>',
        '-m, --model <model>',
        '-p, --provider <provider>',
        '--base-url <url>',
        '--prompt <file>',
        '--dry-run',
        '--include <patterns...>',
        '--exclude <patterns...>',
        '-v, --verbose'
      ].forEach(option => expect(output).toContain(option));
    });
  });
});
