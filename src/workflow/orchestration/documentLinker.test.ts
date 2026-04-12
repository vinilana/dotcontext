import * as fs from 'fs';
import * as path from 'path';
import { DOCUMENT_GUIDES, documentLinker } from './documentLinker';

describe('DocumentLinker', () => {
  it('maps every registered guide to a real repository file', () => {
    for (const guide of DOCUMENT_GUIDES) {
      const resolvedPath = path.join(process.cwd(), guide.path);
      expect(fs.existsSync(resolvedPath)).toBe(true);
    }
  });

  it('returns concrete docs for built-in agents without dead entries', () => {
    const docs = documentLinker.getDocsForAgent('feature-developer');

    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.path).toMatch(/^\.context\/docs\//);
      expect(doc.title.length).toBeGreaterThan(0);
    }
  });
});
