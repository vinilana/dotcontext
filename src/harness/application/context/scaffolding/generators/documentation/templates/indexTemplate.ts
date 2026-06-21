import { buildDocumentMapTable, formatDirectoryList } from './common';
import { DocumentationTemplateContext } from './types';

export function renderIndex(context: DocumentationTemplateContext): string {

  const directoryList = formatDirectoryList(context, false);
  const documentMap = buildDocumentMapTable(context.guides);
  const navigationList = context.guides
    .map(guide => `- [${guide.title}](./${guide.file})`)
    .join('\n') || '- *No guides selected.*';

  return `# Documentation Index

Welcome to the repository knowledge base. Start with the project overview, then dive into specific guides as needed.

## Core Guides
${navigationList}

## Repository Snapshot
${directoryList || '*Top-level directories will appear here once the repository contains subfolders.*'}

## Document Map
${documentMap}
`;
}
