export function withFrontMatter(frontMatter: Record<string, unknown> | undefined, content: string): string {
  if (!frontMatter || Object.keys(frontMatter).length === 0) {
    return content;
  }

  const lines = Object.entries(frontMatter).map(([key, value]) => `${key}: ${toYamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${content}`;
}

function toYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (typeof value === 'string') {
    return /[:#{}[\],&*!|>'"%@`]/.test(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value);
}
