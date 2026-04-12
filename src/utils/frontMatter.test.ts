import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  needsFill,
  parseFrontMatter,
  parseScaffoldFrontMatter,
  addFrontMatter,
  removeFrontMatter,
  hasFrontMatter,
  createUnfilledFrontMatter,
  getUnfilledFiles,
  getFilledStats
} from './frontMatter';

describe('frontMatter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frontmatter-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('needsFill', () => {
    it('should return true for files with status: unfilled', async () => {
      const filePath = path.join(tempDir, 'unfilled.md');
      await fs.writeFile(filePath, '---\nstatus: unfilled\n---\n\n# Content');

      expect(await needsFill(filePath)).toBe(true);
    });

    it('should return false for files without front matter', async () => {
      const filePath = path.join(tempDir, 'no-frontmatter.md');
      await fs.writeFile(filePath, '# Just content\n\nNo front matter here.');

      expect(await needsFill(filePath)).toBe(false);
    });

    it('should return false for filled files', async () => {
      const filePath = path.join(tempDir, 'filled.md');
      await fs.writeFile(filePath, '---\nstatus: filled\n---\n\n# Filled content');

      expect(await needsFill(filePath)).toBe(false);
    });

    it('should return false for files without status', async () => {
      const filePath = path.join(tempDir, 'no-status.md');
      await fs.writeFile(filePath, '---\ngenerated: 2026-01-09\n---\n\n# Content');

      expect(await needsFill(filePath)).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      expect(await needsFill('/nonexistent/file.md')).toBe(false);
    });
  });

  describe('parseFrontMatter', () => {
    it('should parse front matter correctly', () => {
      const content = '---\nstatus: unfilled\ngenerated: 2026-01-09\n---\n\n# Title';
      const { frontMatter, body } = parseFrontMatter(content);

      expect(frontMatter).toEqual({
        status: 'unfilled',
        generated: '2026-01-09'
      });
      expect(body).toBe('# Title');
    });

    it('should return null frontMatter for content without it', () => {
      const content = '# Just content\n\nNo front matter.';
      const { frontMatter, body } = parseFrontMatter(content);

      expect(frontMatter).toBeNull();
      expect(body).toBe(content);
    });

    it('should handle incomplete front matter', () => {
      const content = '---\nstatus: unfilled\n# Missing closing delimiter';
      const { frontMatter, body } = parseFrontMatter(content);

      expect(frontMatter).toBeNull();
      expect(body).toBe(content);
    });

    it('should handle empty content between delimiters', () => {
      const content = '---\n---\n\n# Content';
      const { frontMatter, body } = parseFrontMatter(content);

      expect(frontMatter).toEqual({});
      expect(body).toBe('# Content');
    });
  });

  describe('parseScaffoldFrontMatter', () => {
    it('should parse structured plan frontmatter with nested phases and steps', () => {
      const content = `---
type: plan
name: "Structured Delivery"
description: "Plan for structured delivery"
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "structured-delivery"
summary: "Ship structured metadata"
agents:
  - type: "planner"
    role: "Define scope"
docs:
  - "README.md"
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
    deliverables:
      - "discovery-note"
    steps:
      - order: 1
        description: "Gather requirements"
        assignee: "planner"
        deliverables:
          - "requirements-summary"
      - order: 2
        description: "Validate constraints"
        deliverables:
          - "constraint-matrix"
---

# Structured Delivery`;

      const { frontMatter, body } = parseScaffoldFrontMatter(content);

      expect(frontMatter).not.toBeNull();
      expect(frontMatter).toMatchObject({
        type: 'plan',
        planSlug: 'structured-delivery',
        summary: 'Ship structured metadata',
        agents: [{ type: 'planner', role: 'Define scope' }],
        docs: ['README.md'],
        planPhases: [
          {
            id: 'phase-1',
            name: 'Discovery & Alignment',
            prevc: 'P',
            deliverables: ['discovery-note'],
            steps: [
              {
                order: 1,
                description: 'Gather requirements',
                assignee: 'planner',
                deliverables: ['requirements-summary'],
              },
              {
                order: 2,
                description: 'Validate constraints',
                deliverables: ['constraint-matrix'],
              },
            ],
          },
        ],
      });
      expect(body).toBe('# Structured Delivery');
    });
  });

  describe('addFrontMatter', () => {
    it('should add front matter to content', () => {
      const content = '# Title\n\nContent here.';
      const result = addFrontMatter(content, { status: 'unfilled', generated: '2026-01-09' });

      // Function adds single newline after closing ---
      expect(result).toBe('---\nstatus: unfilled\ngenerated: 2026-01-09\n---\n# Title\n\nContent here.');
    });

    it('should skip undefined values', () => {
      const content = '# Title';
      const result = addFrontMatter(content, { status: 'unfilled', generated: undefined });

      expect(result).toBe('---\nstatus: unfilled\n---\n# Title');
    });
  });

  describe('removeFrontMatter', () => {
    it('should remove front matter from content', () => {
      const content = '---\nstatus: unfilled\n---\n\n# Title\n\nContent';
      const result = removeFrontMatter(content);

      expect(result).toBe('# Title\n\nContent');
    });

    it('should return original content if no front matter', () => {
      const content = '# Title\n\nContent';
      const result = removeFrontMatter(content);

      expect(result).toBe(content);
    });
  });

  describe('hasFrontMatter', () => {
    it('should return true for content with front matter', () => {
      expect(hasFrontMatter('---\nstatus: unfilled\n---\n\n# Content')).toBe(true);
    });

    it('should return false for content without front matter', () => {
      expect(hasFrontMatter('# Content')).toBe(false);
    });

    it('should handle leading whitespace', () => {
      expect(hasFrontMatter('  ---\nstatus: unfilled\n---')).toBe(true);
    });
  });

  describe('createUnfilledFrontMatter', () => {
    it('should create front matter with status unfilled', () => {
      const fm = createUnfilledFrontMatter();

      expect(fm.status).toBe('unfilled');
      expect(fm.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getUnfilledFiles', () => {
    it('should return only unfilled files', async () => {
      await fs.writeFile(path.join(tempDir, 'unfilled.md'), '---\nstatus: unfilled\n---\n\n# Unfilled');
      await fs.writeFile(path.join(tempDir, 'filled.md'), '# Filled\n\nNo front matter.');

      const unfilled = await getUnfilledFiles(tempDir);

      expect(unfilled).toHaveLength(1);
      expect(unfilled[0]).toContain('unfilled.md');
    });

    it('should handle nested directories', async () => {
      await fs.mkdir(path.join(tempDir, 'nested'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'nested', 'doc.md'), '---\nstatus: unfilled\n---\n\n# Doc');

      const unfilled = await getUnfilledFiles(tempDir);

      expect(unfilled).toHaveLength(1);
      expect(unfilled[0]).toContain('nested');
    });
  });

  describe('getFilledStats', () => {
    it('should return correct statistics', async () => {
      await fs.writeFile(path.join(tempDir, 'unfilled1.md'), '---\nstatus: unfilled\n---\n');
      await fs.writeFile(path.join(tempDir, 'unfilled2.md'), '---\nstatus: unfilled\n---\n');
      await fs.writeFile(path.join(tempDir, 'filled.md'), '# Filled content');

      const stats = await getFilledStats(tempDir);

      expect(stats.total).toBe(3);
      expect(stats.filled).toBe(1);
      expect(stats.unfilled).toBe(2);
      expect(stats.files).toHaveLength(3);
    });

    it('should handle empty directory', async () => {
      const stats = await getFilledStats(tempDir);

      expect(stats.total).toBe(0);
      expect(stats.filled).toBe(0);
      expect(stats.unfilled).toBe(0);
    });
  });
});
