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
      expect(output).toContain('Manage MCP integration, workflow, sync, and context imports');
      expect(output).toContain('Commands:');
      expect(output).toContain('mcp:install');
      expect(output).toContain('workflow');
      expect(output).toContain('skill');
      expect(output).not.toMatch(/\n\s+init\b/);
      expect(output).not.toMatch(/\n\s+plan\b/);
      expect(output).not.toMatch(/\n\s+start\b/);
      expect(output).not.toMatch(/\n\s+fill\b/);
      expect(output).not.toMatch(/\n\s+serve\b/);
    });

    it('should display version when --version flag is used', () => {
      const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' });
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should match version from package.json', () => {
      const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' }).trim();
      const packageJson = require('../package.json');
      expect(output).toBe(packageJson.version);
    });

    it('should render the splash preview command', () => {
      const output = execSync(
        `FORCE_COLOR=0 node ${cliPath} preview-splash --title "AI Coders CLI" --directory ${process.cwd()}`,
        { encoding: 'utf8' }
      );

      expect(output).toContain('AI Coders CLI');
      expect(output).toContain('directory:');
    });
  });

  describe('skill command', () => {
    it('should only expose supported utility subcommands', () => {
      const output = execSync(`node ${cliPath} skill --help`, { encoding: 'utf8' });
      expect(output).toContain('list');
      expect(output).toContain('export');
      expect(output).not.toMatch(/\n\s+init\b/);
      expect(output).not.toMatch(/\n\s+create\b/);
      expect(output).not.toMatch(/\n\s+fill\b/);
    });
  });
});
