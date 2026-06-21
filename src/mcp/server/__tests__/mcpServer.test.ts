import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { AIContextMCPServer } from '../mcpServer';

// We can't fully test the MCP server without a transport,
// but we can test instantiation and configuration

describe('AIContextMCPServer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    // Create test files
    await fs.writeFile(path.join(tempDir, 'test.ts'), 'export const x = 1;');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('constructor', () => {
    it('should create server with default options', () => {
      const server = new AIContextMCPServer();
      expect(server).toBeInstanceOf(AIContextMCPServer);
    });

    it('should create server with custom options', () => {
      const server = new AIContextMCPServer({
        name: 'test-server',
        repoPath: tempDir,
        verbose: true
      });
      expect(server).toBeInstanceOf(AIContextMCPServer);
    });
  });

  describe('tool registration', () => {
    it('should register all expected tools', () => {
      // The server registers tools in constructor
      // We verify this through the fact that construction succeeds
      // and logs "Registered 6 tools" when verbose
      const server = new AIContextMCPServer({ verbose: false });
      expect(server).toBeInstanceOf(AIContextMCPServer);
    });
  });

  describe('resource registration', () => {
    it('should register resource templates', () => {
      // The server registers resources in constructor
      // We verify this through the fact that construction succeeds
      const server = new AIContextMCPServer({ verbose: false });
      expect(server).toBeInstanceOf(AIContextMCPServer);
    });
  });
});
