import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessDocsService } from '../HarnessDocsService';

describe('HarnessDocsService', () => {
  let tempDir: string;
  let service: HarnessDocsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-docs-'));
    service = new HarnessDocsService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns an empty list when .context/docs does not exist', async () => {
    expect(await service.list()).toEqual([]);
  });

  it('lists docs using v2 scaffold frontmatter, sorted by file name', async () => {
    const docsDir = path.join(tempDir, '.context', 'docs');
    await fs.ensureDir(docsDir);

    await fs.writeFile(
      path.join(docsDir, 'zeta.md'),
      [
        '---',
        'type: docs',
        'name: zeta',
        'description: Zeta doc',
        'category: reference',
        'status: filled',
        'generated: "2026-06-30"',
        'scaffoldVersion: "2.0.0"',
        '---',
        '',
        '# Zeta Doc',
        '',
        'Body content.',
        '',
      ].join('\n')
    );

    await fs.writeFile(
      path.join(docsDir, 'alpha.md'),
      [
        '---',
        'type: docs',
        'name: alpha',
        'status: unfilled',
        'generated: "2026-06-30"',
        'scaffoldVersion: "2.0.0"',
        '---',
        '',
        '# Alpha Doc',
        '',
      ].join('\n')
    );

    const docs = await service.list();

    expect(docs.map((doc) => doc.name)).toEqual(['alpha', 'zeta']);
    expect(docs[0]).toMatchObject({ name: 'alpha', title: 'Alpha Doc', status: 'unfilled' });
    expect(docs[1]).toMatchObject({
      name: 'zeta',
      title: 'Zeta Doc',
      description: 'Zeta doc',
      category: 'reference',
      status: 'filled',
    });
  });

  it('falls back to a humanized file name when no title/frontmatter name is present', async () => {
    const docsDir = path.join(tempDir, '.context', 'docs');
    await fs.ensureDir(docsDir);
    await fs.writeFile(path.join(docsDir, 'getting-started.md'), 'No frontmatter, no heading.');

    const docs = await service.list();

    expect(docs).toEqual([
      expect.objectContaining({ name: 'getting-started', title: 'Getting Started', status: 'filled' }),
    ]);
  });

  it('getContent returns parsed frontmatter and body with the frontmatter block stripped', async () => {
    const docsDir = path.join(tempDir, '.context', 'docs');
    await fs.ensureDir(docsDir);
    await fs.writeFile(
      path.join(docsDir, 'tooling.md'),
      ['---', 'type: docs', 'name: tooling', 'status: filled', 'generated: "2026-06-30"', 'scaffoldVersion: "2.0.0"', '---', '', '# Tooling', '', 'Details here.', ''].join('\n')
    );

    const doc = await service.getContent('tooling');

    expect(doc.name).toBe('tooling');
    expect(doc.frontMatter).toMatchObject({ name: 'tooling', status: 'filled' });
    expect(doc.content).toContain('# Tooling');
    expect(doc.content).not.toContain('scaffoldVersion');
  });

  it('getContent throws for a missing doc', async () => {
    await expect(service.getContent('missing')).rejects.toThrow('Doc not found: missing');
  });

  it('getContent rejects path traversal attempts via PathValidator', async () => {
    await expect(service.getContent('../../etc/passwd')).rejects.toThrow();
  });
});
