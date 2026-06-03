export function formatDirectoryList(directories: string[], placeholderMessage?: string): string {
  if (!directories.length) {
    return placeholderMessage ?? '';
  }

  return directories
    .map(dir => `- \`${dir}/\` — TODO: Describe the purpose of this directory.`)
    .join('\n');
}
